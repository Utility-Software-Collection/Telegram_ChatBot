<template>
  <div class="tg-page tg-page--no-button">
    <!-- 用户信息 -->
    <div class="tg-card user-bar">
      <div class="conv-ava">{{ initial }}</div>
      <div class="user-info">
        <div class="user-name">{{ name }}</div>
        <div class="user-id">ID: {{ userId }}</div>
      </div>
      <span v-if="user?.is_blocked" class="tg-badge tg-badge-danger">{{ t('miniapp.ui.admin.users.blockedBadge') }}</span>
    </div>

    <div v-if="error" class="tg-alert tg-alert-error" role="alert">
      {{ error }}
      <button class="retry-link" @click="reload">{{ t('miniapp.ui.common.retry') }}</button>
    </div>

    <div v-if="loading && !messages.length" class="tg-card">
      <div class="tg-skel-stack">
        <div class="tg-skeleton tg-skel-line"></div>
        <div class="tg-skeleton tg-skel-line sm"></div>
        <div class="tg-skeleton tg-skel-line"></div>
      </div>
    </div>

    <div v-else-if="!messages.length" class="tg-empty">
      <v-icon size="40" color="var(--tg-theme-hint-color)">mdi-message-outline</v-icon>
      <div class="tg-empty-title">{{ t('miniapp.ui.admin.conversationDetail.empty') }}</div>
    </div>

    <template v-else>
      <!-- 加载更早 -->
      <div class="load-more">
        <button v-if="hasMore" class="load-more-btn" :disabled="loadingMore" @click="loadOlder">
          {{ loadingMore ? t('miniapp.ui.common.loading') : t('miniapp.ui.conversations.loadMore') }}
        </button>
        <div v-else class="no-more">{{ t('miniapp.ui.conversations.noMore') }}</div>
      </div>

      <div class="tg-bubble-list">
        <div
          v-for="msg in messages"
          :key="msg.id || (msg.ts + msg.direction + (msg.text || ''))"
          class="tg-bubble"
          :class="msg.direction === 'outgoing' ? 'tg-bubble--outgoing' : 'tg-bubble--incoming'"
        >
          <span class="sr-only">{{ msg.direction === 'outgoing' ? t('miniapp.ui.conversations.outgoing') : t('miniapp.ui.conversations.incoming') }}：</span>
          <div class="tg-bubble-text">{{ msgText(msg) }}</div>
          <div class="tg-bubble-meta">{{ formatDateTime(msgTs(msg)) }}</div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18nStore } from '../../stores/i18n'
import { http } from '../../utils/http'
import { formatDateTime } from '../../utils/format'

const route = useRoute()
const i18n = useI18nStore()
const t = i18n.t

const userId = computed(() => route.params.id)
const user = ref(null)
const messages = ref([])
const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')
const page = ref(1)
const hasMore = ref(true)

const name = computed(() => {
  const u = user.value
  if (!u) return String(userId.value)
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || (u.username ? '@' + u.username : String(u.id || u.user_id || userId.value))
})
const initial = computed(() => {
  const u = user.value || {}
  const n = u.first_name || u.username || ''
  return (n[0] || '?').toUpperCase()
})

function msgText(m) {
  return m.text || m.content || m.message || (m.type && m.type !== 'text' ? `[${m.type}]` : '')
}
function msgTs(m) {
  return m.created_at || m.ts || m.timestamp || m.date || ''
}

async function reload() {
  loading.value = true
  error.value = ''
  page.value = 1
  hasMore.value = true
  try {
    const data = await http.get(`/admin/conversations/${userId.value}`, { query: { page: 1 } })
    user.value = data?.user || user.value
    messages.value = Array.isArray(data?.messages) ? data.messages : (Array.isArray(data?.items) ? data.items : [])
    hasMore.value = messages.value.length >= 1 && messages.value.length % 50 === 0
    if (!messages.value.length) hasMore.value = false
  } catch (e) {
    error.value = e?.message || t('miniapp.ui.error.request')
  } finally {
    loading.value = false
  }
}

async function loadOlder() {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  try {
    const next = page.value + 1
    const data = await http.get(`/admin/conversations/${userId.value}`, { query: { page: next } })
    const older = Array.isArray(data?.messages) ? data.messages : (Array.isArray(data?.items) ? data.items : [])
    if (!older.length) { hasMore.value = false }
    else {
      // 更早的消息前置
      messages.value = [...older, ...messages.value]
      page.value = next
      hasMore.value = older.length % 50 === 0
    }
  } catch (e) {
    error.value = e?.message || t('miniapp.ui.conversations.loadFailed')
  } finally {
    loadingMore.value = false
  }
}

watch(userId, () => { if (userId.value) reload() })
onMounted(reload)
</script>

<style scoped>
.user-bar { display: flex; align-items: center; gap: 12px; }
.conv-ava {
  width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
  background: color-mix(in srgb, var(--tg-theme-link-color) 16%, transparent);
  color: var(--tg-theme-link-color);
  display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px;
}
.user-info { flex: 1; min-width: 0; }
.user-name { font-size: 14px; font-weight: 600; }
.user-id { font-size: 12px; color: var(--tg-theme-hint-color); margin-top: 2px; }
.retry-link { min-height: 44px; background: none; border: none; color: inherit; text-decoration: underline; cursor: pointer; padding: 8px; }
.load-more { display: flex; justify-content: center; padding: 8px 0 12px; }
.load-more-btn {
  background: var(--tg-card-bg); border: none; cursor: pointer;
  padding: 7px 16px; border-radius: 999px; font-size: 13px; color: var(--tg-theme-link-color);
}
.load-more-btn:disabled { opacity: 0.5; }
.no-more { font-size: 12px; color: var(--tg-theme-hint-color); }
</style>
