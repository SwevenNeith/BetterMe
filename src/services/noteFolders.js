const TABLE = 'note_folders'
const SELECT = 'id, user_id, parent_id, name, created_at, updated_at'

function normalizeFolder(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    parent_id: row.parent_id ?? null,
    name: String(row.name ?? '').trim(),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? row.created_at ?? null,
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listNoteFolders(supabase, userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT)
    .eq('user_id', userId)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map(normalizeFolder)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ name: string, parentId?: string | null }} input
 */
export async function createNoteFolder(supabase, userId, input) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  const name = String(input?.name ?? '').trim()
  if (!name) throw new Error('Le nom du dossier est requis.')

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      parent_id: input?.parentId || input?.parent_id || null,
      name,
      created_at: now,
      updated_at: now,
    })
    .select(SELECT)
    .single()

  if (error) throw error
  return normalizeFolder(data)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} folderId
 * @param {{ name?: string, parentId?: string | null }} input
 */
export async function updateNoteFolder(supabase, userId, folderId, input) {
  if (!userId || !folderId) throw new Error('Dossier invalide.')

  const patch = { updated_at: new Date().toISOString() }
  if (input?.name !== undefined) {
    const name = String(input.name ?? '').trim()
    if (!name) throw new Error('Le nom du dossier est requis.')
    patch.name = name
  }
  if (input?.parentId !== undefined || input?.parent_id !== undefined) {
    patch.parent_id = input.parentId ?? input.parent_id ?? null
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', folderId)
    .eq('user_id', userId)
    .select(SELECT)
    .single()

  if (error) throw error
  return normalizeFolder(data)
}

/**
 * Supprime un dossier (et ses sous-dossiers / notes via CASCADE SQL).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} folderId
 */
export async function deleteNoteFolder(supabase, userId, folderId) {
  if (!userId || !folderId) throw new Error('Dossier invalide.')

  const { error } = await supabase.from(TABLE).delete().eq('id', folderId).eq('user_id', userId)
  if (error) throw error
}
