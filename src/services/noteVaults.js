import { normalizeVaultIcon } from '../constants/noteVaults.js'

const TABLE = 'note_vaults'

const OPTIONAL_COLUMNS = ['surface_color', 'gradient_color', 'icon']

function isMissingTableError(error) {
  return (
    error?.code === 'PGRST205' ||
    (typeof error?.message === 'string' && error.message.includes("'note_vaults'"))
  )
}

/**
 * @param {unknown} error
 * @returns {string | null}
 */
function columnFromError(error) {
  const message = typeof error?.message === 'string' ? error.message : ''
  if (!message) return null

  for (const column of OPTIONAL_COLUMNS) {
    if (
      message.includes(column) ||
      message.includes(`'${column}'`) ||
      message.includes(`"${column}"`)
    ) {
      return column
    }
  }
  return null
}

/**
 * @param {Set<string>} omit
 */
function buildSelect(omit = new Set()) {
  const columns = [
    'id',
    'user_id',
    'name',
    'color',
    'accent_color',
    ...OPTIONAL_COLUMNS.filter((column) => !omit.has(column)),
    'sort_order',
    'created_at',
    'updated_at',
  ]
  return columns.join(', ')
}

function normalizeVault(row, input) {
  const vault = {
    id: row.id,
    user_id: row.user_id,
    name: String(row.name ?? '').trim(),
    color: row.color ?? '#AD81BE',
    accent_color: row.accent_color ?? '#D5B5EA',
    surface_color: row.surface_color ?? null,
    gradient_color: row.gradient_color ?? null,
    icon: normalizeVaultIcon(row.icon),
    sort_order: Number(row.sort_order ?? 0),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? row.created_at ?? null,
  }

  if (input?.icon !== undefined) {
    vault.icon = normalizeVaultIcon(input.icon)
  }
  if (input?.surfaceColor !== undefined || input?.surface_color !== undefined) {
    vault.surface_color = input.surfaceColor ?? input.surface_color ?? vault.surface_color
  }
  if (input?.gradientColor !== undefined || input?.gradient_color !== undefined) {
    vault.gradient_color = input.gradientColor ?? input.gradient_color ?? vault.gradient_color
  }

  return vault
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listNoteVaults(supabase, userId) {
  const omitSelect = new Set()

  for (let attempt = 0; attempt < OPTIONAL_COLUMNS.length + 1; attempt += 1) {
    const { data, error } = await supabase
      .from(TABLE)
      .select(buildSelect(omitSelect))
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (!error) {
      return (data ?? []).map((row) => normalizeVault(row))
    }

    if (isMissingTableError(error)) {
      console.warn(
        'Table note_vaults absente. Exécute scripts/create-note-vaults.sql dans Supabase.',
      )
      return []
    }

    const missingColumn = columnFromError(error)
    if (!missingColumn || omitSelect.has(missingColumn)) {
      throw error
    }

    omitSelect.add(missingColumn)
    if (missingColumn === 'icon') {
      console.warn(
        'Colonne note_vaults.icon absente. Exécute scripts/migrate-note-vaults-icon.sql dans Supabase.',
      )
    }
  }

  return []
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} vaultId
 */
export async function getNoteVault(supabase, userId, vaultId) {
  if (!userId || !vaultId) return null

  const omitSelect = new Set()

  for (let attempt = 0; attempt < OPTIONAL_COLUMNS.length + 1; attempt += 1) {
    const { data, error } = await supabase
      .from(TABLE)
      .select(buildSelect(omitSelect))
      .eq('id', vaultId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!error) {
      return data ? normalizeVault(data) : null
    }

    if (isMissingTableError(error)) return null

    const missingColumn = columnFromError(error)
    if (!missingColumn || omitSelect.has(missingColumn)) {
      throw error
    }

    omitSelect.add(missingColumn)
  }

  return null
}

/**
 * @param {{ name?: string, icon?: string, color?: string, accentColor?: string, accent_color?: string, surfaceColor?: string, surface_color?: string, gradientColor?: string, gradient_color?: string, sortOrder?: number, sort_order?: number }} input
 */
function buildVaultPatch(input, { includeName = true } = {}) {
  const patch = {}

  if (includeName) {
    const name = String(input?.name ?? '').trim()
    if (!name) throw new Error('Le nom du coffre est requis.')
    patch.name = name
  } else if (input?.name !== undefined) {
    const name = String(input.name ?? '').trim()
    if (!name) throw new Error('Le nom du coffre est requis.')
    patch.name = name
  }

  if (input?.icon !== undefined) patch.icon = normalizeVaultIcon(input.icon)
  if (input?.color !== undefined) patch.color = input.color
  if (input?.accentColor !== undefined || input?.accent_color !== undefined) {
    patch.accent_color = input.accentColor ?? input.accent_color
  }
  if (input?.surfaceColor !== undefined || input?.surface_color !== undefined) {
    patch.surface_color = input.surfaceColor ?? input.surface_color
  }
  if (input?.gradientColor !== undefined || input?.gradient_color !== undefined) {
    patch.gradient_color = input.gradientColor ?? input.gradient_color
  }

  return patch
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} vaultId
 * @param {Record<string, unknown>} patch
 * @param {Record<string, unknown>} [input]
 */
async function writeVaultRow(supabase, userId, vaultId, patch, input) {
  const omitSelect = new Set()
  const omitPatch = new Set()
  let workingPatch = { ...patch, updated_at: new Date().toISOString() }

  for (let attempt = 0; attempt < OPTIONAL_COLUMNS.length * 2 + 2; attempt += 1) {
    const activePatch = { ...workingPatch }
    for (const column of omitPatch) {
      delete activePatch[column]
    }

    const { data, error } = await supabase
      .from(TABLE)
      .update(activePatch)
      .eq('id', vaultId)
      .eq('user_id', userId)
      .select(buildSelect(omitSelect))
      .single()

    if (!error) {
      return normalizeVault(data, input)
    }

    const missingColumn = columnFromError(error)
    if (!missingColumn) throw error

    if (missingColumn in activePatch && !omitPatch.has(missingColumn)) {
      omitPatch.add(missingColumn)
      if (missingColumn === 'icon') {
        console.warn(
          'Colonne note_vaults.icon absente. Exécute scripts/migrate-note-vaults-icon.sql dans Supabase.',
        )
      }
      continue
    }

    if (!omitSelect.has(missingColumn)) {
      omitSelect.add(missingColumn)
      continue
    }

    throw error
  }

  throw new Error('Impossible de mettre à jour le coffre.')
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ name: string, icon?: string, color?: string, accentColor?: string, surfaceColor?: string, gradientColor?: string }} input
 */
