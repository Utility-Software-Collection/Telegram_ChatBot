<template>
  <div class="tg-page tg-page--no-button">
    <h2 class="tg-section-title">{{ t('miniapp.ui.status.title') }}</h2>

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

    <template v-else>
      <div class="tg-card">
        <div class="tg-row">
          <span class="tg-row-label">{{ t('miniapp.ui.status.verified') }}</span>
          <span v-if="status.isVerified" class="tg-badge tg-badge-success">{{ t('miniapp.ui.status.verifiedYes') }}</span>
          <span v-else class="tg-badge tg-badge-warn">{{ t('miniapp.ui.status.verifiedNo') }}</span>
        </div>
        <div class="tg-row">
          <span class="tg-row-label">{{ t('miniapp.ui.status.blocked') }}</span>
          <span v-if="status.isBlocked" class="tg-badge tg-badge-danger">{{ t('miniapp.ui.status.blockedYes') }}</span>
          <span v-else class="tg-badge tg-badge-success">{{ t('miniapp.ui.status.blockedNo') }}</span>
        </div>
        <div v-if="status.isBlocked && status.isPermanentBlock" class="tg-row">
          <span class="tg-row-label">{{ t('miniapp.ui.status.permanentBlock') }}</span>
          <span class="tg-badge tg-badge-danger">{{ t('common.yes') || '是' }}</span>
        </div>
        <div v-if="status.isBlocked && status.blockReason" class="tg-row">
          <span class="tg-row-label">{{ t('miniapp.ui.status.blockReason') }}</span>
          <span class="tg-row-value">{{ status.blockReason }}</span>
        </div>
        <div class="tg-row">
          <span class="tg-row-label">{{ t('miniapp.ui.status.whitelisted') }}</span>
          <span v-if="status.isWhitelisted" class="tg-badge tg-badge-info">{{ t('miniapp.ui.status.whitelistedYes') }}</span>
          <span v-else class="tg-badge tg-badge-muted">{{ t('miniapp.ui.status.whitelistedNo') }}</span>
        </div>
      </div>

      <!-- 申诉入口 -->
      <div class="tg-card" v-if="status.isBlocked">
        <div class="appeal-row">
          <div>
            <div class="appeal-title">{{ t('miniapp.ui.status.canAppeal') }}</div>
            <div class="tg-subtitle" style="margin-top:2px">
              {{ status.canAppeal ? t('miniapp.ui.status.appealNow') : t('miniapp.ui.status.cannotAppeal') }}
            </div>
          </div>
          <v-btn
            variant="flat"
            :disabled="!status.canAppeal"
            @click="goAppeal"
          >{{ t('miniapp.ui.status.appealNow') }}</v-btn>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useI18nStore } from '../stores/i18n'
import { useTelegram } from '../composables/useTelegram'
import { http } from '../utils/http'

const router = useRouter()
const auth = useAuthStore()
const i18n = useI18nStore()
const sdk = useTelegram()
const t = i18n.t

const loading = ref(true)
const error = ref('')
const status = ref({
  isVerified: false, isBlocked: false, isPermanentBlock: false,
  blockReason: '', canAppeal: false, isWhitelisted: false,
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await http.get('/my/status')
    status.value = {
      isVerified: !!data.isVerified,
      isBlocked: !!data.isBlocked,
      isPermanentBlock: !!data.isPermanentBlock,
      blockReason: data.blockReason || '',
      canAppeal: !!data.canAppeal,
      isWhitelisted: !!data.isWhitelisted,
    }
  } catch (e) {
    error.value = e?.message || t('miniapp.ui.error.request')
  } finally {
    loading.value = false
  }
}

function goAppeal() {
  if (!status.value.canAppeal) {
    sdk.haptic('error')
    return
  }
  sdk.haptic('light')
  router.push('/appeal')
}

onMounted(load)
</script>

<style scoped>
.appeal-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.appeal-title { font-size: 14px; font-weight: 600; }
.retry-link { min-height: 44px; background: none; border: none; color: inherit; text-decoration: underline; cursor: pointer; padding: 8px; }
</style>
