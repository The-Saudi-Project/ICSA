/**
 * Table management (restaurant side) and the table-token exchange (customer side).
 *
 * The exchange is the security heart of the product. Read `exchangeTableToken`
 * together with `middleware/tableSession.ts` to see the full guarantee:
 * a customer's phone proves which table it is at exactly once, and every later
 * request carries a scoped session instead of a table identifier.
 */

import { RestaurantStatus } from '@rw/shared'
import QRCode from 'qrcode'
import { env } from '../../config/env.js'
import { hashIp, writeAudit } from '../../core/audit.js'
import { decryptSecret, encryptSecret, generateToken, sha256 } from '../../core/crypto.js'
import { conflict, notFound } from '../../core/errors.js'
import { signTableSessionToken } from '../../core/tableSessionToken.js'
import { tenantRepo } from '../../core/tenant.js'
import { AuditAction } from '../audit/auditLog.model.js'
import { RestaurantModel } from '../restaurants/restaurant.model.js'
import { TableModel, TableStatus, type TableDoc } from './table.model.js'
import { TableSessionModel, TableSessionStatus } from './tableSession.model.js'

/**
 * The single message every table-token failure returns.
 *
 * Unknown token, inactive table, suspended restaurant, malformed token and
 * expired session must be indistinguishable. Any difference — in status code,
 * message, or shape — turns the endpoint into an oracle that tells an attacker
 * which tokens exist.
 */
const TABLE_NOT_FOUND = 'Table not found'

/* ── restaurant side ──────────────────────────────────────────────────────── */

function newTokenFields() {
  const token = generateToken() // 32 bytes -> 43 url-safe characters
  return {
    token,
    tokenHash: sha256(token),
    tokenCipher: encryptSecret(token),
    tokenRotatedAt: new Date(),
  }
}

export function tableUrl(token: string): string {
  return `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/t/${token}`
}

export interface TableView {
  id: string
  label: string
  zone?: string | null
  seats?: number | null
  status: string
  tokenVersion: number
  tokenRotatedAt: Date
  /** Present only when the stored token can still be decrypted. */
  url: string | null
  assignedWaiterId: string | null
}

function toView(table: TableDoc): TableView {
  const token = decryptSecret(table.tokenCipher)
  return {
    id: table._id.toString(),
    label: table.label,
    zone: table.zone,
    seats: table.seats,
    status: table.status,
    tokenVersion: table.tokenVersion,
    tokenRotatedAt: table.tokenRotatedAt,
    // null means the key changed or the row is corrupt. The UI shows
    // "QR unavailable - rotate this table's token" rather than failing.
    url: token ? tableUrl(token) : null,
    assignedWaiterId: table.assignedWaiterId ? table.assignedWaiterId.toString() : null,
  }
}

export async function listTables(): Promise<TableView[]> {
  const tables = await tenantRepo(TableModel).find({}, { sort: { label: 1 } })
  return tables.map(toView)
}

/** What an order-taking screen needs to know about a table, and nothing else. */
export interface TablePickerView {
  id: string
  label: string
  zone?: string | null
  seats?: number | null
  assignedWaiterId: string | null
}

/**
 * The tables a waiter may send an order to.
 *
 * Deliberately **not** `TableView`. That view carries `url`, and the URL *is*
 * the table credential — anyone holding it can open a customer session on that
 * table from any phone. A waiter needs to know which tables exist, not how to
 * become one, so this projection never decrypts the token and never returns it.
 * That is what makes it safe to grant a role that `GET /app/tables` refuses.
 *
 * Inactive tables are left out: the restaurant has taken them out of service, so
 * they must not be orderable.
 */
export async function listSelectableTables(): Promise<TablePickerView[]> {
  const tables = await tenantRepo(TableModel).find(
    { status: TableStatus.ACTIVE },
    { sort: { label: 1 }, select: 'label zone seats assignedWaiterId' },
  )

  return tables.map((table) => ({
    id: table._id.toString(),
    label: table.label,
    zone: table.zone,
    seats: table.seats,
    assignedWaiterId: table.assignedWaiterId ? table.assignedWaiterId.toString() : null,
  }))
}

export async function createTable(input: {
  label: string
  zone?: string
  seats?: number
}): Promise<TableView> {
  const repo = tenantRepo(TableModel)

  if (await repo.exists({ label: input.label })) {
    throw conflict('A table with that label already exists')
  }

  const { token, tokenHash, tokenCipher } = newTokenFields()

  const table = await repo.create({
    label: input.label,
    zone: input.zone,
    seats: input.seats,
    tokenHash,
    tokenCipher,
  })

  await writeAudit({
    action: AuditAction.TABLE_CREATED,
    targetType: 'Table',
    targetId: table._id.toString(),
    metadata: { label: table.label },
  })

  return { ...toView(table), url: tableUrl(token) }
}

