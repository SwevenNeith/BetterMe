import { toExerciseSnapshot } from '../../utils/sport/wgerExercise.js'

const TABLE = 'sport_exercises'

const COLUMNS =
  'id, user_id, source, wger_id, name, description, instructions, category_name, muscle_ids, secondary_muscle_ids, equipment_ids, image_url, language_code, is_favorite, created_at, updated_at'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listSportExercises(supabase, userId, opts = {}) {
  let q = supabase.from(TABLE).select(COLUMNS).eq('user_id', userId)
  if (opts.favoritesOnly) q = q.eq('is_favorite', true)
  if (opts.source) q = q.eq('source', opts.source)
  q = q.order('name', { ascending: true })
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

/**
 * Upsert favori depuis un exercice Wger normalisé.
 */
export async function upsertWgerFavorite(supabase, userId, wgerExercise, isFavorite = true) {
  const wgerId = Number(wgerExercise.id || wgerExercise.wger_id)
  if (!wgerId) throw new Error('Identifiant Wger manquant.')

  const row = {
    user_id: userId,
    source: 'wger',
    wger_id: wgerId,
    name: wgerExercise.name,
    description: wgerExercise.description || null,
    instructions: wgerExercise.instructionsHtml || wgerExercise.instructions || null,
    category_name: wgerExercise.categoryName || wgerExercise.category_name || null,
    muscle_ids: wgerExercise.muscleIds || wgerExercise.muscle_ids || [],
    secondary_muscle_ids:
      wgerExercise.secondaryMuscleIds || wgerExercise.secondary_muscle_ids || [],
    equipment_ids: wgerExercise.equipmentIds || wgerExercise.equipment_ids || [],
    image_url: wgerExercise.imageUrl || wgerExercise.image_url || null,
    language_code: wgerExercise.languageCode || wgerExercise.language_code || null,
    is_favorite: Boolean(isFavorite),
    updated_at: new Date().toISOString(),
  }

  const { data: existing } = await supabase
    .from(TABLE)
    .select('id')
    .eq('user_id', userId)
    .eq('wger_id', wgerId)
    .maybeSingle()

  if (existing?.id) {
    const { data, error } = await supabase
      .from(TABLE)
      .update(row)
      .eq('id', existing.id)
      .eq('user_id', userId)
      .select(COLUMNS)
      .single()
    if (error) throw error
    return data
  }

  const { data, error } = await supabase.from(TABLE).insert(row).select(COLUMNS).single()
  if (error) throw error
  return data
}

export async function setFavoriteById(supabase, userId, exerciseId, isFavorite) {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ is_favorite: Boolean(isFavorite), updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', exerciseId)
    .select(COLUMNS)
    .single()
  if (error) throw error
  return data
}

export async function createCustomExercise(supabase, userId, payload) {
  const row = {
    user_id: userId,
    source: 'custom',
    wger_id: null,
    name: String(payload.name || '').trim(),
    description: payload.description || null,
    instructions: payload.instructions || null,
    category_name: payload.category_name || payload.categoryName || null,
    muscle_ids: payload.muscle_ids || payload.muscleIds || [],
    secondary_muscle_ids: payload.secondary_muscle_ids || payload.secondaryMuscleIds || [],
    equipment_ids: payload.equipment_ids || payload.equipmentIds || [],
    image_url: payload.image_url || payload.imageUrl || null,
    language_code: 'fr',
    is_favorite: Boolean(payload.is_favorite ?? payload.isFavorite ?? false),
  }
  if (!row.name) throw new Error('Nom d’exercice requis.')

  const { data, error } = await supabase.from(TABLE).insert(row).select(COLUMNS).single()
  if (error) throw error
  return data
}

export async function updateCustomExercise(supabase, userId, exerciseId, patch) {
  const payload = {
    ...patch,
    updated_at: new Date().toISOString(),
  }
  delete payload.id
  delete payload.user_id
  delete payload.source
  delete payload.wger_id
  delete payload.created_at

  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('user_id', userId)
    .eq('id', exerciseId)
    .eq('source', 'custom')
    .select(COLUMNS)
    .single()
  if (error) throw error
  return data
}

export async function deleteSportExercise(supabase, userId, exerciseId) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('id', exerciseId)
  if (error) throw error
}

export function sportExerciseToSnapshot(row) {
  return toExerciseSnapshot({
    source: row.source,
    id: row.wger_id,
    wger_id: row.wger_id,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    categoryName: row.category_name,
    muscleIds: row.muscle_ids,
    secondaryMuscleIds: row.secondary_muscle_ids,
    equipmentIds: row.equipment_ids,
    imageUrl: row.image_url,
    languageCode: row.language_code,
  })
}
