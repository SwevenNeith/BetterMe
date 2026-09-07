/** Préfixe des widgets Dashboard « note épinglée ». */
export const PINNED_NOTE_WIDGET_PREFIX = 'pinned-note:'

const PREFIX_LEN = PINNED_NOTE_WIDGET_PREFIX.length

/**
 * @param {string | null | undefined} id
 */
export function isPinnedNoteWidgetId(id) {
  return typeof id === 'string' && id.startsWith(PINNED_NOTE_WIDGET_PREFIX) && id.length > PREFIX_LEN
}

/**
 * @returns {string}
 */
export function createPinnedNoteWidgetId() {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `pin-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `${PINNED_NOTE_WIDGET_PREFIX}${uuid}`
}

/**
 * Titre Réglages / carte : « Note - Titre » ou « Note - Titre - partie ».
 * @param {{ noteTitle?: string, partTitle?: string } | null | undefined} pin
 */
export function formatPinnedNoteWidgetLabel(pin) {
  const title = String(pin?.noteTitle ?? '').trim() || 'Sans titre'
  const part = String(pin?.partTitle ?? '').trim()
  if (part) return `Note - ${title} - ${part}`
  return `Note - ${title}`
}

/**
 * Titre de partie depuis un extrait Markdown.
 * @param {string} excerpt
 */
export function derivePinnedNotePartTitle(excerpt) {
  const lines = String(excerpt ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length) return ''
  let first = lines[0]
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s*/, '')
    .replace(/^([-*+]|\d+[.)])\s+/, '')
    .replace(/^\[[ xX]\]\s+/, '')
    .replace(/[*_`~]+/g, '')
    .trim()
  if (!first) return ''
  if (first.length > 48) return `${first.slice(0, 45)}…`
  return first
}

/**
 * @param {unknown} raw
 * @returns {Record<string, {
 *   noteId: string,
 *   vaultId: string | null,
 *   noteTitle: string,
 *   partTitle: string,
 *   contentMd: string,
 *   createdAt: string,
 * }>}
 */
export function normalizeDashboardPins(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  /** @type {Record<string, any>} */
  const out = {}
  for (const [id, value] of Object.entries(raw)) {
    if (!isPinnedNoteWidgetId(id) || !value || typeof value !== 'object') continue
    const noteId = typeof value.noteId === 'string' ? value.noteId.trim() : ''
    if (!noteId) continue
    out[id] = {
      noteId,
      vaultId: typeof value.vaultId === 'string' && value.vaultId ? value.vaultId : null,
      noteTitle: String(value.noteTitle ?? '').trim() || 'Sans titre',
      partTitle: String(value.partTitle ?? '').trim(),
      contentMd: String(value.contentMd ?? ''),
      createdAt:
        typeof value.createdAt === 'string' && value.createdAt
          ? value.createdAt
          : new Date().toISOString(),
    }
  }
  return out
}
