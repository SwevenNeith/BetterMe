import { isDictionaryWordType } from '../constants/dictionaryWordTypes.js'

const TABLE = 'dictionary_entries'
const SELECT = 'id, user_id, word, definition, word_type, created_at, updated_at'

function trimRequired(value, message) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) throw new Error(message)
  return trimmed
}

function assertType(wordType) {
  const id = String(wordType ?? '').trim()
  if (!isDictionaryWordType(id)) {
    throw new Error('Choisis un type de mot valide.')
  }
  return id
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listDictionaryEntries(supabase, userId) {
  if (!userId) return []

  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT)
    .eq('user_id', userId)
    .order('word', { ascending: true })

  if (error) throw error
  return data ?? []
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object} input
 */
export async function createDictionaryEntry(supabase, userId, input) {
  if (!userId) throw new Error('Utilisateur non connecté.')

  const word = trimRequired(input?.word, 'Indique un mot.')
  const definition = trimRequired(input?.definition, 'Indique une définition.')
  const word_type = assertType(input?.word_type)

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      word,
      definition,
      word_type,
    })
    .select(SELECT)
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Cette entrée (mot + type) existe déjà.')
    }
    throw error
  }
  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} entryId
 * @param {object} input
 */
export async function updateDictionaryEntry(supabase, userId, entryId, input) {
  if (!userId || !entryId) throw new Error('Entrée introuvable.')

  const word = trimRequired(input?.word, 'Indique un mot.')
  const definition = trimRequired(input?.definition, 'Indique une définition.')
  const word_type = assertType(input?.word_type)

  const { data, error } = await supabase
    .from(TABLE)
    .update({
      word,
      definition,
      word_type,
      updated_at: new Date().toISOString(),
    })
    .eq('id', entryId)
    .eq('user_id', userId)
    .select(SELECT)
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Cette entrée (mot + type) existe déjà.')
    }
    throw error
  }
  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} entryId
 */
export async function deleteDictionaryEntry(supabase, userId, entryId) {
  if (!userId || !entryId) return

  const { error } = await supabase.from(TABLE).delete().eq('id', entryId).eq('user_id', userId)

  if (error) throw error
}
