<template>
  <div class="tg-page tg-page--no-button">
    <div class="tg-empty" style="padding-top: 80px">
      <v-icon size="48" color="var(--tg-theme-hint-color)">mdi-emoticon-sad-outline</v-icon>
      <div class="tg-empty-title">{{ t('miniapp.ui.notFound.title') }}</div>
      <v-btn variant="tonal" class="mt-2" @click="goHome">{{ t('miniapp.ui.notFound.backHome') }}</v-btn>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useI18nStore } from '../stores/i18n'
import { useTelegram } from '../composables/useTelegram'

const router = useRouter()
const i18n = useI18nStore()
const tg = useTelegram()
const t = i18n.t

function goHome() {
  tg.haptic('light')
  router.replace('/')
}
</script>
