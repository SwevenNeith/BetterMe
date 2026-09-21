/**
 * Normalisation pour matcher titre / auteur Lecture ↔ Open Library.
 */
export function normalizeBookText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[''`´']/g, "'")
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Empreinte auteur : ignore points / espaces entre initiales.
 * "M.L. Wang" / "ML Wang" / "M. L. Wang" / "M L Wang" → "mlwang"
 */
export function authorFingerprint(value) {
  return normalizeBookText(value).replace(/[\s']+/g, '')
}

const LEADING_ARTICLE_RE = /^(?:(?:the|an|a|le|la|les|un|une|des)\s+|l')/
const TITLE_ARTICLES = ['the', 'a', 'an', 'le', 'la', 'les', 'un', 'une', 'des']

/** Variantes de titre (sous-titre, tome, articles EN/FR…). */
export function titleVariants(value) {
  const full = normalizeBookText(value)
  if (!full) return []

  const variants = new Set([full])

  function addArticleVariants(title) {
    if (!title) return
    variants.add(title)
    const stripped = title.replace(LEADING_ARTICLE_RE, '').trim()
    const bare = stripped && stripped !== title ? stripped : title
    variants.add(bare)
    for (const article of TITLE_ARTICLES) {
      variants.add(`${article} ${bare}`)
    }
    variants.add(`l'${bare}`)
  }

  addArticleVariants(full)

  const head = full.split(/\s+(?:-|–|—|:)\s+/)[0]?.trim()
  addArticleVariants(head)

  const withoutVolume = full
    .replace(/\s*(?:tome|tomes|vol\.?|volume|book)\s*\d+\s*$/i, '')
    .replace(/\s+#\d+\s*$/i, '')
    .trim()
  addArticleVariants(withoutVolume)

  return [...variants].filter(Boolean)
}

export function titlesMatch(a, b) {
  const left = titleVariants(a)
  const right = titleVariants(b)
  if (!left.length || !right.length) return false
  return left.some((variant) => right.includes(variant))
}

/** Compacte les initiales séparées : "m l wang" → "ml wang". */
function compactSingleLetterTokens(normalized) {
  const parts = String(normalized ?? '').split(' ').filter(Boolean)
  if (!parts.length) return ''

  const out = []
  let initials = ''
  for (const part of parts) {
    if (part.length === 1 && /^[a-z]$/.test(part)) {
      initials += part
      continue
    }
    if (initials) {
      out.push(initials)
      initials = ''
    }
    out.push(part)
  }
  if (initials) out.push(initials)
  return out.join(' ')
}

/**
 * Éclate un bloc d’initiales collées en tête : "ml wang" → "m l wang".
 * (évite d’éclater un vrai prénom comme "anna")
 */
function expandLeadingInitialBlock(normalized) {
  const parts = String(normalized ?? '').split(' ').filter(Boolean)
  if (parts.length < 2) return normalized

  const first = parts[0]
  const looksLikeInitials =
    first.length >= 2 &&
    first.length <= 4 &&
    /^[a-z]+$/.test(first) &&
    (!/[aeiouy]/.test(first) || first.length === 2)

  if (!looksLikeInitials) return normalized
  return [...first.split(''), ...parts.slice(1)].join(' ')
}

function authorNameVariants(raw) {
  const normalized = normalizeBookText(raw)
  if (!normalized) return []

  const out = new Set([normalized])
  const compacted = compactSingleLetterTokens(normalized)
  const expanded = expandLeadingInitialBlock(normalized)
  const expandedThenCompact = compactSingleLetterTokens(expanded)

  out.add(compacted)
  out.add(expanded)
  out.add(expandedThenCompact)
  out.add(authorFingerprint(raw))

  for (const base of [...out]) {
    if (base.includes(',')) {
      const [last, ...rest] = base.split(',').map((part) => part.trim()).filter(Boolean)
      if (last && rest.length) out.add(`${rest.join(' ')} ${last}`.trim())
    } else {
      const parts = base.split(' ').filter(Boolean)
      if (parts.length >= 2) {
        out.add(`${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`)
      }
    }
  }

  // Empreintes de toutes les variantes textuelles
  for (const base of [...out]) {
    out.add(String(base).replace(/[\s',]+/g, ''))
  }

  return [...out].filter(Boolean)
}

/**
 * Auteurs compatibles si égalité stricte, ou si l’auteur Lecture
 * correspond à l’un des auteurs OL (après normalisation).
 */
export function authorsMatch(lectureAuthor, openLibraryAuthors) {
  const leftRaw = String(lectureAuthor ?? '').trim()
  if (!leftRaw) {
    // Pas d’auteur côté Lecture → on n’accepte un match que si OL n’en a pas non plus
    return !Array.isArray(openLibraryAuthors) || openLibraryAuthors.length === 0
  }

  const authors = Array.isArray(openLibraryAuthors)
    ? openLibraryAuthors.map((name) => String(name ?? '').trim()).filter(Boolean)
    : []

  if (!authors.length) return false

  const leftVariants = new Set(authorNameVariants(leftRaw))
  const rightVariants = new Set(authors.flatMap((name) => authorNameVariants(name)))

  for (const variant of leftVariants) {
    if (rightVariants.has(variant)) return true
  }

  const joined = authors.join(' ')
  for (const variant of authorNameVariants(joined)) {
    if (leftVariants.has(variant)) return true
  }

  // Inclusion prudente sur formes normalisées (pas sur empreintes collées)
  const leftSpaced = normalizeBookText(leftRaw)
  return authors.some((name) => {
    const rightSpaced = normalizeBookText(name)
    return (
      rightSpaced.includes(leftSpaced) ||
      leftSpaced.includes(rightSpaced) ||
      compactSingleLetterTokens(rightSpaced).includes(compactSingleLetterTokens(leftSpaced)) ||
      compactSingleLetterTokens(leftSpaced).includes(compactSingleLetterTokens(rightSpaced))
    )
  })
}

/**
 * @param {{ title?: string, author?: string }} book
 * @param {{ title?: string, authors?: string[], authorLabel?: string }} olDoc
 */
export function isExactOpenLibraryMatch(book, olDoc) {
  if (!titlesMatch(book?.title, olDoc?.title)) return false
  const olAuthors = Array.isArray(olDoc?.authors)
    ? olDoc.authors
    : String(olDoc?.authorLabel || '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
  return authorsMatch(book?.author, olAuthors)
}

export function isLinkedToOpenLibrary(book) {
  return Boolean(String(book?.open_library_work_key ?? '').trim())
}
