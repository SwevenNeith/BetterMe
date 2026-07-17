function parseTagsLocal(raw) {
  return String(raw ?? '')
    .split(/[,;]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}

export function getBookGenre(book) {
  return book?.tags?.[0] ?? ''
}

export function getBookExtraTags(book) {
  return (book?.tags ?? []).slice(1)
}

export function formatExtraTagsInput(book) {
  return getBookExtraTags(book).join(', ')
}

export function buildTagsFromGenreAndExtra(genre, extraRaw) {
  const g = String(genre ?? '').trim()
  const extra = Array.isArray(extraRaw)
    ? extraRaw.map((t) => String(t).trim()).filter(Boolean)
    : parseTagsLocal(extraRaw)
  if (!g) return extra
  return [g, ...extra.filter((t) => t !== g)]
}

export function emptyBookForm() {
  return {
    title: '',
    author: '',
    collection: '',
    isSaga: false,
    dateStart: '',
    dateEnd: '',
    rating: null,
    genre: '',
    extraTags: '',
    pages: '',
    publicationYear: '',
    comments: '',
    quote: '',
    spoil: '',
    imageMode: 'upload',
    imageUrl: '',
  }
}

export function bookToEditForm(book) {
  return {
    title: book?.title ?? '',
    author: book?.author ?? '',
    collection: book?.collection ?? '',
    isSaga: Boolean(book?.is_saga),
    dateStart: book?.date_start ?? '',
    dateEnd: book?.date_end ?? '',
    rating: book?.rating ?? null,
    genre: getBookGenre(book),
    extraTags: formatExtraTagsInput(book),
    pages: book?.pages ?? '',
    publicationYear: book?.publication_year ?? '',
    comments: book?.comments ?? '',
    quote: book?.quote ?? '',
    spoil: book?.spoil ?? '',
    imageMode: 'keep',
    imageUrl: '',
  }
}

function parseOptionalInt(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return null
  const num = Number.parseInt(trimmed, 10)
  return Number.isFinite(num) ? num : null
}

function parseOptionalRating(value) {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0 || num > 5) return null
  return Math.round(num * 2) / 2
}

function parseOptionalDate(value) {
  const trimmed = String(value ?? '').trim()
  return trimmed || null
}

export function formToBookPayload(form) {
  return {
    title: String(form?.title ?? '').trim(),
    author: String(form?.author ?? '').trim(),
    collection: String(form?.collection ?? '').trim(),
    isSaga: Boolean(form?.isSaga),
    dateStart: parseOptionalDate(form?.dateStart),
    dateEnd: parseOptionalDate(form?.dateEnd),
    rating: parseOptionalRating(form?.rating),
    genre: String(form?.genre ?? '').trim(),
    extraTags: form?.extraTags ?? '',
    pages: parseOptionalInt(form?.pages),
    publicationYear: parseOptionalInt(form?.publicationYear),
    comments: String(form?.comments ?? '').trim(),
    quote: String(form?.quote ?? '').trim(),
    spoil: String(form?.spoil ?? '').trim(),
  }
}

export function formatFrenchDate(isoDate) {
  if (!isoDate) return '—'
  try {
    const [y, m, d] = String(isoDate).split('-').map(Number)
    if (!y || !m || !d) return isoDate
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(y, m - 1, d))
  } catch {
    return isoDate
  }
}

export function formatRatingLabel(rating) {
  if (rating === null || rating === undefined || rating === '') return '—'
  const num = Number(rating)
  if (!Number.isFinite(num)) return '—'
  return Number.isInteger(num) ? `${num}/5` : `${num.toFixed(1).replace('.0', '')}/5`
}
