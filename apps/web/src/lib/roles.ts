/**
 * Where each role lands, and which surfaces they may reach.
 *
 * Kept in one small module rather than in App.tsx so the login screen and the
 * route guards cannot disagree about it, and so importing it never creates a
 * cycle back through the router.
 *
 * This is convenience and clarity, not security. The server enforces every one
 * of these boundaries independently.
 */

export const Surface = {
  DASHBOARD: '/dashboard',
  KITCHEN: '/kitchen',
  TILL: '/cashier',
  WAITER: '/waiter',
  ADMIN: '/admin',
  PLATFORM: '/platform',
} as const

/** The screen someone should see when they sign in. */
export function homeForRole(role: string): string {
  switch (role) {
    case 'OWNER':
    case 'MANAGER':
      return Surface.DASHBOARD
    case 'KITCHEN':
      return Surface.KITCHEN
    case 'WAITER':
      return Surface.WAITER
    case 'PLATFORM_ADMIN':
      return Surface.PLATFORM
    default:
      return Surface.TILL
  }
}

export const canUseAdmin = (role?: string): boolean => role === 'OWNER' || role === 'MANAGER'

export const canUseTill = (role?: string): boolean =>
  role === 'CASHIER' || role === 'MANAGER' || role === 'OWNER'

export const canUseWaiter = (role?: string): boolean =>
  role === 'WAITER' || role === 'MANAGER' || role === 'OWNER'

/** Mirrors the roles the order state machine lets act on kitchen transitions. */
export const canUseKitchen = (role?: string): boolean =>
  role === 'KITCHEN' || role === 'MANAGER' || role === 'OWNER'

export const isPlatformAdmin = (role?: string): boolean => role === 'PLATFORM_ADMIN'

/**
 * Which predicate governs a path.
 *
 * One table, consulted by both the route guards and the sidebar, so a link can
 * never appear for a surface the guard would refuse — the disagreement this
 * module exists to prevent. Longest prefix wins, so `/admin/menu` matches
 * `/admin`.
 */
const SURFACE_RULES: readonly { prefix: string; allow: (role?: string) => boolean }[] = [
  { prefix: Surface.PLATFORM, allow: isPlatformAdmin },
  { prefix: Surface.ADMIN, allow: canUseAdmin },
  { prefix: Surface.DASHBOARD, allow: canUseAdmin },
  { prefix: Surface.KITCHEN, allow: canUseKitchen },
  { prefix: Surface.TILL, allow: canUseTill },
  { prefix: Surface.WAITER, allow: canUseWaiter },
]

export function mayVisit(role: string | undefined, pathname: string): boolean {
  const rule = SURFACE_RULES.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`))
  // A path with no rule is not a role-gated surface (e.g. /staff/password).
  return rule ? rule.allow(role) : true
}
