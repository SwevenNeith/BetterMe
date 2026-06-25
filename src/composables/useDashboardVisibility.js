import { ref, onMounted, onUnmounted, watch } from 'vue'
import { supabase } from '../lib/supabase.js'
import {
  loadDashboardVisibility,
  isDashboardWidgetVisible,
  DASHBOARD_VISIBILITY_UPDATED_EVENT,
  mergeDashboardVisibility,
} from '../services/dashboardVisibility.js'

/**
 * Visibilité des blocs du Dashboard (Réglages → Visibilité → Dashboard).
 * @param {{ userId: import('vue').Ref<string|null> }} options
 */
export function useDashboardVisibility({ userId }) {
  const dashboardVisibility = ref(mergeDashboardVisibility(null))
  const isDashboardVisibilityLoading = ref(false)

  async function reloadDashboardVisibility() {
    if (!userId.value) {
      dashboardVisibility.value = mergeDashboardVisibility(null)
      return
    }

    isDashboardVisibilityLoading.value = true
    try {
      dashboardVisibility.value = await loadDashboardVisibility(supabase, userId.value)
    } catch (err) {
      console.error('dashboard visibility:', err)
      dashboardVisibility.value = mergeDashboardVisibility(null)
    } finally {
      isDashboardVisibilityLoading.value = false
    }
  }

  function isWidgetVisible(widgetId) {
    return isDashboardWidgetVisible(widgetId, dashboardVisibility.value)
  }

  onMounted(() => {
    window.addEventListener(DASHBOARD_VISIBILITY_UPDATED_EVENT, reloadDashboardVisibility)
  })

  onUnmounted(() => {
    window.removeEventListener(DASHBOARD_VISIBILITY_UPDATED_EVENT, reloadDashboardVisibility)
  })

  watch(
    userId,
    (id) => {
      if (id) void reloadDashboardVisibility()
      else dashboardVisibility.value = mergeDashboardVisibility(null)
    },
    { immediate: true },
  )

  return {
    dashboardVisibility,
    isDashboardVisibilityLoading,
    isWidgetVisible,
    reloadDashboardVisibility,
  }
}
