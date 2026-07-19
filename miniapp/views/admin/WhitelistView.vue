<template>
  <div class="tg-page">
    <h2 class="tg-section-title">{{ t('miniapp.ui.admin.whitelist.title') }}</h2>

    <!-- 添加白名单 -->
    <div class="tg-card">
      <v-text-field
        v-model="addId"
        :label="'Telegram ID'"
        :placeholder="'Telegram ID'"
        variant="outlined"
        density="compact"
        hide-details
        type="number"
        class="mb-2"
      />
      <v-textarea
        v-model="addReason"
        :label="t('miniapp.ui.admin.whitelist.reason')"
        :placeholder="t('miniapp.ui.admin.whitelist.reason')"
        :rows="2"
        variant="outlined"
        hide-details
      />
    </div>

    <div v-if="addError" class="tg-alert tg-alert-error">{{ addError }}</div>

    <!-- 列表 -->
    <h3 class="tg-section-title" style="margin-top: 16px">{{ t('miniapp.ui.admin.whitelist.title') }}</h3>

    <div v-if="error" class="tg-alert tg-alert-error">
      {{ error }}
      <button class="retry-link" @click="load">{{ t('miniapp.ui.common.retry') }}</button>
    </div>

    <div v-if="loading && !users.length" class="tg-skel-stack">
      <div class="tg-card" v-for="i in 4" :key="i">
        <div class="skeleton-row">
          <div class="tg-skeleton" style="width:40px;height:40px;border-radius:50%"></div>
          <div class="tg-skel-stack" style="flex:1">
            <div class="tg-skeleton tg-skel-line sm"></div>
            <div class="tg-skeleton tg-skel-line" style="width:40%"></div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="!users.length" class="tg-empty">
      <v-icon size="40" color="var(--tg-theme-hint-color)">mdi-shield-off-outline</v-icon>
      <div class="tg-empty-title">{{ t('miniapp.ui.admin.whitelist.empty') }}</div>
    </div>

    <template v-else>
      <div class="wl-card tg-card" v-for="u in users" :key="u.user_id || u.id">
        <div class="wl-head">
          <div class="wl-ava">{{ initial(u) }}</div>
          <div class="wl-info">
            <div class="wl-name">{{ nameOf(u) }}</div>
            <div class="wl-id">ID: {{ u.user_id || u.id }}</div>
            <div v-if="u.reason" class="wl-reason">{{ u.reason }}</div>
          </div>
          <button class="act-btn act-warn" :disabled="removingId === (u.user_id || u.id)" @click="confirmRemove(u)">
            {{ t('miniapp.ui.admin.whitelist.remove') }}
          </button>
        </div>
      </div>

      <div class="pagination">
        <button class="page-btn" :disabled="page <= 1" @click="prevPage">{{ t('miniapp.ui.admin.users.prev') }}</button>
        <span class="page-meta">{{ t('miniapp.ui.admin.users.page', { page, total: totalPages }) }}</span>
        <button class="page-btn" :disabled="page >= totalPages" @click="nextPage">{{ t('miniapp.ui.admin.users.next') }}</button>
      </div>
    </template>

    <!-- 操作 toast -->
    <v-snackbar v-model="toast.show" :color="toast.color" :timeout="5000" location="top" role="status">{{ toast.text }}</v-snackbar>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18nStore } from '../../stores/i18n'
import { useTelegram } from '../../composables/useTelegram'
import { useMainButton } from '../../composables/useMainButton'
import { http } from '../../utils/http'

const i18n = useI18nStore()
const sdk = useTelegram()
const t = i18n.t

