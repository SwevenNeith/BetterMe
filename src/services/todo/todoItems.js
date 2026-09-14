import { TODO_FREQUENCY } from '../constants/todoOptions.js'
import {
  addDaysISO,
  assertPromesseLimits,
  getIsoWeekdayFromISO,
  getTodoOccurrenceKeyDate,
  getWeekStartISO,
  hasTodoQuantiteCible,
  isTodoCompletedOnDate,
  normalizeDateISO,
} from '../utils/todoCalendar.js'
import { loadTodoPromesseLimits } from './todoPromesseSettings.js'

const TABLE = 'todo_items'
const COMPLETIONS_TABLE = 'todo_item_completions'

const TODO_ITEM_SELECT =
  'id, user_id, nom, description, frequence, jour_semaine, heure, date_echeance, is_promesse, is_done, quantite_cible, sort_order, timetable_event_id, note_id, reminder, reminder_time, created_at, updated_at'

async function refreshTodoPromesseReminder(userId) {
  if (!userId) return
  try {
    const { rescheduleTodoPromesseReminder } = await import('./todoPromesseNotifications.js')
    await rescheduleTodoPromesseReminder(userId)
  } catch (err) {
    console.error('refreshTodoPromesseReminder:', err)
  }
}

async function refreshTodoItemReminder(userId, item) {
  if (!userId || !item?.id) return
  try {
    const { rescheduleTodoItemReminder } = await import('./todoItemReminders.js')
    await rescheduleTodoItemReminder(userId, item)
  } catch (err) {
    console.error('refreshTodoItemReminder:', err)
  }
}

async function clearTodoItemReminder(todoItemId) {
  if (!todoItemId) return
  try {
    const { deletePendingTodoItemReminders } = await import('./todoItemReminders.js')
    await deletePendingTodoItemReminders(null, todoItemId)
  } catch (err) {
    console.error('clearTodoItemReminder:', err)
  }
}

function normalizeTime(value) {
  if (value == null || value === '') return null
  const raw = String(value).trim()
  if (!raw) return null
  const match = raw.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
}

function normalizeTodoPayload(payload) {
  const nom = String(payload.nom ?? '').trim()
  const description = String(payload.description ?? '').trim()
  const frequence = payload.frequence
  const is_promesse = Boolean(payload.is_promesse)
  const jour_semaine =
    frequence === TODO_FREQUENCY.WEEKLY ? Number(payload.jour_semaine) : null
  const heure = normalizeTime(payload.heure)
  let date_echeance = normalizeDateISO(payload.date_echeance)

  if (!nom) {
    throw new Error('Indique un nom pour l’élément.')
  }

  if (!date_echeance) {
    throw new Error('Indique une date pour l’élément.')
  }

  if (!Object.values(TODO_FREQUENCY).includes(frequence)) {
    throw new Error('Choisis une fréquence.')
  }

  if (frequence === TODO_FREQUENCY.WEEKLY) {
    if (!Number.isInteger(jour_semaine) || jour_semaine < 1 || jour_semaine > 7) {
      throw new Error('Sélectionne un jour de la semaine.')
    }
  }

  if (frequence === TODO_FREQUENCY.WEEK_GOAL && date_echeance) {
    date_echeance = getWeekStartISO(date_echeance)
  }

  let quantite_cible = null
  if (payload.quantite_cible != null && payload.quantite_cible !== '') {
    const qty = Math.round(Number(payload.quantite_cible))
    if (!Number.isInteger(qty) || qty < 1 || qty > 9999) {
      throw new Error('La quantité doit être entre 1 et 9999.')
    }
    quantite_cible = qty
  }

  const reminderRequested = Boolean(payload.reminder)
  let reminder = false
  let reminder_time = null
  if (reminderRequested) {
    if (!heure) {
      throw new Error('Indique un horaire pour activer le rappel, ou désactive le rappel.')
    }
    const minutes = Math.round(Number(payload.reminder_time) || 0)
    if (!Number.isInteger(minutes) || minutes < 0) {
      throw new Error('Indique un délai de rappel valide ou désactive le rappel.')
    }
    reminder = true
    reminder_time = minutes
  }

  return {
    nom,
    description,
    frequence,
    jour_semaine: frequence === TODO_FREQUENCY.WEEKLY ? jour_semaine : null,
    heure,
    is_promesse,
    date_echeance,
    quantite_cible,
    reminder,
    reminder_time,
    ...(payload.is_done !== undefined ? { is_done: Boolean(payload.is_done) } : {}),
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listTodoItems(supabase, userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(TODO_ITEM_SELECT)
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })

  if (error) {
    const msg = String(error.message ?? '')
    if (msg.includes('note_id') || (error.code === 'PGRST204' && msg.includes("'note_id'"))) {
      const withoutNote = await supabase
        .from(TABLE)
        .select(
          'id, user_id, nom, description, frequence, jour_semaine, heure, date_echeance, is_promesse, is_done, quantite_cible, sort_order, timetable_event_id, reminder, reminder_time, created_at, updated_at',
        )
        .eq('user_id', userId)
        .order('sort_order', { ascending: true })
      if (withoutNote.error) {
        // continue to reminder fallback below
      } else {
        return (withoutNote.data ?? []).map((row) => ({ ...row, note_id: null }))
      }
    }
    if (msg.includes('reminder') || error.code === 'PGRST204') {
      const fallback = await supabase
        .from(TABLE)
        .select(
          'id, user_id, nom, description, frequence, jour_semaine, heure, date_echeance, is_promesse, is_done, quantite_cible, sort_order, timetable_event_id, created_at, updated_at',
        )
        .eq('user_id', userId)
        .order('sort_order', { ascending: true })
      if (fallback.error) throw fallback.error
      return (fallback.data ?? []).map((row) => ({
        ...row,
        reminder: false,
        reminder_time: null,
        note_id: null,
      }))
    }
    throw error
  }
  return data ?? []
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object} payload
 * @param {{ skipReminderSchedule?: boolean }} [options]
 */
