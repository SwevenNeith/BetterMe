import { TODO_FREQUENCY } from '../constants/todoOptions.js'
import { assertPromesseLimitForDate, normalizeDateISO } from '../utils/todoCalendar.js'

const TABLE = 'todo_items'
const COMPLETIONS_TABLE = 'todo_item_completions'

const TODO_ITEM_SELECT =
  'id, user_id, nom, description, frequence, jour_semaine, heure, date_echeance, is_promesse, is_done, quantite_cible, sort_order, created_at, updated_at'

async function refreshTodoPromesseReminder(userId) {
  if (!userId) return
  try {
    const { rescheduleTodoPromesseReminder } = await import('./todoPromesseNotifications.js')
    await rescheduleTodoPromesseReminder(userId)
  } catch (err) {
    console.error('refreshTodoPromesseReminder:', err)
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
  const date_echeance = normalizeDateISO(payload.date_echeance)

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

  let quantite_cible = null
  if (payload.quantite_cible != null && payload.quantite_cible !== '') {
    const qty = Math.round(Number(payload.quantite_cible))
    if (!Number.isInteger(qty) || qty < 1 || qty > 9999) {
      throw new Error('La quantité doit être entre 1 et 9999.')
    }
    quantite_cible = qty
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

  if (error) throw error
  return data ?? []
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object} payload
 */
export async function createTodoItem(supabase, userId, payload) {
  if (!userId) throw new Error('Utilisateur non connecté.')

  const row = normalizeTodoPayload(payload)
  const existing = await listTodoItems(supabase, userId)

  if (row.is_promesse) {
    assertPromesseLimitForDate(existing, row.date_echeance)
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
    })
    .select(TODO_ITEM_SELECT)
    .single()

  if (error) throw error
  await refreshTodoPromesseReminder(userId)
  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} itemId
 * @param {object} payload
 */
export async function replaceTodoItem(supabase, userId, itemId, payload) {
  if (!userId || !itemId) throw new Error('Élément introuvable.')

  const row = normalizeTodoPayload(payload)

  if (row.is_promesse) {
    const existing = await listTodoItems(supabase, userId)
    assertPromesseLimitForDate(existing, row.date_echeance, itemId)
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update(row)
    .eq('id', itemId)
    .eq('user_id', userId)
    .select(TODO_ITEM_SELECT)
    .single()

  if (error) throw error
  await refreshTodoPromesseReminder(userId)
  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} itemId
 */
export async function deleteTodoItem(supabase, userId, itemId) {
  if (!userId || !itemId) return

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

  const date = normalizeDateISO(dateISO)
  if (!date) return

  if (item.quantite_cible != null && Number(item.quantite_cible) >= 1) {
    const cible = Number(item.quantite_cible)
    await setTodoQuantiteForDate(supabase, userId, item, date, done ? cible : 0)
    return
  }

  if (item.frequence === TODO_FREQUENCY.ONE_OFF) {
    await updateTodoItem(supabase, userId, item.id, { is_done: done })
    return
  }

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
    if (error) throw error
    return
  }

  const { error } = await supabase
    .from(COMPLETIONS_TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('todo_item_id', item.id)
    .eq('completion_date', date)

  if (error) throw error
}

/**
 * Met à jour la progression quantitative pour une occurrence (jour) dans todo_item_completions.
 */
export async function setTodoQuantiteForDate(supabase, userId, item, dateISO, quantiteActuelle) {
  if (!userId || !item?.id) return

  const date = normalizeDateISO(dateISO)
  const cible = Number(item.quantite_cible)
  if (!date || !Number.isInteger(cible) || cible < 1) return

  const qty = Math.max(0, Math.min(cible, Math.round(Number(quantiteActuelle) || 0)))
  const done = qty >= cible

  if (item.frequence === TODO_FREQUENCY.ONE_OFF) {
    await updateTodoItem(supabase, userId, item.id, { is_done: done })
  }

  if (qty === 0) {
    const { error } = await supabase
      .from(COMPLETIONS_TABLE)
      .delete()
      .eq('user_id', userId)
      .eq('todo_item_id', item.id)
      .eq('completion_date', date)
    if (error) throw error
    return
  }

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
