import { ensureTelevisionCollection } from './televisionCollections.js'
import { tmdbPosterUrl } from './tmdb.js'
import {
  extractEpisodeAirDateTime,
  extractMovieReleaseDateTime,
  parseTmdbDateKey,
} from '../../utils/television/tmdbAirDateTime.js'

const TABLE = 'television_media'

export const MEDIA_SELECT =
  'id, user_id, media_type, tmdb_id, title, original_title, poster_path, overview, collection, date_start, date_end, rating, comments, is_favorite, tmdb_release_date, tmdb_release_at, tmdb_next_air_date, tmdb_next_air_at, tmdb_next_season, tmdb_next_episode, tmdb_next_episode_name, tmdb_air_dates_synced_at, created_at, updated_at'

export const MEDIA_SELECT_DATES_NO_TIME =
  'id, user_id, media_type, tmdb_id, title, original_title, poster_path, overview, collection, date_start, date_end, rating, comments, is_favorite, tmdb_release_date, tmdb_next_air_date, tmdb_next_season, tmdb_next_episode, tmdb_next_episode_name, tmdb_air_dates_synced_at, created_at, updated_at'

export const MEDIA_SELECT_LEGACY =
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

function isMissingAirDatesColumnError(error) {
  const message = String(error?.message ?? '').toLowerCase()
  return (
    (error?.code === 'PGRST204' || error?.code === '42703') &&
    (message.includes('tmdb_release_date') ||
      message.includes('tmdb_release_at') ||
      message.includes('tmdb_next_air_date') ||
      message.includes('tmdb_next_air_at') ||
      message.includes('tmdb_air_dates_synced_at') ||
      message.includes('tmdb_next_season') ||
      message.includes('tmdb_next_episode'))
  )
}

function isMissingAirTimeColumnError(error) {
  const message = String(error?.message ?? '').toLowerCase()
  return (
    (error?.code === 'PGRST204' || error?.code === '42703') &&
    (message.includes('tmdb_release_at') || message.includes('tmdb_next_air_at'))
  )
}

function missingTableMessage() {
  return 'Table television_media absente. Exécute scripts/create-television-media.sql dans Supabase.'
}

function missingFavoriteColumnMessage() {
  return 'Colonne is_favorite absente. Exécute scripts/alter-television-media-favorite.sql dans Supabase.'
}

function missingAirDatesColumnMessage() {
  return 'Colonnes dates TMDB absentes. Exécute scripts/alter-television-media-tmdb-air-dates.sql dans Supabase.'
}

