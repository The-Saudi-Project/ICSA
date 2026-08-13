/**
 * Per-request context, carried implicitly through the call stack with
 * AsyncLocalStorage.
 *
 * This is the foundation of tenant isolation. From Phase 1 Step 2 onward, the
 * tenant (`restaurantId`) lives here — read from a verified token by the auth
 * middleware — and the data layer reads it from here. A route handler therefore
 * cannot supply a tenant, because it never has the opportunity to.
 *
 * The alternative (threading `restaurantId` through every function signature)
 * fails the moment someone forgets a parameter, and forgetting is silent.
 */

import { AsyncLocalStorage } from 'node:async_hooks'

export interface RequestContext {
  /** Correlation ID echoed in every log line and in the `x-request-id` header. */
  requestId: string
  startedAt: number

  // Populated from Phase 1 Step 2 onward.
  actorUserId?: string
  actorRole?: string
  /** The tenant. NEVER assign this from a request body or query string. */
  restaurantId?: string
  /** Set for customer requests authenticated by a table session. */
  tableSessionId?: string
  tableId?: string
}

const storage = new AsyncLocalStorage<RequestContext>()

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn)
}

/** Returns undefined outside a request (background jobs, boot). */
export function getContext(): RequestContext | undefined {
  return storage.getStore()
}

/** Use where a context is genuinely required; throws rather than defaulting. */
export function requireContext(): RequestContext {
  const context = storage.getStore()
  if (!context) {
    throw new Error('No request context available — called outside a request scope')
  }
  return context
}

/**
 * The current tenant, or undefined.
 * Step 2 adds `requireTenantId()`, which throws — that is what the data layer uses.
 */
export function getRestaurantId(): string | undefined {
  return storage.getStore()?.restaurantId
}
