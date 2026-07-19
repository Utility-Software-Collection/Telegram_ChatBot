// Mini App 入口
// - 安装 Pinia / Router / Vuetify
// - 挂载前初始化 Telegram SDK（ready/expand）
// - 启动主题同步
import { createApp } from 'vue'
import { createPinia } from 'pinia'
// Vuetify 样式（含组件按需样式，由 vite-plugin-vuetify 注入）
import 'vuetify/styles'
import App from './App.vue'
import router from './router'
import { vuetify } from './plugins/vuetify'
import { useTelegram } from './composables/useTelegram'
import './style.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(vuetify)
app.use(router)

// 挂载前初始化 Telegram SDK：声明 ready 并展开
useTelegram().init()

app.mount('#app')
