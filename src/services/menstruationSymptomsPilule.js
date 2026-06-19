import {
  COL,
  addDaysToISODate,
  getEffectiveDebutRegles,
  getEffectiveFinRegles,
  getDureeReglesForCalcul,
  applySpmDatesEstimees,
} from './menstruationCycles.js'
import { getLocalTodayISO } from './scheduledReminders.js'

export const PILULE_SYMPTOM_PERIOD = {
  ACTIVE: 'active',
  SPM: 'spm',
  RULES: 'regles',
  /** Prise active + SPM regroupés (affichage & persistance unifiés). */
  CYCLE: 'cycle',
}

/** @typedef {'scale'|'boolean'|'enum'} SymptomFieldType */

/**
 * @typedef {Object} SymptomDef
 * @property {string} key
 * @property {string} label
 * @property {SymptomFieldType} type
 * @property {number} [min]
 * @property {number} [max]
 * @property {{ value: string, label: string }[]} [options]
 */

export const PILULE_SYMPTOMS_BY_PERIOD = {
  [PILULE_SYMPTOM_PERIOD.ACTIVE]: [
    { key: 'humeur', label: 'Humeur', type: 'scale', min: 1, max: 5 },
    { key: 'energie', label: 'Énergie', type: 'scale', min: 0, max: 5 },
    { key: 'anxiete', label: 'Anxiété', type: 'scale', min: 0, max: 5 },
    { key: 'libido', label: 'Libido', type: 'scale', min: 0, max: 3 },
    { key: 'acne', label: 'Acné', type: 'scale', min: 0, max: 3 },
    { key: 'nausees', label: 'Nausées', type: 'scale', min: 0, max: 5 },
    { key: 'maux_de_tete', label: 'Maux de tête', type: 'scale', min: 0, max: 5 },
  ],
  [PILULE_SYMPTOM_PERIOD.SPM]: [
    { key: 'humeur', label: 'Humeur', type: 'scale', min: 1, max: 5 },
    { key: 'irritabilite', label: 'Irritabilité', type: 'scale', min: 0, max: 5 },
    { key: 'anxiete', label: 'Anxiété', type: 'scale', min: 0, max: 5 },
    { key: 'tristesse', label: 'Tristesse', type: 'scale', min: 0, max: 5 },
    { key: 'pleurs', label: 'Pleurs', type: 'boolean' },
    { key: 'fatigue', label: 'Fatigue', type: 'scale', min: 0, max: 5 },
    { key: 'ballonnements', label: 'Ballonnements', type: 'scale', min: 0, max: 5 },
    { key: 'sensibilite_seins', label: 'Sensibilité des seins', type: 'scale', min: 0, max: 5 },
    { key: 'fringales', label: 'Fringales', type: 'boolean' },
    { key: 'acne', label: 'Acné', type: 'scale', min: 0, max: 3 },
    { key: 'sommeil', label: 'Sommeil', type: 'scale', min: 0, max: 5 },
    { key: 'brain_fog', label: 'Brouillard mental', type: 'scale', min: 0, max: 5 },
  ],
  [PILULE_SYMPTOM_PERIOD.RULES]: [
    { key: 'flux', label: 'Flux', type: 'scale', min: 1, max: 4 },
    {
      key: 'couleur_flux',
      label: 'Couleur du flux',
      type: 'enum',
      options: [
        { value: 'rouge_vif', label: 'Rouge vif' },
        { value: 'bordeaux', label: 'Bordeaux' },
        { value: 'brun', label: 'Brun' },
        { value: 'rose', label: 'Rosé' },
      ],
    },
    { key: 'caillots', label: 'Caillots', type: 'boolean' },
    { key: 'douleurs_crampes', label: 'Douleurs / crampes', type: 'scale', min: 0, max: 5 },
    { key: 'douleurs_dos', label: 'Douleurs dos', type: 'scale', min: 0, max: 5 },
    { key: 'maux_de_tete', label: 'Maux de tête', type: 'scale', min: 0, max: 5 },
    { key: 'fatigue', label: 'Fatigue', type: 'scale', min: 0, max: 5 },
    { key: 'nausees', label: 'Nausées', type: 'scale', min: 0, max: 5 },
  ],
}

export const PILULE_SYMPTOM_PERIOD_LABELS = {
  [PILULE_SYMPTOM_PERIOD.ACTIVE]: 'Symptômes du cycle pilule',
  [PILULE_SYMPTOM_PERIOD.SPM]: 'Symptômes du cycle pilule',
  [PILULE_SYMPTOM_PERIOD.CYCLE]: 'Symptômes du cycle pilule',
  [PILULE_SYMPTOM_PERIOD.RULES]: 'Règles',
}

export const PILULE_SYMPTOM_PERIOD_ACCORDION = {
  [PILULE_SYMPTOM_PERIOD.ACTIVE]: { label: 'Prise active', emoji: '💊' },
  [PILULE_SYMPTOM_PERIOD.SPM]: { label: 'SPM', emoji: '🌙' },
  [PILULE_SYMPTOM_PERIOD.RULES]: { label: 'Règles', emoji: '🔴' },
}

