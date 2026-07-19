<template>
  <div class="tg-page tg-page--no-button">
    <h2 class="tg-section-title">{{ t('miniapp.ui.admin.users.title') }}</h2>

    <!-- 搜索 -->
    <v-text-field
      v-model="q"
      :label="t('miniapp.ui.admin.users.search')"
      :placeholder="t('miniapp.ui.admin.users.search')"
      variant="outlined"
      density="compact"
      hide-details
      prepend-inner-icon="mdi-magnify"
      clearable
      class="mb-2"
      @update:model-value="onSearch"
      @keyup.enter="searchNow"
    />

    <!-- 筛选 -->
    <div class="filter-chips">
      <button
        v-for="opt in filterOptions"
        :key="opt.value"
        class="chip"
        :class="{ active: filter === opt.value }"
        @click="setFilter(opt.value)"
      >{{ opt.label }}</button>
    </div>

    <!-- 错误 -->
    <div v-if="error" class="tg-alert tg-alert-error">
      {{ error }}
      <button class="retry-link" @click="load">{{ t('miniapp.ui.common.retry') }}</button>
    </div>

    <!-- 加载骨架 -->
    <div v-if="loading && !users.length" class="tg-skel-stack">
      <div class="tg-card" v-for="i in 5" :key="i">
        <div class="skeleton-row">
          <div class="tg-skeleton" style="width:40px;height:40px;border-radius:50%"></div>
          <div class="tg-skel-stack" style="flex:1">
            <div class="tg-skeleton tg-skel-line sm"></div>
            <div class="tg-skeleton tg-skel-line" style="width:40%"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else-if="!users.length" class="tg-empty">
      <v-icon size="40" color="var(--tg-theme-hint-color)">mdi-account-off-outline</v-icon>
      <div class="tg-empty-title">{{ t('miniapp.ui.admin.users.noUsers') }}</div>
    </div>

    <!-- 用户列表 -->
    <template v-else>
      <div class="user-card tg-card" v-for="u in users" :key="u.id || u.user_id">
        <div class="user-head">
          <div class="user-ava">{{ initials(u) }}</div>
          <div class="user-info">
            <div class="user-name">
              {{ nameOf(u) }}
              <span v-if="u.is_blocked || u.isBlocked" class="tg-badge tg-badge-danger">{{ t('miniapp.ui.admin.users.blockedBadge') }}</span>
              <span v-if="u.is_whitelisted || u.isWhitelisted" class="tg-badge tg-badge-info">{{ t('miniapp.ui.admin.users.whitelistBadge') }}</span>
            </div>
            <div class="user-id">ID: {{ u.id }}</div>
          </div>
        </div>
        <div class="user-actions">
          <button
            v-if="isBlocked(u)"
            class="act-btn act-unblock"
            :disabled="actingId === u.id"
            @click="confirmUnblock(u)"
          >{{ t('miniapp.ui.admin.users.unblock') }}</button>
          <button
            v-else
            class="act-btn act-block"
            :disabled="actingId === u.id"
            @click="openBlockDialog(u)"
          >{{ t('miniapp.ui.admin.users.block') }}</button>
          <button
            v-if="isWhitelisted(u)"
            class="act-btn act-warn"
            :disabled="actingId === u.id"
            @click="confirmRemoveWhitelist(u)"
          >{{ t('miniapp.ui.admin.users.removeWhitelist') }}</button>
          <button
            v-else
            class="act-btn act-ghost"
            :disabled="actingId === u.id"
            @click="confirmWhitelist(u)"
          >{{ t('miniapp.ui.admin.users.whitelist') }}</button>
        </div>
      </div>

      <!-- 分页 -->
      <div class="pagination">
        <button class="page-btn" :disabled="page <= 1" @click="prevPage">{{ t('miniapp.ui.admin.users.prev') }}</button>
        <span class="page-meta">{{ t('miniapp.ui.admin.users.page', { page, total: totalPages }) }}</span>
        <button class="page-btn" :disabled="page >= totalPages" @click="nextPage">{{ t('miniapp.ui.admin.users.next') }}</button>
      </div>
    </template>

    <!-- 封禁弹窗：填原因 + 永久开关 -->
    <v-dialog v-model="blockDialog.open" max-width="420" persistent>
      <v-card>
        <v-card-title class="dialog-title">{{ t('miniapp.ui.admin.users.block') }}</v-card-title>
        <v-card-text>
          <div class="dialog-user">{{ nameOf(blockDialog.user) }} · ID: {{ blockDialog.user?.id }}</div>
          <v-textarea
            v-model="blockDialog.reason"
            :label="t('miniapp.ui.admin.users.blockReason')"
            :placeholder="t('miniapp.ui.admin.users.blockReason')"
            :rows="3"
            variant="outlined"
            hide-details
            class="mt-2"
          />
          <div class="permanent-row">
            <span>{{ t('miniapp.ui.admin.users.permanent') }}</span>
            <v-switch v-model="blockDialog.permanent" :label="t('miniapp.ui.admin.users.permanent')" :aria-label="t('miniapp.ui.admin.users.permanent')" color="primary" inset hide-details density="compact" />
          </div>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="closeBlockDialog">{{ t('miniapp.ui.common.cancel') }}</v-btn>
          <v-spacer />
          <v-btn variant="flat" color="error" :loading="acting" @click="doBlock">{{ t('miniapp.ui.common.confirm') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 操作结果 toast -->
    <v-snackbar v-model="toast.show" :color="toast.color" :timeout="5000" location="top" role="status">
      {{ toast.text }}
    </v-snackbar>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18nStore } from '../../stores/i18n'
import { useTelegram } from '../../composables/useTelegram'
import { http, HttpError } from '../../utils/http'

const route = useRoute()
const i18n = useI18nStore()
const sdk = useTelegram()
const t = i18n.t

const PAGE_SIZE = 20
const q = ref('')
const filter = ref('all') // all | blocked | normal
const page = ref(1)
const users = ref([])
const total = ref(0)
const loading = ref(false)
const error = ref('')
const acting = ref(false)
const actingId = ref(null)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

const filterOptions = computed(() => [
  { value: 'all', label: t('miniapp.ui.admin.users.filterAll') },
  { value: 'blocked', label: t('miniapp.ui.admin.users.filterBlocked') },
  { value: 'normal', label: t('miniapp.ui.admin.users.filterNormal') },
])

// 封禁弹窗
const blockDialog = ref({ open: false, user: null, reason: '', permanent: false })
// toast
const toast = ref({ show: false, text: '', color: 'success' })

let searchTimer = null

function isBlocked(u) { return !!(u.is_blocked || u.isBlocked) }
function isWhitelisted(u) { return !!(u.is_whitelisted || u.isWhitelisted) }
function nameOf(u) {
  if (!u) return ''
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || (u.username ? '@' + u.username : String(u.id || ''))
}
function initials(u) {
  const n = u?.first_name || u?.username || ''
  return (n[0] || '?').toUpperCase()
}

function onSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = 1; load() }, 400)
}
function searchNow() {
  if (searchTimer) clearTimeout(searchTimer)
  page.value = 1
  load()
}
function setFilter(v) {
  if (filter.value === v) return
  filter.value = v
  page.value = 1
  sdk.haptic('selection')
  load()
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await http.get('/admin/users', {
      query: { page: page.value, pageSize: PAGE_SIZE, filter: filter.value, q: q.value || undefined },
    })
    users.value = Array.isArray(data?.users)
      ? data.users.map((user) => ({ ...user, id: user.id ?? user.user_id }))
      : []
    total.value = data?.total || 0
  } catch (e) {
    error.value = e?.message || t('miniapp.ui.error.request')
  } finally {
    loading.value = false
  }
}

