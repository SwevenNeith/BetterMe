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
  'id, user_id, title, author, collection, is_saga, saga_volume, date_start, date_end, rating, pages, publication_year, comments, quote, spoil, cover_storage_path, cover_image_url, tags, open_library_work_key, created_at'

const BOOK_SELECT_LEGACY =
  'id, user_id, title, author, collection, is_saga, saga_volume, date_start, date_end, rating, pages, publication_year, comments, quote, spoil, cover_storage_path, cover_image_url, tags, created_at'

function isMissingOpenLibraryColumnError(error) {
  const message = String(error?.message ?? '')
  return (
    message.includes('open_library_work_key') &&
    (error?.code === 'PGRST204' ||
      error?.code === '42703' ||
      message.includes('does not exist') ||
      message.includes('schema cache'))
  )
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
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ cover_storage_path?: string|null, cover_image_url?: string|null }} book
 */
export async function resolveReadingCoverUrl(supabase, book) {
  if (book?.cover_storage_path) {
    try {
      return await getReadingCoverSignedUrl(supabase, book.cover_storage_path)
    } catch {
      return null
    }
  }
  const external = String(book?.cover_image_url ?? '').trim()
  return external || null
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listReadingBooks(supabase, userId) {
  let { data, error } = await supabase
    .from(TABLE)
    .select(BOOK_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error && isMissingOpenLibraryColumnError(error)) {
    ;({ data, error } = await supabase
      .from(TABLE)
      .select(BOOK_SELECT_LEGACY)
      .eq('user_id', userId)
      .order('created_at', { ascending: false }))
  }

  if (error) throw error
  return (data ?? []).map((row) => ({
    ...row,
    open_library_work_key: row.open_library_work_key ?? null,
  }))
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

  let { data, error } = await supabase
    .from(TABLE)
    .select(BOOK_SELECT)
    .eq('id', bookId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error && isMissingOpenLibraryColumnError(error)) {
    ;({ data, error } = await supabase
      .from(TABLE)
      .select(BOOK_SELECT_LEGACY)
      .eq('id', bookId)
      .eq('user_id', userId)
      .maybeSingle())
  }

  if (error) throw error
  if (!data) return null

  const coverUrl = await resolveReadingCoverUrl(supabase, data)
  return { ...data, open_library_work_key: data.open_library_work_key ?? null, coverUrl }
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

  if (input?.file) {
    coverStoragePath = await uploadReadingCover(supabase, userId, input.file)
  } else if (input?.imageUrl) {
    coverImageUrl = assertImageUrl(input.imageUrl)
  }

  const insertPayload = {
    user_id: userId,
    ...row,
    cover_storage_path: coverStoragePath,
    cover_image_url: coverImageUrl,
  }

  const olKey = input?.openLibraryWorkKey ? String(input.openLibraryWorkKey).trim() || null : null
  if (olKey) insertPayload.open_library_work_key = olKey

  let { data, error } = await supabase
    .from(TABLE)
    .insert(insertPayload)
    .select(BOOK_SELECT)
    .single()

  if (error && isMissingOpenLibraryColumnError(error)) {
    delete insertPayload.open_library_work_key
    ;({ data, error } = await supabase
      .from(TABLE)
      .insert(insertPayload)
      .select(BOOK_SELECT_LEGACY)
      .single())
  }

  if (error) {
    if (coverStoragePath) {
      await supabase.storage.from(BUCKET).remove([coverStoragePath])
    }
    if (isUniqueViolation(error)) throw new Error(DUPLICATE_BOOK_MESSAGE)
    throw error
  }

  const coverUrl = await resolveReadingCoverUrl(supabase, data)
  return { ...data, open_library_work_key: data.open_library_work_key ?? null, coverUrl }
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
 *   removeCover?: boolean,
 * }} input
 */
