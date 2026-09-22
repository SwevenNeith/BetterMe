/**
 * Trouve le prochain épisode non vu (saisons régulières uniquement, saison > 0).
 * @param {Array<{ season_number: number, episode_number: number }>} watchedRows
 * @param {Array<{ season_number?: number, episode_count?: number }>} seasons
 * @returns {{ seasonNumber: number, episodeNumber: number } | null | { complete: true }}
 */
export function resolveNextEpisode(watchedRows, seasons) {
  const watched = new Set(
    (watchedRows ?? []).map((row) => `${row.season_number}:${row.episode_number}`),
  )

  const regular = normalizeRegularSeasons(seasons)
  if (!regular.length) return null

  for (const season of regular) {
    const count = Math.max(0, season.episodeCount)
    for (let episodeNumber = 1; episodeNumber <= count; episodeNumber += 1) {
      if (!watched.has(`${season.seasonNumber}:${episodeNumber}`)) {
        return {
          seasonNumber: season.seasonNumber,
          episodeNumber,
        }
      }
    }
  }

  return { complete: true }
}

/**
 * @param {{ seasonNumber?: number, episodeNumber?: number, complete?: boolean }|null|undefined} next
 */
export function formatNextEpisodeLabel(next) {
  if (!next) return ''
  if (next.complete) return 'Série terminée'
  return `Saison ${next.seasonNumber} · Épisode ${next.episodeNumber}`
}

/**
 * @param {Array<{ season_number?: number, episode_count?: number }>} seasons
 * @returns {Array<{ seasonNumber: number, episodeCount: number }>}
 */
export function normalizeRegularSeasons(seasons) {
  return (seasons ?? [])
    .map((season) => ({
      seasonNumber: Number(season.season_number),
      episodeCount: Number(season.episode_count) || 0,
    }))
    .filter((season) => Number.isFinite(season.seasonNumber) && season.seasonNumber > 0)
    .sort((a, b) => a.seasonNumber - b.seasonNumber)
}

/**
 * Liste ordonnée des épisodes réguliers (S1E1, S1E2, … S2E1…).
 * @param {Array<{ season_number?: number, episode_count?: number }>} seasons
 * @returns {Array<{ seasonNumber: number, episodeNumber: number }>}
 */
export function buildRegularEpisodeSequence(seasons) {
  /** @type {Array<{ seasonNumber: number, episodeNumber: number }>} */
  const list = []
  for (const season of normalizeRegularSeasons(seasons)) {
    for (let episodeNumber = 1; episodeNumber <= season.episodeCount; episodeNumber += 1) {
      list.push({ seasonNumber: season.seasonNumber, episodeNumber })
    }
  }
  return list
}

/**
 * Coche : tous les épisodes jusqu’à celui-ci (inclus).
 * Décoche : celui-ci et tous les suivants.
 * Saison 0 (spéciales) : cascade limitée à cette saison.
 * @param {Array<{ season_number?: number, episode_count?: number }>} seasons
 * @param {number} seasonNumber
 * @param {number} episodeNumber
 * @param {boolean} watched
 * @param {number[]} [season0EpisodeNumbers] numéros connus si saison 0
 * @returns {Array<{ seasonNumber: number, episodeNumber: number }>}
 */
export function cascadeEpisodeTargets(
  seasons,
  seasonNumber,
  episodeNumber,
  watched,
  season0EpisodeNumbers = [],
) {
  const season = Number(seasonNumber)
  const episode = Number(episodeNumber)
  if (!Number.isFinite(season) || !Number.isFinite(episode) || episode <= 0) return []

  if (season === 0) {
    const nums = [...new Set(season0EpisodeNumbers.map(Number).filter((n) => n > 0))].sort(
      (a, b) => a - b,
    )
    if (!nums.includes(episode)) nums.push(episode)
    nums.sort((a, b) => a - b)
    const idx = nums.indexOf(episode)
    const slice = watched ? nums.slice(0, idx + 1) : nums.slice(idx)
    return slice.map((episodeNumber) => ({ seasonNumber: 0, episodeNumber }))
  }

  const sequence = buildRegularEpisodeSequence(seasons)
  let idx = sequence.findIndex(
    (item) => item.seasonNumber === season && item.episodeNumber === episode,
  )

  // Si l’épisode dépasse episode_count TMDB, l’insérer dans la séquence
  if (idx < 0) {
    const insertAt = sequence.findIndex(
      (item) =>
        item.seasonNumber > season ||
        (item.seasonNumber === season && item.episodeNumber > episode),
    )
    const entry = { seasonNumber: season, episodeNumber: episode }
    if (insertAt < 0) {
      sequence.push(entry)
      idx = sequence.length - 1
    } else {
      sequence.splice(insertAt, 0, entry)
      idx = insertAt
    }
  }

  return watched ? sequence.slice(0, idx + 1) : sequence.slice(idx)
}

/**
 * Coche toute la saison (+ saisons précédentes) / décoche la saison (+ suivantes).
 * @param {Array<{ season_number?: number, episode_count?: number }>} seasons
 * @param {number} seasonNumber
 * @param {number[]} episodeNumbers épisodes de la saison ciblée (liste chargée)
 * @param {boolean} watched
 */
export function cascadeSeasonTargets(seasons, seasonNumber, episodeNumbers, watched) {
  const season = Number(seasonNumber)
  const eps = (episodeNumbers ?? []).map(Number).filter((n) => n > 0).sort((a, b) => a - b)
  if (!Number.isFinite(season) || !eps.length) return []

  if (season === 0) {
    return cascadeEpisodeTargets(seasons, 0, watched ? eps[eps.length - 1] : eps[0], watched, eps)
  }

  if (watched) {
    return cascadeEpisodeTargets(seasons, season, eps[eps.length - 1], true)
  }
  return cascadeEpisodeTargets(seasons, season, eps[0], false)
}
