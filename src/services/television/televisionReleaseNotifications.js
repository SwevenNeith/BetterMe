import { supabase } from '../../lib/supabase.js'
import {
  TELEVISION_COLLECTION_TERMINE,
} from './televisionCollections.js'
import {
  airDatesFromTmdbDoc,
  listTelevisionMedia,
  updateTelevisionMediaAirDates,
} from './televisionMedia.js'
import { getTmdbDetails } from './tmdb.js'
import {
  dateTimeLocalToDate,
  deletePendingByKindPrefix,
  getLocalTodayISO,
  insertPendingNotifications,
} from '../common/scheduledReminders.js'

/** Prefixe kind — l’id média est dans kind (event_id = FK EDT). */
export const TELEVISION_MOVIE_RELEASE_PREFIX = 'television_movie_release:'
export const TELEVISION_EPISODE_AIR_PREFIX = 'television_episode_air:'

export const TELEVISION_NOTIFICATION_TIME = '09:00'

const SYNC_COOLDOWN_MS = 30 * 60 * 1000
const AIR_DATES_STALE_MS = 12 * 60 * 60 * 1000
const TMDB_CONCURRENCY = 3

/** @type {Map<string, number>} */
const lastSyncAtByUser = new Map()
/** @type {Set<string>} */
const syncInFlight = new Set()

function movieReleaseKind(mediaId) {
  return `${TELEVISION_MOVIE_RELEASE_PREFIX}${mediaId}`
}

function episodeAirKind(mediaId) {
  return `${TELEVISION_EPISODE_AIR_PREFIX}${mediaId}`
}

function isFinishedCollection(collection) {
  return String(collection ?? '').trim() === TELEVISION_COLLECTION_TERMINE
}

/** Médias à synchroniser (dates TMDB). Inclut les séries Terminé (retour possible). */
function shouldTrackMedia(row) {
  if (row?.media_type === 'movie') {
    // Films terminés : plus de notif de sortie
    return !isFinishedCollection(row.collection)
  }
  if (row?.media_type === 'tv') return true
  return false
}

/**
 * Médias pour lesquels planifier une notif.
 * Séries Terminé : seulement s’il reste une diffusion à venir / aujourd’hui.
 */
function shouldScheduleMedia(row, today) {
  if (row?.media_type === 'movie') {
    return !isFinishedCollection(row.collection)
  }
  if (row?.media_type === 'tv') {
    if (!isFinishedCollection(row.collection)) return true
    const air = String(row.tmdb_next_air_date ?? '').slice(0, 10)
    return Boolean(air && air >= today)
  }
  return false
}

function needsAirDateRefresh(row, today, nowMs) {
  // Séries terminées : rafraîchir plus souvent pour détecter un retour / nouvelle saison
  const finishedTv = row.media_type === 'tv' && isFinishedCollection(row.collection)
  const staleMs = finishedTv ? Math.min(AIR_DATES_STALE_MS, 6 * 60 * 60 * 1000) : AIR_DATES_STALE_MS

  if (row.media_type === 'movie' && !row.tmdb_release_date) return true
  if (row.media_type === 'tv' && !row.tmdb_next_air_date) return true

  const syncedAt = row.tmdb_air_dates_synced_at
    ? new Date(row.tmdb_air_dates_synced_at).getTime()
    : 0
  if (!Number.isFinite(syncedAt) || syncedAt <= 0) return true
  if (nowMs - syncedAt > staleMs) return true

  if (
    row.media_type === 'tv' &&
    row.tmdb_next_air_date &&
    String(row.tmdb_next_air_date).slice(0, 10) < today
  ) {
    return true
  }

  return false
}

/**
 * @param {string} userId
 * @param {{
 *   kind: string,
 *   title: string,
 *   body: string,
 *   dateKey: string,
 *   hhmm?: string,
 *   instantIso?: string|null,
 *   nowMs: number,
 *   today: string,
 * }} opts
 */
