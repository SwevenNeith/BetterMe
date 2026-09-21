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

  const regular = (seasons ?? [])
    .map((season) => ({
      seasonNumber: Number(season.season_number),
      episodeCount: Number(season.episode_count) || 0,
    }))
    .filter((season) => Number.isFinite(season.seasonNumber) && season.seasonNumber > 0)
    .sort((a, b) => a.seasonNumber - b.seasonNumber)

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
