import { DEFAULT_TEXT_COLOR, isSafeCssColor, normalizeHex, rgbToHex } from './richNoteTextColors.js'

const ALLOWED_TAGS = new Set([
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'P',
  'DIV',
  'BR',
  'SPAN',
  'FONT',
])

const ALLOWED_STYLES = new Set(['text-align', 'color'])

function buildStyleAttr(node, tag) {
  if (!['DIV', 'P', 'SPAN', 'FONT'].includes(tag)) return ''

  const parts = []

  const align = node.style?.textAlign
  if (align && ALLOWED_STYLES.has('text-align')) {
    parts.push(`text-align: ${align}`)
  }

  let color = node.style?.color
  if (tag === 'FONT' && !color) {
    color = node.getAttribute('color')
  }

  const hex = rgbToHex(color)
  if (hex && hex !== DEFAULT_TEXT_COLOR && ALLOWED_STYLES.has('color')) {
    parts.push(`color: ${hex}`)
  }

  return parts.length > 0 ? ` style="${parts.join('; ')}"` : ''
}

/**
 * Nettoie un fragment HTML issu de l’éditeur riche (allowlist minimale).
 * @param {string} html
 * @returns {string}
 */
export function sanitizeRichNoteHtml(html) {
  const raw = String(html ?? '').trim()
  if (!raw) return ''

  const template = document.createElement('template')
  template.innerHTML = raw

  function cleanNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''

    if (node.nodeType !== Node.ELEMENT_NODE) return ''

    const tag = node.tagName
    if (!ALLOWED_TAGS.has(tag)) {
      return [...node.childNodes].map(cleanNode).join('')
    }

    const styleAttr = buildStyleAttr(node, tag)
    const inner = [...node.childNodes].map(cleanNode).join('')
    if (tag === 'BR') return '<br>'

    const lower = tag === 'FONT' ? 'span' : tag.toLowerCase()
    return `<${lower}${styleAttr}>${inner}</${lower}>`
  }

  return [...template.content.childNodes].map(cleanNode).join('').trim()
}

/**
 * @param {string} html
 */
export function isRichNoteEmpty(html) {
  const sanitized = sanitizeRichNoteHtml(html)
  if (!sanitized) return true
  const text = sanitized.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
  return text.length === 0
}

export { isSafeCssColor, normalizeHex, rgbToHex }
