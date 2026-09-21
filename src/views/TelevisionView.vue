<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { APP_PAGE_IDS } from '../constants/common/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import { searchTmdbAllPages, tmdbPosterUrl } from '../services/television/tmdb.js'

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

const searchQuery = ref('')
const isLoading = ref(false)
const loadError = ref('')
const searchPayload = ref(null)
const progressLabel = ref('')
const currentPage = ref(1)
const gridColumnCount = ref(4)
const televisionGridRef = ref(null)
const televisionLayoutRef = ref(null)
let gridResizeObserver = null
let searchDebounceTimer = null
let searchRequestId = 0

const SEARCH_DEBOUNCE_MS = 350
const MIN_SEARCH_LENGTH = 2

const displayResults = computed(() => {
  const list = searchPayload.value?.results
  return Array.isArray(list) ? list : []
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

function resultTitle(item) {
  return item?.title || item?.name || item?.original_title || item?.original_name || 'Untitled'
}

function resultTypeLabel(item) {
  if (item?.media_type === 'movie') return 'Film'
  if (item?.media_type === 'tv') return 'Série'
  return item?.media_type || ''
}

function resultPoster(item) {
  return tmdbPosterUrl(item?.poster_path, 'w342')
}

function resultKey(item) {
  return `${item?.media_type ?? 'x'}-${item?.id ?? Math.random()}`
}

function resultAriaLabel(item) {
  const year = String(item?.first_air_date || item?.release_date || '').slice(0, 4)
  const type = resultTypeLabel(item)
  return [resultTitle(item), type, year].filter(Boolean).join(' · ')
}

function openMediaFiche(item) {
  const mediaType = item?.media_type === 'tv' ? 'tv' : item?.media_type === 'movie' ? 'movie' : ''
  const tmdbId = item?.id
  if (!mediaType || !tmdbId) return
  router.push({
    name: 'television-fiche',
    params: { mediaType, tmdbId: String(tmdbId) },
  })
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

async function runSearch(rawQuery) {
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
  currentPage.value = 1
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

watch(searchQuery, (value) => {
  scheduleSearch(value)
})

watch(totalPages, (pages) => {
  if (currentPage.value > pages) currentPage.value = pages
})

watch(itemsPerPage, () => {
  if (currentPage.value > totalPages.value) {
    currentPage.value = totalPages.value
  }
})

onMounted(async () => {
  await nextTick()
  bindGridResizeObserver()
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
      <p class="television-subtitle">
        Suis tes séries et films : vus, en cours, à voir…
      </p>
    </header>

    <section class="television-card">
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
      </div>

      <div ref="televisionLayoutRef" class="television-layout-measure" aria-hidden="true" />

      <p v-if="isLoading" class="television-status">{{ progressLabel || 'Recherche…' }}</p>
      <p v-else-if="loadError" class="television-error">{{ loadError }}</p>

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

        <p v-else-if="!isLoading" class="television-status">Aucun film ou série trouvé.</p>
      </template>

      <p
        v-else-if="!isLoading && searchQuery.trim().length > 0 && searchQuery.trim().length < MIN_SEARCH_LENGTH"
        class="television-status"
      >
        Tape au moins {{ MIN_SEARCH_LENGTH }} caractères…
      </p>

      <p v-else-if="!isLoading && !loadError" class="television-status">
        Tape un titre (français ou anglais) pour lancer la recherche.
      </p>
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

.television-search {
  flex: 1;
  min-width: 12rem;
  display: grid;
  gap: 0.35rem;
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

.television-search__input::-webkit-search-cancel-button {
  cursor: pointer;
}

.television-layout-measure {
  width: 100%;
  height: 0;
  overflow: hidden;
  pointer-events: none;
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

.television-poster__btn {
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 5px;
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
  transition:
    background 0.15s ease,
    opacity 0.15s ease;
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
  .television-title {
    color: #f0e8f8;
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
