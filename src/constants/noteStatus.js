/** Statuts de notes (extension « Statuts de notes »). */

export const NOTE_STATUS = {
  NONE: '',
  A_TRAITER: 'a_traiter',
  FAIT: 'fait',
}

export const NOTE_STATUS_OPTIONS = [
  { id: NOTE_STATUS.NONE, label: 'Aucun' },
  { id: NOTE_STATUS.A_TRAITER, label: 'À traiter' },
  { id: NOTE_STATUS.FAIT, label: 'Fait' },
]

export const NOTE_STATUS_LABELS = {
  [NOTE_STATUS.A_TRAITER]: 'À traiter',
  [NOTE_STATUS.FAIT]: 'Fait',
}

/** Id de l’extension Notes qui active les statuts + sync TODO semaine. */
export const NOTE_STATUS_TODOS_EXTENSION_ID = 'note-status-todos'

/**
 * @param {string | null | undefined} status
 * @returns {string}
 */
export function normalizeNoteStatus(status) {
  const value = String(status ?? '').trim()
  if (value === NOTE_STATUS.A_TRAITER || value === NOTE_STATUS.FAIT) return value
  return NOTE_STATUS.NONE
}

/**
 * @param {string | null | undefined} status
 */
export function isNoteStatusATraiter(status) {
  return normalizeNoteStatus(status) === NOTE_STATUS.A_TRAITER
}
