/**
 * Helpers pour envelopper / transformer une sélection Markdown dans l’éditeur Notes.
 */

/**
 * @param {string} content
 * @param {number} start
 * @param {number} end
 * @param {string} before
 * @param {string} after
 */
export function wrapOrUnwrapRange(content, start, end, before, after) {
  const text = String(content ?? '')
  const from = Math.max(0, Math.min(Number(start) || 0, text.length))
  const to = Math.max(from, Math.min(Number(end) || 0, text.length))
  if (from === to) {
    return { content: text, selectionStart: from, selectionEnd: to, changed: false }
  }

  const selected = text.slice(from, to)
  const beforeLen = before.length
  const afterLen = after.length

  if (
    selected.length >= beforeLen + afterLen &&
    selected.startsWith(before) &&
    selected.endsWith(after)
  ) {
    const inner = selected.slice(beforeLen, selected.length - afterLen)
    const next = `${text.slice(0, from)}${inner}${text.slice(to)}`
    return {
      content: next,
      selectionStart: from,
      selectionEnd: from + inner.length,
      changed: true,
    }
  }

  if (
    from >= beforeLen &&
    text.slice(from - beforeLen, from) === before &&
    text.slice(to, to + afterLen) === after
  ) {
    const next = `${text.slice(0, from - beforeLen)}${selected}${text.slice(to + afterLen)}`
    return {
      content: next,
      selectionStart: from - beforeLen,
      selectionEnd: from - beforeLen + selected.length,
      changed: true,
    }
  }

  const next = `${text.slice(0, from)}${before}${selected}${after}${text.slice(to)}`
  return {
    content: next,
    selectionStart: from + beforeLen,
    selectionEnd: from + beforeLen + selected.length,
    changed: true,
  }
}

/**
 * @param {string} content
 * @param {number} start
 * @param {number} end
 * @param {'bold'|'italic'|'underline'|'strike'|'highlight'|'color'|'wiki'|'link'} kind
 * @param {string} [extra]
 */
export function formatNoteSelection(content, start, end, kind, extra = '') {
  switch (kind) {
    case 'bold':
      return wrapOrUnwrapRange(content, start, end, '**', '**')
    case 'italic':
      return wrapOrUnwrapRange(content, start, end, '*', '*')
    case 'strike':
      return wrapOrUnwrapRange(content, start, end, '~~', '~~')
    case 'underline':
      return wrapOrUnwrapRange(content, start, end, '<u>', '</u>')
    case 'highlight': {
      const hex = String(extra || '#fff3a3').toLowerCase()
      return wrapOrUnwrapRange(
        content,
        start,
        end,
        `<mark style="background-color: ${hex}">`,
        '</mark>',
      )
    }
    case 'color': {
      const hex = String(extra || '#000000').toLowerCase()
      return wrapOrUnwrapRange(
        content,
        start,
        end,
        `<span style="color: ${hex}">`,
        '</span>',
      )
    }
    case 'wiki':
      return wrapOrUnwrapRange(content, start, end, '[[', ']]')
    case 'link': {
      const url = String(extra || '').trim() || 'https://'
      return wrapOrUnwrapRange(content, start, end, '[', `](${url})`)
    }
    default:
      return {
        content: String(content ?? ''),
        selectionStart: start,
        selectionEnd: end,
        changed: false,
      }
  }
}

/**
 * @param {string} content
 * @param {number} start
 * @param {number} end
 * @param {string} replacement
 */
export function replaceNoteSelection(content, start, end, replacement) {
  const text = String(content ?? '')
  const from = Math.max(0, Math.min(Number(start) || 0, text.length))
  const to = Math.max(from, Math.min(Number(end) || 0, text.length))
  const value = String(replacement ?? '')
  return {
    content: `${text.slice(0, from)}${value}${text.slice(to)}`,
    selectionStart: from,
    selectionEnd: from + value.length,
  }
}

/**
 * Étend la plage aux lignes entières touchées.
 * @param {string} content
 * @param {number} start
 * @param {number} end
 */
export function expandRangeToLines(content, start, end) {
  const text = String(content ?? '')
  let from = Math.max(0, Math.min(Number(start) || 0, text.length))
  let to = Math.max(from, Math.min(Number(end) || 0, text.length))
  while (from > 0 && text[from - 1] !== '\n') from -= 1
  while (to < text.length && text[to] !== '\n') to += 1
  return { from, to }
}

