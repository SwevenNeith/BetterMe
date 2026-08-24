import { isDictionaryWordType } from '../constants/dictionaryWordTypes.js'

export const DICTIONARY_LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']
export const DICTIONARY_INDEX_KEYS = [...DICTIONARY_LETTERS, '#']

/**
 * Lettre d’indexation (accents ignorés). Les chiffres / symboles vont dans « # ».
 * @param {string} word
 */
export function dictionaryLetter(word) {
  const first = String(word ?? '')
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .charAt(0)
    .toUpperCase()

  if (first >= 'A' && first <= 'Z') return first
  return '#'
}

export function normalizeDictionaryLetter(value) {
  const key = String(value ?? '').trim().toUpperCase()
  if (DICTIONARY_INDEX_KEYS.includes(key)) return key
  return 'A'
}

export function compareDictionaryWords(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), 'fr', {
    sensitivity: 'base',
    numeric: true,
  })
}

export function sortDictionaryEntries(entries) {
  return [...(entries ?? [])].sort((left, right) => {
    const byWord = compareDictionaryWords(left?.word, right?.word)
    if (byWord !== 0) return byWord
    return compareDictionaryWords(left?.word_type, right?.word_type)
  })
}

export function entriesForLetter(entries, letter) {
  const key = normalizeDictionaryLetter(letter)
  return sortDictionaryEntries((entries ?? []).filter((entry) => dictionaryLetter(entry.word) === key))
}

export function letterCounts(entries) {
  /** @type {Record<string, number>} */
  const counts = Object.fromEntries(DICTIONARY_INDEX_KEYS.map((key) => [key, 0]))
  for (const entry of entries ?? []) {
    const key = dictionaryLetter(entry.word)
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

export function firstLetterWithEntries(entries) {
  const counts = letterCounts(entries)
  return DICTIONARY_INDEX_KEYS.find((key) => counts[key] > 0) ?? 'A'
}

export function emptyDictionaryForm() {
  return {
    word: '',
    word_type: 'nom_commun_masculin',
    definition: '',
  }
}

export function entryToForm(entry) {
  return {
    word: entry?.word ?? '',
    word_type: isDictionaryWordType(entry?.word_type) ? entry.word_type : 'autre',
    definition: entry?.definition ?? '',
  }
}
