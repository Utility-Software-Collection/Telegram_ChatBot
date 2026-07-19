<template>
  <div class="tg-page tg-page--no-button">
    <div class="conv-header">
      <h2 class="tg-section-title" style="margin: 0">{{ t('miniapp.ui.conversations.title') }}</h2>
      <button class="refresh-btn" @click="reload" :disabled="loading" :aria-label="t('miniapp.ui.common.refresh')" :aria-busy="loading">
        <v-icon size="18" :class="{ spinning: loading }">mdi-refresh</v-icon>
      </button>
    </div>

    <!-- 错误重试条 -->
    <div v-if="error" class="tg-alert tg-alert-error" role="alert">
      {{ error }}
      <button class="retry-link" @click="reload">{{ t('miniapp.ui.common.retry') }}</button>
    </div>

    <!-- 骨架 -->
    <div v-if="loading && !items.length" class="tg-card">
      <div class="tg-skel-stack">
        <div class="tg-skeleton tg-skel-line"></div>
        <div class="tg-skeleton tg-skel-line sm"></div>
        <div class="tg-skeleton tg-skel-line"></div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else-if="!items.length" class="tg-empty">
      <v-icon size="40" color="var(--tg-theme-hint-color)">mdi-message-outline</v-icon>
      <div class="tg-empty-title">{{ t('miniapp.ui.conversations.empty') }}</div>
    </div>

    <!-- 消息列表 -->
    <template v-else>
      <div class="tg-bubble-list">
        <div
          v-for="msg in items"
          :key="msg.id || (msg.ts + msg.direction + msg.text)"
          class="tg-bubble"
          :class="msg.direction === 'outgoing' ? 'tg-bubble--outgoing' : 'tg-bubble--incoming'"
        >
          <span class="sr-only">{{ msg.direction === 'outgoing' ? t('miniapp.ui.conversations.outgoing') : t('miniapp.ui.conversations.incoming') }}：</span>
          <div class="tg-bubble-text">{{ msgText(msg) }}</div>
          <div class="tg-bubble-meta">{{ formatDateTime(msgTs(msg)) }}</div>
        </div>
      </div>

      <!-- 加载更多 -->
      <div class="load-more">
        <button v-if="!noMore" class="load-more-btn" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? t('miniapp.ui.common.loading') : t('miniapp.ui.conversations.loadMore') }}
        </button>
        <div v-else class="no-more">{{ t('miniapp.ui.conversations.noMore') }}</div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18nStore } from '../stores/i18n'
import { useTelegram } from '../composables/useTelegram'
import { http } from '../utils/http'
import { formatDateTime } from '../utils/format'

const i18n = useI18nStore()
const sdk = useTelegram()
const t = i18n.t

const items = ref([])
const loading = ref(false)
const loadingMore = ref(false)
const noMore = ref(false)
const error = ref('')
let page = 1

// 消息字段兼容：后端可能用 text/content/message；ts/created_at/timestamp
function msgText(m) {
  return m.text || m.content || m.message || (m.type && m.type !== 'text' ? `[${m.type}]` : '')
}
function msgTs(m) {
  return m.created_at || m.ts || m.timestamp || m.date || ''
}

function mergeOlder(newItems) {
  if (!Array.isArray(newItems) || !newItems.length) {
    noMore.value = true
    return
  }
  const seen = new Set(items.value.map((m) => m.id).filter(Boolean))
  const toAdd = newItems.filter((m) => !m.id || !seen.has(m.id))
  if (!toAdd.length) { noMore.value = true; return }
  items.value.push(...toAdd)
  noMore.value = toAdd.length < 50
}

async function reload() {
  loading.value = true
  error.value = ''
  noMore.value = false
  try {
    page = 1
    const data = await http.get('/my/conversations', { query: { page, limit: 50 } })
    const list = Array.isArray(data?.items) ? data.items : []
    items.value = list
    noMore.value = list.length < 50
  } catch (e) {
    error.value = e?.message || t('miniapp.ui.conversations.loadFailed')
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (loadingMore.value || noMore.value) return
  loadingMore.value = true
  try {
    const nextPage = page + 1
    const data = await http.get('/my/conversations', { query: { page: nextPage, limit: 50 } })
    mergeOlder(data?.items || [])
    page = nextPage
    sdk.haptic('light')
  } catch (e) {
    error.value = e?.message || t('miniapp.ui.conversations.loadFailed')
    sdk.haptic('error')
  } finally {
    loadingMore.value = false
  }
}

onMounted(reload)
onUnmounted(() => {})
</script>

<style scoped>
.conv-header { display: flex; align-items: center; justify-content: space-between; padding: 6px 2px 12px; }
.refresh-btn {
  width: 44px; height: 44px; border-radius: 50%;
  background: var(--tg-card-bg); border: none; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--tg-theme-link-color);
}
.refresh-btn:active { transform: scale(0.92); }
.refresh-btn:disabled { opacity: 0.5; }
.spinning { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.retry-link { min-height: 44px; background: none; border: none; color: inherit; text-decoration: underline; cursor: pointer; padding: 8px; }
.load-more { display: flex; justify-content: center; padding: 16px 0; }
.load-more-btn {
  background: var(--tg-card-bg); border: none; cursor: pointer;
  padding: 9px 18px; border-radius: 999px; font-size: 13px;
  color: var(--tg-theme-link-color);
}
.load-more-btn:disabled { opacity: 0.5; }
.no-more { font-size: 12px; color: var(--tg-theme-hint-color); }
</style>