function prevPage() { if (page.value > 1) { page.value--; sdk.haptic('light'); load() } }
function nextPage() { if (page.value < totalPages.value) { page.value++; sdk.haptic('light'); load() } }

function showToast(text, color = 'success') {
  toast.value = { show: true, text, color }
}

function openBlockDialog(u) {
  sdk.haptic('light')
  blockDialog.value = { open: true, user: u, reason: '', permanent: false }
}
function closeBlockDialog() {
  blockDialog.value.open = false
}

async function doBlock() {
  const u = blockDialog.value.user
  if (!u || acting.value) return
  // 二次确认
  const ok = await sdk.showConfirm(t('miniapp.ui.admin.users.confirmBlock'))
  if (!ok) { sdk.haptic('warning'); return }
  acting.value = true
  actingId.value = u.id
  try {
    await http.put(`/admin/users/${u.id}/block`, {
      reason: blockDialog.value.reason || undefined,
      permanent: !!blockDialog.value.permanent,
    })
    sdk.haptic('success')
    showToast(t('miniapp.ui.admin.users.opSuccess'))
    closeBlockDialog()
    await load()
  } catch (e) {
    sdk.haptic('error')
    showToast(e?.message || t('miniapp.ui.admin.users.opFailed'), 'error')
  } finally {
    acting.value = false
    actingId.value = null
  }
}

