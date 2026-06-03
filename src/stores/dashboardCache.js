import { ref } from 'vue'
import { defineStore } from 'pinia'

/** Événements + bloc menstruation du dashboard pour affichage immédiat au retour. */
export const useDashboardCacheStore = defineStore('dashboardCache', () => {
  const userEvents = ref([])
  const userCategories = ref([])
  const menstruationCycles = ref([])
  const menstruationCyclesNaturel = ref([])
  const menstruationMode = ref(null)
  const hasMenstruationCycleData = ref(false)
  const isValid = ref(false)

  function publish(data) {
    userEvents.value = data.userEvents ?? []
    userCategories.value = data.userCategories ?? []
    menstruationCycles.value = data.menstruationCycles ?? []
    menstruationCyclesNaturel.value = data.menstruationCyclesNaturel ?? []
    menstruationMode.value = data.menstruationMode ?? null
    hasMenstruationCycleData.value = Boolean(data.hasMenstruationCycleData)
    isValid.value = true
  }

  function applyToView(viewRefs) {
    if (!isValid.value) return false
    viewRefs.userEvents.value = [...userEvents.value]
    viewRefs.userCategories.value = [...userCategories.value]
    viewRefs.menstruationCycles.value = [...menstruationCycles.value]
    viewRefs.menstruationCyclesNaturel.value = [...menstruationCyclesNaturel.value]
    viewRefs.menstruationMode.value = menstruationMode.value
    viewRefs.hasMenstruationCycleData.value = hasMenstruationCycleData.value
    return true
  }

  return { isValid, publish, applyToView }
})
