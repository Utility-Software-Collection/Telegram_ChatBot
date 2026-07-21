import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AUTH_RATE_LIMITS,
  checkAuthRateLimit,
  recordAuthFailure,
  clearAuthFailures,
  getClientIp,
} from '../functions/_shared/auth.js'

class FakeKV {
  constructor() { this.data = new Map() }
  async get(key) { return this.data.get(key) ?? null }
  async put(key, value) { this.data.set(key, typeof value === 'string' ? value : JSON.stringify(value)) }
  async delete(key) { this.data.delete(key) }
  async list({ prefix = '', limit = Infinity, cursor } = {}) {
    const names = [...this.data.keys()].filter(k => k.startsWith(prefix)).sort()
    const start = cursor ? Math.max(0, names.indexOf(cursor) + 1) : 0
    const page = names.slice(start, start + limit).map(name => ({ name }))
    const hasMore = start + page.length < names.length
    return { keys: page, list_complete: !hasMore, cursor: hasMore ? page.at(-1).name : null }
  }
}

test('login rate limit locks after max fails', async () => {
  const kv = new FakeKV()
  const id = { ip: '1.2.3.4', username: 'admin' }
  const max = AUTH_RATE_LIMITS.login.maxFails

  for (let i = 0; i < max - 1; i++) {
    await recordAuthFailure(kv, 'login', id)
    const r = await checkAuthRateLimit(kv, 'login', id)
    assert.equal(r.allowed, true, `should allow after ${i + 1} fails`)
  }

  await recordAuthFailure(kv, 'login', id)
  const locked = await checkAuthRateLimit(kv, 'login', id)
  assert.equal(locked.allowed, false)
  assert.ok(locked.retryAfterSec > 0)
})

test('clearAuthFailures unlocks after success', async () => {
  const kv = new FakeKV()
  const id = { ip: '10.0.0.1', username: 'ops' }
  for (let i = 0; i < AUTH_RATE_LIMITS.login.maxFails; i++) {
    await recordAuthFailure(kv, 'login', id)
  }
  assert.equal((await checkAuthRateLimit(kv, 'login', id)).allowed, false)
  await clearAuthFailures(kv, 'login', id)
  assert.equal((await checkAuthRateLimit(kv, 'login', id)).allowed, true)
})

test('ip and username dimensions are independent lock sources', async () => {
  const kv = new FakeKV()
  // lock by username only
  for (let i = 0; i < AUTH_RATE_LIMITS.login.maxFails; i++) {
    await recordAuthFailure(kv, 'login', { username: 'victim' })
  }
  assert.equal((await checkAuthRateLimit(kv, 'login', { username: 'victim' })).allowed, false)
  // same IP other user still ok if only username was tracked — here we only used username
  assert.equal((await checkAuthRateLimit(kv, 'login', { ip: '9.9.9.9', username: 'other' })).allowed, true)
  // same username different IP still locked
  assert.equal((await checkAuthRateLimit(kv, 'login', { ip: '8.8.8.8', username: 'victim' })).allowed, false)
})

test('recover uses stricter maxFails', async () => {
  const kv = new FakeKV()
  const id = { ip: '5.5.5.5', username: 'admin' }
  const max = AUTH_RATE_LIMITS.recover.maxFails
  assert.ok(max < AUTH_RATE_LIMITS.login.maxFails)

  for (let i = 0; i < max; i++) {
    await recordAuthFailure(kv, 'recover', id)
  }
  assert.equal((await checkAuthRateLimit(kv, 'recover', id)).allowed, false)
  // login bucket independent
  assert.equal((await checkAuthRateLimit(kv, 'login', id)).allowed, true)
})

test('getClientIp prefers cf-connecting-ip', () => {
  const req = {
    headers: {
      get(name) {
        const h = {
          'cf-connecting-ip': '203.0.113.9',
          'x-forwarded-for': '1.1.1.1, 2.2.2.2',
          'x-real-ip': '3.3.3.3',
        }
        return h[name.toLowerCase()] || null
      },
    },
  }
  assert.equal(getClientIp(req), '203.0.113.9')
})

test('getClientIp falls back to x-forwarded-for first hop', () => {
  const req = {
    headers: {
      get(name) {
        if (name.toLowerCase() === 'x-forwarded-for') return '198.51.100.1, 10.0.0.1'
        return null
      },
    },
  }
  assert.equal(getClientIp(req), '198.51.100.1')
})
