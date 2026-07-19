<template>
  <div class="tg-page">
    <h2 class="tg-section-title">{{ t('miniapp.ui.appeal.title') }}</h2>

    <div v-if="checking" class="tg-card" aria-busy="true">
      <div class="tg-skel-stack">
        <div class="tg-skeleton tg-skel-line"></div>
        <div class="tg-skeleton tg-skel-line sm"></div>
      </div>
    </div>

    <div v-else-if="eligibilityError" class="tg-alert tg-alert-error" role="alert">
      {{ eligibilityError }}
      <button class="retry-link" @click="checkEligibility">{{ t('miniapp.ui.common.retry') }}</button>
    </div>

    <div v-else-if="!eligible" class="tg-card">
      <div class="tg-empty-title">{{ t('miniapp.ui.status.cannotAppeal') }}</div>
      <v-btn variant="tonal" class="mt-3 w-100" @click="goHome">{{ t('miniapp.ui.notFound.backHome') }}</v-btn>
    </div>

    <div v-else-if="submitted" class="tg-card">
      <div class="appeal-success">
        <v-icon size="32" color="#22c55e">mdi-check-circle</v-icon>
        <div class="appeal-success-text">{{ t('miniapp.ui.appeal.submitted') }}</div>
      </div>
      <v-btn variant="tonal" class="mt-3 w-100" @click="goHome">{{ t('miniapp.ui.notFound.backHome') }}</v-btn>
    </div>

    <template v-else>
      <div class="tg-card">
        <v-textarea
          v-model="text"
          :label="t('miniapp.ui.appeal.title')"
          :placeholder="t('miniapp.ui.appeal.placeholder')"
          :rows="8"
          auto-grow
          maxlength="2000"
          :counter="2000"
          :hint="text.trim().length < COUNTER_MIN ? t('miniapp.ui.appeal.tooShort') : t('miniapp.ui.appeal.hint')"
          persistent-hint
        />
        <div class="appeal-hint">{{ t('miniapp.ui.appeal.hint') }}</div>
      </div>

      <div v-if="error" class="tg-alert tg-alert-error">{{ error }}</div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { useI18nStore } from '../stores/i18n'
import { useTelegram } from '../composables/useTelegram'
import { useMainButton } from '../composables/useMainButton'
import { http, HttpError } from '../utils/http'

const router = useRouter()
const i18n = useI18nStore()
const sdk = useTelegram()
const t = i18n.t

const COUNTER_MIN = 10
const checking = ref(true)
const eligible = ref(false)
const eligibilityError = ref('')
const text = ref('')
const submitting = ref(false)
const error = ref('')
const submitted = ref(false)

const canSubmit = computed(() => eligible.value && text.value.trim().length >= COUNTER_MIN && text.value.trim().length <= 2000 && !submitting.value)

// MainButton：提交申诉（声明式，随 text/submitting 自动刷新状态）
useMainButton(() => (!eligible.value || checking.value || submitted.value) ? null : ({
  text: submitting.value ? t('miniapp.ui.appeal.submitting') : t('miniapp.ui.appeal.submit'),
  enabled: canSubmit.value,
  onClick: handleSubmit,
}))

async function checkEligibility() {
  checking.value = true
  eligibilityError.value = ''
  try {
    const status = await http.get('/my/status')
    eligible.value = !!status?.canAppeal
  } catch (e) {
    eligible.value = false
    eligibilityError.value = e?.message || t('miniapp.ui.error.request')
  } finally {
    checking.value = false
  }
}

async function handleSubmit() {
  if (!canSubmit.value) {
    sdk.haptic('error')
    return
  }
  submitting.value = true
  error.value = ''
  sdk.haptic('light')
  try {
    await http.post('/my/appeal', { text: text.value.trim() })
    submitted.value = true
    sdk.haptic('success')
  } catch (e) {
    if (e instanceof HttpError) {
      if (e.status === 403) error.value = t('miniapp.ui.appeal.errorCannot')
      else if (e.status === 429) error.value = t('miniapp.ui.appeal.errorRate')
      else if (text.value.trim().length < COUNTER_MIN) error.value = t('miniapp.ui.appeal.tooShort')
      else error.value = e.message || t('miniapp.ui.error.request')
    } else {
      error.value = t('miniapp.ui.error.network')
    }
    sdk.haptic('error')
  } finally {
    submitting.value = false
  }
}

function goHome() {
  sdk.haptic('light')
  router.replace('/')
}

const hasDraft = computed(() => !submitted.value && text.value.trim().length > 0)
watch(hasDraft, (dirty) => sdk.setClosingConfirmation(dirty), { immediate: true })

onBeforeRouteLeave(async () => {
  if (!hasDraft.value) return true
  return sdk.showConfirm(t('miniapp.ui.app.unsavedChanges'))
})

onMounted(checkEligibility)
onBeforeUnmount(() => sdk.setClosingConfirmation(false))
</script>

<style scoped>
.appeal-success { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 14px 0; }
.appeal-success-text { font-size: 14px; font-weight: 600; text-align: center; }
.appeal-hint { font-size: 12px; color: var(--tg-theme-hint-color); margin-top: 8px; }
.w-100 { width: 100%; }
</style>
