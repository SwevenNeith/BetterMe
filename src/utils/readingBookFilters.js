import { getBookExtraTags, getBookGenre } from './readingBookForm.js'

export const READING_FILTER_FIELDS = {
  collection: { id: 'collection', label: 'Collection' },
  title: { id: 'title', label: 'Titre' },
  author: { id: 'author', label: 'Auteur' },
  genre: { id: 'genre', label: 'Genre' },
  keyword: { id: 'keyword', label: 'Mot-clé' },
  notes: { id: 'notes', label: 'Notes' },
  series: { id: 'series', label: 'Série' },
  pages: { id: 'pages', label: 'Pages' },
}

const TEXT_OPERATORS = [
  { id: 'contains', label: 'contient', needsValue: 'text' },
  { id: 'is', label: 'est', needsValue: 'text' },
  { id: 'is_not', label: "n'est pas", needsValue: 'text' },
  { id: 'is_empty', label: 'est vide', needsValue: false },
  { id: 'is_not_empty', label: "n'est pas vide", needsValue: false },
]

export const READING_FILTER_OPERATORS = {
  collection: [
    { id: 'is', label: 'est', needsValue: 'select' },
    { id: 'is_not', label: "n'est pas", needsValue: 'select' },
    { id: 'is_empty', label: 'est vide', needsValue: false },
    { id: 'is_not_empty', label: "n'est pas vide", needsValue: false },
  ],
  title: TEXT_OPERATORS,
  author: TEXT_OPERATORS,
  genre: TEXT_OPERATORS,
  keyword: [{ id: 'has_at_least', label: 'contient au moins', needsValue: 'text' }],
  notes: [
    { id: 'is_not_empty', label: "n'est pas vide", needsValue: false },
    { id: 'is_empty', label: 'est vide', needsValue: false },
    { id: 'contains', label: 'contient', needsValue: 'text' },
  ],
  series: [
    { id: 'is_yes', label: 'est une série', needsValue: false },
    { id: 'is_no', label: "n'est pas une série", needsValue: false },
  ],
  pages: [
    { id: 'between', label: 'entre', needsValue: 'range' },
    { id: 'is_empty', label: 'est vide', needsValue: false },
    { id: 'is_not_empty', label: "n'est pas vide", needsValue: false },
  ],
}

let filterIdSeq = 0

function nextFilterId() {
  filterIdSeq += 1
  return `reading-filter-${filterIdSeq}`
}

function defaultValueFor(field, operator, collections = []) {
  const meta = getOperatorMeta(field, operator)
  if (!meta?.needsValue) return ''
  if (meta.needsValue === 'select') return String(collections[0]?.name ?? '')
  return ''
}

/**
 * @param {keyof typeof READING_FILTER_FIELDS} [field]
 * @param {{ name: string }[]} [collections]
 */
export function createReadingBookFilter(field = 'collection', collections = []) {
  const operators = READING_FILTER_OPERATORS[field] ?? []
  const operator = operators[0]?.id ?? 'is'

  return {
    id: nextFilterId(),
    field,
    operator,
    value: defaultValueFor(field, operator, collections),
    valueTo: '',
  }
}

/**
 * @param {string} field
 */
export function getOperatorsForField(field) {
  return READING_FILTER_OPERATORS[field] ?? []
}

/**
 * @param {string} field
 * @param {string} operatorId
 */
export function getOperatorMeta(field, operatorId) {
  return getOperatorsForField(field).find((operator) => operator.id === operatorId)
}

/**
 * @param {{ field: string, operator: string, value: string, valueTo?: string }} filter
 * @param {{ name: string }[]} [collections]
 */
export function resetFilterForFieldChange(filter, collections = []) {
  const operators = getOperatorsForField(filter.field)
  filter.operator = operators[0]?.id ?? 'is'
  filter.value = defaultValueFor(filter.field, filter.operator, collections)
  filter.valueTo = ''
}

/**
 * @param {{ field: string, operator: string, value: string, valueTo?: string }} filter
 * @param {{ needsValue?: false | 'select' | 'text' | 'range' }} operator
 * @param {{ name: string }[]} [collections]
 */
export function resetFilterForOperatorChange(filter, operator, collections = []) {
  if (!operator.needsValue) {
    filter.value = ''
    filter.valueTo = ''
    return
  }

  if (operator.needsValue === 'select') {
    const current = String(filter.value ?? '').trim()
    filter.value = current || String(collections[0]?.name ?? '')
    filter.valueTo = ''
    return
  }

  if (operator.needsValue === 'range') {
    filter.value = filter.value ?? ''
    filter.valueTo = filter.valueTo ?? ''
    return
  }

  filter.value = filter.value ?? ''
  filter.valueTo = ''
}

