/**
 * Liens d’implication catalogue : activité parente → activités enfants.
 */

const TABLE = 'battery_activity_implications'

const COLUMNS =
  'id, user_id, parent_activity_id, child_activity_id, offset_minutes, created_at'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} parentActivityId
 */
export async function listImplicationsForParent(supabase, userId, parentActivityId) {
  if (!parentActivityId) return []
  const { data, error } = await supabase
    .from(TABLE)
    .select(
      `${COLUMNS}, child:battery_activities!battery_activity_implications_child_activity_id_fkey(id, name, default_cost, default_duration_minutes, default_all_day, category_id, priority)`,
    )
    .eq('user_id', userId)
    .eq('parent_activity_id', parentActivityId)
    .order('offset_minutes', { ascending: true })

  if (error) {
    // Fallback sans jointure si le nom de FK n’est pas celui attendu
    if (String(error.message || '').includes('battery_activity_implications')) {
      const plain = await supabase
        .from(TABLE)
        .select(COLUMNS)
        .eq('user_id', userId)
        .eq('parent_activity_id', parentActivityId)
        .order('offset_minutes', { ascending: true })
      if (plain.error) throw plain.error
      const rows = plain.data ?? []
      if (!rows.length) return []
      const childIds = rows.map((r) => r.child_activity_id)
      const { data: children, error: childError } = await supabase
        .from('battery_activities')
        .select(
          'id, name, default_cost, default_duration_minutes, default_all_day, category_id, priority',
        )
        .eq('user_id', userId)
        .in('id', childIds)
      if (childError) throw childError
      const byId = new Map((children ?? []).map((c) => [c.id, c]))
      return rows.map((r) => ({ ...r, child: byId.get(r.child_activity_id) || null }))
    }
    throw error
  }
  return data ?? []
}

/**
 * Toutes les implications de l’utilisateur (pour le catalogue).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listAllImplications(supabase, userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

/**
 * Remplace la liste d’implications d’une activité parente.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} parentActivityId
 * @param {Array<{ child_activity_id: string, offset_minutes?: number }>} links
 */
export async function setImplicationsForParent(supabase, userId, parentActivityId, links) {
  if (!parentActivityId) throw new Error('Activité parente manquante.')

  const cleaned = []
  const seen = new Set()
  for (const link of links ?? []) {
    const childId = String(link?.child_activity_id || '').trim()
    if (!childId || childId === parentActivityId) continue
    if (seen.has(childId)) continue
    seen.add(childId)
    const offset = Number(link?.offset_minutes)
    cleaned.push({
      user_id: userId,
      parent_activity_id: parentActivityId,
      child_activity_id: childId,
      offset_minutes: Number.isFinite(offset) ? Math.trunc(offset) : -30,
    })
  }

  const { error: delError } = await supabase
    .from(TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('parent_activity_id', parentActivityId)

  if (delError) throw delError

  if (!cleaned.length) return []

  const { data, error } = await supabase.from(TABLE).insert(cleaned).select(COLUMNS)
  if (error) throw error
  return data ?? []
}

/**
 * Ajoute une implication.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ parent_activity_id: string, child_activity_id: string, offset_minutes?: number }} payload
 */
export async function addImplication(supabase, userId, payload) {
  const parentId = String(payload?.parent_activity_id || '').trim()
  const childId = String(payload?.child_activity_id || '').trim()
  if (!parentId || !childId) throw new Error('Choisis une activité à impliquer.')
  if (parentId === childId) throw new Error('Une activité ne peut pas s’impliquer elle-même.')

  const offset = Number(payload?.offset_minutes)
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      parent_activity_id: parentId,
      child_activity_id: childId,
      offset_minutes: Number.isFinite(offset) ? Math.trunc(offset) : -30,
    })
    .select(COLUMNS)
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Cette activité est déjà impliquée.')
    }
    throw error
  }
  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} implicationId
 */
export async function removeImplication(supabase, userId, implicationId) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', implicationId)
    .eq('user_id', userId)
  if (error) throw error
}
