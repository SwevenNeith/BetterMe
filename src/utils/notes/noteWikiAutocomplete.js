/**
 * Détecte une requête wikilink ouverte `[[…` à gauche du curseur.
 * @param {string} content
 * @param {number} cursorPos
 * @returns {{ start: number, query: string } | null}
 */
export function findOpenWikiQuery(content, cursorPos) {
  const text = String(content ?? '')
  const pos = Math.max(0, Math.min(Number(cursorPos) || 0, text.length))
  const before = text.slice(0, pos)
  // Pas de ] non fermé / pas de saut de ligne dans la requête
  const match = before.match(/\[\[([^\][\n]*)$/)
  if (!match) return null
  return {
    start: pos - match[0].length,
    query: match[1] ?? '',
  }
}

/**
 * @param {{ id: string, title: string }[]} notes
 * @param {string} query
 * @param {string | null | undefined} excludeNoteId
 * @param {number} [limit]
 */
export function filterWikiSuggestions(notes, query, excludeNoteId = null, limit = 8) {
  const q = String(query ?? '')
    .trim()
    .toLowerCase()
  const list = (Array.isArray(notes) ? notes : []).filter(
    (note) => note && note.id && note.id !== excludeNoteId,
  )

  /** @type {{ note: { id: string, title: string }, score: number }[]} */
  const scored = []
  for (const note of list) {
    const title = String(note.title ?? '').trim()
    if (!title) continue
    const lower = title.toLowerCase()
    let score = 0
    if (!q) score = 1
    else if (lower === q) score = 4
    else if (lower.startsWith(q)) score = 3
    else if (lower.includes(q)) score = 2
    else continue
    scored.push({ note: { id: note.id, title }, score })
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.note.title.localeCompare(b.note.title, 'fr', { sensitivity: 'base', numeric: true }),
  )
  return scored.slice(0, Math.max(1, limit)).map((entry) => entry.note)
}

/**
 * Estime la position du caret dans un textarea (pour ancrer le menu).
 * @param {HTMLTextAreaElement} textarea
 * @param {number} position
 * @returns {{ top: number, left: number, lineHeight: number }}
 */
export function getTextareaCaretViewportPoint(textarea, position) {
  const style = window.getComputedStyle(textarea)
  const mirror = document.createElement('div')
  const props = [
    'boxSizing',
    'width',
    'height',
    'overflowX',
    'overflowY',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'fontStyle',
    'fontVariant',
    'fontWeight',
    'fontStretch',
    'fontSize',
    'fontSizeAdjust',
    'lineHeight',
    'fontFamily',
    'textAlign',
    'textTransform',
    'textIndent',
    'textDecoration',
    'letterSpacing',
    'wordSpacing',
    'tabSize',
    'whiteSpace',
    'wordWrap',
    'wordBreak',
  ]
  mirror.style.position = 'absolute'
  mirror.style.visibility = 'hidden'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.wordWrap = 'break-word'
  mirror.style.top = '0'
  mirror.style.left = '-9999px'
  for (const prop of props) {
    mirror.style[prop] = style[prop]
  }
  mirror.style.width = `${textarea.clientWidth}px`
  mirror.style.height = 'auto'
  mirror.style.overflow = 'hidden'

  const value = textarea.value.slice(0, position)
  mirror.textContent = value
  const marker = document.createElement('span')
  marker.textContent = '\u200b'
  mirror.appendChild(marker)
  document.body.appendChild(mirror)

  const rect = textarea.getBoundingClientRect()
  const markerRect = marker.getBoundingClientRect()
  const mirrorRect = mirror.getBoundingClientRect()
  const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.4 || 18

  const top =
    rect.top +
    (markerRect.top - mirrorRect.top) -
    textarea.scrollTop +
    lineHeight
  const left = rect.left + (markerRect.left - mirrorRect.left) - textarea.scrollLeft

  document.body.removeChild(mirror)
  return { top, left, lineHeight }
}
