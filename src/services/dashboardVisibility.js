import {
  DASHBOARD_WIDGETS,
  DASHBOARD_WIDGET_IDS,
  DASHBOARD_WIDGET_ID_SET,
  DASHBOARD_WIDGET_MOBILE_ORDER,
  DASHBOARD_DESKTOP_ZONES,
  DASHBOARD_MOBILE_FIRST_PAGE_COMPANIONS,
  createDefaultDashboardLayout,
  createDefaultMobileGroups,
  defaultDesktopZoneForWidget,
  preferredOrderForDesktopZone,
} from '../constants/dashboardWidgets.js'
import { ensureUserSettings } from './menstruationNotifications.js'

const SETTINGS_TABLE = 'settings'
const COLUMN = 'dashboard_visibility'
export const DASHBOARD_VISIBILITY_UPDATED_EVENT = 'betterme-dashboard-visibility-updated'

/**
 * @typedef {{ visible: boolean, notesVaultId?: string | null }} DashboardVisibilityEntry
 * @typedef {{
 *   desktop: { top: string[], left: string[], right: string[], bottom: string[] },
 *   mobile: string[],
 *   mobileGroups: string[][],
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
 * Insère un id manquant près de ses voisins dans un ordre préféré.
 * @param {string[]} list
 * @param {string} id
 * @param {string[]} preferredOrder
 * @returns {string[]}
 */
