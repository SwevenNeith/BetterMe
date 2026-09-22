const TABLE = 'reading_books'
const BUCKET = 'reading-covers'
const SIGNED_URL_TTL_SEC = 3600
const MAX_FILE_BYTES = 8 * 1024 * 1024

import { buildTagsFromGenreAndExtra, formToBookPayload } from '../../utils/lecture/readingBookForm.js'
import { mergeOpenLibrarySubjectsIntoTags } from '../../utils/bibliotheque/openLibrarySubjects.js'
import { ensureReadingCollection } from './readingCollections.js'

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

const BOOK_SELECT =
  'id, user_id, title, author, collection, is_saga, saga_volume, date_start, date_end, rating, pages, publication_year, comments, quote, spoil, cover_storage_path, cover_image_url, open_library_cover_url, tags, open_library_work_key, created_at'

const BOOK_SELECT_NO_OL_COVER =
  'id, user_id, title, author, collection, is_saga, saga_volume, date_start, date_end, rating, pages, publication_year, comments, quote, spoil, cover_storage_path, cover_image_url, tags, open_library_work_key, created_at'

const BOOK_SELECT_LEGACY =
  'id, user_id, title, author, collection, is_saga, saga_volume, date_start, date_end, rating, pages, publication_year, comments, quote, spoil, cover_storage_path, cover_image_url, tags, created_at'

function isMissingColumnError(error, columnName) {
  const message = String(error?.message ?? '')
  return (
    message.includes(columnName) &&
    (error?.code === 'PGRST204' ||
      error?.code === '42703' ||
      message.includes('does not exist') ||
      message.includes('schema cache'))
  )
}

function isMissingOpenLibraryColumnError(error) {
  return isMissingColumnError(error, 'open_library_work_key')
}

function isMissingOpenLibraryCoverColumnError(error) {
  return isMissingColumnError(error, 'open_library_cover_url')
}

const DUPLICATE_BOOK_MESSAGE =
  'Un livre avec le même titre et le même auteur existe déjà dans ta bibliothèque.'

function normalizeBookIdentity(title, author) {
  return {
    title: String(title ?? '').trim().toLowerCase(),
    author: String(author ?? '').trim().toLowerCase(),
  }
}

function isUniqueViolation(error) {
  return error?.code === '23505'
}

/**
 * Empêche deux livres du même utilisateur d’avoir le même titre et le même auteur.
 * @param {string|null} [excludeId]
 */
async function assertUniqueTitleAuthor(supabase, userId, title, author, excludeId = null) {
  const target = normalizeBookIdentity(title, author)
  if (!target.title) return

  const { data, error } = await supabase.from(TABLE).select('id, title, author').eq('user_id', userId)

  if (error) throw error

  const duplicate = (data ?? []).some((row) => {
    if (excludeId && row.id === excludeId) return false
    const key = normalizeBookIdentity(row.title, row.author)
    return key.title === target.title && key.author === target.author
  })

  if (duplicate) throw new Error(DUPLICATE_BOOK_MESSAGE)
}

function sanitizeFileName(name) {
  return (name || 'cover')
    .trim()
    .replace(/[^\w.\-() ]+/g, '_')
    .slice(0, 120)
}

function buildStoragePath(userId, fileName) {
  const safeName = sanitizeFileName(fileName)
  return `${userId}/${crypto.randomUUID()}-${safeName}`
}

function assertImageFile(file) {
  if (!file) throw new Error('Aucun fichier sélectionné.')
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error('Format non pris en charge. Utilise JPEG, PNG, WebP ou GIF.')
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Image trop lourde (max. 8 Mo).')
  }
}

function assertImageUrl(url) {
  const trimmed = String(url ?? '').trim()
  if (!trimmed) return ''
  try {
    const parsed = new URL(trimmed)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('L’URL de l’image doit commencer par http:// ou https://')
    }
    return trimmed
  } catch (err) {
    if (err.message?.includes('http')) throw err
    throw new Error('URL de l’image invalide.')
  }
}

/** URL de couverture servie par Open Library (covers.openlibrary.org). */
export function isOpenLibraryCoverUrl(url) {
  return /covers\.openlibrary\.org/i.test(String(url ?? ''))
}

/**
 * Couverture renseignée par l’utilisateur (upload ou URL perso).
 * Les URL Open Library legacy dans cover_image_url ne comptent pas.
 */
export function hasCustomReadingCover(book) {
  if (String(book?.cover_storage_path ?? '').trim()) return true
  const url = String(book?.cover_image_url ?? '').trim()
  return Boolean(url && !isOpenLibraryCoverUrl(url))
}

