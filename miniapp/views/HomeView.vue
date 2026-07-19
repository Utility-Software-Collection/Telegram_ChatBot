<template>
  <div class="tg-page tg-page--no-button">
    <!-- 问候 -->
    <div class="home-greeting">
      <div class="home-hello">{{ t('miniapp.ui.home.greeting', { name: displayName || tg.displayName || '' }) }}</div>
      <div class="tg-subtitle">{{ statusLine }}</div>
    </div>

    <!-- 状态卡片 -->
    <div class="tg-card">
      <div v-if="loading" class="tg-skel-stack">
        <div class="tg-skeleton tg-skel-line sm"></div>
        <div class="tg-skeleton tg-skel-line"></div>
      </div>
      <template v-else>
        <div class="status-badge-row">
          <span v-if="me?.isBlocked" class="tg-badge tg-badge-danger">
            <v-icon size="14" class="me-1">mdi-cancel</v-icon>{{ t('miniapp.ui.home.statusBlocked') }}
          </span>
          <span v-else-if="me?.isVerified" class="tg-badge tg-badge-success">
            <v-icon size="14" class="me-1">mdi-check-decagram</v-icon>{{ t('miniapp.ui.home.statusVerified') }}
          </span>
          <span v-else class="tg-badge tg-badge-warn">
            <v-icon size="14" class="me-1">mdi-alert-circle-outline</v-icon>{{ t('miniapp.ui.home.statusUnverified') }}
          </span>
          <span v-if="me?.isWhitelisted" class="tg-badge tg-badge-info">
            <v-icon size="14" class="me-1">mdi-shield-check-outline</v-icon>{{ t('miniapp.ui.home.statusWhitelisted') }}
          </span>
        </div>
        <div v-if="me?.isBlocked && me?.blockReason" class="block-reason">
          {{ t('miniapp.ui.status.blockReason') }}：{{ me.blockReason }}
        </div>
      </template>
    </div>

    <!-- 快捷入口 -->
    <h3 class="tg-section-title" style="margin-top: 18px">{{ t('miniapp.ui.home.quickActions') }}</h3>
    <div class="tg-action-grid">
      <button class="tg-action" @click="go('/my/status')">
        <v-icon size="20" color="var(--tg-theme-link-color)">mdi-account-check-outline</v-icon>
        <span class="tg-action-title">{{ t('miniapp.ui.home.viewStatus') }}</span>
      </button>
      <button class="tg-action" @click="go('/my/conversations')">
        <v-icon size="20" color="var(--tg-theme-link-color)">mdi-message-text-outline</v-icon>
        <span class="tg-action-title">{{ t('miniapp.ui.home.viewConversations') }}</span>
      </button>
      <button v-if="me?.canAppeal" class="tg-action" @click="go('/appeal')">
        <v-icon size="20" color="var(--tg-theme-link-color)">mdi-gavel</v-icon>
        <span class="tg-action-title">{{ t('miniapp.ui.home.appeal') }}</span>
      </button>
      <button class="tg-action" @click="go('/help')">
        <v-icon size="20" color="var(--tg-theme-link-color)">mdi-help-circle-outline</v-icon>
        <span class="tg-action-title">{{ t('miniapp.ui.home.help') }}</span>
      </button>
    </div>

    <!-- 管理员入口 -->
    <button v-if="auth.isAdmin" class="admin-entry" @click="go('/admin')">
      <v-icon size="20" color="var(--tg-theme-button-text-color)">mdi-shield-account-outline</v-icon>
      <span>{{ t('miniapp.ui.home.adminPanel') }}</span>
      <v-icon size="18" color="var(--tg-theme-button-text-color)">mdi-chevron-right</v-icon>
    </button>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useI18nStore } from '../stores/i18n'
import { useTgStore } from '../stores/tg'
import { useTelegram } from '../composables/useTelegram'
import { http } from '../utils/http'

const router = useRouter()
const auth = useAuthStore()
const i18n = useI18nStore()
const tg = useTgStore()
const sdk = useTelegram()
const t = i18n.t

const loading = ref(false)
const me = ref(auth.me)

const displayName = computed(() => {
  const u = me.value?.user || auth.user || tg.user
  return [u?.first_name, u?.last_name].filter(Boolean).join(' ') || (u?.username ? '@' + u.username : '')
})

const statusLine = computed(() => {
  if (!me.value) return ''
  if (me.value.isBlocked) return t('miniapp.ui.home.statusBlocked')
  if (me.value.isVerified) return t('miniapp.ui.home.statusVerified')
  return t('miniapp.ui.home.statusUnverified')
})

function go(path) {
  sdk.haptic('light')
  router.push(path)
}

async function load() {
  // 启动期已拉取过 me，这里刷新一次保证最新
  loading.value = true
  try {
    me.value = await http.get('/my/status').then(d => ({ ...me.value, ...d })).catch(() => auth.me)
    auth.me = me.value
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.home-greeting { padding: 6px 2px 14px; }
.home-hello { font-size: 20px; font-weight: 700; letter-spacing: -0.01em; }
.status-badge-row { display: flex; flex-wrap: wrap; gap: 8px; }
.block-reason { margin-top: 10px; font-size: 13px; color: var(--tg-theme-destructive-text-color, #ef4444); }
.tg-action { align-items: flex-start; }
.admin-entry {
  display: flex; align-items: center; gap: 10px;
  width: 100%; margin-top: 14px; padding: 14px;
  border-radius: var(--tg-radius);
  background: var(--tg-theme-button-color);
  color: var(--tg-theme-button-text-color);
  font-size: 14px; font-weight: 600;
  box-shadow: var(--tg-shadow); cursor: pointer;
}
.admin-entry span { flex: 1; text-align: left; }
.admin-entry:active { transform: scale(0.98); }
</style>
