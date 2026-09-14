import {
  dailyNoteSystemKeyForDate,
  formatDailyNoteTitle,
} from '../constants/dailyNotes.js'
import { NOTE_STATUS } from '../constants/noteStatus.js'
import { ensureDailyNotesFolder } from './noteFolders.js'
import { createNote, updateNote } from './notes.js'
import {
  applyNoteStatusChange,
  isNoteStatusTodosEnabled,
} from './noteTodoSync.js'

const TABLE = 'notes'
const SELECT =
  'id, user_id, folder_id, title, content_md, system_key, vault_id, status, status_set_at, todo_item_id, created_at, updated_at'
const SELECT_LEGACY =
  'id, user_id, folder_id, title, content_md, system_key, vault_id, created_at, updated_at'

function isMissingStatusColumnError(error) {
  return (
    error?.code === 'PGRST204' &&
    typeof error.message === 'string' &&
    (error.message.includes("'status'") ||
      error.message.includes("'status_set_at'") ||
      error.message.includes("'todo_item_id'"))
  )
}

function normalizeNote(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    folder_id: row.folder_id ?? null,
    title: String(row.title ?? '').trim() || 'Sans titre',
    content_md: row.content_md ?? '',
    system_key: row.system_key ?? null,
    vault_id: row.vault_id ?? null,
    status: row.status ?? '',
    status_set_at: row.status_set_at ?? null,
    todo_item_id: row.todo_item_id ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? row.created_at ?? null,
  }
}

/**
 * Charge la note du jour si elle existe (sans créer).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {Date} [date]
 */
export async function getTodayDailyNote(supabase, userId, date = new Date()) {
  if (!userId) return null

  const systemKey = dailyNoteSystemKeyForDate(date)
  let result = await supabase
    .from(TABLE)
    .select(SELECT)
    .eq('user_id', userId)
    .eq('system_key', systemKey)
    .maybeSingle()

  if (result.error && isMissingStatusColumnError(result.error)) {
    result = await supabase
      .from(TABLE)
      .select(SELECT_LEGACY)
      .eq('user_id', userId)
      .eq('system_key', systemKey)
      .maybeSingle()
  }

  if (result.error) throw result.error
  return result.data ? normalizeNote(result.data) : null
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object} note
 * @param {boolean} isNew
 */
async function maybeApplyDailyNoteStatus(supabase, userId, note, isNew) {
  if (!isNew || !note?.id) return note
  try {
    const enabled = await isNoteStatusTodosEnabled(supabase, userId, note.vault_id ?? null)
    if (!enabled) return note
    return await applyNoteStatusChange(supabase, userId, note, NOTE_STATUS.A_TRAITER, {
      skipEnabledCheck: true,
    })
  } catch (err) {
    console.error('daily note status:', err)
    return note
  }
}

/**
 * Crée ou met à jour la note quotidienne du jour.
 * Le dossier Daily Notes est assuré à la première écriture.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} content
 * @param {{ noteId?: string | null, date?: Date }} [options]
 */
export async function saveTodayDailyNote(supabase, userId, content, options = {}) {
  if (!userId) throw new Error('Utilisateur non connecté.')

  const date = options.date ?? new Date()
  const contentMd = String(content ?? '')
  const systemKey = dailyNoteSystemKeyForDate(date)
  const title = formatDailyNoteTitle(date)

  if (options.noteId) {
    return await updateNote(supabase, userId, options.noteId, {
      title,
      contentMd,
    })
  }

  const existing = await getTodayDailyNote(supabase, userId, date)
  if (existing) {
    return await updateNote(supabase, userId, existing.id, {
      title,
      contentMd,
      folderId: existing.folder_id,
    })
  }

  const folder = await ensureDailyNotesFolder(supabase, userId)

  try {
    const created = await createNote(supabase, userId, {
      title,
      contentMd,
      folderId: folder.id,
      systemKey,
    })
    return await maybeApplyDailyNoteStatus(supabase, userId, created, true)
  } catch (err) {
    if (String(err?.code) === '23505' || String(err?.message ?? '').includes('duplicate')) {
      const raced = await getTodayDailyNote(supabase, userId, date)
      if (raced) {
        return await updateNote(supabase, userId, raced.id, {
          title,
          contentMd,
          folderId: raced.folder_id ?? folder.id,
        })
      }
    }
    throw err
  }
}
