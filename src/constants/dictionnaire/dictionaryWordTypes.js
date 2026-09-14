/** Types grammaticaux d’une entrée du dictionnaire. */
export const DICTIONARY_WORD_TYPES = [
  { id: 'nom_commun_masculin', label: 'Nom commun (masculin)', abbr: 'n.m.' },
  { id: 'nom_commun_feminin', label: 'Nom commun (féminin)', abbr: 'n.f.' },
  { id: 'nom_propre', label: 'Nom propre', abbr: 'n.pr.' },
  { id: 'verbe', label: 'Verbe', abbr: 'v.' },
  { id: 'adjectif', label: 'Adjectif', abbr: 'adj.' },
  { id: 'adverbe', label: 'Adverbe', abbr: 'adv.' },
  { id: 'pronom', label: 'Pronom', abbr: 'pron.' },
  { id: 'determinant', label: 'Déterminant', abbr: 'dét.' },
  { id: 'preposition', label: 'Préposition', abbr: 'prép.' },
  { id: 'conjonction', label: 'Conjonction', abbr: 'conj.' },
  { id: 'interjection', label: 'Interjection', abbr: 'interj.' },
  { id: 'locution', label: 'Locution', abbr: 'loc.' },
  { id: 'autre', label: 'Autre', abbr: '' },
]

export const DICTIONARY_WORD_TYPE_IDS = DICTIONARY_WORD_TYPES.map((item) => item.id)

const BY_ID = Object.fromEntries(DICTIONARY_WORD_TYPES.map((item) => [item.id, item]))

export function getDictionaryWordType(id) {
  return BY_ID[id] ?? null
}

export function dictionaryWordTypeLabel(id) {
  return BY_ID[id]?.label ?? 'Type inconnu'
}

export function dictionaryWordTypeAbbr(id) {
  return BY_ID[id]?.abbr ?? ''
}

export function isDictionaryWordType(id) {
  return Boolean(BY_ID[id])
}
