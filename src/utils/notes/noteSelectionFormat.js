/**
 * Helpers pour envelopper une sélection Markdown dans l’éditeur Notes.
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

  // Déjà enveloppé à l’intérieur de la sélection
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

  // Marqueurs juste autour de la sélection
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
 * @param {'bold'|'italic'|'underline'|'strike'|'highlight'|'color'} kind
 * @param {string} [color]
 */
export function formatNoteSelection(content, start, end, kind, color = '') {
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
      const hex = String(color || '#fff3a3').toLowerCase()
      return wrapOrUnwrapRange(
        content,
        start,
        end,
        `<mark style="background-color: ${hex}">`,
        '</mark>',
      )
    }
    case 'color': {
      const hex = String(color || '#000000').toLowerCase()
      return wrapOrUnwrapRange(
        content,
        start,
        end,
        `<span style="color: ${hex}">`,
        '</span>',
      )
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
 * Remplace la plage [start, end] par `replacement`.
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
