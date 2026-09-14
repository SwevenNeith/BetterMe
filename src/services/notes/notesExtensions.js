import {
  NOTES_EXTENSIONS,
  createDefaultNotesExtensionPrefs,
} from '../constants/notesExtensions.js'
import { ensureUserSettings } from './menstruationNotifications.js'

const SETTINGS_TABLE = 'settings'
const COLUMN = 'notes_extensions'

function isMissingColumnError(error) {
  return (
    error?.code === 'PGRST204' &&
    typeof error.message === 'string' &&
    error.message.includes(`'${COLUMN}'`)
  )
}

function localStorageKey(userId) {
  return `betterme-notes-extensions:${userId || 'anon'}`
}

/**
 * @param {unknown} raw
 * @returns {Record<string, boolean>}
 */
export function mergeNotesExtensionPrefs(raw) {
  const defaults = createDefaultNotesExtensionPrefs()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults

  const next = { ...defaults }
  for (const ext of NOTES_EXTENSIONS) {
    if (typeof raw[ext.id] === 'boolean') next[ext.id] = raw[ext.id]
  }
  return next
}

/**
 * Migre d’éventuelles prefs locales vers le format unifié (une seule fois).
 * @param {string | null | undefined} userId
 */
function readLegacyLocalPrefs(userId) {
  try {
    const raw = localStorage.getItem(localStorageKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return mergeNotesExtensionPrefs(parsed)
  } catch {
    return null
  }
}

function clearLegacyLocalPrefs(userId) {
  try {
    localStorage.removeItem(localStorageKey(userId))
  } catch {
    // ignore
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @returns {Promise<Record<string, boolean>>}
 */
export async function loadNotesExtensionPrefs(supabase, userId) {
  if (!userId) return createDefaultNotesExtensionPrefs()

  await ensureUserSettings(userId)

  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select(COLUMN)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (isMissingColumnError(error)) {
      console.warn(
        `Colonne ${COLUMN} absente. Exécute scripts/migrate-settings-notes-extensions.sql dans Supabase.`,
      )
      return readLegacyLocalPrefs(userId) ?? createDefaultNotesExtensionPrefs()
    }
    throw error
  }

  const fromDb = data?.[COLUMN]
  if (fromDb != null) return mergeNotesExtensionPrefs(fromDb)

  const legacy = readLegacyLocalPrefs(userId)
  if (legacy) {
    try {
      await saveNotesExtensionPrefs(supabase, userId, legacy)
      clearLegacyLocalPrefs(userId)
    } catch (err) {
      console.warn('Migration locale → settings notes_extensions impossible:', err)
    }
    return legacy
  }

  return createDefaultNotesExtensionPrefs()
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {Record<string, boolean>} prefs
 * @returns {Promise<Record<string, boolean>>}
 */
export async function saveNotesExtensionPrefs(supabase, userId, prefs) {
  const payload = mergeNotesExtensionPrefs(prefs)
  if (!userId) return payload

  await ensureUserSettings(userId)

  const { error } = await supabase
    .from(SETTINGS_TABLE)
    .update({ [COLUMN]: payload })
    .eq('user_id', userId)

  if (error) {
    if (isMissingColumnError(error)) {
      throw new Error(
        `Colonne ${COLUMN} absente. Exécute scripts/migrate-settings-notes-extensions.sql dans Supabase.`,
      )
    }
    throw error
  }

  clearLegacyLocalPrefs(userId)
  return payload
}

/**
 * @param {Record<string, boolean>} prefs
 * @param {string} extensionId
 */
export function isNotesExtensionEnabled(prefs, extensionId) {
  if (typeof prefs?.[extensionId] === 'boolean') return prefs[extensionId]
  const ext = NOTES_EXTENSIONS.find((item) => item.id === extensionId)
  return ext?.defaultEnabled !== false
}