export async function createTodoItem(supabase, userId, payload, options = {}) {
  if (!userId) throw new Error('Utilisateur non connecté.')

  const row = normalizeTodoPayload(payload)
  const existing = await listTodoItems(supabase, userId)

  if (row.is_promesse) {
    const limits = await loadTodoPromesseLimits(userId)
    assertPromesseLimits(existing, row, null, limits)
  }

  let sortOrder = existing.length
    ? Math.max(...existing.map((item) => item.sort_order ?? 0)) + 1
    : 1

  if (row.is_promesse) {
    sortOrder = 1
    if (existing.length) {
      const bumpResults = await Promise.all(
        existing.map((item) =>
          supabase
            .from(TABLE)
            .update({ sort_order: (item.sort_order ?? 0) + 1 })
            .eq('id', item.id)
            .eq('user_id', userId),
        ),
      )
      const bumpFailed = bumpResults.find((result) => result.error)
      if (bumpFailed?.error) throw bumpFailed.error
    }
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      ...row,
      is_done: false,
      sort_order: sortOrder,
      ...(payload.note_id ? { note_id: payload.note_id } : {}),
    })
    .select(TODO_ITEM_SELECT)
    .single()

  if (error) {
    const msg = String(error.message ?? '')
    if (error.code === 'PGRST204' && msg.includes("'note_id'")) {
      const retry = await supabase
        .from(TABLE)
        .insert({
          user_id: userId,
          ...row,
          is_done: false,
          sort_order: sortOrder,
        })
        .select(
          'id, user_id, nom, description, frequence, jour_semaine, heure, date_echeance, is_promesse, is_done, quantite_cible, sort_order, timetable_event_id, reminder, reminder_time, created_at, updated_at',
        )
        .single()
      if (retry.error) throw retry.error
      await refreshTodoPromesseReminder(userId)
      if (!options.skipReminderSchedule) {
        await refreshTodoItemReminder(userId, retry.data)
      } else {
        await clearTodoItemReminder(retry.data?.id)
      }
      return { ...retry.data, note_id: null }
    }
    throw error
  }
  await refreshTodoPromesseReminder(userId)
  if (!options.skipReminderSchedule) {
    await refreshTodoItemReminder(userId, data)
  } else {
    await clearTodoItemReminder(data?.id)
  }
  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} itemId
 * @param {object} payload
 * @param {{ skipReminderSchedule?: boolean }} [options]
 */
