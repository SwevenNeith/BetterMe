import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useTimetableCacheStore = defineStore('timetableCache', () => {
  const userEvents = ref([])
  const userCategories = ref([])
  const hobbyQuickPicks = ref([])
  const isValid = ref(false)

  function publish({ userEvents: events, userCategories: cats, hobbyQuickPicks: hobbies }) {
    userEvents.value = events ?? []
    userCategories.value = cats ?? []
    hobbyQuickPicks.value = hobbies ?? []
    isValid.value = true
  }

  function applyToView(viewRefs) {
    if (!isValid.value) return false
    viewRefs.userEvents.value = [...userEvents.value]
    viewRefs.userCategories.value = [...userCategories.value]
    viewRefs.hobbyQuickPicks.value = [...hobbyQuickPicks.value]
    return true
  }

  return { isValid, publish, applyToView }
})
