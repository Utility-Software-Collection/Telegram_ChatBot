// 全局轻提示 Toast
import { reactive } from 'vue'

let seq = 0
const state = reactive({
  items: [], // { id, type, message, leaving }
})

const DEFAULT_TTL = 3200

function remove(id) {
  const idx = state.items.findIndex((item) => item.id === id)
  if (idx < 0) return
  state.items[idx].leaving = true
  setTimeout(() => {
    const i = state.items.findIndex((item) => item.id === id)
    if (i >= 0) state.items.splice(i, 1)
  }, 180)
}

function push(type, message, ttl = DEFAULT_TTL) {
  const text = String(message || '').trim()
  if (!text) return null
  const id = ++seq
  state.items.push({ id, type, message: text, leaving: false })
  if (ttl > 0) {
    setTimeout(() => remove(id), ttl)
  }
  // 最多保留 4 条
  while (state.items.length > 4) {
    const oldest = state.items[0]
    if (oldest) remove(oldest.id)
    else break
  }
  return id
}

export function useToast() {
  return {
    state,
    success(message, ttl) { return push('success', message, ttl) },
    error(message, ttl) { return push('error', message, ttl) },
    info(message, ttl) { return push('info', message, ttl) },
    warn(message, ttl) { return push('warn', message, ttl) },
    dismiss: remove,
  }
}

export default useToast