/**
 * Sépare couverture perso / fallback OL (y compris legacy avant migration SQL).
 * @returns {{ customUrl: string|null, openLibraryUrl: string|null }}
 */
export function splitReadingCoverFields(book) {
  let customUrl = String(book?.cover_image_url ?? '').trim() || null
  let openLibraryUrl = String(book?.open_library_cover_url ?? '').trim() || null

  // URL OL jamais considérée comme couverture perso
  if (customUrl && isOpenLibraryCoverUrl(customUrl)) {
    if (!openLibraryUrl) openLibraryUrl = customUrl
    customUrl = null
  }

  return { customUrl, openLibraryUrl }
}

/**
 * Parse une chaîne de tags séparés par des virgules ou des point-virgules.
 * @param {string} raw
 * @returns {string[]}
 */
export function parseReadingTags(raw) {
  return String(raw ?? '')
    .split(/[,;]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}

/** Affiche les tags pour un champ texte (édition). */
export function formatReadingTagsInput(tags) {
  return (tags ?? []).join(', ')
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} storagePath
 */
export async function getReadingCoverSignedUrl(supabase, storagePath) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SEC)

  if (error) throw error
  return data?.signedUrl ?? null
}

/**
 * Priorité d’affichage : upload perso → URL perso → couverture Open Library.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ cover_storage_path?: string|null, cover_image_url?: string|null, open_library_cover_url?: string|null }} book
 */
export async function resolveReadingCoverUrl(supabase, book) {
  if (book?.cover_storage_path) {
    try {
      return await getReadingCoverSignedUrl(supabase, book.cover_storage_path)
    } catch {
      /* fallback ci-dessous */
    }
  }

  const { customUrl, openLibraryUrl } = splitReadingCoverFields(book)
  return customUrl || openLibraryUrl || null
}

function withCoverMeta(row, coverUrl = null) {
  return {
    ...row,
    open_library_work_key: row?.open_library_work_key ?? null,
    open_library_cover_url: row?.open_library_cover_url ?? null,
    coverUrl,
  }
}

/**
 * Select avec repli si colonnes OL absentes.
 */
async function selectReadingBookQuery(supabase, build) {
  let result = await build(BOOK_SELECT)
  if (result.error && isMissingOpenLibraryCoverColumnError(result.error)) {
    result = await build(BOOK_SELECT_NO_OL_COVER)
  }
  if (result.error && isMissingOpenLibraryColumnError(result.error)) {
    result = await build(BOOK_SELECT_LEGACY)
  }
  return result
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listReadingBooks(supabase, userId) {
  const { data, error } = await selectReadingBookQuery(supabase, (columns) =>
    supabase
      .from(TABLE)
      .select(columns)
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  )

  if (error) throw error
  return (data ?? []).map((row) => withCoverMeta(row))
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listReadingBooksWithCovers(supabase, userId) {
  const rows = await listReadingBooks(supabase, userId)
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      coverUrl: await resolveReadingCoverUrl(supabase, row),
    })),
  )
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} bookId
 */
export async function getReadingBookWithCover(supabase, userId, bookId) {
  if (!userId || !bookId) return null

  const { data, error } = await selectReadingBookQuery(supabase, (columns) =>
    supabase
      .from(TABLE)
      .select(columns)
      .eq('id', bookId)
      .eq('user_id', userId)
      .maybeSingle(),
  )

  if (error) throw error
  if (!data) return null

  const coverUrl = await resolveReadingCoverUrl(supabase, data)
  return withCoverMeta(data, coverUrl)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {File} file
 */
async function uploadReadingCover(supabase, userId, file) {
  assertImageFile(file)
  const storagePath = buildStoragePath(userId, file.name)

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    })

  if (uploadError) throw uploadError
  return storagePath
}

function buildBookRowFromInput(input, existing = null) {
  const payload = formToBookPayload(input)

  const title = payload.title || existing?.title || ''
  if (!title.trim()) throw new Error('Le titre est obligatoire.')

  const tags =
    input?.tags !== undefined && input?.genre === undefined && input?.extraTags === undefined
      ? Array.isArray(input.tags)
        ? input.tags.map((t) => String(t).trim()).filter(Boolean)
        : parseReadingTags(input.tags)
      : buildTagsFromGenreAndExtra(payload.genre, payload.extraTags)

  return {
    title,
    author: payload.author,
    collection: payload.collection || null,
    is_saga: Boolean(payload.isSaga),
    saga_volume: payload.isSaga ? (payload.sagaVolume ?? 1) : null,
    date_start: payload.dateStart,
    date_end: payload.dateEnd,
    rating: payload.rating,
    pages: payload.pages,
    publication_year: payload.publicationYear,
    comments: payload.comments || null,
    quote: payload.quote || null,
    spoil: payload.spoil || null,
    tags,
  }
}

