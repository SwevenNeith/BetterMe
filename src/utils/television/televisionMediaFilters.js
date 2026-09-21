export const TELEVISION_FILTER_FIELDS = {
  mediaType: { id: 'mediaType', label: 'Type' },
  title: { id: 'title', label: 'Titre' },
  collection: { id: 'collection', label: 'Collection' },
  year: { id: 'year', label: 'Année' },
  rating: { id: 'rating', label: 'Note' },
  comments: { id: 'comments', label: 'Notes' },
}

const TEXT_OPERATORS = [
  { id: 'contains', label: 'contient', needsValue: 'text' },
  { id: 'is', label: 'est', needsValue: 'text' },
  { id: 'is_not', label: "n'est pas", needsValue: 'text' },
  { id: 'is_empty', label: 'est vide', needsValue: false },
  { id: 'is_not_empty', label: "n'est pas vide", needsValue: false },
]

export const TELEVISION_FILTER_OPERATORS = {
  mediaType: [
    { id: 'is_movie', label: 'est un film', needsValue: false },
    { id: 'is_tv', label: 'est une série', needsValue: false },
  ],
  title: TEXT_OPERATORS,
  collection: [
    { id: 'is', label: 'est', needsValue: 'select' },
    { id: 'is_not', label: "n'est pas", needsValue: 'select' },
    { id: 'is_empty', label: 'est vide', needsValue: false },
    { id: 'is_not_empty', label: "n'est pas vide", needsValue: false },
  ],
  year: [
    { id: 'between', label: 'entre', needsValue: 'range' },
    { id: 'is', label: 'est', needsValue: 'number' },
    { id: 'is_empty', label: 'est vide', needsValue: false },
    { id: 'is_not_empty', label: "n'est pas vide", needsValue: false },
  ],
  rating: [
    { id: 'between', label: 'entre', needsValue: 'range' },
    { id: 'is_empty', label: 'est vide', needsValue: false },
    { id: 'is_not_empty', label: "n'est pas vide", needsValue: false },
  ],
  comments: [
    { id: 'is_not_empty', label: "n'est pas vide", needsValue: false },
    { id: 'is_empty', label: 'est vide', needsValue: false },
    { id: 'contains', label: 'contient', needsValue: 'text' },
  ],
}

const LIBRARY_FIELDS = ['mediaType', 'title', 'collection', 'rating', 'comments']
const CATALOG_FIELDS = ['mediaType', 'title', 'year', 'rating']

let filterIdSeq = 0

function nextFilterId() {
  filterIdSeq += 1
  return `tv-filter-${filterIdSeq}`
}

/**
 * @param {'library'|'catalog'} [context]
 */
export function getTelevisionFilterFieldOptions(context = 'library') {
  const ids = context === 'catalog' ? CATALOG_FIELDS : LIBRARY_FIELDS
  return ids.map((id) => TELEVISION_FILTER_FIELDS[id]).filter(Boolean)
}

/**
 * @param {string} field
 */
export function getTelevisionOperatorsForField(field) {
  return TELEVISION_FILTER_OPERATORS[field] ?? []
}

/**
 * @param {string} field
 * @param {string} operatorId
 */
export function getTelevisionOperatorMeta(field, operatorId) {
  return getTelevisionOperatorsForField(field).find((operator) => operator.id === operatorId)
}

function defaultValueFor(field, operator, collections = []) {
  const meta = getTelevisionOperatorMeta(field, operator)
  if (!meta?.needsValue) return ''
  if (meta.needsValue === 'select') return String(collections[0]?.name ?? '')
  if (meta.needsValue === 'number') return field === 'year' ? String(new Date().getFullYear()) : '1'
  return ''
}

/**
 * @param {keyof typeof TELEVISION_FILTER_FIELDS} [field]
 * @param {{ name: string }[]} [collections]
 */
