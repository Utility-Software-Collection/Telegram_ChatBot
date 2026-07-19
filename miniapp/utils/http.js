// Mini App HTTP 封装
// - 自动带 Authorization: Bearer <token>（从 auth store 读，通过访问器避免循环依赖）
// - 自动带 X-Locale 头
// - 401 触发 auth 重新登录；统一错误为 HttpError，不暴露内部堆栈
// - readJsonSafe 复用 Web 端实现，避免空 body/HTML 触发解析异常
import { createT, normalizeLocale } from '@shared/i18n.js'

/** 安全解析 Response JSON，空 body / 非 JSON 时返回 fallback */
export async function readJsonSafe(response, fallback = null) {
  if (!response) return fallback
  let text = ''
  try { text = await response.text() } catch { return fallback }
  if (!text || !String(text).trim()) return fallback
  try { return JSON.parse(text) } catch { return fallback }
}

export class HttpError extends Error {
  constructor(status, message, payload = null) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.payload = payload
  }
}

const BASE = '/api/miniapp'

// auth store 访问器：由 auth store 注册，避免 http <-> auth 循环依赖
let _authAccessor = null
export function setAuthAccessor(fn) { _authAccessor = fn }

function currentLocale() {
  // 优先 sessionStorage（用户切换后即时生效），回退 Telegram 用户语言
  const stored = typeof localStorage !== 'undefined' && localStorage.getItem('miniapp_locale')
  if (stored) return normalizeLocale(stored)
  let code = ''
  try { code = (window.Telegram?.WebApp?.initDataUnsafe?.user || {}).language_code || '' } catch {}
  return normalizeLocale(code || 'zh-hans')
}

function tr(key) {
  return createT(currentLocale())(key)
}

function buildUrl(path, query) {
  let url = path.startsWith('http') ? path : BASE + path
  if (query && Object.keys(query).length) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue
      qs.append(k, String(v))
    }
    url += (url.includes('?') ? '&' : '?') + qs.toString()
  }
  return url
}

async function request(method, path, { body, query } = {}) {
  const url = buildUrl(path, query)
  const headers = { 'Content-Type': 'application/json', 'X-Locale': currentLocale() }

  // 从 auth store 读 token
  const auth = _authAccessor ? _authAccessor() : null
  if (auth?.token) headers.Authorization = `Bearer ${auth.token}`

  let res
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    // 网络异常：不暴露内部错误细节
    throw new HttpError(0, tr('miniapp.ui.error.network'))
  }

  if (res.status === 401) {
    // token 失效：清 token 并触发重新登录
    auth?.handleUnauthorized?.()
    throw new HttpError(401, tr('miniapp.ui.error.unauthorized'))
  }

  const data = await readJsonSafe(res, null)

  if (!res.ok) {
    // 用户可见错误：优先用后端返回的 error 文案，兜底通用提示
    const msg = data?.error || tr('miniapp.ui.error.request')
    throw new HttpError(res.status, msg, data)
  }

  return data
}

export const http = {
  get: (path, opts) => request('GET', path, opts || {}),
  post: (path, body, opts) => request('POST', path, { body, ...(opts || {}) }),
  put: (path, body, opts) => request('PUT', path, { body, ...(opts || {}) }),
  del: (path, opts) => request('DELETE', path, opts || {}),
}

export default http
