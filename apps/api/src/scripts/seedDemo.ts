/**
 * Demo data: one restaurant, its staff, a full menu, and four tables.
 *
 *   npm run seed:demo --workspace @rw/api        (against whatever MONGODB_URI points at)
 *   npm run dev:standalone --workspace @rw/api   (imports seedDemoData below)
 *
 * Two rules govern this file, and both have been broken here before:
 *
 *  1. **Go through the Mongoose models, never the raw driver.** The models are
 *     what apply the tenant guard, cast `_id` and `restaurantId` to ObjectId,
 *     and enforce the schema. Writing with the raw driver produces documents the
 *     application cannot read — string ids never match an ObjectId query, and a
 *     collection named by hand ('staff') is not the collection the model uses
 *     ('users').
 *  2. **Passwords go through `hashPassword`.** That is Argon2id, which is what
 *     `verifyPassword` expects. Any other hash produces an account that exists
 *     and can never log in.
 *
 * Re-running is safe: the restaurant is matched by slug, the menu is rebuilt,
 * and staff and tables are left alone if they already exist — so table tokens
 * survive, and a physical NFC tag written from a previous run keeps working.
 */

import { Role, UserStatus } from '@rw/shared'
import mongoose from 'mongoose'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from '../config/env.js'
import { encryptSecret, generateToken, hashPassword, sha256 } from '../core/crypto.js'
import { logger } from '../core/logger.js'
import { connectDb, disconnectDb } from '../db/mongoose.js'
import { MenuCategoryModel } from '../modules/menu/menuCategory.model.js'
import { MenuItemModel } from '../modules/menu/menuItem.model.js'
import { RestaurantModel } from '../modules/restaurants/restaurant.model.js'
import { TableModel } from '../modules/tables/table.model.js'
import { UserModel } from '../modules/users/user.model.js'

const RESTAURANT_SLUG = 'demo-kitchen'

/**
 * Development only, and deliberately obvious. It is printed to the terminal at
 * the end of a run, which is exactly why this script refuses to touch a
 * production database.
 */
const DEMO_PASSWORD = 'demo-password-1234'

/**
 * Malabar Spice - authentic Kerala cuisine, priced in halalas.
 * `24_00` is 24.00 SAR. Integers only; see @rw/shared/money.
 */
