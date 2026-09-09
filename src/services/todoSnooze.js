import { TODO_FREQUENCY } from '../constants/todoOptions.js'
import {
  addDaysISO,
  assertPromesseLimits,
  buildCompletionProgressMap,
  getOccurrenceQuantiteActuelle,
  getTodoOccurrenceKeyDate,
  getWeekStartISO,
  hasTodoQuantiteCible,
  isTodoCompletedOnDate,
  normalizeDateISO,
} from '../utils/todoCalendar.js'
import { getLocalTodayISO } from './scheduledReminders.js'
import { ensureUserSettings } from './menstruationNotifications.js'
import {
  listTodoCompletionsInRange,
  listTodoItems,
  replaceTodoItem,
  syncTodoIsDoneFlags,
} from './todoItems.js'
import { loadTodoPromesseLimits } from './todoPromesseSettings.js'

const SETTINGS_TABLE = 'settings'
const PROMPT_DATE_COLUMN = 'todo_snooze_prompt_date'
const DISMISSED_COLUMN = 'todo_snooze_dismissed'

function isMissingPromptDateColumnError(error) {
  return (
    error?.code === 'PGRST204' &&
    typeof error.message === 'string' &&
    error.message.includes(`'${PROMPT_DATE_COLUMN}'`)
  )
}

function isMissingDismissedColumnError(error) {
  return (
    error?.code === 'PGRST204' &&
    typeof error.message === 'string' &&
    error.message.includes(`'${DISMISSED_COLUMN}'`)
  )
}

/**
 * @param {unknown} raw
 * @returns {{ id: string, source: string }[]}
 */
function normalizeDismissedEntries(raw) {
  if (!Array.isArray(raw)) return []
  /** @type {{ id: string, source: string }[]} */
  const out = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const id = typeof entry.id === 'string' ? entry.id : ''
    const source = normalizeDateISO(entry.source)
    if (!id || !source) continue
    out.push({ id, source })
  }
  return out
}

/**
 * @param {{ id: string, source: string }[]} entries
 */
function dismissedKey(entry) {
  return `${entry.id}::${entry.source}`
}

/**
 * @param {object[]} candidates
 * @returns {{ id: string, source: string }[]}
 */
function candidatesToDismissEntries(candidates) {
  /** @type {{ id: string, source: string }[]} */
  const entries = []
  for (const candidate of candidates || []) {
    const id = typeof candidate?.id === 'string' ? candidate.id : ''
    const source = normalizeDateISO(candidate?.snoozeSourceDate)
    if (!id || !source) continue
    entries.push({ id, source })
  }
  return entries
}

/**
 * @param {object} item
 */
export function canSnoozeTodo(item) {
  if (!item?.id || item.occurrenceDone) return false
  const freq = item.frequence
  return freq === TODO_FREQUENCY.ONE_OFF || freq === TODO_FREQUENCY.WEEK_GOAL
}

/**
 * Quantité restante à reporter (cible − déjà fait sur la date source).
 * @param {object} item
 * @param {string} sourceDateISO
 * @param {Map<string, any>} progressMap
 * @returns {number | null} null si pas de quantité
 */
export function getSnoozeRemainingQuantite(item, sourceDateISO, progressMap) {
  if (!hasTodoQuantiteCible(item)) return null
  const cible = Number(item.quantite_cible)
  const actuelle = getOccurrenceQuantiteActuelle(item, sourceDateISO, progressMap)
  return Math.max(0, cible - actuelle)
}

/**
 * Date cible d’un snooze « en avant » (lendemain / semaine suivante).
 * @param {object} item
 * @param {string} [fromDateISO]
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
 * @param {object} item
 * @param {string} targetDateISO
 * @param {{ remainingQuantite?: number | null }} [extras]
 */
export function getSnoozeConfirmMessage(item, targetDateISO, extras = {}) {
  const name = String(item?.nom ?? '').trim() || 'Cette tâche'
  const remaining = extras.remainingQuantite
  const qtyHint =
    remaining != null && remaining > 0 ? `\nQuantité reportée : ${remaining} restante(s).` : ''

  if (item.frequence === TODO_FREQUENCY.WEEK_GOAL) {
    return `Reporter « ${name} » sur la semaine suivante ?\nElle disparaîtra de cette semaine et apparaîtra la semaine d’après.${qtyHint}`
  }
  return `Reporter « ${name} » à demain ?\nElle disparaîtra des tâches d’aujourd’hui et apparaîtra demain.${qtyHint}`
}

