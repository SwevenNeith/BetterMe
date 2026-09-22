const TABLE = 'television_episode_progress'

const SELECT = 'id, user_id, media_id, season_number, episode_number, watched_at, created_at'

function isMissingTableError(error) {
  return (
    error?.code === 'PGRST205' ||
    (typeof error?.message === 'string' && error.message.includes('television_episode_progress'))
  )
}

function missingTableMessage() {
  return 'Table television_episode_progress absente. Exécute scripts/create-television-episode-progress.sql dans Supabase.'
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} mediaId
 */
export async function listEpisodeProgress(supabase, userId, mediaId) {
  if (!userId || !mediaId) return []

  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT)
    .eq('user_id', userId)
    .eq('media_id', mediaId)
    .order('season_number', { ascending: true })
    .order('episode_number', { ascending: true })

  if (error) {
    if (isMissingTableError(error)) throw new Error(missingTableMessage())
    throw error
  }

  return data ?? []
}

/**
 * Progression pour plusieurs médias (Ma télé · En cours).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string[]} mediaIds
 * @returns {Promise<Map<string, Array<object>>>}
 */
export async function listEpisodeProgressByMediaIds(supabase, userId, mediaIds) {
  /** @type {Map<string, Array<object>>} */
  const map = new Map()
  if (!userId || !mediaIds?.length) return map

  const ids = [...new Set(mediaIds.filter(Boolean))]
  for (const id of ids) map.set(id, [])

  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT)
    .eq('user_id', userId)
    .in('media_id', ids)
    .order('season_number', { ascending: true })
    .order('episode_number', { ascending: true })

  if (error) {
    if (isMissingTableError(error)) throw new Error(missingTableMessage())
    throw error
  }

  for (const row of data ?? []) {
    const list = map.get(row.media_id) ?? []
    list.push(row)
    map.set(row.media_id, list)
  }

  return map
}

/**
 * @param {Array<{ season_number: number, episode_number: number }>} rows
 * @returns {Set<string>}
 */
export function episodeProgressKeySet(rows) {
  return new Set(
    (rows ?? []).map((row) => `${row.season_number}:${row.episode_number}`),
  )
}

export function episodeKey(seasonNumber, episodeNumber) {
  return `${seasonNumber}:${episodeNumber}`
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} mediaId
 * @param {number} seasonNumber
 * @param {number} episodeNumber
 * @param {boolean} watched
 */
export async function setEpisodeWatched(
  supabase,
  userId,
  mediaId,
  seasonNumber,
  episodeNumber,
  watched,
) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  if (!mediaId) throw new Error('Média introuvable.')

  const season = Number(seasonNumber)
  const episode = Number(episodeNumber)
  if (!Number.isFinite(season) || season < 0) throw new Error('Saison invalide.')
  if (!Number.isFinite(episode) || episode <= 0) throw new Error('Épisode invalide.')

  if (watched) {
    const { data, error } = await supabase
      .from(TABLE)
      .upsert(
        {
          user_id: userId,
          media_id: mediaId,
          season_number: season,
          episode_number: episode,
          watched_at: new Date().toISOString(),
        },
        { onConflict: 'media_id,season_number,episode_number' },
      )
      .select(SELECT)
      .single()

    if (error) {
      if (isMissingTableError(error)) throw new Error(missingTableMessage())
      throw error
    }
    return data
  }

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('media_id', mediaId)
    .eq('season_number', season)
    .eq('episode_number', episode)

  if (error) {
    if (isMissingTableError(error)) throw new Error(missingTableMessage())
    throw error
  }
  return null
}

/**
 * Coche / décoche une liste d’épisodes (plusieurs saisons possibles).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} mediaId
 * @param {Array<{ seasonNumber: number, episodeNumber: number }>} episodes
 * @param {boolean} watched
 */
export async function setEpisodesWatchedBatch(supabase, userId, mediaId, episodes, watched) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  if (!mediaId) throw new Error('Média introuvable.')

  /** @type {Array<{ seasonNumber: number, episodeNumber: number }>} */
  const targets = []
  const seen = new Set()
  for (const item of episodes ?? []) {
    const seasonNumber = Number(item?.seasonNumber)
    const episodeNumber = Number(item?.episodeNumber)
    if (!Number.isFinite(seasonNumber) || seasonNumber < 0) continue
    if (!Number.isFinite(episodeNumber) || episodeNumber <= 0) continue
    const key = episodeKey(seasonNumber, episodeNumber)
    if (seen.has(key)) continue
    seen.add(key)
    targets.push({ seasonNumber, episodeNumber })
  }

  if (!targets.length) return listEpisodeProgress(supabase, userId, mediaId)

  if (watched) {
    const now = new Date().toISOString()
    const rows = targets.map(({ seasonNumber, episodeNumber }) => ({
      user_id: userId,
      media_id: mediaId,
      season_number: seasonNumber,
      episode_number: episodeNumber,
      watched_at: now,
    }))

    const { error } = await supabase
      .from(TABLE)
      .upsert(rows, { onConflict: 'media_id,season_number,episode_number' })

    if (error) {
      if (isMissingTableError(error)) throw new Error(missingTableMessage())
      throw error
    }
  } else {
    /** @type {Map<number, number[]>} */
    const bySeason = new Map()
    for (const { seasonNumber, episodeNumber } of targets) {
      const list = bySeason.get(seasonNumber) ?? []
      list.push(episodeNumber)
      bySeason.set(seasonNumber, list)
    }

    for (const [seasonNumber, episodeNumbers] of bySeason) {
      const { error } = await supabase
        .from(TABLE)
        .delete()
        .eq('user_id', userId)
        .eq('media_id', mediaId)
        .eq('season_number', seasonNumber)
        .in('episode_number', episodeNumbers)

      if (error) {
        if (isMissingTableError(error)) throw new Error(missingTableMessage())
        throw error
      }
    }
  }

  return listEpisodeProgress(supabase, userId, mediaId)
}

/**
 * Coche / décoche tous les épisodes d’une saison.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} mediaId
 * @param {number} seasonNumber
 * @param {number[]} episodeNumbers
 * @param {boolean} watched
 */
export async function setSeasonWatched(
  supabase,
  userId,
  mediaId,
  seasonNumber,
  episodeNumbers,
  watched,
) {
  const season = Number(seasonNumber)
  const episodes = (episodeNumbers ?? [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((episodeNumber) => ({ seasonNumber: season, episodeNumber }))

  return setEpisodesWatchedBatch(supabase, userId, mediaId, episodes, watched)
}

/**
 * Réinitialise le progrès épisodes (nouveau re-regardage).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} mediaId
 */
export async function clearEpisodeProgressForMedia(supabase, userId, mediaId) {
  if (!userId || !mediaId) return

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('media_id', mediaId)

  if (error) {
    if (isMissingTableError(error)) throw new Error(missingTableMessage())
    throw error
  }
}