async function resolveCollectionName(supabase, userId, collection) {
  const name = String(collection ?? '').trim()
  if (!name) return null
  return ensureReadingCollection(supabase, userId, name)
}

/**
 * Répartit une URL d’entrée entre couverture perso et fallback OL.
 * @returns {{ coverImageUrl: string|null, openLibraryCoverUrl: string|null }}
 */
function classifyIncomingCoverUrl(url, { treatOpenLibraryAsFallback = true } = {}) {
  const trimmed = assertImageUrl(url)
  if (!trimmed) return { coverImageUrl: null, openLibraryCoverUrl: null }
  if (treatOpenLibraryAsFallback && isOpenLibraryCoverUrl(trimmed)) {
    return { coverImageUrl: null, openLibraryCoverUrl: trimmed }
  }
  return { coverImageUrl: trimmed, openLibraryCoverUrl: null }
}

async function insertReadingBookRow(supabase, insertPayload) {
  let result = await supabase.from(TABLE).insert(insertPayload).select(BOOK_SELECT).single()

  if (result.error && isMissingOpenLibraryCoverColumnError(result.error)) {
    const fallback = { ...insertPayload }
    if (fallback.open_library_cover_url && !fallback.cover_image_url) {
      fallback.cover_image_url = fallback.open_library_cover_url
    }
    delete fallback.open_library_cover_url
    result = await supabase.from(TABLE).insert(fallback).select(BOOK_SELECT_NO_OL_COVER).single()
  }

  if (result.error && isMissingOpenLibraryColumnError(result.error)) {
    const fallback = { ...insertPayload }
    delete fallback.open_library_work_key
    if (fallback.open_library_cover_url && !fallback.cover_image_url) {
      fallback.cover_image_url = fallback.open_library_cover_url
    }
    delete fallback.open_library_cover_url
    result = await supabase.from(TABLE).insert(fallback).select(BOOK_SELECT_LEGACY).single()
  }

  return result
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object} input
 */
export async function createReadingBook(supabase, userId, input) {
  if (!userId) throw new Error('Utilisateur non connecté.')

  const row = buildBookRowFromInput(input)
  row.collection = await resolveCollectionName(supabase, userId, row.collection)
  await assertUniqueTitleAuthor(supabase, userId, row.title, row.author)

  let coverStoragePath = null
  let coverImageUrl = null
  let openLibraryCoverUrl = null

  if (input?.file) {
    coverStoragePath = await uploadReadingCover(supabase, userId, input.file)
  } else if (input?.imageUrl) {
    const classified = classifyIncomingCoverUrl(input.imageUrl, {
      // URL saisie manuellement = perso ; URL OL (catalogue) = fallback
      treatOpenLibraryAsFallback: true,
    })
    coverImageUrl = classified.coverImageUrl
    openLibraryCoverUrl = classified.openLibraryCoverUrl
  }

  if (input?.openLibraryCoverUrl) {
    try {
      openLibraryCoverUrl = assertImageUrl(input.openLibraryCoverUrl) || openLibraryCoverUrl
    } catch {
      /* ignore */
    }
  }

  const insertPayload = {
    user_id: userId,
    ...row,
    cover_storage_path: coverStoragePath,
    cover_image_url: coverImageUrl,
    open_library_cover_url: openLibraryCoverUrl,
  }

  const olKey = input?.openLibraryWorkKey ? String(input.openLibraryWorkKey).trim() || null : null
  if (olKey) insertPayload.open_library_work_key = olKey

  const { data, error } = await insertReadingBookRow(supabase, insertPayload)

  if (error) {
    if (coverStoragePath) {
      await supabase.storage.from(BUCKET).remove([coverStoragePath])
    }
    if (isUniqueViolation(error)) throw new Error(DUPLICATE_BOOK_MESSAGE)
    throw error
  }

  const coverUrl = await resolveReadingCoverUrl(supabase, data)
  return withCoverMeta(data, coverUrl)
}

/**
 * Sans colonne open_library_cover_url : n’écrit l’URL OL dans cover_image_url
 * que si le patch touche déjà les champs de couverture perso (create/update complets).
 * Un lien OL seul ne doit jamais écraser cover_image_url existant.
 */
