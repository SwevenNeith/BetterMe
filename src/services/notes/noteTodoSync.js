import {
  NOTE_STATUS,
  NOTE_STATUS_TODOS_EXTENSION_ID,
  normalizeNoteStatus,
} from '../constants/noteStatus.js'
import { TODO_FREQUENCY } from '../constants/todoOptions.js'
import {
  buildCompletionProgressMap,
  getWeekStartISO,
  isTodoCompletedOnDate,
  normalizeDateISO,
} from '../utils/todoCalendar.js'
import { getLocalTodayISO } from './scheduledReminders.js'
import { isNotesExtensionEnabled } from './notesExtensions.js'
import { loadVaultExtensionPrefs } from './noteVaultSettings.js'
import {
  createTodoItem,
  deleteTodoItem,
  listTodoCompletionsInRange,
  listTodoItems,
  replaceTodoItem,
  setTodoCompletionForDate,
  updateTodoItem,
} from './todoItems.js'
import { getNote, listNotes, updateNote } from './notes.js'

function isMissingLinkColumnError(error) {
  const msg = String(error?.message ?? '')
  return (
    error?.code === 'PGRST204' &&
    (msg.includes("'note_id'") || msg.includes("'todo_item_id'") || msg.includes("'status'"))
  )
}

/**
 * Libellé TODO pour une note : « Note - Titre ».
 * @param {string | null | undefined} title
 */
export function formatNoteTodoLabel(title) {
  const clean = String(title ?? '').trim() || 'Sans titre'
  return `Note - ${clean}`
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string | null | undefined} vaultId
 */
export async function isNoteStatusTodosEnabled(supabase, userId, vaultId = null) {
  if (!userId) return false
  try {
    const prefs = await loadVaultExtensionPrefs(supabase, userId, vaultId ?? null)
    return isNotesExtensionEnabled(prefs, NOTE_STATUS_TODOS_EXTENSION_ID)
  } catch (err) {
    console.error('note status prefs:', err)
    return false
  }
}

/**
 * @param {object} note
 * @returns {string} YYYY-MM-DD
 */
export function resolveNoteStatusAnchorDate(note) {
  const fromStatus = normalizeDateISO(String(note?.status_set_at ?? '').slice(0, 10))
  if (fromStatus) return fromStatus
  const fromCreated = normalizeDateISO(String(note?.created_at ?? '').slice(0, 10))
  if (fromCreated) return fromCreated
  return getLocalTodayISO()
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} noteId
 * @param {string | null} todoItemId
 */
async function linkNoteAndTodo(supabase, userId, noteId, todoItemId) {
  try {
    await updateNote(supabase, userId, noteId, { todoItemId })
  } catch (err) {
    if (!isMissingLinkColumnError(err)) throw err
  }
  if (todoItemId) {
    try {
      await updateTodoItem(supabase, userId, todoItemId, { note_id: noteId })
    } catch (err) {
      if (!isMissingLinkColumnError(err)) throw err
    }
  }
}

/**
 * Assure un TODO « Cette semaine » pour une note À traiter.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object} note
 * @param {string} [anchorDateISO]
 */
export async function ensureWeekTodoForNote(supabase, userId, note, anchorDateISO) {
  if (!userId || !note?.id) return note

  const weekStart = getWeekStartISO(anchorDateISO || resolveNoteStatusAnchorDate(note))
  const title = formatNoteTodoLabel(note.title)
  let todo = null

  if (note.todo_item_id) {
    const items = await listTodoItems(supabase, userId)
    todo = items.find((item) => item.id === note.todo_item_id) ?? null
  }

  if (!todo) {
    const items = await listTodoItems(supabase, userId)
    todo = items.find((item) => item.note_id === note.id) ?? null
  }

  try {
    if (todo) {
      const updated = await replaceTodoItem(supabase, userId, todo.id, {
        nom: title,
        description: todo.description || '',
        frequence: TODO_FREQUENCY.WEEK_GOAL,
        date_echeance: weekStart,
        heure: todo.heure,
        is_promesse: Boolean(todo.is_promesse),
        quantite_cible: todo.quantite_cible,
        reminder: Boolean(todo.reminder),
        reminder_time: todo.reminder_time,
        note_id: note.id,
      })
      todo = updated
    } else {
      todo = await createTodoItem(supabase, userId, {
        nom: title,
        description: '',
        frequence: TODO_FREQUENCY.WEEK_GOAL,
        date_echeance: weekStart,
        is_promesse: false,
        note_id: note.id,
      })
    }
  } catch (err) {
    if (isMissingLinkColumnError(err)) {
      console.warn(
        'Colonnes note↔todo absentes. Exécute scripts/migrate-notes-status-todos.sql',
      )
      return note
    }
    throw err
  }

  await linkNoteAndTodo(supabase, userId, note.id, todo.id)
  return {
    ...note,
    todo_item_id: todo.id,
  }
}

