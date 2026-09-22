<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import TelevisionContinueCard from '../television/TelevisionContinueCard.vue'
import { supabase } from '../../lib/supabase.js'
import { APP_PAGE_IDS } from '../../constants/common/appPages.js'
import { usePageDisplayLabel } from '../../composables/usePageDisplayLabel.js'
import {
  isPageVisible,
  loadPageVisibility,
  mergePageVisibility,
  PAGE_VISIBILITY_UPDATED_EVENT,
} from '../../services/settings/pageVisibility.js'
import { getTmdbDetails, getTmdbSeason, tmdbPosterUrl } from '../../services/television/tmdb.js'
import {
  TELEVISION_COLLECTION_EN_COURS,
  TELEVISION_COLLECTION_TERMINE,
} from '../../services/television/televisionCollections.js'
import {
  listEpisodeProgressByMediaIds,
  setEpisodeWatched,
} from '../../services/television/televisionEpisodeProgress.js'
import {
  listTelevisionMedia,
  updateTelevisionMedia,
} from '../../services/television/televisionMedia.js'
import { resolveNextEpisode } from '../../utils/television/nextEpisode.js'

const props = defineProps({
  userId: {
    type: String,
    default: null,
  },
})

const router = useRouter()
const { pageTitle: televisionPageTitle } = usePageDisplayLabel(APP_PAGE_IDS.TELEVISION)

const pageVisibility = ref(mergePageVisibility(null))
const isLoading = ref(false)
const loadError = ref('')
const items = ref([])
/** @type {import('vue').Ref<Record<string, object|null>>} */
const nextEpisodeByMediaId = ref({})
/** @type {import('vue').Ref<Record<string, Array<object>>>} */
const progressByMediaId = ref({})
/** @type {import('vue').Ref<Record<string, Array<object>>>} */
const seasonsByMediaId = ref({})
const markingMediaId = ref(null)

const isTelevisionPageVisible = computed(() =>
  isPageVisible(APP_PAGE_IDS.TELEVISION, pageVisibility.value),
)

const inProgressItems = computed(() =>
  items.value.filter(
    (item) =>
      String(item.collection ?? '').trim().toLowerCase() ===
      TELEVISION_COLLECTION_EN_COURS.toLowerCase(),
  ),
)

const inProgressSeries = computed(() =>
  inProgressItems.value.filter((item) => item.media_type === 'tv'),
)

const inProgressMovies = computed(() =>
  inProgressItems.value.filter((item) => item.media_type === 'movie'),
)

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function moviePoster(item) {
  return item?.posterUrl || tmdbPosterUrl(item?.poster_path, 'w185')
}

function openMovieRoute(item) {
  return {
    name: 'television-fiche',
    params: {
      mediaType: 'movie',
      tmdbId: String(item.tmdb_id),
    },
  }
}

function openMediaFiche(item) {
  const mediaType = item?.media_type === 'tv' ? 'tv' : 'movie'
  const tmdbId = item?.tmdb_id
  if (!tmdbId) return
  router.push({
    name: 'television-fiche',
    params: { mediaType, tmdbId: String(tmdbId) },
  })
}

async function loadPageVisibilityState() {
  if (!props.userId) {
    pageVisibility.value = mergePageVisibility(null)
    return
  }
  try {
    pageVisibility.value = await loadPageVisibility(supabase, props.userId)
  } catch (err) {
    console.error('dashboard television visibility:', err)
    pageVisibility.value = mergePageVisibility(null)
  }
}

async function refreshContinueProgress(seriesItems) {
  const series = (seriesItems ?? []).filter((item) => item?.media_type === 'tv' && item?.id)
  if (!props.userId || !series.length) {
    nextEpisodeByMediaId.value = {}
    progressByMediaId.value = {}
    return
  }

  const progressMap = await listEpisodeProgressByMediaIds(
    supabase,
    props.userId,
    series.map((item) => item.id),
  )

  /** @type {Record<string, Array<object>>} */
  const progressRecord = {}
  /** @type {import('vue').Ref<Record<string, Array<object>>>} */
  const seasonsRecord = { ...seasonsByMediaId.value }
  /** @type {Record<string, object|null>} */
  const nextRecord = {}

  for (const [mediaId, rows] of progressMap.entries()) {
    progressRecord[mediaId] = rows
  }

  await Promise.all(
    series.map(async (item) => {
      let seasons = seasonsRecord[item.id]
      if (!seasons) {
        try {
          const details = await getTmdbDetails('tv', item.tmdb_id, 'fr-FR')
          seasons = Array.isArray(details?.seasons) ? details.seasons : []
          seasonsRecord[item.id] = seasons
        } catch (err) {
          console.warn('Dashboard TV seasons failed for', item.title, err)
          seasons = []
          seasonsRecord[item.id] = seasons
        }
      }

      const watched = progressRecord[item.id] ?? []
      const next = resolveNextEpisode(watched, seasons)
      if (!next) {
        nextRecord[item.id] = null
        return
      }
      if (next.complete) {
        nextRecord[item.id] = { complete: true }
        return
      }

      let episodeName = ''
      try {
        const season = await getTmdbSeason(item.tmdb_id, next.seasonNumber, 'fr-FR')
        const ep = (season.episodes ?? []).find((row) => row.episodeNumber === next.episodeNumber)
        episodeName = ep?.name || ''
      } catch (err) {
        console.warn('Dashboard TV episode name failed for', item.title, err)
      }

      nextRecord[item.id] = {
        seasonNumber: next.seasonNumber,
        episodeNumber: next.episodeNumber,
        episodeName,
      }
    }),
  )

  progressByMediaId.value = progressRecord
  seasonsByMediaId.value = seasonsRecord
  nextEpisodeByMediaId.value = nextRecord
}

