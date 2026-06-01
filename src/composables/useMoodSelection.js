import { ref, computed } from 'vue'
import { MOODS } from '../constants/moods.js'

const selectedMoodId = ref(null)

export function useMoodSelection() {
  const selectedMood = computed(() => MOODS.find((m) => m.id === selectedMoodId.value) ?? null)

  function selectMood(id) {
    selectedMoodId.value = id
  }

  return {
    MOODS,
    selectedMoodId,
    selectedMood,
    selectMood,
  }
}