export const PILULE_PERIOD_ORDER = [
  PILULE_SYMPTOM_PERIOD.ACTIVE,
  PILULE_SYMPTOM_PERIOD.SPM,
  PILULE_SYMPTOM_PERIOD.RULES,
]

function mergeSymptomDefs(periodKeys) {
  const byKey = new Map()
  for (const periodKey of periodKeys) {
    for (const def of PILULE_SYMPTOMS_BY_PERIOD[periodKey] ?? []) {
      if (!byKey.has(def.key)) {
        byKey.set(def.key, def)
      }
    }
  }
  return [...byKey.values()]
}

export function getCombinedActiveAndSpmSymptoms() {
  return mergeSymptomDefs([PILULE_SYMPTOM_PERIOD.ACTIVE, PILULE_SYMPTOM_PERIOD.SPM])
}

/** Phase utilisée pour charger / enregistrer les symptômes (hors règles = liste unifiée). */
export function getPiluleSymptomPersistencePeriod(periodKey) {
  if (periodKey === PILULE_SYMPTOM_PERIOD.RULES) {
    return PILULE_SYMPTOM_PERIOD.RULES
  }
  return PILULE_SYMPTOM_PERIOD.CYCLE
}

function isoInRange(iso, start, end) {
  if (!iso || !start || !end) return false
  return iso >= start && iso <= end
}

function getReglesWindow(row) {
  const debut = getEffectiveDebutRegles(row)
  if (!debut) return null
  let fin = getEffectiveFinRegles(row)
  if (!fin) {
    const duree = getDureeReglesForCalcul(row)
    fin = addDaysToISODate(debut, duree)
  }
  return { start: debut, end: fin }
}

function getSpmWindow(row) {
  const startReel = row['date_début_spm_réelle']
  const endReel = row['date_fin_spm_réelle']
  if (startReel && endReel) {
    return { start: startReel, end: endReel }
  }

  let start = row[COL.dateDebutSpmEstimee]
  let end = row[COL.dateFinSpmEstimee]
  if (!start || !end) {
    const temp = { ...row }
    applySpmDatesEstimees(temp)
    start = temp[COL.dateDebutSpmEstimee]
    end = temp[COL.dateFinSpmEstimee]
  }
  if (!start || !end) return null
  return { start, end }
}

/**
 * Détermine la période pilule du jour (règles > SPM > prise active).
 * @param {Array} cycles
 * @param {string} [iso]
 */
export function getPilulePeriodContext(cycles, iso = getLocalTodayISO()) {
  const sorted = [...(cycles || [])].sort(
    (a, b) => (b[COL.numeroCycle] ?? 0) - (a[COL.numeroCycle] ?? 0),
  )

  for (const row of sorted) {
    const regles = getReglesWindow(row)
    if (regles && isoInRange(iso, regles.start, regles.end)) {
      return { period: PILULE_SYMPTOM_PERIOD.RULES, cycle: row, iso }
    }
  }

  for (const row of sorted) {
    const spm = getSpmWindow(row)
    if (spm && isoInRange(iso, spm.start, spm.end)) {
      return { period: PILULE_SYMPTOM_PERIOD.SPM, cycle: row, iso }
    }
  }

  const started = sorted.filter(
    (r) => r[COL.dateDebutPlaquette] && r[COL.dateDebutPlaquette] <= iso,
  )
  const cycle = started[0] ?? sorted[sorted.length - 1] ?? null

  return {
    period: PILULE_SYMPTOM_PERIOD.ACTIVE,
    cycle,
    iso,
  }
}

export function getOrderedPilulePeriods(currentPeriod) {
  const normalized =
    currentPeriod === PILULE_SYMPTOM_PERIOD.CYCLE
      ? PILULE_SYMPTOM_PERIOD.ACTIVE
      : currentPeriod
  if (!normalized || !PILULE_PERIOD_ORDER.includes(normalized)) {
    return [...PILULE_PERIOD_ORDER]
  }
  const idx = PILULE_PERIOD_ORDER.indexOf(normalized)
  return [...PILULE_PERIOD_ORDER.slice(idx), ...PILULE_PERIOD_ORDER.slice(0, idx)]
}

export function getAllPiluleSymptomDefs() {
  return mergeSymptomDefs(PILULE_PERIOD_ORDER)
}

export function getSymptomsForPeriod(periodKey) {
  if (periodKey === PILULE_SYMPTOM_PERIOD.RULES) {
    return PILULE_SYMPTOMS_BY_PERIOD[PILULE_SYMPTOM_PERIOD.RULES]
  }
  if (
    periodKey === PILULE_SYMPTOM_PERIOD.ACTIVE ||
    periodKey === PILULE_SYMPTOM_PERIOD.SPM ||
    periodKey === PILULE_SYMPTOM_PERIOD.CYCLE
  ) {
    return getCombinedActiveAndSpmSymptoms()
  }
  return PILULE_SYMPTOMS_BY_PERIOD[periodKey] ?? []
}

export function createEmptySymptomValues(periodKey) {
  const values = {}
  for (const def of getSymptomsForPeriod(periodKey)) {
    values[def.key] = null
  }
  return values
}
