<template>
  <div class="tg-page">
    <h2 class="tg-section-title">{{ t('miniapp.ui.admin.settings.title') }}</h2>

    <div v-if="loading" class="tg-card">
      <div class="tg-skel-stack">
        <div class="tg-skeleton tg-skel-line"></div>
        <div class="tg-skeleton tg-skel-line sm"></div>
        <div class="tg-skeleton tg-skel-line"></div>
      </div>
    </div>

    <div v-else-if="error" class="tg-alert tg-alert-error" role="alert">
      {{ error }}
      <button class="retry-link" @click="load">{{ t('miniapp.ui.common.retry') }}</button>
    </div>

    <div v-else-if="!loaded" class="tg-empty">
      <v-icon size="40" color="var(--tg-theme-hint-color)">mdi-cog-off-outline</v-icon>
      <div class="tg-empty-title">{{ t('miniapp.ui.admin.settings.noFields') }}</div>
    </div>

    <template v-else>
      <div v-if="successMsg" class="tg-alert tg-alert-success" role="status">{{ successMsg }}</div>

      <div class="tg-card" v-for="f in fields" :key="f.key">
        <div class="field-label">{{ f.label }}</div>
        <div class="field-key">{{ f.key }}</div>

        <!-- 布尔开关 -->
        <v-switch
          v-if="f.type === 'bool'"
          v-model="form[f.key]"
          :label="f.label"
          :aria-label="f.label"
          color="primary"
          inset
          hide-details
          density="compact"
          :true-value="true"
          :false-value="false"
          class="mt-1"
        />
        <!-- 数字 -->
        <v-text-field
          v-else-if="f.type === 'number'"
          v-model.number="form[f.key]"
          :label="f.label"
          type="number"
          variant="outlined"
          density="compact"
          hide-details
          class="mt-1"
        />
        <!-- 长文本 -->
        <v-textarea
          v-else-if="f.type === 'longtext'"
          v-model="form[f.key]"
          :label="f.label"
          variant="outlined"
          density="compact"
          hide-details
          :rows="3"
          auto-grow
          class="mt-1"
        />
        <!-- 短文本 -->
        <v-text-field
          v-else
          v-model="form[f.key]"
          :label="f.label"
          variant="outlined"
          density="compact"
          hide-details
          class="mt-1"
        />
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useI18nStore } from '../../stores/i18n'
import { useTelegram } from '../../composables/useTelegram'
import { useMainButton } from '../../composables/useMainButton'
import { http } from '../../utils/http'

const i18n = useI18nStore()
const sdk = useTelegram()
const t = i18n.t

const loading = ref(false)
const loaded = ref(false)
const saving = ref(false)
const error = ref('')
const successMsg = ref('')
const rawSettings = ref({})
const form = ref({})

// 与后端 SETTINGS_PUT_WHITELIST 保持一一对应：只展示 Mini App 获准修改的 17 个非敏感字段。
// 后端设置统一以字符串存储，因此字段类型必须显式声明，不能按运行时值推断。
const FIELD_DEFS = [
  { key: 'VERIFICATION_ENABLED', type: 'bool' },
  { key: 'VERIFICATION_TIMEOUT', type: 'number' },
  { key: 'MAX_VERIFICATION_ATTEMPTS', type: 'number' },
  { key: 'AUTO_UNBLOCK_ENABLED', type: 'bool' },
  { key: 'MAX_MESSAGES_PER_MINUTE', type: 'number' },
  { key: 'INLINE_KB_MSG_DELETE_ENABLED', type: 'bool' },
  { key: 'INLINE_KB_MSG_DELETE_SECONDS', type: 'number' },
  { key: 'USER_MSG_DELETE_SECONDS', type: 'number' },
  { key: 'CAPTCHA_TYPE', type: 'text' },
  { key: 'WELCOME_ENABLED', type: 'bool' },
  { key: 'WELCOME_MESSAGE', type: 'longtext' },
  { key: 'BOT_COMMAND_FILTER', type: 'bool' },
  { key: 'WHITELIST_ENABLED', type: 'bool' },
  { key: 'ADMIN_NOTIFY_ENABLED', type: 'bool' },
  { key: 'BOT_LOCALE', type: 'text' },
  { key: 'ZALGO_FILTER_ENABLED', type: 'bool' },
  { key: 'MESSAGE_FILTER_RULES', type: 'longtext' },
]

function normalizeValue(value, type) {
  if (type === 'bool') return value === true || String(value).toLowerCase() === 'true'
  if (type === 'number') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return value == null ? '' : String(value)
}

function humanize(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

const fields = computed(() => FIELD_DEFS.map((field) => ({
  ...field,
  label: humanize(field.key),
})))

const dirty = computed(() => loaded.value &&
  fields.value.some((f) => {
    const cur = form.value[f.key]
    const orig = rawSettings.value[f.key]
    // 数字字符串与数字比较容差
    if (f.type === 'number') return Number(cur) !== Number(orig)
    return cur !== orig
  })
)

// MainButton：保存设置（dirty 时启用）
useMainButton(() => ({
  text: saving.value ? t('miniapp.ui.admin.settings.saving') : t('miniapp.ui.admin.settings.save'),
  enabled: dirty.value && !saving.value,
  onClick: save,
}))

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await http.get('/admin/settings')
    const settings = data?.settings || data || {}
    const normalized = {}
    for (const field of FIELD_DEFS) {
      normalized[field.key] = normalizeValue(settings[field.key], field.type)
    }
    rawSettings.value = { ...normalized }
    form.value = { ...normalized }
    loaded.value = true
  } catch (e) {
    error.value = e?.message || t('miniapp.ui.error.request')
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!dirty.value || saving.value) { sdk.haptic('error'); return }
  saving.value = true
  error.value = ''
  successMsg.value = ''
  sdk.haptic('light')
  try {
    // 仅提交变更字段；密钥类不在此处（已被过滤），后端也会忽略
    const payload = {}
    for (const f of fields.value) {
      const cur = form.value[f.key]
      const orig = rawSettings.value[f.key]
      if (f.type === 'number') {
        if (Number(cur) !== Number(orig)) payload[f.key] = Number(cur)
      } else if (cur !== orig) {
        payload[f.key] = cur
      }
    }
    if (Object.keys(payload).length) {
      await http.put('/admin/settings', payload)
      // 同步本地原始值，清除 dirty
      for (const [k, v] of Object.entries(payload)) rawSettings.value[k] = v
    }
    sdk.haptic('success')
    successMsg.value = t('miniapp.ui.admin.settings.saved')
  } catch (e) {
    sdk.haptic('error')
    error.value = e?.message || t('miniapp.ui.admin.settings.saveFailed')
  } finally {
    saving.value = false
  }
}

watch(dirty, (value) => sdk.setClosingConfirmation(value), { immediate: true })
onBeforeRouteLeave(async () => {
  if (!dirty.value) return true
  return sdk.showConfirm(t('miniapp.ui.app.unsavedChanges'))
})

onMounted(load)
onBeforeUnmount(() => sdk.setClosingConfirmation(false))
</script>

<style scoped>
.retry-link { min-height: 44px; background: none; border: none; color: inherit; text-decoration: underline; cursor: pointer; padding: 8px; }
.field-label { font-size: 14px; font-weight: 600; color: var(--tg-theme-text-color); }
.field-key { font-size: 11px; color: var(--tg-theme-hint-color); margin-bottom: 4px; font-family: monospace; }
.settings-hint { font-size: 12px; color: var(--tg-theme-hint-color); margin-top: 12px; text-align: center; }
</style>
