import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { supabase } from '../lib/supabase.js'
import {
  loadDashboardVisibility,
  isDashboardWidgetVisible,
  getDashboardLayout,
  DASHBOARD_VISIBILITY_UPDATED_EVENT,
  mergeDashboardVisibility,
} from '../services/dashboard/dashboardVisibility.js'

/**
 * Visibilité des blocs du Dashboard (Réglages → Visibilité → Dashboard).
 * @param {{ userId: import('vue').Ref<string|null> }} options
 */
const EMPTY_DASHBOARD_LAYOUT = Object.freeze({
  desktop: Object.freeze({ top: [], left: [], right: [], bottom: [] }),
  mobile: Object.freeze([]),
  mobileGroups: Object.freeze([]),
})

export function useDashboardVisibility({ userId }) {
  const dashboardVisibility = ref(mergeDashboardVisibility(null))
  const isDashboardVisibilityLoading = ref(Boolean(userId.value))
  const hasLoadedDashboardVisibility = ref(false)

  const dashboardLayout = computed(() => {
    // Évite de monter tous les widgets par défaut avant le SELECT réel.
    if (!hasLoadedDashboardVisibility.value) return EMPTY_DASHBOARD_LAYOUT
    return getDashboardLayout(dashboardVisibility.value)
  })

  async function reloadDashboardVisibility() {
    if (!userId.value) {
      dashboardVisibility.value = mergeDashboardVisibility(null)
      isDashboardVisibilityLoading.value = false
      hasLoadedDashboardVisibility.value = false
      return
    }

    isDashboardVisibilityLoading.value = true
    try {
      dashboardVisibility.value = await loadDashboardVisibility(supabase, userId.value)
      hasLoadedDashboardVisibility.value = true
    } catch (err) {
      console.error('dashboard visibility:', err)
      dashboardVisibility.value = mergeDashboardVisibility(null)
      hasLoadedDashboardVisibility.value = true
    } finally {
      isDashboardVisibilityLoading.value = false
    }
  }

  function isWidgetVisible(widgetId) {
    return isDashboardWidgetVisible(widgetId, dashboardVisibility.value)
  }

  function visibleWidgetIds(ids) {
    return (ids ?? []).filter((id) => isWidgetVisible(id))
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
    dashboardLayout,
    isDashboardVisibilityLoading,
    hasLoadedDashboardVisibility,
    isWidgetVisible,
    visibleWidgetIds,
    reloadDashboardVisibility,
  }
}
