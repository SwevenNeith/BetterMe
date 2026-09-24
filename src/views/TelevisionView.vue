<script setup>
import { computed, nextTick, onActivated, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { APP_PAGE_IDS } from '../constants/common/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import {
  readPersistedPageState,
  writePersistedPageState,
} from '../composables/usePersistedPageState.js'
import { supabase } from '../lib/supabase.js'
import { getTmdbDetails, getTmdbSeason, searchTmdbAllPages, tmdbPosterUrl } from '../services/television/tmdb.js'
import {
  TELEVISION_COLLECTION_A_REGARDER,
  TELEVISION_COLLECTION_EN_COURS,
  TELEVISION_COLLECTION_TERMINE,
  listTelevisionCollections,
} from '../services/television/televisionCollections.js'
import {
  listEpisodeProgressByMediaIds,
  setEpisodeWatched,
} from '../services/television/televisionEpisodeProgress.js'
import {
  listTelevisionMedia,
  updateTelevisionMedia,
  upsertTelevisionMediaFromTmdb,
} from '../services/television/televisionMedia.js'
import {
  resolveNextEpisode,
} from '../utils/television/nextEpisode.js'
import {
  applyTelevisionMediaFilters,
  formatTelevisionFilterLabel,
} from '../utils/television/televisionMediaFilters.js'
import TelevisionContinueCard from '../components/television/TelevisionContinueCard.vue'
import TelevisionFavoriteStar from '../components/television/TelevisionFavoriteStar.vue'
import TelevisionMediaFilterPopover from '../components/television/TelevisionMediaFilterPopover.vue'

defineOptions({ name: 'TelevisionView' })

const TV_SEARCH_STORAGE_KEY = 'betterme-television-search-v1'

/** Nombre de lignes max dans la grille (comme Lecture). */
const GRID_ROWS = 5
/** Largeur mini d’une affiche — le nombre de colonnes s’adapte à l’écran. */
const MIN_POSTER_COL_PX = 96

function computeGridColumnCount(widthPx, gapPx = 7.2) {
  const width = Math.max(0, Number(widthPx) || 0)
  const gap = Number.isFinite(gapPx) ? gapPx : 7.2
  return Math.max(2, Math.floor((width + gap) / (MIN_POSTER_COL_PX + gap)))
}

const { pageTitle } = usePageDisplayLabel(APP_PAGE_IDS.TELEVISION, undefined, {
  setDocumentTitle: true,
})

const router = useRouter()
const route = useRoute()

const persistedTv = readPersistedPageState(TV_SEARCH_STORAGE_KEY, {
  libraryMode: 'mine',
  searchQuery: '',
  librarySearchQuery: '',
  libraryFilters: [],
  catalogFilters: [],
  filterOpen: false,
  currentPage: 1,
})

const libraryMode = ref(
  route.query.mode === 'catalogue' || persistedTv.libraryMode === 'catalog' ? 'catalog' : 'mine',
)
const searchQuery = ref(String(persistedTv.searchQuery ?? ''))
const librarySearchQuery = ref(String(persistedTv.librarySearchQuery ?? ''))
const libraryFilters = ref(
  Array.isArray(persistedTv.libraryFilters) ? persistedTv.libraryFilters : [],
)
const catalogFilters = ref(
  Array.isArray(persistedTv.catalogFilters) ? persistedTv.catalogFilters : [],
)
const filterOpen = ref(Boolean(persistedTv.filterOpen))
const isLoading = ref(false)
const isLibraryLoading = ref(false)
const loadError = ref('')
const libraryError = ref('')
const searchPayload = ref(null)
const libraryItems = ref([])
const collections = ref([])
/** @type {import('vue').Ref<Record<string, { seasonNumber?: number, episodeNumber?: number, episodeName?: string, complete?: boolean }|null>>} */
const nextEpisodeByMediaId = ref({})
/** @type {import('vue').Ref<Record<string, Array<object>>>} */
const progressByMediaId = ref({})
/** @type {import('vue').Ref<Record<string, Array<object>>>} */
const seasonsByMediaId = ref({})
const markingMediaId = ref(null)
const progressLabel = ref('')
const currentPage = ref(Math.max(1, Number(persistedTv.currentPage) || 1))
const gridColumnCount = ref(4)
const televisionGridRef = ref(null)
const televisionLayoutRef = ref(null)
const userId = ref(null)
let gridResizeObserver = null
let searchDebounceTimer = null
let searchRequestId = 0
let skipFirstActivated = true

const SEARCH_DEBOUNCE_MS = 350
const MIN_SEARCH_LENGTH = 2

const pageSubtitle = computed(() => {
  if (libraryMode.value === 'catalog') {
    return 'Cherche un film ou une série dans le catalogue TMDB.'
  }
  const total = libraryItems.value.length
  if (total === 0) return 'Ajoute des titres depuis le catalogue (À regarder, En cours, Terminé…).'
  return `${total} titre${total === 1 ? '' : 's'} dans ta télé.`
})

