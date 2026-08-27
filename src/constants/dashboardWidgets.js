/** Identifiants stables des blocs affichables sur le Dashboard. */
export const DASHBOARD_WIDGET_IDS = {
  COMFORT: 'comfort',
  DICTIONARY_WORD: 'dictionary-word',
  TODO: 'todo',
  TIMETABLE: 'timetable',
  CHECKIN: 'checkin',
  DAILY_NOTE: 'daily-note',
  MENSTRUATION: 'menstruation',
  HABITS: 'habits',
  NOTES_GRAPH: 'notes-graph',
  READING_IN_PROGRESS: 'reading-in-progress',
  PROJECTS: 'projects',
}

/** Zones desktop du layout Dashboard. */
export const DASHBOARD_DESKTOP_ZONES = {
  TOP: 'top',
  LEFT: 'left',
  RIGHT: 'right',
  BOTTOM: 'bottom',
}

/** @typedef {{ id: string, defaultLabel: string }} DashboardWidget */

/** @type {DashboardWidget[]} */
export const DASHBOARD_WIDGETS = [
  { id: DASHBOARD_WIDGET_IDS.COMFORT, defaultLabel: 'Image de réconfort' },
  { id: DASHBOARD_WIDGET_IDS.DICTIONARY_WORD, defaultLabel: 'Mot du jour' },
  { id: DASHBOARD_WIDGET_IDS.TODO, defaultLabel: 'TODO du jour' },
  { id: DASHBOARD_WIDGET_IDS.TIMETABLE, defaultLabel: 'Emploi du temps du jour' },
  { id: DASHBOARD_WIDGET_IDS.CHECKIN, defaultLabel: 'Check-in émotionnel' },
  { id: DASHBOARD_WIDGET_IDS.DAILY_NOTE, defaultLabel: 'Note du jour' },
  { id: DASHBOARD_WIDGET_IDS.MENSTRUATION, defaultLabel: 'Menstruation' },
  { id: DASHBOARD_WIDGET_IDS.HABITS, defaultLabel: 'Habitudes (vue mensuelle)' },
  { id: DASHBOARD_WIDGET_IDS.READING_IN_PROGRESS, defaultLabel: 'Lectures en cours' },
  { id: DASHBOARD_WIDGET_IDS.PROJECTS, defaultLabel: 'Projets actifs' },
  { id: DASHBOARD_WIDGET_IDS.NOTES_GRAPH, defaultLabel: 'Notes · vue globale' },
]

export const DASHBOARD_WIDGET_ID_SET = new Set(DASHBOARD_WIDGETS.map((widget) => widget.id))

/** Ordre d’apparition sur mobile (carrousel / liste réglages). */
export const DASHBOARD_WIDGET_MOBILE_ORDER = [
  DASHBOARD_WIDGET_IDS.COMFORT,
  DASHBOARD_WIDGET_IDS.DICTIONARY_WORD,
  DASHBOARD_WIDGET_IDS.TODO,
  DASHBOARD_WIDGET_IDS.DAILY_NOTE,
  DASHBOARD_WIDGET_IDS.TIMETABLE,
  DASHBOARD_WIDGET_IDS.CHECKIN,
  DASHBOARD_WIDGET_IDS.MENSTRUATION,
  DASHBOARD_WIDGET_IDS.HABITS,
  DASHBOARD_WIDGET_IDS.READING_IN_PROGRESS,
  DASHBOARD_WIDGET_IDS.PROJECTS,
  DASHBOARD_WIDGET_IDS.NOTES_GRAPH,
]

/** Colonne gauche du dashboard (desktop). */
export const DASHBOARD_WIDGET_DESKTOP_LEFT = [
  DASHBOARD_WIDGET_IDS.COMFORT,
  DASHBOARD_WIDGET_IDS.DICTIONARY_WORD,
  DASHBOARD_WIDGET_IDS.TODO,
  DASHBOARD_WIDGET_IDS.TIMETABLE,
  DASHBOARD_WIDGET_IDS.READING_IN_PROGRESS,
  DASHBOARD_WIDGET_IDS.PROJECTS,
  DASHBOARD_WIDGET_IDS.NOTES_GRAPH,
]

/** Colonne droite du dashboard (desktop). */
export const DASHBOARD_WIDGET_DESKTOP_RIGHT = [
  DASHBOARD_WIDGET_IDS.DAILY_NOTE,
  DASHBOARD_WIDGET_IDS.MENSTRUATION,
  DASHBOARD_WIDGET_IDS.HABITS,
]

