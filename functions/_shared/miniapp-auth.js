// functions/_shared/miniapp-auth.js
// Telegram Mini App 鉴权工具：initData 验签 + KV 会话管理。
// 不依赖 auth.js 的私有函数；timingSafeEqualStr 在本文件内联，避免改动 auth.js。
import { genToken } from './auth.js';

/** 字节转十六进制字符串 */
function toHex(buf) {
  return Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2, '0')).join('');
}

/** 恒定时间字符串比较，降低时序侧信道风险（与 auth.js 内同名实现一致） */
function timingSafeEqualStr(a, b) {
  const sa = String(a || '');
  const sb = String(b || '');
  const len = Math.max(sa.length, sb.length);
  let diff = sa.length ^ sb.length;
  for (let i = 0; i < len; i++) {
    diff |= (sa.charCodeAt(i) || 0) ^ (sb.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** 解析 ADMIN_IDS 配置字符串为数字数组 */
function parseAdminIds(str) {
  return String(str || '')
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isFinite(n));
}

/**
 * 校验 Telegram Mini App initData 签名 + auth_date 新鲜度。
 * 算法详见 https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * 步骤：
 *  1. 用 URLSearchParams 解析 initData，取出并移除 hash
 *  2. data-check-string = 其余参数按 key 字典序排序后 `key=value` 用 \n 连接
 *  3. secretKey = HMAC_SHA256(key="WebAppData", msg=botToken)
 *  4. calcHash   = HMAC_SHA256(key=secretKey, msg=data-check-string) 的十六进制
 *  5. 恒定时间比较 hash === calcHash，并校验 auth_date 在 maxAgeSec 内
 *
 * @param {string} initData Telegram 传入的 initData 原始字符串
 * @param {string} botToken Bot Token
 * @param {number} maxAgeSec auth_date 最大允许年龄（秒），默认 3600
 * @returns {Promise<{user: object, authDate: number}|null>} 校验通过返回用户信息，否则 null
 */
export async function verifyInitData(initData, botToken, maxAgeSec = 3600) {
  try {
    if (!initData || typeof initData !== 'string') return null;
    if (!botToken || typeof botToken !== 'string') return null;

    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    // data-check-string：按 key 字典序排序（Telegram 要求按参数名字节序排序）
    const dataCheckString = [...params]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const enc = new TextEncoder();
    // 第一层：以 "WebAppData" 为密钥对 botToken 做 HMAC，得到会话密钥
    // 注意：WebCrypto sign 标准签名为 sign(algorithm, key, data)，HMAC 需显式传 'HMAC' 算法
    const secretKey = await crypto.subtle.importKey(
      'raw',
      enc.encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const secretBuf = await crypto.subtle.sign('HMAC', secretKey, enc.encode(botToken));

    // 第二层：以会话密钥对 data-check-string 做 HMAC，得到待比对哈希
    const hmacKey = await crypto.subtle.importKey(
      'raw',
      secretBuf,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const calcBuf = await crypto.subtle.sign('HMAC', hmacKey, enc.encode(dataCheckString));
    const calcHash = toHex(calcBuf);

    // auth_date 新鲜度：防止重放
    const authDate = parseInt(params.get('auth_date'), 10);
    const now = Math.floor(Date.now() / 1000);
    // auth_date 新鲜度：防止重放；同时拒绝过大未来值（防御纵深，签名已覆盖不可利用）
    const fresh = Number.isFinite(authDate) && authDate > 0 && (now - authDate) <= maxAgeSec && authDate <= now + 30;

    // 签名与新鲜度同时满足才算通过（恒定时间比较降低时序泄漏）
    if (!timingSafeEqualStr(hash, calcHash) || !fresh) return null;

    let user = {};
    try {
      user = JSON.parse(params.get('user') || '{}');
    } catch {
      user = {};
    }
    return { user, authDate };
  } catch {
    // 任何异常一律视为校验失败，不向调用方抛出
    return null;
  }
}

/**
 * 创建 Mini App 会话并写入 KV。
 * 注意：会话 JSON 仅 { tgUserId, exp }；isAdmin 不持久化，由 requireMiniAppAuth 每次请求重读 ADMIN_IDS 判定，避免配置变更后会话态过期。
 * 入参 isAdmin 保留以兼容调用方语义，仅用于日志。
 */
export async function createMiniAppSession(kv, tgUserId, isAdmin, ttlSec) {
  const ttl = Math.max(300, parseInt(ttlSec, 10) || 86400);
  const token = genToken();
  const sessionData = { tgUserId, exp: Date.now() + ttl * 1000 };
  await kv.put(`miniapp_sess:${token}`, JSON.stringify(sessionData), { expirationTtl: ttl });
  // 用户维度索引，便于后续按用户吊销全部会话
  await kv.put(`miniapp_sess_user:${tgUserId}:${token}`, '1', { expirationTtl: ttl }).catch(() => {});
  return token;
}

/** 读取并校验会话过期；过期则清理并返回 null */
export async function getMiniAppSession(kv, token) {
  if (!token) return null;
  const raw = await kv.get(`miniapp_sess:${token}`);
  if (!raw) return null;
  let s;
  try { s = JSON.parse(raw); } catch { return null; }
  if (!s || s.tgUserId == null) return null;
  if (Date.now() > s.exp) {
    await kv.delete(`miniapp_sess:${token}`).catch(() => {});
    await kv.delete(`miniapp_sess_user:${s.tgUserId}:${token}`).catch(() => {});
    return null;
  }
  return s;
}

/** 删除会话与索引 */
export async function delMiniAppSession(kv, token) {
  if (!token) return;
  const raw = await kv.get(`miniapp_sess:${token}`).catch(() => null);
  await kv.delete(`miniapp_sess:${token}`).catch(() => {});
  if (raw) {
    try {
      const s = JSON.parse(raw);
      if (s?.tgUserId != null) {
        await kv.delete(`miniapp_sess_user:${s.tgUserId}:${token}`).catch(() => {});
      }
    } catch { /* noop */ }
  }
}

/** 从 Authorization: Bearer <token> 提取 token（Mini App 仅用 Bearer，不用 Cookie） */
export function extractMiniAppToken(req) {
  const auth = req.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return null;
}

/**
 * 校验 Mini App 会话；每次请求重读 ADMIN_IDS 判定最新 isAdmin。
 * @returns {Promise<{session: object, tgUserId: number, isAdmin: boolean}|null>}
 */
export async function requireMiniAppAuth(req, kv, db) {
  const token = extractMiniAppToken(req);
  if (!token) return null;
  const session = await getMiniAppSession(kv, token);
  if (!session) return null;
  // 每次请求重读 ADMIN_IDS，确保配置变更立即生效
  const adminIdsRaw = await db.getSetting('ADMIN_IDS').catch(() => '');
  const adminIds = parseAdminIds(adminIdsRaw);
  const isAdmin = adminIds.includes(Number(session.tgUserId));
  return { session, tgUserId: session.tgUserId, isAdmin };
}

/**
 * 要求 Mini App 管理员会话；无会话或非管理员均返回 null。
 * 调用方需自行区分 401（未登录/会话失效）与 403（非管理员）：先调 requireMiniAppAuth 判 401，再判 isAdmin。
 */
export async function requireMiniAppAdmin(req, kv, db) {
  const auth = await requireMiniAppAuth(req, kv, db);
  if (!auth) return null;
  if (!auth.isAdmin) return null;
  return auth;
}
