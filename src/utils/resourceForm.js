export function parseResourceTags(raw) {
  return String(raw ?? '')
    .split(/[,;]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}

export function formatResourceTagsInput(tags) {
  return (tags ?? []).join(', ')
}

export function emptyResourceForm() {
  return {
    name: '',
    category: '',
    tagsInput: '',
    link: '',
    address: '',
    brand: '',
    comments: '',
  }
}

export function resourceToForm(item) {
  return {
    name: item?.name ?? '',
    category: item?.category ?? '',
    tagsInput: formatResourceTagsInput(item?.tags),
    link: item?.link ?? '',
    address: item?.address ?? '',
    brand: item?.brand ?? '',
    comments: item?.comments ?? '',
  }
}

export function formToResourcePayload(form) {
  return {
    name: String(form?.name ?? '').trim(),
    category: String(form?.category ?? '').trim(),
    tagsInput: form?.tagsInput ?? '',
    link: String(form?.link ?? '').trim(),
    address: String(form?.address ?? '').trim(),
    brand: String(form?.brand ?? '').trim(),
    comments: String(form?.comments ?? '').trim(),
  }
}

/** Normalise une URL pour stockage ou ouverture (ajoute https:// si besoin). */
export function normalizeResourceLink(raw) {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return null

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const parsed = new URL(withProtocol)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    return parsed.href
  } catch {
    return null
  }
}

export function resourceLinkHref(raw) {
  return normalizeResourceLink(raw) ?? ''
}

export const RESOURCE_NO_TAG = 'Sans tag'
export const RESOURCE_NO_CATEGORY = 'Sans catégorie'

export const RESOURCE_SORT_MODES = {
  GROUPED: 'grouped',
  ALPHA: 'alpha',
}

/** Premier tag = tag principal pour le regroupement. */
export function getResourcePrimaryTag(item) {
  const tags = (item?.tags ?? []).map((t) => String(t).trim()).filter(Boolean)
  return tags[0] || RESOURCE_NO_TAG
}

export function getResourceCategoryLabel(item) {
  return String(item?.category ?? '').trim() || RESOURCE_NO_CATEGORY
}

function compareFr(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), 'fr', { sensitivity: 'base' })
}

function sortItemsByName(items) {
  return [...items].sort((a, b) => compareFr(a.name, b.name))
}

/**
 * @param {Array} items
 * @param {Array} categories
 */
export function collectResourceFilterOptions(items, categories = []) {
  const tagSet = new Set()
  const categorySet = new Set()

  for (const item of items ?? []) {
    tagSet.add(getResourcePrimaryTag(item))
    categorySet.add(getResourceCategoryLabel(item))
  }

  for (const cat of categories ?? []) {
    const name = String(cat?.name ?? '').trim()
    if (name) categorySet.add(name)
  }

  if (tagSet.has(RESOURCE_NO_TAG)) tagSet.delete(RESOURCE_NO_TAG)
  if (categorySet.has(RESOURCE_NO_CATEGORY)) categorySet.delete(RESOURCE_NO_CATEGORY)

  const tags = [...tagSet].sort(compareFr)
  const categoryNames = [...categorySet].sort(compareFr)

  return {
    tags,
    categories: categoryNames,
    hasUntagged: (items ?? []).some((item) => getResourcePrimaryTag(item) === RESOURCE_NO_TAG),
    hasUncategorized: (items ?? []).some(
      (item) => getResourceCategoryLabel(item) === RESOURCE_NO_CATEGORY,
    ),
  }
}

/**
 * @param {Array} items
 * @param {{ searchQuery?: string, selectedTags?: string[], selectedCategories?: string[] }} filters
 */
export function applyResourceDisplayFilters(items, filters = {}) {
  let list = [...(items ?? [])]

  const query = String(filters.searchQuery ?? '').trim().toLowerCase()
  if (query) {
    list = list.filter((item) => {
      const haystack = [
        item.name,
        item.category,
        item.brand,
        item.address,
        item.link,
        item.comments,
        ...(item.tags ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }

  const selectedTags = filters.selectedTags
  if (Array.isArray(selectedTags) && selectedTags.length > 0) {
    const allowed = new Set(selectedTags)
    list = list.filter((item) => allowed.has(getResourcePrimaryTag(item)))
  }

  const selectedCategories = filters.selectedCategories
  if (Array.isArray(selectedCategories) && selectedCategories.length > 0) {
    const allowed = new Set(selectedCategories)
    list = list.filter((item) => allowed.has(getResourceCategoryLabel(item)))
  }

  return list
}

/**
 * Regroupe par tag principal puis par catégorie (chaque ressource une seule fois).
 * @param {Array} items
 * @param {Array} categories
 */
export function groupResourcesByPrimaryTagAndCategory(items, categories = []) {
  const categoryOrder = new Map()
  for (const cat of categories ?? []) {
    const name = String(cat?.name ?? '').trim()
    if (!name) continue
    categoryOrder.set(name.toLowerCase(), {
      name,
      sortOrder: cat.sort_order ?? 100,
    })
  }

  const tagBuckets = new Map()

  function getTagBucket(primaryTag) {
    const key = primaryTag.toLowerCase()
    if (!tagBuckets.has(key)) {
      tagBuckets.set(key, {
        tag: primaryTag,
        sortKey: primaryTag === RESOURCE_NO_TAG ? 'zzz' : primaryTag.toLowerCase(),
        categoryGroups: new Map(),
      })
    }
    return tagBuckets.get(key)
  }

  function getCategoryBucket(tagBucket, categoryLabel) {
    const key = categoryLabel.toLowerCase()
    if (!tagBucket.categoryGroups.has(key)) {
      const meta =
        categoryLabel === RESOURCE_NO_CATEGORY
          ? { name: RESOURCE_NO_CATEGORY, sortOrder: 9999 }
          : categoryOrder.get(categoryLabel.toLowerCase()) ?? {
              name: categoryLabel,
              sortOrder: 100,
            }
      tagBucket.categoryGroups.set(key, {
        categoryName: meta.name,
        sortOrder: meta.sortOrder,
        items: [],
      })
    }
    return tagBucket.categoryGroups.get(key)
  }

  for (const item of items ?? []) {
    const primaryTag = getResourcePrimaryTag(item)
    const categoryLabel = getResourceCategoryLabel(item)
    const tagBucket = getTagBucket(primaryTag)
    const categoryBucket = getCategoryBucket(tagBucket, categoryLabel)
    categoryBucket.items.push(item)
  }

  return [...tagBuckets.values()]
    .sort((a, b) => compareFr(a.sortKey, b.sortKey))
    .map((tagBucket) => ({
      tag: tagBucket.tag,
      categoryGroups: [...tagBucket.categoryGroups.values()]
        .sort((a, b) => {
          if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
          return compareFr(a.categoryName, b.categoryName)
        })
        .map((group) => ({
          categoryName: group.categoryName,
          items: sortItemsByName(group.items),
        })),
    }))
}

export function sortResourcesAlphabetically(items) {
  return sortItemsByName(items ?? [])
}

/** @deprecated Utiliser groupResourcesByPrimaryTagAndCategory */
export function groupResourcesByCategoryAndTag(items, categories = []) {
  return groupResourcesByPrimaryTagAndCategory(items, categories)
}
