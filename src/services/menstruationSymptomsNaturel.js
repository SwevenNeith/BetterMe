import { COL_NATUREL, determinePhaseNaturel } from './menstruationCyclesNaturel.js'
import { getLocalTodayISO } from './scheduledReminders.js'

export const NATUREL_PHASE = {
  MENSTRUELLE: 'menstruelle',
  FOLLICULAIRE: 'folliculaire',
  OVULATOIRE: 'ovulatoire',
  LUTEALE: 'lutéale',
}

export const NATUREL_PHASE_LABELS = {
  [NATUREL_PHASE.MENSTRUELLE]: 'Phase menstruelle',
  [NATUREL_PHASE.FOLLICULAIRE]: 'Phase folliculaire',
  [NATUREL_PHASE.OVULATOIRE]: 'Phase ovulatoire',
  [NATUREL_PHASE.LUTEALE]: 'Phase lutéale',
}

export const NATUREL_PHASE_EMOJI = {
  [NATUREL_PHASE.MENSTRUELLE]: '🔴',
  [NATUREL_PHASE.FOLLICULAIRE]: '🌱',
  [NATUREL_PHASE.OVULATOIRE]: '🥚',
  [NATUREL_PHASE.LUTEALE]: '🌙',
}

const COULEUR_FLUX_OPTIONS = [
  { value: 'rouge_vif', label: 'Rouge vif' },
  { value: 'bordeaux', label: 'Bordeaux' },
  { value: 'brun', label: 'Brun' },
  { value: 'rose', label: 'Rosé' },
]

const FLUX_OPTIONS = [
  { value: 1, label: 'Léger' },
  { value: 2, label: 'Moyen' },
  { value: 3, label: 'Abondant' },
  { value: 4, label: 'Très abondant' },
]

export const NATUREL_SYMPTOMS_BY_PHASE = {
  [NATUREL_PHASE.MENSTRUELLE]: [
    { key: 'flux', label: 'Flux', type: 'enum', options: FLUX_OPTIONS },
    { key: 'couleur_flux', label: 'Couleur du flux', type: 'enum', options: COULEUR_FLUX_OPTIONS },
    { key: 'caillots', label: 'Caillots', type: 'boolean' },
    { key: 'douleurs_crampes', label: 'Douleurs / crampes', type: 'scale', min: 0, max: 5 },
    { key: 'douleurs_dos', label: 'Douleurs dos', type: 'scale', min: 0, max: 5 },
    { key: 'maux_de_tete', label: 'Maux de tête', type: 'scale', min: 0, max: 5 },
    { key: 'fatigue', label: 'Fatigue', type: 'scale', min: 0, max: 5 },
    { key: 'humeur', label: 'Humeur', type: 'scale', min: 1, max: 5 },
    { key: 'nausees', label: 'Nausées', type: 'scale', min: 0, max: 5 },
  ],
  [NATUREL_PHASE.FOLLICULAIRE]: [
    { key: 'energie', label: 'Énergie', type: 'scale', min: 0, max: 5 },
    { key: 'humeur', label: 'Humeur', type: 'scale', min: 1, max: 5 },
    { key: 'libido', label: 'Libido', type: 'scale', min: 0, max: 3 },
    { key: 'acne', label: 'Acné', type: 'scale', min: 0, max: 3 },
    {
      key: 'peau',
      label: 'Peau',
      type: 'enum',
      options: [
        { value: 'terne', label: 'Terne' },
        { value: 'normale', label: 'Normale' },
        { value: 'lumineuse', label: 'Lumineuse' },
      ],
    },
    {
      key: 'pertes_vaginales',
      label: 'Pertes vaginales',
      type: 'enum',
      options: [
        { value: 'absentes', label: 'Absentes' },
        { value: 'blanches', label: 'Blanches' },
        { value: 'cremeuses', label: 'Crémeuses' },
      ],
    },
  ],
  [NATUREL_PHASE.OVULATOIRE]: [
    {
      key: 'douleur_ovulation',
      label: "Douleur d'ovulation",
      type: 'boolean_with_side',
      sideKey: 'douleur_ovulation_cote',
      sideOptions: [
        { value: 'gauche', label: 'Gauche' },
        { value: 'droit', label: 'Droit' },
      ],
    },
    {
      key: 'pertes_vaginales',
      label: 'Pertes vaginales',
      type: 'enum',
      options: [
        { value: 'cremeuses', label: 'Crémeuses' },
        { value: 'filantes', label: 'Filantes' },
        { value: 'transparentes', label: 'Transparentes' },
      ],
    },
    { key: 'libido', label: 'Libido', type: 'scale', min: 0, max: 3 },
    { key: 'energie', label: 'Énergie', type: 'scale', min: 0, max: 5 },
    { key: 'humeur', label: 'Humeur', type: 'scale', min: 1, max: 5 },
    { key: 'sensibilite_seins', label: 'Sensibilité des seins', type: 'scale', min: 0, max: 5 },
  ],
  [NATUREL_PHASE.LUTEALE]: [
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
    { key: 'energie', label: 'Énergie', type: 'scale', min: 0, max: 5 },
    { key: 'libido', label: 'Libido', type: 'scale', min: 0, max: 3 },
    { key: 'retention_eau', label: 'Rétention d’eau', type: 'scale', min: 0, max: 5 },
  ],
}

function getCycleForDate(cycles, iso) {
  if (!iso || !cycles?.length) return null
  let candidate = null
  for (const c of cycles) {
    const start = c?.[COL_NATUREL.dateDebutRegles]
    if (!start) continue
    if (start <= iso) candidate = c
    else break
  }
  return candidate
}

/**
 * Phase du jour pour le cycle naturel (menstruelle, folliculaire, ovulatoire, lutéale).
 * @param {Array} cycles
 * @param {string} [iso]
 */
export function getNaturelPhaseContext(cycles, iso = getLocalTodayISO()) {
  const cycle = getCycleForDate(cycles, iso)
  if (!cycle) {
    return { phase: null, cycle: null, iso }
  }

  const phase = determinePhaseNaturel(
    {
      dateDebutRegles: cycle[COL_NATUREL.dateDebutRegles],
      dureeCycle: cycle[COL_NATUREL.dureeCycle],
      dureeRegles: cycle[COL_NATUREL.dureeRegles],
    },
    iso,
  )

  return { phase, cycle, iso }
}

export function getSymptomsForPhase(phaseKey) {
  if (!phaseKey) return []
  return NATUREL_SYMPTOMS_BY_PHASE[phaseKey] ?? []
}

export function createEmptySymptomValues(phaseKey) {
  const values = {}
  for (const def of getSymptomsForPhase(phaseKey)) {
    values[def.key] = null
    if (def.type === 'boolean_with_side' && def.sideKey) {
      values[def.sideKey] = null
    }
  }
  return values
}
