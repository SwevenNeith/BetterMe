/**
 * Utilitaires table des matières (Markdown headings).
 */

export function plainHeadingText(raw) {
  return String(raw ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * @param {string} text
 * @param {Map<string, number>} counts
 */
export function slugifyHeadingId(text, counts = new Map()) {
  let base = plainHeadingText(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!base) base = 'section'

  const next = (counts.get(base) || 0) + 1
  counts.set(base, next)
  return next === 1 ? base : `${base}-${next}`
}

/**
 * Extrait les titres Markdown (hors blocs de code).
 * @param {string} markdown
 * @returns {{ level: number, text: string, id: string, lineIndex: number }[]}
 */
export function extractMarkdownHeadings(markdown) {
  const lines = String(markdown ?? '').split('\n')
  const headings = []
  const counts = new Map()
  let inFence = false

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const trimmed = line.trim()
    if (/^(`{3,}|~{3,})/.test(trimmed)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!match) continue

    const level = match[1].length
    const text = plainHeadingText(match[2])
    if (!text) continue

    headings.push({
      level,
      text,
      id: slugifyHeadingId(text, counts),
      lineIndex: i,
    })
  }

  return headings
}

/**
 * @param {{ level: number, text: string, id: string, lineIndex?: number }[]} flat
 * @returns {Array<{ level: number, text: string, id: string, lineIndex?: number, children: any[] }>}
 */
export function buildHeadingTree(flat) {
  const root = []
  /** @type {{ node: any, level: number }[]} */
  const stack = []

  for (const heading of flat ?? []) {
    const node = { ...heading, children: [] }
    while (stack.length && stack[stack.length - 1].level >= node.level) {
      stack.pop()
    }
    if (!stack.length) {
      root.push(node)
    } else {
      stack[stack.length - 1].node.children.push(node)
    }
    stack.push({ node, level: node.level })
  }

  return root
}

/**
 * Injecte des `id` stables sur les balises h1–h6 (même algo que extractMarkdownHeadings).
 * @param {string} html
 */
export function injectHeadingIdsIntoHtml(html) {
  const raw = String(html ?? '')
  if (!raw.trim() || typeof document === 'undefined') return raw

  const template = document.createElement('template')
  template.innerHTML = raw
  const counts = new Map()
  template.content.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((el) => {
    const id = slugifyHeadingId(el.textContent || '', counts)
    el.setAttribute('id', id)
  })
  return template.innerHTML
}
