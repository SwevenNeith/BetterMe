import {
  RABBIT_HOLE_SYSTEM_KEY,
  RABBIT_HOLE_TITLE,
} from '../../constants/notes/rabbitHole.js'
import { createNote, updateNote } from './notes.js'

const TABLE = 'notes'
const SELECT =
  'id, user_id, folder_id, title, content_md, system_key, vault_id, status, status_set_at, todo_item_id, created_at, updated_at'

/**
 * @param {Record<string, unknown>} row
 */
function normalizeNote(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    folder_id: row.folder_id ?? null,
    title: String(row.title ?? '').trim() || RABBIT_HOLE_TITLE,
    content_md: row.content_md ?? '',
    system_key: row.system_key ?? null,
    vault_id: row.vault_id ?? null,
    status: row.status ?? null,
    status_set_at: row.status_set_at ?? null,
    todo_item_id: row.todo_item_id ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? row.created_at ?? null,
  }
}

/**
 * Retrouve ou crée la note Rabbit Hole dans le coffre général (vault_id null).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function ensureRabbitHoleNote(supabase, userId) {
  if (!userId) throw new Error('Utilisateur invalide.')

  const { data: existing, error: existingError } = await supabase
    .from(TABLE)
    .select(SELECT)
    .eq('user_id', userId)
    .eq('system_key', RABBIT_HOLE_SYSTEM_KEY)
    .is('vault_id', null)
    .maybeSingle()

  if (existingError) throw existingError
  if (existing) return normalizeNote(existing)

  try {
    return await createNote(supabase, userId, {
      title: RABBIT_HOLE_TITLE,
      contentMd: '',
      folderId: null,
      vaultId: null,
      systemKey: RABBIT_HOLE_SYSTEM_KEY,
    })
  } catch (err) {
    if (String(err?.code) === '23505' || String(err?.message ?? '').includes('duplicate')) {
      const { data } = await supabase
        .from(TABLE)
        .select(SELECT)
        .eq('user_id', userId)
        .eq('system_key', RABBIT_HOLE_SYSTEM_KEY)
        .is('vault_id', null)
        .maybeSingle()
      if (data) return normalizeNote(data)
    }
    throw err
  }
}

/**
 * Ajoute une pensée en puce à la fin de la note Rabbit Hole (plus ancienne en premier).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} thought
 */
export async function appendThoughtToRabbitHole(supabase, userId, thought) {
  const trimmed = String(thought ?? '').trim()
  if (!trimmed) throw new Error('La pensée est requise.')

  const note = await ensureRabbitHoleNote(supabase, userId)
  const bullet = `- ${trimmed.replace(/\r\n/g, '\n').replace(/\n+/g, ' ')}`
  const previous = String(note.content_md ?? '').replace(/\s+$/, '')
  const contentMd = previous ? `${previous}\n${bullet}` : bullet

  return await updateNote(supabase, userId, note.id, {
    title: RABBIT_HOLE_TITLE,
    contentMd,
  })
}
