import {
  TELEVISION_COLLECTION_EN_COURS,
  TELEVISION_COLLECTION_TERMINE,
} from './televisionCollections.js'
import { mediaToEditForm, updateTelevisionMedia } from './televisionMedia.js'
import { clearEpisodeProgressForMedia } from './televisionEpisodeProgress.js'

const TABLE = 'television_rewatches'

const REWATCH_SELECT = 'id, user_id, media_id, date_start, date_end, created_at'

function parseOptionalDate(value) {
  const trimmed = String(value ?? '').trim()
  return trimmed || null
}

function normalizeDateInput(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return ''
  return trimmed.slice(0, 10)
}

function inferCollectionFromDates(dateStart, dateEnd, fallback = '') {
  if (dateEnd) return TELEVISION_COLLECTION_TERMINE
  if (dateStart) return TELEVISION_COLLECTION_EN_COURS
  return fallback || TELEVISION_COLLECTION_EN_COURS
}

function isMissingTableError(error) {
  return (
    error?.code === 'PGRST205' ||
    (typeof error?.message === 'string' && error.message.includes('television_rewatches'))
  )
}

/**
 * @param {{ date_start?: string|null, date_end?: string|null, dateStart?: string|null, dateEnd?: string|null }|null|undefined} media
 */
export function canStartTelevisionRewatch(media) {
  const dateStart = normalizeDateInput(media?.date_start ?? media?.dateStart)
  const dateEnd = normalizeDateInput(media?.date_end ?? media?.dateEnd)
  return Boolean(dateStart && dateEnd)
}

/**
 * @param {{
 *   rewatchId?: string|null,
 *   previousCollection?: string,
 *   previousDateStart?: string,
 *   previousDateEnd?: string,
 * }|null|undefined} undo
 * @param {Array<{ id: string, date_start?: string|null, date_end?: string|null }>} [rewatches]
 */
export function resolveRewatchUndo(undo, rewatches = []) {
  if (!undo && !rewatches.length) return null

  const last = rewatches[rewatches.length - 1] ?? null
  const rewatchId = undo?.rewatchId ?? last?.id ?? null
  const entry = rewatchId ? (rewatches.find((row) => row.id === rewatchId) ?? last) : last

  const undoHasDates = Boolean(undo?.previousDateStart || undo?.previousDateEnd)
  const previousDateStart = normalizeDateInput(
    undoHasDates ? undo?.previousDateStart : entry?.date_start,
  )
  const previousDateEnd = normalizeDateInput(undoHasDates ? undo?.previousDateEnd : entry?.date_end)

  if (!rewatchId && !previousDateStart && !previousDateEnd) return null

  return {
    rewatchId,
    previousDateStart,
    previousDateEnd,
    previousCollection:
      undo?.previousCollection || inferCollectionFromDates(previousDateStart, previousDateEnd),
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} mediaId
 */
export async function listTelevisionRewatches(supabase, userId, mediaId) {
  if (!userId || !mediaId) return []

  const { data, error } = await supabase
    .from(TABLE)
    .select(REWATCH_SELECT)
    .eq('user_id', userId)
    .eq('media_id', mediaId)
    .order('created_at', { ascending: true })

  if (error) {
    if (isMissingTableError(error)) {
      throw new Error(
        'Table television_rewatches absente. Exécute scripts/create-television-rewatches.sql dans Supabase.',
      )
    }
    throw error
  }

  return data ?? []
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ id: string, date_start?: string|null, date_end?: string|null, collection?: string|null, media_type?: string }} media
 */
export async function startTelevisionRewatch(supabase, userId, media) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  if (!media?.id) throw new Error('Média introuvable.')
  if (!canStartTelevisionRewatch(media)) {
    throw new Error(
      'Renseigne une date de début et une date de fin avant de re-regarder ce titre.',
    )
  }

  const { data, error: insertError } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      media_id: media.id,
      date_start: media.date_start ?? null,
      date_end: media.date_end ?? null,
    })
    .select('id')
    .single()

  if (insertError) {
    if (isMissingTableError(insertError)) {
      throw new Error(
        'Table television_rewatches absente. Exécute scripts/create-television-rewatches.sql dans Supabase.',
      )
    }
    throw insertError
  }

  const rewatchId = data?.id ?? null

  if (media.media_type === 'tv') {
    await clearEpisodeProgressForMedia(supabase, userId, media.id)
  }

  const updatedMedia = await updateTelevisionMedia(supabase, userId, media.id, {
    ...mediaToEditForm(media),
    dateStart: '',
    dateEnd: '',
    collection: TELEVISION_COLLECTION_EN_COURS,
  })

  const rewatches = await listTelevisionRewatches(supabase, userId, media.id)

  return {
    media: updatedMedia,
    rewatches,
    undo: {
      rewatchId,
      previousCollection: media.collection ?? '',
      previousDateStart: normalizeDateInput(media.date_start),
      previousDateEnd: normalizeDateInput(media.date_end),
    },
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ id: string }} media
 * @param {{
 *   rewatchId?: string|null,
 *   previousCollection?: string,
 *   previousDateStart?: string,
 *   previousDateEnd?: string,
 * }|null} undo
 * @param {Array<{ id: string, date_start?: string|null, date_end?: string|null }>} [rewatches]
 */
export async function cancelTelevisionRewatch(supabase, userId, media, undo, rewatches = []) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  if (!media?.id) throw new Error('Média introuvable.')

  const resolved = resolveRewatchUndo(undo, rewatches)
  if (!resolved) throw new Error('Aucun re-regardage en cours à annuler.')

  if (resolved.rewatchId) {
    const { error: deleteError } = await supabase
      .from(TABLE)
      .delete()
      .eq('id', resolved.rewatchId)
      .eq('user_id', userId)
      .eq('media_id', media.id)

    if (deleteError) {
      if (isMissingTableError(deleteError)) {
        throw new Error(
          'Table television_rewatches absente. Exécute scripts/create-television-rewatches.sql dans Supabase.',
        )
      }
      throw deleteError
    }
  }

  const updatedMedia = await updateTelevisionMedia(supabase, userId, media.id, {
    ...mediaToEditForm(media),
    dateStart: resolved.previousDateStart,
    dateEnd: resolved.previousDateEnd,
    collection: resolved.previousCollection,
  })

  const nextRewatches = await listTelevisionRewatches(supabase, userId, media.id)

  return { media: updatedMedia, rewatches: nextRewatches }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} rewatchId
 * @param {{ dateStart?: string, dateEnd?: string }} input
 */
export async function updateTelevisionRewatch(supabase, userId, rewatchId, input) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  if (!rewatchId) throw new Error('Re-regardage introuvable.')

  const payload = {}
  if (input?.dateStart !== undefined) payload.date_start = parseOptionalDate(input.dateStart)
  if (input?.dateEnd !== undefined) payload.date_end = parseOptionalDate(input.dateEnd)

  if (!Object.keys(payload).length) {
    throw new Error('Aucune modification à enregistrer.')
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('id', rewatchId)
    .eq('user_id', userId)
    .select(REWATCH_SELECT)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error)) {
      throw new Error(
        'Table television_rewatches absente. Exécute scripts/create-television-rewatches.sql dans Supabase.',
      )
    }
    throw error
  }

  if (!data) throw new Error('Re-regardage introuvable.')
  return data
}