function buildTelevisionNotifRow(userId, opts) {
  const day = String(opts.dateKey ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  if (day < opts.today) return null

  let when
  const instant = String(opts.instantIso ?? '').trim()
  if (instant) {
    when = new Date(instant)
  } else {
    const hhmm = opts.hhmm || TELEVISION_NOTIFICATION_TIME
    when = dateTimeLocalToDate(day, hhmm)
  }

  let ms = when.getTime()
  if (!Number.isFinite(ms)) return null

  // Jour J déjà passé l’heure prévue → envoi quasi immédiat (cron / client)
  const whenLocalDay = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`
  if ((day === opts.today || whenLocalDay === opts.today) && ms <= opts.nowMs) {
    when = new Date(opts.nowMs + 20_000)
    ms = when.getTime()
  } else if (ms <= opts.nowMs) {
    return null
  }

  return {
    user_id: userId,
    event_id: null,
    kind: opts.kind,
    title: opts.title,
    body: opts.body,
    scheduled_at: when.toISOString(),
    sent: false,
  }
}

function formatEpisodeLabel(row) {
  const season = row.tmdb_next_season
  const episode = row.tmdb_next_episode
  const name = String(row.tmdb_next_episode_name ?? '').trim()
  const parts = []
  if (season != null && episode != null) {
    parts.push(`S${season}E${episode}`)
  }
  if (name) parts.push(`« ${name} »`)
  return parts.join(' ')
}

/**
 * Rafraîchit les dates TMDB d’un média (détails film/série).
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} userId
 * @param {object} row
 */
async function refreshMediaAirDates(client, userId, row) {
  try {
    const details = await getTmdbDetails(row.media_type, row.tmdb_id, 'fr-FR')
    const airDates = airDatesFromTmdbDoc(details, row.media_type)
    const updated = await updateTelevisionMediaAirDates(client, userId, row.id, airDates)
    return updated || { ...row, ...airDates }
  } catch (err) {
    console.warn('refreshMediaAirDates:', row.title, err)
    return row
  }
}

async function mapPool(items, concurrency, mapper) {
  const results = new Array(items.length)
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(items[index], index)
    }
  }

  const n = Math.min(Math.max(1, concurrency), items.length || 1)
  await Promise.all(Array.from({ length: n }, () => worker()))
  return results
}

/**
 * Sync dates TMDB + planification des notifications « sorties / nouveaux épisodes ».
 * @param {string} userId
 * @param {{ force?: boolean, supabaseClient?: import('@supabase/supabase-js').SupabaseClient }} [options]
 */
export async function syncTelevisionReleaseNotificationsForUser(userId, options = {}) {
  if (!userId) return { refreshed: 0, scheduled: 0 }

  const last = lastSyncAtByUser.get(userId) ?? 0
  if (!options.force && Date.now() - last < SYNC_COOLDOWN_MS) {
    return { refreshed: 0, scheduled: 0, skipped: true }
  }
  if (syncInFlight.has(userId)) {
    return { refreshed: 0, scheduled: 0, skipped: true }
  }

  const client = options.supabaseClient || supabase
  syncInFlight.add(userId)

  try {
    const today = getLocalTodayISO()
    const nowMs = Date.now()

    let media = []
    try {
      media = await listTelevisionMedia(client, userId)
    } catch (err) {
      const message = String(err?.message ?? '')
      if (message.includes('alter-television-media-tmdb-air-dates')) {
        console.warn(message)
        return { refreshed: 0, scheduled: 0, missingMigration: true }
      }
      throw err
    }

    const trackable = media.filter((row) => shouldTrackMedia(row))

    const toRefresh = trackable.filter((row) => needsAirDateRefresh(row, today, nowMs))
    const refreshedRows = await mapPool(toRefresh, TMDB_CONCURRENCY, (row) =>
      refreshMediaAirDates(client, userId, row),
    )

    const byId = new Map(trackable.map((row) => [row.id, row]))
    for (const row of refreshedRows) {
      if (row?.id) byId.set(row.id, row)
    }

    await deletePendingByKindPrefix(client, userId, TELEVISION_MOVIE_RELEASE_PREFIX)
    await deletePendingByKindPrefix(client, userId, TELEVISION_EPISODE_AIR_PREFIX)

    /** @type {object[]} */
    const pendingRows = []

    for (const row of byId.values()) {
      if (!shouldScheduleMedia(row, today)) continue

      if (row.media_type === 'movie') {
        const release = String(row.tmdb_release_date ?? '').slice(0, 10)
        if (!release || release < today) continue
        const notif = buildTelevisionNotifRow(userId, {
          kind: movieReleaseKind(row.id),
          title:
            release === today ? 'Film disponible aujourd’hui' : 'Sortie de film à venir',
          body:
            release === today
              ? `« ${row.title} » sort aujourd’hui.`
              : `« ${row.title} » sort le ${formatFrDate(release)}.`,
          dateKey: release,
          instantIso: row.tmdb_release_at || null,
          nowMs,
          today,
        })
        if (notif) pendingRows.push(notif)
        continue
      }

      if (row.media_type === 'tv') {
        const airDate = String(row.tmdb_next_air_date ?? '').slice(0, 10)
        if (!airDate || airDate < today) continue
        const episodeLabel = formatEpisodeLabel(row)
        const finished = isFinishedCollection(row.collection)
        const looksLikeNewSeason = Number(row.tmdb_next_episode) === 1
        const returning = finished && looksLikeNewSeason

        let title
        let body
        if (returning) {
          title =
            airDate === today ? 'Nouvelle saison aujourd’hui' : 'Nouvelle saison à venir'
          body =
            airDate === today
              ? episodeLabel
                ? `« ${row.title} » revient — ${episodeLabel} est diffusé aujourd’hui.`
                : `« ${row.title} » revient avec une nouvelle saison aujourd’hui.`
              : episodeLabel
                ? `« ${row.title} » revient — ${episodeLabel} le ${formatFrDate(airDate)}.`
                : `« ${row.title} » revient le ${formatFrDate(airDate)}.`
        } else if (finished) {
          title =
            airDate === today
              ? 'Nouvel épisode (série terminée)'
              : 'Nouvel épisode à venir'
          body =
            airDate === today
              ? episodeLabel
                ? `« ${row.title} » — ${episodeLabel} est diffusé aujourd’hui.`
                : `Un nouvel épisode de « ${row.title} » est diffusé aujourd’hui.`
              : episodeLabel
                ? `« ${row.title} » — ${episodeLabel} le ${formatFrDate(airDate)}.`
                : `Nouvel épisode de « ${row.title} » le ${formatFrDate(airDate)}.`
        } else {
          title =
            airDate === today ? 'Nouvel épisode aujourd’hui' : 'Nouvel épisode à venir'
          body =
            airDate === today
              ? episodeLabel
                ? `« ${row.title} » — ${episodeLabel} est diffusé aujourd’hui.`
                : `Un nouvel épisode de « ${row.title} » est diffusé aujourd’hui.`
              : episodeLabel
                ? `« ${row.title} » — ${episodeLabel} le ${formatFrDate(airDate)}.`
                : `Nouvel épisode de « ${row.title} » le ${formatFrDate(airDate)}.`
        }

        const notif = buildTelevisionNotifRow(userId, {
          kind: episodeAirKind(row.id),
          title,
          body,
          dateKey: airDate,
          instantIso: row.tmdb_next_air_at || null,
          nowMs,
          today,
        })
        if (notif) pendingRows.push(notif)
      }
    }

    if (pendingRows.length) {
      await insertPendingNotifications(client, userId, pendingRows, {
        skipPerRowDedupe: true,
      })
    }

    lastSyncAtByUser.set(userId, Date.now())
    return {
      refreshed: toRefresh.length,
      scheduled: pendingRows.length,
    }
  } finally {
    syncInFlight.delete(userId)
  }
}

function formatFrDate(isoDay) {
  try {
    const [y, m, d] = String(isoDay).split('-').map(Number)
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(y, m - 1, d))
  } catch {
    return isoDay
  }
}

/**
 * Après ajout / mise à jour d’un média : resync léger (force).
 */
export async function syncTelevisionReleaseNotificationsAfterMediaChange(userId) {
  if (!userId) return
  try {
    await syncTelevisionReleaseNotificationsForUser(userId, { force: true })
  } catch (err) {
    console.warn('syncTelevisionReleaseNotificationsAfterMediaChange:', err)
  }
}
