import { onUnmounted } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

/**
 * Annule les chargements async uniquement à la sortie de page (route) / unmount.
 * Ne réagit plus à la mise en arrière-plan (évite cancel + refetch en boucle).
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

  onBeforeRouteLeave(cancelAll)
  onUnmounted(cancelAll)

  return { scheduleBackground, clearBackgroundTimer, cancelAll }
}
