import { ensureTelevisionCollection } from './televisionCollections.js'
import { tmdbPosterUrl } from './tmdb.js'

const TABLE = 'television_media'

export const MEDIA_SELECT =
  'id, user_id, media_type, tmdb_id, title, original_title, poster_path, overview, collection, date_start, date_end, rating, comments, is_favorite, created_at, updated_at'

function isMissingTableError(error) {
  return (
    error?.code === 'PGRST205' ||
    (typeof error?.message === 'string' && error.message.includes('television_media'))
  )
}

function isMissingFavoriteColumnError(error) {
  return (
    error?.code === 'PGRST204' ||
    (typeof error?.message === 'string' &&
      error.message.toLowerCase().includes('is_favorite'))
  )
}

function missingTableMessage() {
  return 'Table television_media absente. Exécute scripts/create-television-media.sql dans Supabase.'
}

function missingFavoriteColumnMessage() {
  return 'Colonne is_favorite absente. Exécute scripts/alter-television-media-favorite.sql dans Supabase.'
}

function throwMediaError(error) {
  if (isMissingFavoriteColumnError(error)) throw new Error(missingFavoriteColumnMessage())
  if (isMissingTableError(error)) throw new Error(missingTableMessage())
  throw error
}

function normalizeMediaType(value) {
  const type = String(value ?? '')
    .trim()
    .toLowerCase()
  if (type === 'tv') return 'tv'
  if (type === 'movie') return 'movie'
  return null
}

function parseOptionalDate(value) {
  const trimmed = String(value ?? '').trim()
  return trimmed ? trimmed.slice(0, 10) : null
}

