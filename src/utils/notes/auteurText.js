/**
 * Tokenisation / nettoyage texte pour les outils Auteur.
 */

/**
 * Retire balises markdown grossières pour l’analyse.
 * @param {string} md
 */
export function stripMarkdownLight(md) {
  return String(md ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>#-]+/g, ' ')
}

/**
 * Découpe en paragraphes (lignes vides).
 * @param {string} text
 */
export function splitParagraphs(text) {
  return String(text ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

/**
 * Découpe approximative en phrases.
 * @param {string} text
 */
export function splitSentences(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return []
  return raw
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Extrait les tokens mots avec offsets dans le texte source.
 * Gère l’apostrophe : « l'homme » → token « homme » (offset sur homme).
 * @param {string} text
 * @returns {{ word: string, norm: string, start: number, end: number }[]}
 */
export function tokenizeWords(text) {
  const src = String(text ?? '')
  /** @type {{ word: string, norm: string, start: number, end: number }[]} */
  const out = []
  const re = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)?/gu
  let m
  while ((m = re.exec(src))) {
    let raw = m[0]
    let start = m.index
    let end = m.index + raw.length
    // Apostrophe élidée : garder la partie après
    const apos = raw.search(/['’]/)
    if (apos >= 0 && apos < raw.length - 1) {
      const after = raw.slice(apos + 1)
      start = start + apos + 1
      raw = after
    }
    const norm = normalizeWord(raw)
    if (!norm) continue
    out.push({ word: raw, norm, start, end })
  }
  return out
}

/**
 * @param {string} word
 */
export function normalizeWord(word) {
  return String(word ?? '')
    .normalize('NFC')
    .toLocaleLowerCase('fr')
    .replace(/['’]/g, '')
}

/**
 * Stemming FR très léger (suffixes courants) pour regrouper variantes.
 * @param {string} norm
 */
export function lightFrenchStem(norm) {
  let w = normalizeWord(norm)
  if (w.length < 5) return w
  const suffixes = [
    'eraient',
    'issions',
    'issants',
    'issement',
    'ements',
    'ement',
    'aient',
    'asses',
    'asses',
    'ions',
    'iez',
    'ais',
    'ait',
    'ant',
    'ées',
    'ees',
    'és',
    'es',
    'ée',
    'ee',
    'er',
    'ir',
    're',
    'ons',
    'ez',
    'ent',
    's',
  ]
  for (const s of suffixes) {
    if (w.endsWith(s) && w.length - s.length >= 4) {
      w = w.slice(0, -s.length)
      break
    }
  }
  return w
}

/**
 * Retire les blocs de dialogue (guillemets / tirets de réplique).
 * @param {string} text
 */
export function stripDialogues(text) {
  let t = String(text ?? '')
  t = t.replace(/[«"].*?[»"]/gs, ' ')
  t = t.replace(/^[\t ]*[-–—].+$/gm, ' ')
  return t
}

/**
 * @param {string} text
 * @param {number} start
 * @param {number} end
 */
export function sliceWithContext(text, start, end, radius = 40) {
  const s = Math.max(0, start - radius)
  const e = Math.min(text.length, end + radius)
  return {
    before: text.slice(s, start),
    match: text.slice(start, end),
    after: text.slice(end, e),
  }
}