export function insertIdNearNeighbors(list, id, preferredOrder) {
  if (!DASHBOARD_WIDGET_ID_SET.has(id)) return list
  if (list.includes(id)) return list

  const result = [...list]
  const defIdx = preferredOrder.indexOf(id)
  let insertAt = result.length

  if (defIdx >= 0) {
    for (let i = defIdx - 1; i >= 0; i -= 1) {
      const idx = result.indexOf(preferredOrder[i])
      if (idx >= 0) {
        insertAt = idx + 1
        break
      }
    }
    if (insertAt === result.length) {
      for (let i = defIdx + 1; i < preferredOrder.length; i += 1) {
        const idx = result.indexOf(preferredOrder[i])
        if (idx >= 0) {
          insertAt = idx
          break
        }
      }
    }
  }

  result.splice(insertAt, 0, id)
  return result
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
 * Normalise les groupes mobile : chaque widget une fois, réconfort en tête du 1er groupe.
 * @param {unknown} rawGroups
 * @param {string[]} mobileOrder
 * @returns {string[][]}
 */
export function normalizeMobileGroups(rawGroups, mobileOrder) {
  const order = pinComfortFirstInMobileOrder(mobileOrder)
  const expected = new Set(order)

  if (!Array.isArray(rawGroups) || !rawGroups.length) {
    return createDefaultMobileGroups(order)
  }

  /** @type {string[][]} */
  const groups = []
  const seen = new Set()

  for (const rawGroup of rawGroups) {
    if (!Array.isArray(rawGroup)) continue
    const group = []
    for (const id of rawGroup) {
      if (typeof id !== 'string' || !expected.has(id) || seen.has(id)) continue
      seen.add(id)
      group.push(id)
    }
    if (group.length) groups.push(group)
  }

  for (const id of order) {
    if (seen.has(id)) continue

    const defIdx = order.indexOf(id)
    let insertGi = groups.length
    for (let i = defIdx - 1; i >= 0; i -= 1) {
      const prev = order[i]
      const gi = groups.findIndex((group) => group.includes(prev))
      if (gi >= 0) {
        insertGi = gi + 1
        break
      }
    }
    if (insertGi === groups.length) {
      for (let i = defIdx + 1; i < order.length; i += 1) {
        const nextId = order[i]
        const gi = groups.findIndex((group) => group.includes(nextId))
        if (gi >= 0) {
          insertGi = gi
          break
        }
      }
    }

    groups.splice(insertGi, 0, [id])
    seen.add(id)
  }

  if (!groups.length) return createDefaultMobileGroups(order)

  // Réconfort toujours en première position du premier groupe qui le contient, et ce groupe en tête.
  const comfortId = DASHBOARD_WIDGET_IDS.COMFORT
  const comfortGroupIndex = groups.findIndex((group) => group.includes(comfortId))
  if (comfortGroupIndex >= 0) {
    const [comfortGroup] = groups.splice(comfortGroupIndex, 1)
    const withoutComfort = comfortGroup.filter((id) => id !== comfortId)
    groups.unshift([comfortId, ...withoutComfort])
  } else if (expected.has(comfortId)) {
    groups.unshift([comfortId])
  }

  return upgradeTimetableReadingPage(upgradeLegacyDefaultFirstPage(groups))
}

/**
 * Ancien défaut = image + mot du jour, TODO seul juste après → fusionne sur la 1ʳᵉ page.
 * @param {string[][]} groups
 * @returns {string[][]}
 */
function upgradeLegacyDefaultFirstPage(groups) {
  if (groups.length < 2) return groups

  const first = groups[0]
  const second = groups[1]
  const comfortId = DASHBOARD_WIDGET_IDS.COMFORT
  const wordId = DASHBOARD_WIDGET_IDS.DICTIONARY_WORD
  const todoId = DASHBOARD_WIDGET_IDS.TODO

  const isLegacyFirst =
    first.length === 2 &&
    first[0] === comfortId &&
    first[1] === wordId &&
    second.length === 1 &&
    second[0] === todoId

  if (!isLegacyFirst) return groups

  return [[comfortId, wordId, todoId], ...groups.slice(2)]
}

/**
 * Ancien défaut : lectures en cours sur sa propre page → fusion avec l'emploi du temps.
 * @param {string[][]} groups
 * @returns {string[][]}
 */
function upgradeTimetableReadingPage(groups) {
  const timetableId = DASHBOARD_WIDGET_IDS.TIMETABLE
  const readingId = DASHBOARD_WIDGET_IDS.READING_IN_PROGRESS

  let timetableGroupIndex = -1
  let readingAloneGroupIndex = -1

  groups.forEach((group, index) => {
    if (group.length === 1 && group[0] === timetableId) timetableGroupIndex = index
    if (group.length === 1 && group[0] === readingId) readingAloneGroupIndex = index
  })

  if (timetableGroupIndex < 0 || readingAloneGroupIndex < 0) return groups

  const next = groups.map((group) => [...group])
  next[timetableGroupIndex] = [timetableId, readingId]
  next.splice(readingAloneGroupIndex, 1)
  return next
}

function syncMobileFromGroups(groups) {
  return pinComfortFirstInMobileOrder(groups.flat())
}

/**
 * Construit les slides du carrousel mobile.
 * Si `mobileGroups` est fourni, il prime ; sinon slide 1 = image (+ compagnon).
 * @param {string[]} visibleMobileIds — ids visibles déjà dans l'ordre mobile
 * @param {string[][]|null} [mobileGroups]
 * @returns {string[][]}
 */
export function buildMobileCarouselSlides(visibleMobileIds, mobileGroups = null) {
  const ids = sanitizeWidgetIds(visibleMobileIds)
  if (!ids.length) return []

  const visible = new Set(ids)

  if (Array.isArray(mobileGroups) && mobileGroups.length) {
    /** @type {string[][]} */
    const slides = []
    const seen = new Set()

    for (const group of mobileGroups) {
      if (!Array.isArray(group)) continue
      const slide = sanitizeWidgetIds(group).filter((id) => visible.has(id) && !seen.has(id))
      for (const id of slide) seen.add(id)
      if (slide.length) slides.push(slide)
    }

    for (const id of ids) {
      if (!seen.has(id)) {
        slides.push([id])
        seen.add(id)
      }
    }

    return slides
  }

  const comfortId = DASHBOARD_WIDGET_IDS.COMFORT
  const comfortVisible = ids.includes(comfortId)
  const rest = ids.filter((id) => id !== comfortId)

  /** @type {string[][]} */
  const slides = []

  if (comfortVisible) {
    const companions = DASHBOARD_MOBILE_FIRST_PAGE_COMPANIONS.filter((id) => rest.includes(id))
    const companionSet = new Set(companions)
    const leftover = rest.filter((id) => !companionSet.has(id))
    slides.push([comfortId, ...companions])
    for (const id of leftover) {
      slides.push([id])
    }
    return slides
  }

  for (const id of rest) {
    slides.push([id])
  }
  return slides
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
    if (claimed.has(widget.id)) continue
    const zone = defaultDesktopZoneForWidget(widget.id)
    desktop[zone] = insertIdNearNeighbors(
      desktop[zone],
      widget.id,
      preferredOrderForDesktopZone(zone),
    )
    claimed.add(widget.id)
  }

  let mobile = sanitizeWidgetIds(raw.mobile ?? defaults.mobile)
  const mobileSeen = new Set(mobile)
  for (const widget of DASHBOARD_WIDGETS) {
    if (mobileSeen.has(widget.id)) continue
    mobile = insertIdNearNeighbors(mobile, widget.id, DASHBOARD_WIDGET_MOBILE_ORDER)
    mobileSeen.add(widget.id)
  }

  mobile = pinComfortFirstInMobileOrder(mobile)
  const mobileGroups = normalizeMobileGroups(raw.mobileGroups, mobile)

  return {
    desktop,
    mobile: syncMobileFromGroups(mobileGroups),
    mobileGroups,
  }
}

