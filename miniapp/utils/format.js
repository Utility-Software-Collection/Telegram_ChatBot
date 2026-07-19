// Mini App 通用格式化与 i18n 文案辅助
import { createT, normalizeLocale } from '@shared/i18n.js'

/** 当前 locale 的 t 函数（供非组件场景使用） */
export function tt() {
  let code = 'zh-hans'
  try {
    code = localStorage.getItem('miniapp_locale')
      || normalizeLocale(window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || 'zh-hans')
  } catch {}
  return createT(code)
}

/** 相对时间格式化：刚刚 / Nm / Nh / MM-DD */
export function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  if (diff < 60000) {
    // 1 分钟内显示具体时分
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 绝对时间：HH:mm（当天）或 MM-DD HH:mm */
export function formatDateTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (sameDay) return hm
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`
}

/** 安全取用户显示名 */
export function userDisplayName(u) {
  if (!u) return ''
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || (u.username ? '@' + u.username : String(u.id || ''))
}