async function loadItems() {
  if (!props.userId || !isTelevisionPageVisible.value) {
    items.value = []
    nextEpisodeByMediaId.value = {}
    return
  }

  isLoading.value = true
  loadError.value = ''
  try {
    items.value = await listTelevisionMedia(supabase, props.userId)
    const series = items.value.filter(
      (item) =>
        item.media_type === 'tv' &&
        String(item.collection || '').toLowerCase() ===
          TELEVISION_COLLECTION_EN_COURS.toLowerCase(),
    )
    await refreshContinueProgress(series)
  } catch (err) {
    console.error('dashboard television in progress:', err)
    loadError.value = err.message || 'Impossible de charger la télévision.'
    items.value = []
  } finally {
    isLoading.value = false
  }
}

async function reload() {
  await loadPageVisibilityState()
  await loadItems()
}

async function onMarkEpisodeWatched({ item, seasonNumber, episodeNumber }) {
  if (!props.userId || !item?.id || markingMediaId.value) return
  markingMediaId.value = item.id
  loadError.value = ''
  try {
    await setEpisodeWatched(supabase, props.userId, item.id, seasonNumber, episodeNumber, true)

    const watched = [...(progressByMediaId.value[item.id] ?? [])]
    watched.push({
      media_id: item.id,
      season_number: seasonNumber,
      episode_number: episodeNumber,
    })
    progressByMediaId.value = {
      ...progressByMediaId.value,
      [item.id]: watched,
    }

    const seasons = seasonsByMediaId.value[item.id] ?? []
    const next = resolveNextEpisode(watched, seasons)

    if (next?.complete) {
      await updateTelevisionMedia(supabase, props.userId, item.id, {
        collection: TELEVISION_COLLECTION_TERMINE,
        dateStart: item.date_start || todayIso(),
        dateEnd: item.date_end || todayIso(),
      })
      items.value = items.value.map((row) =>
        row.id === item.id
          ? {
              ...row,
              collection: TELEVISION_COLLECTION_TERMINE,
              date_start: row.date_start || todayIso(),
              date_end: row.date_end || todayIso(),
            }
          : row,
      )
      nextEpisodeByMediaId.value = {
        ...nextEpisodeByMediaId.value,
        [item.id]: { complete: true },
      }
      return
    }

    let episodeName = ''
    if (next) {
      try {
        const season = await getTmdbSeason(item.tmdb_id, next.seasonNumber, 'fr-FR')
        const ep = (season.episodes ?? []).find((row) => row.episodeNumber === next.episodeNumber)
        episodeName = ep?.name || ''
      } catch {
        /* ignore */
      }
      nextEpisodeByMediaId.value = {
        ...nextEpisodeByMediaId.value,
        [item.id]: {
          seasonNumber: next.seasonNumber,
          episodeNumber: next.episodeNumber,
          episodeName,
        },
      }
    }
  } catch (err) {
    console.error(err)
    loadError.value = err.message || 'Impossible de marquer l’épisode.'
  } finally {
    markingMediaId.value = null
  }
}

watch(
  () => props.userId,
  () => {
    reload()
  },
)

onMounted(() => {
  reload()
  window.addEventListener(PAGE_VISIBILITY_UPDATED_EVENT, reload)
})

onUnmounted(() => {
  window.removeEventListener(PAGE_VISIBILITY_UPDATED_EVENT, reload)
})
</script>

