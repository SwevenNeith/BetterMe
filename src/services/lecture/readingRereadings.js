import { READING_COLLECTION_EN_COURS, READING_COLLECTION_TERMINE } from './readingCollections.js'
import { updateReadingBook } from './readingBooks.js'
import { bookToEditForm } from '../utils/readingBookForm.js'

const TABLE = 'reading_rereadings'

const REREADING_SELECT = 'id, user_id, book_id, date_start, date_end, created_at'

function parseOptionalDate(value) {
  const trimmed = String(value ?? '').trim()
  return trimmed || null
}

function normalizeDateInput(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return ''
  return trimmed.slice(0, 10)
}

function inferCollectionFromReadingDates(dateStart, dateEnd, fallback = '') {
  if (dateEnd) return READING_COLLECTION_TERMINE
  if (dateStart) return READING_COLLECTION_EN_COURS
  return fallback || READING_COLLECTION_EN_COURS
}

/**
 * Une relecture n’est possible que si la lecture en cours a une date de début ET de fin.
 * @param {{ date_start?: string|null, date_end?: string|null, dateStart?: string|null, dateEnd?: string|null }|null|undefined} book
 */
export function canStartReadingRereading(book) {
  const dateStart = normalizeDateInput(book?.date_start ?? book?.dateStart)
  const dateEnd = normalizeDateInput(book?.date_end ?? book?.dateEnd)
  return Boolean(dateStart && dateEnd)
}

/**
 * Reconstruit les infos d'annulation à partir du snapshot et/ou de la dernière entrée archivée.
 * @param {{
 *   rereadingId?: string|null,
 *   previousCollection?: string,
 *   previousDateStart?: string,
 *   previousDateEnd?: string,
 * }|null|undefined} undo
 * @param {Array<{ id: string, date_start?: string|null, date_end?: string|null }>} [rereadings]
 */
export function resolveRereadUndo(undo, rereadings = []) {
  if (!undo && !rereadings.length) return null

  const last = rereadings[rereadings.length - 1] ?? null
  const rereadingId = undo?.rereadingId ?? last?.id ?? null
  const entry = rereadingId
    ? rereadings.find((row) => row.id === rereadingId) ?? last
    : last

  const undoHasDates = Boolean(undo?.previousDateStart || undo?.previousDateEnd)
  const previousDateStart = normalizeDateInput(
    undoHasDates ? undo?.previousDateStart : entry?.date_start,
  )
  const previousDateEnd = normalizeDateInput(
    undoHasDates ? undo?.previousDateEnd : entry?.date_end,
  )

  if (!rereadingId && !previousDateStart && !previousDateEnd) return null

  return {
    rereadingId,
    previousDateStart,
    previousDateEnd,
    previousCollection:
      undo?.previousCollection ||
      inferCollectionFromReadingDates(previousDateStart, previousDateEnd),
  }
}

function isMissingTableError(error) {
  return (
    error?.code === 'PGRST205' ||
    (typeof error?.message === 'string' && error.message.includes('reading_rereadings'))
  )
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} bookId
 */
export async function listReadingRereadings(supabase, userId, bookId) {
  if (!userId || !bookId) return []

  const { data, error } = await supabase
    .from(TABLE)
    .select(REREADING_SELECT)
    .eq('user_id', userId)
    .eq('book_id', bookId)
    .order('created_at', { ascending: true })

  if (error) {
    if (isMissingTableError(error)) {
      throw new Error(
        'Table reading_rereadings absente. Exécute scripts/create-reading-rereadings.sql dans Supabase.',
      )
    }
    throw error
  }

  return data ?? []
}

/**
 * Archive la lecture en cours sur le livre puis prépare une nouvelle relecture.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ id: string, date_start?: string|null, date_end?: string|null, collection?: string|null }} book
 */
export async function startReadingRereading(supabase, userId, book) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  if (!book?.id) throw new Error('Livre introuvable.')
  if (!canStartReadingRereading(book)) {
    throw new Error(
      'Renseigne une date de début et une date de fin avant de relire ce livre.',
    )
  }

  const { data, error: insertError } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      book_id: book.id,
      date_start: book.date_start ?? null,
      date_end: book.date_end ?? null,
    })
    .select('id')
    .single()

  if (insertError) {
    if (isMissingTableError(insertError)) {
      throw new Error(
        'Table reading_rereadings absente. Exécute scripts/create-reading-rereadings.sql dans Supabase.',
      )
    }
    throw insertError
  }

  const rereadingId = data?.id ?? null

  const updatedBook = await updateReadingBook(supabase, userId, book.id, {
    ...bookToEditForm(book),
    dateStart: '',
    dateEnd: '',
    collection: READING_COLLECTION_EN_COURS,
  })

  const rereadings = await listReadingRereadings(supabase, userId, book.id)

  return {
    book: updatedBook,
    rereadings,
    undo: {
      rereadingId,
      previousCollection: book.collection ?? '',
      previousDateStart: normalizeDateInput(book.date_start),
      previousDateEnd: normalizeDateInput(book.date_end),
    },
  }
}

/**
 * Annule une relecture démarrée par erreur (restaure dates + collection précédentes).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ id: string }} book
 * @param {{
 *   rereadingId?: string|null,
 *   previousCollection?: string,
 *   previousDateStart?: string,
 *   previousDateEnd?: string,
 * }|null} undo
 * @param {Array<{ id: string, date_start?: string|null, date_end?: string|null }>} [rereadings]
 */
export async function cancelReadingRereading(supabase, userId, book, undo, rereadings = []) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  if (!book?.id) throw new Error('Livre introuvable.')

  const resolved = resolveRereadUndo(undo, rereadings)
  if (!resolved) throw new Error('Aucune relecture en cours à annuler.')

  if (resolved.rereadingId) {
    const { error: deleteError } = await supabase
      .from(TABLE)
      .delete()
      .eq('id', resolved.rereadingId)
      .eq('user_id', userId)
      .eq('book_id', book.id)

    if (deleteError) {
      if (isMissingTableError(deleteError)) {
        throw new Error(
          'Table reading_rereadings absente. Exécute scripts/create-reading-rereadings.sql dans Supabase.',
        )
      }
      throw deleteError
    }
  }

  const updatedBook = await updateReadingBook(supabase, userId, book.id, {
    ...bookToEditForm(book),
    dateStart: resolved.previousDateStart,
    dateEnd: resolved.previousDateEnd,
    collection: resolved.previousCollection,
  })

  const nextRereadings = await listReadingRereadings(supabase, userId, book.id)

  return { book: updatedBook, rereadings: nextRereadings }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} rereadingId
 * @param {{ dateStart?: string, dateEnd?: string }} input
 */
export async function updateReadingRereading(supabase, userId, rereadingId, input) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  if (!rereadingId) throw new Error('Relecture introuvable.')

  const payload = {}
  if (input?.dateStart !== undefined) payload.date_start = parseOptionalDate(input.dateStart)
  if (input?.dateEnd !== undefined) payload.date_end = parseOptionalDate(input.dateEnd)

  if (!Object.keys(payload).length) {
    throw new Error('Aucune modification à enregistrer.')
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('id', rereadingId)
    .eq('user_id', userId)
    .select(REREADING_SELECT)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error)) {
      throw new Error(
        'Table reading_rereadings absente. Exécute scripts/create-reading-rereadings.sql dans Supabase.',
      )
    }
    throw error
  }

  if (!data) throw new Error('Relecture introuvable.')
  return data
}
