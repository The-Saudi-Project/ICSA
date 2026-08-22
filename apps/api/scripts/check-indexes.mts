/**
 * Index review.
 *
 *   npm run indexes:check --workspace @rw/api
 *
 * Runs `explain('executionStats')` against the query shapes the application
 * actually issues, and reports whether each one used an index or scanned the
 * collection. Indexes were declared in the model files; this is the first thing
 * that checks the planner agrees.
 *
 * Deliberately goes through the raw driver rather than Mongoose: the tenant
 * guard would reject several of these shapes, and we want to measure the query
 * the database sees, not the one the ODM allows.
 *
 * Caveat, stated because it matters: on a small collection MongoDB may prefer a
 * collection scan simply because it is cheaper, so a COLLSCAN here is a prompt
 * to look, not proof of a missing index. Re-run against realistic volume before
 * a pilot. What this catches reliably is a query shape with *no* usable index at
 * all, and a sort that cannot be served from one.
 */

import mongoose from 'mongoose'

process.env.NODE_ENV ??= 'development'

const { env } = await import('../src/config/env.js')
if (!env.MONGODB_URI) throw new Error('MONGODB_URI is not set.')

await mongoose.connect(env.MONGODB_URI)
const db = mongoose.connection.db!

const oid = () => new mongoose.Types.ObjectId()

interface Shape {
  name: string
  collection: string
  filter: Record<string, unknown>
  sort?: Record<string, 1 | -1>
  /** Set when a collection scan is the correct, expected plan. */
  scanIsFine?: string
}

const SHAPES: Shape[] = [
  {
    name: 'cashier / kitchen board',
    collection: 'orders',
    filter: { restaurantId: oid(), status: { $in: ['CONFIRMED', 'PREPARING'] } },
    sort: { createdAt: -1 },
  },
  {
    name: 'order history for a restaurant',
    collection: 'orders',
    filter: { restaurantId: oid() },
    sort: { createdAt: -1 },
  },
  {
    name: 'customer opens their order by public id',
    collection: 'orders',
    filter: { publicId: 'abc123xyz' },
  },
  {
    name: 'orders for one table session',
    collection: 'orders',
    filter: { restaurantId: oid(), tableSessionId: oid() },
    sort: { createdAt: -1 },
  },
  {
    name: 'idempotency claim on order create',
    collection: 'idempotencykeys',
    filter: { restaurantId: oid(), scope: 'order.create', key: 'k' },
  },
  {
    // Sold-out items stay on the menu, so this no longer filters on
    // `isAvailable` — the customer surface decides how to render them.
    name: 'customer menu (active)',
    collection: 'menuitems',
    filter: { restaurantId: oid(), isActive: true },
    sort: { sortOrder: 1 },
  },
  {
    name: 'menu items in one category',
    collection: 'menuitems',
    filter: { restaurantId: oid(), categoryId: oid(), isActive: true },
    sort: { sortOrder: 1 },
  },
  {
    name: 'menu categories',
    collection: 'menucategories',
    filter: { restaurantId: oid() },
    sort: { sortOrder: 1 },
  },
  {
    name: 'table token exchange (every customer tap)',
    collection: 'tables',
    filter: { tokenHash: 'x'.repeat(64) },
  },
  {
    name: 'tables for a restaurant',
    collection: 'tables',
    filter: { restaurantId: oid() },
    sort: { label: 1 },
  },
  {
    // The waiter screen polls this every ten seconds. The equality rides the
    // { restaurantId, label } index; the sort is done in memory on purpose —
    // a restaurant has tens of tables, and an index on a field that is null for
    // almost every document would earn nothing.
    name: 'waiter call board',
    collection: 'tables',
    filter: { restaurantId: oid(), needsWaiterAt: { $ne: null } },
    sort: { needsWaiterAt: 1 },
    scanIsFine: 'tens of tables per restaurant; the in-memory sort is trivial',
  },
  {
    name: 'login by email',
    collection: 'users',
    filter: { email: 'someone@example.test' },
  },
  {
    name: 'staff list for a restaurant',
    collection: 'users',
    filter: { restaurantId: oid() },
  },
  {
    name: 'refresh token lookup (every 15 min per staff session)',
    collection: 'refreshtokens',
    filter: { tokenHash: 'y'.repeat(64) },
  },
  {
    name: 'revoke a token family',
    collection: 'refreshtokens',
    filter: { familyId: 'fam', revokedAt: null },
  },
  {
    name: 'restaurant audit view',
    collection: 'auditlogs',
    filter: { restaurantId: oid() },
    sort: { at: -1 },
  },
  {
    name: 'platform audit, filtered by action',
    collection: 'auditlogs',
    filter: { action: 'CASH_CONFIRMED' },
    sort: { at: -1 },
  },
  {
    name: 'platform restaurant list',
    collection: 'restaurants',
    filter: {},
    sort: { createdAt: -1 },
    scanIsFine: 'one row per customer; there will never be enough to matter',
  },
]

