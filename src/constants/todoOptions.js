import { HABIT_WEEKDAYS } from './habitOptions.js'

export const TODO_FREQUENCY = {
  DAILY: 'quotidien',
  ONE_OFF: 'ponctuel',
  WEEKLY: 'hebdomadaire',
}

export const TODO_FREQUENCY_OPTIONS = [
  { id: TODO_FREQUENCY.ONE_OFF, label: 'Ponctuel' },
  { id: TODO_FREQUENCY.DAILY, label: 'Quotidien' },
  { id: TODO_FREQUENCY.WEEKLY, label: 'Hebdomadaire' },
]

export const TODO_FREQUENCY_LABELS = {
  [TODO_FREQUENCY.DAILY]: 'Quotidien',
  [TODO_FREQUENCY.ONE_OFF]: 'Ponctuel',
  [TODO_FREQUENCY.WEEKLY]: 'Hebdomadaire',
}

export const TODO_WEEKDAYS = HABIT_WEEKDAYS

export const MAX_TODO_PROMESSES_PER_DAY = 3

export const TODO_PROMESSE_LIMIT_MESSAGE =
  'Tu as déjà 3 promesses pour ce jour. Retire le statut Promesse d’une autre ou choisis une autre date.'

export function getTodoWeekdayLabel(dayId) {
  return TODO_WEEKDAYS.find((d) => d.id === dayId)?.label ?? ''
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

  if (item.frequence === TODO_FREQUENCY.WEEKLY && item.jour_semaine) {
    parts.push(getTodoWeekdayLabel(item.jour_semaine))
  }

  if (item.heure) {
    const hhmm = String(item.heure).slice(0, 5)
    parts.push(hhmm)
  }

  return parts.filter(Boolean).join(' · ')
}
