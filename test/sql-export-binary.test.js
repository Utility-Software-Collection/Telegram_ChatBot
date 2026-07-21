import test from 'node:test'
import assert from 'node:assert/strict'
import { exportBusinessDataSql, parseBusinessSql } from '../functions/_shared/db-sql.js'

class FakeStore {
  constructor() {
    this.settings = {
      BOT_TOKEN: '123456:ABCDEF',
      WEBHOOK_SECRET: 'whsec',
      BOT_LOCALE: 'zh-hans',
      TOPIC_GROUP_ID: '-1001',
    }
    this.users = [{
      user_id: 42,
      username: 'alice',
      first_name: 'A',
      last_name: null,
      language_code: 'zh',
      thread_id: 7,
      is_verified: 1,
      is_blocked: 0,
      is_permanent_block: 0,
      block_reason: null,
      blocked_by: null,
      created_at: '2026-01-01T00:00:00.000Z',
    }]
    this.whitelist = []
    this.messages = []
    this.recent = []
  }
  async getAllSettings() { return { ...this.settings } }
  async getAllUsersRaw() { return [...this.users] }
  async getWhitelistRaw() { return [...this.whitelist] }
  async getAllMsgsRaw() { return [...this.messages] }
  async getAllRecentRaw() { return [...this.recent] }
}

test('export is binary TGCB package (garbled text), not plain SQL', async () => {
  const store = new FakeStore()
  const bin = await exportBusinessDataSql(store, 'kv', { password: 'ExportPass1' })
  assert.ok(bin instanceof Uint8Array)
  assert.ok(bin.length > 40)
  // magic "TGCB"
  assert.equal(bin[0], 0x54)
  assert.equal(bin[1], 0x47)
  assert.equal(bin[2], 0x43)
  assert.equal(bin[3], 0x42)
  // 不应包含可读 SQL 关键字
  const asText = new TextDecoder('utf-8', { fatal: false }).decode(bin)
  assert.equal(asText.includes('BEGIN TRANSACTION'), false)
  assert.equal(asText.includes('BOT_TOKEN'), false)
})

test('round-trip export/import without secrets by default', async () => {
  const store = new FakeStore()
  const bin = await exportBusinessDataSql(store, 'kv', { password: 'ExportPass1' })
  const records = await parseBusinessSql(bin, { password: 'ExportPass1' })
  assert.equal(records.users.length, 1)
  assert.equal(records.users[0].user_id, 42)
  const keys = records.settings.map((s) => s.key)
  assert.ok(keys.includes('BOT_LOCALE'))
  assert.equal(keys.includes('BOT_TOKEN'), false)
  assert.equal(keys.includes('WEBHOOK_SECRET'), false)
})

test('includeSecrets keeps BOT_TOKEN inside ciphertext only', async () => {
  const store = new FakeStore()
  const bin = await exportBusinessDataSql(store, 'kv', { password: 'ExportPass1', includeSecrets: true })
  const asText = new TextDecoder('utf-8', { fatal: false }).decode(bin)
  assert.equal(asText.includes('123456:ABCDEF'), false)
  const records = await parseBusinessSql(bin, { password: 'ExportPass1' })
  const token = records.settings.find((s) => s.key === 'BOT_TOKEN')
  assert.equal(token?.value, '123456:ABCDEF')
})

test('wrong password fails', async () => {
  const store = new FakeStore()
  const bin = await exportBusinessDataSql(store, 'kv', { password: 'ExportPass1' })
  await assert.rejects(
    parseBusinessSql(bin, { password: 'WrongPass99' }),
    /Invalid AES password|corrupted/,
  )
})

test('legacy plain .sql with TGCB_RECORD is accepted', async () => {
  const plain = [
    'BEGIN TRANSACTION;',
    '-- TGCB_RECORD settings {"key":"BOT_LOCALE","value":"zh-hans"}',
    '-- TGCB_RECORD users {"user_id":1,"username":"bob","first_name":null,"last_name":null,"language_code":null,"thread_id":null,"is_verified":1,"is_blocked":0,"is_permanent_block":0,"block_reason":null,"blocked_by":null,"created_at":"2026-01-01T00:00:00.000Z"}',
    'COMMIT;',
  ].join('\n')
  const records = await parseBusinessSql(plain, { password: '' })
  assert.equal(records.settings.length, 1)
  assert.equal(records.settings[0].key, 'BOT_LOCALE')
  assert.equal(records.users.length, 1)
  assert.equal(records.users[0].username, 'bob')
})

test('random SQL without TGCB_RECORD is rejected', async () => {
  await assert.rejects(
    parseBusinessSql('BEGIN TRANSACTION;\nDELETE FROM users;\nCOMMIT;', { password: '' }),
    /Unsupported SQL format/,
  )
})

test('base64-wrapped binary can be parsed (frontend upload path)', async () => {
  const store = new FakeStore()
  const bin = await exportBusinessDataSql(store, 'kv', { password: 'ExportPass1' })
  let binary = ''
  for (const b of bin) binary += String.fromCharCode(b)
  const b64 = btoa(binary)
  const records = await parseBusinessSql(b64, { password: 'ExportPass1' })
  assert.equal(records.users.length, 1)
})