const displayedLibraryItems = computed(() => {
  const query = librarySearchQuery.value.trim().toLowerCase()
  let list = libraryItems.value
  if (query) {
    list = list.filter((item) => {
      const title = String(item.title || '').toLowerCase()
      const original = String(item.original_title || '').toLowerCase()
      const col = String(item.collection || '').toLowerCase()
      return title.includes(query) || original.includes(query) || col.includes(query)
    })
  }
  return applyTelevisionMediaFilters(list, libraryFilters.value)
})

const inProgressItems = computed(() =>
  displayedLibraryItems.value.filter(
    (item) =>
      String(item.collection || '').toLowerCase() ===
      TELEVISION_COLLECTION_EN_COURS.toLowerCase(),
  ),
)

const inProgressSeries = computed(() =>
  inProgressItems.value.filter((item) => item.media_type === 'tv'),
)

const inProgressMovies = computed(() =>
  inProgressItems.value.filter((item) => item.media_type === 'movie'),
)

const filteredLibraryItems = computed(() =>
  displayedLibraryItems.value.filter(
    (item) =>
      String(item.collection || '').toLowerCase() !==
      TELEVISION_COLLECTION_EN_COURS.toLowerCase(),
  ),
)

const displayResults = computed(() => {
  const list = Array.isArray(searchPayload.value?.results) ? searchPayload.value.results : []
  return applyTelevisionMediaFilters(list, catalogFilters.value)
})

const itemsPerPage = computed(() => Math.max(2, gridColumnCount.value) * GRID_ROWS)

const televisionGridStyle = computed(() => ({
  '--tv-cols': String(gridColumnCount.value),
}))

const totalPages = computed(() =>
  Math.max(1, Math.ceil(displayResults.value.length / itemsPerPage.value)),
)

const paginatedResults = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  return displayResults.value.slice(start, start + itemsPerPage.value)
})

const showPagination = computed(() => displayResults.value.length > itemsPerPage.value)

function setLibraryMode(mode) {
  libraryMode.value = mode === 'catalog' ? 'catalog' : 'mine'
  const nextQuery = { ...route.query }
  if (libraryMode.value === 'catalog') nextQuery.mode = 'catalogue'
  else delete nextQuery.mode
  router.replace({ query: nextQuery })
}

function resultTitle(item) {
  return item?.title || item?.name || item?.original_title || item?.original_name || 'Untitled'
}

function resultTypeLabel(item) {
  if (item?.media_type === 'movie') return 'Film'
  if (item?.media_type === 'tv') return 'Série'
  return item?.media_type || ''
}

function resultPoster(item) {
  return item?.posterUrl || tmdbPosterUrl(item?.poster_path, 'w342')
}

function resultKey(item) {
  if (item?.id && item?.media_type && item?.tmdb_id) {
    return `lib-${item.id}`
  }
  return `${item?.media_type ?? 'x'}-${item?.id ?? item?.tmdb_id ?? Math.random()}`
}

function resultAriaLabel(item) {
  const year = String(item?.first_air_date || item?.release_date || '').slice(0, 4)
  const type = resultTypeLabel(item)
  const collection = item?.collection ? String(item.collection) : ''
  return [resultTitle(item), type, year || collection].filter(Boolean).join(' · ')
}

function openMediaFiche(item) {
  const mediaType =
    item?.media_type === 'tv' ? 'tv' : item?.media_type === 'movie' ? 'movie' : ''
  const tmdbId = item?.tmdb_id ?? item?.id
  if (!mediaType || !tmdbId) return
  router.push({
    name: 'television-fiche',
    params: { mediaType, tmdbId: String(tmdbId) },
  })
}

const favoriteBusyId = ref(null)
/** Clé `${media_type}:${tmdb_id}` en cours d’ajout rapide depuis le catalogue. */
const addingCatalogKey = ref('')
const catalogAddError = ref('')

function catalogResultKey(item) {
  const mediaType =
    item?.media_type === 'tv' ? 'tv' : item?.media_type === 'movie' ? 'movie' : ''
  const tmdbId = Number.parseInt(String(item?.tmdb_id ?? item?.id ?? ''), 10)
  if (!mediaType || !Number.isFinite(tmdbId) || tmdbId <= 0) return ''
  return `${mediaType}:${tmdbId}`
}

function findLibraryItemForCatalogResult(item) {
  const key = catalogResultKey(item)
  if (!key) return null
  return (
    libraryItems.value.find((row) => catalogResultKey(row) === key) || null
  )
}

function isInLibrary(item) {
  return Boolean(findLibraryItemForCatalogResult(item))
}

async function ensureLibraryLoadedForCatalog() {
  if (!userId.value) return
  if (libraryItems.value.length || isLibraryLoading.value) return
  try {
    libraryItems.value = await listTelevisionMedia(supabase, userId.value)
  } catch (err) {
    console.warn('ensureLibraryLoadedForCatalog:', err)
  }
}

