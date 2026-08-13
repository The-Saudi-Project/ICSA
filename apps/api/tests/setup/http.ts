/**
 * HTTP test helpers: log in through the real endpoint and keep the cookie jar,
 * so tests exercise the same path a browser does rather than a shortcut.
 */

import request from 'supertest'
import { createApp } from '../../src/app.js'
import { TEST_PASSWORD } from './factories.js'

export const app = createApp()

export interface Session {
  accessToken: string
  /** Raw Set-Cookie values, replayed on refresh/logout calls. */
  cookies: string[]
  user: { id: string; role: string; restaurantId: string | null; mustChangePassword: boolean }
}

export async function loginAs(email: string, password = TEST_PASSWORD): Promise<Session> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password })

  if (res.status !== 200) {
    throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`)
  }

  return {
    accessToken: res.body.accessToken as string,
    cookies: (res.headers['set-cookie'] as unknown as string[]) ?? [],
    user: res.body.user,
  }
}

export const auth = (session: Session) => ({ Authorization: `Bearer ${session.accessToken}` })
