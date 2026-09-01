import {
  DAILY_NOTES_FOLDER_DEFAULT_NAME,
  DAILY_NOTES_FOLDER_SYSTEM_KEY,
} from '../constants/dailyNotes.js'
import {
  NOTE_TEMPLATES_FOLDER_DEFAULT_NAME,
  NOTE_TEMPLATES_FOLDER_SYSTEM_KEY,
} from '../constants/noteTemplates.js'

const TABLE = 'note_folders'
const SELECT = 'id, user_id, parent_id, name, system_key, vault_id, created_at, updated_at'

function isMissingSystemKeyColumnError(error) {
  return (
    error?.code === 'PGRST204' &&
    typeof error.message === 'string' &&
    error.message.includes("'system_key'")
  )
}

function isMissingVaultIdColumnError(error) {
  return (
    error?.code === 'PGRST204' &&
    typeof error.message === 'string' &&
    error.message.includes("'vault_id'")
  )
}

function normalizeFolder(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    parent_id: row.parent_id ?? null,
    name: String(row.name ?? '').trim(),
    system_key: row.system_key ?? null,
    vault_id: row.vault_id ?? null,
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

  if (error) {
    if (isMissingVaultIdColumnError(error) || isMissingSystemKeyColumnError(error)) {
      const legacy = await supabase
        .from(TABLE)
        .select('id, user_id, parent_id, name, created_at, updated_at')
        .eq('user_id', userId)
        .order('name', { ascending: true })
      if (legacy.error) throw legacy.error
      return (legacy.data ?? []).map((row) =>
        normalizeFolder({ ...row, system_key: null, vault_id: null }),
      )
    }
    throw error
  }
  return (data ?? []).map(normalizeFolder)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ name: string, parentId?: string | null, systemKey?: string | null, vaultId?: string | null }} input
 */
export async function createNoteFolder(supabase, userId, input) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  const name = String(input?.name ?? '').trim()
  if (!name) throw new Error('Le nom du dossier est requis.')

  const now = new Date().toISOString()
  const row = {
    user_id: userId,
    parent_id: input?.parentId || input?.parent_id || null,
    name,
    created_at: now,
    updated_at: now,
  }

  const systemKey = input?.systemKey ?? input?.system_key ?? null
  if (systemKey) row.system_key = systemKey

  const vaultId = input?.vaultId ?? input?.vault_id ?? null
  if (vaultId) row.vault_id = vaultId

  const { data, error } = await supabase.from(TABLE).insert(row).select(SELECT).single()

  if (error) {
    if (isMissingSystemKeyColumnError(error)) {
      throw new Error(
        'Colonne note_folders.system_key absente. Exécute scripts/migrate-note-folders-system-key.sql dans Supabase.',
      )
    }
    throw error
  }
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

  if (error) {
    if (isMissingSystemKeyColumnError(error)) {
      const legacy = await supabase
        .from(TABLE)
        .update(patch)
        .eq('id', folderId)
        .eq('user_id', userId)
        .select('id, user_id, parent_id, name, created_at, updated_at')
        .single()
      if (legacy.error) throw legacy.error
      return normalizeFolder({ ...legacy.data, system_key: null })
    }
    throw error
  }
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

/**
 * Retrouve le dossier Daily Notes par system_key, ou le crée (nom par défaut).
 * Un renommage ne provoque pas de recreation.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function ensureDailyNotesFolder(supabase, userId) {
  if (!userId) throw new Error('Utilisateur non connecté.')

  const { data: existing, error } = await supabase
    .from(TABLE)
    .select(SELECT)
    .eq('user_id', userId)
    .eq('system_key', DAILY_NOTES_FOLDER_SYSTEM_KEY)
    .maybeSingle()

  if (error) {
    if (isMissingSystemKeyColumnError(error)) {
      throw new Error(
        'Colonne note_folders.system_key absente. Exécute scripts/migrate-note-folders-system-key.sql dans Supabase.',
      )
    }
    throw error
  }

  if (existing) return normalizeFolder(existing)

  try {
    return await createNoteFolder(supabase, userId, {
      name: DAILY_NOTES_FOLDER_DEFAULT_NAME,
      parentId: null,
      systemKey: DAILY_NOTES_FOLDER_SYSTEM_KEY,
    })
  } catch (err) {
    if (String(err?.code) === '23505' || String(err?.message ?? '').includes('duplicate')) {
      const { data } = await supabase
        .from(TABLE)
        .select(SELECT)
        .eq('user_id', userId)
        .eq('system_key', DAILY_NOTES_FOLDER_SYSTEM_KEY)
        .maybeSingle()
      if (data) return normalizeFolder(data)
    }
    throw err
  }
}

/**
 * Retrouve le dossier Templates par system_key, ou le crée (nom personnalisable).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} [folderName]
 * @param {string | null} [vaultId]
 */
export async function ensureNoteTemplatesFolder(
  supabase,
  userId,
  folderName = NOTE_TEMPLATES_FOLDER_DEFAULT_NAME,
  vaultId = null,
) {
  if (!userId) throw new Error('Utilisateur non connecté.')

  const name = String(folderName ?? '').trim() || NOTE_TEMPLATES_FOLDER_DEFAULT_NAME

  let query = supabase
    .from(TABLE)
    .select(SELECT)
    .eq('user_id', userId)
    .eq('system_key', NOTE_TEMPLATES_FOLDER_SYSTEM_KEY)

  if (vaultId) query = query.eq('vault_id', vaultId)
  else query = query.is('vault_id', null)

  const { data: existing, error } = await query.maybeSingle()

  if (error) {
    if (isMissingSystemKeyColumnError(error)) {
      throw new Error(
        'Colonne note_folders.system_key absente. Exécute scripts/migrate-note-folders-system-key.sql dans Supabase.',
      )
    }
    throw error
  }

  if (existing) {
    const folder = normalizeFolder(existing)
    if (folder.name !== name) {
      return updateNoteFolder(supabase, userId, folder.id, { name })
    }
    return folder
  }

  try {
    return await createNoteFolder(supabase, userId, {
      name,
      parentId: null,
      systemKey: NOTE_TEMPLATES_FOLDER_SYSTEM_KEY,
      vaultId,
    })
  } catch (err) {
    if (String(err?.code) === '23505' || String(err?.message ?? '').includes('duplicate')) {
      let retry = supabase
        .from(TABLE)
        .select(SELECT)
        .eq('user_id', userId)
        .eq('system_key', NOTE_TEMPLATES_FOLDER_SYSTEM_KEY)
      if (vaultId) retry = retry.eq('vault_id', vaultId)
      else retry = retry.is('vault_id', null)
      const { data } = await retry.maybeSingle()
      if (data) return normalizeFolder(data)
    }
    throw err
  }
}
