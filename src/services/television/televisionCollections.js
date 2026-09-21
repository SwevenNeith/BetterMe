const TABLE = 'television_collections'

/** Collections présentes par défaut pour chaque utilisateur. */
export const DEFAULT_TELEVISION_COLLECTIONS = [
  { name: 'À regarder', sort_order: 10 },
  { name: 'En cours', sort_order: 20 },
  { name: 'Terminé', sort_order: 30 },
]

export const TELEVISION_COLLECTION_A_REGARDER = 'À regarder'
export const TELEVISION_COLLECTION_EN_COURS = 'En cours'
export const TELEVISION_COLLECTION_TERMINE = 'Terminé'

const SELECT = 'id, user_id, name, sort_order, created_at'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function ensureDefaultTelevisionCollections(supabase, userId) {
  if (!userId) return

  const { data: existing, error } = await supabase.from(TABLE).select('name').eq('user_id', userId)

  if (error) throw error

  const existingLower = new Set((existing ?? []).map((row) => String(row.name).trim().toLowerCase()))
  const missing = DEFAULT_TELEVISION_COLLECTIONS.filter(
    (item) => !existingLower.has(item.name.toLowerCase()),
  )

  if (!missing.length) return

  const { error: insertError } = await supabase.from(TABLE).insert(
    missing.map((item) => ({
      user_id: userId,
      name: item.name,
      sort_order: item.sort_order,
    })),
  )

  if (insertError) throw insertError
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
async function syncCollectionsFromMedia(supabase, userId) {
  const { data: rows, error } = await supabase
    .from('television_media')
    .select('collection')
    .eq('user_id', userId)
    .not('collection', 'is', null)

  if (error) throw error

  const names = [
    ...new Set(
      (rows ?? [])
        .map((row) => String(row.collection ?? '').trim())
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
export async function listTelevisionCollections(supabase, userId) {
  if (!userId) return []

  await ensureDefaultTelevisionCollections(supabase, userId)
  try {
    await syncCollectionsFromMedia(supabase, userId)
  } catch (err) {
    console.warn('syncCollectionsFromMedia:', err)
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
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} rawName
 * @returns {Promise<string|null>}
 */
export async function ensureTelevisionCollection(supabase, userId, rawName) {
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
      String(insertError.message || '')
        .toLowerCase()
        .includes('duplicate')
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
