import {
  DASHBOARD_WIDGETS,
  DASHBOARD_WIDGET_IDS,
  DASHBOARD_WIDGET_ID_SET,
  DASHBOARD_DESKTOP_ZONES,
  createDefaultDashboardLayout,
} from '../constants/dashboardWidgets.js'
import { ensureUserSettings } from './menstruationNotifications.js'

const SETTINGS_TABLE = 'settings'
const COLUMN = 'dashboard_visibility'
export const DASHBOARD_VISIBILITY_UPDATED_EVENT = 'betterme-dashboard-visibility-updated'

/**
 * @typedef {{ visible: boolean }} DashboardVisibilityEntry
 * @typedef {{
 *   desktop: { top: string[], left: string[], right: string[], bottom: string[] },
 *   mobile: string[],
 * }} DashboardLayout
 * @typedef {Record<string, DashboardVisibilityEntry> & { layout?: DashboardLayout }} DashboardVisibilityMap
 */

function isMissingColumnError(error) {
  return (
    error?.code === 'PGRST204' &&
    typeof error.message === 'string' &&
    error.message.includes(`'${COLUMN}'`)
  )
}

function sanitizeWidgetIds(ids) {
  if (!Array.isArray(ids)) return []
  const seen = new Set()
  const result = []
  for (const id of ids) {
    if (typeof id !== 'string' || !DASHBOARD_WIDGET_ID_SET.has(id) || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

/**
 * Garantit que chaque widget apparaît exactement une fois (desktop + mobile).
 * @param {unknown} rawLayout
 * @returns {DashboardLayout}
 */
export function normalizeDashboardLayout(rawLayout) {
  const defaults = createDefaultDashboardLayout()
  const raw =
    rawLayout && typeof rawLayout === 'object' && !Array.isArray(rawLayout) ? rawLayout : {}
  const rawDesktop =
    raw.desktop && typeof raw.desktop === 'object' && !Array.isArray(raw.desktop)
      ? raw.desktop
      : {}

  // Compat ancienne clé `center` / `full` → bottom
  const rawBottom =
    rawDesktop.bottom ?? rawDesktop.center ?? rawDesktop.full ?? defaults.desktop.bottom

  const desktop = {
    top: sanitizeWidgetIds(rawDesktop.top ?? defaults.desktop.top),
    left: sanitizeWidgetIds(rawDesktop.left ?? defaults.desktop.left),
    right: sanitizeWidgetIds(rawDesktop.right ?? defaults.desktop.right),
    bottom: sanitizeWidgetIds(rawBottom),
  }

  // Un widget ne peut être que dans une zone desktop : priorité top → left → right → bottom
  const claimed = new Set()
  for (const zone of [
    DASHBOARD_DESKTOP_ZONES.TOP,
    DASHBOARD_DESKTOP_ZONES.LEFT,
    DASHBOARD_DESKTOP_ZONES.RIGHT,
    DASHBOARD_DESKTOP_ZONES.BOTTOM,
  ]) {
    desktop[zone] = desktop[zone].filter((id) => {
      if (claimed.has(id)) return false
      claimed.add(id)
      return true
    })
  }

  for (const widget of DASHBOARD_WIDGETS) {
    if (!claimed.has(widget.id)) {
      desktop.left.push(widget.id)
      claimed.add(widget.id)
    }
  }

  let mobile = sanitizeWidgetIds(raw.mobile ?? defaults.mobile)
  const mobileSeen = new Set(mobile)
  for (const widget of DASHBOARD_WIDGETS) {
    if (!mobileSeen.has(widget.id)) {
      mobile.push(widget.id)
      mobileSeen.add(widget.id)
    }
  }

  // L'image de réconfort est toujours en première position sur mobile.
  mobile = pinComfortFirstInMobileOrder(mobile)

  return { desktop, mobile }
}

/**
 * Force l'image de réconfort en tête de la liste mobile.
 * @param {string[]} ids
 * @returns {string[]}
 */
export function pinComfortFirstInMobileOrder(ids) {
  const list = sanitizeWidgetIds(ids)
  const withoutComfort = list.filter((id) => id !== DASHBOARD_WIDGET_IDS.COMFORT)
  return [DASHBOARD_WIDGET_IDS.COMFORT, ...withoutComfort]
}

/**
 * Construit les slides du carrousel mobile.
 * Slide 1 = image (+ éventuellement le bloc placé juste en dessous).
 * Les autres blocs = une slide chacun.
 * @param {string[]} visibleMobileIds — ids visibles déjà dans l'ordre mobile
 * @returns {string[][]}
 */
export function buildMobileCarouselSlides(visibleMobileIds) {
  const ids = sanitizeWidgetIds(visibleMobileIds)
  if (!ids.length) return []

  const comfortId = DASHBOARD_WIDGET_IDS.COMFORT
  const comfortVisible = ids.includes(comfortId)
  const rest = ids.filter((id) => id !== comfortId)

  /** @type {string[][]} */
  const slides = []

  if (comfortVisible) {
    const companion = rest[0] ?? null
    const firstSlide = companion ? [comfortId, companion] : [comfortId]
    slides.push(firstSlide)
    for (const id of rest.slice(companion ? 1 : 0)) {
      slides.push([id])
    }
    return slides
  }

  for (const id of rest) {
    slides.push([id])
  }
  return slides
}

/** @returns {DashboardVisibilityMap} */
export function createDefaultDashboardVisibility() {
  /** @type {DashboardVisibilityMap} */
  const map = {}
  for (const widget of DASHBOARD_WIDGETS) {
    map[widget.id] = { visible: true }
  }
  map.layout = createDefaultDashboardLayout()
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

  defaults.layout = normalizeDashboardLayout(raw.layout)
  return defaults
}

/**
 * @param {DashboardVisibilityMap} visibility
 * @returns {DashboardLayout}
 */
export function getDashboardLayout(visibility) {
  return normalizeDashboardLayout(visibility?.layout)
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
 * Déplace un widget dans le layout desktop (entre zones et/ou réordonne).
 * @param {DashboardLayout} layout
 * @param {string} widgetId
 * @param {'top'|'left'|'right'|'bottom'} targetZone
 * @param {string|null} beforeWidgetId — insérer avant cet id ; null = à la fin
 */
export function moveDesktopWidget(layout, widgetId, targetZone, beforeWidgetId = null) {
  const next = normalizeDashboardLayout(layout)
  if (!DASHBOARD_WIDGET_ID_SET.has(widgetId)) return next
  if (!Object.values(DASHBOARD_DESKTOP_ZONES).includes(targetZone)) return next

  for (const zone of Object.values(DASHBOARD_DESKTOP_ZONES)) {
    next.desktop[zone] = next.desktop[zone].filter((id) => id !== widgetId)
  }

  const targetList = next.desktop[targetZone]
  const insertAt =
    beforeWidgetId && beforeWidgetId !== widgetId
      ? targetList.indexOf(beforeWidgetId)
      : -1

  if (insertAt >= 0) targetList.splice(insertAt, 0, widgetId)
  else targetList.push(widgetId)

  return next
}

/**
 * Réordonne la liste mobile (l'image de réconfort reste figée en première position).
 * @param {DashboardLayout} layout
 * @param {string} sourceId
 * @param {string} targetId
 */
export function reorderMobileWidget(layout, sourceId, targetId) {
  const next = normalizeDashboardLayout(layout)
  if (sourceId === targetId) return next
  if (sourceId === DASHBOARD_WIDGET_IDS.COMFORT) return next

  const list = next.mobile.filter((id) => id !== DASHBOARD_WIDGET_IDS.COMFORT)
  const from = list.indexOf(sourceId)
  let to = list.indexOf(targetId)

  // Si on vise l'image (figée), on place le bloc juste en dessous.
  if (targetId === DASHBOARD_WIDGET_IDS.COMFORT) {
    to = 0
  }

  if (from < 0 || to < 0) {
    next.mobile = pinComfortFirstInMobileOrder([
      DASHBOARD_WIDGET_IDS.COMFORT,
      ...list,
    ])
    return next
  }

  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved)
  next.mobile = pinComfortFirstInMobileOrder([DASHBOARD_WIDGET_IDS.COMFORT, ...list])
  return next
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