/** Bandeau pleine largeur au-dessus des colonnes (desktop). */
export const DASHBOARD_WIDGET_DESKTOP_TOP = []

/** Bandeau pleine largeur sous les colonnes (desktop). */
export const DASHBOARD_WIDGET_DESKTOP_BOTTOM = [DASHBOARD_WIDGET_IDS.CHECKIN]

/** @deprecated Utiliser DASHBOARD_WIDGET_DESKTOP_BOTTOM */
export const DASHBOARD_WIDGET_DESKTOP_FULL = DASHBOARD_WIDGET_DESKTOP_BOTTOM

/**
 * Zone desktop par défaut d’un widget (pour insertion des nouveaux ids).
 * @param {string} widgetId
 * @returns {'top'|'left'|'right'|'bottom'}
 */
export function defaultDesktopZoneForWidget(widgetId) {
  if (DASHBOARD_WIDGET_DESKTOP_TOP.includes(widgetId)) return DASHBOARD_DESKTOP_ZONES.TOP
  if (DASHBOARD_WIDGET_DESKTOP_LEFT.includes(widgetId)) return DASHBOARD_DESKTOP_ZONES.LEFT
  if (DASHBOARD_WIDGET_DESKTOP_RIGHT.includes(widgetId)) return DASHBOARD_DESKTOP_ZONES.RIGHT
  if (DASHBOARD_WIDGET_DESKTOP_BOTTOM.includes(widgetId)) return DASHBOARD_DESKTOP_ZONES.BOTTOM
  return DASHBOARD_DESKTOP_ZONES.LEFT
}

/**
 * Ordre préféré dans une zone desktop.
 * @param {'top'|'left'|'right'|'bottom'} zone
 * @returns {string[]}
 */
export function preferredOrderForDesktopZone(zone) {
  if (zone === DASHBOARD_DESKTOP_ZONES.TOP) return DASHBOARD_WIDGET_DESKTOP_TOP
  if (zone === DASHBOARD_DESKTOP_ZONES.LEFT) return DASHBOARD_WIDGET_DESKTOP_LEFT
  if (zone === DASHBOARD_DESKTOP_ZONES.RIGHT) return DASHBOARD_WIDGET_DESKTOP_RIGHT
  if (zone === DASHBOARD_DESKTOP_ZONES.BOTTOM) return DASHBOARD_WIDGET_DESKTOP_BOTTOM
  return DASHBOARD_WIDGET_DESKTOP_LEFT
}

/** Widgets regroupés par défaut sur la 1ʳᵉ page mobile (après l’image). */
export const DASHBOARD_MOBILE_FIRST_PAGE_COMPANIONS = [
  DASHBOARD_WIDGET_IDS.DICTIONARY_WORD,
  DASHBOARD_WIDGET_IDS.TODO,
]

/**
 * Groupes mobile par défaut : image + mot du jour + TODO sur la 1ʳᵉ page, puis 1 bloc / page.
 * @param {string[]} [mobileOrder]
 * @returns {string[][]}
 */
export function createDefaultMobileGroups(mobileOrder = DASHBOARD_WIDGET_MOBILE_ORDER) {
  const ids = [...mobileOrder]
  if (!ids.length) return []

  const comfortId = DASHBOARD_WIDGET_IDS.COMFORT
  const comfortVisible = ids.includes(comfortId)
  const rest = ids.filter((id) => id !== comfortId)
  /** @type {string[][]} */
  const groups = []

  if (comfortVisible) {
    const companions = DASHBOARD_MOBILE_FIRST_PAGE_COMPANIONS.filter((id) => rest.includes(id))
    const companionSet = new Set(companions)
    const leftover = rest.filter((id) => !companionSet.has(id))
    groups.push([comfortId, ...companions])
    for (const id of leftover) {
      groups.push([id])
    }
    return groups
  }

  for (const id of rest) {
    groups.push([id])
  }
  return groups
}

/** @returns {{ desktop: { top: string[], left: string[], right: string[], bottom: string[] }, mobile: string[], mobileGroups: string[][] }} */
export function createDefaultDashboardLayout() {
  const mobile = [...DASHBOARD_WIDGET_MOBILE_ORDER]
  return {
    desktop: {
      top: [...DASHBOARD_WIDGET_DESKTOP_TOP],
      left: [...DASHBOARD_WIDGET_DESKTOP_LEFT],
      right: [...DASHBOARD_WIDGET_DESKTOP_RIGHT],
      bottom: [...DASHBOARD_WIDGET_DESKTOP_BOTTOM],
    },
    mobile,
    mobileGroups: createDefaultMobileGroups(mobile),
  }
}
