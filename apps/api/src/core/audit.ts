/**
 * Audit event writer.
 *
 * Every security- or money-relevant action writes one of these. Actor, tenant,
 * and request ID are taken from the request context rather than passed in, so a
 * call site cannot accidentally attribute an action to the wrong person.
 *
 * Writing an audit event must never break the request that triggered it: a
 * failed insert is logged loudly and swallowed. The alternative — a cashier's
 * cash confirmation failing because the audit collection hiccuped — is worse.
 */

import { createHash } from 'node:crypto'
import { env } from '../config/env.js'
import { getContext } from './context.js'
import { logger } from './logger.js'
import { AuditLogModel, type AuditAction } from '../modules/audit/auditLog.model.js'

export interface AuditEventInput {
  action: AuditAction | string
  targetType?: string
  targetId?: string
  metadata?: Record<string, unknown>
  actorType?: 'USER' | 'CUSTOMER' | 'SYSTEM'
  /** Overrides the context tenant. Used by platform routes acting on a tenant. */
  restaurantId?: string | null
  ip?: string
}

/**
 * Salted SHA-256 of an IP address.
 *
 * Raw IPs are personal data under Saudi PDPL and most privacy regimes. A salted
 * hash still lets us group events from one source and spot abuse, without
 * storing the address itself. Unsalted would be trivially reversible — the
 * entire IPv4 space can be hashed in seconds.
 */
export function hashIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined
  if (!env.IP_HASH_SALT) return undefined // no salt configured: store nothing rather than something weak
  return createHash('sha256').update(`${env.IP_HASH_SALT}:${ip}`).digest('hex')
}

export async function writeAudit(input: AuditEventInput): Promise<void> {
  const context = getContext()

  try {
    await AuditLogModel.create({
      restaurantId: input.restaurantId !== undefined ? input.restaurantId : (context?.restaurantId ?? null),
      actorUserId: context?.actorUserId ?? null,
      actorRole: context?.actorRole ?? null,
      actorType: input.actorType ?? (context?.actorUserId ? 'USER' : 'SYSTEM'),
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata ?? {},
      requestId: context?.requestId,
      ipHash: hashIp(input.ip),
      at: new Date(),
    })
  } catch (err) {
    logger.error({ err, action: input.action }, 'failed to write audit event')
  }
}
