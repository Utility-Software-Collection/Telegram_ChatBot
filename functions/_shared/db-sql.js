// 旧版文本封装（仍支持导入）
const TGCB_SQL_BASE64_PREFIX = '-- TGCB_SQL_BASE64 '
const TGCB_SQL_AES_PREFIX = '-- TGCB_SQL_AES256GCM '

// 新版二进制包：TGCB + ver + flags + salt(16) + iv(12) + ciphertext
// 用记事本打开即为乱码，无法直接阅读 SQL
const TGCB_BIN_MAGIC = new Uint8Array([0x54, 0x47, 0x43, 0x42]) // "TGCB"
const TGCB_BIN_VERSION = 0x01
const TGCB_BIN_FLAG_AES = 0x01

const BUSINESS_TABLES = {
  settings: ['key', 'value'],
  users: ['user_id', 'username', 'first_name', 'last_name', 'language_code', 'thread_id', 'is_verified', 'is_blocked', 'is_permanent_block', 'block_reason', 'blocked_by', 'created_at'],
  whitelist: ['user_id', 'reason', 'added_by', 'created_at'],
  messages: ['id', 'user_id', 'direction', 'content', 'message_type', 'telegram_message_id', 'created_at'],
  recent_convs: ['user_id', 'last_message', 'last_direction', 'last_at'],
  // Web 后台登录账号（含 password_hash / TOTP）
  web_users: ['id', 'username', 'password_hash', 'totp_secret', 'totp_enabled', 'is_admin', 'created_at'],
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? '1' : '0'
  return `'${String(value).replace(/'/g, "''")}'`
}

function toSqlInsert(table, record) {
  const columns = BUSINESS_TABLES[table]
  const values = columns.map((column) => sqlValue(record?.[column]))
  return `INSERT INTO ${table}(${columns.join(', ')}) VALUES (${values.join(', ')});`
}

function toRecordComment(table, record) {
  return `-- TGCB_RECORD ${table} ${JSON.stringify(record)}`
}

function normalizeRecord(table, record) {
  const columns = BUSINESS_TABLES[table]
  return columns.reduce((acc, column) => {
    acc[column] = record?.[column] ?? null
    return acc
  }, {})
}

function buildDeleteStatements() {
  return [
    'DELETE FROM recent_convs;',
    'DELETE FROM messages;',
    'DELETE FROM whitelist;',
    'DELETE FROM users;',
    'DELETE FROM settings;',
    'DELETE FROM web_users;',
  ]
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(String(str || ''))
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function base64ToUtf8(payload) {
  const binary = atob(String(payload || ''))
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function bytesToBase64(bytes) {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function base64ToBytes(base64) {
  const binary = atob(String(base64 || ''))
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

async function deriveAesKey(password, salt) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(password || '')),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** 新版：纯二进制 AES-GCM 包（打开即乱码） */
async function encryptSqlPayloadBinary(rawSql, password) {
  if (!password) throw new Error('AES password is required')

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveAesKey(password, salt)
  const data = new TextEncoder().encode(String(rawSql || ''))
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
  const cipher = new Uint8Array(cipherBuffer)

  // header(6) + salt(16) + iv(12) + cipher
  const out = new Uint8Array(6 + 16 + 12 + cipher.length)
  out.set(TGCB_BIN_MAGIC, 0)
  out[4] = TGCB_BIN_VERSION
  out[5] = TGCB_BIN_FLAG_AES
  out.set(salt, 6)
  out.set(iv, 22)
  out.set(cipher, 34)
  return out
}

/** 旧版文本 AES 封装解密（兼容历史导出） */
async function decryptSqlPayloadAesText(wrappedSql, password) {
  if (!password) throw new Error('AES password is required for this SQL file')

  const payloadB64 = String(wrappedSql || '').trim().slice(TGCB_SQL_AES_PREFIX.length).trim()
  if (!payloadB64) throw new Error('Invalid AES SQL export payload')

  let payload
  try {
    payload = JSON.parse(base64ToUtf8(payloadB64))
  } catch {
    throw new Error('Invalid AES SQL payload format')
  }

  const salt = base64ToBytes(payload?.salt || '')
  const iv = base64ToBytes(payload?.iv || '')
  const data = base64ToBytes(payload?.data || '')

  const key = await deriveAesKey(password, salt)
  try {
    const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
    return new TextDecoder().decode(new Uint8Array(plainBuffer))
  } catch {
    throw new Error('Invalid AES password or corrupted SQL payload')
  }
}

async function decryptSqlPayloadBinary(bytes, password) {
  if (!password) throw new Error('AES password is required for this SQL file')
  if (!(bytes instanceof Uint8Array) || bytes.length < 34 + 16) {
    throw new Error('Invalid binary SQL export payload')
  }
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== TGCB_BIN_MAGIC[i]) throw new Error('Invalid binary SQL magic')
  }
  if (bytes[4] !== TGCB_BIN_VERSION) throw new Error('Unsupported binary SQL version')
  if (!(bytes[5] & TGCB_BIN_FLAG_AES)) throw new Error('Unsupported binary SQL flags')

  const salt = bytes.subarray(6, 22)
  const iv = bytes.subarray(22, 34)
  const data = bytes.subarray(34)
  const key = await deriveAesKey(password, salt)
  try {
    const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
    return new TextDecoder().decode(new Uint8Array(plainBuffer))
  } catch {
    throw new Error('Invalid AES password or corrupted SQL payload')
  }
}

function isBinaryTgcb(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 6) return false
  return bytes[0] === 0x54 && bytes[1] === 0x47 && bytes[2] === 0x43 && bytes[3] === 0x42
}

