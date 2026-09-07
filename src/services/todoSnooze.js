import { TODO_FREQUENCY } from '../constants/todoOptions.js'
import {
  addDaysISO,
  assertPromesseLimits,
  buildCompletionProgressMap,
  getWeekStartISO,
  isTodoCompletedOnDate,
  normalizeDateISO,
} from '../utils/todoCalendar.js'
import { getLocalTodayISO } from './scheduledReminders.js'
import { listTodoCompletionsInRange, listTodoItems, replaceTodoItem } from './todoItems.js'

/**
 * @param {object} item
 */
export function canSnoozeTodo(item) {
  if (!item?.id || item.occurrenceDone) return false
  const freq = item.frequence
  return freq === TODO_FREQUENCY.ONE_OFF || freq === TODO_FREQUENCY.WEEK_GOAL
}

/**
 * Date cible d’un snooze « en avant » (lendemain / semaine suivante).
 * @param {object} item
 * @param {string} [fromDateISO] — jour de référence (souvent aujourd’hui ou le jour de l’occurrence)
 */
export function getForwardSnoozeTargetDate(item, fromDateISO = getLocalTodayISO()) {
  const from = normalizeDateISO(fromDateISO) || getLocalTodayISO()

  if (item.frequence === TODO_FREQUENCY.WEEK_GOAL) {
    const weekStart = getWeekStartISO(normalizeDateISO(item.date_echeance) || from)
    return getWeekStartISO(addDaysISO(weekStart, 7))
  }

  if (item.frequence === TODO_FREQUENCY.ONE_OFF) {
    const due = normalizeDateISO(item.date_echeance) || from
    const base = due < from ? from : due
    return addDaysISO(base, 1)
  }

  return null
}

/**
 * Message de confirmation pour un snooze manuel.
 * @param {object} item
 * @param {string} targetDateISO
 */
export function getSnoozeConfirmMessage(item, targetDateISO) {
  const name = String(item?.nom ?? '').trim() || 'Cette tâche'
  if (item.frequence === TODO_FREQUENCY.WEEK_GOAL) {
    return `Reporter « ${name} » sur la semaine suivante ?\nElle disparaîtra de cette semaine et apparaîtra la semaine d’après.`
  }
  return `Reporter « ${name} » à demain ?\nElle disparaîtra des tâches d’aujourd’hui et apparaîtra demain.`
}

/**
 * @param {object} item
 * @param {string} [targetDateISO]
 */
export function getSnoozeConfirmTitle(item) {
  if (item?.frequence === TODO_FREQUENCY.WEEK_GOAL) {
    return 'Reporter à la semaine suivante ?'
  }
  return 'Reporter à demain ?'
}

/**
 * Construit le payload `replaceTodoItem` en ne changeant que la date.
 * @param {object} item
 * @param {string} dateEcheance
 */
export function buildSnoozeReplacePayload(item, dateEcheance) {
  return {
    nom: item.nom,
    description: item.description || '',
    frequence: item.frequence,
    date_echeance: dateEcheance,
    jour_semaine: item.jour_semaine,
    heure: item.heure,
    is_promesse: Boolean(item.is_promesse),
    quantite_cible: item.quantite_cible,
    reminder: Boolean(item.reminder),
    reminder_time: item.reminder_time,
    note_id: item.note_id ?? null,
  }
}

/**
 * Applique un snooze (décalage de date_echeance) en respectant les limites Promesse.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object} item
 * @param {string} targetDateISO
 * @param {object[]} [allItems]
 * @param {{ perDay?: number, perWeek?: number }} [limits]
 */
