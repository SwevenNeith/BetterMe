export const DEFAULT_TEXT_COLOR = '#2c3e50'

export const TEXT_COLOR_PRESETS = [
  // Row 1 — dark
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
  // Row 2 — vivid
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
  // Row 3 — medium
  '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
  // Row 4 — soft
  '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd',
  // Row 5 — deep
  '#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0',
]

const STORAGE_KEY = 'betterme-rich-note-recent-text-colors'
const MAX_RECENT = 8

export function normalizeHex(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const withHash = raw.startsWith('#') ? raw : `#${raw}`
  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) {
    return withHash.toLowerCase()
  }
  if (/^#[0-9a-fA-F]{3}$/.test(withHash)) {
    const h = withHash.slice(1)
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase()
  }
  return null
}

export function rgbToHex(value) {
  const raw = String(value || '').trim().toLowerCase()
  const fromHex = normalizeHex(raw)
  if (fromHex) return fromHex

  const match = raw.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (!match) return null

  const parts = match.slice(1, 4).map((n) => {
    const clamped = Math.max(0, Math.min(255, Number(n)))
    return clamped.toString(16).padStart(2, '0')
  })

  return `#${parts.join('')}`
}

export function loadRecentTextColors() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeHex).filter(Boolean).slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

export function rememberRecentTextColor(color) {
  const hex = normalizeHex(color)
  if (!hex || hex === DEFAULT_TEXT_COLOR) return

  const next = [hex, ...loadRecentTextColors().filter((c) => c !== hex)].slice(0, MAX_RECENT)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore quota errors
  }
}

export function isSafeCssColor(value) {
  return Boolean(normalizeHex(value) || rgbToHex(value))
}

/** Retire les styles inline des surlignages note pour laisser le CSS applicatif s'appliquer. */
export function normalizeNoteHighlightElement(mark) {
  if (!mark?.classList) return
  mark.classList.add('rich-note__highlight')
  mark.removeAttribute('style')
}

export function normalizeNoteHighlightsInHtml(html) {
  const raw = String(html ?? '')
  if (!raw || !raw.includes('data-note-id')) return raw

  const template = document.createElement('template')
  template.innerHTML = raw
  template.content.querySelectorAll('mark[data-note-id]').forEach(normalizeNoteHighlightElement)
  return template.innerHTML
}