async function quickAddToLibrary(item) {
  if (!userId.value || !item || addingCatalogKey.value) return
  if (isInLibrary(item)) return

  const key = catalogResultKey(item)
  if (!key) return

  addingCatalogKey.value = key
  catalogAddError.value = ''

  try {
    const mediaType = item.media_type === 'tv' ? 'tv' : 'movie'
    const tmdbId = item.tmdb_id ?? item.id
    // Détails TMDB pour dates / overview (le résultat search est partiel)
    let doc = { ...item, media_type: mediaType, id: tmdbId }
    try {
      const details = await getTmdbDetails(mediaType, tmdbId, 'fr-FR')
      doc = { ...details, media_type: mediaType }
    } catch (detailsErr) {
      console.warn('quickAdd details fallback search doc:', detailsErr)
    }

    await upsertTelevisionMediaFromTmdb(supabase, userId.value, doc, {
      collection: TELEVISION_COLLECTION_A_REGARDER,
    })

    libraryItems.value = await listTelevisionMedia(supabase, userId.value)

    try {
      const { syncTelevisionReleaseNotificationsAfterMediaChange } = await import(
        '../services/television/televisionReleaseNotifications.js'
      )
      void syncTelevisionReleaseNotificationsAfterMediaChange(userId.value)
    } catch (syncErr) {
      console.warn('syncTelevisionReleaseNotifications:', syncErr)
    }
  } catch (err) {
    console.error(err)
    catalogAddError.value = err?.message || 'Impossible d’ajouter ce titre.'
  } finally {
    addingCatalogKey.value = ''
  }
}

async function onToggleFavorite(item) {
  if (!userId.value || !item?.id || favoriteBusyId.value) return
  const previous = Boolean(item.is_favorite)
  const next = !previous
  favoriteBusyId.value = item.id

  const applyLocal = (value) => {
    const idx = libraryItems.value.findIndex((row) => row.id === item.id)
    if (idx >= 0) {
      libraryItems.value[idx] = { ...libraryItems.value[idx], is_favorite: value }
    }
  }

  applyLocal(next)
  try {
    const updated = await updateTelevisionMedia(supabase, userId.value, item.id, {
      isFavorite: next,
    })
    applyLocal(Boolean(updated?.is_favorite))
  } catch (err) {
    console.error(err)
    applyLocal(previous)
    libraryError.value = err?.message || 'Impossible de mettre à jour le favori.'
  } finally {
    favoriteBusyId.value = null
  }
}

function updateGridColumnCount() {
  const el = televisionLayoutRef.value
  if (!el) return
  const styles = getComputedStyle(el)
  const gap = parseFloat(styles.columnGap || styles.gap) || 7.2
  const nextCols = computeGridColumnCount(el.clientWidth, gap)
  if (nextCols !== gridColumnCount.value) {
    gridColumnCount.value = nextCols
  }
}

function bindGridResizeObserver() {
  gridResizeObserver?.disconnect()
  gridResizeObserver = null

  const el = televisionLayoutRef.value
  if (!el) return

  updateGridColumnCount()

  if (typeof ResizeObserver === 'undefined') return
  gridResizeObserver = new ResizeObserver(() => {
    updateGridColumnCount()
  })
  gridResizeObserver.observe(el)
}

