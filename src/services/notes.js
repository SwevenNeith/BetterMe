import {
  MARKDOWN_TUTORIAL_CONTENT,
  MARKDOWN_TUTORIAL_SYSTEM_KEY,
  MARKDOWN_TUTORIAL_TITLE,
} from '../constants/markdownTutorial.js'

const TABLE = 'notes'
const SEED_TABLE = 'notes_seed_state'
const SELECT = 'id, user_id, folder_id, title, content_md, system_key, created_at, updated_at'

function normalizeNote(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    folder_id: row.folder_id ?? null,
    title: String(row.title ?? '').trim() || 'Sans titre',
    content_md: row.content_md ?? '',
    system_key: row.system_key ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? row.created_at ?? null,
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listNotes(supabase, userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT)
    .eq('user_id', userId)
    .order('title', { ascending: true })

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

  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT)
    .eq('id', noteId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data ? normalizeNote(data) : null
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ title?: string, contentMd?: string, folderId?: string | null, systemKey?: string | null }} input
 */
export async function createNote(supabase, userId, input = {}) {
  if (!userId) throw new Error('Utilisateur non connecté.')

  const title = String(input?.title ?? '').trim() || 'Nouvelle note'
  const contentMd = String(input?.contentMd ?? input?.content_md ?? '')
  const now = new Date().toISOString()

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

  const { data, error } = await supabase.from(TABLE).insert(row).select(SELECT).single()
  if (error) throw error
  return normalizeNote(data)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} noteId
 * @param {{ title?: string, contentMd?: string, folderId?: string | null }} input
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

  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', noteId)
    .eq('user_id', userId)
    .select(SELECT)
    .single()

  if (error) throw error
  return normalizeNote(data)
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
 * Met à jour le contenu système s’il manque la section wikilinks.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function ensureMarkdownTutorial(supabase, userId) {
  if (!userId) return null

  const { data: existing, error: existingError } = await supabase
    .from(TABLE)
    .select(SELECT)
    .eq('user_id', userId)
    .eq('system_key', MARKDOWN_TUTORIAL_SYSTEM_KEY)
    .maybeSingle()

  if (existingError) throw existingError

  if (existing) {
    const note = normalizeNote(existing)
    const needsWikiSection = !note.content_md.includes('Liens entre notes')
    if (!needsWikiSection) return note

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
      const { data } = await supabase
        .from(TABLE)
        .select(SELECT)
        .eq('user_id', userId)
        .eq('system_key', MARKDOWN_TUTORIAL_SYSTEM_KEY)
        .maybeSingle()
      return data ? normalizeNote(data) : null
    }
    throw err
  }
}