/**
 * Applique un changement de statut et synchronise le TODO.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object} note
 * @param {string} nextStatusRaw
 * @param {{ skipEnabledCheck?: boolean }} [options]
 */
export async function applyNoteStatusChange(
  supabase,
  userId,
  note,
  nextStatusRaw,
  options = {},
) {
  if (!userId || !note?.id) return note

  if (!options.skipEnabledCheck) {
    const enabled = await isNoteStatusTodosEnabled(supabase, userId, note.vault_id ?? null)
    if (!enabled) {
      // Toujours persister le statut si la colonne existe, même si l’extension
      // est off ? Non — UI cachée ; si appelé, on ignore.
      return note
    }
  }

  const previous = normalizeNoteStatus(note.status)
  const next = normalizeNoteStatus(nextStatusRaw)

  /** @type {{ status: string, statusSetAt?: string | null }} */
  const patch = { status: next || null }
  if (next === NOTE_STATUS.A_TRAITER && previous !== NOTE_STATUS.A_TRAITER) {
    patch.statusSetAt = new Date().toISOString()
  } else if (next !== NOTE_STATUS.A_TRAITER) {
    // conserve status_set_at historique sauf retrait total
    if (!next) patch.statusSetAt = null
  } else if (next === NOTE_STATUS.A_TRAITER && note.status_set_at) {
    patch.statusSetAt = note.status_set_at
  }

  let updated = await updateNote(supabase, userId, note.id, patch)
  updated = { ...note, ...updated }

  if (next === NOTE_STATUS.A_TRAITER) {
    updated = await ensureWeekTodoForNote(supabase, userId, updated)
    return updated
  }

  // Fait ou Aucun : gérer le TODO lié
  let todo = null
  const items = await listTodoItems(supabase, userId)
  if (updated.todo_item_id) {
    todo = items.find((item) => item.id === updated.todo_item_id) ?? null
  }
  if (!todo) {
    todo = items.find((item) => item.note_id === updated.id) ?? null
  }

  if (next === NOTE_STATUS.FAIT && todo) {
    const weekStart =
      normalizeDateISO(todo.date_echeance) || getWeekStartISO(getLocalTodayISO())
    await setTodoCompletionForDate(supabase, userId, todo, weekStart, true)
    return updated
  }

  if (!next && todo) {
    await deleteTodoItem(supabase, userId, todo.id)
    updated = await updateNote(supabase, userId, updated.id, { todoItemId: null })
    return { ...updated, todo_item_id: null }
  }

  return updated
}

