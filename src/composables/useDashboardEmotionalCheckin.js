import { computed, ref } from 'vue'

export const CHECKIN_REASSURING_NOTE =
  'Prends une respiration. Ce que tu ressens est valide — un petit pas à la fois, tu fais de ton mieux.'

export const CHECKIN_SENTIMENTS = [
  { value: 1, label: 'Très mal', detail: 'Je me sens vraiment pas bien' },
  { value: 2, label: 'Pas terrible', detail: 'Journée difficile' },
  { value: 3, label: 'Bof', detail: 'Ni bien ni mal' },
  { value: 4, label: 'Plutôt bien', detail: 'Journée correcte' },
  { value: 5, label: 'Très bien', detail: 'Je me sens bien' },
]

const humeurGenerale = ref(null)
const energieEmotionnelle = ref(null)
const besoinReassurance = ref(false)
const sentimentGeneral = ref(null)

export function useDashboardEmotionalCheckin() {
  const sentimentSelected = computed(
    () => CHECKIN_SENTIMENTS.find((s) => s.value === sentimentGeneral.value) ?? null,
  )

  function setCheckinPayload(payload = {}) {
    humeurGenerale.value =
      payload.humeurGenerale == null ? null : Number(payload.humeurGenerale)
    energieEmotionnelle.value =
      payload.energieEmotionnelle == null ? null : Number(payload.energieEmotionnelle)
    besoinReassurance.value = Boolean(payload.besoinReassurance)
    sentimentGeneral.value =
      payload.sentimentGeneral == null ? null : Number(payload.sentimentGeneral)
  }

  function resetCheckin() {
    humeurGenerale.value = null
    energieEmotionnelle.value = null
    besoinReassurance.value = false
    sentimentGeneral.value = null
  }

  function getCheckinPayload() {
    return {
      humeurGenerale: humeurGenerale.value,
      energieEmotionnelle: energieEmotionnelle.value,
      besoinReassurance: besoinReassurance.value,
      sentimentGeneral: sentimentGeneral.value,
    }
  }

  return {
    humeurGenerale,
    energieEmotionnelle,
    besoinReassurance,
    sentimentGeneral,
    sentimentSelected,
    setCheckinPayload,
    resetCheckin,
    getCheckinPayload,
  }
}