/**
 * @param {object} item
 */
export function getSnoozeConfirmTitle(item) {
  if (item?.frequence === TODO_FREQUENCY.WEEK_GOAL) {
    return 'Reporter à la semaine suivante ?'
  }
  return 'Reporter à demain ?'
}

/**
 * @param {object} item
 * @param {string} dateEcheance
 * @param {{ quantite_cible?: number | null }} [overrides]
 */
export function buildSnoozeReplacePayload(item, dateEcheance, overrides = {}) {
  return {
    nom: item.nom,
    description: item.description || '',
    frequence: item.frequence,
    date_echeance: dateEcheance,
    jour_semaine: item.jour_semaine,
    heure: item.heure,
    is_promesse: Boolean(item.is_promesse),
    // Nouvelle occurrence = pas encore faite
    is_done: false,
    quantite_cible:
      overrides.quantite_cible !== undefined ? overrides.quantite_cible : item.quantite_cible,
    reminder: Boolean(item.reminder),
    reminder_time: item.reminder_time,
    note_id: item.note_id ?? null,
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object} item
 * @param {string} targetDateISO
 * @param {object[]} [allItems]
 * @param {{ perDay?: number, perWeek?: number }} [limits]
 * @param {{ sourceDateISO?: string, progressMap?: Map<string, any> }} [options]
 */
export async function snoozeTodoItem(
  supabase,
  userId,
  item,
  targetDateISO,
  allItems = null,
  limits = {},
  options = {},
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

  /** @type {{ quantite_cible?: number | null }} */
  const overrides = {}
  if (hasTodoQuantiteCible(item)) {
    let progressMap = options.progressMap
    if (!progressMap) {
      const source =
        normalizeDateISO(options.sourceDateISO) ||
        normalizeDateISO(item.date_echeance) ||
        getLocalTodayISO()
      const rangeStart = addDaysISO(getWeekStartISO(source), -7)
      const rangeEnd = addDaysISO(target, 7)
      const completions = await listTodoCompletionsInRange(
        supabase,
        userId,
        rangeStart,
        rangeEnd,
      )
      progressMap = buildCompletionProgressMap(completions)
    }
    const source =
      normalizeDateISO(options.sourceDateISO) ||
      normalizeDateISO(item.date_echeance) ||
      getLocalTodayISO()
    const remaining = getSnoozeRemainingQuantite(item, source, progressMap)
    if (remaining == null || remaining <= 0) {
      throw new Error('Rien à reporter : l’objectif est déjà atteint.')
    }
    overrides.quantite_cible = remaining
  }

  const payload = buildSnoozeReplacePayload(item, target, overrides)
  assertPromesseLimits(items, payload, item.id, limits)

  const source =
    normalizeDateISO(options.sourceDateISO) ||
    normalizeDateISO(item.date_echeance) ||
    getLocalTodayISO()
  const sourceKey = getTodoOccurrenceKeyDate(item, source) || source

  // Efface l’ancienne occurrence pour ne pas polluer is_done / le snooze
  try {
    await supabase
      .from('todo_item_completions')
      .delete()
      .eq('user_id', userId)
      .eq('todo_item_id', item.id)
      .eq('completion_date', sourceKey)
  } catch (err) {
    console.error('snooze clear source completion:', err)
  }

  return await replaceTodoItem(supabase, userId, item.id, payload)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} [todayISO]
 */
export async function listMorningSnoozeCandidates(
  supabase,
  userId,
  todayISO = getLocalTodayISO(),
) {
  if (!userId) return []

  const today = normalizeDateISO(todayISO) || getLocalTodayISO()
  const yesterday = addDaysISO(today, -1)
  const currentWeekStart = getWeekStartISO(today)
  const dismissed = await loadDismissedMorningSnoozeEntries(supabase, userId)
  const dismissedSet = new Set(dismissed.map(dismissedKey))

  const items = await listTodoItems(supabase, userId)

  // Inclure toutes les dates sources des candidats potentiels (pas seulement 28 jours)
  let rangeStart = addDaysISO(currentWeekStart, -28)
  for (const item of items) {
    const due = normalizeDateISO(item.date_echeance)
    if (!due) continue
    if (
      (item.frequence === TODO_FREQUENCY.WEEK_GOAL || item.frequence === TODO_FREQUENCY.ONE_OFF) &&
      due < rangeStart
    ) {
      rangeStart = due
    }
  }

  const completions = await listTodoCompletionsInRange(supabase, userId, rangeStart, today)
  const progressMap = buildCompletionProgressMap(completions)

  await syncTodoIsDoneFlags(supabase, userId, items, progressMap, today)

  /** @type {object[]} */
  const candidates = []

  for (const item of items) {
    if (item.frequence === TODO_FREQUENCY.ONE_OFF) {
      const due = normalizeDateISO(item.date_echeance)
      if (due !== yesterday) continue
      if (item.is_done) continue
      if (isTodoCompletedOnDate(item, yesterday, progressMap)) continue
      if (dismissedSet.has(dismissedKey({ id: item.id, source: yesterday }))) continue

      const remaining = getSnoozeRemainingQuantite(item, yesterday, progressMap)
      if (remaining === 0) continue

      candidates.push({
        ...item,
        snoozeKind: 'day',
        snoozeSourceDate: yesterday,
        snoozeTargetDate: today,
        snoozeRemainingQuantite: remaining,
        snoozeHint:
          remaining != null
            ? `Reporter à aujourd’hui · ${remaining} restante(s)`
            : 'Reporter à aujourd’hui',
      })
      continue
    }

    if (item.frequence === TODO_FREQUENCY.WEEK_GOAL) {
      const weekStart = normalizeDateISO(item.date_echeance)
      if (!weekStart || weekStart >= currentWeekStart) continue
      if (isTodoCompletedOnDate(item, weekStart, progressMap)) continue
      if (dismissedSet.has(dismissedKey({ id: item.id, source: weekStart }))) continue

      const remaining = getSnoozeRemainingQuantite(item, weekStart, progressMap)
      if (remaining === 0) continue

      candidates.push({
        ...item,
        snoozeKind: 'week',
        snoozeSourceDate: weekStart,
        snoozeTargetDate: currentWeekStart,
        snoozeRemainingQuantite: remaining,
        snoozeHint:
          remaining != null
            ? `Reporter à cette semaine · ${remaining} restante(s)`
            : 'Reporter à cette semaine',
      })
    }
  }

  candidates.sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr'))
  return candidates
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @returns {Promise<{ id: string, source: string }[]>}
 */
export async function loadDismissedMorningSnoozeEntries(supabase, userId) {
  if (!userId) return []

  try {
    await ensureUserSettings(userId)
    const { data, error } = await supabase
      .from(SETTINGS_TABLE)
      .select(DISMISSED_COLUMN)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      if (isMissingDismissedColumnError(error)) {
        console.warn(
          `Colonne ${DISMISSED_COLUMN} absente. Exécute scripts/migrate-settings-todo-snooze-prompt.sql`,
        )
        return []
      }
      throw error
    }

    return normalizeDismissedEntries(data?.[DISMISSED_COLUMN])
  } catch (err) {
    console.error('loadDismissedMorningSnoozeEntries:', err)
    return []
  }
}

/**
 * Mémorise des candidats ignorés (non reportés) pour ne plus les proposer.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object[]} candidates
 */
export async function dismissMorningSnoozeCandidates(supabase, userId, candidates) {
  if (!userId) return
  const incoming = candidatesToDismissEntries(candidates)
  if (!incoming.length) return

  try {
    await ensureUserSettings(userId)
    const existing = await loadDismissedMorningSnoozeEntries(supabase, userId)
    const mergedMap = new Map(existing.map((entry) => [dismissedKey(entry), entry]))
    for (const entry of incoming) {
      mergedMap.set(dismissedKey(entry), entry)
    }
    const merged = [...mergedMap.values()]

    const { error } = await supabase
      .from(SETTINGS_TABLE)
      .update({ [DISMISSED_COLUMN]: merged })
      .eq('user_id', userId)

    if (error) {
      if (isMissingDismissedColumnError(error)) {
        console.warn(
          `Colonne ${DISMISSED_COLUMN} absente. Exécute scripts/migrate-settings-todo-snooze-prompt.sql`,
        )
        return
      }
      throw error
    }
  } catch (err) {
    console.error('dismissMorningSnoozeCandidates:', err)
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} [todayISO]
 */
export async function wasMorningSnoozePromptShown(
  supabase,
  userId,
  todayISO = getLocalTodayISO(),
) {
  if (!userId) return true
  const today = normalizeDateISO(todayISO) || getLocalTodayISO()

  try {
    await ensureUserSettings(userId)
    const { data, error } = await supabase
      .from(SETTINGS_TABLE)
      .select(PROMPT_DATE_COLUMN)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      if (isMissingPromptDateColumnError(error)) {
        console.warn(
          `Colonne ${PROMPT_DATE_COLUMN} absente. Exécute scripts/migrate-settings-todo-snooze-prompt.sql`,
        )
        return false
      }
      throw error
    }

    return normalizeDateISO(data?.[PROMPT_DATE_COLUMN]) === today
  } catch (err) {
    console.error('wasMorningSnoozePromptShown:', err)
    return false
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} [todayISO]
 */
export async function markMorningSnoozePromptShown(
  supabase,
  userId,
  todayISO = getLocalTodayISO(),
) {
  if (!userId) return
  const today = normalizeDateISO(todayISO) || getLocalTodayISO()

  try {
    await ensureUserSettings(userId)
    const { error } = await supabase
      .from(SETTINGS_TABLE)
      .update({ [PROMPT_DATE_COLUMN]: today })
      .eq('user_id', userId)

    if (error) {
      if (isMissingPromptDateColumnError(error)) {
        console.warn(
          `Colonne ${PROMPT_DATE_COLUMN} absente. Exécute scripts/migrate-settings-todo-snooze-prompt.sql`,
        )
        return
      }
      throw error
    }
  } catch (err) {
    console.error('markMorningSnoozePromptShown:', err)
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object[]} selectedCandidates
 * @param {object[]} [allCandidates] candidats affichés (les non sélectionnés sont ignorés définitivement)
 * @param {{ perDay?: number, perWeek?: number }} [limits]
 */
export async function applyMorningSnoozeSelection(
  supabase,
  userId,
  selectedCandidates,
  allCandidates = [],
  limits = {},
) {
  const results = { ok: [], errors: [] }
  const selectedIds = new Set((selectedCandidates || []).map((item) => item.id))
  const skipped = (allCandidates || []).filter((item) => !selectedIds.has(item.id))
  if (skipped.length) {
    await dismissMorningSnoozeCandidates(supabase, userId, skipped)
  }
  if (!selectedCandidates?.length) return results

  let items = await listTodoItems(supabase, userId)
  const today = getLocalTodayISO()
  const rangeStart = addDaysISO(getWeekStartISO(today), -28)
  const completions = await listTodoCompletionsInRange(supabase, userId, rangeStart, today)
  const progressMap = buildCompletionProgressMap(completions)

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
        {
          sourceDateISO: candidate.snoozeSourceDate,
          progressMap,
        },
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

/**
 * Ouvre le formulaire du matin si besoin (à appeler à la connexion).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @returns {Promise<{ shouldShow: boolean, candidates: object[] }>}
 */
export async function prepareMorningSnoozePrompt(supabase, userId) {
  if (!userId) return { shouldShow: false, candidates: [] }

  const today = getLocalTodayISO()
  if (await wasMorningSnoozePromptShown(supabase, userId, today)) {
    return { shouldShow: false, candidates: [] }
  }

  const candidates = await listMorningSnoozeCandidates(supabase, userId, today)
  if (!candidates.length) {
    await markMorningSnoozePromptShown(supabase, userId, today)
    return { shouldShow: false, candidates: [] }
  }

  return { shouldShow: true, candidates }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function loadPromesseLimitsForSnooze(supabase, userId) {
  try {
    return await loadTodoPromesseLimits(userId)
  } catch {
    return {}
  }
}
