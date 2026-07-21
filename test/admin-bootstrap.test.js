import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ensureAdminInitialized,
  registerInitialAdmin,
  adoptBootstrapAdmin,
  isBootstrapAdminDisabled,
  BootstrapError,
  getBootstrapStatus,
} from '../functions/_shared/admin-bootstrap.js'
import { verifyPw } from '../functions/_shared/auth.js'

class FakeKV {
  constructor() { this.data = new Map() }
  async get(key) { return this.data.get(key) ?? null }
  async put(key, value) { this.data.set(key, typeof value === 'string' ? value : JSON.stringify(value)) }
  async delete(key) { this.data.delete(key) }
  async list({ prefix = '' } = {}) { return { keys: [...this.data.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true, cursor: null } }
}

class FakeDB {
  constructor() { this.users = []; this.passwordUpdates = 0 }
  async webUserCount() { return this.users.length }
  async createWebUser(username, password_hash, opts = {}) {
    const isAdmin = opts?.isAdmin === true || opts?.isAdmin === 1 || opts?.isAdmin === '1'
    const user = { id: `id-${this.users.length + 1}`, username, password_hash, is_admin: isAdmin ? 1 : 0, totp_enabled: 0 }
    this.users.push(user)
    return user
  }
  async getWebUser(username) { return this.users.find(u => u.username.toLowerCase() === String(username).toLowerCase()) || null }
  async getWebUserById(id) { return this.users.find(u => u.id === id) || null }
  async getAllWebUsersRaw() { return [...this.users] }
  async updateWebUserPassword(id, password_hash) {
    const user = await this.getWebUserById(id)
    if (user) { user.password_hash = password_hash; this.passwordUpdates++ }
  }
}

test('rejects a short configured admin password', async () => {
  const kv = new FakeKV()
  const db = new FakeDB()
  await assert.rejects(
    ensureAdminInitialized({ db, kv, env: { ADMIN_USERNAME: 'ops', ADMIN_PASSWORD: '12345' } }),
    BootstrapError,
  )
  assert.equal(db.users.length, 0)
})

test('generates password when ADMIN_PASSWORD is omitted', async () => {
  const kv = new FakeKV()
  const db = new FakeDB()
  await ensureAdminInitialized({
    db,
    kv,
    env: { ADMIN_USERNAME: 'ops-gen' },
  })
  assert.equal(db.users.length, 1)
  assert.equal(db.users[0].username, 'ops-gen')
  assert.equal(db.users[0].is_admin, 1)
  // 临时密码会打印到日志；此处验证账号已创建且哈希存在
  assert.ok(db.users[0].password_hash)
  const bootstrap = JSON.parse(await kv.get('auth:bootstrap:v2'))
  assert.equal(bootstrap.passwordSource, 'generated')
})

test('persists custom bootstrap id and disables it after registration', async () => {
  const kv = new FakeKV()
  const db = new FakeDB()
  await ensureAdminInitialized({ db, kv, env: { ADMIN_USERNAME: 'ops', ADMIN_PASSWORD: 'SecurePass1' } })
  const bootstrap = JSON.parse(await kv.get('auth:bootstrap:v2'))
  assert.equal(bootstrap.defaultAdminId, 'id-1')
  assert.equal((await getBootstrapStatus({ db, kv })).needsRegistration, true)
  assert.equal((await db.getWebUserById('id-1')).is_admin, 1)

  const registered = await registerInitialAdmin({
    db,
    kv,
    username: 'real-admin',
    password: 'AnotherPass1',
    bootstrapUserId: bootstrap.defaultAdminId,
  })
  assert.equal(registered.username, 'real-admin')
  assert.equal(registered.is_admin, 1)
  assert.equal((await db.getWebUserById('id-1')).password_hash.startsWith('!!disabled:'), true)
  assert.equal((await getBootstrapStatus({ db, kv })).needsRegistration, false)
})

test('allows open first registration without bootstrap session', async () => {
  const kv = new FakeKV()
  const db = new FakeDB()
  await ensureAdminInitialized({ db, kv, env: { ADMIN_PASSWORD: 'SecurePass1' } })
  assert.equal((await getBootstrapStatus({ db, kv })).needsRegistration, true)

  const registered = await registerInitialAdmin({
    db,
    kv,
    username: 'open-admin',
    password: 'OpenAdmin1',
  })
  assert.equal(registered.username, 'open-admin')
  assert.equal(registered.is_admin, 1)
  assert.equal((await getBootstrapStatus({ db, kv })).needsRegistration, false)
  assert.equal((await db.getWebUserById('id-1')).password_hash.startsWith('!!disabled:'), true)
})

test('rejects wrong bootstrapUserId when provided', async () => {
  const kv = new FakeKV()
  const db = new FakeDB()
  await ensureAdminInitialized({ db, kv, env: { ADMIN_PASSWORD: 'SecurePass1' } })
  await assert.rejects(
    registerInitialAdmin({ db, kv, username: 'attacker', password: 'SecurePass1', bootstrapUserId: 'wrong-id' }),
    BootstrapError,
  )
})

test('rejects registering with bootstrap admin username', async () => {
  const kv = new FakeKV()
  const db = new FakeDB()
  await ensureAdminInitialized({ db, kv, env: { ADMIN_USERNAME: 'boot', ADMIN_PASSWORD: 'SecurePass1' } })
  await assert.rejects(
    registerInitialAdmin({ db, kv, username: 'boot', password: 'SecurePass1' }),
    BootstrapError,
  )
})

test('adopting bootstrap admin via login closes registration without disabling self', async () => {
  const kv = new FakeKV()
  const db = new FakeDB()
  await ensureAdminInitialized({ db, kv, env: { ADMIN_USERNAME: 'boot', ADMIN_PASSWORD: 'SecurePass1' } })
  assert.equal((await getBootstrapStatus({ db, kv })).needsRegistration, true)

  const boot = await db.getWebUser('boot')
  await adoptBootstrapAdmin({ db, kv, userId: boot.id })

  assert.equal((await getBootstrapStatus({ db, kv })).needsRegistration, false)
  const after = await db.getWebUserById(boot.id)
  assert.ok(after)
  assert.equal(String(after.password_hash || '').startsWith('!!disabled:'), false)
  assert.equal(await verifyPw('SecurePass1', after.password_hash), true)
  // 关键：adopt 后 /auth/me 与再次登录不得被 isBootstrapAdminDisabled 拦截
  assert.equal(await isBootstrapAdminDisabled({ kv, user: after }), false)
})

test('open registration disables bootstrap admin for subsequent login checks', async () => {
  const kv = new FakeKV()
  const db = new FakeDB()
  await ensureAdminInitialized({ db, kv, env: { ADMIN_USERNAME: 'temp', ADMIN_PASSWORD: 'SecurePass1' } })
  const temp = await db.getWebUser('temp')
  await registerInitialAdmin({ db, kv, username: 'real-admin', password: 'AnotherPass1' })
  const after = await db.getWebUserById(temp.id)
  assert.equal(String(after.password_hash || '').startsWith('!!disabled:'), true)
  assert.equal(await isBootstrapAdminDisabled({ kv, user: after }), true)
})

test('does not rewrite a pending password when it already matches', async () => {
  const kv = new FakeKV()
  const db = new FakeDB()
  await ensureAdminInitialized({ db, kv, env: { ADMIN_USERNAME: 'ops2', ADMIN_PASSWORD: 'SecurePass1' } })
  const before = db.passwordUpdates
  await ensureAdminInitialized({ db, kv, env: { ADMIN_USERNAME: 'ops2', ADMIN_PASSWORD: 'SecurePass1' } })
  assert.equal(db.passwordUpdates, before)
  assert.equal(await verifyPw('SecurePass1', (await db.getWebUser('ops2')).password_hash), true)
})
