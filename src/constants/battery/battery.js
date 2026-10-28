/** Constantes UI / libellés du module Batterie. */

export const BATTERY_EVENING_FEELINGS = [
  { id: 'empty', label: 'À sec' },
  { id: 'just', label: 'Juste' },
  { id: 'left', label: 'Il m’en restait' },
]

export const BATTERY_SLEEP_QUALITIES = [
  { id: 'bad', label: 'Très mauvaise' },
  { id: 'ok', label: 'Moyenne' },
  { id: 'good', label: 'Très bonne' },
]

export const BATTERY_MORNING_LABELS = {
  1: 'Épuisée',
  2: 'Faible',
  3: 'Correcte',
  4: 'Bonne',
  5: 'Plein d’énergie',
}

export const BATTERY_ENTRY_KINDS = {
  PLANNED: 'planned',
  ACTUAL: 'actual',
}

/**
 * Raisons de non-réalisation d’une activité prévue (skip_reason).
 * Libellés neutres (pas de ton culpabilisant).
 */
export const BATTERY_SKIP_REASONS = [
  { id: 'no_energy', label: 'Pas la force' },
  { id: 'no_desire', label: 'Pas envie' },
  { id: 'unexpected', label: 'Imprévu' },
  { id: 'no_time', label: 'Plus le temps' },
  { id: 'other', label: 'Autre' },
]

export const BATTERY_SKIP_REASON_IDS = BATTERY_SKIP_REASONS.map((r) => r.id)

/** Tranches de batterie de départ pour l’analyse de réalisation. */
export const BATTERY_START_BUCKETS = [
  { id: 'low', label: '≤ 6', min: 0, max: 6 },
  { id: 'mid', label: '7 – 9', min: 7, max: 9 },
  { id: 'high', label: '≥ 10', min: 10, max: Infinity },
]

/** Minutes stockées quand on choisit le raccourci « +2 h ». */
export const BATTERY_DURATION_OVER_2H_MINUTES = 150

/** Raccourcis de durée (minutes) pour la saisie Batterie. */
export const BATTERY_DURATION_PRESETS = [
  { id: '15', minutes: 15, label: '15 min' },
  { id: '30', minutes: 30, label: '30 min' },
  { id: '60', minutes: 60, label: '1 h' },
  { id: '90', minutes: 90, label: '1 h 30' },
  { id: '120', minutes: 120, label: '2 h' },
  {
    id: 'over_2h',
    minutes: BATTERY_DURATION_OVER_2H_MINUTES,
    label: '+2 h',
    minMinutes: 121,
  },
]

export const BATTERY_DURATION_ALL_DAY_ID = 'all_day'
export const BATTERY_DURATION_RESET_ID = 'reset'
export const BATTERY_DURATION_OVER_2H_ID = 'over_2h'

/** Tranches de durée d’activité pour les insights Énergie ↔ Durée. */
export const BATTERY_ACTIVITY_DURATION_BUCKETS = [
  { id: 'under_30', label: 'moins de 30 min', min: 1, max: 29 },
  { id: '30_60', label: '30 min – 1 h', min: 30, max: 59 },
  { id: '60_90', label: '1 h – 1 h 30', min: 60, max: 90 },
  { id: '90_120', label: '1 h 30 – 2 h', min: 91, max: 120 },
  { id: 'over_2h', label: 'plus de 2 h', min: 121, max: Infinity },
]

/** Origine d’une entrée Batterie liée à TODO / EDT. */
export const BATTERY_SOURCE_TYPES = {
  TODO: 'todo',
  TIMETABLE: 'timetable',
}

export const BATTERY_GAUGE_COLORS = {
  green: '#5a9e78',
  orange: '#d4a017',
  red: '#c45c5c',
}

/** Raccourcis de période pour l’historique Batterie. */
export const BATTERY_HISTORY_PRESETS = [
  { id: '7d', label: '7 jours' },
  { id: '30d', label: '30 jours' },
  { id: '90d', label: '90 jours' },
  { id: 'month', label: 'Ce mois' },
  { id: 'year', label: 'Cette année' },
  { id: 'custom', label: 'Personnalisé' },
]

/** @deprecated Utiliser BATTERY_HISTORY_PRESETS */
export const BATTERY_HISTORY_WINDOWS = [30, 90]
