import { onMounted, onUnmounted } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import {
  TAB_HIDDEN_EVENT,
  TAB_RESUME_EVENT,
  hasActiveMutations,
  isTabReloadSuppressed,
} from './useAppTabResume.js'

/**
 * Annule les chargements async à la sortie de page / mise en arrière-plan.
 * Au retour, `onResume` peut refetch des listes en silence — jamais si une
 * mutation (save) est en cours.
 * @param {() => void} onCancel
 * @param {(() => void) | undefined} [onResume]
 */
export function useViewLoadGuard(onCancel, onResume) {
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
    if (isTabReloadSuppressed()) return
    cancelAll()
  }

  function onTabResume() {
    if (typeof onResume !== 'function') return
    if (document.visibilityState === 'hidden') return
    if (hasActiveMutations() || isTabReloadSuppressed()) return
    onResume()
  }

  onBeforeRouteLeave(cancelAll)
  onMounted(() => {
    window.addEventListener(TAB_HIDDEN_EVENT, onTabHidden)
    window.addEventListener(TAB_RESUME_EVENT, onTabResume)
  })
  onUnmounted(() => {
    window.removeEventListener(TAB_HIDDEN_EVENT, onTabHidden)
    window.removeEventListener(TAB_RESUME_EVENT, onTabResume)
    cancelAll()
  })

  return { scheduleBackground, clearBackgroundTimer, cancelAll }
}
