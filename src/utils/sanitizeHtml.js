const ALLOWED_TAGS = new Set([
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'MARK',
  'P',
  'DIV',
  'BR',
  'SPAN',
])

const ALLOWED_STYLES = new Set(['text-align'])

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

    let styleAttr = ''
    if (tag === 'DIV' || tag === 'P' || tag === 'SPAN') {
      const align = node.style?.textAlign
      if (align && ALLOWED_STYLES.has('text-align')) {
        styleAttr = ` style="text-align: ${align}"`
      }
    }

    const inner = [...node.childNodes].map(cleanNode).join('')
    if (tag === 'BR') return '<br>'

    const lower = tag.toLowerCase()
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