export async function createNoteVault(supabase, userId, input) {
  if (!userId) throw new Error('Utilisateur non connecté.')

  const now = new Date().toISOString()
  const row = {
    user_id: userId,
    ...buildVaultPatch(input),
    sort_order: Number(input?.sortOrder ?? input?.sort_order ?? 0),
    created_at: now,
    updated_at: now,
  }

  const omitSelect = new Set()
  const omitInsert = new Set()

  for (let attempt = 0; attempt < OPTIONAL_COLUMNS.length * 2 + 2; attempt += 1) {
    const activeRow = { ...row }
    for (const column of omitInsert) {
      delete activeRow[column]
    }

    const { data, error } = await supabase
      .from(TABLE)
      .insert(activeRow)
      .select(buildSelect(omitSelect))
      .single()

    if (!error) {
      return normalizeVault(data, input)
    }

    if (isMissingTableError(error)) {
      throw new Error(
        'Table note_vaults absente. Exécute scripts/create-note-vaults.sql dans Supabase.',
      )
    }

    const missingColumn = columnFromError(error)
    if (!missingColumn) throw error

    if (missingColumn in activeRow && !omitInsert.has(missingColumn)) {
      omitInsert.add(missingColumn)
      if (missingColumn === 'icon') {
        console.warn(
          'Colonne note_vaults.icon absente. Exécute scripts/migrate-note-vaults-icon.sql dans Supabase.',
        )
      }
      continue
    }

    if (!omitSelect.has(missingColumn)) {
      omitSelect.add(missingColumn)
      continue
    }

    throw error
  }

  throw new Error('Impossible de créer le coffre.')
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} vaultId
 * @param {{ name?: string, icon?: string, color?: string, accentColor?: string, surfaceColor?: string, gradientColor?: string }} input
 */
export async function updateNoteVault(supabase, userId, vaultId, input) {
  if (!userId || !vaultId) throw new Error('Coffre invalide.')

  const patch = buildVaultPatch(input, { includeName: false })
  if (!Object.keys(patch).length) {
    throw new Error('Aucune modification à enregistrer.')
  }

  return writeVaultRow(supabase, userId, vaultId, patch, input)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} vaultId
 */
export async function deleteNoteVault(supabase, userId, vaultId) {
  if (!userId || !vaultId) throw new Error('Coffre invalide.')
  const { error } = await supabase.from(TABLE).delete().eq('id', vaultId).eq('user_id', userId)
  if (error) throw error
}
