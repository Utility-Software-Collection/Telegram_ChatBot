// 声明式管理 Telegram MainButton
// - 组件 setup 调用 useMainButton(getConfig)，getConfig 返回 { text, onClick, enabled }
// - getConfig 可读响应式 ref，变化时自动刷新按钮
// - 不在 onUnmounted 隐藏：路由 afterEach 统一隐藏，避免旧页卸载时覆盖新页按钮（Transition 场景竞态）
import { watch, unref } from 'vue'
import { useTelegram } from './useTelegram.js'

export function useMainButton(getConfig) {
  const tg = useTelegram()

  function apply(cfg) {
    if (!cfg || !cfg.text) { tg.hideMainButton(); return }
    tg.mainButton({
      text: unref(cfg.text),
      onClick: typeof cfg.onClick === 'function' ? cfg.onClick : null,
      enabled: unref(cfg.enabled) !== false,
    })
  }

  if (typeof getConfig === 'function') {
    // deep：跟踪返回对象内嵌套的 ref
    watch(getConfig, (cfg) => apply(cfg), { immediate: true, deep: true })
  } else {
    apply(getConfig)
  }

  return {
    update: () => apply(typeof getConfig === 'function' ? getConfig() : getConfig),
    hide: () => tg.hideMainButton(),
  }
}
