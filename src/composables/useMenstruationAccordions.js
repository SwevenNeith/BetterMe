import { ref } from 'vue'

/** @type {import('vue').Ref<Record<string, boolean>>} */
const openMap = ref({})
const userInteracted = ref(false)
const defaultSymptomId = ref('')
const defaultHasRecurrence = ref(false)

function keyFor(kind, id) {
  return `${kind}:${id}`
}

function applyDefaults() {
  if (userInteracted.value) return

  const next = {}
  if (defaultSymptomId.value) next[keyFor('symptom', defaultSymptomId.value)] = true
  if (defaultHasRecurrence.value) next[keyFor('pattern', 'recurrence')] = true
  openMap.value = next
}

/**
 * Accordéons de la page Menstruation (symptômes + tendances).
 * Défaut : phase / période en cours ET récurrences, tous les deux ouverts.
 * Après le premier clic, un seul menu reste ouvert à la fois.
 */
export function useMenstruationAccordions() {
  function isOpen(kind, id) {
    return Boolean(openMap.value[keyFor(kind, id)])
  }

  function ensureDefaults({ symptomCurrentId, hasRecurrence } = {}) {
    if (symptomCurrentId) defaultSymptomId.value = symptomCurrentId
    if (hasRecurrence === true) defaultHasRecurrence.value = true
    applyDefaults()
  }

  function toggle(kind, id) {
    const key = keyFor(kind, id)
    userInteracted.value = true
    if (openMap.value[key] && Object.keys(openMap.value).length === 1) {
      openMap.value = {}
      return
    }
    openMap.value = { [key]: true }
  }

  function reset() {
    userInteracted.value = false
    defaultSymptomId.value = ''
    defaultHasRecurrence.value = false
    openMap.value = {}
  }

  return {
    isOpen,
    ensureDefaults,
    toggle,
    reset,
  }
}
