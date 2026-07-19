// Mini App 路由：hash 模式（WebView 内 history 刷新会 404）
// - beforeEach: 确保 SDK 鉴权完成；admin 路由权限校验
// - afterEach: 根据 meta 配置 BackButton（root 页隐藏，子页显示），切换路由时隐藏 MainButton（由组件按需重显）
import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import { useTelegram } from '../composables/useTelegram.js'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/HomeView.vue'),
    meta: { back: false, section: 'user' },
  },
  {
    path: '/my/status',
    name: 'MyStatus',
    component: () => import('../views/MyStatusView.vue'),
    meta: { back: true, section: 'user' },
  },
  {
    path: '/my/conversations',
    name: 'MyConversations',
    component: () => import('../views/MyConversationsView.vue'),
    meta: { back: true, section: 'user' },
  },
  {
    path: '/appeal',
    name: 'Appeal',
    component: () => import('../views/AppealView.vue'),
    meta: { back: true, section: 'user' },
  },
  {
    path: '/help',
    name: 'Help',
    component: () => import('../views/HelpView.vue'),
    meta: { back: true, section: 'user' },
  },

  {
    path: '/admin',
    name: 'AdminDashboard',
    component: () => import('../views/admin/DashboardView.vue'),
    meta: { back: false, admin: true, section: 'admin' },
  },
  {
    path: '/admin/users',
    name: 'AdminUsers',
    component: () => import('../views/admin/UsersView.vue'),
    meta: { back: true, admin: true, section: 'admin' },
  },
  {
    path: '/admin/conversations',
    name: 'AdminConversations',
    component: () => import('../views/admin/ConversationsView.vue'),
    meta: { back: true, admin: true, section: 'admin' },
  },
  {
    path: '/admin/conversations/:id',
    name: 'AdminConversationDetail',
    component: () => import('../views/admin/ConversationDetailView.vue'),
    meta: { back: true, admin: true, section: 'admin' },
  },
  {
    path: '/admin/whitelist',
    name: 'AdminWhitelist',
    component: () => import('../views/admin/WhitelistView.vue'),
    meta: { back: true, admin: true, section: 'admin' },
  },
  {
    path: '/admin/settings',
    name: 'AdminSettings',
    component: () => import('../views/admin/SettingsView.vue'),
    meta: { back: true, admin: true, section: 'admin' },
  },

  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('../views/NotFoundView.vue'),
    meta: { back: true, section: 'user' },
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior() { return { top: 0 } },
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  // 等待鉴权启动完成（单飞，App.vue 与路由共享同一 Promise）
  await auth.ensureBooted()

  // 管理员权限校验：非管理员访问 admin 路由 -> 回首页
  if (to.meta.admin && !auth.isAdmin) {
    return { path: '/', replace: true }
  }
  return true
})

// 路由后置：配置 Telegram BackButton / 清理 MainButton
router.afterEach((to) => {
  const tg = useTelegram()
  // 切换路由默认隐藏 MainButton，由目标页组件按需 re-show
  tg.hideMainButton()

  if (to.meta.back === false) {
    tg.hideBackButton()
  } else {
    // 优先使用 Vue Router/浏览器原生历史，避免自定义栈在返回导航时把当前页重新压栈形成往返循环。
    tg.showBackButton(() => {
      const hasHistory = typeof window !== 'undefined' && window.history.state?.back != null
      if (hasHistory) {
        router.back()
      } else {
        const home = to.meta.section === 'admin' ? '/admin' : '/'
        router.replace(home)
      }
    })
  }
})

export default router