function decodeBase64WrappedSql(wrappedSql) {
  const payload = String(wrappedSql || '').trim().slice(TGCB_SQL_BASE64_PREFIX.length).trim()
  if (!payload) throw new Error('Invalid Base64 SQL export payload')
  return base64ToUtf8(payload)
}

/**
 * 解码导入载荷。
 * 支持：
 *  - 新版二进制 AES .db 包（Uint8Array 或 base64 字符串）
 *  - 旧版文本 AES / Base64 封装
 *  - 旧版明文 .sql（含 TGCB_RECORD 注释行）
 */
async function decodeSqlByMode(input, password = '') {
  // 二进制直接传入
  if (input instanceof Uint8Array) {
    if (isBinaryTgcb(input)) return decryptSqlPayloadBinary(input, password)
    // 尝试当 UTF-8 文本处理（旧版 .sql）
    input = new TextDecoder().decode(input)
  }

  const raw = String(input || '').trim()
  if (!raw) throw new Error('Empty SQL payload')

  // 可能是前端 base64 编码的二进制 .db 包
  if (!raw.startsWith(TGCB_SQL_AES_PREFIX) && !raw.startsWith(TGCB_SQL_BASE64_PREFIX) && !raw.includes('TGCB_RECORD') && !raw.startsWith('--') && !raw.startsWith('BEGIN')) {
    try {
      const bytes = base64ToBytes(raw.replace(/\s+/g, ''))
      if (isBinaryTgcb(bytes)) return decryptSqlPayloadBinary(bytes, password)
    } catch { /* not base64 binary */ }
  }

  if (raw.startsWith(TGCB_SQL_AES_PREFIX)) return decryptSqlPayloadAesText(raw, password)
  if (raw.startsWith(TGCB_SQL_BASE64_PREFIX)) return decodeBase64WrappedSql(raw)

  // 旧版明文 .sql（必须含 TGCB_RECORD，避免误导入任意 SQL）
  if (raw.includes('TGCB_RECORD') || raw.includes('-- TGCB_RECORD')) {
    return String(input || '')
  }

  throw new Error('Unsupported SQL format: use encrypted .db export, or a valid legacy SQL backup')
}

function buildPlainSqlFromRecords(records, activeDb) {
  const lines = [
    '-- Telegram_ChatBot Business Data SQL Export',
    `-- Source Storage: ${activeDb}`,
    '-- This file contains business data only and does not include WebUI login accounts.',
    'BEGIN TRANSACTION;',
    ...buildDeleteStatements(),
  ]

  for (const table of Object.keys(BUSINESS_TABLES)) {
    lines.push(`-- SECTION ${table}`)
    for (const record of records[table]) {
      lines.push(toRecordComment(table, record))
      lines.push(toSqlInsert(table, record))
    }
  }

  lines.push('COMMIT;')
  return lines.join('\n')
}

const DEFAULT_SECRET_SETTING_KEYS = [
  'BOT_TOKEN',
  'WEBHOOK_SECRET',
  'TURNSTILE_SECRET_KEY',
  'RECAPTCHA_SECRET_KEY',
  'RECAPTCHA_V3_SECRET_KEY',
  'HCAPTCHA_SECRET_KEY',
]

/**
 * 导出全量数据为加密二进制包（Uint8Array）。
 * 打开文件即为乱码。password 必填。
 * 默认包含：业务数据 + BOT_TOKEN 等密钥 + Web 登录账号（含密码哈希）。
 * options.includeSecrets / includeWebUsers 默认 true，仅显式 false 时排除。
 */
