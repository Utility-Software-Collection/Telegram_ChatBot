import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import { resolve } from 'path'

// Telegram Mini App 独立构建配置
// - root 指向 miniapp/，产物输出到 dist/miniapp（不清空 dist/，保护 Web 产物）
// - 复用 @vitejs/plugin-vue 与 vite-plugin-vuetify（autoImport 按需引入组件样式）
// - 通过别名复用 shared/ 与 miniapp/ 内部模块
export default defineConfig({
  root: 'miniapp',
  // 与联合发布路径一致，确保产物引用 /miniapp/assets/* 而不是 Web 根目录的 /assets/*
  base: '/miniapp/',
  plugins: [
    vue(),
    // autoImport: 模板中用到的 Vuetify 组件自动按需引入，控制首屏体积
    vuetify({ autoImport: true }),
  ],
  resolve: {
    alias: {
      '@miniapp': resolve(__dirname, 'miniapp'),
      '@shared': resolve(__dirname, 'shared'),
    },
  },
  build: {
    outDir: '../dist/miniapp',
    // 关键：不清空 dist/，避免破坏 Web 端构建产物
    emptyOutDir: false,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('vuetify')) return 'vuetify'
            if (id.includes('vue-router') || id.includes('pinia') || id.includes('vue')) return 'vendor'
          }
        },
      },
    },
  },
})
