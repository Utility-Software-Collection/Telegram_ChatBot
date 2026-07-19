<template>
  <div class="tg-page tg-page--no-button">
    <div class="conv-header">
      <h2 class="tg-section-title" style="margin: 0">{{ t('miniapp.ui.admin.conversations.title') }}</h2>
      <button class="refresh-btn" @click="reload" :disabled="loading" :aria-label="t('miniapp.ui.common.refresh')" :aria-busy="loading">
        <v-icon size="18" :class="{ spinning: loading }">mdi-refresh</v-icon>
      </button>
    </div>

    <div v-if="error" class="tg-alert tg-alert-error" role="alert">
      {{ error }}
      <button class="retry-link" @click="reload">{{ t('miniapp.ui.common.retry') }}</button>
    </div>

    <div v-if="loading && !items.length" class="tg-skel-stack">
      <div class="tg-card" v-for="i in 6" :key="i">
        <div class="skeleton-row">
          <div class="tg-skeleton" style="width:40px;height:40px;border-radius:50%"></div>
          <div class="tg-skel-stack" style="flex:1">
            <div class="tg-skeleton tg-skel-line sm"></div>
            <div class="tg-skeleton tg-skel-line" style="width:50%"></div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="!items.length" class="tg-empty">
      <v-icon size="40" color="var(--tg-theme-hint-color)">mdi-forum-outline</v-icon>
      <div class="tg-empty-title">{{ t('miniapp.ui.admin.conversations.empty') }}</div>
    </div>

    <template v-else>
      <button
        v-for="c in items"
        :key="c.user_id"
        class="conv-item tg-card"
        @click="open(c)"
      >
        <div class="conv-ava">{{ initial(c) }}</div>
        <div class="conv-body">
          <div class="conv-name">
            {{ nameOf(c) }}
            <span v-if="c.is_blocked" class="tg-badge tg-badge-danger">{{ t('miniapp.ui.admin.users.blockedBadge') }}</span>
          </div>
          <div class="conv-preview">
            <span class="dir" aria-hidden="true">{{ c.last_direction === 'outgoing' ? '↗' : '↘' }}</span>
            <span class="sr-only">{{ c.last_direction === 'outgoing' ? t('miniapp.ui.conversations.outgoing') : t('miniapp.ui.conversations.incoming') }}：</span>
            {{ c.last_message || t('miniapp.ui.conversations.empty') }}
          </div>
        </div>
        <div class="conv-time">{{ formatTime(c.last_at) }}</div>
      </button>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18nStore } from '../../stores/i18n'
import { useTelegram } from '../../composables/useTelegram'
import { http } from '../../utils/http'
import { formatTime } from '../../utils/format'

const router = useRouter()
const i18n = useI18nStore()
const sdk = useTelegram()
const t = i18n.t

const items = ref([])
const loading = ref(false)
const error = ref('')

function nameOf(c) {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || (c.username ? '@' + c.username : String(c.user_id || ''))
}
function initial(c) {
  const n = c.first_name || c.username || ''
  return (n[0] || '?').toUpperCase()
}

async function reload() {
  loading.value = true
  error.value = ''
  try {
    const data = await http.get('/admin/conversations', { query: { limit: 50 } })
    items.value = Array.isArray(data?.items) ? data.items : []
  } catch (e) {
    error.value = e?.message || t('miniapp.ui.error.request')
  } finally {
    loading.value = false
  }
}

function open(c) {
  sdk.haptic('light')
  router.push(`/admin/conversations/${c.user_id}`)
}

onMounted(reload)
</script>

<style scoped>
.conv-header { display: flex; align-items: center; justify-content: space-between; padding: 6px 2px 12px; }
.refresh-btn { width: 44px; height: 44px; border-radius: 50%; background: var(--tg-card-bg); border: none; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; color: var(--tg-theme-link-color); }
.refresh-btn:active { transform: scale(0.92); }
.refresh-btn:disabled { opacity: 0.5; }
.spinning { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.retry-link { min-height: 44px; background: none; border: none; color: inherit; text-decoration: underline; cursor: pointer; padding: 8px; }
.skeleton-row { display: flex; align-items: center; gap: 12px; }
.conv-item {
  display: flex; align-items: center; gap: 12px; width: 100%;
  padding: 12px 14px; border: none; cursor: pointer; text-align: left;
  color: var(--tg-theme-text-color);
}
.conv-item:active { transform: scale(0.99); }
.conv-ava {
  width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
  background: color-mix(in srgb, var(--tg-theme-link-color) 16%, transparent);
  color: var(--tg-theme-link-color);
  display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px;
}
.conv-body { flex: 1; min-width: 0; }
.conv-name { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.conv-preview { font-size: 13px; color: var(--tg-theme-hint-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.conv-preview .dir { margin-right: 4px; }
.conv-time { font-size: 12px; color: var(--tg-theme-hint-color); flex-shrink: 0; }
</style>
