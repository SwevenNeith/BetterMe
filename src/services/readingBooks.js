const TABLE = 'reading_books'
const BUCKET = 'reading-covers'
const SIGNED_URL_TTL_SEC = 3600
const MAX_FILE_BYTES = 8 * 1024 * 1024

import { buildTagsFromGenreAndExtra, formToBookPayload } from '../utils/readingBookForm.js'
import { ensureReadingCollection } from './readingCollections.js'

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

const BOOK_SELECT =
  'id, user_id, title, author, collection, is_saga, date_start, date_end, rating, pages, publication_year, comments, quote, spoil, cover_storage_path, cover_image_url, tags, created_at'

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
  const { data, error } = await supabase
    .from(TABLE)
    .select(BOOK_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
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

  const { data, error } = await supabase
    .from(TABLE)
    .select(BOOK_SELECT)
    .eq('id', bookId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const coverUrl = await resolveReadingCoverUrl(supabase, data)
  return { ...data, coverUrl }
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

  let coverStoragePath = null
  let coverImageUrl = null

  if (input?.file) {
    coverStoragePath = await uploadReadingCover(supabase, userId, input.file)
  } else if (input?.imageUrl) {
    coverImageUrl = assertImageUrl(input.imageUrl)
  }

  const row = buildBookRowFromInput(input)
  row.collection = await resolveCollectionName(supabase, userId, row.collection)

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      ...row,
      cover_storage_path: coverStoragePath,
      cover_image_url: coverImageUrl,
    })
    .select(BOOK_SELECT)
    .single()

  if (error) {
    if (coverStoragePath) {
      await supabase.storage.from(BUCKET).remove([coverStoragePath])
    }
    throw error
  }

  const coverUrl = await resolveReadingCoverUrl(supabase, data)
  return { ...data, coverUrl }
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

  const { data: existing, error: readError } = await supabase
    .from(TABLE)
    .select(BOOK_SELECT)
    .eq('id', bookId)
    .eq('user_id', userId)
    .maybeSingle()

  if (readError) throw readError
  if (!existing) throw new Error('Livre introuvable.')

  const row = buildBookRowFromInput(input, existing)
  row.collection = await resolveCollectionName(supabase, userId, row.collection)

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

  const { data, error } = await supabase
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

  if (error) {
    if (input?.file && coverStoragePath && coverStoragePath !== oldStoragePath) {
      await supabase.storage.from(BUCKET).remove([coverStoragePath])
    }
    throw error
  }

  if (oldStoragePath && oldStoragePath !== coverStoragePath) {
    await supabase.storage.from(BUCKET).remove([oldStoragePath])
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