function goToPage(page) {
  const nextPage = Math.min(Math.max(page, 1), totalPages.value)
  if (nextPage === currentPage.value) return
  currentPage.value = nextPage
  televisionGridRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function refreshContinueProgress(seriesItems) {
  const series = (seriesItems ?? []).filter((item) => item?.media_type === 'tv' && item?.id)
  if (!userId.value || !series.length) {
    nextEpisodeByMediaId.value = {}
    progressByMediaId.value = {}
    seasonsByMediaId.value = {}
    return
  }

  const progressMap = await listEpisodeProgressByMediaIds(
    supabase,
    userId.value,
    series.map((item) => item.id),
  )

  /** @type {Record<string, Array<object>>} */
  const progressRecord = {}
  /** @type {Record<string, Array<object>>} */
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
          console.warn('Seasons meta failed for', item.title, err)
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
        console.warn('Episode name failed for', item.title, err)
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

async function loadLibrary() {
  if (!userId.value) {
    libraryItems.value = []
    nextEpisodeByMediaId.value = {}
    progressByMediaId.value = {}
    seasonsByMediaId.value = {}
    return
  }
  isLibraryLoading.value = true
  libraryError.value = ''
  try {
    collections.value = await listTelevisionCollections(supabase, userId.value)
    libraryItems.value = await listTelevisionMedia(supabase, userId.value)
    try {
      const { syncTelevisionReleaseNotificationsForUser } = await import(
        '../services/television/televisionReleaseNotifications.js'
      )
      void syncTelevisionReleaseNotificationsForUser(userId.value)
    } catch (syncErr) {
      console.warn('syncTelevisionReleaseNotifications:', syncErr)
    }
    const series = libraryItems.value.filter(
      (item) =>
        item.media_type === 'tv' &&
        String(item.collection || '').toLowerCase() ===
          TELEVISION_COLLECTION_EN_COURS.toLowerCase(),
    )
    await refreshContinueProgress(series)
  } catch (err) {
    console.error(err)
    libraryError.value = err.message || 'Impossible de charger ta télé.'
    libraryItems.value = []
  } finally {
    isLibraryLoading.value = false
    await nextTick()
    bindGridResizeObserver()
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

async function onMarkEpisodeWatched({ item, seasonNumber, episodeNumber }) {
  if (!userId.value || !item?.id || markingMediaId.value) return
  markingMediaId.value = item.id
  libraryError.value = ''
  try {
    await setEpisodeWatched(supabase, userId.value, item.id, seasonNumber, episodeNumber, true)

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
      await updateTelevisionMedia(supabase, userId.value, item.id, {
        collection: TELEVISION_COLLECTION_TERMINE,
        dateStart: item.date_start || todayIso(),
        dateEnd: item.date_end || todayIso(),
      })
      libraryItems.value = libraryItems.value.map((row) =>
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
    libraryError.value = err.message || 'Impossible de marquer l’épisode.'
  } finally {
    markingMediaId.value = null
  }
}

async function runSearch(rawQuery, options = {}) {
  const q = String(rawQuery ?? '').trim()
  const requestId = ++searchRequestId

  if (q.length < MIN_SEARCH_LENGTH) {
    searchPayload.value = null
    loadError.value = ''
    progressLabel.value = ''
    isLoading.value = false
    currentPage.value = 1
    return
  }

  isLoading.value = true
  loadError.value = ''
  if (!options.keepPage) currentPage.value = 1
  progressLabel.value = 'Chargement…'

  try {
    const payload = await searchTmdbAllPages(q, {
      onProgress: ({ loadedPages, totalPages: pages }) => {
        if (requestId !== searchRequestId) return
        progressLabel.value =
          pages > 1
            ? `Chargement… (${Math.min(loadedPages, pages)} / ${pages})`
            : 'Chargement…'
      },
    })
    if (requestId !== searchRequestId) return
    searchPayload.value = payload
    await nextTick()
    bindGridResizeObserver()
  } catch (err) {
    if (requestId !== searchRequestId) return
    console.error(err)
    searchPayload.value = null
    loadError.value = err.message || 'Échec de la recherche TMDB.'
  } finally {
    if (requestId === searchRequestId) {
      isLoading.value = false
      progressLabel.value = ''
    }
  }
}

function scheduleSearch(query) {
  if (searchDebounceTimer != null) {
    clearTimeout(searchDebounceTimer)
    searchDebounceTimer = null
  }

  const q = String(query ?? '').trim()
  if (q.length < MIN_SEARCH_LENGTH) {
    searchRequestId += 1
    searchPayload.value = null
    loadError.value = ''
    progressLabel.value = ''
    isLoading.value = false
    currentPage.value = 1
    return
  }

  searchDebounceTimer = window.setTimeout(() => {
    searchDebounceTimer = null
    runSearch(q)
  }, SEARCH_DEBOUNCE_MS)
}

function persistState() {
  writePersistedPageState(TV_SEARCH_STORAGE_KEY, {
    libraryMode: libraryMode.value,
    searchQuery: searchQuery.value,
    librarySearchQuery: librarySearchQuery.value,
    libraryFilters: libraryFilters.value,
    catalogFilters: catalogFilters.value,
    filterOpen: filterOpen.value,
    currentPage: currentPage.value,
  })
}

function removeActiveFilter(filterId) {
  if (libraryMode.value === 'catalog') {
    catalogFilters.value = catalogFilters.value.filter((filter) => filter.id !== filterId)
  } else {
    libraryFilters.value = libraryFilters.value.filter((filter) => filter.id !== filterId)
  }
}

function onFiltersUpdate(next) {
  if (libraryMode.value === 'catalog') catalogFilters.value = next
  else libraryFilters.value = next
}

watch(searchQuery, (value) => {
  if (libraryMode.value !== 'catalog') return
  scheduleSearch(value)
})

watch(
  [
    libraryMode,
    searchQuery,
    librarySearchQuery,
    libraryFilters,
    catalogFilters,
    filterOpen,
    currentPage,
  ],
  () => persistState(),
  { deep: true },
)

watch(totalPages, (pages) => {
  if (currentPage.value > pages) currentPage.value = pages
})

watch(itemsPerPage, () => {
  if (currentPage.value > totalPages.value) {
    currentPage.value = totalPages.value
  }
})

watch(libraryMode, async (mode) => {
  await nextTick()
  bindGridResizeObserver()
  if (mode === 'catalog') {
    await ensureLibraryLoadedForCatalog()
    const q = String(searchQuery.value ?? '').trim()
    if (q.length >= MIN_SEARCH_LENGTH && !searchPayload.value) {
      await runSearch(q, { keepPage: true })
    }
  } else if (userId.value) {
    await loadLibrary()
  }
})

watch(userId, (id) => {
  if (id) loadLibrary()
})

onMounted(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) userId.value = user.id

  await nextTick()
  bindGridResizeObserver()

  if (libraryMode.value === 'mine') {
    await loadLibrary()
  } else {
    await ensureLibraryLoadedForCatalog()
    const q = String(searchQuery.value ?? '').trim()
    if (q.length >= MIN_SEARCH_LENGTH) {
      await runSearch(q, { keepPage: true })
    }
  }
})

onActivated(async () => {
  if (skipFirstActivated) {
    skipFirstActivated = false
    return
  }
  if (libraryMode.value === 'mine' && userId.value) {
    await loadLibrary()
  }
})

onUnmounted(() => {
  if (searchDebounceTimer != null) clearTimeout(searchDebounceTimer)
  searchRequestId += 1
  gridResizeObserver?.disconnect()
  gridResizeObserver = null
})
</script>

<template>
  <div class="television-wrapper">
    <header class="television-header">
      <h1 class="television-title">{{ pageTitle }}</h1>
      <p class="television-subtitle">{{ pageSubtitle }}</p>

      <div class="television-mode-tabs" role="tablist" aria-label="Mode télévision">
        <button
          type="button"
          role="tab"
          class="television-mode-tab"
          :class="{ 'television-mode-tab--active': libraryMode === 'mine' }"
          :aria-selected="libraryMode === 'mine'"
          @click="setLibraryMode('mine')"
        >
          Ma télé
        </button>
        <button
          type="button"
          role="tab"
          class="television-mode-tab"
          :class="{ 'television-mode-tab--active': libraryMode === 'catalog' }"
          :aria-selected="libraryMode === 'catalog'"
          @click="setLibraryMode('catalog')"
        >
          Catalogue
        </button>
      </div>
    </header>

    <section class="television-card">
      <div ref="televisionLayoutRef" class="television-layout-measure" aria-hidden="true" />

      <!-- Ma télé -->
      <template v-if="libraryMode === 'mine'">
        <div
          v-if="libraryItems.length || librarySearchQuery || libraryFilters.length"
          class="television-toolbar"
        >
          <label class="television-search">
            <span class="television-search__label">Rechercher</span>
            <input
              v-model="librarySearchQuery"
              type="search"
              class="television-search__input"
              placeholder="Titre, collection…"
              maxlength="120"
              autocomplete="off"
            />
          </label>
          <div class="television-toolbar__filters">
            <button
              type="button"
              class="television-filter-btn"
              :class="{ 'television-filter-btn--active': libraryFilters.length > 0 }"
              @click="filterOpen = !filterOpen"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M3 4h18v2l-7 8v5l-4 1v-6L3 6V4z" />
              </svg>
              Filtre
              <span v-if="libraryFilters.length > 0" class="television-filter-btn__count">
                {{ libraryFilters.length }}
              </span>
            </button>
          </div>
        </div>

        <TelevisionMediaFilterPopover
          :filters="libraryFilters"
          :open="filterOpen && libraryMode === 'mine'"
          context="library"
          :collections="collections"
          @update:filters="onFiltersUpdate"
          @close="filterOpen = false"
        />

        <div v-if="libraryFilters.length > 0" class="television-active-filters">
          <button
            v-for="filter in libraryFilters"
            :key="filter.id"
            type="button"
            class="television-active-filter-pill"
            @click="filterOpen = true"
          >
            <span>{{ formatTelevisionFilterLabel(filter) }}</span>
            <span
              class="television-active-filter-pill__remove"
              role="button"
              tabindex="0"
              aria-label="Retirer ce filtre"
              @click.stop="removeActiveFilter(filter.id)"
              @keydown.enter.stop.prevent="removeActiveFilter(filter.id)"
              @keydown.space.stop.prevent="removeActiveFilter(filter.id)"
            >
              ✕
            </span>
          </button>
        </div>

        <p v-if="isLibraryLoading" class="television-status">Chargement…</p>
        <p v-else-if="libraryError" class="television-error">{{ libraryError }}</p>
        <p v-else-if="!userId" class="television-status">
          Connecte-toi pour suivre tes films et séries.
        </p>
        <template v-else-if="!isLibraryLoading">
          <section
            v-if="inProgressItems.length"
            class="television-section television-section--en-cours"
            :style="televisionGridStyle"
          >
            <h2 class="television-section__title">En cours</h2>

            <div v-if="inProgressSeries.length" class="television-continue-list">
              <TelevisionContinueCard
                v-for="item in inProgressSeries"
                :key="resultKey(item)"
                :item="item"
                :next-episode="nextEpisodeByMediaId[item.id] || null"
                :busy="markingMediaId === item.id"
                :favorite-busy="favoriteBusyId === item.id"
                @open="openMediaFiche"
                @mark-watched="onMarkEpisodeWatched"
                @toggle-favorite="onToggleFavorite"
              />
            </div>

            <div v-if="inProgressMovies.length" class="television-grid" :class="{ 'television-grid--after-continue': inProgressSeries.length }">
              <article
                v-for="item in inProgressMovies"
                :key="resultKey(item)"
                class="television-poster television-poster--en-cours"
              >
                <div class="television-poster__wrap">
                  <button
                    type="button"
                    class="television-poster__btn"
                    :title="resultAriaLabel(item)"
                    :aria-label="resultAriaLabel(item)"
                    @click="openMediaFiche(item)"
                  >
                    <img
                      v-if="resultPoster(item)"
                      :src="resultPoster(item)"
                      :alt="resultTitle(item)"
                      class="television-poster__cover"
                      loading="lazy"
                    />
                    <div
                      v-else
                      class="television-poster__cover television-poster__cover--placeholder"
                      aria-hidden="true"
                    >
                      <span>🎬</span>
                    </div>
                  </button>
                  <TelevisionFavoriteStar
                    class="television-poster__fav"
                    size="sm"
                    :active="Boolean(item.is_favorite)"
                    :disabled="favoriteBusyId === item.id"
                    @toggle="onToggleFavorite(item)"
                  />
                </div>
              </article>
            </div>
          </section>

          <section
            v-if="filteredLibraryItems.length"
            class="television-section"
            :style="televisionGridStyle"
          >
            <h2 v-if="inProgressItems.length" class="television-section__title">Bibliothèque</h2>
            <div class="television-grid">
              <article
                v-for="item in filteredLibraryItems"
                :key="resultKey(item)"
                class="television-poster"
              >
                <div class="television-poster__wrap">
                  <button
                    type="button"
                    class="television-poster__btn"
                    :title="resultAriaLabel(item)"
                    :aria-label="resultAriaLabel(item)"
                    @click="openMediaFiche(item)"
                  >
                    <img
                      v-if="resultPoster(item)"
                      :src="resultPoster(item)"
                      :alt="resultTitle(item)"
                      class="television-poster__cover"
                      loading="lazy"
                    />
                    <div
                      v-else
                      class="television-poster__cover television-poster__cover--placeholder"
                      aria-hidden="true"
                    >
                      <span>🎬</span>
                    </div>
                  </button>
                  <TelevisionFavoriteStar
                    class="television-poster__fav"
                    size="sm"
                    :active="Boolean(item.is_favorite)"
                    :disabled="favoriteBusyId === item.id"
                    @toggle="onToggleFavorite(item)"
                  />
                </div>
              </article>
            </div>
          </section>

          <p
            v-if="!inProgressItems.length && !filteredLibraryItems.length"
            class="television-status"
          >
            <template v-if="libraryItems.length && (librarySearchQuery || libraryFilters.length)">
              Aucun titre ne correspond à ta recherche / tes filtres.
            </template>
            <template v-else>
              Aucun titre pour l’instant. Passe par l’onglet Catalogue pour en ajouter.
            </template>
          </p>
        </template>
      </template>

      <!-- Catalogue TMDB -->
      <template v-else>
        <div class="television-toolbar">
          <label class="television-search">
            <span class="television-search__label">Rechercher</span>
            <input
              v-model="searchQuery"
              type="search"
              class="television-search__input"
              placeholder="Titre de film ou série (FR / EN)…"
              maxlength="120"
              autocomplete="off"
            />
          </label>
          <div class="television-toolbar__filters">
            <button
              type="button"
              class="television-filter-btn"
              :class="{ 'television-filter-btn--active': catalogFilters.length > 0 }"
              @click="filterOpen = !filterOpen"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M3 4h18v2l-7 8v5l-4 1v-6L3 6V4z" />
              </svg>
              Filtre
              <span v-if="catalogFilters.length > 0" class="television-filter-btn__count">
                {{ catalogFilters.length }}
              </span>
            </button>
          </div>
        </div>

        <TelevisionMediaFilterPopover
          :filters="catalogFilters"
          :open="filterOpen && libraryMode === 'catalog'"
          context="catalog"
          :collections="collections"
          @update:filters="onFiltersUpdate"
          @close="filterOpen = false"
        />

        <div v-if="catalogFilters.length > 0" class="television-active-filters">
          <button
            v-for="filter in catalogFilters"
            :key="filter.id"
            type="button"
            class="television-active-filter-pill"
            @click="filterOpen = true"
          >
            <span>{{ formatTelevisionFilterLabel(filter) }}</span>
            <span
              class="television-active-filter-pill__remove"
              role="button"
              tabindex="0"
              aria-label="Retirer ce filtre"
              @click.stop="removeActiveFilter(filter.id)"
              @keydown.enter.stop.prevent="removeActiveFilter(filter.id)"
              @keydown.space.stop.prevent="removeActiveFilter(filter.id)"
            >
              ✕
            </span>
          </button>
        </div>

        <p v-if="isLoading" class="television-status">{{ progressLabel || 'Recherche…' }}</p>
        <p v-else-if="loadError" class="television-error">{{ loadError }}</p>
        <p v-if="catalogAddError" class="television-error">{{ catalogAddError }}</p>

        <template v-if="searchPayload && !loadError">
          <p v-if="!isLoading" class="television-count">
            {{ displayResults.length }} résultat{{ displayResults.length === 1 ? '' : 's' }}
            <span
              v-if="
                searchPayload.movie_total_results != null || searchPayload.tv_total_results != null
              "
            >
              ({{ searchPayload.movie_total_results || 0 }} films ·
              {{ searchPayload.tv_total_results || 0 }} séries)
            </span>
          </p>

          <template v-if="displayResults.length">
            <div
              ref="televisionGridRef"
              class="television-grid"
              :style="televisionGridStyle"
            >
              <article
                v-for="item in paginatedResults"
                :key="resultKey(item)"
                class="television-poster"
              >
                <div class="television-poster__wrap">
                  <button
                    type="button"
                    class="television-poster__btn"
                    :title="resultAriaLabel(item)"
                    :aria-label="resultAriaLabel(item)"
                    @click="openMediaFiche(item)"
                  >
                    <img
                      v-if="resultPoster(item)"
                      :src="resultPoster(item)"
                      :alt="resultTitle(item)"
                      class="television-poster__cover"
                      loading="lazy"
                    />
                    <div
                      v-else
                      class="television-poster__cover television-poster__cover--placeholder"
                      aria-hidden="true"
                    >
                      <span>🎬</span>
                    </div>
                    <span
                      v-if="isInLibrary(item)"
                      class="television-poster__badge"
                    >
                      Dans ma télé
                    </span>
                  </button>

                  <button
                    v-if="!isInLibrary(item)"
                    type="button"
                    class="television-poster__add"
                    :disabled="!userId || addingCatalogKey === catalogResultKey(item)"
                    :aria-label="`Ajouter « ${resultTitle(item)} » à ma télé`"
                    :title="userId ? 'Ajouter à ma télé (À regarder)' : 'Connecte-toi pour ajouter'"
                    @click="quickAddToLibrary(item)"
                  >
                    <span aria-hidden="true">
                      {{ addingCatalogKey === catalogResultKey(item) ? '…' : '+' }}
                    </span>
                  </button>
                </div>
              </article>
            </div>

            <nav
              v-if="showPagination && !isLoading"
              class="television-pagination"
              aria-label="Pagination des résultats"
            >
              <button
                type="button"
                class="television-pagination__btn"
                :disabled="currentPage <= 1"
                aria-label="Page précédente"
                @click="goToPage(currentPage - 1)"
              >
                ‹
              </button>
              <span class="television-pagination__label">
                Page {{ currentPage }} / {{ totalPages }}
              </span>
              <button
                type="button"
                class="television-pagination__btn"
                :disabled="currentPage >= totalPages"
                aria-label="Page suivante"
                @click="goToPage(currentPage + 1)"
              >
                ›
              </button>
            </nav>
          </template>

          <p v-else-if="!isLoading" class="television-status">
            <template v-if="catalogFilters.length">
              Aucun résultat avec ces filtres.
            </template>
            <template v-else>Aucun film ou série trouvé.</template>
          </p>
        </template>

        <p
          v-else-if="
            !isLoading &&
            searchQuery.trim().length > 0 &&
            searchQuery.trim().length < MIN_SEARCH_LENGTH
          "
          class="television-status"
        >
          Tape au moins {{ MIN_SEARCH_LENGTH }} caractères…
        </p>

        <p v-else-if="!isLoading && !loadError" class="television-status">
          Tape un titre (français ou anglais) pour lancer la recherche.
        </p>
      </template>
    </section>
  </div>
</template>

<style scoped>
.television-wrapper {
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
}

.television-header {
  margin-bottom: 1.5rem;
  text-align: center;
}

.television-title {
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  margin: 0;
}

.television-subtitle {
  margin: 0.5rem 0 0;
  color: #6c757d;
  font-size: 1rem;
}

.television-mode-tabs {
  display: inline-flex;
  gap: 0.35rem;
  margin-top: 1rem;
  padding: 0.25rem;
  border-radius: 12px;
  background: rgba(213, 181, 234, 0.18);
}

.television-mode-tab {
  padding: 0.45rem 0.9rem;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: #6b4f7c;
  font-weight: 700;
  font-size: 0.88rem;
  cursor: pointer;
}

.television-mode-tab--active {
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 1px 4px rgba(92, 62, 112, 0.12);
}

.television-card {
  width: 100%;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 16px;
  padding: 1.5rem 1.25rem;
  box-sizing: border-box;
}

.television-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: end;
  margin-bottom: 1.15rem;
}

.television-toolbar__filters {
  display: flex;
  align-items: end;
}

.television-filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.55rem 0.75rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.45);
  background: rgba(255, 255, 255, 0.85);
  color: #6b4f7c;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 750;
  cursor: pointer;
}

