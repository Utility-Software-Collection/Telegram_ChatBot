// Mini App 鉴权 store
// - token: 内存 + sessionStorage（Bearer 鉴权，不依赖 Cookie）
// - ensureBooted(): 单飞启动；读取 initData -> 登录或复用 token 校验
// - handleUnauthorized(): 401 时清 token 并重新登录
// - 注册 http 访问器，让 http.js 读取 token / 触发重登
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { http, setAuthAccessor } from '../utils/http.js'
import { useTelegram } from '../composables/useTelegram.js'
import { createT, normalizeLocale } from '@shared/i18n.js'

const TOKEN_KEY = 'miniapp_token'

function tr(key) {
  let code = 'zh-hans'
  try { code = localStorage.getItem('miniapp_locale') || normalizeLocale(window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || 'zh-hans') } catch {}
  return createT(code)(key)
}

export const useAuthStore = defineStore('auth', () => {
  const tg = useTelegram()

  const token = ref(typeof sessionStorage !== 'undefined' ? (sessionStorage.getItem(TOKEN_KEY) || '') : '')
  const user = ref(null)
  const isAdmin = ref(false)
  // /me 返回的完整状态（供 Home/Status 复用）
  const me = ref(null)
  const bootDone = ref(false)
  const bootError = ref('') // 用户可见错误（非堆栈）

  let bootPromise = null

  const isLoggedIn = computed(() => !!token.value && !!user.value)

  function persistToken(t) {
    token.value = t || ''
    try {
      if (t) sessionStorage.setItem(TOKEN_KEY, t)
      else sessionStorage.removeItem(TOKEN_KEY)
    } catch { /* sessionStorage 不可用时仅内存态 */ }
  }

  async function login(initData) {
    const data = await http.post('/auth/login', { initData })
    if (!data?.token) throw new Error(tr('miniapp.ui.app.authFailed'))
    persistToken(data.token)
    user.value = data.user || null
    isAdmin.value = !!data.isAdmin
    return data
  }

  async function fetchMe() {
    const data = await http.get('/me')
    user.value = data.user || user.value
    isAdmin.value = !!data.isAdmin
    me.value = data
    return data
  }

  /** 启动鉴权：单飞，App.vue 与 router.beforeEach 共享同一 Promise */
  function ensureBooted() {
    if (bootDone.value) return Promise.resolve()
    if (bootPromise) return bootPromise
    bootPromise = (async () => {
      try {
        // 清空上次错误，避免重试后残留
        bootError.value = ''
        const initData = tg.initData
        if (!initData) {
          // 非 Telegram 环境：展示降级提示，不抛错
          bootError.value = tr('miniapp.ui.app.openInTelegram')
          bootDone.value = true
          return
        }
        // 已有 token：先校验，失败则重新登录
        if (token.value) {
          try {
            await fetchMe()
            bootDone.value = true
            return
          } catch (e) {
            // token 失效，清理后走重新登录
            persistToken('')
            me.value = null
          }
        }
        await login(initData)
        // 登录后立即拉取详细状态
        try { await fetchMe() } catch { /* /me 失败不阻断登录态 */ }
        bootDone.value = true
      } catch (e) {
        // 401=验签失败 -> 提示重开；其它 -> 通用错误
        bootError.value = e?.status === 401
          ? tr('miniapp.ui.app.authFailed')
          : (e?.message || tr('miniapp.ui.error.unknown'))
        bootDone.value = true
      } finally {
        bootPromise = null
      }
    })()
    return bootPromise
  }

  /** 401 处理：清 token、重置启动态，触发重新登录 */
  function handleUnauthorized() {
    persistToken('')
    user.value = null
    me.value = null
    bootDone.value = false
    bootError.value = ''
    // 重新启动（若 initData 仍在则自动重新登录）
    ensureBooted()
  }

  function logout() {
    persistToken('')
    user.value = null
    isAdmin.value = false
    me.value = null
    bootDone.value = false
    bootError.value = ''
  }

  return {
    token, user, isAdmin, me, isLoggedIn,
    bootDone, bootError,
    ensureBooted, login, fetchMe, handleUnauthorized, logout,
  }
})

// 注册 http 访问器：http.js 通过它读取当前 store 实例（token / handleUnauthorized）
// Pinia 在 main.js use(pinia) 后激活，request 运行时调用安全
setAuthAccessor(() => useAuthStore())
