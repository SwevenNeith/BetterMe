/** Constantes catalogue Wger (IDs officiels API v2). */

export const WGER_BASE_URL = 'https://wger.de/api/v2'

/** Français */
export const WGER_LANG_FR = 12
/** Anglais (fallback) */
export const WGER_LANG_EN = 2

/** Equipment.id connus — utilisés pour les filtres UI. */
export const WGER_EQUIPMENT = {
  BARBELL: 1,
  SZ_BAR: 2,
  DUMBBELL: 3,
  GYM_MAT: 4,
  SWISS_BALL: 5,
  PULL_UP_BAR: 6,
  NONE: 7,
  BENCH: 8,
  INCLINE_BENCH: 9,
  KETTLEBELL: 10,
  RESISTANCE_BAND: 11,
  CABLE_MACHINE: 12,
}

/**
 * Filtres « pratiques » mappés sur des IDs Wger réels.
 * Note : Wger n’a pas de catégorie générique « machines » —
 * on mappe sur Cable machine (12) comme approximation documentée.
 */
export const EQUIPMENT_PRESET_FILTERS = {
  none: [WGER_EQUIPMENT.NONE],
  dumbbell: [WGER_EQUIPMENT.DUMBBELL],
  barbell: [WGER_EQUIPMENT.BARBELL, WGER_EQUIPMENT.SZ_BAR],
  kettlebell: [WGER_EQUIPMENT.KETTLEBELL],
  /** Approximation : Cable machine uniquement (pas de liste machines complète). */
  machines: [WGER_EQUIPMENT.CABLE_MACHINE],
}

export const WGER_LICENSE_NOTE =
  'Données et images © contributeurs wger — licence CC-BY-SA 4.0 (wger.de).'

/**
 * Libellés FR pour les muscle.id Wger (l’API ne fournit que name / name_en).
 * @type {Record<number, string>}
 */
export const WGER_MUSCLE_LABELS_FR = {
  1: 'Biceps',
  2: 'Épaules',
  3: 'Dentelé antérieur',
  4: 'Pectoraux',
  5: 'Triceps',
  6: 'Abdominaux',
  7: 'Mollets',
  8: 'Fessiers',
  9: 'Trapèzes',
  10: 'Quadriceps',
  11: 'Ischio-jambiers',
  12: 'Dorsaux',
  13: 'Brachial',
  14: 'Obliques',
  15: 'Soléaire',
}

/**
 * Libellés FR pour equipment.id Wger.
 * @type {Record<number, string>}
 */
export const WGER_EQUIPMENT_LABELS_FR = {
  1: 'Barre',
  2: 'Barre EZ',
  3: 'Haltères',
  4: 'Tapis',
  5: 'Swiss ball',
  6: 'Barre de traction',
  7: 'Poids du corps',
  8: 'Banc',
  9: 'Banc incliné',
  10: 'Kettlebell',
  11: 'Élastique',
  12: 'Poulie / câble',
}

/**
 * Libellés FR pour exercisecategory.name (noms EN renvoyés par l’API).
 * @type {Record<string, string>}
 */
export const WGER_CATEGORY_LABELS_FR = {
  Abs: 'Abdominaux',
  Arms: 'Bras',
  Back: 'Dos',
  Calves: 'Mollets',
  Cardio: 'Cardio',
  Chest: 'Pectoraux',
  Legs: 'Jambes',
  Shoulders: 'Épaules',
}

export function muscleLabelFr(muscleOrId, fallback = '') {
  if (muscleOrId == null) return fallback || '—'
  if (typeof muscleOrId === 'object') {
    const id = Number(muscleOrId.id)
    return (
      WGER_MUSCLE_LABELS_FR[id] ||
      muscleOrId.name_en ||
      muscleOrId.name ||
      fallback ||
      `Muscle ${id || '?'}`
    )
  }
  const id = Number(muscleOrId)
  return WGER_MUSCLE_LABELS_FR[id] || fallback || `Muscle ${id}`
}

export function equipmentLabelFr(equipmentOrId, fallback = '') {
  if (equipmentOrId == null) return fallback || '—'
  if (typeof equipmentOrId === 'object') {
    const id = Number(equipmentOrId.id)
    return (
      WGER_EQUIPMENT_LABELS_FR[id] ||
      equipmentOrId.name ||
      fallback ||
      `Matériel ${id || '?'}`
    )
  }
  const id = Number(equipmentOrId)
  return WGER_EQUIPMENT_LABELS_FR[id] || fallback || `Matériel ${id}`
}

export function categoryLabelFr(nameOrCategory) {
  const name =
    typeof nameOrCategory === 'object'
      ? nameOrCategory?.name
      : nameOrCategory
  const key = String(name || '').trim()
  if (!key) return 'Sans catégorie'
  return WGER_CATEGORY_LABELS_FR[key] || key
}

export const DEFAULT_PAGE_SIZE = 24
export const REF_CACHE_TTL_MS = 24 * 60 * 60 * 1000
export const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000