export function createTelevisionMediaFilter(field = 'mediaType', collections = []) {
  const operators = getTelevisionOperatorsForField(field)
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
 * @param {{ field: string, operator: string, value: string, valueTo?: string }} filter
 * @param {{ name: string }[]} [collections]
 */
export function resetTelevisionFilterForFieldChange(filter, collections = []) {
  const operators = getTelevisionOperatorsForField(filter.field)
  filter.operator = operators[0]?.id ?? 'is'
  filter.value = defaultValueFor(filter.field, filter.operator, collections)
  filter.valueTo = ''
}

/**
 * @param {{ field: string, operator: string, value: string, valueTo?: string }} filter
 * @param {{ needsValue?: false | 'select' | 'text' | 'range' | 'number' }} operator
 * @param {{ name: string }[]} [collections]
 */
export function resetTelevisionFilterForOperatorChange(filter, operator, collections = []) {
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

  if (operator.needsValue === 'number') {
    filter.value =
      filter.value ||
      (filter.field === 'year' ? String(new Date().getFullYear()) : '1')
    filter.valueTo = ''
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
  const num = Number(trimmed)
  return Number.isFinite(num) ? num : null
}

/**
 * @param {Record<string, unknown>} item
 */
export function getTelevisionItemTitle(item) {
  return (
    String(item?.title || item?.name || item?.original_title || item?.original_name || '').trim()
  )
}

/**
 * @param {Record<string, unknown>} item
 */
export function getTelevisionItemMediaType(item) {
  const type = String(item?.media_type ?? '').trim().toLowerCase()
  if (type === 'tv' || type === 'movie') return type
  return ''
}

/**
 * @param {Record<string, unknown>} item
 * @returns {number|null}
 */
export function getTelevisionItemYear(item) {
  const raw =
    item?.release_date ||
    item?.first_air_date ||
    item?.publication_year ||
    item?.year ||
    ''
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.floor(raw)
  const text = String(raw ?? '').trim()
  if (!text) return null
  const year = Number.parseInt(text.slice(0, 4), 10)
  return Number.isFinite(year) && year > 0 ? year : null
}

/**
 * @param {{ field: string, operator: string, value: string, valueTo?: string }} filter
 */
export function formatTelevisionFilterLabel(filter) {
  const fieldLabel = TELEVISION_FILTER_FIELDS[filter.field]?.label ?? filter.field
  const operator = getTelevisionOperatorMeta(filter.field, filter.operator)
  const operatorLabel = operator?.label ?? filter.operator

  if (
    (filter.field === 'year' || filter.field === 'rating') &&
    filter.operator === 'between'
  ) {
    const min = String(filter.value ?? '').trim()
    const max = String(filter.valueTo ?? '').trim()
    if (min && max) return `${fieldLabel} entre ${min} et ${max}`
    return `${fieldLabel} entre…`
  }

  if (!operator?.needsValue) {
    return `${fieldLabel} ${operatorLabel}`
  }

  const value = String(filter.value ?? '').trim()
  if (filter.operator === 'contains') {
    return value ? `${fieldLabel} ${operatorLabel} « ${value} »` : `${fieldLabel} ${operatorLabel}…`
  }

  return value ? `${fieldLabel} ${operatorLabel} ${value}` : `${fieldLabel} ${operatorLabel}…`
}

function matchNumberBetween(value, minRaw, maxRaw) {
  if (value == null) return false
  const min = parseOptionalNumber(minRaw)
  const max = parseOptionalNumber(maxRaw)
  if (min != null && value < min) return false
  if (max != null && value > max) return false
  if (min == null && max == null) return true
  return true
}

/**
 * @param {Record<string, unknown>} item
 * @param {{ field: string, operator: string, value: string, valueTo?: string }} filter
 */
export function itemMatchesTelevisionFilter(item, filter) {
  if (filter.field === 'mediaType') {
    const type = getTelevisionItemMediaType(item)
    if (filter.operator === 'is_movie') return type === 'movie'
    if (filter.operator === 'is_tv') return type === 'tv'
    return true
  }

  if (filter.field === 'title') {
    return matchTextField(getTelevisionItemTitle(item), filter.operator, filter.value)
  }

  if (filter.field === 'collection') {
    const collection = String(item.collection ?? '').trim()
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

  if (filter.field === 'year') {
    const year = getTelevisionItemYear(item)
    if (filter.operator === 'is_empty') return year == null
    if (filter.operator === 'is_not_empty') return year != null
    if (filter.operator === 'is') {
      const target = parseOptionalNumber(filter.value)
      return target != null && year === target
    }
    if (filter.operator === 'between') {
      return matchNumberBetween(year, filter.value, filter.valueTo)
    }
    return true
  }

  if (filter.field === 'rating') {
    const rating =
      parseOptionalNumber(item.rating) ?? parseOptionalNumber(item.vote_average)
    if (filter.operator === 'is_empty') return rating == null
    if (filter.operator === 'is_not_empty') return rating != null
    if (filter.operator === 'between') {
      return matchNumberBetween(rating, filter.value, filter.valueTo)
    }
    return true
  }

  if (filter.field === 'comments') {
    return matchTextField(item.comments, filter.operator, filter.value)
  }

  return true
}

/**
 * @param {Array<Record<string, unknown>>} items
 * @param {Array<{ field: string, operator: string, value: string, valueTo?: string }>} filters
 */
export function applyTelevisionMediaFilters(items, filters) {
  const list = Array.isArray(items) ? items : []
  const rules = Array.isArray(filters) ? filters : []
  if (!rules.length) return list
  return list.filter((item) => rules.every((filter) => itemMatchesTelevisionFilter(item, filter)))
}
