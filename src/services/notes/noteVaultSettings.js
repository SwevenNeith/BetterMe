import { NOTE_VAULT_ROOT_KEY, vaultSettingsKey } from '../constants/noteVaults.js'
import { createDefaultNotesExtensionPrefs } from '../constants/notesExtensions.js'
import { createDefaultNoteTemplatePrefs } from '../constants/noteTemplates.js'
import { mergeNotesExtensionPrefs } from './notesExtensions.js'
import { mergeNoteTemplatePrefs } from './noteTemplateExtension.js'
import { ensureUserSettings } from './menstruationNotifications.js'

const SETTINGS_TABLE = 'settings'
const COLUMN = 'notes_vault_settings'
const LEGACY_EXTENSIONS_COLUMN = 'notes_extensions'
const LEGACY_TEMPLATE_COLUMN = 'notes_template_prefs'

function isMissingColumnError(error, column = COLUMN) {
  return (
    error?.code === 'PGRST204' &&
    typeof error.message === 'string' &&
    error.message.includes(`'${column}'`)
  )
}

/**
 * @returns {{ extensions: Record<string, boolean>, templatePrefs: import('../constants/noteTemplates.js').NoteTemplatePrefs }}
 */
function createDefaultVaultBundle() {
  return {
    extensions: createDefaultNotesExtensionPrefs(),
    templatePrefs: createDefaultNoteTemplatePrefs(),
  }
}

/**
 * @param {unknown} raw
 */
function normalizeVaultSettingsStore(raw) {
  /** @type {Record<string, { extensions: Record<string, boolean>, templatePrefs: import('../constants/noteTemplates.js').NoteTemplatePrefs }>} */
  const store = {}

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    store[NOTE_VAULT_ROOT_KEY] = createDefaultVaultBundle()
    return store
  }

  const source = /** @type {Record<string, unknown>} */ (raw)
  for (const [key, value] of Object.entries(source)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const bundle = /** @type {Record<string, unknown>} */ (value)
    store[key] = {
      extensions: mergeNotesExtensionPrefs(bundle.extensions),
      templatePrefs: mergeNoteTemplatePrefs(bundle.templatePrefs),
    }
  }

  if (!store[NOTE_VAULT_ROOT_KEY]) {
    store[NOTE_VAULT_ROOT_KEY] = createDefaultVaultBundle()
  }

  return store
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
async function loadRawVaultSettings(supabase, userId) {
  await ensureUserSettings(userId)

  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select(`${COLUMN}, ${LEGACY_EXTENSIONS_COLUMN}, ${LEGACY_TEMPLATE_COLUMN}`)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (isMissingColumnError(error)) {
      console.warn(
        `Colonne ${COLUMN} absente. Exécute scripts/migrate-settings-notes-vault-settings.sql dans Supabase.`,
      )
      return {
        store: normalizeVaultSettingsStore(null),
        migrated: false,
      }
    }
    throw error
  }

  if (data?.[COLUMN] != null) {
    return {
      store: normalizeVaultSettingsStore(data[COLUMN]),
      migrated: false,
    }
  }

  const store = normalizeVaultSettingsStore(null)
  if (data?.[LEGACY_EXTENSIONS_COLUMN] != null) {
    store[NOTE_VAULT_ROOT_KEY].extensions = mergeNotesExtensionPrefs(data[LEGACY_EXTENSIONS_COLUMN])
  }
  if (data?.[LEGACY_TEMPLATE_COLUMN] != null) {
    store[NOTE_VAULT_ROOT_KEY].templatePrefs = mergeNoteTemplatePrefs(data[LEGACY_TEMPLATE_COLUMN])
  }

  return { store, migrated: true }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {Record<string, { extensions: Record<string, boolean>, templatePrefs: import('../constants/noteTemplates.js').NoteTemplatePrefs }>} store
 */
async function saveVaultSettingsStore(supabase, userId, store) {
  if (!userId) return store

  await ensureUserSettings(userId)

  const { error } = await supabase
    .from(SETTINGS_TABLE)
    .update({ [COLUMN]: store })
    .eq('user_id', userId)

  if (error) {
    if (isMissingColumnError(error)) {
      throw new Error(
        `Colonne ${COLUMN} absente. Exécute scripts/migrate-settings-notes-vault-settings.sql dans Supabase.`,
      )
    }
    throw error
  }

  return store
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string | null | undefined} vaultId
 */
export async function loadVaultExtensionPrefs(supabase, userId, vaultId = null) {
  if (!userId) return createDefaultNotesExtensionPrefs()

  const { store, migrated } = await loadRawVaultSettings(supabase, userId)
  const key = vaultSettingsKey(vaultId)
  if (!store[key]) store[key] = createDefaultVaultBundle()
  if (migrated) {
    try {
      await saveVaultSettingsStore(supabase, userId, store)
    } catch (err) {
      console.warn('Migration notes_vault_settings impossible:', err)
    }
  }
  return store[key].extensions
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string | null | undefined} vaultId
 * @param {Record<string, boolean>} prefs
 */
export async function saveVaultExtensionPrefs(supabase, userId, vaultId, prefs) {
  const { store } = await loadRawVaultSettings(supabase, userId)
  const key = vaultSettingsKey(vaultId)
  if (!store[key]) store[key] = createDefaultVaultBundle()
  store[key].extensions = mergeNotesExtensionPrefs(prefs)
  await saveVaultSettingsStore(supabase, userId, store)
  return store[key].extensions
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string | null | undefined} vaultId
 */
export async function loadVaultTemplatePrefs(supabase, userId, vaultId = null) {
  if (!userId) return createDefaultNoteTemplatePrefs()

  const { store, migrated } = await loadRawVaultSettings(supabase, userId)
  const key = vaultSettingsKey(vaultId)
  if (!store[key]) store[key] = createDefaultVaultBundle()
  if (migrated) {
    try {
      await saveVaultSettingsStore(supabase, userId, store)
    } catch (err) {
      console.warn('Migration notes_vault_settings impossible:', err)
    }
  }
  return store[key].templatePrefs
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string | null | undefined} vaultId
 * @param {import('../constants/noteTemplates.js').NoteTemplatePrefs} prefs
 */
export async function saveVaultTemplatePrefs(supabase, userId, vaultId, prefs) {
  const { store } = await loadRawVaultSettings(supabase, userId)
  const key = vaultSettingsKey(vaultId)
  if (!store[key]) store[key] = createDefaultVaultBundle()
  store[key].templatePrefs = mergeNoteTemplatePrefs(prefs)
  await saveVaultSettingsStore(supabase, userId, store)
  return store[key].templatePrefs
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} vaultId
 */
export async function ensureVaultSettings(supabase, userId, vaultId) {
  const { store } = await loadRawVaultSettings(supabase, userId)
  const key = vaultSettingsKey(vaultId)
  if (!store[key]) {
    store[key] = createDefaultVaultBundle()
    await saveVaultSettingsStore(supabase, userId, store)
  }
  return store[key]
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} vaultId
 */
export async function removeVaultSettings(supabase, userId, vaultId) {
  const { store } = await loadRawVaultSettings(supabase, userId)
  const key = vaultSettingsKey(vaultId)
  if (store[key]) {
    delete store[key]
    await saveVaultSettingsStore(supabase, userId, store)
  }
}
