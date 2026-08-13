/**
 * Test data builders. Keeps the security tests about security rather than
 * about assembling documents.
 */

import { Role, RestaurantStatus, UserStatus } from '@rw/shared'
import { hashPassword } from '../../src/core/crypto.js'
import { RestaurantModel, type RestaurantDoc } from '../../src/modules/restaurants/restaurant.model.js'
import { UserModel, type UserDoc } from '../../src/modules/users/user.model.js'

export const TEST_PASSWORD = 'correct-horse-battery'

let counter = 0
const unique = () => `${Date.now().toString(36)}${(counter += 1)}`

export async function makeRestaurant(
  overrides: Partial<{ slug: string; status: string; name: string }> = {},
): Promise<RestaurantDoc> {
  const slug = overrides.slug ?? `resto-${unique()}`
  return RestaurantModel.create({
    name: { en: overrides.name ?? `Restaurant ${slug}`, ar: 'مطعم' },
    slug,
    status: overrides.status ?? RestaurantStatus.ACTIVE,
  })
}

export async function makeUser(options: {
  restaurant?: RestaurantDoc | null
  role?: string
  email?: string
  password?: string
  status?: string
}): Promise<UserDoc> {
  const role = options.role ?? Role.OWNER
  const isPlatformAdmin = role === Role.PLATFORM_ADMIN

  return UserModel.create({
    email: options.email ?? `user-${unique()}@example.test`,
    passwordHash: await hashPassword(options.password ?? TEST_PASSWORD),
    name: 'Test User',
    role,
    restaurantId: isPlatformAdmin ? null : (options.restaurant?._id ?? null),
    status: options.status ?? UserStatus.ACTIVE,
  })
}

/** A restaurant with an owner, a cashier and a kitchen user — one line per test. */
export async function makeTenant(slug?: string) {
  const restaurant = await makeRestaurant(slug ? { slug } : {})
  const [owner, cashier, kitchen] = await Promise.all([
    makeUser({ restaurant, role: Role.OWNER }),
    makeUser({ restaurant, role: Role.CASHIER }),
    makeUser({ restaurant, role: Role.KITCHEN }),
  ])
  return { restaurant, owner, cashier, kitchen }
}
