import { addMinutesToTimeString } from '../services/durationUtils.js'
import { TODO_FREQUENCY } from '../constants/todoOptions.js'
import { getWeekStartISO } from './todoCalendar.js'

export function todoTimeToInput(value) {
  if (value == null || value === '') return ''
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return ''
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`
}

export function suggestEndTimeFromStart(startTime, durationMinutes = 60) {
  if (!startTime) return ''
  return addMinutesToTimeString(startTime, durationMinutes) || ''
}

export function createDefaultPlanningForm(todoForm = {}) {
  const startTime = todoTimeToInput(todoForm.heure)
  return {
    allDay: false,
    startTime,
    endTime: suggestEndTimeFromStart(startTime),
    dateEnd: '',
    category: 'Travail',
    reminderEnabled: false,
    reminderHours: 0,
    reminderMinutes: 15,
    timerEnabled: false,
    timerHours: 0,
    timerMinutes: 30,
  }
}

export function createDefaultTodoLinkedForm() {
  return {
    frequence: TODO_FREQUENCY.ONE_OFF,
    jour_semaine: null,
    is_promesse: false,
    quantite_cible: 0,
  }
}

/**
 * Date utilisée pour l'événement planning à partir du formulaire TODO.
 */
export function resolvePlanningDateFromTodo(todoForm, anchorDate) {
  if (todoForm?.frequence === TODO_FREQUENCY.WEEK_GOAL) {
    return anchorDate || todoForm.date_echeance || ''
  }
  return todoForm?.date_echeance || anchorDate || ''
}

/**
 * Payload TODO à partir du formulaire EDT + champs TODO complémentaires.
 */
export function buildTodoPayloadFromTimetable(eventForm, todoLinkedForm) {
  const frequence = todoLinkedForm.frequence ?? TODO_FREQUENCY.ONE_OFF
  let date_echeance = eventForm.dateStart || ''

  if (frequence === TODO_FREQUENCY.WEEK_GOAL && date_echeance) {
    date_echeance = getWeekStartISO(date_echeance)
  }

  return {
    nom: String(eventForm.title ?? '').trim(),
    description: String(eventForm.detail ?? '').trim(),
    frequence,
    jour_semaine: frequence === TODO_FREQUENCY.WEEKLY ? todoLinkedForm.jour_semaine : null,
    heure: eventForm.allDay ? null : todoTimeToInput(eventForm.startTime) || null,
    date_echeance,
    is_promesse: Boolean(todoLinkedForm.is_promesse),
    quantite_cible:
      todoLinkedForm.quantite_cible > 0 ? Math.round(Number(todoLinkedForm.quantite_cible)) : null,
  }
}
