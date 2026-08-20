/**
 * Tenant-scoped data access — defence layer 2.
 *
 * Modules never call `Model.find()`. They call `tenantRepo(Model)`, which reads
 * the tenant from the request context and stamps it onto every filter and every
 * new document.
 *
 * Two properties matter most:
 *
 *  1. `findById(id)` becomes `findOne({ _id: id, restaurantId })`. Another
 *     tenant's document therefore returns `null`, which callers turn into a 404.
 *     A 403 would confirm that the record exists; a 404 reveals nothing.
 *
 *  2. The tenant is applied *after* the caller's filter and *after* the caller's
 *     document fields, so a `restaurantId` supplied by a client is overwritten,
 *     never honoured.
 *
 * Every method returns a resolved promise rather than a chainable Query. That is
 * partly to keep the public type nameable for declaration emit, and partly
 * because a chainable query can have `.where()` bolted on somewhere far from
 * here — which is exactly the kind of drift this layer exists to prevent.
 * Sorting, limiting and projection go through `FindOptions`.
 */

import {
  Types,
  type FilterQuery,
  type HydratedDocument,
  type Model,
  type PipelineStage,
} from 'mongoose'
import { getContext } from './context.js'
import { AppError } from './errors.js'

export class MissingTenantError extends AppError {
  constructor() {
    super(500, 'INTERNAL', 'Tenant context is required but was not set', {
      isOperational: false,
    })
  }
}

/** The current tenant. Throws rather than falling back to anything. */
export function requireTenantId(): string {
  const restaurantId = getContext()?.restaurantId
  if (!restaurantId) throw new MissingTenantError()
  return restaurantId
}

export interface FindOptions {
  sort?: Record<string, 1 | -1>
  limit?: number
  skip?: number
  /** Space-separated field list, e.g. 'name price'. */
  select?: string
}

export interface DeleteResult {
  deletedCount: number
}

export interface UpdateResult {
  matchedCount: number
  modifiedCount: number
}

export interface TenantRepo<TDoc> {
  readonly restaurantId: string
  find(filter?: FilterQuery<TDoc>, options?: FindOptions): Promise<HydratedDocument<TDoc>[]>
  findOne(filter?: FilterQuery<TDoc>, options?: FindOptions): Promise<HydratedDocument<TDoc> | null>
  findById(id: unknown, options?: FindOptions): Promise<HydratedDocument<TDoc> | null>
  exists(filter?: FilterQuery<TDoc>): Promise<boolean>
  countDocuments(filter?: FilterQuery<TDoc>): Promise<number>
  create(doc: Partial<TDoc> | Record<string, unknown>): Promise<HydratedDocument<TDoc>>
  findOneAndUpdate(
    filter: FilterQuery<TDoc>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<HydratedDocument<TDoc> | null>
  findByIdAndUpdate(
    id: unknown,
    update: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<HydratedDocument<TDoc> | null>
  updateMany(filter: FilterQuery<TDoc>, update: Record<string, unknown>): Promise<UpdateResult>
  deleteOne(filter: FilterQuery<TDoc>): Promise<DeleteResult>
  deleteById(id: unknown): Promise<DeleteResult>
  aggregate<TResult = Record<string, unknown>>(pipeline: PipelineStage[]): Promise<TResult[]>
}

/**
 * Ids arrive from URLs, so they may be anything at all. An unparseable id must
 * behave exactly like a valid id that matches nothing — otherwise a CastError
 * distinguishes "malformed" from "not yours", which is an information leak and
 * a 500 where a 404 belongs.
 */
function toObjectId(id: unknown): Types.ObjectId | null {
  if (id instanceof Types.ObjectId) return id
  if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) return null
  return new Types.ObjectId(id)
}

/**
 * An update must never move a document between tenants, so `restaurantId` is
 * removed from `$set`/`$setOnInsert` and from any top-level field assignment.
 */
function stripTenantFromUpdate(update: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(update)) {
    if (key === 'restaurantId') continue
    if ((key === '$set' || key === '$setOnInsert') && value && typeof value === 'object') {
      const { restaurantId: _dropped, ...rest } = value as Record<string, unknown>
      cleaned[key] = rest
      continue
    }
    cleaned[key] = value
  }

  return cleaned
}