/** @returns {DashboardVisibilityMap} */
export function createDefaultDashboardVisibility() {
  /** @type {DashboardVisibilityMap} */
  const map = {}
  for (const widget of DASHBOARD_WIDGETS) {
    map[widget.id] =
      widget.id === DASHBOARD_WIDGET_IDS.NOTES_GRAPH
        ? { visible: true, notesVaultId: null }
        : { visible: true }
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
    if (widget.id === DASHBOARD_WIDGET_IDS.NOTES_GRAPH) {
      if (entry.notesVaultId === null || entry.notesVaultId === '') {
        defaults[widget.id].notesVaultId = null
      } else if (typeof entry.notesVaultId === 'string') {
        defaults[widget.id].notesVaultId = entry.notesVaultId
      }
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
 * @param {DashboardVisibilityMap | null | undefined} visibility
 * @returns {string | null}
 */
export function getDashboardNotesGraphVaultId(visibility) {
  const entry = visibility?.[DASHBOARD_WIDGET_IDS.NOTES_GRAPH]
  const vaultId = entry?.notesVaultId
  return typeof vaultId === 'string' && vaultId ? vaultId : null
}

/**
 * @param {DashboardVisibilityMap | null | undefined} visibility
 * @param {string | null | undefined} vaultId
 * @returns {DashboardVisibilityMap}
 */
export function patchDashboardNotesGraphVaultId(visibility, vaultId) {
  const next = mergeDashboardVisibility(visibility)
  const widgetId = DASHBOARD_WIDGET_IDS.NOTES_GRAPH
  next[widgetId] = {
    ...next[widgetId],
    notesVaultId: typeof vaultId === 'string' && vaultId ? vaultId : null,
  }
  return next
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
 * Recalcule les groupes selon la règle compagnon (édition desktop).
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
    next.mobileGroups = createDefaultMobileGroups(next.mobile)
    return next
  }

  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved)
  next.mobile = pinComfortFirstInMobileOrder([DASHBOARD_WIDGET_IDS.COMFORT, ...list])
  next.mobileGroups = createDefaultMobileGroups(next.mobile)
  return next
}

/**
 * Déplace un widget dans les groupes mobile (drag & drop réglages téléphone).
 * @param {DashboardLayout} layout
 * @param {string} sourceId
 * @param {number} targetGroupIndex
 * @param {string|null} beforeWidgetId
 */
export function moveMobileWidgetInGroups(
  layout,
  sourceId,
  targetGroupIndex,
  beforeWidgetId = null,
) {
  const next = normalizeDashboardLayout(layout)
  if (!DASHBOARD_WIDGET_ID_SET.has(sourceId)) return next
  if (sourceId === DASHBOARD_WIDGET_IDS.COMFORT) return next
  if (!Number.isInteger(targetGroupIndex) || targetGroupIndex < 0) return next

  /** @type {string[][]} */
  const groups = next.mobileGroups.map((group) => group.filter((id) => id !== sourceId))

  while (groups.length <= targetGroupIndex) {
    groups.push([])
  }

  const target = groups[targetGroupIndex]
  const insertAt =
    beforeWidgetId && beforeWidgetId !== sourceId ? target.indexOf(beforeWidgetId) : -1

  if (insertAt >= 0) target.splice(insertAt, 0, sourceId)
  else target.push(sourceId)

  const cleaned = groups.filter((group) => group.length > 0)
  next.mobileGroups = normalizeMobileGroups(cleaned, syncMobileFromGroups(cleaned))
  next.mobile = syncMobileFromGroups(next.mobileGroups)
  return next
}

/**
 * Extrait un widget dans sa propre page (nouveau groupe juste après).
 * @param {DashboardLayout} layout
 * @param {string} widgetId
 */
export function extractMobileWidgetToOwnGroup(layout, widgetId) {
  const next = normalizeDashboardLayout(layout)
  if (!DASHBOARD_WIDGET_ID_SET.has(widgetId)) return next
  if (widgetId === DASHBOARD_WIDGET_IDS.COMFORT) return next

  const groups = next.mobileGroups.map((group) => [...group])
  const groupIndex = groups.findIndex((group) => group.includes(widgetId))
  if (groupIndex < 0) return next

  const group = groups[groupIndex]
  if (group.length <= 1) return next

  groups[groupIndex] = group.filter((id) => id !== widgetId)
  groups.splice(groupIndex + 1, 0, [widgetId])

  const cleaned = groups.filter((g) => g.length > 0)
  next.mobileGroups = normalizeMobileGroups(cleaned, syncMobileFromGroups(cleaned))
  next.mobile = syncMobileFromGroups(next.mobileGroups)
  return next
}

/**
 * Ajoute un groupe vide en fin de liste (usage local éventuel ; les groupes vides
 * sont retirés à la normalisation / sauvegarde).
 * @param {DashboardLayout} layout
 */
export function addEmptyMobileGroup(layout) {
  const next = normalizeDashboardLayout(layout)
  next.mobileGroups = [...next.mobileGroups, []]
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