export async function updateReadingBook(supabase, userId, bookId, input) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  if (!bookId) throw new Error('Livre introuvable.')

  let { data: existing, error: readError } = await supabase
    .from(TABLE)
    .select(BOOK_SELECT)
    .eq('id', bookId)
    .eq('user_id', userId)
    .maybeSingle()

  if (readError && isMissingOpenLibraryColumnError(readError)) {
    ;({ data: existing, error: readError } = await supabase
      .from(TABLE)
      .select(BOOK_SELECT_LEGACY)
      .eq('id', bookId)
      .eq('user_id', userId)
      .maybeSingle())
  }

  if (readError) throw readError
  if (!existing) throw new Error('Livre introuvable.')

  const row = buildBookRowFromInput(input, existing)
  row.collection = await resolveCollectionName(supabase, userId, row.collection)
  await assertUniqueTitleAuthor(supabase, userId, row.title, row.author, bookId)

  const oldStoragePath = existing.cover_storage_path
  let coverStoragePath = existing.cover_storage_path
  let coverImageUrl = existing.cover_image_url

  if (input?.file) {
    coverStoragePath = await uploadReadingCover(supabase, userId, input.file)
    coverImageUrl = null
  } else if (input?.removeCover) {
    coverStoragePath = null
    coverImageUrl = null
  } else if (input?.imageUrl !== undefined) {
    const url = String(input.imageUrl ?? '').trim()
    if (url) {
      coverImageUrl = assertImageUrl(url)
      coverStoragePath = null
    }
  }

  let { data, error } = await supabase
    .from(TABLE)
    .update({
      ...row,
      cover_storage_path: coverStoragePath,
      cover_image_url: coverImageUrl,
    })
    .eq('id', bookId)
    .eq('user_id', userId)
    .select(BOOK_SELECT)
    .single()

  if (error && isMissingOpenLibraryColumnError(error)) {
    ;({ data, error } = await supabase
      .from(TABLE)
      .update({
        ...row,
        cover_storage_path: coverStoragePath,
        cover_image_url: coverImageUrl,
      })
      .eq('id', bookId)
      .eq('user_id', userId)
      .select(BOOK_SELECT_LEGACY)
      .single())
  }

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
  return { ...data, open_library_work_key: data.open_library_work_key ?? null, coverUrl }
}

/**
 * Lie un livre Lecture à un work Open Library sans toucher aux données perso
 * (collection, dates, spoils, notes, titre/auteur saisis, etc.).
 * Met à jour la couverture externe seulement s’il n’y a pas d’upload local.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} bookId
 * @param {{
 *   workKey: string,
 *   coverUrl?: string|null,
 *   pages?: number|null,
 *   publicationYear?: number|null,
 *   replaceCover?: boolean,
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

  const { data: existing, error: readError } = await supabase
    .from(TABLE)
    .select(BOOK_SELECT)
    .eq('id', bookId)
    .eq('user_id', userId)
    .maybeSingle()

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

  const hasLocalUpload = Boolean(String(existing.cover_storage_path ?? '').trim())
  const hasExistingCoverUrl = Boolean(String(existing.cover_image_url ?? '').trim())
  const replaceCover = link?.replaceCover === true
  // Ne jamais écraser une couverture existante sauf choix explicite
  if (link?.coverUrl && (replaceCover || (!hasLocalUpload && !hasExistingCoverUrl))) {
    try {
      patch.cover_image_url = assertImageUrl(link.coverUrl)
      if (replaceCover && hasLocalUpload) {
        patch.cover_storage_path = null
      }
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

  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', bookId)
    .eq('user_id', userId)
    .select(BOOK_SELECT)
    .single()

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

  if (
    replaceCover &&
    hasLocalUpload &&
    existing.cover_storage_path &&
    patch.cover_storage_path === null
  ) {
    await supabase.storage.from(BUCKET).remove([existing.cover_storage_path])
  }

  const coverUrl = await resolveReadingCoverUrl(supabase, data)
  return { ...data, coverUrl }
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
