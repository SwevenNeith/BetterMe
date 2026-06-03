import { useDashboardCacheStore } from './dashboardCache.js'
import { useMenstruationCacheStore } from './menstruationCache.js'
import { useTimetableCacheStore } from './timetableCache.js'

/** Invalide les caches Pinia avant un remontage discret de la vue active. */
export function invalidateAllPageCaches() {
  useMenstruationCacheStore().$patch({ isValid: false })
  useDashboardCacheStore().$patch({ isValid: false })
  useTimetableCacheStore().$patch({ isValid: false })
}