/**
 * Report des notes « À traiter » non terminées vers la semaine courante.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function rolloverOverdueNoteTodos(supabase, userId) {
  if (!userId) return { rolled: 0, completed: 0 }

  let notes = []
  try {
    notes = await listNotes(supabase, userId)
  } catch (err) {
    if (isMissingLinkColumnError(err)) return { rolled: 0, completed: 0 }
    throw err
  }

  const candidates = notes.filter(
    (note) => normalizeNoteStatus(note.status) === NOTE_STATUS.A_TRAITER,
  )
  if (!candidates.length) return { rolled: 0, completed: 0 }

  // Ne traite que les notes dont l’extension est active pour leur coffre
  /** @type {Map<string, boolean>} */
  const enabledByVault = new Map()
  async function vaultEnabled(vaultId) {
    const key = vaultId || 'root'
    if (enabledByVault.has(key)) return enabledByVault.get(key)
    const ok = await isNoteStatusTodosEnabled(supabase, userId, vaultId)
    enabledByVault.set(key, ok)
    return ok
  }

  const items = await listTodoItems(supabase, userId)
  const today = getLocalTodayISO()
  const currentWeekStart = getWeekStartISO(today)

  // Charger completions sur une fenêtre large (8 semaines)
  const rangeStart = getWeekStartISO(
    normalizeDateISO(
      new Date(Date.now() - 56 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    ) || currentWeekStart,
  )
  const completions = await listTodoCompletionsInRange(
    supabase,
    userId,
    rangeStart,
    currentWeekStart,
  )
  const progressMap = buildCompletionProgressMap(completions)

  let rolled = 0
  let completed = 0

  for (const note of candidates) {
    if (!(await vaultEnabled(note.vault_id ?? null))) continue

    let todo =
      (note.todo_item_id && items.find((item) => item.id === note.todo_item_id)) ||
      items.find((item) => item.note_id === note.id) ||
      null

    if (!todo) {
      await ensureWeekTodoForNote(supabase, userId, note, currentWeekStart)
      rolled += 1
      continue
    }

    if (todo.frequence !== TODO_FREQUENCY.WEEK_GOAL) continue

    const todoWeek = normalizeDateISO(todo.date_echeance)
    if (!todoWeek) continue

    if (todoWeek >= currentWeekStart) {
      const expected = formatNoteTodoLabel(note.title)
      if (todo.nom !== expected) {
        await replaceTodoItem(supabase, userId, todo.id, {
          nom: expected,
          description: todo.description || '',
          frequence: TODO_FREQUENCY.WEEK_GOAL,
          date_echeance: todoWeek,
          heure: todo.heure,
          is_promesse: Boolean(todo.is_promesse),
          quantite_cible: todo.quantite_cible,
          reminder: Boolean(todo.reminder),
          reminder_time: todo.reminder_time,
          note_id: note.id,
        })
      }
      continue
    }

    const done = isTodoCompletedOnDate(todo, todoWeek, progressMap)
    if (done) {
      await updateNote(supabase, userId, note.id, {
        status: NOTE_STATUS.FAIT,
        statusSetAt: note.status_set_at,
      })
      completed += 1
      continue
    }

    await replaceTodoItem(supabase, userId, todo.id, {
      nom: formatNoteTodoLabel(note.title ?? todo.nom),
      description: todo.description || '',
      frequence: TODO_FREQUENCY.WEEK_GOAL,
      date_echeance: currentWeekStart,
      heure: todo.heure,
      is_promesse: Boolean(todo.is_promesse),
      quantite_cible: todo.quantite_cible,
      reminder: Boolean(todo.reminder),
      reminder_time: todo.reminder_time,
      note_id: note.id,
    })
    rolled += 1
  }

  return { rolled, completed }
}

/**
 * Quand un TODO lié à une note est coché / décoché.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object} todoItem
 * @param {boolean} done
 */
export async function syncNoteStatusFromTodoCompletion(supabase, userId, todoItem, done) {
  if (!userId || !todoItem?.note_id) return null

  try {
    const note = await getNote(supabase, userId, todoItem.note_id)
    if (!note) return null
    const enabled = await isNoteStatusTodosEnabled(supabase, userId, note.vault_id ?? null)
    if (!enabled) return null

    if (done) {
      return await updateNote(supabase, userId, note.id, {
        status: NOTE_STATUS.FAIT,
        statusSetAt: note.status_set_at,
      })
    }

    if (normalizeNoteStatus(note.status) === NOTE_STATUS.FAIT) {
      return await updateNote(supabase, userId, note.id, {
        status: NOTE_STATUS.A_TRAITER,
        statusSetAt: note.status_set_at || new Date().toISOString(),
      })
    }
    return note
  } catch (err) {
    if (isMissingLinkColumnError(err)) return null
    throw err
  }
}

/**
 * Met à jour le nom du TODO lié si le titre de la note change.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object} note
 */
export async function syncLinkedTodoTitle(supabase, userId, note) {
  if (!userId || !note?.id || !note.todo_item_id) return
  if (normalizeNoteStatus(note.status) !== NOTE_STATUS.A_TRAITER) return

  const items = await listTodoItems(supabase, userId)
  const todo = items.find((item) => item.id === note.todo_item_id)
  if (!todo) return

  const title = formatNoteTodoLabel(note.title)
  if (todo.nom === title) return

  await replaceTodoItem(supabase, userId, todo.id, {
    nom: title,
    description: todo.description || '',
    frequence: todo.frequence || TODO_FREQUENCY.WEEK_GOAL,
    date_echeance: todo.date_echeance,
    heure: todo.heure,
    is_promesse: Boolean(todo.is_promesse),
    quantite_cible: todo.quantite_cible,
    reminder: Boolean(todo.reminder),
    reminder_time: todo.reminder_time,
    note_id: note.id,
  })
}
