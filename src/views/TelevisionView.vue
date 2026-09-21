<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
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
  if (item?.media_type === 'movie') return 'Movie'
  if (item?.media_type === 'tv') return 'TV show'
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

async function onSearch() {
  const q = searchQuery.value.trim()
  if (!q || isLoading.value) return

  isLoading.value = true
  loadError.value = ''
  searchPayload.value = null
  currentPage.value = 1
  progressLabel.value = 'Loading…'

  try {
    searchPayload.value = await searchTmdbAllPages(q, {
      onProgress: ({ loadedPages, totalPages: pages }) => {
        progressLabel.value =
          pages > 1
            ? `Loading pages… (${Math.min(loadedPages, pages)} / ${pages})`
            : 'Loading…'
      },
    })
    await nextTick()
    bindGridResizeObserver()
  } catch (err) {
    console.error(err)
    loadError.value = err.message || 'TMDB search failed.'
  } finally {
    isLoading.value = false
    progressLabel.value = ''
  }
}

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
      <form class="television-search" @submit.prevent="onSearch">
        <label class="television-search__field">
          <span class="sr-only">Rechercher un film ou une série</span>
          <input
            v-model="searchQuery"
            type="search"
            class="television-search__input"
            placeholder="Search movies & TV shows…"
            maxlength="120"
            autocomplete="off"
            :disabled="isLoading"
          />
        </label>
        <button
          type="submit"
          class="television-search__btn"
          :disabled="isLoading || !searchQuery.trim()"
        >
          {{ isLoading ? 'Searching…' : 'Search' }}
        </button>
      </form>

      <div ref="televisionLayoutRef" class="television-layout-measure" aria-hidden="true" />

      <p v-if="isLoading" class="television-status">{{ progressLabel || 'Searching…' }}</p>
      <p v-else-if="loadError" class="television-error">{{ loadError }}</p>

      <template v-else-if="searchPayload">
        <p class="television-count">
          {{ displayResults.length }} result{{ displayResults.length === 1 ? '' : 's' }}
          <span
            v-if="
              searchPayload.movie_total_results != null || searchPayload.tv_total_results != null
            "
          >
            ({{ searchPayload.movie_total_results || 0 }} movies ·
            {{ searchPayload.tv_total_results || 0 }} TV)
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
            v-if="showPagination"
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

        <p v-else class="television-status">No movies or TV shows found.</p>
      </template>

      <p v-else class="television-status">
        Tape un titre puis lance la recherche pour interroger TMDB.
      </p>
    </section>
  </div>
</template>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

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

.television-search {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-bottom: 1.15rem;
}

.television-search__field {
  flex: 1;
  min-width: 12rem;
}

.television-search__input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(213, 181, 234, 0.5);
  border-radius: 12px;
  padding: 0.7rem 0.95rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: #2c3e50;
  background: rgba(255, 255, 255, 0.9);
}

.television-search__input:focus {
  outline: none;
  border-color: #ad81be;
  box-shadow: 0 0 0 3px rgba(173, 129, 190, 0.18);
}

.television-search__btn {
  border: none;
  border-radius: 12px;
  padding: 0.7rem 1.2rem;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: #fff;
}

.television-search__btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.television-search__btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
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