const PAGE_SIZE = 20
const users = ref([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const error = ref('')
const removingId = ref('')

const addId = ref('')
const addReason = ref('')
const addError = ref('')
const adding = ref(false)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

const toast = ref({ show: false, text: '', color: 'success' })
function showToast(text, color = 'success') { toast.value = { show: true, text, color } }

function nameOf(u) {
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || (u.username ? '@' + u.username : String(u.user_id || u.id || ''))
}
function initial(u) {
  const n = u.first_name || u.username || ''
  return (n[0] || '?').toUpperCase()
}

// MainButton：添加白名单（有 ID 时显示）
useMainButton(() => ({
  text: adding.value ? t('miniapp.ui.common.loading') : t('miniapp.ui.admin.users.whitelist'),
  enabled: !!addId.value && !adding.value,
  onClick: doAdd,
}))

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await http.get('/admin/whitelist', { query: { page: page.value } })
    users.value = Array.isArray(data?.users) ? data.users : (Array.isArray(data?.items) ? data.items : [])
    total.value = data?.total || users.value.length
  } catch (e) {
    error.value = e?.message || t('miniapp.ui.error.request')
  } finally {
    loading.value = false
  }
}

function prevPage() { if (page.value > 1) { page.value--; sdk.haptic('light'); load() } }
function nextPage() { if (page.value < totalPages.value) { page.value++; sdk.haptic('light'); load() } }

async function doAdd() {
  if (!addId.value || adding.value) { sdk.haptic('error'); return }
  adding.value = true
  addError.value = ''
  try {
    await http.post(`/admin/whitelist/${addId.value}`, { reason: addReason.value || undefined })
    sdk.haptic('success')
    showToast(t('miniapp.ui.admin.users.opSuccess'))
    addId.value = ''
    addReason.value = ''
    page.value = 1
    await load()
  } catch (e) {
    sdk.haptic('error')
    addError.value = e?.message || t('miniapp.ui.admin.users.opFailed')
  } finally {
    adding.value = false
  }
}

async function confirmRemove(u) {
  const id = u.user_id || u.id
  const ok = await sdk.showConfirm(t('miniapp.ui.admin.whitelist.confirmRemove'))
  if (!ok) { sdk.haptic('warning'); return }
  removingId.value = id
  try {
    await http.del(`/admin/whitelist/${id}`)
    sdk.haptic('success')
    showToast(t('miniapp.ui.admin.users.opSuccess'))
    users.value = users.value.filter((x) => (x.user_id || x.id) !== id)
    total.value = Math.max(0, total.value - 1)
  } catch (e) {
    sdk.haptic('error')
    showToast(e?.message || t('miniapp.ui.admin.users.opFailed'), 'error')
  } finally {
    removingId.value = ''
  }
}

onMounted(load)
</script>

<style scoped>
.retry-link { background: none; border: none; color: inherit; text-decoration: underline; cursor: pointer; padding: 0 4px; }
.skeleton-row { display: flex; align-items: center; gap: 12px; }
.wl-card { padding: 12px 14px; }
.wl-head { display: flex; align-items: center; gap: 12px; }
.wl-ava {
  width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
  background: color-mix(in srgb, var(--tg-theme-link-color) 16%, transparent);
  color: var(--tg-theme-link-color);
  display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px;
}
.wl-info { flex: 1; min-width: 0; }
.wl-name { font-size: 14px; font-weight: 600; }
.wl-id { font-size: 12px; color: var(--tg-theme-hint-color); margin-top: 2px; }
.wl-reason { font-size: 12px; color: var(--tg-theme-hint-color); margin-top: 2px; }
.act-btn {
  padding: 8px 12px; border-radius: var(--tg-radius-sm); border: none;
  font-size: 13px; font-weight: 500; cursor: pointer; min-height: 44px;
}
.act-warn { background: var(--app-warning-bg); color: var(--app-warning-text); }
.act-btn:active { transform: scale(0.97); }
.act-btn:disabled { opacity: 0.5; }
.pagination { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 16px 0; }
.page-btn { padding: 8px 14px; border-radius: var(--tg-radius-sm); border: 1px solid var(--tg-border); background: var(--tg-card-bg); color: var(--tg-theme-text-color); font-size: 13px; cursor: pointer; }
.page-btn:disabled { opacity: 0.4; }
.page-meta { font-size: 13px; color: var(--tg-theme-hint-color); }
</style>
