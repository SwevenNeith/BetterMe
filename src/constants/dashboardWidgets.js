/** Identifiants stables des blocs affichables sur le Dashboard. */
export const DASHBOARD_WIDGET_IDS = {
  COMFORT: 'comfort',
  TODO: 'todo',
  TIMETABLE: 'timetable',
  CHECKIN: 'checkin',
  HABITS: 'habits',
  MENSTRUATION: 'menstruation',
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
  { id: DASHBOARD_WIDGET_IDS.TODO, defaultLabel: 'TODO du jour' },
  { id: DASHBOARD_WIDGET_IDS.TIMETABLE, defaultLabel: 'Emploi du temps du jour' },
  { id: DASHBOARD_WIDGET_IDS.CHECKIN, defaultLabel: 'Check-in émotionnel' },
  { id: DASHBOARD_WIDGET_IDS.HABITS, defaultLabel: 'Habitudes (vue mensuelle)' },
  { id: DASHBOARD_WIDGET_IDS.MENSTRUATION, defaultLabel: 'Menstruation' },
  { id: DASHBOARD_WIDGET_IDS.PROJECTS, defaultLabel: 'Projets actifs' },
]

export const DASHBOARD_WIDGET_ID_SET = new Set(DASHBOARD_WIDGETS.map((widget) => widget.id))

/** Ordre d’apparition sur mobile (carrousel / liste réglages). */
export const DASHBOARD_WIDGET_MOBILE_ORDER = [
  DASHBOARD_WIDGET_IDS.COMFORT,
  DASHBOARD_WIDGET_IDS.TODO,
  DASHBOARD_WIDGET_IDS.TIMETABLE,
  DASHBOARD_WIDGET_IDS.CHECKIN,
  DASHBOARD_WIDGET_IDS.HABITS,
  DASHBOARD_WIDGET_IDS.MENSTRUATION,
  DASHBOARD_WIDGET_IDS.PROJECTS,
]

/** Colonne gauche du dashboard (desktop). */
export const DASHBOARD_WIDGET_DESKTOP_LEFT = [
  DASHBOARD_WIDGET_IDS.COMFORT,
  DASHBOARD_WIDGET_IDS.TODO,
  DASHBOARD_WIDGET_IDS.TIMETABLE,
  DASHBOARD_WIDGET_IDS.PROJECTS,
]

/** Colonne droite du dashboard (desktop). */
export const DASHBOARD_WIDGET_DESKTOP_RIGHT = [
  DASHBOARD_WIDGET_IDS.HABITS,
  DASHBOARD_WIDGET_IDS.MENSTRUATION,
]

/** Bandeau pleine largeur au-dessus des colonnes (desktop). */
export const DASHBOARD_WIDGET_DESKTOP_TOP = []

/** Bandeau pleine largeur sous les colonnes (desktop). */
export const DASHBOARD_WIDGET_DESKTOP_BOTTOM = [DASHBOARD_WIDGET_IDS.CHECKIN]

/** @deprecated Utiliser DASHBOARD_WIDGET_DESKTOP_BOTTOM */
export const DASHBOARD_WIDGET_DESKTOP_FULL = DASHBOARD_WIDGET_DESKTOP_BOTTOM

/** @returns {{ desktop: { top: string[], left: string[], right: string[], bottom: string[] }, mobile: string[] }} */
export function createDefaultDashboardLayout() {
  return {
    desktop: {
      top: [...DASHBOARD_WIDGET_DESKTOP_TOP],
      left: [...DASHBOARD_WIDGET_DESKTOP_LEFT],
      right: [...DASHBOARD_WIDGET_DESKTOP_RIGHT],
      bottom: [...DASHBOARD_WIDGET_DESKTOP_BOTTOM],
    },
    mobile: [...DASHBOARD_WIDGET_MOBILE_ORDER],
  }
}
