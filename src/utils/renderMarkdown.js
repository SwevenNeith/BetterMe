import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: true,
})

export const NOTE_WIKILINK_PREFIX = '#note/'
export const NOTE_WIKILINK_MISSING_PREFIX = '#note-missing/'

const ALLOWED_TAGS = new Set([
  'A',
  'ABBR',
  'B',
  'BLOCKQUOTE',
  'BR',
  'CODE',
  'DEL',
  'DETAILS',
  'DIV',
  'EM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HR',
  'I',
  'IMG',
  'INPUT',
  'INS',
  'KBD',
  'LI',
  'MARK',
  'OL',
  'P',
  'PRE',
  'S',
  'SAMP',
  'SMALL',
  'SPAN',
  'STRONG',
  'SUB',
  'SUMMARY',
  'SUP',
  'TABLE',
  'TBODY',
  'TD',
  'TFOOT',
  'TH',
  'THEAD',
  'TR',
  'U',
  'UL',
])

const ALLOWED_ATTRS = {
  A: new Set(['href', 'title', 'target', 'rel', 'class']),
  IMG: new Set(['src', 'alt', 'title', 'width', 'height']),
  INPUT: new Set(['type', 'checked', 'disabled']),
  TD: new Set(['align', 'colspan', 'rowspan']),
  TH: new Set(['align', 'colspan', 'rowspan']),
  CODE: new Set(['class']),
  PRE: new Set(['class']),
  SPAN: new Set(['class']),
  DIV: new Set(['class']),
  ABBR: new Set(['title']),
}

function isSafeUrl(value, { allowDataImage = false } = {}) {
  const url = String(value ?? '').trim()
  if (!url) return false
  const lower = url.toLowerCase()
  if (lower.startsWith('https://') || lower.startsWith('http://') || lower.startsWith('mailto:')) {
    return true
  }
  if (lower.startsWith('#') || lower.startsWith('/')) return true
  if (allowDataImage && /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(url)) {
    return true
  }
  return false
}

function isInternalNoteHref(href) {
  const value = String(href ?? '')
  return value.startsWith(NOTE_WIKILINK_PREFIX) || value.startsWith(NOTE_WIKILINK_MISSING_PREFIX)
}

/**
 * Sanitize un fragment HTML issu du rendu Markdown.
 * @param {string} html
 */
export function sanitizeMarkdownHtml(html) {
  const raw = String(html ?? '').trim()
  if (!raw) return ''

  const template = document.createElement('template')
  template.innerHTML = raw

  function clean(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    if (node.nodeType !== Node.ELEMENT_NODE) return ''

    const tag = node.tagName
    if (!ALLOWED_TAGS.has(tag)) {
      return [...node.childNodes].map(clean).join('')
    }

    if (tag === 'INPUT') {
      const type = String(node.getAttribute('type') ?? '').toLowerCase()
      if (type !== 'checkbox') return ''
      const checked = node.hasAttribute('checked') ? ' checked' : ''
      return `<input type="checkbox" disabled${checked}>`
    }

    const allowed = ALLOWED_ATTRS[tag]
    const attrs = []
    let hrefValue = ''
    if (allowed) {
      for (const name of allowed) {
        if (!node.hasAttribute(name)) continue
        let value = node.getAttribute(name)
        if (name === 'href') {
          if (!isSafeUrl(value)) continue
          hrefValue = value
        }
        if (name === 'src' && !isSafeUrl(value, { allowDataImage: true })) continue
        if (name === 'class') {
          value = String(value)
            .split(/\s+/)
            .filter((part) => /^[a-zA-Z0-9_-]+$/.test(part))
            .join(' ')
          if (!value) continue
        }
        attrs.push(` ${name}="${String(value).replace(/"/g, '&quot;')}"`)
      }
    }

    if (tag === 'A') {
      if (isInternalNoteHref(hrefValue)) {
        if (!attrs.some((a) => a.startsWith(' class='))) {
          const cls = hrefValue.startsWith(NOTE_WIKILINK_MISSING_PREFIX)
            ? 'note-wikilink note-wikilink--missing'
            : 'note-wikilink'
          attrs.push(` class="${cls}"`)
        }
      } else {
        attrs.push(' rel="noopener noreferrer"')
        if (!attrs.some((a) => a.startsWith(' target='))) {
          attrs.push(' target="_blank"')
        }
      }
    }

    const inner = [...node.childNodes].map(clean).join('')
    if (tag === 'BR' || tag === 'HR') return `<${tag.toLowerCase()}>`
    if (tag === 'IMG') return `<img${attrs.join('')}>`

    return `<${tag.toLowerCase()}${attrs.join('')}>${inner}</${tag.toLowerCase()}>`
  }

  return [...template.content.childNodes].map(clean).join('').trim()
}

