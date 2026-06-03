import { onMounted, onUnmounted } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { TAB_HIDDEN_EVENT } from './useAppTabResume.js'

/**
 * Invalide les chargements async quand on quitte la page (route) ou l’onglet navigateur.
 * Au retour d’onglet navigateur, useAppTabResume (App.vue) recharge la page.
 * @param {() => void} onCancel
 */
export function useViewLoadGuard(onCancel) {
  let backgroundTimer = null

  function clearBackgroundTimer() {
    if (backgroundTimer != null) {
      clearTimeout(backgroundTimer)
      backgroundTimer = null
    }
  }

  function cancelAll() {
    clearBackgroundTimer()
    onCancel()
  }

  function scheduleBackground(task, delayMs = 400) {
    clearBackgroundTimer()
    backgroundTimer = setTimeout(() => {
      backgroundTimer = null
      if (document.visibilityState === 'hidden') return
      task()
    }, delayMs)
  }

  function onTabHidden() {
    cancelAll()
  }

  onBeforeRouteLeave(cancelAll)
  onMounted(() => {
    window.addEventListener(TAB_HIDDEN_EVENT, onTabHidden)
  })
  onUnmounted(() => {
    window.removeEventListener(TAB_HIDDEN_EVENT, onTabHidden)
    cancelAll()
  })

  return { scheduleBackground, clearBackgroundTimer, cancelAll }
}
