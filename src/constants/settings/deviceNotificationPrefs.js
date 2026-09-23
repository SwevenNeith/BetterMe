/** Catégories de notifications gérables par appareil (prefs push). */
export const DEVICE_NOTIFICATION_CATEGORY_IDS = {
  DAILY: 'daily',
  PONCTUEL: 'ponctuel',
  ACTIVITE: 'activite',
  TIMER: 'timer',
  TODO_ITEM: 'todo_item',
  TODO_PROMESSE: 'todo_promesse',
  RECONFORT: 'reconfort',
  MENSTRUATION: 'menstruation',
  TELEVISION: 'television',
}

/** Liste affichée sous chaque appareil (ordre UI). */
export const DEVICE_NOTIFICATION_CATEGORIES = [
  {
    id: DEVICE_NOTIFICATION_CATEGORY_IDS.DAILY,
    label: 'Rappels quotidiens',
    description: 'Les rappels du matin / de la journée configurés dans Réglages.',
  },
  {
    id: DEVICE_NOTIFICATION_CATEGORY_IDS.PONCTUEL,
    label: 'Rappels ponctuels',
    description: 'Notifications uniques planifiées à une date et une heure.',
  },
  {
    id: DEVICE_NOTIFICATION_CATEGORY_IDS.ACTIVITE,
    label: 'Emploi du temps',
    description: 'Rappels avant une activité ou un événement EDT.',
  },
  {
    id: DEVICE_NOTIFICATION_CATEGORY_IDS.TIMER,
    label: 'Timers',
    description: 'Début et fin de timers (EDT ou autonomes).',
  },
  {
    id: DEVICE_NOTIFICATION_CATEGORY_IDS.TODO_ITEM,
    label: 'Rappels TODO',
    description: 'Rappels liés à une tâche TODO.',
  },
  {
    id: DEVICE_NOTIFICATION_CATEGORY_IDS.TODO_PROMESSE,
    label: 'Rappel promesses',
    description: 'Rappel quotidien s’il n’y a pas de promesse pour demain.',
  },
  {
    id: DEVICE_NOTIFICATION_CATEGORY_IDS.RECONFORT,
    label: 'Réconfort',
    description: 'Messages de réconfort automatiques ou manuels.',
  },
  {
    id: DEVICE_NOTIFICATION_CATEGORY_IDS.MENSTRUATION,
    label: 'Menstruation',
    description: 'Phases, règles estimées, SPM et patterns de symptômes.',
  },
  {
    id: DEVICE_NOTIFICATION_CATEGORY_IDS.TELEVISION,
    label: 'Télévision',
    description:
      'Sortie d’un film, nouvel épisode, ou retour d’une série terminée (nouvelle saison).',
  },
]

export function createDefaultDeviceNotificationPrefs() {
  const prefs = {}
  for (const category of DEVICE_NOTIFICATION_CATEGORIES) {
    prefs[category.id] = true
  }
  return prefs
}

export function mergeDeviceNotificationPrefs(raw) {
  const defaults = createDefaultDeviceNotificationPrefs()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaults
  }
  const merged = { ...defaults }
  for (const category of DEVICE_NOTIFICATION_CATEGORIES) {
    if (Object.prototype.hasOwnProperty.call(raw, category.id)) {
      merged[category.id] = raw[category.id] !== false
    }
  }
  return merged
}

/**
 * Associe un kind scheduled_notifications / type d’envoi à une catégorie appareil.
 * Retourne null pour les envois qui ignorent les prefs (ex. tests manuels).
 */
export function mapNotificationKindToDeviceCategory(kind) {
  const raw = String(kind ?? '').trim()
  if (!raw) return null

  if (raw === 'daily_reminder' || raw.startsWith('daily_reminder:')) {
    return DEVICE_NOTIFICATION_CATEGORY_IDS.DAILY
  }
  if (raw === 'ponctuel') return DEVICE_NOTIFICATION_CATEGORY_IDS.PONCTUEL
  if (raw === 'activite') return DEVICE_NOTIFICATION_CATEGORY_IDS.ACTIVITE
  if (raw === 'timer' || raw === 'timer_start') {
    return DEVICE_NOTIFICATION_CATEGORY_IDS.TIMER
  }
  if (raw === 'todo_item_reminder') return DEVICE_NOTIFICATION_CATEGORY_IDS.TODO_ITEM
  if (raw === 'todo_promesse_reminder') {
    return DEVICE_NOTIFICATION_CATEGORY_IDS.TODO_PROMESSE
  }
  if (raw === 'reconfort') return DEVICE_NOTIFICATION_CATEGORY_IDS.RECONFORT
  if (raw.startsWith('menstruation_')) {
    return DEVICE_NOTIFICATION_CATEGORY_IDS.MENSTRUATION
  }
  if (
    raw.startsWith('television_movie_release:') ||
    raw.startsWith('television_episode_air:')
  ) {
    return DEVICE_NOTIFICATION_CATEGORY_IDS.TELEVISION
  }
  return null
}

export function isDeviceCategoryEnabled(prefs, categoryId) {
  if (!categoryId) return true
  const merged = mergeDeviceNotificationPrefs(prefs)
  return merged[categoryId] !== false
}

export function areAllDeviceCategoriesEnabled(prefs) {
  const merged = mergeDeviceNotificationPrefs(prefs)
  return DEVICE_NOTIFICATION_CATEGORIES.every((category) => merged[category.id] !== false)
}

export function setAllDeviceCategories(enabled) {
  const prefs = createDefaultDeviceNotificationPrefs()
  for (const category of DEVICE_NOTIFICATION_CATEGORIES) {
    prefs[category.id] = Boolean(enabled)
  }
  return prefs
}
