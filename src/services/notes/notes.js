import {
  MARKDOWN_TUTORIAL_CONTENT,
  MARKDOWN_TUTORIAL_SYSTEM_KEY,
  MARKDOWN_TUTORIAL_TITLE,
  needsMarkdownTutorialUpgrade,
} from '../constants/markdownTutorial.js'
import { normalizeNoteStatus } from '../constants/noteStatus.js'

const TABLE = 'notes'
const SEED_TABLE = 'notes_seed_state'
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
    status: normalizeNoteStatus(row.status),
    status_set_at: row.status_set_at ?? null,
    todo_item_id: row.todo_item_id ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? row.created_at ?? null,
  }
}

async function selectNotes(supabase, buildQuery) {
  const primary = await buildQuery(SELECT)
  if (!primary.error) return primary

  if (isMissingStatusColumnError(primary.error)) {
    const fallback = await buildQuery(SELECT_LEGACY)
    if (fallback.error) throw fallback.error
    return fallback
  }

  throw primary.error
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listNotes(supabase, userId) {
  const { data, error } = await selectNotes(supabase, (columns) =>
    supabase.from(TABLE).select(columns).eq('user_id', userId).order('title', { ascending: true }),
  )
  if (error) throw error
  return (data ?? []).map(normalizeNote)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} noteId
 */
export async function getNote(supabase, userId, noteId) {
  if (!userId || !noteId) return null

  const { data, error } = await selectNotes(supabase, (columns) =>
    supabase.from(TABLE).select(columns).eq('id', noteId).eq('user_id', userId).maybeSingle(),
  )
  if (error) throw error
  return data ? normalizeNote(data) : null
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{
 *   title?: string,
 *   contentMd?: string,
 *   folderId?: string | null,
 *   systemKey?: string | null,
 *   vaultId?: string | null,
 *   status?: string | null,
 *   statusSetAt?: string | null,
 * }} input
 */
export async function createNote(supabase, userId, input = {}) {
  if (!userId) throw new Error('Utilisateur non connecté.')

  const title = String(input?.title ?? '').trim() || 'Nouvelle note'
  const contentMd = String(input?.contentMd ?? input?.content_md ?? '')
  const now = new Date().toISOString()
  const status = normalizeNoteStatus(input?.status)

  const row = {
    user_id: userId,
    folder_id: input?.folderId ?? input?.folder_id ?? null,
    title,
    content_md: contentMd,
    created_at: now,
    updated_at: now,
  }

  const systemKey = input?.systemKey ?? input?.system_key ?? null
  if (systemKey) row.system_key = systemKey

  const vaultId = input?.vaultId ?? input?.vault_id ?? null
  if (vaultId) row.vault_id = vaultId

  if (status) {
    row.status = status
    row.status_set_at =
      input?.statusSetAt ?? input?.status_set_at ?? (status === 'a_traiter' ? now : null)
  }

  let result = await supabase.from(TABLE).insert(row).select(SELECT).single()
  if (result.error && isMissingStatusColumnError(result.error)) {
    delete row.status
    delete row.status_set_at
    result = await supabase.from(TABLE).insert(row).select(SELECT_LEGACY).single()
  }
  if (result.error) throw result.error
  return normalizeNote(result.data)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} noteId
 * @param {{
 *   title?: string,
 *   contentMd?: string,
 *   folderId?: string | null,
 *   status?: string | null,
 *   statusSetAt?: string | null,
 *   todoItemId?: string | null,
 * }} input
 */
export async function updateNote(supabase, userId, noteId, input) {
  if (!userId || !noteId) throw new Error('Note invalide.')

  const patch = { updated_at: new Date().toISOString() }
  if (input?.title !== undefined) {
    const title = String(input.title ?? '').trim()
    if (!title) throw new Error('Le titre est requis.')
    patch.title = title
  }
  if (input?.contentMd !== undefined || input?.content_md !== undefined) {
    patch.content_md = String(input.contentMd ?? input.content_md ?? '')
  }
  if (input?.folderId !== undefined || input?.folder_id !== undefined) {
    patch.folder_id = input.folderId ?? input.folder_id ?? null
  }
  if (input?.status !== undefined) {
    const status = normalizeNoteStatus(input.status)
    patch.status = status || null
    if (input?.statusSetAt !== undefined || input?.status_set_at !== undefined) {
      patch.status_set_at = input.statusSetAt ?? input.status_set_at ?? null
    } else if (!status) {
      patch.status_set_at = null
    }
  } else if (input?.statusSetAt !== undefined || input?.status_set_at !== undefined) {
    patch.status_set_at = input.statusSetAt ?? input.status_set_at ?? null
  }
  if (input?.todoItemId !== undefined || input?.todo_item_id !== undefined) {
    patch.todo_item_id = input.todoItemId ?? input.todo_item_id ?? null
  }

  let result = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', noteId)
    .eq('user_id', userId)
    .select(SELECT)
    .single()

  if (result.error && isMissingStatusColumnError(result.error)) {
    const legacyPatch = { ...patch }
    delete legacyPatch.status
    delete legacyPatch.status_set_at
    delete legacyPatch.todo_item_id
    result = await supabase
      .from(TABLE)
      .update(legacyPatch)
      .eq('id', noteId)
      .eq('user_id', userId)
      .select(SELECT_LEGACY)
      .single()
  }

  if (result.error) throw result.error
  return normalizeNote(result.data)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} noteId
 * @param {{ system_key?: string | null } | null} [note]
 */
export async function deleteNote(supabase, userId, noteId, note = null) {
  if (!userId || !noteId) throw new Error('Note invalide.')

  let systemKey = note?.system_key ?? null
  if (systemKey === undefined) {
    const existing = await getNote(supabase, userId, noteId)
    systemKey = existing?.system_key ?? null
  }

  const { error } = await supabase.from(TABLE).delete().eq('id', noteId).eq('user_id', userId)
  if (error) throw error

  if (systemKey === MARKDOWN_TUTORIAL_SYSTEM_KEY) {
    await markMarkdownTutorialRemoved(supabase, userId)
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
async function isMarkdownTutorialRemoved(supabase, userId) {
  const { data, error } = await supabase
    .from(SEED_TABLE)
    .select('markdown_tutorial_removed')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return Boolean(data?.markdown_tutorial_removed)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
async function markMarkdownTutorialRemoved(supabase, userId) {
  const now = new Date().toISOString()
  const { error } = await supabase.from(SEED_TABLE).upsert(
    {
      user_id: userId,
      markdown_tutorial_removed: true,
      updated_at: now,
    },
    { onConflict: 'user_id' },
  )
  if (error) throw error
}

/**
 * Crée le tutoriel Markdown s’il n’existe pas et n’a pas été supprimé.
 * Met à jour le contenu système s’il est obsolète (widgets, Templates en double, etc.).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function ensureMarkdownTutorial(supabase, userId) {
  if (!userId) return null

  const { data: existing, error: existingError } = await selectNotes(supabase, (columns) =>
    supabase
      .from(TABLE)
      .select(columns)
      .eq('user_id', userId)
      .eq('system_key', MARKDOWN_TUTORIAL_SYSTEM_KEY)
      .maybeSingle(),
  )

  if (existingError) throw existingError

  if (existing) {
    const note = normalizeNote(existing)
    if (!needsMarkdownTutorialUpgrade(note.content_md)) return note

    return await updateNote(supabase, userId, note.id, {
      title: MARKDOWN_TUTORIAL_TITLE,
      contentMd: MARKDOWN_TUTORIAL_CONTENT,
    })
  }

  if (await isMarkdownTutorialRemoved(supabase, userId)) return null

  try {
    return await createNote(supabase, userId, {
      title: MARKDOWN_TUTORIAL_TITLE,
      contentMd: MARKDOWN_TUTORIAL_CONTENT,
      folderId: null,
      systemKey: MARKDOWN_TUTORIAL_SYSTEM_KEY,
    })
  } catch (err) {
    // Course possible si deux onglets seedent en même temps
    if (String(err?.code) === '23505' || String(err?.message ?? '').includes('duplicate')) {
      const { data } = await selectNotes(supabase, (columns) =>
        supabase
          .from(TABLE)
          .select(columns)
          .eq('user_id', userId)
          .eq('system_key', MARKDOWN_TUTORIAL_SYSTEM_KEY)
          .maybeSingle(),
      )
      return data ? normalizeNote(data) : null
    }
    throw err
  }
}
