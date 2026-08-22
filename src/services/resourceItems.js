import { parseResourceTags, normalizeResourceLink } from '../utils/resourceForm.js'
import { ensureResourceCategory } from './resourceCategories.js'

const TABLE = 'resource_items'

const SELECT =
  'id, user_id, name, category, tags, link, address, brand, comments, created_at, updated_at'

function normalizeOptionalText(value) {
  const trimmed = String(value ?? '').trim()
  return trimmed || null
}

function assertLink(url) {
  const normalized = normalizeResourceLink(url)
  if (!normalized && String(url ?? '').trim()) {
    throw new Error('Lien invalide.')
  }
  return normalized
}

async function resolveCategoryName(supabase, userId, category) {
  const name = String(category ?? '').trim()
  if (!name) return null
  return ensureResourceCategory(supabase, userId, name)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listResourceItems(supabase, userId) {
  if (!userId) return []

  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT)
    .eq('user_id', userId)
    .order('name', { ascending: true })

  if (error) throw error
  return data ?? []
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object} input
 */
export async function createResourceItem(supabase, userId, input) {
  if (!userId) throw new Error('Utilisateur non connecté.')

  const name = String(input?.name ?? '').trim()
  if (!name) throw new Error('Indique un nom pour la ressource.')

  const category = await resolveCategoryName(supabase, userId, input?.category)
  const tags = parseResourceTags(input?.tagsInput ?? input?.tags)
  const link = assertLink(input?.link)
  const address = normalizeOptionalText(input?.address)
  const brand = normalizeOptionalText(input?.brand)
  const comments = String(input?.comments ?? '').trim()

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      name,
      category,
      tags,
      link,
      address,
      brand,
      comments,
    })
    .select(SELECT)
    .single()

  if (error) throw error
  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} itemId
 * @param {object} input
 */
export async function updateResourceItem(supabase, userId, itemId, input) {
  if (!userId || !itemId) throw new Error('Ressource introuvable.')

  const name = String(input?.name ?? '').trim()
  if (!name) throw new Error('Indique un nom pour la ressource.')

  const category = await resolveCategoryName(supabase, userId, input?.category)
  const tags = parseResourceTags(input?.tagsInput ?? input?.tags)
  const link = assertLink(input?.link)
  const address = normalizeOptionalText(input?.address)
  const brand = normalizeOptionalText(input?.brand)
  const comments = String(input?.comments ?? '').trim()

  const { data, error } = await supabase
    .from(TABLE)
    .update({
      name,
      category,
      tags,
      link,
      address,
      brand,
      comments,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    .eq('user_id', userId)
    .select(SELECT)
    .single()

  if (error) throw error
  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} itemId
 */
export async function deleteResourceItem(supabase, userId, itemId) {
  if (!userId || !itemId) return

  const { error } = await supabase.from(TABLE).delete().eq('id', itemId).eq('user_id', userId)

  if (error) throw error
}
