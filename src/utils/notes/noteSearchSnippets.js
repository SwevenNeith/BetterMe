/**
 * Extrait des extraits de contexte autour des occurrences d’une requête dans une note.
 * @param {string} content
 * @param {string} query
 * @param {{ limit?: number, radius?: number }} [options]
 * @returns {{ text: string, start: number, end: number }[]}
 */
export function extractNoteSearchSnippets(content, query, options = {}) {
  const q = String(query ?? '').trim()
  if (!q) return []

  // Normalise seulement CRLF → LF pour des indices stables (longueur inchangée hors \r).
  const text = String(content ?? '').replace(/\r\n/g, '\n')
  if (!text) return []

  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  const limit = Math.max(1, Number(options.limit) || 3)
  const radius = Math.max(12, Number(options.radius) || 42)

  /** @type {{ text: string, start: number, end: number }[]} */
  const snippets = []
  let from = 0

  while (snippets.length < limit) {
    const index = lower.indexOf(needle, from)
    if (index < 0) break

    const matchEnd = index + needle.length
    let start = Math.max(0, index - radius)
    let end = Math.min(text.length, matchEnd + radius)

    if (start > 0) {
      const space = text.lastIndexOf(' ', index)
      const nl = text.lastIndexOf('\n', index)
      const boundary = Math.max(space, nl)
      if (boundary >= start - 8 && boundary < index) start = boundary + 1
    }
    if (end < text.length) {
      const space = text.indexOf(' ', matchEnd)
      const nl = text.indexOf('\n', matchEnd)
      const candidates = [space, nl].filter((v) => v >= 0)
      const boundary = candidates.length ? Math.min(...candidates) : -1
      if (boundary > index && boundary <= end + 8) end = boundary
    }

    let slice = text.slice(start, end).replace(/\s+/g, ' ').trim()
    if (start > 0) slice = `…${slice}`
    if (end < text.length) slice = `${slice}…`

    if (slice && !snippets.some((entry) => entry.start === index)) {
      snippets.push({
        text: slice,
        start: index,
        end: matchEnd,
      })
    }
    from = index + Math.max(1, needle.length)
  }

  return snippets
}

/**
 * Repère une occurrence dans le contenu actuel (au cas où le texte a un peu bougé).
 * @param {string} content
 * @param {string} query
 * @param {number} preferredStart
 * @returns {{ start: number, end: number } | null}
 */
export function resolveSearchOccurrence(content, query, preferredStart) {
  const text = String(content ?? '').replace(/\r\n/g, '\n')
  const needle = String(query ?? '').trim()
  if (!text || !needle) return null

  const lower = text.toLowerCase()
  const q = needle.toLowerCase()
  const preferred = Math.max(0, Number(preferredStart) || 0)

  if (lower.slice(preferred, preferred + q.length) === q) {
    return { start: preferred, end: preferred + q.length }
  }

  // Cherche l’occurrence la plus proche de la position mémorisée
  let best = null
  let bestDist = Infinity
  let from = 0
  while (from < lower.length) {
    const index = lower.indexOf(q, from)
    if (index < 0) break
    const dist = Math.abs(index - preferred)
    if (dist < bestDist) {
      bestDist = dist
      best = { start: index, end: index + q.length }
    }
    from = index + Math.max(1, q.length)
  }
  return best
}