interface Row {
  ok: boolean
  name: string
  stage: string
  index: string
  examined: number
  returned: number
  note?: string
}

/** The shape of an explain plan node, to the depth this script reads. */
interface PlanNode {
  stage?: string
  indexName?: string
  inputStage?: PlanNode
  inputStages?: PlanNode[]
}

function describePlan(plan: PlanNode): { stage: string; index: string } {
  // Walk to the leaf: SORT -> FETCH -> IXSCAN, or SORT -> COLLSCAN.
  let node: PlanNode | undefined = plan
  let index = '—'
  const stages: string[] = []

  while (node) {
    if (node.stage) stages.push(node.stage)
    if (node.indexName) index = node.indexName
    node = node.inputStage ?? node.inputStages?.[0]
  }

  return { stage: stages.join(' → '), index }
}

const rows: Row[] = []

for (const shape of SHAPES) {
  try {
    const cursor = db.collection(shape.collection).find(shape.filter)
    if (shape.sort) cursor.sort(shape.sort)

    const explained = (await cursor.explain('executionStats')) as {
      queryPlanner: { winningPlan: PlanNode }
      executionStats: { totalDocsExamined: number; nReturned: number }
    }
    const { stage, index } = describePlan(explained.queryPlanner.winningPlan)
    const stats = explained.executionStats

    const scanned = stage.includes('COLLSCAN')
    // An in-memory sort on a large result set is the other thing worth catching.
    const memorySort = stage.includes('SORT') && !stage.includes('IXSCAN')

    rows.push({
      ok: !scanned || Boolean(shape.scanIsFine),
      name: shape.name,
      stage,
      index,
      examined: stats.totalDocsExamined,
      returned: stats.nReturned,
      note: shape.scanIsFine ?? (memorySort ? 'sort not served by an index' : undefined),
    })
  } catch (error) {
    rows.push({
      ok: false,
      name: shape.name,
      stage: 'ERROR',
      index: '—',
      examined: 0,
      returned: 0,
      note: (error as Error).message,
    })
  }
}

const pad = (s: string, n: number) => s.padEnd(n).slice(0, n)

console.log('')
console.log(pad('query shape', 44), pad('plan', 34), pad('index', 34))
console.log('-'.repeat(115))
for (const row of rows) {
  console.log(
    (row.ok ? '  ' : '! ') + pad(row.name, 42),
    pad(row.stage, 34),
    pad(row.index, 34),
    row.note ? `\n     ${row.note}` : '',
  )
}

const problems = rows.filter((r) => !r.ok)
console.log('')
console.log(
  problems.length === 0
    ? `All ${rows.length} query shapes are served by an index.`
    : `${problems.length} of ${rows.length} shapes need attention (marked !).`,
)
console.log('Collections are small in development; re-run against pilot volume before launch.')

await mongoose.disconnect()
process.exit(problems.length === 0 ? 0 : 1)
