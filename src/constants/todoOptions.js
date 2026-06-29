import { HABIT_WEEKDAYS } from './habitOptions.js'

export const TODO_FREQUENCY = {
  DAILY: 'quotidien',
  ONE_OFF: 'ponctuel',
  WEEKLY: 'hebdomadaire',
  WEEK_GOAL: 'semaine',
}

export const TODO_FREQUENCY_OPTIONS = [
  { id: TODO_FREQUENCY.ONE_OFF, label: 'Ponctuel' },
  { id: TODO_FREQUENCY.WEEK_GOAL, label: 'Cette semaine' },
  { id: TODO_FREQUENCY.DAILY, label: 'Quotidien' },
  { id: TODO_FREQUENCY.WEEKLY, label: 'Hebdomadaire' },
]

export const TODO_FREQUENCY_LABELS = {
  [TODO_FREQUENCY.DAILY]: 'Quotidien',
  [TODO_FREQUENCY.ONE_OFF]: 'Ponctuel',
  [TODO_FREQUENCY.WEEKLY]: 'Hebdomadaire',
  [TODO_FREQUENCY.WEEK_GOAL]: 'Cette semaine',
}

export const TODO_WEEKDAYS = HABIT_WEEKDAYS

export const MAX_TODO_PROMESSES_PER_DAY = 3
export const MAX_TODO_PROMESSES_PER_WEEK = 3

export const TODO_PROMESSE_LIMIT_MESSAGE =
  'Tu as déjà 3 promesses pour ce jour. Retire le statut Promesse d’une autre ou choisis une autre date.'

export const TODO_PROMESSE_WEEK_LIMIT_MESSAGE =
  'Tu as déjà 3 promesses « Cette semaine » pour cette semaine. Retire le statut Promesse d’une autre ou choisis une autre semaine.'

export const TODO_PROMESSE_LIMIT_MESSAGES = [
  TODO_PROMESSE_LIMIT_MESSAGE,
  TODO_PROMESSE_WEEK_LIMIT_MESSAGE,
]

export function getTodoWeekdayLabel(dayId) {
  return TODO_WEEKDAYS.find((d) => d.id === dayId)?.label ?? ''
}

/** Classe CSS de teinte selon la fréquence (voir styles/todo-frequency.css). */
export function getTodoFrequencyClass(frequence) {
  switch (frequence) {
    case TODO_FREQUENCY.WEEK_GOAL:
      return 'todo-freq--semaine'
    case TODO_FREQUENCY.DAILY:
      return 'todo-freq--quotidien'
    case TODO_FREQUENCY.WEEKLY:
      return 'todo-freq--hebdomadaire'
    case TODO_FREQUENCY.ONE_OFF:
    default:
      return 'todo-freq--ponctuel'
  }
}

/** Teinte affichée : promesse prioritaire, sinon fréquence. */
export function getTodoItemColorClass(item) {
  if (item?.is_promesse) return 'todo-freq--promesse'
  return getTodoFrequencyClass(item?.frequence)
}

export function getDefaultTodoFrequencyForView(viewMode) {
  return viewMode === 'week' ? TODO_FREQUENCY.WEEK_GOAL : TODO_FREQUENCY.ONE_OFF
}

/**
 * @param {{ frequence?: string, jour_semaine?: number|null, heure?: string|null, date_echeance?: string }} item
 */
export function formatTodoSchedule(item) {
  const parts = [TODO_FREQUENCY_LABELS[item.frequence] ?? item.frequence]

  if (item.date_echeance) {
    const raw = String(item.date_echeance).slice(0, 10)
    parts.push(raw.split('-').reverse().join('/'))
  }

  if (item.frequence === TODO_FREQUENCY.WEEK_GOAL) {
    parts.push('objectif de la semaine')
  }

  if (item.frequence === TODO_FREQUENCY.WEEKLY && item.jour_semaine) {
    parts.push(getTodoWeekdayLabel(item.jour_semaine))
  }

  if (item.heure) {
    const hhmm = String(item.heure).slice(0, 5)
    parts.push(hhmm)
  }

  return parts.filter(Boolean).join(' · ')
}
