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

/** Indentation Markdown (listes imbriquées + tabulations). */
export const NOTE_INDENT_UNIT = '  '
export const NOTE_INDENT_MAX_LEVEL = 8

const HEADING_RE = /^(#{1,6})\s+/
const QUOTE_RE = /^>\s?/
const UL_RE = /^[-*+]\s+/
const OL_RE = /^\d+\.\s+/
const TASK_RE = /^[-*+]\s+\[[ xX]\]\s+/

/**
 * @param {string} line
 * @returns {{
 *   isList: boolean,
 *   indent: string,
 *   bare: string,
 *   type: 'bullet'|'number'|'task'|null,
 *   checked: boolean,
 *   number: number|null,
 *   marker: string|null,
 * }}
 */
export function parseNoteListLine(line) {
  const raw = String(line ?? '')
  const m = raw.match(/^( *)(?:([-*+])\s+(?:\[([ xX])\]\s+)?|(\d+)\.\s+)(.*)$/)
  if (!m) {
    const plain = raw.match(/^( *)(.*)$/)
    return {
      isList: false,
      indent: plain?.[1] ?? '',
      bare: plain?.[2] ?? raw,
      type: null,
      checked: false,
      number: null,
      marker: null,
    }
  }
  const type = m[4] != null ? 'number' : m[3] != null ? 'task' : 'bullet'
  return {
    isList: true,
    indent: m[1],
    bare: m[5] ?? '',
    type,
    checked: m[3] === 'x' || m[3] === 'X',
    number: m[4] != null ? Number(m[4]) : null,
    marker: m[2] || '-',
  }
}

/**
 * @param {{
 *   indent?: string,
 *   type: 'bullet'|'number'|'task'|null,
 *   bare?: string,
 *   checked?: boolean,
 *   number?: number|null,
 *   marker?: string|null,
 * }} opts
 */
export function formatNoteListLine(opts) {
  const indent = String(opts?.indent ?? '')
  const bare = String(opts?.bare ?? '')
  const type = opts?.type
  if (type === 'task') {
    return `${indent}- [${opts?.checked ? 'x' : ' '}] ${bare}`
  }
  if (type === 'number') {
    const n = Math.max(1, Number(opts?.number) || 1)
    return `${indent}${n}. ${bare}`
  }
  if (type === 'bullet') {
    return `${indent}${opts?.marker || '-'} ${bare}`
  }
  return `${indent}${bare}`
}

/**
 * @param {string} line
 */
function stripBlockPrefix(line) {
  const parsed = parseNoteListLine(line)
  if (parsed.isList) {
    return { indent: parsed.indent, bare: parsed.bare }
  }
  const rest = String(line ?? '')
    .replace(/^( *)/, '')
  const indent = String(line ?? '').match(/^( *)/)?.[1] ?? ''
  const bare = rest
    .replace(TASK_RE, '')
    .replace(UL_RE, '')
    .replace(OL_RE, '')
    .replace(HEADING_RE, '')
    .replace(QUOTE_RE, '')
  return { indent, bare }
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
    const { indent, bare } = stripBlockPrefix(line)
    if (kind === 'paragraph') return `${indent}${bare}`
    if (kind === 'h1') return `${indent}# ${bare}`
    if (kind === 'h2') return `${indent}## ${bare}`
    if (kind === 'h3') return `${indent}### ${bare}`
    if (kind === 'quote') return `${indent}> ${bare}`
    if (kind === 'bullet') return formatNoteListLine({ indent, type: 'bullet', bare })
    if (kind === 'number') {
      return formatNoteListLine({ indent, type: 'number', bare, number: index + 1 })
    }
    if (kind === 'task') {
      return formatNoteListLine({ indent, type: 'task', bare, checked: false })
    }
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
 * Indente / désindente les lignes sélectionnées (Tab / Shift+Tab).
 * @param {string} content
 * @param {number} start
 * @param {number} end
 * @param {'indent'|'outdent'} direction
 */
export function adjustNoteLineIndent(content, start, end, direction) {
  const text = String(content ?? '')
  const { from, to } = expandRangeToLines(text, start, end)
  const block = text.slice(from, to)
  const lines = block.split('\n')
  const unit = NOTE_INDENT_UNIT
  const nextLines = lines.map((line) => {
    if (direction === 'indent') {
      const level = Math.floor((line.match(/^ */)?.[0]?.length || 0) / unit.length)
      if (level >= NOTE_INDENT_MAX_LEVEL) return line
      return `${unit}${line}`
    }
    if (line.startsWith(unit)) return line.slice(unit.length)
    if (line.startsWith('\t')) return line.slice(1)
    if (line.startsWith(' ')) return line.slice(1)
    return line
  })
  const nextBlock = nextLines.join('\n')
  const changed = nextBlock !== block
  // Conserve la sélection relative aux extrémités du bloc
  const selStart = Math.max(from, Math.min(Number(start) || from, from + nextBlock.length))
  const selEnd = Math.max(selStart, Math.min(Number(end) || selStart, from + nextBlock.length))
  // Si on a indenté, décale le caret d’autant que le delta sur la 1re ligne
  let selectionStart = selStart
  let selectionEnd = selEnd
  if (changed && lines.length === 1) {
    const delta = nextLines[0].length - lines[0].length
    selectionStart = Math.max(from, (Number(start) || from) + delta)
    selectionEnd = Math.max(selectionStart, (Number(end) || selectionStart) + delta)
  } else if (changed) {
    selectionStart = from
    selectionEnd = from + nextBlock.length
  }
  return {
    content: changed ? `${text.slice(0, from)}${nextBlock}${text.slice(to)}` : text,
    selectionStart,
    selectionEnd,
    changed,
  }
}

/**
 * Entrée sur une ligne de liste : continue au même niveau, ou sort / désindente si vide.
 * @param {string} content
 * @param {number} cursorPos
 */
export function handleNoteListEnter(content, cursorPos) {
  const text = String(content ?? '')
  const pos = Math.max(0, Math.min(Number(cursorPos) || 0, text.length))
  let lineStart = pos
  while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart -= 1
  let lineEnd = pos
  while (lineEnd < text.length && text[lineEnd] !== '\n') lineEnd += 1
  const line = text.slice(lineStart, lineEnd)
  const parsed = parseNoteListLine(line)
  if (!parsed.isList) {
    return { content: text, selectionStart: pos, selectionEnd: pos, changed: false }
  }

  const prefixLen = line.length - parsed.bare.length
  const offsetInBare = Math.max(0, Math.min(pos - lineStart - prefixLen, parsed.bare.length))
  const bareBefore = parsed.bare.slice(0, offsetInBare)
  const bareAfter = parsed.bare.slice(offsetInBare)

  // Item vide → désindenter d’un niveau, ou quitter la liste
  if (!parsed.bare.trim()) {
    if (parsed.indent.length >= NOTE_INDENT_UNIT.length) {
      const nextIndent = parsed.indent.slice(NOTE_INDENT_UNIT.length)
      const nextLine = formatNoteListLine({
        ...parsed,
        indent: nextIndent,
        bare: '',
        checked: false,
      })
      const next = `${text.slice(0, lineStart)}${nextLine}${text.slice(lineEnd)}`
      const caret = lineStart + nextLine.length
      return { content: next, selectionStart: caret, selectionEnd: caret, changed: true }
    }
    const next = `${text.slice(0, lineStart)}${text.slice(lineEnd)}`
    return {
      content: next,
      selectionStart: lineStart,
      selectionEnd: lineStart,
      changed: true,
    }
  }

  const firstLine = formatNoteListLine({
    ...parsed,
    bare: bareBefore,
  })
  const secondLine = formatNoteListLine({
    ...parsed,
    bare: bareAfter,
    number: parsed.type === 'number' ? (parsed.number || 1) + 1 : parsed.number,
    checked: false,
  })
  const next = `${text.slice(0, lineStart)}${firstLine}\n${secondLine}${text.slice(lineEnd)}`
  const caret = lineStart + firstLine.length + 1 + (secondLine.length - bareAfter.length)
  return { content: next, selectionStart: caret, selectionEnd: caret, changed: true }
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
