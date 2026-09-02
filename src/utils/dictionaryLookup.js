import { dictionaryWordTypeAbbr } from '../constants/dictionaryWordTypes.js'

/** @typedef {{ entryId: string, word: string, definition: string, wordType: string, surface: string, isAlias: boolean }} DictionaryLookupHit */

const WORD_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu

/**
 * @param {string} value
 */
export function normalizeDictionarySurface(value) {
  return String(value ?? '').trim().toLocaleLowerCase('fr')
}

/**
 * @param {{ id: string, word: string, definition: string, word_type: string }[]} entries
 * @param {{ entry_id: string, alias: string }[]} aliases
 * @returns {Map<string, DictionaryLookupHit>}
 */
export function buildDictionaryLookup(entries = [], aliases = []) {
  /** @type {Map<string, DictionaryLookupHit>} */
  const map = new Map()

  for (const entry of entries) {
    const key = normalizeDictionarySurface(entry?.word)
    if (!key) continue
    map.set(key, {
      entryId: entry.id,
      word: entry.word,
      definition: entry.definition,
      wordType: entry.word_type,
      surface: entry.word,
      isAlias: false,
    })
  }

  for (const alias of aliases) {
    const key = normalizeDictionarySurface(alias?.alias)
    if (!key || map.has(key)) continue
    const entry = entries.find((item) => item.id === alias.entry_id)
    if (!entry) continue
    map.set(key, {
      entryId: entry.id,
      word: entry.word,
      definition: entry.definition,
      wordType: entry.word_type,
      surface: alias.alias,
      isAlias: true,
    })
  }

  return map
}

/**
 * @param {string} text
 * @param {Map<string, DictionaryLookupHit>} lookup
 */
function splitTextByDictionaryTerms(text, lookup) {
  /** @type {Array<{ type: 'text', value: string } | { type: 'term', surface: string, hit: DictionaryLookupHit }>} */
  const parts = []
  let last = 0

  WORD_RE.lastIndex = 0
  let match = WORD_RE.exec(text)
  while (match) {
    const surface = match[0]
    const start = match.index
    const hit = lookup.get(normalizeDictionarySurface(surface))

    if (start > last) {
      parts.push({ type: 'text', value: text.slice(last, start) })
    }

    if (hit) {
      parts.push({ type: 'term', surface, hit })
    } else {
      parts.push({ type: 'text', value: surface })
    }

    last = start + surface.length
    match = WORD_RE.exec(text)
  }

  if (last < text.length) {
    parts.push({ type: 'text', value: text.slice(last) })
  }

  return parts
}

const SKIP_TAGS = new Set(['A', 'CODE', 'PRE', 'SCRIPT', 'STYLE', 'TEXTAREA'])

/**
 * Surligne les mots connus du dictionnaire dans un fragment HTML déjà sécurisé.
 * @param {string} html
 * @param {Map<string, DictionaryLookupHit>} lookup
 */
export function annotateHtmlWithDictionary(html, lookup) {
  const raw = String(html ?? '').trim()
  if (!raw || !lookup?.size) return raw

  const doc = new DOMParser().parseFromString(`<div id="dict-root">${raw}</div>`, 'text/html')
  const root = doc.getElementById('dict-root')
  if (!root) return raw

  function processNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentElement
      if (!parent || SKIP_TAGS.has(parent.tagName)) return
      if (parent.classList?.contains('notes-dict-term')) return

      const text = node.textContent ?? ''
      const parts = splitTextByDictionaryTerms(text, lookup)
      if (parts.length === 1 && parts[0].type === 'text') return

      const frag = doc.createDocumentFragment()
      for (const part of parts) {
        if (part.type === 'text') {
          frag.appendChild(doc.createTextNode(part.value))
          continue
        }
        const span = doc.createElement('span')
        span.className = 'notes-dict-term'
        span.setAttribute('data-dict-id', part.hit.entryId)
        span.setAttribute('data-dict-word', part.hit.word)
        if (part.hit.isAlias) {
          span.setAttribute('data-dict-alias', part.surface)
        }
        span.textContent = part.surface
        frag.appendChild(span)
      }
      parent.replaceChild(frag, node)
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return
    if (SKIP_TAGS.has(node.tagName)) return
    ;[...node.childNodes].forEach(processNode)
  }

  ;[...root.childNodes].forEach(processNode)
  return root.innerHTML
}

/**
 * @param {DictionaryLookupHit} hit
 */
export function formatDictionaryTooltip(hit) {
  const type = dictionaryWordTypeAbbr(hit.wordType)
  const head = type ? `${hit.word} (${type})` : hit.word
  if (hit.isAlias && normalizeDictionarySurface(hit.surface) !== normalizeDictionarySurface(hit.word)) {
    return `${head}\n↳ forme : ${hit.surface}\n\n${hit.definition}`
  }
  return `${head}\n\n${hit.definition}`
}

/**
 * @param {string} selected
 * @param {Map<string, DictionaryLookupHit>} lookup
 */
export function lookupDictionarySelection(selected, lookup) {
  const trimmed = String(selected ?? '').trim()
  if (!trimmed) return null
  return lookup.get(normalizeDictionarySurface(trimmed)) ?? null
}