function matchTextField(text, operator, query) {
  const value = String(text ?? '').trim()
  const q = String(query ?? '').trim().toLowerCase()

  switch (operator) {
    case 'contains':
      return q ? value.toLowerCase().includes(q) : true
    case 'is':
      return value.toLowerCase() === q
    case 'is_not':
      return value.toLowerCase() !== q
    case 'is_empty':
      return !value
    case 'is_not_empty':
      return Boolean(value)
    default:
      return true
  }
}

function parseOptionalNumber(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return null
  const num = Number.parseInt(trimmed, 10)
  return Number.isFinite(num) ? num : null
}

/**
 * @param {{ field: string, operator: string, value: string, valueTo?: string }} filter
 */
export function formatReadingFilterLabel(filter) {
  const fieldLabel = READING_FILTER_FIELDS[filter.field]?.label ?? filter.field
  const operator = getOperatorMeta(filter.field, filter.operator)
  const operatorLabel = operator?.label ?? filter.operator

  if (filter.field === 'pages' && filter.operator === 'between') {
    const min = String(filter.value ?? '').trim()
    const max = String(filter.valueTo ?? '').trim()
    if (min && max) return `${fieldLabel} entre ${min} et ${max}`
    return `${fieldLabel} entre…`
  }

  if (!operator?.needsValue) {
    return `${fieldLabel} ${operatorLabel}`
  }

  const value = String(filter.value ?? '').trim()
  if (filter.operator === 'contains' || filter.operator === 'has_at_least') {
    return value ? `${fieldLabel} ${operatorLabel} « ${value} »` : `${fieldLabel} ${operatorLabel}…`
  }

  return value ? `${fieldLabel} ${operatorLabel} ${value}` : `${fieldLabel} ${operatorLabel}…`
}

/**
 * @param {Record<string, unknown>} book
 * @param {{ field: string, operator: string, value: string, valueTo?: string }} filter
 */
export function bookMatchesReadingFilter(book, filter) {
  if (filter.field === 'collection') {
    const collection = String(book.collection ?? '').trim()
    const target = String(filter.value ?? '').trim()

    switch (filter.operator) {
      case 'is':
        return collection.toLowerCase() === target.toLowerCase()
      case 'is_not':
        return collection.toLowerCase() !== target.toLowerCase()
      case 'is_empty':
        return !collection
      case 'is_not_empty':
        return Boolean(collection)
      default:
        return true
    }
  }

  if (filter.field === 'title') {
    return matchTextField(book.title, filter.operator, filter.value)
  }

  if (filter.field === 'author') {
    return matchTextField(book.author, filter.operator, filter.value)
  }

  if (filter.field === 'genre') {
    return matchTextField(getBookGenre(book), filter.operator, filter.value)
  }

  if (filter.field === 'keyword') {
    const query = String(filter.value ?? '').trim().toLowerCase()
    const keywords = getBookExtraTags(book).map((tag) => String(tag).trim().toLowerCase())

    if (filter.operator === 'has_at_least') {
      if (!query) return true
      return keywords.some((tag) => tag === query || tag.includes(query))
    }

    return true
  }

  if (filter.field === 'notes') {
    return matchTextField(book.comments, filter.operator, filter.value)
  }

  if (filter.field === 'series') {
    const isSeries = Boolean(book.is_saga)
    if (filter.operator === 'is_yes') return isSeries
    if (filter.operator === 'is_no') return !isSeries
    return true
  }

  if (filter.field === 'pages') {
    const pages = book.pages

    switch (filter.operator) {
      case 'is_empty':
        return pages === null || pages === undefined || pages === ''
      case 'is_not_empty':
        return pages !== null && pages !== undefined && pages !== ''
      case 'between': {
        const min = parseOptionalNumber(filter.value)
        const max = parseOptionalNumber(filter.valueTo)
        if (min === null || max === null) return true
        const count = parseOptionalNumber(pages)
        if (count === null) return false
        return count >= min && count <= max
      }
      default:
        return true
    }
  }

  return true
}

/**
 * @param {Record<string, unknown>[]} books
 * @param {{ field: string, operator: string, value: string, valueTo?: string }[]} filters
 */
export function applyReadingBookFilters(books, filters) {
  if (!filters?.length) return books
  return books.filter((book) => filters.every((filter) => bookMatchesReadingFilter(book, filter)))
}
