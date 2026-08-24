import { APP_PAGE_IDS } from './appPages.js'

/**
 * Pages sélectionnables dans le Plan de Travail.
 * Aligné sur la sidebar (+ Mood sous Exercices, + Réglages).
 */
export const WORKSPACE_PAGE_OPTIONS = [
  {
    id: APP_PAGE_IDS.TIMETABLE,
    path: '/timetable',
    defaultLabel: 'Emploi du temps',
    icon: 'timetable',
  },
  {
    id: APP_PAGE_IDS.TODO,
    path: '/todo',
    defaultLabel: 'TODO',
    icon: 'todo',
  },
  {
    id: APP_PAGE_IDS.HABIT,
    path: '/habit-tracker',
    defaultLabel: 'Habit Tracker',
    icon: 'habit',
  },
  {
    id: APP_PAGE_IDS.PROJETS,
    path: '/projets',
    defaultLabel: 'Projets',
    icon: 'projets',
  },
  {
    id: APP_PAGE_IDS.LECTURE,
    path: '/lecture',
    defaultLabel: 'Lecture',
    icon: 'lecture',
  },
  {
    id: APP_PAGE_IDS.RESSOURCES,
    path: '/ressources',
    defaultLabel: 'Ressources',
    icon: 'ressources',
  },
  {
    id: APP_PAGE_IDS.JOURNAL,
    path: '/journal',
    defaultLabel: 'Journaling',
    icon: 'journal',
  },
  {
    id: APP_PAGE_IDS.MENSTRUATION,
    path: '/menstruation',
    defaultLabel: 'Menstruation',
    icon: 'menstruation',
  },
  {
    id: APP_PAGE_IDS.EXERCICES_GROUP,
    path: '/exercices',
    defaultLabel: 'Exercices',
    icon: 'exercices',
  },
  {
    id: 'mood',
    path: '/mood',
    defaultLabel: 'Humeurs',
    visibilityId: APP_PAGE_IDS.EXERCICES_GROUP,
    icon: 'mood',
  },
  {
    id: 'settings',
    path: '/settings',
    defaultLabel: 'Réglages',
    alwaysVisible: true,
    icon: 'settings',
  },
]

export const WORKSPACE_MAX_PANES = 6
export const WORKSPACE_AREA_KEYS = ['a', 'b', 'c', 'd', 'e', 'f']

/**
 * Dispositions type Windows Snap.
 * `rowSplitFromCol` : le séparateur horizontal ne commence qu’à cette colonne
 * (évite une barre à travers un panneau qui s’étend sur 2 rangées).
 */
export const WORKSPACE_LAYOUTS = [
  {
    id: 'single',
    label: 'Plein écran',
    slots: 1,
    cols: 1,
    rows: 1,
    areas: [['a']],
    defaultColFr: [1],
    defaultRowFr: [1],
  },
  {
    id: 'split-50',
    label: '50 / 50',
    slots: 2,
    cols: 2,
    rows: 1,
    areas: [['a', 'b']],
    defaultColFr: [1, 1],
    defaultRowFr: [1],
  },
  {
    id: 'split-60',
    label: '60 / 40',
    slots: 2,
    cols: 2,
    rows: 1,
    areas: [['a', 'b']],
    defaultColFr: [1.5, 1],
    defaultRowFr: [1],
  },
  {
    id: 'split-40',
    label: '40 / 60',
    slots: 2,
    cols: 2,
    rows: 1,
    areas: [['a', 'b']],
    defaultColFr: [1, 1.5],
    defaultRowFr: [1],
  },
  {
    id: 'triple-cols',
    label: '3 colonnes',
    slots: 3,
    cols: 3,
    rows: 1,
    areas: [['a', 'b', 'c']],
    defaultColFr: [1, 1, 1],
    defaultRowFr: [1],
  },
  {
    id: 'triple-left',
    label: 'Grand à gauche',
    slots: 3,
    cols: 2,
    rows: 2,
    areas: [
      ['a', 'b'],
      ['a', 'c'],
    ],
    defaultColFr: [1.35, 1],
    defaultRowFr: [1, 1],
    rowSplitFromCol: 1,
  },
  {
    id: 'quad',
    label: '2 × 2',
    slots: 4,
    cols: 2,
    rows: 2,
    areas: [
      ['a', 'b'],
      ['c', 'd'],
    ],
    defaultColFr: [1, 1],
    defaultRowFr: [1, 1],
  },
  {
    id: 'five',
    label: 'Grand à gauche + 4',
    slots: 5,
    cols: 3,
    rows: 2,
    areas: [
      ['a', 'b', 'c'],
      ['a', 'd', 'e'],
    ],
    defaultColFr: [1.25, 1, 1],
    defaultRowFr: [1, 1],
    rowSplitFromCol: 1,
  },
  {
    id: 'six',
    label: '3 × 2',
    slots: 6,
    cols: 3,
    rows: 2,
    areas: [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ],
    defaultColFr: [1, 1, 1],
    defaultRowFr: [1, 1],
  },
]

export const WORKSPACE_LAYOUT_BY_ID = Object.fromEntries(
  WORKSPACE_LAYOUTS.map((layout) => [layout.id, layout]),
)

export function getWorkspaceLayout(id) {
  return WORKSPACE_LAYOUT_BY_ID[id] ?? WORKSPACE_LAYOUTS[0]
}

export function layoutFitsPaneCount(layout, paneCount) {
  return Boolean(layout) && layout.slots >= paneCount
}

/** Positions des séparateurs, limitées aux vraies bordures entre cellules. */
export function getWorkspaceSplitters(layout, colFr, rowFr) {
  if (!layout) return []

  const colTotal = (colFr ?? []).reduce((sum, n) => sum + n, 0) || 1
  const rowTotal = (rowFr ?? []).reduce((sum, n) => sum + n, 0) || 1
  const splitters = []

  let colAcc = 0
  for (let index = 0; index < layout.cols - 1; index += 1) {
    colAcc += colFr[index] ?? 1
    splitters.push({
      id: `col-${index}`,
      axis: 'col',
      index,
      style: {
        left: `${(colAcc / colTotal) * 100}%`,
        top: '0%',
        bottom: '0%',
      },
    })
  }

  const fromCol = layout.rowSplitFromCol ?? 0
  let leftPct = 0
  for (let i = 0; i < fromCol; i += 1) {
    leftPct += ((colFr[i] ?? 1) / colTotal) * 100
  }

  let rowAcc = 0
  for (let index = 0; index < layout.rows - 1; index += 1) {
    rowAcc += rowFr[index] ?? 1
    splitters.push({
      id: `row-${index}`,
      axis: 'row',
      index,
      style: {
        top: `${(rowAcc / rowTotal) * 100}%`,
        left: `${leftPct}%`,
        right: '0%',
      },
    })
  }

  return splitters
}
