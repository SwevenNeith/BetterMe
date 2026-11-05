/**
 * Dictionnaire de synonymes local (Auteur).
 */

import { AUTEUR_LEMMA_HINTS, AUTEUR_THESAURUS } from '../../constants/notes/auteurThesaurus.js'
import { lightFrenchStem, normalizeWord } from './auteurText.js'

/**
 * @param {string} word
 */
export function lemmatizeForThesaurus(word) {
  const norm = normalizeWord(word)
  if (AUTEUR_LEMMA_HINTS[norm]) return AUTEUR_LEMMA_HINTS[norm]
  if (AUTEUR_THESAURUS[norm]) return norm
  const stem = lightFrenchStem(norm)
  if (AUTEUR_THESAURUS[stem]) return stem
  // Essais verbales / adjectivales simples
  for (const end of ['ait', 'ais', 'ant', 'ent', 'ons', 'ez', 'es', 'e', 's']) {
    if (norm.endsWith(end) && norm.length - end.length >= 4) {
      const base = norm.slice(0, -end.length)
      for (const cand of [base, `${base}er`, `${base}ir`, base.replace(/g$/, 'ger')]) {
        if (AUTEUR_THESAURUS[cand]) return cand
      }
    }
  }
  return norm
}

/**
 * @param {string} word
 */
export function lookupSynonyms(word) {
  const lemma = lemmatizeForThesaurus(word)
  const entry = AUTEUR_THESAURUS[lemma] || null
  const conjugated = normalizeWord(word) !== lemma
  return {
    query: word,
    lemma,
    found: Boolean(entry),
    conjugated,
    definition: entry?.definition || null,
    senses: entry?.senses || [],
    antonyms: entry?.antonyms || [],
    notice: conjugated
      ? `Forme détectée « ${word} » → base « ${lemma} ». Ré-accorde le synonyme si besoin.`
      : null,
  }
}

/**
 * Remplace en conservant la casse du mot source.
 * @param {string} original
 * @param {string} replacement
 */
export function preserveCase(original, replacement) {
  const src = String(original ?? '')
  const rep = String(replacement ?? '')
  if (!src) return rep
  if (src === src.toLocaleUpperCase('fr')) return rep.toLocaleUpperCase('fr')
  if (src[0] === src[0].toLocaleUpperCase('fr')) {
    return rep.charAt(0).toLocaleUpperCase('fr') + rep.slice(1)
  }
  return rep
}
