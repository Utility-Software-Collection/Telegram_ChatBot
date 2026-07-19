<template>
  <v-app>
    <v-main>
      <!-- 启动中：全屏加载 -->
      <div v-if="!auth.bootDone" class="tg-center">
        <v-progress-circular indeterminate size="34" width="3" />
        <div class="tg-center-desc">{{ t('miniapp.ui.app.loading') }}</div>
      </div>

      <!-- 启动错误：非 Telegram 环境或验签失败 -->
      <div v-else-if="auth.bootError" class="tg-center">
        <v-icon size="40" color="var(--tg-theme-hint-color)" class="mb-1">mdi-alert-circle-outline</v-icon>
        <div class="tg-center-title">{{ auth.bootError }}</div>
        <div class="tg-center-desc">{{ t('miniapp.ui.app.openInTelegramDesc') }}</div>
        <v-btn variant="tonal" class="mt-2" @click="retry">{{ t('miniapp.ui.app.retry') }}</v-btn>
      </div>

      <!-- 正常路由视图 -->
      <router-view v-else v-slot="{ Component, route }">
        <transition name="fade" mode="out-in">
          <component :is="Component" :key="route.path" />
        </transition>
      </router-view>
    </v-main>

    <!-- 语言切换：右上角轻量浮钮（不与 Telegram 顶部关闭键冲突，置于内容区右上） -->
    <button
      v-if="auth.bootDone && !auth.bootError"
      class="locale-pill"
      @click="cycleLocale"
      :title="localeAriaLabel"
      :aria-label="localeAriaLabel"
    >{{ localeLabel }}</button>
  </v-app>
</template>

<script setup>
import { onMounted, onUnmounted, computed } from 'vue'
import { useAuthStore } from './stores/auth'
import { useI18nStore } from './stores/i18n'
import { useTheme } from './composables/useTheme'
import { useTelegram } from './composables/useTelegram'

const auth = useAuthStore()
const i18n = useI18nStore()
const tg = useTelegram()
const theme = useTheme()

const t = i18n.t

const localeAriaLabel = computed(() => t('miniapp.ui.app.changeLanguage', { locale: localeLabel.value }))

const localeLabel = computed(() => {
  const map = { 'zh-hans': '中', 'zh-hant': '繁', 'en': 'EN' }
  return map[i18n.locale] || '中'
})

function cycleLocale() {
  const order = ['zh-hans', 'zh-hant', 'en']
  const idx = order.indexOf(i18n.locale)
  i18n.setLocale(order[(idx + 1) % order.length])
  tg.haptic('selection')
}

function retry() {
  // 重置启动态并重新登录
  auth.logout()
  auth.ensureBooted()
}

onMounted(async () => {
  // 启动主题同步（必须在 setup 内调用 useTheme，内部依赖 Vuetify inject）
  theme.start()
  // 触发鉴权启动（router.beforeEach 也会调用，单飞复用）
  await auth.ensureBooted()
})

onUnmounted(() => {
  theme.stop()
})
</script>

<style scoped>
.locale-pill {
  position: fixed;
  top: calc(8px + env(safe-area-inset-top, 0px));
  right: 12px;
  z-index: 50;
  min-width: 44px;
  height: 44px;
  padding: 0 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tg-theme-text-color) 8%, transparent);
  color: var(--tg-theme-text-color);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  backdrop-filter: blur(8px);
}
.locale-pill:active { transform: scale(0.94); }
</style>
