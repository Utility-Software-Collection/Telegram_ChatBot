<template>
  <div class="tg-page tg-page--no-button">
    <h2 class="tg-section-title">{{ t('miniapp.ui.help.title') }}</h2>
    <div class="tg-card">
      <p class="help-p">{{ t('miniapp.ui.help.p1') }}</p>
      <p class="help-p">{{ t('miniapp.ui.help.p2') }}</p>
      <p class="help-p">{{ t('miniapp.ui.help.p3') }}</p>
    </div>
  </div>
</template>

<script setup>
import { useI18nStore } from '../stores/i18n'
const i18n = useI18nStore()
const t = i18n.t
</script>

<style scoped>
.help-p { font-size: 14px; line-height: 1.7; color: var(--tg-theme-text-color); }
.help-p + .help-p { margin-top: 10px; }
</style>
