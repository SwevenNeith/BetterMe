import { CHECKIN_SENTIMENTS } from '../composables/useDashboardEmotionalCheckin.js'
import { PILULE_SYMPTOMS_BY_PERIOD } from '../services/menstruationSymptomsPilule.js'
import { NATUREL_SYMPTOMS_BY_PHASE } from '../services/menstruationSymptomsNaturel.js'

const EXCLUDED_SYMPTOM_KEYS = new Set([
  'acne',
  'ballonnements',
  'caillots',
  'couleur_flux',
  'douleur_ovulation',
  'flux',
  'fringales',
  'nausees',
  'peau',
  'pertes_vaginales',
  'pleurs',
  'retention_eau',
  'sensibilite_seins',
])

/** Symptômes avec uniquement la variante « élevé » */
const SYMPTOM_HIGH_ONLY_KEYS = new Set([
  'anxiete',
  'brain_fog',
  'douleurs_crampes',
  'douleurs_dos',
  'fatigue',
  'irritabilite',
  'maux_de_tete',
  'tristesse',
])

/** Seul symptôme conservant les variantes « élevé » et « faible » */
const SYMPTOM_BOTH_KEYS = new Set(['libido'])

function collectUniqueSymptoms() {
  const byKey = new Map()
  const allDefs = [
    ...Object.values(PILULE_SYMPTOMS_BY_PERIOD).flat(),
    ...Object.values(NATUREL_SYMPTOMS_BY_PHASE).flat(),
  ]

  for (const def of allDefs) {
    if (EXCLUDED_SYMPTOM_KEYS.has(def.key)) continue
    if (!byKey.has(def.key)) {
      byKey.set(def.key, def.label)
    }
  }

  return [...byKey.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr'))
}

function buildSymptomConditions() {
  const options = []
  for (const [key, label] of collectUniqueSymptoms()) {
    const showHigh = SYMPTOM_BOTH_KEYS.has(key) || SYMPTOM_HIGH_ONLY_KEYS.has(key)
    const showLow = SYMPTOM_BOTH_KEYS.has(key) || !SYMPTOM_HIGH_ONLY_KEYS.has(key)

    if (showHigh) {
      options.push({
        id: `symptom:${key}:high`,
        label: `${label} — élevé`,
      })
    }
    if (showLow) {
      options.push({
        id: `symptom:${key}:low`,
        label: `${label} — faible`,
      })
    }
  }
  return options
}

function buildDashboardCheckinConditions() {
  const options = [
    { id: 'checkin:humeur_generale:high', label: 'Humeur générale — élevé(e)' },
    { id: 'checkin:humeur_generale:low', label: 'Humeur générale — faible' },
    { id: 'checkin:energie_emotionnelle:high', label: 'Énergie émotionnelle — élevé(e)' },
    { id: 'checkin:energie_emotionnelle:low', label: 'Énergie émotionnelle — faible' },
    { id: 'checkin:besoin_reassurance', label: 'Besoin de réassurance' },
  ]

  for (const sentiment of CHECKIN_SENTIMENTS) {
    options.push({
      id: `checkin:sentiment_general:${sentiment.value}`,
      label: `Sentiment général — ${sentiment.label}`,
    })
  }

  return options
}

export const RECONFORT_CONDITION_GROUPS = [
  {
    id: 'dashboard_checkin',
    label: 'Check-in Dashboard',
    options: buildDashboardCheckinConditions(),
  },
  {
    id: 'menstruation',
    label: 'Symptômes menstruation',
    options: buildSymptomConditions(),
  },
]
