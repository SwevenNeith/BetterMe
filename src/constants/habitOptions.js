export const HABIT_VALUE_TYPE = {
  FLOAT: 'float',
  BOOLEAN: 'boolean',
}

export const HABIT_VALUE_TYPE_OPTIONS = [
  { id: HABIT_VALUE_TYPE.FLOAT, label: 'Nombre' },
  { id: HABIT_VALUE_TYPE.BOOLEAN, label: 'Fait / Pas Fait' },
]

export const HABIT_FREQUENCY = {
  DAILY: 'quotidien',
  WEEKLY: 'hebdomadaire',
  MONTHLY: 'mensuel',
}

export const HABIT_FREQUENCY_OPTIONS = [
  { id: HABIT_FREQUENCY.DAILY, label: 'Quotidien' },
  { id: HABIT_FREQUENCY.WEEKLY, label: 'Hebdomadaire' },
  { id: HABIT_FREQUENCY.MONTHLY, label: 'Mensuel' },
]

export const HABIT_FREQUENCY_LABELS = {
  [HABIT_FREQUENCY.DAILY]: 'Quotidien',
  [HABIT_FREQUENCY.WEEKLY]: 'Hebdomadaire',
  [HABIT_FREQUENCY.MONTHLY]: 'Mensuel',
}

/** Jours ISO : 1 = lundi … 7 = dimanche */
export const HABIT_WEEKDAYS = [
  { id: 1, label: 'Lun' },
  { id: 2, label: 'Mar' },
  { id: 3, label: 'Mer' },
  { id: 4, label: 'Jeu' },
  { id: 5, label: 'Ven' },
  { id: 6, label: 'Sam' },
  { id: 7, label: 'Dim' },
]

export const HABIT_ALL_WEEKDAY_IDS = HABIT_WEEKDAYS.map((d) => d.id)

export const HABIT_MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

export const HABIT_VALUE_TYPE_LABELS = {
  [HABIT_VALUE_TYPE.FLOAT]: 'Nombre',
  [HABIT_VALUE_TYPE.BOOLEAN]: 'Fait / Pas Fait',
  integer: 'Nombre',
  decimal: 'Nombre',
  boolean: 'Fait / Pas Fait',
}

/** Normalise les anciennes valeurs (integer, decimal) vers float. */
export function normalizeHabitValueType(type) {
  if (type === 'integer' || type === 'decimal') return HABIT_VALUE_TYPE.FLOAT
  if (type === 'boolean') return HABIT_VALUE_TYPE.BOOLEAN
  return type
}

export function getHabitValueTypeLabel(type) {
  const normalized = normalizeHabitValueType(type)
  return HABIT_VALUE_TYPE_LABELS[normalized] ?? type
}