.television-filter-btn svg {
  width: 1rem;
  height: 1rem;
}

.television-filter-btn--active {
  background: rgba(173, 129, 190, 0.2);
  border-color: rgba(173, 129, 190, 0.55);
}

.television-filter-btn__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.15rem;
  height: 1.15rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: #ad81be;
  color: white;
  font-size: 0.7rem;
  font-weight: 800;
}

.television-active-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: -0.35rem 0 0.85rem;
}

.television-active-filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.28rem 0.5rem;
  border-radius: 999px;
  border: 1px solid rgba(213, 181, 234, 0.4);
  background: rgba(213, 181, 234, 0.16);
  color: #6b4f7c;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}

.television-active-filter-pill__remove {
  opacity: 0.75;
}

.television-search,
.television-filter {
  flex: 1;
  min-width: 12rem;
  display: grid;
  gap: 0.35rem;
}

.television-filter {
  flex: 0 1 12rem;
}

.television-search__label {
  font-size: 0.82rem;
  font-weight: 800;
  color: #6c757d;
}

.television-search__input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.6rem 0.75rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.85);
  color: #2c3e50;
  font: inherit;
  font-weight: 600;
}

.television-search__input:focus {
  outline: 2px solid rgba(173, 129, 190, 0.45);
  outline-offset: 1px;
}