export async function updateTable(
  id: string,
  input: { label?: string; zone?: string; seats?: number; status?: string; assignedWaiterId?: string | null },
): Promise<TableView> {
  const repo = tenantRepo(TableModel)

  const existing = await repo.findById(id)
  if (!existing) throw notFound('Table not found')

  if (input.label && input.label !== existing.label) {
    if (await repo.exists({ label: input.label })) {
      throw conflict('A table with that label already exists')
    }
  }

  const updated = await repo.findByIdAndUpdate(id, { $set: input })
  if (!updated) throw notFound('Table not found')

  await writeAudit({
    action: AuditAction.TABLE_UPDATED,
    targetType: 'Table',
    targetId: id,
    metadata: { changes: input },
  })

  return toView(updated)
}

/**
 * Issues a new token and kills the old URL immediately.
 *
 * Used when a card is stolen or a tag is thrown away. Any active session on the
 * old token is closed, so a customer holding a photographed QR loses access at
 * once rather than at the end of their session window.
 */
export async function rotateTableToken(id: string): Promise<TableView> {
  const repo = tenantRepo(TableModel)

  const existing = await repo.findById(id)
  if (!existing) throw notFound('Table not found')

  const { token, tokenHash, tokenCipher, tokenRotatedAt } = newTokenFields()

  const updated = await repo.findByIdAndUpdate(id, {
    $set: { tokenHash, tokenCipher, tokenRotatedAt },
    $inc: { tokenVersion: 1 },
  })
  if (!updated) throw notFound('Table not found')

  await TableSessionModel.updateMany(
    { tableId: existing._id, status: TableSessionStatus.ACTIVE },
    { $set: { status: TableSessionStatus.CLOSED } },
  )

  await writeAudit({
    action: AuditAction.TABLE_TOKEN_ROTATED,
    targetType: 'Table',
    targetId: id,
    metadata: { label: existing.label, newVersion: updated.tokenVersion },
  })

  return { ...toView(updated), url: tableUrl(token) }
}

/**
 * Permanently removes a table and closes every active session on it.
 *
 * Unlike staff members (which are disabled rather than deleted so the audit
 * trail keeps pointing at a real account), a table carries no order history
 * of its own — orders record a label snapshot, not a foreign key — so a hard
 * delete is safe.
 */
export async function deleteTable(id: string): Promise<void> {
  const repo = tenantRepo(TableModel)

  const existing = await repo.findById(id)
  if (!existing) throw notFound('Table not found')

  // Close any live sessions so customers at this table are signed out
  // immediately rather than at their next refresh.
  await TableSessionModel.updateMany(
    { tableId: existing._id, status: TableSessionStatus.ACTIVE },
    { $set: { status: TableSessionStatus.CLOSED } },
  )

  await repo.deleteById(id)

  await writeAudit({
    action: AuditAction.TABLE_DELETED,
    targetType: 'Table',
    targetId: id,
    metadata: { label: existing.label },
  })
}

export async function tableQrCode(
  id: string,
  format: 'png' | 'svg',
): Promise<{ body: Buffer | string; contentType: string }> {
  const table = await tenantRepo(TableModel).findById(id)
  if (!table) throw notFound('Table not found')

  const token = decryptSecret(table.tokenCipher)
  if (!token) {
    throw conflict(
      'This table’s token cannot be decrypted with the current key. Rotate the token to issue a new QR code.',
    )
  }

  const url = tableUrl(token)

  // Error-correction level M tolerates ~15% damage — the right trade for a
  // laminated card that will be handled, spilled on and scuffed.
  if (format === 'svg') {
    return {
      body: await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 }),
      contentType: 'image/svg+xml',
    }
  }

  return {
    body: await QRCode.toBuffer(url, { errorCorrectionLevel: 'M', margin: 2, width: 512 }),
    contentType: 'image/png',
  }
}

/**
 * Renders one CSV cell: quotes/escapes for structure, and prefixes a leading
 * `= + - @` (or a whitespace char some spreadsheets strip to expose one) with a
 * single quote so a crafted table label cannot execute as a formula in Excel or
 * Sheets.
 */
