export const DEFAULT_TEXT_COLOR = '#2c3e50'

export const TEXT_COLOR_PRESETS = [
  '#2c3e50',
  '#c0392b',
  '#e67e22',
  '#d4ac0d',
  '#27ae60',
  '#2980b9',
  '#8e44ad',
  '#ad81be',
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