.television-layout-measure {
  width: 100%;
  height: 0;
  overflow: hidden;
  pointer-events: none;
}

.television-section {
  margin-bottom: 1.25rem;
}

.television-section__title {
  margin: 0 0 0.75rem;
  font-size: 1.05rem;
  font-weight: 800;
  color: #5a4a68;
}

.television-section--en-cours {
  padding: 0.85rem 0.85rem 1rem;
  margin: 0 -0.15rem 1.25rem;
  border-radius: 14px;
  background: linear-gradient(145deg, rgba(213, 181, 234, 0.22), rgba(173, 129, 190, 0.1));
  border: 1px solid rgba(173, 129, 190, 0.28);
}

.television-section--en-cours .television-section__title {
  color: #7a4f8f;
}

.television-section--en-cours :deep(.tv-continue) {
  background: rgba(255, 255, 255, 0.82);
  border-color: rgba(173, 129, 190, 0.45);
  box-shadow: 0 2px 10px rgba(173, 129, 190, 0.12);
}

.television-poster--en-cours .television-poster__cover {
  border-color: rgba(173, 129, 190, 0.45);
  box-shadow: 0 2px 10px rgba(173, 129, 190, 0.18);
}

.television-continue-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.television-grid--after-continue {
  margin-top: 0.85rem;
}

