// Mini App Vuetify 实例
// - 默认主题色取 Telegram 典型配色，运行时由 useTheme 用 themeParams(HEX) 覆盖
// - Vuetify 需要 HEX 颜色做透明度计算，故不能直接传 CSS 变量；改由运行时同步
// - 背景/卡片透明：由 style.css 强制覆盖为 Telegram 变量，避免双层背景
// - 图标使用 mdi-svg（基于已安装的 @mdi/js），无需 @mdi/font 字体包
import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'

// 亮色默认值（贴近 Telegram light）
const tgLight = {
  dark: false,
  colors: {
    background: 'transparent',
    surface: '#ffffff',
    'surface-variant': '#f4f4f5',
    primary: '#2481cc',
    'on-primary': '#ffffff',
    secondary: '#2481cc',
    'on-secondary': '#ffffff',
    error: '#ef4444',
    warning: '#f59e0b',
    success: '#22c55e',
    info: '#2481cc',
    'on-background': '#000000',
    'on-surface': '#000000',
    'outline': '#cccccc',
  },
}

// 暗色默认值（贴近 Telegram dark）
const tgDark = {
  dark: true,
  colors: {
    background: 'transparent',
    surface: '#1c1c1c',
    'surface-variant': '#2c2c2c',
    primary: '#8774e1',
    'on-primary': '#ffffff',
    secondary: '#8774e1',
    'on-secondary': '#ffffff',
    error: '#ef4444',
    warning: '#f59e0b',
    success: '#22c55e',
    info: '#8774e1',
    'on-background': '#ffffff',
    'on-surface': '#ffffff',
    'outline': '#3a3a3a',
  },
}

export const vuetify = createVuetify({
  ssr: false,
  theme: {
    defaultTheme: 'tgLight',
    themes: { tgLight, tgDark },
  },
  icons: {
    defaultSet: 'mdi',
    sets: { mdi },
    aliases,
  },
  defaults: {
    VCard: { flat: true, rounded: 'lg' },
    VBtn: { rounded: 'lg', density: 'comfortable' },
    VList: { nav: true },
    VListItem: { rounded: 'lg' },
    VTextField: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
    VTextarea: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
    VSwitch: { color: 'primary', inset: true, hideDetails: 'auto' },
    VProgressCircular: { color: 'primary' },
  },
})

export const THEME_NAMES = { light: 'tgLight', dark: 'tgDark' }