function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${guarded.replace(/"/g, '""')}"`
}

/** CSV of every table URL, for writing to NFC chips in one sitting. */
export async function exportTableUrls(): Promise<string> {
  const tables = await tenantRepo(TableModel).find({}, { sort: { label: 1 } })

  const rows = tables.map((t) => {
    const token = decryptSecret(t.tokenCipher)
    // Quote and escape (so `Table "A", window` keeps its column structure), and
    // neutralise spreadsheet formula injection via csvCell.
    const label = csvCell(t.label)
    const zone = csvCell(t.zone ?? '')
    return [label, zone, t.status, t.tokenVersion, token ? tableUrl(token) : 'UNAVAILABLE'].join(
      ',',
    )
  })

  return ['label,zone,status,tokenVersion,url', ...rows].join('\r\n')
}

/* ── customer side ────────────────────────────────────────────────────────── */

export interface TableSessionResult {
  sessionToken: string
  expiresInSeconds: number
  restaurant: {
    publicId: string
    name: unknown
    settings: { currency: string; vatRatePercent: number; pricesIncludeVat: boolean }
  }
  table: { label: string }
}

/**
 * Exchanges a table token for a scoped, short-lived session.
 *
 * This runs once per visit. Everything afterwards uses the session token, and
 * `restaurantId` / `tableId` are read from it server-side — which is why an
 * order request has no table field to tamper with.
 */
export async function exchangeTableToken(
  rawToken: string,
  fingerprint: { ip?: string; userAgent?: string },
): Promise<TableSessionResult> {
  // Every failure below throws the identical error. Do not be tempted to make
  // these messages more helpful.
  //
  // The audit write is awaited, not fired and forgotten. Rejected tokens are
  // exactly the signal that shows someone probing tags, and an event that may
  // or may not have been written is not a signal. Awaiting also keeps every
  // failure path doing the same amount of work, which helps keep their timing
  // similar.
  const fail = async (reason: string): Promise<never> => {
    await writeAudit({
      action: AuditAction.TABLE_TOKEN_REJECTED,
      actorType: 'CUSTOMER',
      metadata: { reason },
      ip: fingerprint.ip,
      restaurantId: null,
    })
    throw notFound(TABLE_NOT_FOUND)
  }

  // Unscoped by necessity: the tenant is unknown until the token resolves.
  // This is the one lookup that establishes tenancy for a customer.
  const table = await TableModel.findOne({ tokenHash: sha256(rawToken) }).setOptions({
    unscoped: true,
  })

  // `return fail(...)` rather than `await fail(...)`: the returned promise
  // rejects only after the audit write completes, and `return` lets TypeScript
  // narrow the value below without non-null assertions.
  if (!table) return fail('unknown-token')
  if (table.status !== TableStatus.ACTIVE) return fail('table-inactive')

  const restaurant = await RestaurantModel.findById(table.restaurantId)
  if (!restaurant) return fail('restaurant-missing')
  if (restaurant.status !== RestaurantStatus.ACTIVE) return fail('restaurant-suspended')

  const ttlMinutes = restaurant.settings?.tableSessionTtlMinutes ?? 180

  const session = await TableSessionModel.create({
    restaurantId: restaurant._id,
    tableId: table._id,
    expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
    ipHash: hashIp(fingerprint.ip),
    userAgent: fingerprint.userAgent?.slice(0, 300),
  })

  const sessionToken = await signTableSessionToken({
    sid: session._id.toString(),
    rid: restaurant._id.toString(),
    tid: table._id.toString(),
  })

  await writeAudit({
    action: AuditAction.TABLE_SESSION_STARTED,
    actorType: 'CUSTOMER',
    targetType: 'Table',
    targetId: table._id.toString(),
    restaurantId: restaurant._id.toString(),
    metadata: { tableLabel: table.label, sessionPublicId: session.publicId },
    ip: fingerprint.ip,
  })

  return {
    sessionToken,
    expiresInSeconds: env.TABLE_SESSION_TOKEN_TTL_MINUTES * 60,
    restaurant: {
      publicId: restaurant.publicId,
      name: restaurant.name,
      settings: {
        currency: restaurant.settings.currency,
        vatRatePercent: restaurant.settings.vatRatePercent,
        pricesIncludeVat: restaurant.settings.pricesIncludeVat,
      },
    },
    table: { label: table.label },
  }
}

/**
 * Slides the session window and mints a fresh short-lived token.
 *
 * The session token lives 15 minutes; the visit may last hours. The phone
 * refreshes quietly in the background, and the hard `expiresAt` still caps the
 * whole visit — so a photographed QR does not grant indefinite access.
 */
export async function refreshTableSession(sessionId: string): Promise<TableSessionResult> {
  const session = await TableSessionModel.findById(sessionId)
  if (!session || session.status !== TableSessionStatus.ACTIVE) throw notFound(TABLE_NOT_FOUND)
  if (session.expiresAt <= new Date()) throw notFound(TABLE_NOT_FOUND)

  const [table, restaurant] = await Promise.all([
    TableModel.findOne({ _id: session.tableId }).setOptions({ unscoped: true }),
    RestaurantModel.findById(session.restaurantId),
  ])

  if (!table || table.status !== TableStatus.ACTIVE) throw notFound(TABLE_NOT_FOUND)
  if (!restaurant || restaurant.status !== RestaurantStatus.ACTIVE) throw notFound(TABLE_NOT_FOUND)

  session.lastSeenAt = new Date()
  await session.save()

  const sessionToken = await signTableSessionToken({
    sid: session._id.toString(),
    rid: restaurant._id.toString(),
    tid: table._id.toString(),
  })

  return {
    sessionToken,
    expiresInSeconds: env.TABLE_SESSION_TOKEN_TTL_MINUTES * 60,
    restaurant: {
      publicId: restaurant.publicId,
      name: restaurant.name,
      settings: {
        currency: restaurant.settings.currency,
        vatRatePercent: restaurant.settings.vatRatePercent,
        pricesIncludeVat: restaurant.settings.pricesIncludeVat,
      },
    },
    table: { label: table.label },
  }
}