export function tenantRepo<TDoc>(model: Model<TDoc>, explicitTenantId?: string): TenantRepo<TDoc> {
  const tenantId = (): string => explicitTenantId ?? requireTenantId()

  const scope = (filter: FilterQuery<TDoc> = {}): FilterQuery<TDoc> =>
    ({ ...filter, restaurantId: tenantId() }) as FilterQuery<TDoc>

  const applyOptions = <Q extends { sort: (v: never) => Q; limit: (n: number) => Q; skip: (n: number) => Q; select: (s: string) => Q }>(
    query: Q,
    options?: FindOptions,
  ): Q => {
    if (!options) return query
    if (options.sort) query = query.sort(options.sort as never)
    if (options.skip !== undefined) query = query.skip(options.skip)
    if (options.limit !== undefined) query = query.limit(options.limit)
    if (options.select) query = query.select(options.select)
    return query
  }

  return {
    get restaurantId(): string {
      return tenantId()
    },

    async find(filter = {}, options) {
      return applyOptions(model.find(scope(filter)), options).exec()
    },

    async findOne(filter = {}, options) {
      return applyOptions(model.findOne(scope(filter)), options).exec()
    },

    async findById(id, options) {
      const _id = toObjectId(id)
      if (!_id) return null
      return applyOptions(model.findOne(scope({ _id } as FilterQuery<TDoc>)), options).exec()
    },

    async exists(filter = {}) {
      return (await model.exists(scope(filter))) !== null
    },

    async countDocuments(filter = {}) {
      return model.countDocuments(scope(filter)).exec()
    },

    /** Any `restaurantId` in `doc` is discarded and replaced. */
    async create(doc) {
      const created = await model.create({ ...doc, restaurantId: tenantId() })
      return created as HydratedDocument<TDoc>
    },

    async findOneAndUpdate(filter, update, options = {}) {
      return model
        .findOneAndUpdate(scope(filter), stripTenantFromUpdate(update), { new: true, ...options })
        .exec()
    },

    async findByIdAndUpdate(id, update, options = {}) {
      const _id = toObjectId(id)
      if (!_id) return null
      return model
        .findOneAndUpdate(scope({ _id } as FilterQuery<TDoc>), stripTenantFromUpdate(update), {
          new: true,
          ...options,
        })
        .exec()
    },

    async updateMany(filter, update) {
      const result = await model.updateMany(scope(filter), stripTenantFromUpdate(update)).exec()
      return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount }
    },

    async deleteOne(filter) {
      const result = await model.deleteOne(scope(filter)).exec()
      return { deletedCount: result.deletedCount }
    },

    async deleteById(id) {
      const _id = toObjectId(id)
      if (!_id) return { deletedCount: 0 }
      const result = await model.deleteOne(scope({ _id } as FilterQuery<TDoc>)).exec()
      return { deletedCount: result.deletedCount }
    },

    /** Prepends a tenant `$match`, so no pipeline can reach another tenant. */
    async aggregate<TResult = Record<string, unknown>>(pipeline: PipelineStage[]) {
      return model.aggregate<TResult>([
        { $match: { restaurantId: new Types.ObjectId(tenantId()) } },
        ...pipeline,
      ])
    },
  }
}

export interface UnscopedRepo<TDoc> {
  find(filter?: FilterQuery<TDoc>, options?: FindOptions): Promise<HydratedDocument<TDoc>[]>
  findOne(filter?: FilterQuery<TDoc>): Promise<HydratedDocument<TDoc> | null>
  findById(id: unknown): Promise<HydratedDocument<TDoc> | null>
  countDocuments(filter?: FilterQuery<TDoc>): Promise<number>
  create(doc: Partial<TDoc> | Record<string, unknown>): Promise<HydratedDocument<TDoc>>
  findOneAndUpdate(
    filter: FilterQuery<TDoc>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<HydratedDocument<TDoc> | null>
  deleteOne(filter: FilterQuery<TDoc>): Promise<DeleteResult>
  aggregate<TResult = Record<string, unknown>>(pipeline: PipelineStage[]): Promise<TResult[]>
}

/**
 * Deliberate, audited bypass for platform-admin routes.
 *
 * Every call site must be justified in review and should write an audit event.
 * If this appears in a restaurant-facing module, that is a bug.
 */
export function unscoped<TDoc>(model: Model<TDoc>): UnscopedRepo<TDoc> {
  return {
    async find(filter = {}, options) {
      let query = model.find(filter).setOptions({ unscoped: true })
      if (options?.sort) query = query.sort(options.sort as never)
      if (options?.limit !== undefined) query = query.limit(options.limit)
      if (options?.skip !== undefined) query = query.skip(options.skip)
      if (options?.select) query = query.select(options.select)
      return query.exec()
    },
    async findOne(filter = {}) {
      return model.findOne(filter).setOptions({ unscoped: true }).exec()
    },
    async findById(id) {
      const _id = toObjectId(id)
      if (!_id) return null
      return model
        .findOne({ _id } as FilterQuery<TDoc>)
        .setOptions({ unscoped: true })
        .exec()
    },
    async countDocuments(filter = {}) {
      return model.countDocuments(filter).setOptions({ unscoped: true }).exec()
    },
    async create(doc) {
      const created = await model.create(doc)
      return created as HydratedDocument<TDoc>
    },
    async findOneAndUpdate(filter, update, options = {}) {
      return model
        .findOneAndUpdate(filter, update, { new: true, ...options, unscoped: true })
        .exec()
    },
    async deleteOne(filter) {
      const result = await model.deleteOne(filter).setOptions({ unscoped: true }).exec()
      return { deletedCount: result.deletedCount }
    },
    async aggregate<TResult = Record<string, unknown>>(pipeline: PipelineStage[]) {
      // `.option({ unscoped: true })` so the tenant guard's `pre('aggregate')`
      // hook skips this pipeline. Without it a platform aggregation whose first
      // stage is not a tenant `$match` (e.g. platform-wide revenue) is rejected
      // with a TenantScopeError — the 500 that broke the platform analytics.
      return model
        .aggregate<TResult>(pipeline)
        .option({ unscoped: true } as Record<string, unknown>)
        .exec()
    },
  }
}
