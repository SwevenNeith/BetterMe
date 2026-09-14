/** Clé système du dossier des notes quotidiennes (survit au renommage). */
export const DAILY_NOTES_FOLDER_SYSTEM_KEY = 'daily_notes'

/** Nom par défaut à la création (peut être renommé ensuite). */
export const DAILY_NOTES_FOLDER_DEFAULT_NAME = 'Daily Notes'

/** Préfixe des system_key de notes quotidiennes : daily_note:YYYY-MM-DD */
export const DAILY_NOTE_SYSTEM_KEY_PREFIX = 'daily_note:'

/**
 * @param {Date} [date]
 * @returns {string} YYYY-MM-DD (local)
 */
export function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * @param {Date} [date]
 * @returns {string}
 */
export function dailyNoteSystemKeyForDate(date = new Date()) {
  return `${DAILY_NOTE_SYSTEM_KEY_PREFIX}${localDateKey(date)}`
}

/**
 * Titre affiché dans la page Notes (pas sur le Dashboard).
 * @param {Date} [date]
 * @returns {string}
 */
export function formatDailyNoteTitle(date = new Date()) {
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * @param {string | null | undefined} systemKey
 * @returns {string | null} YYYY-MM-DD
 */
export function parseDailyNoteDateKey(systemKey) {
  const key = String(systemKey ?? '')
  if (!key.startsWith(DAILY_NOTE_SYSTEM_KEY_PREFIX)) return null
  const dateKey = key.slice(DAILY_NOTE_SYSTEM_KEY_PREFIX.length)
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : null
}

/**
 * @param {string | null | undefined} systemKey
 * @returns {boolean}
 */
export function isDailyNoteSystemKey(systemKey) {
  return Boolean(parseDailyNoteDateKey(systemKey))
}
