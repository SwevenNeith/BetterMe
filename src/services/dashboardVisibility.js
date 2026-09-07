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
import {
  createPinnedNoteWidgetId,
  isPinnedNoteWidgetId,
  normalizeDashboardPins,
} from '../constants/dashboardPinnedNotes.js'
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
 * @typedef {Record<string, DashboardVisibilityEntry> & {
 *   layout?: DashboardLayout,
 *   pins?: Record<string, import('../constants/dashboardPinnedNotes.js').normalizeDashboardPins extends Function ? any : never>,
 * }} DashboardVisibilityMap
 */

function isMissingColumnError(error) {
  return (
    error?.code === 'PGRST204' &&
    typeof error.message === 'string' &&
    error.message.includes(`'${COLUMN}'`)
  )
}

/**
 * @param {string} id
 * @param {Set<string>} [extraIds]
 */
function isKnownWidgetId(id, extraIds) {
  if (DASHBOARD_WIDGET_ID_SET.has(id)) return true
  if (extraIds?.has(id)) return true
  return false
}

/**
 * @param {unknown} ids
 * @param {Set<string>} [extraIds]
 */
function sanitizeWidgetIds(ids, extraIds = new Set()) {
  if (!Array.isArray(ids)) return []
  const seen = new Set()
  const result = []
  for (const id of ids) {
    if (typeof id !== 'string' || !isKnownWidgetId(id, extraIds) || seen.has(id)) continue
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
 * @param {Set<string>} [extraIds]
 * @returns {string[]}
 */
export function pinComfortFirstInMobileOrder(ids, extraIds = new Set()) {
  const list = sanitizeWidgetIds(ids, extraIds)
  const withoutComfort = list.filter((id) => id !== DASHBOARD_WIDGET_IDS.COMFORT)
  return [DASHBOARD_WIDGET_IDS.COMFORT, ...withoutComfort]
}

/**
 * Normalise les groupes mobile : chaque widget une fois, réconfort en tête du 1er groupe.
 * @param {unknown} rawGroups
 * @param {string[]} mobileOrder
 * @param {Set<string>} [extraIds]
 * @returns {string[][]}
 */
export function normalizeMobileGroups(rawGroups, mobileOrder, extraIds = new Set()) {
  const order = pinComfortFirstInMobileOrder(mobileOrder, extraIds)
  const expected = new Set(order)

  if (!Array.isArray(rawGroups) || !rawGroups.length) {
    return upgradeMobileOrderPreferences(
      upgradeTimetableReadingPage(upgradeLegacyDefaultFirstPage(createDefaultMobileGroups(order))),
    )
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

  if (!groups.length) {
    return upgradeMobileOrderPreferences(
      upgradeTimetableReadingPage(upgradeLegacyDefaultFirstPage(createDefaultMobileGroups(order))),
    )
  }

  const comfortId = DASHBOARD_WIDGET_IDS.COMFORT
  const comfortGroupIndex = groups.findIndex((group) => group.includes(comfortId))
  if (comfortGroupIndex >= 0) {
    const [comfortGroup] = groups.splice(comfortGroupIndex, 1)
    const withoutComfort = comfortGroup.filter((id) => id !== comfortId)
    groups.unshift([comfortId, ...withoutComfort])
  } else if (expected.has(comfortId)) {
    groups.unshift([comfortId])
  }

  return upgradeMobileOrderPreferences(
    upgradeTimetableReadingPage(upgradeLegacyDefaultFirstPage(groups)),
  )
}

/**
 * EDT (+ lectures) avant la note du jour ; calendrier avant check-in ; check-in en dernier.
 * @param {string[][]} groups
 * @returns {string[][]}
 */
function upgradeMobileOrderPreferences(groups) {
  if (!Array.isArray(groups) || groups.length < 2) return groups
  const next = groups.map((group) => [...group])

  const timetableId = DASHBOARD_WIDGET_IDS.TIMETABLE
  const readingId = DASHBOARD_WIDGET_IDS.READING_IN_PROGRESS
  const dailyId = DASHBOARD_WIDGET_IDS.DAILY_NOTE
  const menstruationId = DASHBOARD_WIDGET_IDS.MENSTRUATION
  const checkinId = DASHBOARD_WIDGET_IDS.CHECKIN

  const moveGroupContaining = (widgetId, targetIndex) => {
    const from = next.findIndex((group) => group.includes(widgetId))
    if (from < 0) return
    const [group] = next.splice(from, 1)
    const at = Math.max(0, Math.min(targetIndex, next.length))
    next.splice(at, 0, group)
  }

  const timetableIndex = next.findIndex((group) => group.includes(timetableId))
  const dailyIndex = next.findIndex((group) => group.includes(dailyId))
  if (timetableIndex >= 0 && dailyIndex >= 0 && dailyIndex < timetableIndex) {
    moveGroupContaining(timetableId, dailyIndex)
  }

  const readingIndex = next.findIndex((group) => group.includes(readingId))
  const dailyIndexAfterTt = next.findIndex((group) => group.includes(dailyId))
  const timetableIndexAfter = next.findIndex((group) => group.includes(timetableId))
  if (
    readingIndex >= 0 &&
    dailyIndexAfterTt >= 0 &&
    dailyIndexAfterTt < readingIndex &&
    (timetableIndexAfter < 0 || !next[timetableIndexAfter]?.includes(readingId))
  ) {
    moveGroupContaining(readingId, dailyIndexAfterTt)
  }

  const checkinIndex = next.findIndex((group) => group.includes(checkinId))
  if (checkinIndex >= 0 && checkinIndex !== next.length - 1) {
    moveGroupContaining(checkinId, next.length)
  }

  const menstruationIndex = next.findIndex((group) => group.includes(menstruationId))
  const checkinIndexAfter = next.findIndex((group) => group.includes(checkinId))
  if (menstruationIndex >= 0 && checkinIndexAfter >= 0 && menstruationIndex !== checkinIndexAfter - 1) {
    moveGroupContaining(menstruationId, checkinIndexAfter)
  }

  return next
}

function syncMobileFromGroups(groups, extraIds = new Set()) {
  return pinComfortFirstInMobileOrder(groups.flat(), extraIds)
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

/**
 * Construit les slides du carrousel mobile.
 * Si `mobileGroups` est fourni, il prime ; sinon slide 1 = image (+ compagnon).
 * @param {string[]} visibleMobileIds — ids visibles déjà dans l'ordre mobile
 * @param {string[][]|null} [mobileGroups]
 * @param {Set<string>} [extraIds]
 * @returns {string[][]}
 */
export function buildMobileCarouselSlides(
  visibleMobileIds,
  mobileGroups = null,
  extraIds = new Set(),
) {
  const ids = sanitizeWidgetIds(visibleMobileIds, extraIds)
  if (!ids.length) return []

  const visible = new Set(ids)

  if (Array.isArray(mobileGroups) && mobileGroups.length) {
    /** @type {string[][]} */
    const slides = []
    const seen = new Set()

    for (const group of mobileGroups) {
      if (!Array.isArray(group)) continue
      const slide = sanitizeWidgetIds(group, extraIds).filter(
        (id) => visible.has(id) && !seen.has(id),
      )
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
 * @param {Iterable<string>} [extraWidgetIds]
 * @returns {DashboardLayout}
 */
export function normalizeDashboardLayout(rawLayout, extraWidgetIds = []) {
  const extraIds = new Set(
    [...extraWidgetIds].filter((id) => typeof id === 'string' && isPinnedNoteWidgetId(id)),
  )
  const defaults = createDefaultDashboardLayout()
  const raw =
    rawLayout && typeof rawLayout === 'object' && !Array.isArray(rawLayout) ? rawLayout : {}
  const rawDesktop =
    raw.desktop && typeof raw.desktop === 'object' && !Array.isArray(raw.desktop)
      ? raw.desktop
      : {}

  const rawBottom =
    rawDesktop.bottom ?? rawDesktop.center ?? rawDesktop.full ?? defaults.desktop.bottom

  const desktop = {
    top: sanitizeWidgetIds(rawDesktop.top ?? defaults.desktop.top, extraIds),
    left: sanitizeWidgetIds(rawDesktop.left ?? defaults.desktop.left, extraIds),
    right: sanitizeWidgetIds(rawDesktop.right ?? defaults.desktop.right, extraIds),
    bottom: sanitizeWidgetIds(rawBottom, extraIds),
  }

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

  for (const pinId of extraIds) {
    if (claimed.has(pinId)) continue
    desktop.right = [...desktop.right, pinId]
    claimed.add(pinId)
  }

  let mobile = sanitizeWidgetIds(raw.mobile ?? defaults.mobile, extraIds)
  const mobileSeen = new Set(mobile)
  for (const widget of DASHBOARD_WIDGETS) {
    if (mobileSeen.has(widget.id)) continue
    mobile = insertIdNearNeighbors(mobile, widget.id, DASHBOARD_WIDGET_MOBILE_ORDER)
    mobileSeen.add(widget.id)
  }
  for (const pinId of extraIds) {
    if (mobileSeen.has(pinId)) continue
    mobile = insertIdNearNeighbors(mobile, pinId, [
      ...DASHBOARD_WIDGET_MOBILE_ORDER.slice(
        0,
        DASHBOARD_WIDGET_MOBILE_ORDER.indexOf(DASHBOARD_WIDGET_IDS.DAILY_NOTE) + 1,
      ),
      pinId,
      ...DASHBOARD_WIDGET_MOBILE_ORDER.slice(
        DASHBOARD_WIDGET_MOBILE_ORDER.indexOf(DASHBOARD_WIDGET_IDS.DAILY_NOTE) + 1,
      ),
    ])
    mobileSeen.add(pinId)
  }

  mobile = pinComfortFirstInMobileOrder(mobile, extraIds)
  const mobileGroups = normalizeMobileGroups(raw.mobileGroups, mobile, extraIds)

  return {
    desktop,
    mobile: syncMobileFromGroups(mobileGroups, extraIds),
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
  map.pins = {}
  return map
}

/**
 * @param {unknown} raw
 * @returns {DashboardVisibilityMap}
 */
export function mergeDashboardVisibility(raw) {
  const defaults = createDefaultDashboardVisibility()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults

  const pins = normalizeDashboardPins(raw.pins)
  const extraIds = Object.keys(pins)

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

  defaults.pins = pins
  for (const pinId of extraIds) {
    const entry = raw[pinId]
    defaults[pinId] = {
      visible: !(entry && typeof entry === 'object' && entry.visible === false),
    }
  }

  defaults.layout = normalizeDashboardLayout(raw.layout, extraIds)
  return defaults
}

/**
 * @param {DashboardVisibilityMap} visibility
 * @returns {DashboardLayout}
 */
export function getDashboardLayout(visibility) {
  return normalizeDashboardLayout(visibility?.layout, Object.keys(visibility?.pins || {}))
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
 * @param {DashboardLayout | null | undefined} layout
 * @returns {string[]}
 */
function collectPinnedIdsFromLayout(layout) {
  /** @type {string[]} */
  const ids = []
  const seen = new Set()
  const push = (list) => {
    if (!Array.isArray(list)) return
    for (const id of list) {
      if (!isPinnedNoteWidgetId(id) || seen.has(id)) continue
      seen.add(id)
      ids.push(id)
    }
  }
  push(layout?.desktop?.top)
  push(layout?.desktop?.left)
  push(layout?.desktop?.right)
  push(layout?.desktop?.bottom)
  push(layout?.mobile)
  for (const group of layout?.mobileGroups ?? []) push(group)
  return ids
}

/**
 * Déplace un widget dans le layout desktop (entre zones et/ou réordonne).
 * @param {DashboardLayout} layout
 * @param {string} widgetId
 * @param {'top'|'left'|'right'|'bottom'} targetZone
 * @param {string|null} beforeWidgetId — insérer avant cet id ; null = à la fin
 */
export function moveDesktopWidget(layout, widgetId, targetZone, beforeWidgetId = null) {
  const extraIds = collectPinnedIdsFromLayout(layout)
  if (isPinnedNoteWidgetId(widgetId) && !extraIds.includes(widgetId)) extraIds.push(widgetId)
  const extraSet = new Set(extraIds)
  const next = normalizeDashboardLayout(layout, extraIds)
  if (!isKnownWidgetId(widgetId, extraSet)) return next
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
  const extraIds = collectPinnedIdsFromLayout(layout)
  const extraSet = new Set(extraIds)
  const next = normalizeDashboardLayout(layout, extraIds)
  if (sourceId === targetId) return next
  if (sourceId === DASHBOARD_WIDGET_IDS.COMFORT) return next

  const list = next.mobile.filter((id) => id !== DASHBOARD_WIDGET_IDS.COMFORT)
  const from = list.indexOf(sourceId)
  let to = list.indexOf(targetId)

  if (targetId === DASHBOARD_WIDGET_IDS.COMFORT) {
    to = 0
  }

  if (from < 0 || to < 0) {
    next.mobile = pinComfortFirstInMobileOrder(
      [DASHBOARD_WIDGET_IDS.COMFORT, ...list],
      extraSet,
    )
    next.mobileGroups = normalizeMobileGroups(null, next.mobile, extraSet)
    return next
  }

  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved)
  next.mobile = pinComfortFirstInMobileOrder(
    [DASHBOARD_WIDGET_IDS.COMFORT, ...list],
    extraSet,
  )
  next.mobileGroups = normalizeMobileGroups(null, next.mobile, extraSet)
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
  const extraIds = collectPinnedIdsFromLayout(layout)
  if (isPinnedNoteWidgetId(sourceId) && !extraIds.includes(sourceId)) extraIds.push(sourceId)
  const extraSet = new Set(extraIds)
  const next = normalizeDashboardLayout(layout, extraIds)
  if (!isKnownWidgetId(sourceId, extraSet)) return next
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
  next.mobileGroups = normalizeMobileGroups(cleaned, syncMobileFromGroups(cleaned, extraSet), extraSet)
  next.mobile = syncMobileFromGroups(next.mobileGroups, extraSet)
  return next
}

/**
 * Extrait un widget dans sa propre page (nouveau groupe juste après).
 * @param {DashboardLayout} layout
 * @param {string} widgetId
 */
export function extractMobileWidgetToOwnGroup(layout, widgetId) {
  const extraIds = collectPinnedIdsFromLayout(layout)
  if (isPinnedNoteWidgetId(widgetId) && !extraIds.includes(widgetId)) extraIds.push(widgetId)
  const extraSet = new Set(extraIds)
  const next = normalizeDashboardLayout(layout, extraIds)
  if (!isKnownWidgetId(widgetId, extraSet)) return next
  if (widgetId === DASHBOARD_WIDGET_IDS.COMFORT) return next

  const groups = next.mobileGroups.map((group) => [...group])
  const groupIndex = groups.findIndex((group) => group.includes(widgetId))
  if (groupIndex < 0) return next

  const group = groups[groupIndex]
  if (group.length <= 1) return next

  groups[groupIndex] = group.filter((id) => id !== widgetId)
  groups.splice(groupIndex + 1, 0, [widgetId])

  const cleaned = groups.filter((g) => g.length > 0)
  next.mobileGroups = normalizeMobileGroups(cleaned, syncMobileFromGroups(cleaned, extraSet), extraSet)
  next.mobile = syncMobileFromGroups(next.mobileGroups, extraSet)
  return next
}

/**
 * Ajoute un groupe vide en fin de liste (usage local éventuel ; les groupes vides
 * sont retirés à la normalisation / sauvegarde).
 * @param {DashboardLayout} layout
 */
export function addEmptyMobileGroup(layout) {
  const next = normalizeDashboardLayout(layout, collectPinnedIdsFromLayout(layout))
  next.mobileGroups = [...next.mobileGroups, []]
  return next
}

/**
 * Épingle une note / un extrait sur le Dashboard (nouvelle vue).
 * @param {DashboardVisibilityMap | null | undefined} visibility
 * @param {{
 *   noteId: string,
 *   vaultId?: string | null,
 *   noteTitle?: string,
 *   partTitle?: string,
 *   contentMd?: string,
 * }} pinInput
 * @returns {{ visibility: DashboardVisibilityMap, widgetId: string }}
 */
export function addDashboardPinnedNote(visibility, pinInput) {
  const noteId = String(pinInput?.noteId ?? '').trim()
  if (!noteId) throw new Error('Note introuvable.')

  const base = mergeDashboardVisibility(visibility)
  const widgetId = createPinnedNoteWidgetId()
  const pin = {
    noteId,
    vaultId: typeof pinInput.vaultId === 'string' && pinInput.vaultId ? pinInput.vaultId : null,
    noteTitle: String(pinInput.noteTitle ?? '').trim() || 'Sans titre',
    partTitle: String(pinInput.partTitle ?? '').trim(),
    contentMd: String(pinInput.contentMd ?? ''),
    createdAt: new Date().toISOString(),
  }

  const pins = { ...(base.pins || {}), [widgetId]: pin }
  const extraIds = Object.keys(pins)
  const layout = normalizeDashboardLayout(base.layout, extraIds)

  for (const zone of Object.values(DASHBOARD_DESKTOP_ZONES)) {
    layout.desktop[zone] = layout.desktop[zone].filter((id) => id !== widgetId)
  }
  const right = layout.desktop.right
  const dailyDesktopIdx = right.indexOf(DASHBOARD_WIDGET_IDS.DAILY_NOTE)
  if (dailyDesktopIdx >= 0) right.splice(dailyDesktopIdx + 1, 0, widgetId)
  else right.push(widgetId)

  const groups = layout.mobileGroups.map((group) => group.filter((id) => id !== widgetId))
  const dailyGroupIdx = groups.findIndex((group) => group.includes(DASHBOARD_WIDGET_IDS.DAILY_NOTE))
  if (dailyGroupIdx >= 0) groups.splice(dailyGroupIdx + 1, 0, [widgetId])
  else groups.push([widgetId])

  const extraSet = new Set(extraIds)
  layout.mobileGroups = normalizeMobileGroups(groups, syncMobileFromGroups(groups, extraSet), extraSet)
  layout.mobile = syncMobileFromGroups(layout.mobileGroups, extraSet)

  /** @type {DashboardVisibilityMap} */
  const next = {
    ...base,
    pins,
    [widgetId]: { visible: true },
    layout,
  }
  return { visibility: mergeDashboardVisibility(next), widgetId }
}

/**
 * Retire une note épinglée du Dashboard.
 * @param {DashboardVisibilityMap | null | undefined} visibility
 * @param {string} widgetId
 * @returns {DashboardVisibilityMap}
 */
export function removeDashboardPinnedNote(visibility, widgetId) {
  if (!isPinnedNoteWidgetId(widgetId)) return mergeDashboardVisibility(visibility)
  const base = mergeDashboardVisibility(visibility)
  const pins = { ...(base.pins || {}) }
  delete pins[widgetId]
  const next = { ...base, pins }
  delete next[widgetId]

  const extraIds = Object.keys(pins)
  const layout = normalizeDashboardLayout(base.layout, extraIds)
  for (const zone of Object.values(DASHBOARD_DESKTOP_ZONES)) {
    layout.desktop[zone] = layout.desktop[zone].filter((id) => id !== widgetId)
  }
  layout.mobile = layout.mobile.filter((id) => id !== widgetId)
  layout.mobileGroups = layout.mobileGroups
    .map((group) => group.filter((id) => id !== widgetId))
    .filter((group) => group.length > 0)
  next.layout = normalizeDashboardLayout(layout, extraIds)
  return mergeDashboardVisibility(next)
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
