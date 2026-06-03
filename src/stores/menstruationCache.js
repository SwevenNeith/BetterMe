import { ref } from 'vue'
import { defineStore } from 'pinia'

/** Données cycle affichées tout de suite au retour sur la page Menstruation. */
export const useMenstruationCacheStore = defineStore('menstruationCache', () => {
  const cycles = ref([])
  const cyclesNaturel = ref([])
  const cycleMode = ref(null)
  const hasCycleData = ref(false)
  const isValid = ref(false)

  function publish({ cycles: c, cyclesNaturel: cn, cycleMode: mode, hasCycleData: has }) {
    cycles.value = c ?? []
    cyclesNaturel.value = cn ?? []
    cycleMode.value = mode ?? null
    hasCycleData.value = Boolean(has)
    isValid.value = true
  }

  function applyToView(viewRefs) {
    if (!isValid.value) return false
    viewRefs.cycles.value = [...cycles.value]
    viewRefs.cyclesNaturel.value = [...cyclesNaturel.value]
    viewRefs.cycleMode.value = cycleMode.value
    viewRefs.hasCycleData.value = hasCycleData.value
    return true
  }

  return { isValid, publish, applyToView }
})