function parseOptionalRating(value) {
  if (value === '' || value == null) return null
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return Math.min(10, Math.max(0, Math.round(num * 10) / 10))
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * @param {object} row
 */
export function withPosterUrl(row) {
  if (!row) return row
  return {
    ...row,
    is_favorite: Boolean(row.is_favorite),
    posterUrl: tmdbPosterUrl(row.poster_path, 'w342'),
  }
}

/**
 * @param {object} tmdbDoc
 */
export function titleFromTmdbDoc(tmdbDoc) {
  return (
    String(tmdbDoc?.title || tmdbDoc?.name || '').trim() ||
    String(tmdbDoc?.original_title || tmdbDoc?.original_name || '').trim() ||
    'Sans titre'
  )
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string|null|undefined} rawCollection
 */
async function resolveCollectionName(supabase, userId, rawCollection) {
  const name = String(rawCollection ?? '').trim()
  if (!name) return null
  return ensureTelevisionCollection(supabase, userId, name)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listTelevisionMedia(supabase, userId) {
  if (!userId) return []

  const { data, error } = await supabase
    .from(TABLE)
    .select(MEDIA_SELECT)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) throwMediaError(error)

  return (data ?? []).map(withPosterUrl)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {'movie'|'tv'} mediaType
 * @param {number|string} tmdbId
 */
export async function getTelevisionMediaByTmdb(supabase, userId, mediaType, tmdbId) {
  if (!userId) return null
  const type = normalizeMediaType(mediaType)
  const id = Number.parseInt(String(tmdbId), 10)
  if (!type || !Number.isFinite(id) || id <= 0) return null

  const { data, error } = await supabase
    .from(TABLE)
    .select(MEDIA_SELECT)
    .eq('user_id', userId)
    .eq('media_type', type)
    .eq('tmdb_id', id)
    .maybeSingle()

  if (error) throwMediaError(error)

  return data ? withPosterUrl(data) : null
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} mediaId
 */
export async function getTelevisionMediaById(supabase, userId, mediaId) {
  if (!userId || !mediaId) return null

  const { data, error } = await supabase
    .from(TABLE)
    .select(MEDIA_SELECT)
    .eq('user_id', userId)
    .eq('id', mediaId)
    .maybeSingle()

  if (error) throwMediaError(error)

  return data ? withPosterUrl(data) : null
}

/**
 * Ajoute ou met à jour un média depuis une fiche / résultat TMDB.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object} tmdbDoc
 * @param {{
 *   collection?: string|null,
 *   dateStart?: string|null,
 *   dateEnd?: string|null,
 *   rating?: number|string|null,
 *   comments?: string|null,
 * }} [extras]
 */
export async function upsertTelevisionMediaFromTmdb(supabase, userId, tmdbDoc, extras = {}) {
  if (!userId) throw new Error('Utilisateur non connecté.')

  const mediaType = normalizeMediaType(tmdbDoc?.media_type ?? tmdbDoc?.mediaType)
  const tmdbId = Number.parseInt(String(tmdbDoc?.id ?? tmdbDoc?.tmdb_id ?? ''), 10)
  if (!mediaType) throw new Error('Type de média invalide (movie ou tv).')
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) throw new Error('Identifiant TMDB invalide.')

  const collection = await resolveCollectionName(supabase, userId, extras.collection)
  const title = titleFromTmdbDoc(tmdbDoc)
  const originalTitle =
    String(tmdbDoc?.original_title || tmdbDoc?.original_name || '').trim() || null
  const posterPath = String(tmdbDoc?.poster_path ?? '').trim() || null
  const overview = String(tmdbDoc?.overview ?? '').trim() || null

  let dateStart = extras.dateStart !== undefined ? parseOptionalDate(extras.dateStart) : undefined
  let dateEnd = extras.dateEnd !== undefined ? parseOptionalDate(extras.dateEnd) : undefined

  if (collection === 'En cours' && dateStart === undefined) {
    dateStart = todayIsoDate()
  }
  if (collection === 'Terminé') {
    if (dateStart === undefined) dateStart = todayIsoDate()
    if (dateEnd === undefined) dateEnd = todayIsoDate()
  }

  const existing = await getTelevisionMediaByTmdb(supabase, userId, mediaType, tmdbId)

  if (existing) {
    const patch = {
      title,
      original_title: originalTitle,
      poster_path: posterPath ?? existing.poster_path,
      overview: overview ?? existing.overview,
      updated_at: new Date().toISOString(),
    }
    if (collection != null) patch.collection = collection
    if (dateStart !== undefined) patch.date_start = dateStart
    if (dateEnd !== undefined) patch.date_end = dateEnd
    if (extras.rating !== undefined) patch.rating = parseOptionalRating(extras.rating)
    if (extras.comments !== undefined) patch.comments = String(extras.comments ?? '').trim() || null

    const { data, error } = await supabase
      .from(TABLE)
      .update(patch)
      .eq('id', existing.id)
      .eq('user_id', userId)
      .select(MEDIA_SELECT)
      .single()

    if (error) throwMediaError(error)
    return withPosterUrl(data)
  }

  const insertPayload = {
    user_id: userId,
    media_type: mediaType,
    tmdb_id: tmdbId,
    title,
    original_title: originalTitle,
    poster_path: posterPath,
    overview,
    collection,
    date_start: dateStart ?? null,
    date_end: dateEnd ?? null,
    rating: extras.rating !== undefined ? parseOptionalRating(extras.rating) : null,
    comments: extras.comments !== undefined ? String(extras.comments ?? '').trim() || null : null,
    is_favorite: false,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert(insertPayload)
    .select(MEDIA_SELECT)
    .single()

  if (error) throwMediaError(error)

  return withPosterUrl(data)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} mediaId
 * @param {{
 *   collection?: string|null,
 *   dateStart?: string|null,
 *   dateEnd?: string|null,
 *   rating?: number|string|null,
 *   comments?: string|null,
 *   title?: string,
 *   isFavorite?: boolean,
 * }} input
 */
export async function updateTelevisionMedia(supabase, userId, mediaId, input = {}) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  if (!mediaId) throw new Error('Média introuvable.')

  const patch = { updated_at: new Date().toISOString() }

  if (input.collection !== undefined) {
    patch.collection = await resolveCollectionName(supabase, userId, input.collection)
  }
  if (input.dateStart !== undefined) patch.date_start = parseOptionalDate(input.dateStart)
  if (input.dateEnd !== undefined) patch.date_end = parseOptionalDate(input.dateEnd)
  if (input.rating !== undefined) patch.rating = parseOptionalRating(input.rating)
  if (input.comments !== undefined) patch.comments = String(input.comments ?? '').trim() || null
  if (input.isFavorite !== undefined) patch.is_favorite = Boolean(input.isFavorite)
  if (input.title !== undefined) {
    const title = String(input.title ?? '').trim()
    if (title) patch.title = title
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', mediaId)
    .eq('user_id', userId)
    .select(MEDIA_SELECT)
    .maybeSingle()

  if (error) throwMediaError(error)
  if (!data) throw new Error('Média introuvable.')
  return withPosterUrl(data)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} mediaId
 */
export async function deleteTelevisionMedia(supabase, userId, mediaId) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  if (!mediaId) throw new Error('Média introuvable.')

  const { error } = await supabase.from(TABLE).delete().eq('id', mediaId).eq('user_id', userId)

  if (error) throwMediaError(error)
}

/**
 * Formulaire d’édition minimal (compatible update / rewatch).
 * @param {object} media
 */
export function mediaToEditForm(media) {
  return {
    collection: media?.collection ?? '',
    dateStart: media?.date_start ?? media?.dateStart ?? '',
    dateEnd: media?.date_end ?? media?.dateEnd ?? '',
    rating: media?.rating ?? '',
    comments: media?.comments ?? '',
    title: media?.title ?? '',
  }
}
