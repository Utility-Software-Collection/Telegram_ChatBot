// Telegram 主题同步：themeParams -> CSS 变量 + Vuetify 主题切换
// - 必须在组件 setup 内调用（内部 useVuetifyTheme 依赖 inject）
// - 监听 themeChanged/viewportChanged 事件实时刷新
import { useTheme as useVuetifyTheme } from 'vuetify'
import { useTelegram } from './useTelegram'
import { THEME_NAMES } from '../plugins/vuetify'

// Telegram themeParams(snake_case HEX) -> CSS 变量映射
const THEME_PARAM_TO_CSS = {
  bg_color: '--tg-theme-bg-color',
  text_color: '--tg-theme-text-color',
  hint_color: '--tg-theme-hint-color',
  link_color: '--tg-theme-link-color',
  button_color: '--tg-theme-button-color',
  button_text_color: '--tg-theme-button-text-color',
  secondary_bg_color: '--tg-theme-secondary-bg-color',
  section_bg_color: '--tg-theme-section-bg-color',
  section_header_text_color: '--tg-theme-section-header-text-color',
  subtitle_text_color: '--tg-theme-subtitle-text-color',
  accent_text_color: '--tg-theme-accent-text-color',
  destructive_text_color: '--tg-theme-destructive-text-color',
  header_bg_color: '--tg-theme-header-bg-color',
  bottom_bar_bg_color: '--tg-theme-bottom-bar-bg-color',
}

const THEME_FALLBACKS = {
  bg_color: '#ffffff', text_color: '#000000', hint_color: '#595959', link_color: '#1d5f99',
  button_color: '#1d5f99', button_text_color: '#ffffff', secondary_bg_color: '#f4f4f5',
  section_bg_color: '#ffffff', section_header_text_color: '#1d5f99', subtitle_text_color: '#4b5563',
  accent_text_color: '#1d5f99', destructive_text_color: '#b91c1c', header_bg_color: '#ffffff',
  bottom_bar_bg_color: '#ffffff',
}

export function useTheme() {
  // 在 setup 内获取 Vuetify 主题实例，供回调复用
  const vTheme = useVuetifyTheme()
  const tg = useTelegram()
  let offTheme = null
  let offViewport = null

  function apply() {
    const root = document.documentElement
    const params = tg.themeParams || {}
    const dark = tg.colorScheme === 'dark'
    const darkFallbacks = dark ? {
      bg_color: '#1c1c1c', text_color: '#ffffff', hint_color: '#b8b8b8', link_color: '#a99cf0',
      button_color: '#8774e1', secondary_bg_color: '#2c2c2c', section_bg_color: '#242424',
      section_header_text_color: '#a99cf0', subtitle_text_color: '#d1d5db', accent_text_color: '#a99cf0',
      destructive_text_color: '#fca5a5', header_bg_color: '#1c1c1c', bottom_bar_bg_color: '#1c1c1c',
    } : {}
    // 1. 每次先重置完整变量集，避免主题切换后可选参数缺失而残留上一主题值
    for (const [k, cssVar] of Object.entries(THEME_PARAM_TO_CSS)) {
      root.style.setProperty(cssVar, params[k] || darkFallbacks[k] || THEME_FALLBACKS[k])
    }
    // 2. 同步视口高度（布局基准使用 viewportStableHeight，避免键盘弹出抖动）
    const wa = tg.webApp
    if (wa) {
      if (wa.viewportHeight) root.style.setProperty('--tg-viewport-height', wa.viewportHeight + 'px')
      if (wa.viewportStableHeight) root.style.setProperty('--tg-viewport-stable-height', wa.viewportStableHeight + 'px')
    }
    // 3. color-scheme 跟随，让原生滚动条/表单控件适配
    root.style.setProperty('color-scheme', dark ? 'dark' : 'light')
    // 4. 切换 Vuetify 主题（组件颜色由 style.css 强制走 tg 变量，此处仅切换 dark 标志）
    try {
      const name = dark ? THEME_NAMES.dark : THEME_NAMES.light
      if (vTheme.global.name.value !== name) vTheme.global.name.value = name
      const colors = vTheme.themes.value[name]?.colors
      if (colors) {
        colors.primary = params.button_color || darkFallbacks.button_color || THEME_FALLBACKS.button_color
        colors.info = params.link_color || darkFallbacks.link_color || THEME_FALLBACKS.link_color
        colors.error = params.destructive_text_color || darkFallbacks.destructive_text_color || THEME_FALLBACKS.destructive_text_color
        colors.success = dark ? '#86efac' : '#166534'
        colors.warning = dark ? '#fde68a' : '#854d0e'
      }
    } catch { /* 主题实例未就绪时忽略，CSS 变量已先行生效 */ }
  }

  function start() {
    apply()
    offTheme = tg.onThemeChanged(apply)
    offViewport = tg.onViewportChanged(apply)
  }
  function stop() {
    offTheme?.()
    offViewport?.()
  }
  return { start, stop, apply }
}