export async function replaceTodoItem(supabase, userId, itemId, payload, options = {}) {
  if (!userId || !itemId) throw new Error('Élément introuvable.')

  const row = normalizeTodoPayload(payload)

  if (row.is_promesse) {
    const existing = await listTodoItems(supabase, userId)
    const limits = await loadTodoPromesseLimits(userId)
    assertPromesseLimits(existing, row, itemId, limits)
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update({
      ...row,
      ...(payload.note_id !== undefined ? { note_id: payload.note_id || null } : {}),
    })
    .eq('id', itemId)
    .eq('user_id', userId)
    .select(TODO_ITEM_SELECT)
    .single()

  if (error) {
    const msg = String(error.message ?? '')
    if (error.code === 'PGRST204' && msg.includes("'note_id'")) {
      const retry = await supabase
        .from(TABLE)
        .update(row)
        .eq('id', itemId)
        .eq('user_id', userId)
        .select(
          'id, user_id, nom, description, frequence, jour_semaine, heure, date_echeance, is_promesse, is_done, quantite_cible, sort_order, timetable_event_id, reminder, reminder_time, created_at, updated_at',
        )
        .single()
      if (retry.error) throw retry.error
      await refreshTodoPromesseReminder(userId)
      if (!options.skipReminderSchedule) {
        await refreshTodoItemReminder(userId, retry.data)
      } else {
        await clearTodoItemReminder(retry.data?.id)
      }
      return { ...retry.data, note_id: null }
    }
    throw error
  }
  await refreshTodoPromesseReminder(userId)
  if (!options.skipReminderSchedule) {
    await refreshTodoItemReminder(userId, data)
  } else {
    await clearTodoItemReminder(data?.id)
  }
  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} itemId
 */
export async function deleteTodoItem(supabase, userId, itemId) {
  if (!userId || !itemId) return

  await clearTodoItemReminder(itemId)

  const { error } = await supabase.from(TABLE).delete().eq('id', itemId).eq('user_id', userId)

  if (error) throw error
  await refreshTodoPromesseReminder(userId)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} itemId
 * @param {{ is_done?: boolean }} patch
 */
export async function updateTodoItem(supabase, userId, itemId, patch) {
  if (!userId || !itemId) return

  const { error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', itemId)
    .eq('user_id', userId)

  if (error) throw error
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} startISO
 * @param {string} endISO
 */
export async function listTodoCompletionsInRange(supabase, userId, startISO, endISO) {
  const { data, error } = await supabase
    .from(COMPLETIONS_TABLE)
    .select('todo_item_id, completion_date, quantite_actuelle')
    .eq('user_id', userId)
    .gte('completion_date', startISO)
    .lte('completion_date', endISO)

  if (error) {
    if (String(error.message || '').includes('todo_item_completions')) {
      return []
    }
    throw error
  }

  return data ?? []
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object} item
 * @param {string} dateISO
 * @param {boolean} done
 */
export async function setTodoCompletionForDate(supabase, userId, item, dateISO, done) {
  if (!userId || !item?.id) return

  const date = getTodoOccurrenceKeyDate(item, dateISO)
  if (!date) {
    throw new Error('Date d’occurrence invalide pour cette tâche.')
  }

  if (item.quantite_cible != null && Number(item.quantite_cible) >= 1) {
    const cible = Number(item.quantite_cible)
    await setTodoQuantiteForDate(supabase, userId, item, dateISO, done ? cible : 0)
    return
  }

  // is_done d’abord (source de vérité affichage / table), puis completions
  await updateTodoItem(supabase, userId, item.id, { is_done: done })

  if (done) {
    const { error } = await supabase.from(COMPLETIONS_TABLE).upsert(
      {
        user_id: userId,
        todo_item_id: item.id,
        completion_date: date,
        quantite_actuelle: 1,
      },
      { onConflict: 'todo_item_id,completion_date' },
    )
    if (error && !String(error.message || '').includes('todo_item_completions')) throw error
  } else {
    const { error } = await supabase
      .from(COMPLETIONS_TABLE)
      .delete()
      .eq('user_id', userId)
      .eq('todo_item_id', item.id)
      .eq('completion_date', date)
    if (error && !String(error.message || '').includes('todo_item_completions')) throw error
  }

  await refreshTodoItemReminder(userId, { ...item, is_done: done })
}

/**
 * Met à jour la progression quantitative pour une occurrence (jour) dans todo_item_completions.
 */
export async function setTodoQuantiteForDate(supabase, userId, item, dateISO, quantiteActuelle) {
  if (!userId || !item?.id) return

  const date = getTodoOccurrenceKeyDate(item, dateISO)
  const cible = Number(item.quantite_cible)
  if (!date || !Number.isInteger(cible) || cible < 1) {
    throw new Error('Progression quantitative invalide pour cette tâche.')
  }

  const qty = Math.max(0, Math.round(Number(quantiteActuelle) || 0))
  // Atteint ou dépassé → is_done true ; en dessous → false
  const done = qty >= cible

  await updateTodoItem(supabase, userId, item.id, { is_done: done })

  if (qty === 0) {
    const { error } = await supabase
      .from(COMPLETIONS_TABLE)
      .delete()
      .eq('user_id', userId)
      .eq('todo_item_id', item.id)
      .eq('completion_date', date)
    if (error) throw error
  } else {
    const { error } = await supabase.from(COMPLETIONS_TABLE).upsert(
      {
        user_id: userId,
        todo_item_id: item.id,
        completion_date: date,
        quantite_actuelle: qty,
      },
      { onConflict: 'todo_item_id,completion_date' },
    )
    if (error) throw error
  }

  await refreshTodoItemReminder(userId, { ...item, is_done: done })
  return done
}

/**
 * Date de référence pour savoir si is_done doit être true (occurrence concernée).
 * @param {object} item
 * @param {string} referenceDateISO
 */
export function getTodoIsDoneCheckDate(item, referenceDateISO) {
  const ref = normalizeDateISO(referenceDateISO)
  if (!ref) return null
  if (
    item.frequence === TODO_FREQUENCY.ONE_OFF ||
    item.frequence === TODO_FREQUENCY.WEEK_GOAL
  ) {
    return normalizeDateISO(item.date_echeance) || ref
  }
  if (item.frequence === TODO_FREQUENCY.WEEKLY) {
    const weekday = Number(item.jour_semaine)
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return ref
    const currentWd = getIsoWeekdayFromISO(ref)
    const delta = currentWd >= weekday ? currentWd - weekday : currentWd - weekday + 7
    return addDaysISO(ref, -delta)
  }
  return ref
}

/**
 * Aligne is_done sur l’état coché réel (completions) pour tous les types de TODO.
 * Quantité : is_done = quantite_actuelle >= quantite_cible (atteint ou dépassé).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object[]} items
 * @param {Map<string, { quantite_actuelle?: number, binaryDone?: boolean }>} progressMap
 * @param {string} referenceDateISO date « courante » (aujourd’hui / jour affiché)
 */
export async function syncTodoIsDoneFlags(
  supabase,
  userId,
  items,
  progressMap,
  referenceDateISO,
) {
  if (!userId || !items?.length) return

  const ref = normalizeDateISO(referenceDateISO)
  if (!ref) return

  for (const item of items) {
    if (!item?.id) continue
    const checkDate = getTodoIsDoneCheckDate(item, ref)
    if (!checkDate) continue

    const keyDate = getTodoOccurrenceKeyDate(item, checkDate)
    const mapKey = keyDate ? `${item.id}:${keyDate}` : null
    const entry = mapKey ? progressMap?.get(mapKey) : null

    let done = isTodoCompletedOnDate(item, checkDate, progressMap)
    if (hasTodoQuantiteCible(item) && entry) {
      const qty = Number(entry.quantite_actuelle) || 0
      done = qty >= Number(item.quantite_cible)
    }

    // Sans ligne de completion chargée : ne pas rétrograder (sauf quotidien = nouveau jour)
    if (
      !done &&
      Boolean(item.is_done) &&
      !entry &&
      item.frequence !== TODO_FREQUENCY.DAILY
    ) {
      continue
    }

    if (Boolean(item.is_done) === done) continue

    try {
      await updateTodoItem(supabase, userId, item.id, { is_done: done })
      item.is_done = done
    } catch (err) {
      console.error('syncTodoIsDoneFlags:', item.id, err)
    }
  }
}

/** @deprecated Utiliser syncTodoIsDoneFlags */
export async function healOneOffDoneFlags(supabase, userId, items, progressMap) {
  return syncTodoIsDoneFlags(
    supabase,
    userId,
    items,
    progressMap,
    normalizeDateISO(items.find((i) => i.frequence === TODO_FREQUENCY.ONE_OFF)?.date_echeance) ||
      new Date().toISOString().slice(0, 10),
  )
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {Array<{ id: string }>} items
 */
export async function persistTodoOrders(supabase, userId, items) {
  if (!userId) return

  const updates = items.map((item, index) =>
    supabase
      .from(TABLE)
      .update({ sort_order: index + 1 })
      .eq('id', item.id)
      .eq('user_id', userId),
  )

  const results = await Promise.all(updates)
  const failed = results.find((result) => result.error)
  if (failed?.error) throw failed.error
}
