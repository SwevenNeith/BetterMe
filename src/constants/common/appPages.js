/** Identifiants stables des pages principales (sidebar). */
export const APP_PAGE_IDS = {
  DASHBOARD: 'dashboard',
  TIMETABLE: 'timetable',
  TODO: 'todo',
  HABIT: 'habit-tracker',
  PROJETS: 'projets',
  /** @deprecated Remplacé par BIBLIOTHEQUE — conservé pour migrer visibilité / sidebar. */
  LECTURE: 'lecture',
  BIBLIOTHEQUE: 'bibliotheque',
  TELEVISION: 'television',
  RESSOURCES: 'ressources',
  JOURNAL: 'journal',
  NOTES: 'notes',
  DICTIONNAIRE: 'dictionnaire',
  MENSTRUATION: 'menstruation',
  EXERCICES_GROUP: 'exercices-group',
}

/** @typedef {{ id: string, defaultLabel: string }} AppMainPage */

/** @type {AppMainPage[]} */
export const APP_MAIN_PAGES = [
  { id: APP_PAGE_IDS.DASHBOARD, defaultLabel: 'Dashboard' },
  { id: APP_PAGE_IDS.TIMETABLE, defaultLabel: 'Emploi du temps' },
  { id: APP_PAGE_IDS.TODO, defaultLabel: 'TODO' },
  { id: APP_PAGE_IDS.HABIT, defaultLabel: 'Habit Tracker' },
  { id: APP_PAGE_IDS.PROJETS, defaultLabel: 'Projets' },
  { id: APP_PAGE_IDS.BIBLIOTHEQUE, defaultLabel: 'Bibliothèque' },
  { id: APP_PAGE_IDS.TELEVISION, defaultLabel: 'Television' },
  { id: APP_PAGE_IDS.RESSOURCES, defaultLabel: 'Ressources' },
  { id: APP_PAGE_IDS.JOURNAL, defaultLabel: 'Journaling' },
  { id: APP_PAGE_IDS.NOTES, defaultLabel: 'Notes' },
  { id: APP_PAGE_IDS.DICTIONNAIRE, defaultLabel: 'Dictionnaire' },
  { id: APP_PAGE_IDS.MENSTRUATION, defaultLabel: 'Menstruation' },
  { id: APP_PAGE_IDS.EXERCICES_GROUP, defaultLabel: 'Exercices' },
]
