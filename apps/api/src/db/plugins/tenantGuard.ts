/**
 * Mongoose tenant guard — defence layer 3.
 *
 * Applied to every schema that owns tenant data. It refuses any query whose
 * filter does not constrain `restaurantId`, and refuses to save a document
 * without one.
 *
 * Layer 2 (`tenantRepo`) is what modules are supposed to use. This layer exists
 * for the day somebody calls `Model.find()` directly by habit or by mistake:
 * without it that mistake is a silent cross-tenant data leak, and with it the
 * mistake is a loud error the first time it runs.
 *
 * The escape hatch is `.setOptions({ unscoped: true })`, used only by audited
 * platform-admin code. It is deliberately ugly and easy to grep for.
 */

import type { Schema, Query } from 'mongoose'

export class TenantScopeError extends Error {
  override readonly name = 'TenantScopeError'
  constructor(operation: string, modelName: string) {
    super(
      `Tenant scope missing: ${modelName}.${operation}() was called without a restaurantId ` +
        `filter. Use tenantRepo(${modelName}) instead of calling the model directly, or ` +
        `.setOptions({ unscoped: true }) if this is deliberate platform-admin access.`,
    )
  }
}

const GUARDED_QUERY_HOOKS = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
  'countDocuments',
  'distinct',
  'updateOne',
  'updateMany',
  'deleteOne',
  'deleteMany',
  'replaceOne',
] as const

export function tenantGuardPlugin(schema: Schema): void {
  for (const hook of GUARDED_QUERY_HOOKS) {
    schema.pre(hook, function (this: Query<unknown, unknown>) {
      if (this.getOptions()?.unscoped === true) return

      const filter = this.getFilter()
      if (filter?.restaurantId === undefined || filter.restaurantId === null) {
        throw new TenantScopeError(hook, this.model.modelName)
      }
    })
  }

  // Aggregation pipelines cannot be checked generically — a $match may appear at
  // any stage. Tenant-scoped aggregations must go through tenantRepo.aggregate(),
  // which prepends the $match itself.
  schema.pre('aggregate', function () {
    const options = this.options as { unscoped?: boolean } | undefined
    if (options?.unscoped === true) return

    const firstStage = this.pipeline()[0] as Record<string, unknown> | undefined
    const match = firstStage?.$match as Record<string, unknown> | undefined
    if (!match || match.restaurantId === undefined) {
      throw new TenantScopeError('aggregate', this.model().modelName)
    }
  })

  // Hooked on `validate` as well as `save` because Mongoose runs validation
  // first: a `required: true` on restaurantId would otherwise raise a generic
  // ValidationError and the guard would never speak. The specific message
  // matters — it tells the developer to use tenantRepo.
  const guardDocument = function (this: {
    restaurantId?: unknown
    constructor: { modelName: string }
  }): void {
    if (this.restaurantId === undefined || this.restaurantId === null) {
      throw new TenantScopeError('save', this.constructor.modelName)
    }
  }
  schema.pre('validate', guardDocument)
  schema.pre('save', guardDocument)

  schema.pre('insertMany', function (_next, docs: Array<{ restaurantId?: unknown }>) {
    for (const doc of docs) {
      if (doc?.restaurantId === undefined || doc?.restaurantId === null) {
        throw new TenantScopeError('insertMany', this.modelName)
      }
    }
  })
}
