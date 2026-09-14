/** Symptômes analysés pour les patterns (clés UI). */
export const ANALYZED_SYMPTOM_KEYS = [
  'flux',
  'douleurs_crampes',
  'douleurs_dos',
  'maux_de_tete',
  'douleur_ovulation',
  'humeur',
  'irritabilite',
  'anxiete',
  'tristesse',
  'pleurs',
  'brain_fog',
  'fatigue',
  'energie',
  'nausees',
  'ballonnements',
  'sensibilite_seins',
  'retention_eau',
  'sommeil',
  'libido',
  'acne',
  'fringales',
]

/** @typedef {'gte'|'lte'|'bool'} ThresholdKind */

/** @type {Record<string, { kind: ThresholdKind, value: number|boolean }>} */
export const SYMPTOM_THRESHOLDS = {
  flux: { kind: 'gte', value: 3 },
  douleurs_crampes: { kind: 'gte', value: 3 },
  douleurs_dos: { kind: 'gte', value: 3 },
  maux_de_tete: { kind: 'gte', value: 3 },
  douleur_ovulation: { kind: 'bool', value: true },
  humeur: { kind: 'lte', value: 2 },
  irritabilite: { kind: 'lte', value: 3 },
  anxiete: { kind: 'gte', value: 3 },
  tristesse: { kind: 'gte', value: 3 },
  pleurs: { kind: 'bool', value: true },
  brain_fog: { kind: 'gte', value: 3 },
  fatigue: { kind: 'gte', value: 3 },
  energie: { kind: 'lte', value: 2 },
  nausees: { kind: 'gte', value: 2 },
  ballonnements: { kind: 'gte', value: 3 },
  sensibilite_seins: { kind: 'gte', value: 3 },
  retention_eau: { kind: 'gte', value: 3 },
  sommeil: { kind: 'lte', value: 2 },
  libido: { kind: 'lte', value: 1 },
  acne: { kind: 'gte', value: 2 },
  fringales: { kind: 'bool', value: true },
}

// Corrige irritabilité : spec dit >= 3
SYMPTOM_THRESHOLDS.irritabilite = { kind: 'gte', value: 3 }

export const PATTERN_TYPE = {
  SIMPLE: 'simple',
  INTENSITY: 'intensité',
  DURATION: 'durée',
  COMBINED: 'combiné',
}

export const PREDEFINED_CLUSTERS = {
  cluster_spm: ['tristesse', 'irritabilite', 'fatigue', 'ballonnements', 'sensibilite_seins'],
  cluster_douleur: ['douleurs_crampes', 'douleurs_dos', 'maux_de_tete'],
  cluster_energie: ['fatigue', 'energie', 'sommeil', 'brain_fog'],
  cluster_humeur: ['humeur', 'tristesse', 'anxiete', 'irritabilite', 'pleurs'],
  cluster_physique: ['ballonnements', 'retention_eau', 'sensibilite_seins', 'acne'],
}

export const CLUSTER_LABELS = {
  cluster_spm: 'SPM (humeur & corps)',
  cluster_douleur: 'Douleurs',
  cluster_energie: 'Énergie & sommeil',
  cluster_humeur: 'Humeur',
  cluster_physique: 'Symptômes physiques',
}

export const SYMPTOM_LABELS = {
  flux: 'Flux',
  douleurs_crampes: 'Douleurs / crampes',
  douleurs_dos: 'Douleurs dos',
  maux_de_tete: 'Maux de tête',
  douleur_ovulation: "Douleur d'ovulation",
  humeur: 'Humeur',
  irritabilite: 'Irritabilité',
  anxiete: 'Anxiété',
  tristesse: 'Tristesse',
  pleurs: 'Pleurs',
  brain_fog: 'Brouillard mental',
  fatigue: 'Fatigue',
  energie: 'Énergie',
  nausees: 'Nausées',
  ballonnements: 'Ballonnements',
  sensibilite_seins: 'Sensibilité des seins',
  retention_eau: 'Rétention d’eau',
  sommeil: 'Sommeil',
  libido: 'Libido',
  acne: 'Acné',
  fringales: 'Fringales',
}

export const RATIO_MIN = 0.66
export const CYCLES_MIN = 2
export const CLUSTER_DAY_RATIO_MIN = 0.6
export const WINDOW_SIZE = 10

export function meetsThreshold(symptomKey, rawValue) {
  const rule = SYMPTOM_THRESHOLDS[symptomKey]
  if (!rule || rawValue == null || rawValue === '') return false
  if (rule.kind === 'bool') return rawValue === true
  const n = Number(rawValue)
  if (Number.isNaN(n)) return false
  if (rule.kind === 'gte') return n >= rule.value
  if (rule.kind === 'lte') return n <= rule.value
  return false
}

export function getRelativeDayWindow(jourRelatif) {
  if (jourRelatif == null || Number.isNaN(jourRelatif)) return null
  const jr = Math.max(1, Math.round(jourRelatif))
  const debut = Math.floor((jr - 1) / WINDOW_SIZE) * WINDOW_SIZE + 1
  const fin = debut + WINDOW_SIZE - 1
  return { debut, fin } // inclusif
}

export function jourRelatifInWindow(jourRelatif, debut, fin) {
  if (jourRelatif == null) return false
  const jr = Math.round(jourRelatif)
  return jr >= debut && jr <= fin
}