function stripOpenLibraryCoverForLegacyPatch(patch) {
  const fallback = { ...patch }
  if (!Object.prototype.hasOwnProperty.call(fallback, 'open_library_cover_url')) {
    return fallback
  }

  const olUrl = fallback.open_library_cover_url
  delete fallback.open_library_cover_url

  const touchesCustomCover =
    Object.prototype.hasOwnProperty.call(fallback, 'cover_storage_path') ||
    Object.prototype.hasOwnProperty.call(fallback, 'cover_image_url')

  if (!touchesCustomCover) return fallback

  const hasCustomInPatch =
    Boolean(String(fallback.cover_storage_path ?? '').trim()) ||
    (Boolean(String(fallback.cover_image_url ?? '').trim()) &&
      !isOpenLibraryCoverUrl(fallback.cover_image_url))

  if (olUrl && !hasCustomInPatch) {
    fallback.cover_image_url = olUrl
  }

  return fallback
}

async function updateReadingBookRow(supabase, bookId, userId, patch) {
  let result = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', bookId)
    .eq('user_id', userId)
    .select(BOOK_SELECT)
    .single()

  if (result.error && isMissingOpenLibraryCoverColumnError(result.error)) {
    const fallback = stripOpenLibraryCoverForLegacyPatch(patch)
    result = await supabase
      .from(TABLE)
      .update(fallback)
      .eq('id', bookId)
      .eq('user_id', userId)
      .select(BOOK_SELECT_NO_OL_COVER)
      .single()
  }

  if (result.error && isMissingOpenLibraryColumnError(result.error)) {
    const fallback = stripOpenLibraryCoverForLegacyPatch(patch)
    delete fallback.open_library_work_key
    result = await supabase
      .from(TABLE)
      .update(fallback)
      .eq('id', bookId)
      .eq('user_id', userId)
      .select(BOOK_SELECT_LEGACY)
      .single()
  }

  return result
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} bookId
 * @param {{
 *   title?: string,
 *   author?: string,
 *   tags?: string[]|string,
 *   file?: File|null,
 *   imageUrl?: string|null,
 *   openLibraryCoverUrl?: string|null,
 *   removeCover?: boolean,
 * }} input
 */
export async function updateReadingBook(supabase, userId, bookId, input) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  if (!bookId) throw new Error('Livre introuvable.')

  const { data: existing, error: readError } = await selectReadingBookQuery(supabase, (columns) =>
    supabase
      .from(TABLE)
      .select(columns)
      .eq('id', bookId)
      .eq('user_id', userId)
      .maybeSingle(),
  )

  if (readError) throw readError
  if (!existing) throw new Error('Livre introuvable.')

  const row = buildBookRowFromInput(input, existing)
  row.collection = await resolveCollectionName(supabase, userId, row.collection)
  await assertUniqueTitleAuthor(supabase, userId, row.title, row.author, bookId)

  const oldStoragePath = existing.cover_storage_path
  let coverStoragePath = existing.cover_storage_path
  const splitExisting = splitReadingCoverFields(existing)
  // Normalise le legacy : URL OL dans cover_image_url → open_library_cover_url
  let coverImageUrl = splitExisting.customUrl
  let openLibraryCoverUrl = splitExisting.openLibraryUrl

  if (input?.file) {
    coverStoragePath = await uploadReadingCover(supabase, userId, input.file)
    coverImageUrl = null
  } else if (input?.removeCover) {
    // Retire uniquement la couverture perso → fallback OL si présent
    coverStoragePath = null
    coverImageUrl = null
  } else if (input?.imageUrl !== undefined) {
    const url = String(input.imageUrl ?? '').trim()
    if (url) {
      // URL saisie dans le formulaire fiche = couverture perso (même si domaine OL)
      coverImageUrl = assertImageUrl(url)
      coverStoragePath = null
    }
  }

  if (input?.openLibraryCoverUrl !== undefined) {
    const url = String(input.openLibraryCoverUrl ?? '').trim()
    openLibraryCoverUrl = url ? assertImageUrl(url) : null
  }

  const patch = {
    ...row,
    cover_storage_path: coverStoragePath,
    cover_image_url: coverImageUrl,
    open_library_cover_url: openLibraryCoverUrl,
  }

  const { data, error } = await updateReadingBookRow(supabase, bookId, userId, patch)

  if (error) {
    if (input?.file && coverStoragePath && coverStoragePath !== oldStoragePath) {
      await supabase.storage.from(BUCKET).remove([coverStoragePath])
    }
    if (isUniqueViolation(error)) throw new Error(DUPLICATE_BOOK_MESSAGE)
    throw error
  }

  if (oldStoragePath && oldStoragePath !== coverStoragePath) {
    await supabase.storage.from(BUCKET).remove([oldStoragePath])
  }

  const coverUrl = await resolveReadingCoverUrl(supabase, data)
  return withCoverMeta(data, coverUrl)
}

