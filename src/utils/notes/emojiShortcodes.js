import { FRENCH_EMOJI_DATA } from '../../composables/useEmojiPickerElement.js'

/** @type {Map<string, string> | null} */
let shortcodeMap = null
/** @type {Promise<Map<string, string>> | null} */
let loadPromise = null

/**
 * Charge le mapping shortcode → emoji (données FR emojibase).
 * @returns {Promise<Map<string, string>>}
 */
export async function loadEmojiShortcodeMap() {
  if (shortcodeMap) return shortcodeMap
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    const map = new Map()
    try {
      const response = await fetch(FRENCH_EMOJI_DATA)
      if (!response.ok) throw new Error(`emoji data ${response.status}`)
      const data = await response.json()
      const rows = Array.isArray(data) ? data : []
      for (const row of rows) {
        const emoji = String(row?.emoji ?? row?.unicode ?? '').trim()
        if (!emoji) continue
        const codes = Array.isArray(row?.shortcodes) ? row.shortcodes : []
        for (const code of codes) {
          const key = String(code ?? '')
            .trim()
            .toLowerCase()
            .replace(/^:+|:+$/g, '')
          if (key) map.set(key, emoji)
        }
        // Annotation FR parfois utile (ex. « visage souriant »)
        const annotation = String(row?.annotation ?? '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '_')
        if (annotation && !map.has(annotation)) map.set(annotation, emoji)
      }
    } catch (err) {
      console.warn('loadEmojiShortcodeMap:', err)
    }

    // Alias FR courants si absents du jeu de shortcodes
    const aliases = {
      sourire: '😊',
      smile: '😊',
      coeur: '❤️',
      heart: '❤️',
      feu: '🔥',
      fire: '🔥',
      ok: '👌',
      check: '✅',
      idee: '💡',
      idea: '💡',
      star: '⭐',
      etoile: '⭐',
      pouce: '👍',
      thumbsup: '👍',
    }
    for (const [key, emoji] of Object.entries(aliases)) {
      if (!map.has(key)) map.set(key, emoji)
    }

    shortcodeMap = map
    return map
  })()

  return loadPromise
}

/**
 * Remplace les shortcodes :nom: terminés (juste avant le caret) par l’emoji.
 * @param {string} content
 * @param {number} caret
 * @param {Map<string, string>} map
 * @returns {{ content: string, caret: number, changed: boolean }}
 */
export function expandEmojiShortcodeAtCaret(content, caret, map) {
  const text = String(content ?? '')
  const pos = Math.max(0, Math.min(Number(caret) || 0, text.length))
  const before = text.slice(0, pos)

  // :shortcode: immédiatement avant le caret (shortcode déjà fermé)
  const match = before.match(/:([a-z0-9_+-]+):$/i)
  if (!match) {
    return { content: text, caret: pos, changed: false }
  }

  const key = match[1].toLowerCase()
  const emoji = map?.get(key)
  if (!emoji) {
    return { content: text, caret: pos, changed: false }
  }

  // Ne pas expandre dans un bloc de code non fermé (heuristique simple)
  const fenceCount = (before.match(/```/g) || []).length
  if (fenceCount % 2 === 1) {
    return { content: text, caret: pos, changed: false }
  }

  const start = pos - match[0].length
  const next = `${text.slice(0, start)}${emoji}${text.slice(pos)}`
  return {
    content: next,
    caret: start + emoji.length,
    changed: true,
  }
}
