// Mini App i18n store：复用 shared/i18n 的 createT/normalizeLocale
// - 默认中文；locale 来源：sessionStorage > Telegram user.language_code > zh-hans
// - 切换语言后同步 X-Locale 头（http 运行时读取 sessionStorage）
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { createT, normalizeLocale, SUPPORTED_LOCALES, DEFAULT_LOCALE } from '@shared/i18n.js'
import { useTelegram } from '../composables/useTelegram.js'

const STORAGE_KEY = 'miniapp_locale'

function docLang(locale) {
  if (locale === 'zh-hant') return 'zh-TW'
  if (locale === 'en') return 'en'
  return 'zh-CN'
}

function resolveInitialLocale() {
  const stored = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)
  if (stored) return normalizeLocale(stored)
  // telegram-web-app.js 在 <head> 同步加载，此时可读 language_code
  let code = ''
  try { code = (window.Telegram?.WebApp?.initDataUnsafe?.user || {}).language_code || '' } catch {}
  return normalizeLocale(code || DEFAULT_LOCALE)
}

export const useI18nStore = defineStore('i18n', () => {
  const locale = ref(resolveInitialLocale())
  const translator = computed(() => createT(locale.value))

  const localeOptions = computed(() => SUPPORTED_LOCALES)

  function setLocale(next) {
    locale.value = normalizeLocale(next)
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, locale.value)
    if (typeof document !== 'undefined') document.documentElement.lang = docLang(locale.value)
  }

  function t(key, paramsOrFallback = '', fallback = '') {
    return translator.value(key, paramsOrFallback, fallback)
  }

  // 首次同步 <html lang>
  if (typeof document !== 'undefined') document.documentElement.lang = docLang(locale.value)

  return { locale, localeOptions, setLocale, t }
})