/**
 * Lie un livre Lecture à un work Open Library sans toucher aux données perso
 * (collection, dates, spoils, notes, titre/auteur saisis, etc.).
 * La couverture OL est stockée à part et ne remplace jamais une couverture perso.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} bookId
 * @param {{
 *   workKey: string,
 *   coverUrl?: string|null,
 *   pages?: number|null,
 *   publicationYear?: number|null,
 *   subjects?: string[]|null,
 *   replaceTags?: boolean,
 *   isSaga?: boolean,
 *   sagaVolume?: number|null,
 * }} link
 */
export async function linkReadingBookToOpenLibrary(supabase, userId, bookId, link) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  if (!bookId) throw new Error('Livre introuvable.')

  const workKey = String(link?.workKey ?? '').trim()
  if (!workKey) throw new Error('Clé Open Library manquante.')

  const { data: existing, error: readError } = await selectReadingBookQuery(supabase, (columns) =>
    supabase
      .from(TABLE)
      .select(columns)
      .eq('id', bookId)
      .eq('user_id', userId)
      .maybeSingle(),
  )

  if (readError) {
    if (isMissingOpenLibraryColumnError(readError)) {
      throw new Error(
        'Colonne open_library_work_key absente. Exécute scripts/migrate-reading-books-open-library.sql dans le SQL Editor Supabase.',
      )
    }
    throw readError
  }
  if (!existing) throw new Error('Livre introuvable.')

  /** @type {Record<string, unknown>} */
  const patch = {
    open_library_work_key: workKey,
  }

  if (link?.coverUrl) {
    try {
      patch.open_library_cover_url = assertImageUrl(link.coverUrl)
      // Ne jamais écraser cover_storage_path / cover_image_url (couverture perso)
    } catch {
      /* ignore invalid cover */
    }
  }

  // Complète pages / année seulement si vides
  if ((existing.pages == null || existing.pages === '') && link?.pages != null) {
    const pages = Number(link.pages)
    if (Number.isFinite(pages) && pages > 0) patch.pages = pages
  }
  if (
    (existing.publication_year == null || existing.publication_year === '') &&
    link?.publicationYear != null
  ) {
    const year = Number(link.publicationYear)
    if (Number.isFinite(year) && year > 0) patch.publication_year = year
  }

  // Complète série / tome seulement si non déjà renseigné
  if (!existing.is_saga && link?.isSaga) {
    patch.is_saga = true
    const volume = Number(link.sagaVolume)
    patch.saga_volume = Number.isFinite(volume) && volume > 0 ? volume : 1
  } else if (
    existing.is_saga &&
    (existing.saga_volume == null || existing.saga_volume === '') &&
    link?.sagaVolume != null
  ) {
    const volume = Number(link.sagaVolume)
    if (Number.isFinite(volume) && volume > 0) patch.saga_volume = volume
  }

  const mergedTags = mergeOpenLibrarySubjectsIntoTags(existing.tags, link?.subjects, {
    replace: link?.replaceTags === true,
  })
  if (mergedTags) patch.tags = mergedTags

  const { data, error } = await updateReadingBookRow(supabase, bookId, userId, patch)

  if (error) {
    if (isMissingOpenLibraryColumnError(error)) {
      throw new Error(
        'Colonne open_library_work_key absente. Exécute scripts/migrate-reading-books-open-library.sql dans le SQL Editor Supabase.',
      )
    }
    if (isUniqueViolation(error)) {
      throw new Error('Ce livre Open Library est déjà lié à une autre fiche Lecture.')
    }
    throw error
  }

  const coverUrl = await resolveReadingCoverUrl(supabase, data)
  return withCoverMeta(data, coverUrl)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ id: string, cover_storage_path?: string|null }} book
 */
export async function deleteReadingBook(supabase, userId, book) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  if (!book?.id) throw new Error('Livre introuvable.')

  if (book.cover_storage_path) {
    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove([book.cover_storage_path])

    if (storageError) throw storageError
  }

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', book.id)
    .eq('user_id', userId)

  if (error) throw error
}
