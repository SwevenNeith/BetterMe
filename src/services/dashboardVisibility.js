import { DASHBOARD_WIDGETS } from '../constants/dashboardWidgets.js'
import { ensureUserSettings } from './menstruationNotifications.js'

const SETTINGS_TABLE = 'settings'
const COLUMN = 'dashboard_visibility'
export const DASHBOARD_VISIBILITY_UPDATED_EVENT = 'betterme-dashboard-visibility-updated'

/**
 * @typedef {{ visible: boolean }} DashboardVisibilityEntry
 * @typedef {Record<string, DashboardVisibilityEntry>} DashboardVisibilityMap
 */

function isMissingColumnError(error) {
  return (
    error?.code === 'PGRST204' &&
    typeof error.message === 'string' &&
    error.message.includes(`'${COLUMN}'`)
  )
}

/** @returns {DashboardVisibilityMap} */
export function createDefaultDashboardVisibility() {
  /** @type {DashboardVisibilityMap} */
  const map = {}
  for (const widget of DASHBOARD_WIDGETS) {
    map[widget.id] = { visible: true }
  }
  return map
}

/**
 * @param {unknown} raw
 * @returns {DashboardVisibilityMap}
 */
export function mergeDashboardVisibility(raw) {
  const defaults = createDefaultDashboardVisibility()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults

  for (const widget of DASHBOARD_WIDGETS) {
    const entry = raw[widget.id]
    if (!entry || typeof entry !== 'object') continue
    if (typeof entry.visible === 'boolean') {
      defaults[widget.id].visible = entry.visible
    }
  }

  return defaults
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @returns {Promise<DashboardVisibilityMap>}
 */
export async function loadDashboardVisibility(supabase, userId) {
  if (!userId) return createDefaultDashboardVisibility()

  await ensureUserSettings(userId)

  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select(COLUMN)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (isMissingColumnError(error)) return createDefaultDashboardVisibility()
    throw error
  }

  return mergeDashboardVisibility(data?.[COLUMN])
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {DashboardVisibilityMap} visibility
 */
export async function saveDashboardVisibility(supabase, userId, visibility) {
  if (!userId) return

  await ensureUserSettings(userId)

  const payload = mergeDashboardVisibility(visibility)

  const { error } = await supabase
    .from(SETTINGS_TABLE)
    .update({ [COLUMN]: payload })
    .eq('user_id', userId)

  if (error) {
    if (isMissingColumnError(error)) {
      throw new Error(
        `Colonne ${COLUMN} absente. Exécute scripts/migrate-settings-dashboard-visibility.sql dans Supabase.`,
      )
    }
    throw error
  }

  notifyDashboardVisibilityUpdated()
}

/**
 * @param {string} widgetId
 * @param {DashboardVisibilityMap} visibility
 */
export function isDashboardWidgetVisible(widgetId, visibility) {
  return visibility?.[widgetId]?.visible !== false
}

export function notifyDashboardVisibilityUpdated() {
  window.dispatchEvent(new CustomEvent(DASHBOARD_VISIBILITY_UPDATED_EVENT))
}
