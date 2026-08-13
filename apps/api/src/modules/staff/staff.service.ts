/**
 * Staff management, restaurant side.
 *
 * The privilege rules here are the point of the module, not an afterthought:
 *
 *  - Nobody can create a PLATFORM_ADMIN. That role belongs to us and has no
 *    tenant; letting a restaurant mint one would hand over the whole platform.
 *  - A MANAGER cannot create or modify an OWNER or another MANAGER. Otherwise
 *    the lowest privileged person who can manage staff could promote themselves.
 *  - Nobody can change their own role or disable themselves. Both are either a
 *    mistake or an escalation attempt, and the first one locks a restaurant out
 *    of its own account.
 *
 * Every account is provisioned with a system-generated one-time password and
 * `mustChangePassword`. We never choose, see, or store a person's real password.
 */

import { Role, UserStatus } from '@rw/shared'
import { writeAudit } from '../../core/audit.js'
import { getContext } from '../../core/context.js'
import { generateToken, hashPassword } from '../../core/crypto.js'
import { badRequest, conflict, forbidden, notFound } from '../../core/errors.js'
import { tenantRepo } from '../../core/tenant.js'
import { AuditAction } from '../audit/auditLog.model.js'
import { revokeAllSessions } from '../auth/auth.service.js'
import { toPublicUser, UserModel, type PublicUser } from '../users/user.model.js'

/** Roles a restaurant may hand out at all. PLATFORM_ADMIN is absent on purpose. */
const ASSIGNABLE_ROLES: readonly string[] = [
  Role.OWNER,
  Role.MANAGER,
  Role.CASHIER,
  Role.KITCHEN,
  Role.WAITER,
]

/** Roles only an OWNER may create or touch. */
const SENIOR_ROLES: readonly string[] = [Role.OWNER, Role.MANAGER]

function assertMayAssign(targetRole: string): void {
  if (!ASSIGNABLE_ROLES.includes(targetRole)) {
    throw forbidden('That role cannot be assigned')
  }

  const actorRole = getContext()?.actorRole
  if (SENIOR_ROLES.includes(targetRole) && actorRole !== Role.OWNER) {
    throw forbidden('Only the owner can manage owners and managers')
  }
}

function assertNotSelf(targetId: string, message: string): void {
  if (getContext()?.actorUserId === targetId) throw badRequest(message)
}

export async function listStaff(): Promise<PublicUser[]> {
  const staff = await tenantRepo(UserModel).find({}, { sort: { createdAt: 1 } })
  return staff.map(toPublicUser)
}

export interface CreatedStaff {
  user: PublicUser
  /** Shown once, then never retrievable. */
  temporaryPassword: string
}

export async function createStaff(input: {
  email: string
  name: string
  role: string
  phone?: string
}): Promise<CreatedStaff> {
  assertMayAssign(input.role)

  // Email is globally unique, so this check has to look past the tenant. It
  // reveals only that an address is taken, which the unique index would anyway.
  const taken = await UserModel.findOne({ email: input.email.toLowerCase() })
  if (taken) throw conflict('That email already has an account')

  const temporaryPassword = generateToken(18)

  const user = await tenantRepo(UserModel).create({
    email: input.email,
    name: input.name,
    role: input.role,
    phone: input.phone,
    passwordHash: await hashPassword(temporaryPassword),
    mustChangePassword: true,
  })

  await writeAudit({
    action: AuditAction.STAFF_CREATED,
    targetType: 'User',
    targetId: user._id.toString(),
    metadata: { role: input.role, email: user.email },
  })

  return { user: toPublicUser(user), temporaryPassword }
}

export async function updateStaff(
  id: string,
  input: { name?: string; role?: string; status?: string; phone?: string },
): Promise<PublicUser> {
  const repo = tenantRepo(UserModel)
  const existing = await repo.findById(id)
  if (!existing) throw notFound('Staff member not found')

  // Guarding the *current* role as well as the new one stops a manager
  // demoting an owner in order to take over.
  assertMayAssign(existing.role)
  if (input.role) assertMayAssign(input.role)

  if (input.role && input.role !== existing.role) {
    assertNotSelf(id, 'You cannot change your own role')
  }
  if (input.status === UserStatus.DISABLED) {
    assertNotSelf(id, 'You cannot disable your own account')
  }

  const updated = await repo.findByIdAndUpdate(id, { $set: input })
  if (!updated) throw notFound('Staff member not found')

  if (input.role && input.role !== existing.role) {
    await writeAudit({
      action: AuditAction.STAFF_ROLE_CHANGED,
      targetType: 'User',
      targetId: id,
      metadata: { from: existing.role, to: input.role, email: existing.email },
    })
  }

  // Disabling must take effect now, not in fifteen minutes when the access
  // token happens to expire.
  if (input.status === UserStatus.DISABLED && existing.status !== UserStatus.DISABLED) {
    await revokeAllSessions(id, 'staff-disabled')
    await writeAudit({
      action: AuditAction.STAFF_DISABLED,
      targetType: 'User',
      targetId: id,
      metadata: { email: existing.email },
    })
  }

  return toPublicUser(updated)
}

/**
 * Issues a new one-time password for someone who has forgotten theirs, and
 * ends every session they had. There is no way to read an existing password,
 * because we do not have one.
 */
export async function resetStaffPassword(id: string): Promise<CreatedStaff> {
  const repo = tenantRepo(UserModel)
  const existing = await repo.findById(id)
  if (!existing) throw notFound('Staff member not found')

  assertMayAssign(existing.role)

  const temporaryPassword = generateToken(18)

  await repo.findByIdAndUpdate(id, {
    $set: { passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true },
  })
  await revokeAllSessions(id, 'password-reset')

  await writeAudit({
    action: AuditAction.STAFF_PASSWORD_RESET,
    targetType: 'User',
    targetId: id,
    metadata: { email: existing.email },
  })

  const reloaded = await repo.findById(id)
  return { user: toPublicUser(reloaded!), temporaryPassword }
}
