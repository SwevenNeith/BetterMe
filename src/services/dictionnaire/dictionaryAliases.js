const TABLE = 'dictionary_entry_aliases'
const SELECT = 'id, user_id, entry_id, alias, created_at'

function trimRequired(value, message) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) throw new Error(message)
  return trimmed
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listDictionaryAliases(supabase, userId) {
  if (!userId) return []

  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT)
    .eq('user_id', userId)
    .order('alias', { ascending: true })

  if (error) throw error
  return data ?? []
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} entryId
 * @param {string} alias
 */
export async function createDictionaryAlias(supabase, userId, entryId, alias) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  if (!entryId) throw new Error('Entrée introuvable.')

  const normalizedAlias = trimRequired(alias, 'Indique une forme à lier.')

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      entry_id: entryId,
      alias: normalizedAlias,
    })
    .select(SELECT)
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Cette forme est déjà liée à une entrée du dictionnaire.')
    }
    throw error
  }
  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} aliasId
 */
export async function deleteDictionaryAlias(supabase, userId, aliasId) {
  if (!userId || !aliasId) return

  const { error } = await supabase.from(TABLE).delete().eq('id', aliasId).eq('user_id', userId)

  if (error) throw error
}