const MENU = [
  {
    name: 'Breakfast (Naadan)',
    items: [
      {
        name: 'Puttu & Kadala Curry',
        description: 'Steamed rice cake layered with coconut, served with spicy black chickpea curry.',
        price: 24_00,
        allergens: ['Coconut'],
        calories: 450,
        prep: 10,
        choices: [
          {
            name: 'Puttu Type',
            required: true,
            max: 1,
            options: [
              { name: 'White Rice', price: 0 },
              { name: 'Red Rice (Chemba)', price: 0 },
              { name: 'Wheat', price: 2_00 },
            ],
          },
        ],
      },
      {
        name: 'Appam with Stew',
        description: 'Two lacy, soft-centered rice pancakes served with your choice of mild coconut stew.',
        price: 28_00,
        allergens: ['Coconut', 'Dairy'],
        prep: 12,
        choices: [
          {
            name: 'Stew Type',
            required: true,
            max: 1,
            options: [
              { name: 'Vegetable Stew', price: 0 },
              { name: 'Chicken Stew', price: 6_00 },
              { name: 'Mutton Stew', price: 12_00 },
            ],
          },
        ],
      },
      {
        name: 'Kerala Porotta & Egg Roast',
        description: 'Two flaky, layered flatbreads served with a rich, caramelized onion egg roast.',
        price: 22_00,
        allergens: ['Gluten', 'Egg'],
        calories: 580,
        prep: 10,
        choices: [],
      },
    ],
  },
  {
    name: 'Rice & Biriyani',
    items: [
      {
        name: 'Malabar Chicken Biriyani',
        description: 'Fragrant jeerakasala rice layered with spiced chicken, topped with fried onions and cashews.',
        price: 36_00,
        allergens: ['Nuts', 'Dairy'],
        calories: 720,
        prep: 15,
        choices: [
          {
            name: 'Accompaniments',
            required: false,
            max: 2,
            options: [
              { name: 'Extra Raita', price: 2_00 },
              { name: 'Pappadam (2 pcs)', price: 3_00 },
              { name: 'Kerala Pickle', price: 2_00 },
            ],
          },
        ],
      },
      {
        name: 'Ghee Rice & Beef Fry (Pothu Fry)',
        description: 'Aromatic ghee rice served with spicy, dry-roasted Kerala beef fry with coconut slivers.',
        price: 42_00,
        allergens: ['Dairy', 'Coconut'],
        prep: 15,
        choices: [],
      },
      {
        name: 'Fish Curry Meals (Pothi Choru)',
        description: 'Traditional meal wrapped in banana leaf: Matta rice, fish curry, thoran, and pickle.',
        price: 32_00,
        allergens: ['Fish', 'Mustard', 'Coconut'],
        prep: 10,
        choices: [],
      },
    ],
  },
  {
    name: 'Curries & Sides',
    items: [
      {
        name: 'Meen Pollichathu',
        description: 'Pearl spot fish marinated in a rich masala and baked in a banana leaf.',
        price: 48_00,
        allergens: ['Fish'],
        prep: 20,
        choices: [],
      },
      {
        name: 'Kallumakkaya Roast',
        description: 'Spicy Kerala-style roasted mussels.',
        price: 38_00,
        allergens: ['Shellfish', 'Mustard'],
        prep: 15,
        choices: [],
      },
      {
        name: 'Chicken Chettinad',
        description: 'A fiery, aromatic curry made with roasted spices and coconut.',
        price: 34_00,
        allergens: ['Mustard', 'Coconut'],
        prep: 12,
        choices: [],
      },
      {
        name: 'Kerala Porotta (Extra)',
        description: 'Flaky, layered flatbread.',
        price: 4_00,
        allergens: ['Gluten'],
        calories: 250,
        prep: 5,
        choices: [],
      },
    ],
  },
  {
    name: 'Snacks (Chaya Kadi)',
    items: [
      {
        name: 'Pazham Pori (Banana Fritters)',
        description: 'Sweet plantains deep-fried in a crispy batter. (3 pieces)',
        price: 12_00,
        allergens: ['Gluten'],
        prep: 8,
        choices: [],
      },
      {
        name: 'Beef Cutlet',
        description: 'Spiced minced beef and potato patties, breaded and fried. (2 pieces)',
        price: 14_00,
        allergens: ['Gluten', 'Egg'],
        prep: 8,
        choices: [],
      },
      {
        name: 'Uzhunnu Vada',
        description: 'Crispy, savory lentil doughnuts served with coconut chutney. (2 pieces)',
        price: 10_00,
        allergens: [],
        prep: 5,
        choices: [],
      },
    ],
  },
  {
    name: 'Drinks & Desserts',
    items: [
      {
        name: 'Sulaimani Tea',
        description: 'Spiced black tea with lemon and a hint of cardamom.',
        price: 6_00,
        allergens: [],
        prep: 5,
        choices: [],
      },
      {
        name: 'Kuluki Sharbath',
        description: 'Shaken sweet and sour iced lemonade with basil seeds.',
        price: 12_00,
        allergens: [],
        prep: 5,
        choices: [
          {
            name: 'Flavour',
            required: true,
            max: 1,
            options: [
              { name: 'Classic Lemon', price: 0 },
              { name: 'Pineapple', price: 2_00 },
              { name: 'Green Apple', price: 2_00 },
            ],
          },
        ],
      },
      {
        name: 'Palada Payasam',
        description: 'Rich, creamy dessert made with rice flakes, milk, and sugar.',
        price: 16_00,
        allergens: ['Dairy'],
        prep: 5,
        choices: [],
      },
    ],
  },
]

const STAFF = [
  { email: 'owner@demo.test', name: 'Restaurant Owner', role: Role.OWNER },
  { email: 'cashier@demo.test', name: 'Front Desk', role: Role.CASHIER },
  { email: 'kitchen@demo.test', name: 'Kitchen Team', role: Role.KITCHEN },
]

const TABLE_LABELS = ['1', '2', '3', 'Terrace 1']

/**
 * The same three fields `tables/table.service.ts` writes when it mints a token:
 * a 32-byte opaque value, its SHA-256 for lookup, and an AES-256-GCM copy so
 * the QR can be reprinted. The plaintext is returned here only so the run can
 * print the URL once, and is never stored.
 */
function newTableToken() {
  const token = generateToken()
  return { token, tokenHash: sha256(token), tokenCipher: encryptSecret(token) }
}