export async function exportBusinessDataSql(store, activeDb = 'kv', options = {}) {
  const password = String(options?.password || '')
  if (!password) throw new Error('AES password is required')

  const includeSecrets = options?.includeSecrets !== false
  const includeWebUsers = options?.includeWebUsers !== false
  const secretKeys = Array.isArray(options?.secretKeys) && options.secretKeys.length
    ? options.secretKeys
    : DEFAULT_SECRET_SETTING_KEYS
  const secretKeySet = new Set(secretKeys.map((k) => String(k)))

  const [settings, users, whitelist, messages, recentConvs, webUsers] = await Promise.all([
    store.getAllSettings(),
    store.getAllUsersRaw(),
    store.getWhitelistRaw(),
    store.getAllMsgsRaw(),
    store.getAllRecentRaw(),
    includeWebUsers && typeof store.getAllWebUsersRaw === 'function'
      ? store.getAllWebUsersRaw()
      : Promise.resolve([]),
  ])

  const settingsEntries = Object.entries(settings || {})
    .filter(([key]) => includeSecrets || !secretKeySet.has(String(key)))
    .map(([key, value]) => normalizeRecord('settings', { key, value }))

  const records = {
    settings: settingsEntries,
    users: (users || []).map((item) => normalizeRecord('users', item)),
    whitelist: (whitelist || []).map((item) => normalizeRecord('whitelist', item)),
    messages: (messages || []).map((item) => normalizeRecord('messages', item)),
    recent_convs: (recentConvs || []).map((item) => normalizeRecord('recent_convs', item)),
    web_users: includeWebUsers
      ? (webUsers || []).map((item) => normalizeRecord('web_users', item))
      : [],
  }

  const plainSql = buildPlainSqlFromRecords(records, activeDb)
  return encryptSqlPayloadBinary(plainSql, password)
}

/**
 * 解析导入载荷（二进制 Uint8Array / base64 字符串 / 旧版文本封装）。
 */
export async function parseBusinessSql(sqlInput, options = {}) {
  const decodedSql = await decodeSqlByMode(sqlInput, String(options?.password || ''))
  const records = {
    settings: [],
    users: [],
    whitelist: [],
    messages: [],
    recent_convs: [],
    web_users: [],
  }

  for (const line of String(decodedSql || '').split(/\r?\n/)) {
    const match = line.match(/^-- TGCB_RECORD ([a-z_]+) (.+)$/)
    if (!match) continue

    const [, table, payload] = match
    if (!Object.prototype.hasOwnProperty.call(records, table)) continue

    try {
      records[table].push(normalizeRecord(table, JSON.parse(payload)))
    } catch (error) {
      throw new Error(`Invalid SQL record payload for table "${table}": ${error.message}`)
    }
  }

  return records
}

async function restoreToKv(kvStore, records) {
  for (const item of records.settings) {
    await kvStore.setSetting(item.key, item.value ?? '')
  }

  for (const item of records.users) {
    await kvStore.kv.put(`user:${item.user_id}`, JSON.stringify(item))
    kvStore._cacheSet(`user:${item.user_id}`, item)
    if (item.username) await kvStore.kv.put(`username:${String(item.username).toLowerCase()}`, String(item.user_id))
    if (item.thread_id !== null && item.thread_id !== undefined && item.thread_id !== '') {
      await kvStore.kv.put(`thread:${item.thread_id}`, String(item.user_id))
    }
  }

  for (const item of records.whitelist) {
    await kvStore.kv.put(`whitelist:${item.user_id}`, JSON.stringify(item))
    kvStore._cacheSet(`whitelist:${item.user_id}`, JSON.stringify(item))
  }

  for (const item of records.messages) {
    await kvStore.kv.put(`msg:${item.user_id}:${item.id}`, JSON.stringify(item))
  }

  for (const item of records.recent_convs) {
    await kvStore.kv.put(`recent:${item.user_id}`, JSON.stringify(item))
  }

  // Web 后台账号（若备份中包含）
  for (const item of records.web_users || []) {
    if (!item?.id || !item?.username) continue
    const user = {
      id: item.id,
      username: item.username,
      password_hash: item.password_hash || '',
      totp_secret: item.totp_secret ?? null,
      totp_enabled: item.totp_enabled ? 1 : 0,
      is_admin: item.is_admin ? 1 : 0,
      created_at: item.created_at || new Date().toISOString(),
    }
    await kvStore.kv.put(`webuser:${String(user.username).toLowerCase()}`, JSON.stringify(user))
    await kvStore.kv.put(`webuser_id:${user.id}`, JSON.stringify(user))
  }
}