<template>
  <section
    v-if="isTelevisionPageVisible"
    class="dashboard-tv"
    aria-labelledby="dashboard-tv-title"
  >
    <div class="dashboard-tv__header">
      <h2 id="dashboard-tv-title" class="dashboard-tv__title">Télé · En cours</h2>
      <RouterLink :to="{ name: 'television' }" class="dashboard-tv__link">
        {{ televisionPageTitle }}
      </RouterLink>
    </div>

    <div v-if="isLoading" class="dashboard-tv__state">
      <span class="spinner" aria-hidden="true"></span>
      Chargement…
    </div>

    <p v-else-if="loadError" class="dashboard-tv__error">{{ loadError }}</p>

    <p
      v-else-if="inProgressItems.length === 0"
      class="dashboard-tv__state dashboard-tv__state--empty"
    >
      Aucun film ou série en cours pour le moment.
    </p>

    <template v-else>
      <div v-if="inProgressSeries.length" class="dashboard-tv__continue">
        <TelevisionContinueCard
          v-for="item in inProgressSeries"
          :key="item.id"
          :item="item"
          :next-episode="nextEpisodeByMediaId[item.id] || null"
          :busy="markingMediaId === item.id"
          @open="openMediaFiche"
          @mark-watched="onMarkEpisodeWatched"
        />
      </div>

      <ul v-if="inProgressMovies.length" class="dashboard-tv__movies">
        <li v-for="item in inProgressMovies" :key="item.id" class="dashboard-tv__movie-item">
          <RouterLink :to="openMovieRoute(item)" class="dashboard-tv__movie-card">
            <div class="dashboard-tv__cover-wrap">
              <img
                v-if="moviePoster(item)"
                :src="moviePoster(item)"
                :alt="`Affiche de ${item.title}`"
                class="dashboard-tv__cover"
              />
              <div v-else class="dashboard-tv__cover dashboard-tv__cover--placeholder">
                {{ item.title?.charAt(0)?.toUpperCase() || '?' }}
              </div>
            </div>
            <div class="dashboard-tv__meta">
              <h3 class="dashboard-tv__movie-title">{{ item.title }}</h3>
              <p class="dashboard-tv__movie-type">Film</p>
            </div>
          </RouterLink>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.dashboard-tv {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
  padding: 1rem 1.1rem;
  border-radius: 16px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: linear-gradient(145deg, rgba(213, 181, 234, 0.18), rgba(255, 255, 255, 0.65));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-sizing: border-box;
}

.dashboard-tv__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.dashboard-tv__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: #ad81be;
}

.dashboard-tv__link {
  font-size: 0.78rem;
  font-weight: 700;
  color: #8c6a9e;
  text-decoration: none;
  white-space: nowrap;
}

.dashboard-tv__link:hover {
  text-decoration: underline;
}

.dashboard-tv__state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: #6c757d;
  font-weight: 700;
  font-size: 0.9rem;
  text-align: center;
}

.dashboard-tv__state--empty {
  padding: 0.35rem 0;
}

.dashboard-tv__error {
  margin: 0;
  color: #c0392b;
  font-weight: 700;
  font-size: 0.88rem;
  text-align: center;
}

.dashboard-tv__continue {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.dashboard-tv__movies {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.dashboard-tv__movie-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.4rem 0.45rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.3);
  background: rgba(255, 255, 255, 0.72);
  text-decoration: none;
  color: inherit;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.dashboard-tv__movie-card:hover {
  background: rgba(213, 181, 234, 0.16);
  border-color: rgba(173, 129, 190, 0.45);
}

.dashboard-tv__cover-wrap {
  flex-shrink: 0;
}

.dashboard-tv__cover {
  width: 2.75rem;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  border-radius: 4px;
  display: block;
  border: 1px solid rgba(213, 181, 234, 0.3);
}

.dashboard-tv__cover--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, #f4eef8, #e8d9f0);
  color: #ad81be;
  font-weight: 800;
}

.dashboard-tv__meta {
  min-width: 0;
}

.dashboard-tv__movie-title {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 800;
  color: #2c3e50;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dashboard-tv__movie-type {
  margin: 0.15rem 0 0;
  font-size: 0.78rem;
  font-weight: 650;
  color: #6b4f7c;
}

.spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(173, 129, 190, 0.25);
  border-top-color: #ad81be;
  border-radius: 50%;
  animation: dashboard-tv-spin 0.7s linear infinite;
}

@keyframes dashboard-tv-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-color-scheme: dark) {
  .dashboard-tv {
    background: linear-gradient(145deg, rgba(173, 129, 190, 0.18), rgba(35, 30, 48, 0.75));
    border-color: rgba(213, 181, 234, 0.28);
  }

  .dashboard-tv__title {
    color: #d5b5ea;
  }

  .dashboard-tv__link {
    color: #c9b0d8;
  }

  .dashboard-tv__state {
    color: #adb5bd;
  }

  .dashboard-tv__movie-card {
    background: rgba(35, 30, 48, 0.85);
  }

  .dashboard-tv__movie-title {
    color: #f0e8f8;
  }

  .dashboard-tv__movie-type {
    color: #c9b0d8;
  }
}
</style>