export async function seedDemoData(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('seed:demo refuses to run in production.')
  }

  const restaurant =
    (await RestaurantModel.findOne({ slug: RESTAURANT_SLUG })) ??
    (await RestaurantModel.create({
      name: { en: 'Malabar Spice', ar: 'مالابار سبايس' },
      slug: RESTAURANT_SLUG,
      city: 'Riyadh',
    }))

  const restaurantId = restaurant._id

  // The menu is the one thing rebuilt every run, so edits to MENU above show up
  // immediately. Staff and tables are preserved — see the note at the top.
  await MenuItemModel.deleteMany({ restaurantId })
  await MenuCategoryModel.deleteMany({ restaurantId })

  let itemCount = 0

  for (const [categoryIndex, category] of MENU.entries()) {
    const created = await MenuCategoryModel.create({
      restaurantId,
      name: { en: category.name },
      sortOrder: categoryIndex,
    })

    for (const [itemIndex, item] of category.items.entries()) {
      await MenuItemModel.create({
        restaurantId,
        categoryId: created._id,
        name: { en: item.name },
        description: item.description ? { en: item.description } : undefined,
        priceHalalas: item.price,
        allergens: item.allergens,
        calories: item.calories,
        prepTimeMinutes: item.prep,
        sortOrder: itemIndex,
        modifierGroups: item.choices.map((choice, groupIndex) => ({
          key: `grp_${groupIndex}`,
          name: { en: choice.name },
          minSelect: choice.required ? 1 : 0,
          maxSelect: choice.max,
          required: choice.required,
          options: choice.options.map((option, optionIndex) => ({
            key: `opt_${groupIndex}_${optionIndex}`,
            name: { en: option.name },
            priceDeltaHalalas: option.price,
          })),
        })),
      })
      itemCount++
    }
  }

  // One hash for all four accounts: this is demo data, and Argon2id is
  // deliberately slow.
  const passwordHash = await hashPassword(DEMO_PASSWORD)

  for (const person of STAFF) {
    const existing = await UserModel.findOne({ email: person.email })
    if (existing) continue

    await UserModel.create({
      email: person.email,
      passwordHash,
      name: person.name,
      role: person.role,
      restaurantId,
      status: UserStatus.ACTIVE,
      // False on purpose. These accounts exist to be signed into immediately;
      // a forced password change would put a wall in front of every demo.
      // Accounts provisioned through the admin UI still get `true`.
      mustChangePassword: false,
    })
  }

  // A platform admin belongs to no restaurant — the User model's validator
  // rejects one that does.
  if (!(await UserModel.findOne({ email: 'admin@demo.test' }))) {
    await UserModel.create({
      email: 'admin@demo.test',
      passwordHash,
      name: 'Platform Admin',
      role: Role.PLATFORM_ADMIN,
      restaurantId: null,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
    })
  }

  const tableUrls: string[] = []

  for (const label of TABLE_LABELS) {
    if (await TableModel.exists({ restaurantId, label })) continue

    const { token, tokenHash, tokenCipher } = newTableToken()
    await TableModel.create({ restaurantId, label, tokenHash, tokenCipher })

    tableUrls.push(`${env.PUBLIC_APP_URL.replace(/\/$/, '')}/t/${token}`)
  }

  logger.info(
    { restaurant: 'Malabar Spice', slug: RESTAURANT_SLUG, categories: MENU.length, items: itemCount },
    'demo data ready',
  )

  // Printed once, at creation. The plaintext is not stored, so a later run
  // cannot show these again — reprint from the admin Tables screen instead.
  for (const url of tableUrls) {
    logger.info({ url }, 'new table URL (open this to start a customer session)')
  }

  logger.info(
    { logins: ['admin@demo.test', ...STAFF.map((s) => s.email)] },
    'demo staff accounts',
  )
  // ASCII only: the Windows console renders UTF-8 punctuation as mojibake.
  logger.info(`demo password: ${DEMO_PASSWORD}  - development only, never in production`)
}

/**
 * CLI entry. Skipped when this module is imported, which is how
 * `scripts/dev-standalone.mts` reuses `seedDemoData` against its in-memory
 * MongoDB without opening a second connection.
 */
const isCli = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false

if (isCli) {
  connectDb()
    .then(seedDemoData)
    .then(async () => {
      await disconnectDb()
      process.exit(0)
    })
    .catch(async (err: unknown) => {
      logger.error({ err }, 'demo seed failed')
      if (mongoose.connection.readyState !== 0) await disconnectDb()
      process.exit(1)
    })
}