async function restoreToD1(d1Store, records) {
  await d1Store.initSchema()

  for (const item of records.settings) {
    await d1Store.exec('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', item.key, item.value ?? '')
  }

  for (const item of records.users) {
    await d1Store.exec(
      `INSERT OR REPLACE INTO users(user_id,username,first_name,last_name,language_code,thread_id,is_verified,is_blocked,is_permanent_block,block_reason,blocked_by,created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      item.user_id,
      item.username,
      item.first_name,
      item.last_name,
      item.language_code,
      item.thread_id,
      item.is_verified ?? 0,
      item.is_blocked ?? 0,
      item.is_permanent_block ?? 0,
      item.block_reason,
      item.blocked_by,
      item.created_at,
    )

    if (item.thread_id !== null && item.thread_id !== undefined && item.thread_id !== '') {
      await d1Store.exec('INSERT OR REPLACE INTO thread_map(thread_id,user_id) VALUES(?,?)', item.thread_id, item.user_id)
    }
  }

  for (const item of records.whitelist) {
    await d1Store.exec(
      'INSERT OR REPLACE INTO whitelist(user_id,reason,added_by,created_at) VALUES(?,?,?,?)',
      item.user_id,
      item.reason,
      item.added_by,
      item.created_at,
    )
  }

  for (const item of records.messages) {
    await d1Store.exec(
      `INSERT OR REPLACE INTO messages(id,user_id,direction,content,message_type,telegram_message_id,created_at)
       VALUES(?,?,?,?,?,?,?)`,
      item.id,
      item.user_id,
      item.direction,
      item.content,
      item.message_type,
      item.telegram_message_id,
      item.created_at,
    )
  }

  for (const item of records.recent_convs) {
    await d1Store.exec(
      'INSERT OR REPLACE INTO recent_convs(user_id,last_message,last_direction,last_at) VALUES(?,?,?,?)',
      item.user_id,
      item.last_message,
      item.last_direction,
      item.last_at,
    )
  }

  for (const item of records.web_users || []) {
    if (!item?.id || !item?.username) continue
    await d1Store.exec(
      `INSERT OR REPLACE INTO web_users(id,username,password_hash,totp_secret,totp_enabled,is_admin,created_at)
       VALUES(?,?,?,?,?,?,?)`,
      item.id,
      item.username,
      item.password_hash || '',
      item.totp_secret ?? null,
      item.totp_enabled ? 1 : 0,
      item.is_admin ? 1 : 0,
      item.created_at || new Date().toISOString(),
    )
  }
}

async function restoreToPostgres(hyperdriveStore, records) {
  await hyperdriveStore.initSchema()

  for (const item of records.settings) {
    await hyperdriveStore.exec(
      'INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',
      item.key, item.value ?? '',
    )
  }

  for (const item of records.users) {
    await hyperdriveStore.exec(
      `INSERT INTO users(user_id,username,first_name,last_name,language_code,thread_id,is_verified,is_blocked,is_permanent_block,block_reason,blocked_by,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT(user_id) DO UPDATE SET
         username=EXCLUDED.username,
         first_name=EXCLUDED.first_name,
         last_name=EXCLUDED.last_name,
         language_code=EXCLUDED.language_code,
         thread_id=EXCLUDED.thread_id,
         is_verified=EXCLUDED.is_verified,
         is_blocked=EXCLUDED.is_blocked,
         is_permanent_block=EXCLUDED.is_permanent_block,
         block_reason=EXCLUDED.block_reason,
         blocked_by=EXCLUDED.blocked_by,
         created_at=EXCLUDED.created_at`,
      item.user_id, item.username, item.first_name, item.last_name,
      item.language_code, item.thread_id, item.is_verified ?? 0,
      item.is_blocked ?? 0, item.is_permanent_block ?? 0,
      item.block_reason, item.blocked_by, item.created_at,
    )

    if (item.thread_id !== null && item.thread_id !== undefined && item.thread_id !== '') {
      await hyperdriveStore.exec(
        'INSERT INTO thread_map(thread_id,user_id) VALUES($1,$2) ON CONFLICT(thread_id) DO UPDATE SET user_id=EXCLUDED.user_id',
        item.thread_id, item.user_id,
      )
    }
  }

  for (const item of records.whitelist) {
    await hyperdriveStore.exec(
      'INSERT INTO whitelist(user_id,reason,added_by,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET reason=EXCLUDED.reason,added_by=EXCLUDED.added_by,created_at=EXCLUDED.created_at',
      item.user_id, item.reason, item.added_by, item.created_at,
    )
  }

  for (const item of records.messages) {
    await hyperdriveStore.exec(
      `INSERT INTO messages(id,user_id,direction,content,message_type,telegram_message_id,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING`,
      item.id, item.user_id, item.direction, item.content,
      item.message_type, item.telegram_message_id, item.created_at,
    )
  }

  for (const item of records.recent_convs) {
    await hyperdriveStore.exec(
      'INSERT INTO recent_convs(user_id,last_message,last_direction,last_at) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET last_message=EXCLUDED.last_message,last_direction=EXCLUDED.last_direction,last_at=EXCLUDED.last_at',
      item.user_id, item.last_message, item.last_direction, item.last_at,
    )
  }

  for (const item of records.web_users || []) {
    if (!item?.id || !item?.username) continue
    await hyperdriveStore.exec(
      `INSERT INTO web_users(id,username,password_hash,totp_secret,totp_enabled,is_admin,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(id) DO UPDATE SET
         username=EXCLUDED.username,
         password_hash=EXCLUDED.password_hash,
         totp_secret=EXCLUDED.totp_secret,
         totp_enabled=EXCLUDED.totp_enabled,
         is_admin=EXCLUDED.is_admin,
         created_at=EXCLUDED.created_at`,
      item.id,
      item.username,
      item.password_hash || '',
      item.totp_secret ?? null,
      item.totp_enabled ? 1 : 0,
      item.is_admin ? 1 : 0,
      item.created_at || new Date().toISOString(),
    )
  }
}

/** 从当前 store 快照业务数据（用于导入失败回滚） */
export async function snapshotBusinessRecords(store) {
  const [settings, users, whitelist, messages, recentConvs, webUsers] = await Promise.all([
    store.getAllSettings(),
    store.getAllUsersRaw(),
    store.getWhitelistRaw(),
    store.getAllMsgsRaw(),
    store.getAllRecentRaw(),
    typeof store.getAllWebUsersRaw === 'function' ? store.getAllWebUsersRaw() : Promise.resolve([]),
  ])
  return {
    settings: Object.entries(settings || {}).map(([key, value]) => normalizeRecord('settings', { key, value })),
    users: (users || []).map((item) => normalizeRecord('users', item)),
    whitelist: (whitelist || []).map((item) => normalizeRecord('whitelist', item)),
    messages: (messages || []).map((item) => normalizeRecord('messages', item)),
    recent_convs: (recentConvs || []).map((item) => normalizeRecord('recent_convs', item)),
    web_users: (webUsers || []).map((item) => normalizeRecord('web_users', item)),
  }
}

async function restoreRecordsToTarget(target, records, { kvStore, d1Store, hyperdriveStore }) {
  if (target === 'hyperdrive') {
    if (!hyperdriveStore) throw new Error('Hyperdrive store is not available')
    await restoreToPostgres(hyperdriveStore, records)
    return
  }
  if (target === 'd1') {
    if (!d1Store) throw new Error('D1 store is not available')
    await restoreToD1(d1Store, records)
    return
  }
  if (!kvStore) throw new Error('KV store is not available')
  await restoreToKv(kvStore, records)
}

/**
 * 导入业务数据：先完整解析，再清空并写入；失败时从快照回滚。
 * clearFn 可选：异步清空业务数据（保留 web users）。
 */
export async function importBusinessDataSql({
  sqlText,
  target,
  kvStore,
  d1Store,
  hyperdriveStore,
  password = '',
  clearFn = null,
  snapshotStore = null,
}) {
  const records = await parseBusinessSql(sqlText, { password })
  const hasAnyRecord = Object.values(records).some((items) => items.length > 0)

  if (!hasAnyRecord) {
    throw new Error('SQL file does not contain any importable TGCB business records')
  }

  // 导入前快照，失败可回滚（避免“先清空再导入”中途失败丢库）
  let backup = null
  if (snapshotStore && typeof snapshotStore.getAllSettings === 'function') {
    try {
      backup = await snapshotBusinessRecords(snapshotStore)
    } catch (e) {
      console.error('[import] snapshot failed, continue without rollback:', e?.message || e)
    }
  }

  const stores = { kvStore, d1Store, hyperdriveStore }

  try {
    if (typeof clearFn === 'function') {
      await clearFn()
    }
    await restoreRecordsToTarget(target, records, stores)
  } catch (err) {
    if (backup) {
      try {
        if (typeof clearFn === 'function') await clearFn()
        await restoreRecordsToTarget(target, backup, stores)
        console.error('[import] restored from pre-import snapshot after failure')
      } catch (rollbackErr) {
        console.error('[import] rollback also failed:', rollbackErr?.message || rollbackErr)
      }
    }
    throw err
  }
}