.television-status {
  margin: 0;
  color: #6c757d;
  font-size: 0.95rem;
  line-height: 1.45;
  text-align: center;
}

.television-error {
  margin: 0;
  color: #c0392b;
  font-weight: 700;
  text-align: center;
}

.television-count {
  margin: 0 0 1rem;
  font-size: 0.9rem;
  font-weight: 700;
  color: #4a5560;
}

.television-grid {
  display: grid;
  grid-template-columns: repeat(var(--tv-cols, 4), minmax(0, 1fr));
  gap: 0.45rem;
  scroll-margin-top: 1rem;
}

.television-poster {
  min-width: 0;
}

.television-poster__wrap {
  position: relative;
}

.television-poster__fav {
  position: absolute;
  top: 0.28rem;
  right: 0.28rem;
  z-index: 2;
}

.television-poster__add {
  position: absolute;
  top: 0.28rem;
  right: 0.28rem;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: rgba(20, 16, 28, 0.55);
  color: #fff;
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  transition:
    transform 0.12s ease,
    background 0.12s ease;
}

.television-poster__add:hover:not(:disabled) {
  transform: scale(1.08);
  background: rgba(173, 129, 190, 0.92);
}

.television-poster__add:focus-visible {
  outline: 2px solid rgba(173, 129, 190, 0.75);
  outline-offset: 2px;
}

