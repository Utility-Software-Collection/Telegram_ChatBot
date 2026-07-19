// scripts/test-miniapp-auth.mjs
// 自测：verifyInitData 验签 + Mini App 会话增删查过期。
// 独立实现 Telegram WebApp data 验签算法生成合法 initData，交叉校验 miniapp-auth.js。
// 运行：node scripts/test-miniapp-auth.mjs
import assert from 'node:assert';
import {
  verifyInitData,
  createMiniAppSession,
  getMiniAppSession,
  delMiniAppSession,
} from '../functions/_shared/miniapp-auth.js';

const enc = new TextEncoder();

function toHex(buf) {
  return Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2, '0')).join('');
}

// 独立实现 Telegram 数据校验哈希（与 verifyInitData 内部算法一致，用于交叉验证）
async function computeHash(paramsObj, botToken) {
  const dcs = Object.keys(paramsObj).sort().map(k => `${k}=${paramsObj[k]}`).join('\n');
  const secretKey = await crypto.subtle.importKey(
    'raw', enc.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const secret = await crypto.subtle.sign('HMAC', secretKey, enc.encode(botToken));
  const hmacKey = await crypto.subtle.importKey(
    'raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', hmacKey, enc.encode(dcs)));
}

// 构造合法 initData
async function buildInitData(botToken, { authDate } = {}) {
  const userObj = {
    id: 123456789,
    first_name: 'Test',
    last_name: 'User',
    username: 'testuser',
    language_code: 'en',
    is_premium: true,
  };
  const paramsObj = {
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    user: JSON.stringify(userObj),
    auth_date: String(authDate ?? Math.floor(Date.now() / 1000)),
  };
  const hash = await computeHash(paramsObj, botToken);
  return new URLSearchParams({ ...paramsObj, hash }).toString();
}

// 基于 Map 的 KV mock
function makeMockKv() {
  const store = new Map();
  return {
    store,
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); },
    async delete(k) { store.delete(k); },
    async list() { return { keys: [], list_complete: true }; },
  };
}

const results = [];
function test(name, fn) {
  results.push((async () => {
    try { await fn(); console.log(`  ✓ ${name}`); return true; }
    catch (e) { console.error(`  ✗ ${name}\n    ${e?.stack || e}`); return false; }
  })());
}

const BOT_TOKEN = '1234567890:TEST-bot-token-for-miniapp-auth';

// ── verifyInitData ──────────────────────────────────────────────
test('合法 initData 验签通过，返回 user', async () => {
  const initData = await buildInitData(BOT_TOKEN);
  const r = await verifyInitData(initData, BOT_TOKEN, 3600);
  assert.ok(r, '应返回非空结果');
  assert.strictEqual(r.user.id, 123456789);
  assert.strictEqual(r.user.first_name, 'Test');
  assert.strictEqual(r.user.is_premium, true);
  assert.ok(Number.isFinite(r.authDate), '应返回 authDate');
});

test('篡改 hash 返回 null', async () => {
  const initData = await buildInitData(BOT_TOKEN);
  // 把 hash 最后一位翻转
  const tampered = initData.replace(/hash=([0-9a-f]+)$/, (_, h) => {
    const last = h.slice(-1);
    const flipped = last === '0' ? '1' : '0';
    return 'hash=' + h.slice(0, -1) + flipped;
  });
  const r = await verifyInitData(tampered, BOT_TOKEN, 3600);
  assert.strictEqual(r, null, '篡改 hash 必须校验失败');
});

test('过期 auth_date 返回 null', async () => {
  const initData = await buildInitData(BOT_TOKEN, { authDate: Math.floor(Date.now() / 1000) - 7200 });
  const r = await verifyInitData(initData, BOT_TOKEN, 3600);
  assert.strictEqual(r, null, '超过 maxAgeSec 必须失败');
});

test('错误的 botToken 返回 null', async () => {
  const initData = await buildInitData(BOT_TOKEN);
  const r = await verifyInitData(initData, '9999:wrong-token', 3600);
  assert.strictEqual(r, null, 'token 不匹配必须失败');
});

test('缺 hash 返回 null', async () => {
  const r = await verifyInitData('query_id=x&auth_date=1&user=%7B%7D', BOT_TOKEN, 3600);
  assert.strictEqual(r, null);
});

test('空 / 非字符串 initData 返回 null', async () => {
  assert.strictEqual(await verifyInitData('', BOT_TOKEN), null);
  assert.strictEqual(await verifyInitData(null, BOT_TOKEN), null);
  assert.strictEqual(await verifyInitData('x', ''), null);
});

// ── 会话增删查过期 ──────────────────────────────────────────────
test('会话创建与读取往返一致', async () => {
  const kv = makeMockKv();
  const token = await createMiniAppSession(kv, 123456789, false, 3600);
  assert.ok(token && token.length >= 32, 'token 应足够长');
  const sess = await getMiniAppSession(kv, token);
  assert.ok(sess, '应能读到会话');
  assert.strictEqual(sess.tgUserId, 123456789);
  assert.ok(sess.exp > Date.now(), 'exp 应在未来');
  // 索引键应存在
  assert.strictEqual(kv.store.get(`miniapp_sess_user:123456789:${token}`), '1');
});

test('过期会话返回 null 并清理', async () => {
  const kv = makeMockKv();
  const token = 'fixed-expired-token';
  // 直接写入一条已过期的会话
  kv.store.set(`miniapp_sess:${token}`, JSON.stringify({ tgUserId: 999, exp: Date.now() - 1000 }));
  kv.store.set(`miniapp_sess_user:999:${token}`, '1');
  const sess = await getMiniAppSession(kv, token);
  assert.strictEqual(sess, null, '过期会话应返回 null');
  assert.ok(!kv.store.has(`miniapp_sess:${token}`), '应删除会话键');
  assert.ok(!kv.store.has(`miniapp_sess_user:999:${token}`), '应删除索引键');
});

test('delMiniAppSession 删除会话与索引', async () => {
  const kv = makeMockKv();
  const token = await createMiniAppSession(kv, 888, true, 3600);
  await delMiniAppSession(kv, token);
  assert.strictEqual(await getMiniAppSession(kv, token), null);
  assert.ok(!kv.store.has(`miniapp_sess:${token}`));
  assert.ok(!kv.store.has(`miniapp_sess_user:888:${token}`));
});

test('getMiniAppSession 无 token 返回 null', async () => {
  const kv = makeMockKv();
  assert.strictEqual(await getMiniAppSession(kv, ''), null);
  assert.strictEqual(await getMiniAppSession(kv, 'nonexistent'), null);
});

// 运行
const all = await Promise.all(results);
const passed = all.filter(Boolean).length;
console.log(`\n${passed}/${all.length} 通过`);
if (passed !== all.length) process.exit(1);
