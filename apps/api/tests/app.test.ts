import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { env } from '../src/config/env.js'

const app = createApp()

describe('health endpoints', () => {
  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(typeof res.body.uptimeSeconds).toBe('number')
  })

  it('GET /readyz reports dependency state', async () => {
    const res = await request(app).get('/readyz')
    // No database configured in the test env, which is allowed outside production.
    expect(res.status).toBe(200)
    expect(res.body.checks.database).toBe('not-configured')
  })

  it('leaks nothing about the stack', async () => {
    const res = await request(app).get('/health')
    const body = JSON.stringify(res.body)
    expect(body).not.toMatch(/mongodb:\/\//i)
    expect(body).not.toMatch(/secret/i)
    expect(res.headers['x-powered-by']).toBeUndefined()
  })
})

describe('request correlation', () => {
  it('assigns an x-request-id when none is supplied', async () => {
    const res = await request(app).get('/health')
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('echoes a well-formed inbound request id', async () => {
    const res = await request(app).get('/health').set('x-request-id', 'trace-abc-123')
    expect(res.headers['x-request-id']).toBe('trace-abc-123')
  })

  it('replaces an inbound request id that fails the safe-character check', async () => {
    // Spaces and angle brackets are legal in an HTTP header but are rejected by
    // SAFE_REQUEST_ID, because this value is echoed back and written to logs.
    // (A literal newline cannot be tested here — Node's HTTP client refuses to
    // send it, which is its own layer of protection.)
    const res = await request(app).get('/health').set('x-request-id', 'bad id <script>')
    expect(res.headers['x-request-id']).not.toContain('script')
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('replaces an inbound request id that is too short to be a real trace id', async () => {
    const res = await request(app).get('/health').set('x-request-id', 'abc')
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('security headers', () => {
  it('sets the helmet baseline', async () => {
    const res = await request(app).get('/health')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(res.headers['referrer-policy']).toBe('no-referrer')
    expect(res.headers['content-security-policy']).toContain("default-src 'none'")
  })
})

describe('CORS', () => {
  it('allows the configured origin', async () => {
    // Read the origin from the config rather than hardcoding a port. When this
    // test spelled out 5173 it broke the moment the dev port moved to 5174 —
    // and a test that has to be edited whenever configuration changes is
    // testing the constant, not the behaviour.
    const allowed = env.corsOrigins[0]!
    const res = await request(app).get('/health').set('Origin', allowed)
    expect(res.headers['access-control-allow-origin']).toBe(allowed)
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })

  it('does not grant access to an unknown origin', async () => {
    const res = await request(app).get('/health').set('Origin', 'https://evil.test')
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})

describe('error handling', () => {
  it('returns a structured 404 for an unknown route', async () => {
    const res = await request(app).get('/api/v1/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
    expect(res.body.error.requestId).toBeTruthy()
  })

  it('rejects malformed JSON with a 400, not a stack trace', async () => {
    const res = await request(app)
      .post('/api/v1/anything')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('BAD_REQUEST')
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts:/)
  })

  it('rejects an oversized body with a 413', async () => {
    const res = await request(app)
      .post('/api/v1/anything')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ blob: 'x'.repeat(200_000) }))
    expect(res.status).toBe(413)
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE')
  })
})
