<template>
  <div class="tg-page tg-page--no-button">
    <div class="conv-header">
      <h2 class="tg-section-title" style="margin: 0">{{ t('miniapp.ui.admin.dashboard.title') }}</h2>
      <button class="refresh-btn" @click="load" :disabled="loading" :aria-label="t('miniapp.ui.common.refresh')" :aria-busy="loading">
        <v-icon size="18" :class="{ spinning: loading }">mdi-refresh</v-icon>
      </button>
    </div>

    <div v-if="loading && !stats" class="tg-stat-grid">
      <div class="tg-card tg-stat" v-for="i in 4" :key="i">
        <div class="tg-skeleton tg-skel-line lg"></div>
        <div class="tg-skeleton tg-skel-line sm" style="margin-top: 8px"></div>
      </div>
    </div>

    <div v-else-if="error" class="tg-alert tg-alert-error" role="alert">
      {{ error }}
      <button class="retry-link" @click="load">{{ t('miniapp.ui.common.retry') }}</button>
    </div>

    <template v-else>
      <div class="tg-stat-grid">
        <button type="button" class="tg-card tg-stat clickable" @click="go('/admin/users')">
          <div class="tg-stat-val">{{ stats?.totalUsers ?? '-' }}</div>
          <div class="tg-stat-label">{{ t('miniapp.ui.admin.dashboard.totalUsers') }}</div>
        </button>
        <button type="button" class="tg-card tg-stat clickable" @click="go('/admin/users?filter=blocked')">
          <div class="tg-stat-val text-danger">{{ stats?.blockedUsers ?? '-' }}</div>
          <div class="tg-stat-label">{{ t('miniapp.ui.admin.dashboard.blockedUsers') }}</div>
        </button>
        <button type="button" class="tg-card tg-stat clickable" @click="go('/admin/conversations')">
          <div class="tg-stat-val">{{ stats?.totalMessages ?? '-' }}</div>
          <div class="tg-stat-label">{{ t('miniapp.ui.admin.dashboard.totalMessages') }}</div>
        </button>
        <div class="tg-card tg-stat">
          <div class="tg-stat-val text-success">{{ stats?.todayMessages ?? '-' }}</div>
          <div class="tg-stat-label">{{ t('miniapp.ui.admin.dashboard.todayMessages') }}</div>
        </div>
      </div>

      <!-- 快捷入口 -->
      <div class="admin-links">
        <button class="admin-link" @click="go('/admin/users')">
          <v-icon size="20">mdi-account-group-outline</v-icon>
          <span>{{ t('miniapp.ui.admin.users.title') }}</span>
          <v-icon size="18" class="chev">mdi-chevron-right</v-icon>
        </button>
        <button class="admin-link" @click="go('/admin/conversations')">
          <v-icon size="20">mdi-forum-outline</v-icon>
          <span>{{ t('miniapp.ui.admin.conversations.title') }}</span>
          <v-icon size="18" class="chev">mdi-chevron-right</v-icon>
        </button>
        <button class="admin-link" @click="go('/admin/whitelist')">
          <v-icon size="20">mdi-shield-check-outline</v-icon>
          <span>{{ t('miniapp.ui.admin.whitelist.title') }}</span>
          <v-icon size="18" class="chev">mdi-chevron-right</v-icon>
        </button>
        <button class="admin-link" @click="go('/')">
          <v-icon size="20">mdi-account-outline</v-icon>
          <span>{{ t('miniapp.ui.nav.home') }}</span>
          <v-icon size="18" class="chev">mdi-chevron-right</v-icon>
        </button>
        <button class="admin-link" @click="go('/admin/settings')">
          <v-icon size="20">mdi-cog-outline</v-icon>
          <span>{{ t('miniapp.ui.admin.settings.title') }}</span>
          <v-icon size="18" class="chev">mdi-chevron-right</v-icon>
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18nStore } from '../../stores/i18n'
import { useTelegram } from '../../composables/useTelegram'
import { http } from '../../utils/http'

const router = useRouter()
const i18n = useI18nStore()
const sdk = useTelegram()
const t = i18n.t

const loading = ref(false)
const stats = ref(null)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    stats.value = await http.get('/admin/stats')
  } catch (e) {
    error.value = e?.message || t('miniapp.ui.error.request')
  } finally {
    loading.value = false
  }
}

function go(path) {
  sdk.haptic('light')
  router.push(path)
}

onMounted(load)
</script>

<style scoped>
.conv-header { display: flex; align-items: center; justify-content: space-between; padding: 6px 2px 12px; }
.refresh-btn { width: 44px; height: 44px; border-radius: 50%; background: var(--tg-card-bg); border: none; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; color: var(--tg-theme-link-color); }
.refresh-btn:active { transform: scale(0.92); }
.refresh-btn:disabled { opacity: 0.5; }
.spinning { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.clickable { cursor: pointer; border: none; color: var(--tg-theme-text-color); text-align: left; width: 100%; }
.clickable:active { transform: scale(0.97); }
.text-danger { color: var(--app-danger-text); }
.text-success { color: var(--app-success-text); }
.retry-link { min-height: 44px; background: none; border: none; color: inherit; text-decoration: underline; cursor: pointer; padding: 8px; }
.admin-links { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
.admin-link {
  display: flex; align-items: center; gap: 12px; width: 100%;
  padding: 14px; border-radius: var(--tg-radius);
  background: var(--tg-card-bg); border: none; cursor: pointer;
  color: var(--tg-theme-text-color); font-size: 14px; font-weight: 500;
  box-shadow: var(--tg-shadow); text-align: left;
}
.admin-link span { flex: 1; }
.admin-link .chev { color: var(--tg-theme-hint-color); }
.admin-link:active { transform: scale(0.99); }
</style>
