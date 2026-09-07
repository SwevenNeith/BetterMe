/**
 * Synchro curseur éditeur → aperçu (mode Split).
 */

/**
 * @param {string} line
 */
function normalizeSearchNeedle(line) {
  return String(line ?? '')
    .trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s?/, '')
    .replace(/^([-*+]|\d+[.)])\s+/, '')
    .replace(/^\[[ xX]\]\s+/, '')
    .replace(/^```.*/, '')
    .replace(/[*_`~]+/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim()
}

/**
 * @param {HTMLTextAreaElement} textarea
 */
export function getTextareaCursorLineInfo(textarea) {
  const value = String(textarea?.value ?? '')
  const pos = Number(textarea?.selectionStart ?? 0)
  const before = value.slice(0, Math.max(0, pos))
  const lineIndex = before.length === 0 ? 0 : before.split('\n').length - 1
  const lines = value.length ? value.split('\n') : ['']
  return {
    lineIndex,
    lineCount: Math.max(lines.length, 1),
    lineText: lines[lineIndex] ?? '',
    pos,
  }
}

/**
 * @param {ParentNode} preview
 * @param {string} lineText
 * @returns {HTMLElement | null}
 */
export function findPreviewElementForLine(preview, lineText) {
  const needle = normalizeSearchNeedle(lineText)
  if (needle.length < 2 || !preview) return null

  const probe = needle.slice(0, Math.min(needle.length, 48))
  const walker = document.createTreeWalker(preview, NodeFilter.SHOW_TEXT)
  /** @type {Node | null} */
  let node = walker.nextNode()
  while (node) {
    const text = node.textContent ?? ''
    if (text.includes(probe)) {
      const el = node.parentElement
      if (el && !el.closest('.notes-html-widget')) return el
    }
    node = walker.nextNode()
  }

  if (probe.length > 8) {
    const short = probe.slice(0, Math.max(6, Math.floor(probe.length / 2)))
    const walker2 = document.createTreeWalker(preview, NodeFilter.SHOW_TEXT)
    node = walker2.nextNode()
    while (node) {
      const text = node.textContent ?? ''
      if (text.includes(short)) {
        const el = node.parentElement
        if (el && !el.closest('.notes-html-widget')) return el
      }
      node = walker2.nextNode()
    }
  }

  return null
}

/**
 * Fait défiler l’aperçu vers la zone correspondant au curseur de l’éditeur.
 * @param {HTMLTextAreaElement | null | undefined} editor
 * @param {HTMLElement | null | undefined} preview
 * @param {{ behavior?: ScrollBehavior }} [options]
 * @returns {boolean}
 */
export function scrollPreviewToEditorCursor(editor, preview, options = {}) {
  if (!editor || !preview) return false

  const behavior = options.behavior ?? 'auto'
  const { lineIndex, lineCount, lineText } = getTextareaCursorLineInfo(editor)
  const match = findPreviewElementForLine(preview, lineText)

  if (match) {
    const previewRect = preview.getBoundingClientRect()
    const matchRect = match.getBoundingClientRect()
    const absoluteTop = matchRect.top - previewRect.top + preview.scrollTop
    const target = Math.max(0, absoluteTop - preview.clientHeight * 0.28)
    preview.scrollTo({ top: target, behavior })
    return true
  }

  const max = preview.scrollHeight - preview.clientHeight
  if (max <= 0) {
    preview.scrollTop = 0
    return true
  }

  const ratio = lineCount <= 1 ? 0 : lineIndex / (lineCount - 1)
  preview.scrollTo({ top: ratio * max, behavior })
  return true
}
