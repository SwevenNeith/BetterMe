const TABLE = 'reading_spoil_chapters'

const SELECT =
  'id, user_id, book_id, chapter_number, characters_met, world_building, scene, created_at'

function sortChapters(chapters) {
  return [...(chapters ?? [])].sort((a, b) => {
    const na = Number.parseFloat(String(a.chapter_number).replace(',', '.'))
    const nb = Number.parseFloat(String(b.chapter_number).replace(',', '.'))
    const aNum = Number.isFinite(na)
    const bNum = Number.isFinite(nb)
    if (aNum && bNum && na !== nb) return na - nb
    if (aNum && !bNum) return -1
    if (!aNum && bNum) return 1
    return String(a.chapter_number).localeCompare(String(b.chapter_number), 'fr', {
      numeric: true,
      sensitivity: 'base',
    })
  })
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} bookId
 */
export async function listSpoilChapters(supabase, userId, bookId) {
  if (!userId || !bookId) return []

  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT)
    .eq('user_id', userId)
    .eq('book_id', bookId)

  if (error) throw error
  return sortChapters(data ?? [])
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} bookId
 * @param {{
 *   chapterNumber: string,
 *   charactersMet?: string,
 *   worldBuilding?: string,
 *   scene?: string,
 * }} input
 */
export async function createSpoilChapter(supabase, userId, bookId, input) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  if (!bookId) throw new Error('Livre introuvable.')

  const chapterNumber = String(input?.chapterNumber ?? '').trim()
  if (!chapterNumber) throw new Error('Le numéro de chapitre est obligatoire.')

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      book_id: bookId,
      chapter_number: chapterNumber,
      characters_met: String(input?.charactersMet ?? '').trim(),
      world_building: String(input?.worldBuilding ?? '').trim(),
      scene: String(input?.scene ?? '').trim(),
    })
    .select(SELECT)
    .single()

  if (error) {
    if (String(error.code || '') === '23505' || String(error.message || '').toLowerCase().includes('duplicate')) {
      throw new Error(`Le chapitre « ${chapterNumber} » existe déjà pour ce livre.`)
    }
    throw error
  }

  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} chapterId
 * @param {{
 *   chapterNumber: string,
 *   charactersMet?: string,
 *   worldBuilding?: string,
 *   scene?: string,
 * }} input
 */
export async function updateSpoilChapter(supabase, userId, chapterId, input) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  if (!chapterId) throw new Error('Chapitre introuvable.')

  const chapterNumber = String(input?.chapterNumber ?? '').trim()
  if (!chapterNumber) throw new Error('Le numéro de chapitre est obligatoire.')

  const { data, error } = await supabase
    .from(TABLE)
    .update({
      chapter_number: chapterNumber,
      characters_met: String(input?.charactersMet ?? '').trim(),
      world_building: String(input?.worldBuilding ?? '').trim(),
      scene: String(input?.scene ?? '').trim(),
    })
    .eq('id', chapterId)
    .eq('user_id', userId)
    .select(SELECT)
    .single()

  if (error) {
    if (String(error.code || '') === '23505' || String(error.message || '').toLowerCase().includes('duplicate')) {
      throw new Error(`Le chapitre « ${chapterNumber} » existe déjà pour ce livre.`)
    }
    throw error
  }

  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} chapterId
 */
export async function deleteSpoilChapter(supabase, userId, chapterId) {
  if (!userId || !chapterId) return

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', chapterId)
    .eq('user_id', userId)

  if (error) throw error
}