export async function snoozeTodoItem(
  supabase,
  userId,
  item,
  targetDateISO,
  allItems = null,
  limits = {},
) {
  if (!userId || !item?.id) throw new Error('Élément introuvable.')
  if (item.occurrenceDone) {
    throw new Error('Cette tâche est déjà terminée.')
  }
  if (
    item.frequence !== TODO_FREQUENCY.ONE_OFF &&
    item.frequence !== TODO_FREQUENCY.WEEK_GOAL
  ) {
    throw new Error('Seuls les TODO ponctuels et « Cette semaine » peuvent être reportés.')
  }

  const target = normalizeDateISO(targetDateISO)
  if (!target) throw new Error('Date de report invalide.')

  const items = allItems ?? (await listTodoItems(supabase, userId))
  const payload = buildSnoozeReplacePayload(item, target)
  assertPromesseLimits(items, payload, item.id, limits)

  return await replaceTodoItem(supabase, userId, item.id, payload)
}

/**
 * Candidats au formulaire du matin : ponctuels d’hier non faits + objectifs semaines passées non faits.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} [todayISO]
 */
export async function listMorningSnoozeCandidates(supabase, userId, todayISO = getLocalTodayISO()) {
  if (!userId) return []

  const today = normalizeDateISO(todayISO) || getLocalTodayISO()
  const yesterday = addDaysISO(today, -1)
  const currentWeekStart = getWeekStartISO(today)

  const items = await listTodoItems(supabase, userId)
  const rangeStart = addDaysISO(currentWeekStart, -28)
  const completions = await listTodoCompletionsInRange(supabase, userId, rangeStart, today)
  const progressMap = buildCompletionProgressMap(completions)

  /** @type {object[]} */
  const candidates = []

  for (const item of items) {
    if (item.frequence === TODO_FREQUENCY.ONE_OFF) {
      const due = normalizeDateISO(item.date_echeance)
      if (due !== yesterday) continue
      if (item.is_done) continue
      candidates.push({
        ...item,
        snoozeKind: 'day',
        snoozeTargetDate: today,
        snoozeHint: 'Reporter à aujourd’hui',
      })
      continue
    }

    if (item.frequence === TODO_FREQUENCY.WEEK_GOAL) {
      const weekStart = normalizeDateISO(item.date_echeance)
      if (!weekStart || weekStart >= currentWeekStart) continue
      if (isTodoCompletedOnDate(item, weekStart, progressMap)) continue
      candidates.push({
        ...item,
        snoozeKind: 'week',
        snoozeTargetDate: currentWeekStart,
        snoozeHint: 'Reporter à cette semaine',
      })
    }
  }

  candidates.sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr'))
  return candidates
}

function morningPromptStorageKey(userId, todayISO) {
  return `betterme-todo-snooze-prompt:${userId || 'anon'}:${todayISO}`
}

/**
 * @param {string} userId
 * @param {string} [todayISO]
 */
export function wasMorningSnoozePromptShown(userId, todayISO = getLocalTodayISO()) {
  try {
    return localStorage.getItem(morningPromptStorageKey(userId, todayISO)) === '1'
  } catch {
    return false
  }
}

/**
 * @param {string} userId
 * @param {string} [todayISO]
 */
export function markMorningSnoozePromptShown(userId, todayISO = getLocalTodayISO()) {
  try {
    localStorage.setItem(morningPromptStorageKey(userId, todayISO), '1')
  } catch {
    /* ignore */
  }
}

/**
 * Applique le snooze pour une liste de candidats sélectionnés.
 * Ignore silencieusement les échecs de limite promesse (renvoyés dans `errors`).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object[]} selectedCandidates
 * @param {{ perDay?: number, perWeek?: number }} [limits]
 */
export async function applyMorningSnoozeSelection(
  supabase,
  userId,
  selectedCandidates,
  limits = {},
) {
  const results = { ok: [], errors: [] }
  let items = await listTodoItems(supabase, userId)

  for (const candidate of selectedCandidates) {
    try {
      const target = candidate.snoozeTargetDate
      const updated = await snoozeTodoItem(
        supabase,
        userId,
        candidate,
        target,
        items,
        limits,
      )
      items = items.map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
      results.ok.push(updated)
    } catch (err) {
      results.errors.push({
        item: candidate,
        message: err?.message || 'Report impossible.',
      })
    }
  }

  return results
}
