const TABLE = 'resource_categories'

const SELECT = 'id, user_id, name, sort_order, created_at'

/**
 * Importe dans le catalogue les catégories déjà utilisées sur des ressources.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
async function syncCategoriesFromItems(supabase, userId) {
  const { data: items, error } = await supabase
    .from('resource_items')
    .select('category')
    .eq('user_id', userId)
    .not('category', 'is', null)

  if (error) throw error

  const names = [
    ...new Set(
      (items ?? [])
        .map((row) => String(row.category ?? '').trim())
        .filter(Boolean),
    ),
  ]
  if (!names.length) return

  const { data: existing, error: listError } = await supabase
    .from(TABLE)
    .select('name')
    .eq('user_id', userId)

  if (listError) throw listError

  const existingLower = new Set((existing ?? []).map((row) => String(row.name).trim().toLowerCase()))
  const missing = names.filter((name) => !existingLower.has(name.toLowerCase()))
  if (!missing.length) return

  const { error: insertError } = await supabase.from(TABLE).insert(
    missing.map((name) => ({
      user_id: userId,
      name,
      sort_order: 100,
    })),
  )

  if (insertError) throw insertError
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listResourceCategories(supabase, userId) {
  if (!userId) return []

  try {
    await syncCategoriesFromItems(supabase, userId)
  } catch (err) {
    console.warn('syncCategoriesFromItems:', err)
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT)
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  return data ?? []
}

/**
 * Retourne le nom canonique (existant) ou crée la catégorie si besoin.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} rawName
 * @returns {Promise<string|null>}
 */
export async function ensureResourceCategory(supabase, userId, rawName) {
  if (!userId) throw new Error('Utilisateur non connecté.')

  const name = String(rawName ?? '').trim()
  if (!name) return null

  const { data: rows, error } = await supabase.from(TABLE).select(SELECT).eq('user_id', userId)

  if (error) throw error

  const existing = (rows ?? []).find(
    (row) => String(row.name).trim().toLowerCase() === name.toLowerCase(),
  )
  if (existing) return existing.name

  const { data, error: insertError } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      name,
      sort_order: 100,
    })
    .select(SELECT)
    .single()

  if (insertError) {
    if (
      String(insertError.code || '') === '23505' ||
      String(insertError.message || '').toLowerCase().includes('duplicate')
    ) {
      const { data: again, error: againError } = await supabase
        .from(TABLE)
        .select(SELECT)
        .eq('user_id', userId)

      if (againError) throw againError
      const match = (again ?? []).find(
        (row) => String(row.name).trim().toLowerCase() === name.toLowerCase(),
      )
      if (match) return match.name
    }
    throw insertError
  }

  return data.name
}