const HEADING_RE = /^(#{1,6})\s+/
const QUOTE_RE = /^>\s?/
const UL_RE = /^[-*+]\s+/
const OL_RE = /^\d+\.\s+/
const TASK_RE = /^[-*+]\s+\[[ xX]\]\s+/

/**
 * @param {string} line
 */
function stripBlockPrefix(line) {
  return line
    .replace(TASK_RE, '')
    .replace(UL_RE, '')
    .replace(OL_RE, '')
    .replace(HEADING_RE, '')
    .replace(QUOTE_RE, '')
}

/**
 * @param {string} content
 * @param {number} start
 * @param {number} end
 * @param {'h1'|'h2'|'h3'|'quote'|'bullet'|'number'|'task'|'paragraph'} kind
 */
export function applyBlockFormat(content, start, end, kind) {
  const text = String(content ?? '')
  const { from, to } = expandRangeToLines(text, start, end)
  const block = text.slice(from, to)
  const lines = block.split('\n')
  const nextLines = lines.map((line, index) => {
    const bare = stripBlockPrefix(line)
    if (kind === 'paragraph') return bare
    if (kind === 'h1') return `# ${bare}`
    if (kind === 'h2') return `## ${bare}`
    if (kind === 'h3') return `### ${bare}`
    if (kind === 'quote') return `> ${bare}`
    if (kind === 'bullet') return `- ${bare}`
    if (kind === 'number') return `${index + 1}. ${bare}`
    if (kind === 'task') return `- [ ] ${bare}`
    return line
  })
  const nextBlock = nextLines.join('\n')
  return {
    content: `${text.slice(0, from)}${nextBlock}${text.slice(to)}`,
    selectionStart: from,
    selectionEnd: from + nextBlock.length,
    changed: nextBlock !== block,
  }
}

/**
 * Insère un motif à la position (ou remplace la sélection).
 * @param {string} content
 * @param {number} start
 * @param {number} end
 * @param {string} insertion
 * @param {number} [cursorOffset] offset dans l’insertion pour le caret
 */
export function insertAtSelection(content, start, end, insertion, cursorOffset = null) {
  const text = String(content ?? '')
  const from = Math.max(0, Math.min(Number(start) || 0, text.length))
  const to = Math.max(from, Math.min(Number(end) || 0, text.length))
  const value = String(insertion ?? '')
  const caret =
    cursorOffset == null ? from + value.length : from + Math.max(0, Math.min(cursorOffset, value.length))
  return {
    content: `${text.slice(0, from)}${value}${text.slice(to)}`,
    selectionStart: caret,
    selectionEnd: caret,
    changed: true,
  }
}

/**
 * Retire les balises <mark> dans / autour de la sélection.
 * @param {string} content
 * @param {number} start
 * @param {number} end
 */
export function eraseHighlightInRange(content, start, end) {
  const text = String(content ?? '')
  let from = Math.max(0, Math.min(Number(start) || 0, text.length))
  let to = Math.max(from, Math.min(Number(end) || 0, text.length))

  const openRe = /<mark\b[^>]*>/i
  const closeRe = /<\/mark>/i

  // Étend pour englober une balise mark englobante
  const before = text.slice(0, from)
  const openIdx = before.toLowerCase().lastIndexOf('<mark')
  if (openIdx >= 0) {
    const closeBefore = before.toLowerCase().lastIndexOf('</mark>')
    if (closeBefore < openIdx) {
      const openEnd = text.indexOf('>', openIdx)
      const closeIdx = text.toLowerCase().indexOf('</mark>', to)
      if (openEnd >= 0 && closeIdx >= to) {
        from = openIdx
        to = closeIdx + '</mark>'.length
      }
    }
  }

  const selected = text.slice(from, to)
  if (!openRe.test(selected) && !closeRe.test(selected)) {
    return { content: text, selectionStart: from, selectionEnd: to, changed: false }
  }

  const cleaned = selected.replace(/<\/?mark\b[^>]*>/gi, '')
  return {
    content: `${text.slice(0, from)}${cleaned}${text.slice(to)}`,
    selectionStart: from,
    selectionEnd: from + cleaned.length,
    changed: cleaned !== selected,
  }
}

/**
 * Titre court dérivé d’une sélection (pour extraction de note).
 * @param {string} text
 */
export function deriveNoteTitleFromSelection(text) {
  const firstLine = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)
  if (!firstLine) return 'Extrait'
  const cleaned = firstLine.replace(/^#+\s*/, '').replace(/[*_`~\[\]()]/g, '').trim()
  if (!cleaned) return 'Extrait'
  return cleaned.length > 60 ? `${cleaned.slice(0, 57).trim()}…` : cleaned
}

/**
 * La sélection contient-elle (ou est-elle dans) un surlignage mark ?
 * @param {string} content
 * @param {number} start
 * @param {number} end
 */
export function selectionHasHighlight(content, start, end) {
  const text = String(content ?? '')
  const from = Math.max(0, Math.min(Number(start) || 0, text.length))
  const to = Math.max(from, Math.min(Number(end) || 0, text.length))
  if (/<\/?mark\b/i.test(text.slice(from, to))) return true
  const before = text.slice(0, from)
  const openIdx = before.toLowerCase().lastIndexOf('<mark')
  if (openIdx < 0) return false
  const closeBefore = before.toLowerCase().lastIndexOf('</mark>')
  if (closeBefore > openIdx) return false
  return text.toLowerCase().indexOf('</mark>', to) >= to
}