function escapeMdLinkLabel(text) {
  return String(text ?? '').replace(/[[\]]/g, '\\$&')
}

/**
 * Protège les blocs / spans de code avant transformation des wikilinks.
 * @param {string} markdown
 */
function protectCodeSegments(markdown) {
  /** @type {string[]} */
  const segments = []
  const stash = (match) => {
    const index = segments.length
    segments.push(match)
    return `\0CODE${index}\0`
  }

  let out = String(markdown ?? '')
  out = out.replace(/```[\s\S]*?```/g, stash)
  out = out.replace(/`[^`\n]+`/g, stash)
  return { text: out, segments }
}

function restoreCodeSegments(text, segments) {
  return String(text ?? '').replace(/\0CODE(\d+)\0/g, (_, index) => segments[Number(index)] ?? '')
}

/**
 * Remplace [[Titre]] et [[Titre|Alias]] par des liens internes.
 * @param {string} text
 * @param {{ id: string, title: string }[]} notes
 */
export function expandNoteWikiLinks(text, notes = []) {
  const byTitle = new Map()
  for (const note of notes) {
    const key = String(note?.title ?? '')
      .trim()
      .toLowerCase()
    if (key && !byTitle.has(key)) byTitle.set(key, note)
  }

  return String(text ?? '').replace(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g, (_, rawTitle, rawAlias) => {
    const title = String(rawTitle ?? '').trim()
    if (!title) return _
    const alias = String(rawAlias ?? title).trim() || title
    const note = byTitle.get(title.toLowerCase())
    const label = escapeMdLinkLabel(alias)
    if (note?.id) {
      return `[${label}](${NOTE_WIKILINK_PREFIX}${note.id} "${title.replace(/"/g, '')}")`
    }
    return `[${label}](${NOTE_WIKILINK_MISSING_PREFIX}${encodeURIComponent(title)} "${title.replace(/"/g, '')}")`
  })
}

/**
 * Convertit du Markdown en HTML sécurisé (avec wikilinks optionnels).
 * @param {string} markdown
 * @param {{ notes?: { id: string, title: string }[], enableWikiLinks?: boolean, breaks?: boolean }} [options]
 */
export function renderMarkdownToSafeHtml(markdown, options = {}) {
  const source = String(markdown ?? '')
  if (!source.trim()) return ''

  const { text, segments } = protectCodeSegments(source)
  const withWiki =
    options.enableWikiLinks === false
      ? text
      : expandNoteWikiLinks(text, options.notes ?? [])
  const restored = restoreCodeSegments(withWiki, segments)
  const html = marked.parse(restored, {
    gfm: true,
    breaks: options.breaks !== false,
  })
  return sanitizeMarkdownHtml(typeof html === 'string' ? html : String(html))
}

/**
 * @param {string | null | undefined} href
 * @returns {{ kind: 'note', noteId: string } | { kind: 'missing', title: string } | null}
 */
export function parseNoteWikiHref(href) {
  const value = String(href ?? '')
  if (value.startsWith(NOTE_WIKILINK_PREFIX)) {
    const noteId = value.slice(NOTE_WIKILINK_PREFIX.length).split(/[?#]/)[0]
    return noteId ? { kind: 'note', noteId } : null
  }
  if (value.startsWith(NOTE_WIKILINK_MISSING_PREFIX)) {
    const encoded = value.slice(NOTE_WIKILINK_MISSING_PREFIX.length).split(/[?#]/)[0]
    try {
      return { kind: 'missing', title: decodeURIComponent(encoded) }
    } catch {
      return { kind: 'missing', title: encoded }
    }
  }
  return null
}
