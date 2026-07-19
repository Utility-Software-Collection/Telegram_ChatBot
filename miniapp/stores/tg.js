// Telegram 用户信息缓存：缓存 initDataUnsafe.user 与规范化后的 locale
// - 仅在 SDK 可用时填充，非 Telegram 环境提供空对象，避免组件判空爆炸
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { normalizeLocale } from '@shared/i18n.js'
import { useTelegram } from '../composables/useTelegram.js'

export const useTgStore = defineStore('tg', () => {
  const tg = useTelegram()
  const user = ref(tg.initDataUnsafe?.user || null)
  const chat = ref(tg.initDataUnsafe?.chat || null)
  const chatType = ref(tg.initDataUnsafe?.chat_type || '')
  const chatInstance = ref(tg.initDataUnsafe?.chat_instance || '')
  const startParam = ref(tg.initDataUnsafe?.start_param || '')

  const locale = computed(() => normalizeLocale(user.value?.language_code || 'zh-hans'))
  const displayName = computed(() => {
    const u = user.value || {}
    return u.first_name
      ? [u.first_name, u.last_name].filter(Boolean).join(' ')
      : (u.username ? '@' + u.username : '')
  })
  const initials = computed(() => {
    const u = user.value || {}
    const name = u.first_name || u.username || ''
    return (name[0] || '').toUpperCase()
  })

  return { user, chat, chatType, chatInstance, startParam, locale, displayName, initials }
})
