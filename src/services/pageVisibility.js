import { APP_MAIN_PAGES } from '../constants/appPages.js'
import { ensureUserSettings } from './menstruationNotifications.js'

const SETTINGS_TABLE = 'settings'
const COLUMN = 'page_visibility'
export const PAGE_VISIBILITY_UPDATED_EVENT = 'betterme-page-visibility-updated'

/**
 * @typedef {{ visible: boolean, label: string|null }} PageVisibilityEntry
 * @typedef {Record<string, PageVisibilityEntry>} PageVisibilityMap
 */

function isMissingColumnError(error) {
  return (
    error?.code === 'PGRST204' &&
    typeof error.message === 'string' &&
    error.message.includes(`'${COLUMN}'`)
  )
}

/** @returns {PageVisibilityMap} */
export function createDefaultPageVisibility() {
  /** @type {PageVisibilityMap} */
  const map = {}
  for (const page of APP_MAIN_PAGES) {
    map[page.id] = { visible: true, label: null }
  }
  return map
}

/**
 * @param {unknown} raw
 * @returns {PageVisibilityMap}
 */
export function mergePageVisibility(raw) {
  const defaults = createDefaultPageVisibility()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults

  for (const page of APP_MAIN_PAGES) {
    const entry = raw[page.id]
    if (!entry || typeof entry !== 'object') continue

    if (typeof entry.visible === 'boolean') {
      defaults[page.id].visible = entry.visible
    }

    if (typeof entry.label === 'string') {
      const trimmed = entry.label.trim()
      defaults[page.id].label = trimmed || null
    } else if (entry.label === null) {
      defaults[page.id].label = null
    }
  }

  return defaults
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @returns {Promise<PageVisibilityMap>}
 */
export async function loadPageVisibility(supabase, userId) {
  if (!userId) return createDefaultPageVisibility()

  await ensureUserSettings(userId)

  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select(COLUMN)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (isMissingColumnError(error)) return createDefaultPageVisibility()
    throw error
  }

  return mergePageVisibility(data?.[COLUMN])
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {PageVisibilityMap} visibility
 */
export async function savePageVisibility(supabase, userId, visibility) {
  if (!userId) return

  await ensureUserSettings(userId)

  const payload = mergePageVisibility(visibility)

  const { error } = await supabase
    .from(SETTINGS_TABLE)
    .update({ [COLUMN]: payload })
    .eq('user_id', userId)

  if (error) {
    if (isMissingColumnError(error)) {
      throw new Error(
        `Colonne ${COLUMN} absente. Exécute scripts/migrate-settings-page-visibility.sql dans Supabase.`,
      )
    }
    throw error
  }

  notifyPageVisibilityUpdated()
}

/**
 * @param {string} pageId
 * @param {PageVisibilityMap} visibility
 * @param {string} defaultLabel
 */
export function getPageDisplayLabel(pageId, visibility, defaultLabel) {
  const custom = visibility?.[pageId]?.label
  if (typeof custom === 'string' && custom.trim()) return custom.trim()
  return defaultLabel
}

/**
 * @param {string} pageId
 * @param {PageVisibilityMap} visibility
 */
export function isPageVisible(pageId, visibility) {
  return visibility?.[pageId]?.visible !== false
}

export function notifyPageVisibilityUpdated() {
  window.dispatchEvent(new CustomEvent(PAGE_VISIBILITY_UPDATED_EVENT))
}
