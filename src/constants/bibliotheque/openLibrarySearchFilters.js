/** Options de filtres pour la recherche catalogue Open Library. */

export const OPEN_LIBRARY_LANGUAGE_OPTIONS = [
  { id: 'any', label: 'Toutes les langues' },
  { id: 'fre', label: 'Français' },
  { id: 'eng', label: 'Anglais' },
  { id: 'spa', label: 'Espagnol' },
  { id: 'ger', label: 'Allemand' },
  { id: 'ita', label: 'Italien' },
  { id: 'por', label: 'Portugais' },
  { id: 'dut', label: 'Néerlandais' },
  { id: 'rus', label: 'Russe' },
  { id: 'jpn', label: 'Japonais' },
  { id: 'chi', label: 'Chinois' },
  { id: 'ara', label: 'Arabe' },
]

export const OPEN_LIBRARY_SORT_OPTIONS = [
  { id: '', label: 'Pertinence' },
  { id: 'new', label: 'Nouveautés (éditions récentes)' },
  { id: 'old', label: 'Plus anciennes' },
  { id: 'rating', label: 'Mieux notés' },
  { id: 'readinglog', label: 'Les plus lus' },
  { id: 'want_to_read_count', label: 'Envie de lire' },
  { id: 'already_read_count', label: 'Déjà lus' },
  { id: 'title', label: 'Titre A → Z' },
  { id: 'random', label: 'Aléatoire' },
]

export const OPEN_LIBRARY_EBOOK_OPTIONS = [
  { id: '', label: 'Tous les livres' },
  { id: 'public', label: 'E-book libre' },
  { id: 'borrowable', label: 'Empruntable' },
  { id: 'printdisabled', label: 'E-book (impression désactivée)' },
]

export function createDefaultOpenLibrarySearchFilters() {
  return {
    language: 'eng',
    sort: '',
    yearFrom: '',
    yearTo: '',
    subject: '',
    author: '',
    hasFulltext: false,
    ebookAccess: '',
  }
}

export function openLibrarySearchFiltersActive(filters) {
  if (!filters) return false
  return Boolean(
    (filters.language && filters.language !== 'any' && filters.language !== 'eng') ||
      filters.sort ||
      String(filters.yearFrom ?? '').trim() ||
      String(filters.yearTo ?? '').trim() ||
      String(filters.subject ?? '').trim() ||
      String(filters.author ?? '').trim() ||
      filters.hasFulltext ||
      filters.ebookAccess,
  )
}
