import { normalizeCategory } from './timetableCategories.js'
import { getDurationMinutes, addMinutesToTimeString } from './durationUtils.js'
import {
  notificationsActives,
  planifierNotificationActivite,
  planifierNotificationDebutEvenement,
  planifierNotificationFinTimer,
  formatDelaiAvantEvenement,
} from './notifications.js'

const DEFAULT_EMOJIS = [
  '📌',
  '🎨',
  '📚',
  '🏃‍♂️',
  '🎯',
  '💻',
  '💡',
  '🎵',
  '🌿',
  '⚡',
  '🌟',
  '🧘‍♀️',
  '📝',
  '🥗',
  '☕',
]

function normalizeTimeInput(value) {
  if (!value) return ''
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return ''
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`
}

/**
 * @param {object} input
 * @param {boolean} [input.requireStartTime]
 * @returns {string|null}
 */
export function validateTimetableEventTimes(input) {
  const {
    allDay = false,
    startTime = '',
    endTime = '',
    dateStart = '',
    dateEnd = '',
    requireStartTime = false,
  } = input ?? {}

  if (dateEnd && dateStart) {
    const startD = new Date(`${dateStart}T00:00:00`)
    const endD = new Date(`${dateEnd}T00:00:00`)
    if (endD < startD) {
      return 'La date de fin ne peut pas être antérieure à la date de début.'
    }
  }

  if (allDay) return null

  const start = normalizeTimeInput(startTime)
  const end = normalizeTimeInput(endTime)

  if (requireStartTime && !start) {
    return 'Indique un horaire de début pour le planning.'
  }

  if (!start) return null

  if (!end) {
    return 'Indique une heure de fin pour le planning.'
  }

  const [startH, startM] = start.split(':').map(Number)
  const [endH, endM] = end.split(':').map(Number)
  const isSameDay = !dateEnd || dateEnd === dateStart
  if (isSameDay && endH * 60 + endM <= startH * 60 + startM) {
    return "L'heure de fin doit être strictement supérieure à l'heure de début."
  }

  return null
}

/**
 * @param {object} input
 * @returns {string|null}
 */
export function validateTimetableReminderAndTimer(input) {
  const allDay = Boolean(input?.allDay)
  if (allDay) return null

  if (input?.reminderEnabled) {
    const reminderMinutes = getDurationMinutes(input.reminderHours, input.reminderMinutes)
    if (reminderMinutes <= 0) {
      return 'Indique un délai de rappel (au moins 1 minute) ou désactive le rappel.'
    }
  }

  if (input?.timerEnabled) {
    const timerMinutes = getDurationMinutes(input.timerHours, input.timerMinutes)
    if (timerMinutes <= 0) {
      return 'Indique une durée de timer (au moins 1 minute) ou désactive le timer.'
    }
  }

  return null
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} categoryName
 * @param {Array} userCategories
 */
export async function ensureTimetableCategory(supabase, userId, categoryName, userCategories = []) {
  const name = String(categoryName ?? '').trim()
  if (!name) throw new Error('Indique une catégorie pour le planning.')

  let existingCat = userCategories.find((c) => c.name?.toLowerCase() === name.toLowerCase())

  if (existingCat && !existingCat.is_temp) {
    return { category: existingCat, categories: userCategories }
  }

  const catColor = existingCat?.color ?? null
  const catIcon = existingCat?.icon ?? null
  const beautifulHues = [280, 140, 170, 200, 340, 25, 300, 220]
  const randomHue = beautifulHues[Math.floor(Math.random() * beautifulHues.length)]
  const variation = Math.floor(Math.random() * 24) - 12
  const hue = (randomHue + variation + 360) % 360
  const randomColor = catColor || `hsl(${hue}, 65%, 72%)`
  const randomEmoji = catIcon || DEFAULT_EMOJIS[Math.floor(Math.random() * DEFAULT_EMOJIS.length)]

  const { data: catData, error: catError } = await supabase
    .from('timetable_categories')
    .insert({
      user_id: userId,
      name,
      color: randomColor,
      icon: randomEmoji,
    })
    .select()

  if (catError) throw catError

  const created = normalizeCategory(catData?.[0])
  const categories = userCategories
    .filter((c) => c.name?.toLowerCase() !== name.toLowerCase())
    .concat(created ? [created] : [])

  return { category: created, categories }
}

/**
 * @param {string} userId
 * @param {object} savedEvent
 * @param {object} input
 */
export async function scheduleTimetableEventNotifications(userId, savedEvent, input) {
  if (!notificationsActives() || !savedEvent?.id || input.allDay) return

  const startTime = normalizeTimeInput(input.startTime)
  if (!startTime) return

  const title = String(input.title ?? '').trim()
  const dateStart = String(input.dateStart ?? '').slice(0, 10)

  if (input.reminderEnabled) {
    const reminderMinutes = getDurationMinutes(input.reminderHours, input.reminderMinutes)
    if (reminderMinutes > 0) {
      const delaiLabel = formatDelaiAvantEvenement(input.reminderHours, input.reminderMinutes)
      await planifierNotificationActivite(userId, {
        nom: title,
        dateStart,
        timeStart: startTime,
        minutesAvant: reminderMinutes,
        delaiLabel,
        eventId: savedEvent.id,
      })
    }
  }

  if (input.timerEnabled) {
    const timerMinutes = getDurationMinutes(input.timerHours, input.timerMinutes)
    if (timerMinutes > 0) {
      await planifierNotificationDebutEvenement(userId, {
        label: title,
        dateStart,
        timeStart: startTime,
        durationMinutes: timerMinutes,
        eventId: savedEvent.id,
      })
      await planifierNotificationFinTimer(userId, {
        label: title,
        dateStart,
        timeStart: startTime,
        durationMinutes: timerMinutes,
        eventId: savedEvent.id,
        body: `${title} : le timer est terminé !`,
      })
    }
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object} input
 * @param {Array} userCategories
 */
export async function createTimetableEvent(supabase, userId, input, userCategories = []) {
  const title = String(input.title ?? '').trim()
  if (!title) throw new Error('Indique un titre pour le planning.')

  const dateStart = String(input.dateStart ?? '').slice(0, 10)
  if (!dateStart) throw new Error('Indique une date pour le planning.')

  const allDay = Boolean(input.allDay)
  let startTime = normalizeTimeInput(input.startTime)
  let endTime = normalizeTimeInput(input.endTime)
  const dateEnd = input.dateEnd ? String(input.dateEnd).slice(0, 10) : ''
  const categoryName = String(input.categoryName ?? 'Travail').trim()
  const timerActive = Boolean(input.timerEnabled) && !allDay
  const timerMinutes = timerActive
    ? getDurationMinutes(input.timerHours, input.timerMinutes)
    : 0

  if (timerActive && timerMinutes > 0 && startTime) {
    const computedEnd = addMinutesToTimeString(startTime, timerMinutes)
    if (!computedEnd) {
      throw new Error('Le timer dépasse minuit. Réduis la durée ou choisis un début plus tôt.')
    }
    endTime = computedEnd
  }

  const validationError = validateTimetableEventTimes({
    allDay,
    startTime,
    endTime,
    dateStart,
    dateEnd,
    requireStartTime: Boolean(input.requireStartTime),
  })
  if (validationError) throw new Error(validationError)

  const reminderTimerError = validateTimetableReminderAndTimer({
    allDay,
    reminderEnabled: input.reminderEnabled,
    reminderHours: input.reminderHours,
    reminderMinutes: input.reminderMinutes,
    timerEnabled: input.timerEnabled,
    timerHours: input.timerHours,
    timerMinutes: input.timerMinutes,
  })
  if (reminderTimerError) throw new Error(reminderTimerError)

  const { category, categories } = await ensureTimetableCategory(
    supabase,
    userId,
    categoryName,
    userCategories,
  )

  const reminderActive = Boolean(input.reminderEnabled) && !allDay
  const reminderMinutes = reminderActive
    ? getDurationMinutes(input.reminderHours, input.reminderMinutes)
    : null

  const eventPayload = {
    title,
    date_start: dateStart,
    date_end: dateEnd || null,
    all_day: allDay,
    time: allDay ? null : `${startTime} - ${endTime}`,
    category: category?.id ?? null,
    detail: String(input.detail ?? '').trim(),
    reminder: reminderActive,
    reminder_time: reminderActive ? reminderMinutes : null,
    timer: timerActive,
    timer_duration: timerActive ? timerMinutes : null,
    todo_item_id: input.todoItemId || null,
  }

  const { data, error } = await supabase
    .from('timetable_events')
    .insert({ user_id: userId, ...eventPayload })
    .select()

  if (error) throw error

  const event = data?.[0] ?? null

  if (event) {
    await scheduleTimetableEventNotifications(userId, event, {
      ...input,
      title,
      dateStart,
      startTime,
    })
  }

  return {
    event,
    categories,
  }
}