.television-poster__add:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

.television-poster__badge {
  position: absolute;
  left: 0.3rem;
  right: 0.3rem;
  bottom: 0.3rem;
  z-index: 1;
  padding: 0.2rem 0.35rem;
  border-radius: 4px;
  background: rgba(20, 16, 28, 0.72);
  color: #fff;
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
  pointer-events: none;
}

.television-poster__btn {
  position: relative;
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 5px;
  overflow: hidden;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.television-poster__btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(173, 129, 190, 0.25);
}

.television-poster__btn:focus-visible {
  outline: 2px solid rgba(173, 129, 190, 0.65);
  outline-offset: 2px;
}

.television-poster__cover {
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: 5px;
  object-fit: cover;
  display: block;
  border: 1px solid rgba(213, 181, 234, 0.2);
}

.television-poster__cover--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, #f4eef8, #e8d9f0);
  color: #ad81be;
  font-size: 1.25rem;
}

.television-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 1rem;
}

.television-pagination__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.45);
  background: rgba(255, 255, 255, 0.85);
  color: #ad81be;
  font-size: 1.1rem;
  font-weight: 800;
  cursor: pointer;
}

.television-pagination__btn:hover:not(:disabled) {
  background: rgba(213, 181, 234, 0.2);
}

.television-pagination__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.television-pagination__label {
  min-width: 6.5rem;
  text-align: center;
  font-size: 0.88rem;
  font-weight: 700;
  color: #6c757d;
}

@media (prefers-color-scheme: dark) {
  .television-title,
  .television-section__title {
    color: #f0e8f8;
  }

  .television-section--en-cours {
    background: linear-gradient(145deg, rgba(173, 129, 190, 0.22), rgba(61, 47, 74, 0.55));
    border-color: rgba(213, 181, 234, 0.28);
  }

  .television-section--en-cours .television-section__title {
    color: #e8dcf5;
  }

  .television-section--en-cours :deep(.tv-continue) {
    background: rgba(45, 38, 60, 0.9);
    border-color: rgba(213, 181, 234, 0.4);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  }

  .television-poster--en-cours .television-poster__cover {
    border-color: rgba(213, 181, 234, 0.4);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  }

  .television-subtitle,
  .television-status,
  .television-pagination__label {
    color: #adb5bd;
  }
  .television-card {
    background: rgba(35, 30, 48, 0.75);
    border-color: rgba(213, 181, 234, 0.2);
  }
  .television-mode-tabs {
    background: rgba(213, 181, 234, 0.12);
  }
  .television-mode-tab--active {
    background: rgba(45, 38, 60, 0.95);
    color: #f0e8f8;
  }
  .television-search__input {
    background: rgba(30, 24, 42, 0.9);
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.28);
  }
  .television-search__label {
    color: #adb5bd;
  }
  .television-count {
    color: #e9ecef;
  }
  .television-pagination__btn {
    background: rgba(30, 24, 42, 0.85);
  }
  .television-poster__cover--placeholder {
    background: linear-gradient(145deg, #2a2235, #3a2f48);
  }
}
</style>
