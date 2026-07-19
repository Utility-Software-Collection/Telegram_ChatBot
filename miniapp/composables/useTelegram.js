// Telegram WebApp SDK 封装
// - 所有调用前检测 window.Telegram?.WebApp 存在性，缺失则降级（便于本地预览）
// - MainButton/BackButton 维护单例 handler，切换时自动解绑，避免重复回调
// - haptic 统一三类：impact(light/medium/heavy/rigid/soft)、notification(success/warning/error)、selection

function getWebApp() {
  return (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) || null
}

function safeRun(fn) {
  try { fn() } catch (e) { /* 静默：非致命 SDK 调用失败不影响业务 */ }
}

// 单例回调引用：保证同时只注册一个 MainButton/BackButton click handler
let _mainButtonHandler = null
let _backButtonHandler = null

export function useTelegram() {
  const api = {
    get webApp() { return getWebApp() },
    get available() { return !!getWebApp() },
    get initData() { return getWebApp()?.initData || '' },
    get initDataUnsafe() { return getWebApp()?.initDataUnsafe || {} },
    get colorScheme() { return getWebApp()?.colorScheme || 'light' },
    get themeParams() { return getWebApp()?.themeParams || {} },
    get platform() { return getWebApp()?.platform || 'unknown' },
    get viewportHeight() { return getWebApp()?.viewportHeight || 0 },
    get viewportStableHeight() { return getWebApp()?.viewportStableHeight || 0 },

    /** 初始化 SDK：ready + expand + 关闭二次确认 */
    init() {
      const wa = getWebApp()
      if (!wa) return
      safeRun(() => wa.ready())
      safeRun(() => wa.expand())
    },

    /** 监听主题变化，返回取消监听函数 */
    onThemeChanged(cb) {
      const wa = getWebApp()
      if (!wa || !wa.onEvent) return () => {}
      const wrapped = () => cb(api)
      safeRun(() => wa.onEvent('themeChanged', wrapped))
      return () => safeRun(() => wa.offEvent?.('themeChanged', wrapped))
    },

    /** 监听视口尺寸变化（键盘弹出等） */
    onViewportChanged(cb) {
      const wa = getWebApp()
      if (!wa || !wa.onEvent) return () => {}
      const wrapped = () => cb(api)
      safeRun(() => wa.onEvent('viewportChanged', wrapped))
      return () => safeRun(() => wa.offEvent?.('viewportChanged', wrapped))
    },

    /**
     * 配置并显示 MainButton
     * @param {Object} opts { text, onClick, enabled, color, textColor }
     */
    mainButton({ text, onClick, enabled = true, color, textColor } = {}) {
      const wa = getWebApp()
      const mb = wa?.MainButton
      if (!mb) return
      safeRun(() => {
        if (text != null) mb.setText(text)
        const params = {}
        if (color) params.color = color
        if (textColor) params.text_color = textColor
        if (Object.keys(params).length) mb.setParams?.(params)
      })
      // 解绑旧 handler，避免累积
      if (_mainButtonHandler) { safeRun(() => mb.offClick(_mainButtonHandler)); _mainButtonHandler = null }
      if (typeof onClick === 'function') {
        _mainButtonHandler = onClick
        safeRun(() => mb.onClick(_mainButtonHandler))
      }
      safeRun(() => (enabled ? mb.enable() : mb.disable()))
      safeRun(() => mb.show())
    },
    setMainButtonEnabled(enabled) { safeRun(() => { const mb = getWebApp()?.MainButton; if (!mb) return; enabled ? mb.enable() : mb.disable() }) },
    setMainButtonText(text) { safeRun(() => getWebApp()?.MainButton?.setText(text)) },
    hideMainButton() {
      const mb = getWebApp()?.MainButton
      if (!mb) return
      if (_mainButtonHandler) { safeRun(() => mb.offClick(_mainButtonHandler)); _mainButtonHandler = null }
      safeRun(() => mb.hide())
    },

    /** 显示返回按钮并绑定回调 */
    showBackButton(cb) {
      const bb = getWebApp()?.BackButton
      if (!bb) return
      if (_backButtonHandler) { safeRun(() => bb.offClick(_backButtonHandler)); _backButtonHandler = null }
      if (typeof cb === 'function') { _backButtonHandler = cb; safeRun(() => bb.onClick(_backButtonHandler)) }
      safeRun(() => bb.show())
    },
    hideBackButton() {
      const bb = getWebApp()?.BackButton
      if (!bb) return
      if (_backButtonHandler) { safeRun(() => bb.offClick(_backButtonHandler)); _backButtonHandler = null }
      safeRun(() => bb.hide())
    },

    /**
     * 触发触觉反馈
     * @param {string} type light/medium/heavy/rigid/soft | success/warning/error | selection
     */
    haptic(type = 'light') {
      const wa = getWebApp()
      const hf = wa?.HapticFeedback
      if (!hf) return
      if (type === 'success' || type === 'warning' || type === 'error') {
        safeRun(() => hf.notificationOccurred(type))
      } else if (type === 'selection') {
        safeRun(() => hf.selectionChanged())
      } else {
        // impactOccurred 支持上述五档；未知档位降级为 light
        const allowed = ['light', 'medium', 'heavy', 'rigid', 'soft']
        safeRun(() => hf.impactOccurred(allowed.includes(type) ? type : 'light'))
      }
    },

    /** 原生弹窗（降级 window.alert） */
    showAlert(message) {
      const wa = getWebApp()
      if (wa?.showAlert) { safeRun(() => wa.showAlert(message)); return }
      window.alert(message)
    },

    /** 原生确认弹窗，返回 Promise<boolean>（降级 window.confirm） */
    showConfirm(message) {
      const wa = getWebApp()
      if (wa?.showConfirm) {
        return new Promise((resolve) => {
          try { wa.showConfirm(message, (ok) => resolve(!!ok)) }
          catch { resolve(!!window.confirm(message)) }
        })
      }
      return Promise.resolve(!!window.confirm(message))
    },

    /** 仅在页面存在未保存内容时启用关闭确认，避免每次关闭都打扰用户 */
    setClosingConfirmation(enabled) {
      const wa = getWebApp()
      if (!wa) return
      safeRun(() => enabled ? wa.enableClosingConfirmation?.() : wa.disableClosingConfirmation?.())
    },

    /** 关闭 Mini App */
    close() { safeRun(() => getWebApp()?.close()) },
  }
  return api
}
