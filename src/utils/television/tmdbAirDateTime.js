/**
 * Parsing des dates / horaires TMDB pour les notifications Télévision.
 *
 * En pratique TMDB ne donne souvent que YYYY-MM-DD (pas d’heure).
 * Quand un ISO datetime non-minuit est présent (ex. release_dates films),
 * on le conserve comme instant absolu (le fuseau appareil s’applique à l’affichage / envoi).
 */

/**
 * @param {unknown} value
 * @returns {string|null} YYYY-MM-DD
 */
export function parseTmdbDateKey(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return null
  const key = trimmed.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null
}

/**
 * @param {unknown} raw
 * @returns {{
 *   dateKey: string|null,
 *   hasClockTime: boolean,
 *   instantIso: string|null,
 * }}
 */
export function parseTmdbDateTime(raw) {
  const text = String(raw ?? '').trim()
  if (!text) {
    return { dateKey: null, hasClockTime: false, instantIso: null }
  }

  // Date seule : YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return { dateKey: text, hasClockTime: false, instantIso: null }
  }

  const parsed = new Date(text)
  if (!Number.isFinite(parsed.getTime())) {
    const fallback = parseTmdbDateKey(text)
    return { dateKey: fallback, hasClockTime: false, instantIso: null }
  }

  // Minuit exact (UTC ou local selon parsing) → souvent « date sans heure »
  const isUtcMidnight =
    /T00:00:00(\.0+)?(Z|[+-]00:00)?$/i.test(text.replace(/\s+/g, '')) ||
    (text.includes('T') &&
      parsed.getUTCHours() === 0 &&
      parsed.getUTCMinutes() === 0 &&
      parsed.getUTCSeconds() === 0)

  const dateKey =
    parseTmdbDateKey(text) ||
    `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`

  if (isUtcMidnight || !text.includes('T')) {
    return { dateKey, hasClockTime: false, instantIso: null }
  }

  return {
    dateKey,
    hasClockTime: true,
    instantIso: parsed.toISOString(),
  }
}

const MOVIE_RELEASE_TYPE_PRIORITY = [3, 4, 2, 1, 5, 6] // theatrical, digital, limited, premiere…

/**
 * Choisit la meilleure date/heure de sortie film depuis append release_dates.
 * Préfère FR puis US puis le reste.
 * @param {object} tmdbDoc
 * @returns {{ dateKey: string|null, instantIso: string|null }}
 */
export function extractMovieReleaseDateTime(tmdbDoc) {
  const results = Array.isArray(tmdbDoc?.release_dates?.results)
    ? tmdbDoc.release_dates.results
    : []

  const preferredRegions = ['FR', 'US', 'GB', 'CA', 'BE', 'CH']
  const regionRank = (iso) => {
    const idx = preferredRegions.indexOf(String(iso || '').toUpperCase())
    return idx === -1 ? preferredRegions.length + 1 : idx
  }

  /** @type {Array<{ dateKey: string|null, instantIso: string|null, type: number, regionRank: number }>} */
  const candidates = []

  for (const country of results) {
    const region = String(country?.iso_3166_1 || '').toUpperCase()
    const entries = Array.isArray(country?.release_dates) ? country.release_dates : []
    for (const entry of entries) {
      const type = Number(entry?.type)
      const parsed = parseTmdbDateTime(entry?.release_date)
      if (!parsed.dateKey) continue
      candidates.push({
        dateKey: parsed.dateKey,
        instantIso: parsed.hasClockTime ? parsed.instantIso : null,
        type: Number.isFinite(type) ? type : 99,
        regionRank: regionRank(region),
      })
    }
  }

  if (candidates.length) {
    candidates.sort((a, b) => {
      const typeA = MOVIE_RELEASE_TYPE_PRIORITY.indexOf(a.type)
      const typeB = MOVIE_RELEASE_TYPE_PRIORITY.indexOf(b.type)
      const rankTypeA = typeA === -1 ? MOVIE_RELEASE_TYPE_PRIORITY.length : typeA
      const rankTypeB = typeB === -1 ? MOVIE_RELEASE_TYPE_PRIORITY.length : typeB
      if (rankTypeA !== rankTypeB) return rankTypeA - rankTypeB
      if (a.regionRank !== b.regionRank) return a.regionRank - b.regionRank
      // Préférer une vraie heure si dispo
      if (Boolean(a.instantIso) !== Boolean(b.instantIso)) {
        return a.instantIso ? -1 : 1
      }
      return String(a.dateKey).localeCompare(String(b.dateKey))
    })
    return {
      dateKey: candidates[0].dateKey,
      instantIso: candidates[0].instantIso,
    }
  }

  const primary = parseTmdbDateTime(tmdbDoc?.release_date)
  return {
    dateKey: primary.dateKey,
    instantIso: primary.hasClockTime ? primary.instantIso : null,
  }
}

/**
 * Extrait date (+ heure rare) depuis next/last_episode_to_air.
 * @param {object|null|undefined} episode
 */
export function extractEpisodeAirDateTime(episode) {
  if (!episode || typeof episode !== 'object') {
    return { dateKey: null, instantIso: null }
  }

  // Champs éventuels futurs / peu documentés
  const rawTime =
    episode.air_datetime ||
    episode.air_date_time ||
    episode.airs_at ||
    episode.air_time ||
    null

  if (rawTime) {
    // air_time parfois "20:00" sans date
    if (/^\d{1,2}:\d{2}/.test(String(rawTime)) && episode.air_date) {
      const dateKey = parseTmdbDateKey(episode.air_date)
      if (dateKey) {
        const [hRaw, mRaw] = String(rawTime).trim().split(':')
        const h = String(Math.min(23, Math.max(0, parseInt(hRaw, 10) || 0))).padStart(2, '0')
        const m = String(Math.min(59, Math.max(0, parseInt(mRaw, 10) || 0))).padStart(2, '0')
        // Interprété en heure locale appareil
        const local = new Date(
          Number(dateKey.slice(0, 4)),
          Number(dateKey.slice(5, 7)) - 1,
          Number(dateKey.slice(8, 10)),
          Number(h),
          Number(m),
          0,
          0,
        )
        return {
          dateKey,
          instantIso: Number.isFinite(local.getTime()) ? local.toISOString() : null,
        }
      }
    }

    const parsed = parseTmdbDateTime(rawTime)
    if (parsed.dateKey) {
      return {
        dateKey: parsed.dateKey,
        instantIso: parsed.hasClockTime ? parsed.instantIso : null,
      }
    }
  }

  const fromAirDate = parseTmdbDateTime(episode.air_date)
  return {
    dateKey: fromAirDate.dateKey,
    instantIso: fromAirDate.hasClockTime ? fromAirDate.instantIso : null,
  }
}