function throwMediaError(error) {
  if (isMissingAirDatesColumnError(error)) throw new Error(missingAirDatesColumnMessage())
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
  return parseTmdbDateKey(value)
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
 * Extrait les dates utiles aux notifications depuis une fiche TMDB.
 * @param {object} tmdbDoc
 * @param {'movie'|'tv'|null} [mediaType]
 */
export function airDatesFromTmdbDoc(tmdbDoc, mediaType = null) {
  const type = mediaType || normalizeMediaType(tmdbDoc?.media_type ?? tmdbDoc?.mediaType)
  const next = tmdbDoc?.next_episode_to_air
  const last = tmdbDoc?.last_episode_to_air

  let releaseDate = null
  let releaseAt = null
  if (type === 'movie') {
    const movieRelease = extractMovieReleaseDateTime(tmdbDoc)
    releaseDate = movieRelease.dateKey
    releaseAt = movieRelease.instantIso
  } else if (type === 'tv') {
    releaseDate = parseOptionalDate(tmdbDoc?.first_air_date)
  }

  let episodeSource = next
  let nextAir = extractEpisodeAirDateTime(next)
  if (!nextAir.dateKey) {
    episodeSource = last
    nextAir = extractEpisodeAirDateTime(last)
  }

  const nextSeason = episodeSource?.season_number != null ? Number(episodeSource.season_number) : null
  const nextEpisode =
    episodeSource?.episode_number != null ? Number(episodeSource.episode_number) : null
  const nextName = String(episodeSource?.name ?? '').trim() || null

  return {
    tmdb_release_date: releaseDate,
    tmdb_release_at: type === 'movie' ? releaseAt : null,
    tmdb_next_air_date: type === 'tv' ? nextAir.dateKey : null,
    tmdb_next_air_at: type === 'tv' ? nextAir.instantIso : null,
    tmdb_next_season:
      type === 'tv' && Number.isFinite(nextSeason) && nextSeason >= 0 ? nextSeason : null,
    tmdb_next_episode:
      type === 'tv' && Number.isFinite(nextEpisode) && nextEpisode > 0 ? nextEpisode : null,
    tmdb_next_episode_name: type === 'tv' ? nextName : null,
    tmdb_air_dates_synced_at: new Date().toISOString(),
  }
}

/**
 * @param {object} row
 */
export function withPosterUrl(row) {
  if (!row) return row
  return {
    ...row,
    is_favorite: Boolean(row.is_favorite),
    tmdb_release_date: row.tmdb_release_date ?? null,
    tmdb_release_at: row.tmdb_release_at ?? null,
    tmdb_next_air_date: row.tmdb_next_air_date ?? null,
    tmdb_next_air_at: row.tmdb_next_air_at ?? null,
    tmdb_next_season: row.tmdb_next_season ?? null,
    tmdb_next_episode: row.tmdb_next_episode ?? null,
    tmdb_next_episode_name: row.tmdb_next_episode_name ?? null,
    tmdb_air_dates_synced_at: row.tmdb_air_dates_synced_at ?? null,
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

async function selectMedia(supabase, build) {
  let result = await build(MEDIA_SELECT)
  if (result.error && isMissingAirTimeColumnError(result.error)) {
    result = await build(MEDIA_SELECT_DATES_NO_TIME)
  }
  if (result.error && isMissingAirDatesColumnError(result.error)) {
    result = await build(MEDIA_SELECT_LEGACY)
  }
  return result
}

function stripAirDateFields(payload) {
  const next = { ...payload }
  delete next.tmdb_release_date
  delete next.tmdb_release_at
  delete next.tmdb_next_air_date
  delete next.tmdb_next_air_at
  delete next.tmdb_next_season
  delete next.tmdb_next_episode
  delete next.tmdb_next_episode_name
  delete next.tmdb_air_dates_synced_at
  return next
}

function stripAirTimeFields(payload) {
  const next = { ...payload }
  delete next.tmdb_release_at
  delete next.tmdb_next_air_at
  return next
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listTelevisionMedia(supabase, userId) {
  if (!userId) return []

  const { data, error } = await selectMedia(supabase, (columns) =>
    supabase
      .from(TABLE)
      .select(columns)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false }),
  )

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

  const { data, error } = await selectMedia(supabase, (columns) =>
    supabase
      .from(TABLE)
      .select(columns)
      .eq('user_id', userId)
      .eq('media_type', type)
      .eq('tmdb_id', id)
      .maybeSingle(),
  )

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

  const { data, error } = await selectMedia(supabase, (columns) =>
    supabase
      .from(TABLE)
      .select(columns)
      .eq('user_id', userId)
      .eq('id', mediaId)
      .maybeSingle(),
  )

  if (error) throwMediaError(error)

  return data ? withPosterUrl(data) : null
}

/**
 * Persiste les dates TMDB sur une ligne existante (ignore si colonnes absentes).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} mediaId
 * @param {ReturnType<typeof airDatesFromTmdbDoc>} airDates
 */
export async function updateTelevisionMediaAirDates(supabase, userId, mediaId, airDates) {
  if (!userId || !mediaId || !airDates) return null

  const { data, error } = await supabase
    .from(TABLE)
    .update({
      ...airDates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', mediaId)
    .eq('user_id', userId)
    .select(MEDIA_SELECT)
    .maybeSingle()

  if (error) {
    if (isMissingAirDatesColumnError(error)) return null
    throwMediaError(error)
  }
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
  const airDates = airDatesFromTmdbDoc(tmdbDoc, mediaType)

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
      ...airDates,
    }
    if (collection != null) patch.collection = collection
    if (dateStart !== undefined) patch.date_start = dateStart
    if (dateEnd !== undefined) patch.date_end = dateEnd
    if (extras.rating !== undefined) patch.rating = parseOptionalRating(extras.rating)
    if (extras.comments !== undefined) patch.comments = String(extras.comments ?? '').trim() || null

    let { data, error } = await supabase
      .from(TABLE)
      .update(patch)
      .eq('id', existing.id)
      .eq('user_id', userId)
      .select(MEDIA_SELECT)
      .single()

    if (error && isMissingAirTimeColumnError(error)) {
      const noTimePatch = stripAirTimeFields(patch)
      ;({ data, error } = await supabase
        .from(TABLE)
        .update(noTimePatch)
        .eq('id', existing.id)
        .eq('user_id', userId)
        .select(MEDIA_SELECT_DATES_NO_TIME)
        .single())
    }

    if (error && isMissingAirDatesColumnError(error)) {
      const legacyPatch = stripAirDateFields(patch)
      ;({ data, error } = await supabase
        .from(TABLE)
        .update(legacyPatch)
        .eq('id', existing.id)
        .eq('user_id', userId)
        .select(MEDIA_SELECT_LEGACY)
        .single())
    }

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
    ...airDates,
  }

  let { data, error } = await supabase
    .from(TABLE)
    .insert(insertPayload)
    .select(MEDIA_SELECT)
    .single()

  if (error && isMissingAirTimeColumnError(error)) {
    ;({ data, error } = await supabase
      .from(TABLE)
      .insert(stripAirTimeFields(insertPayload))
      .select(MEDIA_SELECT_DATES_NO_TIME)
      .single())
  }

  if (error && isMissingAirDatesColumnError(error)) {
    ;({ data, error } = await supabase
      .from(TABLE)
      .insert(stripAirDateFields(insertPayload))
      .select(MEDIA_SELECT_LEGACY)
      .single())
  }

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

  const { data, error } = await selectMedia(supabase, (columns) =>
    supabase
      .from(TABLE)
      .update(patch)
      .eq('id', mediaId)
      .eq('user_id', userId)
      .select(columns)
      .maybeSingle(),
  )

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
