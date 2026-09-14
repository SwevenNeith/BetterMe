import { sanitizeRichNoteHtml } from '../utils/sanitizeHtml.js'

const TABLE = 'journal_entries'
const ENTRY_SELECT = 'id, user_id, prompt_id, title, content_html, created_at, updated_at'

/**
 * Formate une date en titre de journal (ex. « 23 juillet 2026 »).
 * @param {string | Date | null | undefined} value
 */
export function formatJournalDateTitle(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value || Date.now())
  if (Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date())
  }
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

/**
 * Titre affiché : titre saisi, sinon la date de l’entrée.
 * @param {{ title?: string | null, created_at?: string | null } | null | undefined} entry
 */
export function resolveJournalEntryTitle(entry) {
  const title = String(entry?.title ?? '').trim()
  if (title) return title
  return formatJournalDateTitle(entry?.created_at)
}

function normalizeEntry(row) {
  const createdAt = row.created_at ?? null
  const rawTitle = String(row.title ?? '').trim()
  return {
    id: row.id,
    user_id: row.user_id,
    prompt_id: row.prompt_id ?? null,
    title: rawTitle || formatJournalDateTitle(createdAt),
    content_html: row.content_html ?? '',
    created_at: createdAt,
    updated_at: row.updated_at ?? createdAt,
  }
}

function buildEntryRow(input) {
  const contentHtml = sanitizeRichNoteHtml(input?.contentHtml ?? input?.content_html ?? '')
  const explicitTitle = String(input?.title ?? '').trim()
  const title =
    explicitTitle ||
    formatJournalDateTitle(input?.createdAt || input?.created_at || new Date())

  return {
    prompt_id: input?.promptId || input?.prompt_id || null,
    title,
    content_html: contentHtml || null,
    updated_at: new Date().toISOString(),
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listJournalEntries(supabase, userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(ENTRY_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(normalizeEntry)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} entryId
 */
export async function getJournalEntry(supabase, userId, entryId) {
  if (!userId || !entryId) return null

  const { data, error } = await supabase
    .from(TABLE)
    .select(ENTRY_SELECT)
    .eq('id', entryId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data ? normalizeEntry(data) : null
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ title?: string, contentHtml?: string, promptId?: string | null }} input
 */
export async function createJournalEntry(supabase, userId, input) {
  if (!userId) throw new Error('Utilisateur non connecté.')

  const row = buildEntryRow(input)
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      ...row,
      created_at: now,
      updated_at: now,
    })
    .select(ENTRY_SELECT)
    .single()

  if (error) throw error
  return normalizeEntry(data)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} entryId
 * @param {{ title?: string, contentHtml?: string, promptId?: string | null }} input
 */
export async function updateJournalEntry(supabase, userId, entryId, input) {
  if (!userId || !entryId) throw new Error('Entrée introuvable.')

  const row = buildEntryRow(input)
  const { data, error } = await supabase
    .from(TABLE)
    .update(row)
    .eq('id', entryId)
    .eq('user_id', userId)
    .select(ENTRY_SELECT)
    .single()

  if (error) throw error
  return normalizeEntry(data)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} entryId
 */
export async function deleteJournalEntry(supabase, userId, entryId) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', entryId)
    .eq('user_id', userId)

  if (error) throw error
}
