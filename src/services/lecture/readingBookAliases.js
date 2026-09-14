const TABLE = 'reading_book_aliases'

const ALIAS_SELECT = 'id, user_id, book_id, alias, created_at'

const DUPLICATE_ALIAS_MESSAGE = 'Cet alias est déjà associé à un livre de votre bibliothèque.'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listReadingBookAliases(supabase, userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(ALIAS_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} bookId
 * @param {string} alias
 */
export async function createReadingBookAlias(supabase, userId, bookId, alias) {
  const trimmed = String(alias ?? '').trim()
  if (!trimmed) throw new Error('Indiquez un alias à associer.')

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      book_id: bookId,
      alias: trimmed,
    })
    .select(ALIAS_SELECT)
    .single()

  if (error) {
    if (error.code === '23505') throw new Error(DUPLICATE_ALIAS_MESSAGE)
    throw error
  }

  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} aliasId
 */
export async function deleteReadingBookAlias(supabase, userId, aliasId) {
  const { error } = await supabase.from(TABLE).delete().eq('user_id', userId).eq('id', aliasId)

  if (error) throw error
}