async function confirmUnblock(u) {
  const ok = await sdk.showConfirm(t('miniapp.ui.admin.users.confirmUnblock'))
  if (!ok) { sdk.haptic('warning'); return }
  await act(`/admin/users/${u.id}/unblock`, 'put', null, u.id)
}
async function confirmWhitelist(u) {
  const ok = await sdk.showConfirm(t('miniapp.ui.admin.users.confirmWhitelist'))
  if (!ok) { sdk.haptic('warning'); return }
  await act(`/admin/whitelist/${u.id}`, 'post', {}, u.id)
}
async function confirmRemoveWhitelist(u) {
  const ok = await sdk.showConfirm(t('miniapp.ui.admin.users.confirmRemoveWhitelist'))
  if (!ok) { sdk.haptic('warning'); return }
  await act(`/admin/whitelist/${u.id}`, 'del', null, u.id)
}

async function act(path, method, body, userId) {
  if (actingId.value != null) return
  acting.value = true
  actingId.value = userId
  try {
    if (method === 'put') await http.put(path, body || {})
    else if (method === 'post') await http.post(path, body || {})
    else await http.del(path)
    sdk.haptic('success')
    showToast(t('miniapp.ui.admin.users.opSuccess'))
    await load()
  } catch (e) {
    sdk.haptic('error')
    showToast(e?.message || t('miniapp.ui.admin.users.opFailed'), 'error')
  } finally {
    acting.value = false
    actingId.value = null
  }
}

onMounted(() => {
  // 支持从 dashboard 跳转带 filter
  const f = route.query.filter
  if (f === 'blocked' || f === 'normal') filter.value = f
  load()
})
onUnmounted(() => { if (searchTimer) clearTimeout(searchTimer) })
</script>

<style scoped>
.filter-chips { display: flex; gap: 8px; margin-bottom: 12px; }
.chip {
  padding: 6px 14px; border-radius: 999px; border: 1px solid var(--tg-border);
  background: transparent; color: var(--tg-theme-text-color); font-size: 13px; cursor: pointer;
}
.chip.active { background: var(--tg-theme-button-color); color: var(--tg-theme-button-text-color); border-color: transparent; }
.chip:active { transform: scale(0.96); }
.retry-link { min-height: 44px; background: none; border: none; color: inherit; text-decoration: underline; cursor: pointer; padding: 8px; }
.skeleton-row { display: flex; align-items: center; gap: 12px; }
.user-card { padding: 12px 14px; }
.user-head { display: flex; align-items: center; gap: 12px; }
.user-ava {
  width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
  background: color-mix(in srgb, var(--tg-theme-link-color) 16%, transparent);
  color: var(--tg-theme-link-color);
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 16px;
}
.user-info { flex: 1; min-width: 0; }
.user-name { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.user-id { font-size: 12px; color: var(--tg-theme-hint-color); margin-top: 2px; }
.user-actions { display: flex; gap: 8px; margin-top: 10px; }
.act-btn {
  flex: 1; padding: 8px 10px; border-radius: var(--tg-radius-sm); border: none;
  font-size: 13px; font-weight: 500; cursor: pointer; min-height: 44px;
}
.act-block { background: var(--app-danger-solid); color: #fff; }
.act-unblock { background: var(--app-success-solid); color: #fff; }
.act-warn { background: var(--app-warning-bg); color: var(--app-warning-text); }
.act-ghost { background: color-mix(in srgb, var(--tg-theme-text-color) 8%, transparent); color: var(--tg-theme-text-color); }
.act-btn:active { transform: scale(0.97); }
.act-btn:disabled { opacity: 0.5; }
.pagination { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 16px 0; }
.page-btn {
  padding: 8px 14px; border-radius: var(--tg-radius-sm); border: 1px solid var(--tg-border);
  background: var(--tg-card-bg); color: var(--tg-theme-text-color); font-size: 13px; cursor: pointer;
}
.page-btn:disabled { opacity: 0.4; }
.page-meta { font-size: 13px; color: var(--tg-theme-hint-color); }
.dialog-title { font-size: 16px; font-weight: 600; }
.dialog-user { font-size: 13px; color: var(--tg-theme-hint-color); }
.permanent-row { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; font-size: 14px; }
</style>
