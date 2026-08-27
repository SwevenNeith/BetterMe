<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { supabase } from '../lib/supabase.js'
import { APP_PAGE_IDS } from '../constants/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import {
  isPageVisible,
  loadPageVisibility,
  mergePageVisibility,
  PAGE_VISIBILITY_UPDATED_EVENT,
} from '../services/pageVisibility.js'
import { READING_COLLECTION_EN_COURS } from '../services/readingCollections.js'
import { listReadingBooksWithCovers } from '../services/readingBooks.js'

const BOOKS_PER_PAGE = 3

const props = defineProps({
  userId: {
    type: String,
    default: null,
  },
})

const { pageTitle: readingPageTitle } = usePageDisplayLabel(APP_PAGE_IDS.LECTURE)

const pageVisibility = ref(mergePageVisibility(null))
const isLoading = ref(false)
const loadError = ref('')
const books = ref([])
const currentPage = ref(0)

const isReadingPageVisible = computed(() =>
  isPageVisible(APP_PAGE_IDS.LECTURE, pageVisibility.value),
)

const inProgressBooks = computed(() =>
  books.value.filter(
    (book) => String(book.collection ?? '').trim() === READING_COLLECTION_EN_COURS,
  ),
)

const totalPages = computed(() =>
  Math.max(1, Math.ceil(inProgressBooks.value.length / BOOKS_PER_PAGE)),
)

const paginatedBooks = computed(() => {
  const start = currentPage.value * BOOKS_PER_PAGE
  return inProgressBooks.value.slice(start, start + BOOKS_PER_PAGE)
})

const showPagination = computed(() => inProgressBooks.value.length > BOOKS_PER_PAGE)

watch(inProgressBooks, () => {
  if (currentPage.value > totalPages.value - 1) {
    currentPage.value = Math.max(0, totalPages.value - 1)
  }
})

function goToPage(index) {
  currentPage.value = Math.min(Math.max(index, 0), totalPages.value - 1)
}

async function loadPageVisibilityState() {
  if (!props.userId) {
    pageVisibility.value = mergePageVisibility(null)
    return
  }
  try {
    pageVisibility.value = await loadPageVisibility(supabase, props.userId)
  } catch (err) {
    console.error('dashboard reading visibility:', err)
    pageVisibility.value = mergePageVisibility(null)
  }
}

async function loadBooks() {
  if (!props.userId || !isReadingPageVisible.value) {
    books.value = []
    return
  }

  isLoading.value = true
  loadError.value = ''
  try {
    books.value = await listReadingBooksWithCovers(supabase, props.userId)
  } catch (err) {
    console.error('dashboard reading in progress:', err)
    loadError.value = err.message || 'Impossible de charger les lectures.'
    books.value = []
  } finally {
    isLoading.value = false
  }
}

async function reload() {
  await loadPageVisibilityState()
  await loadBooks()
}

watch(
  () => props.userId,
  () => {
    currentPage.value = 0
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
    v-if="isReadingPageVisible"
    class="dashboard-reading"
    aria-labelledby="dashboard-reading-title"
  >
    <div class="dashboard-reading__header">
      <h2 id="dashboard-reading-title" class="dashboard-reading__title">En cours</h2>
      <RouterLink :to="{ name: 'lecture' }" class="dashboard-reading__link">
        {{ readingPageTitle }}
      </RouterLink>
    </div>

    <div v-if="isLoading" class="dashboard-reading__state">
      <span class="spinner" aria-hidden="true"></span>
      Chargement des lectures…
    </div>

    <p v-else-if="loadError" class="dashboard-reading__error">{{ loadError }}</p>

    <p
      v-else-if="inProgressBooks.length === 0"
      class="dashboard-reading__state dashboard-reading__state--empty"
    >
      Aucune lecture en cours pour le moment.
    </p>

    <template v-else>
      <ul class="dashboard-reading__list">
        <li v-for="book in paginatedBooks" :key="book.id" class="dashboard-reading__item">
          <RouterLink
            :to="{ name: 'lecture-livre', params: { bookId: book.id } }"
            class="dashboard-reading__card"
          >
            <div class="dashboard-reading__cover-wrap">
              <img
                v-if="book.coverUrl"
                :src="book.coverUrl"
                :alt="`Couverture de ${book.title}`"
                class="dashboard-reading__cover"
              />
              <div v-else class="dashboard-reading__cover dashboard-reading__cover--placeholder">
                {{ book.title?.charAt(0)?.toUpperCase() || '?' }}
              </div>
            </div>
            <div class="dashboard-reading__meta">
              <h3 class="dashboard-reading__book-title">{{ book.title }}</h3>
              <p v-if="book.author" class="dashboard-reading__author">{{ book.author }}</p>
            </div>
          </RouterLink>
        </li>
      </ul>

      <nav
        v-if="showPagination"
        class="dashboard-reading__pagination"
        aria-label="Pagination des lectures en cours"
      >
        <button
          type="button"
          class="dashboard-reading__page-btn"
          :disabled="currentPage === 0"
          aria-label="Page précédente"
          @click="goToPage(currentPage - 1)"
        >
          ‹
        </button>
        <span class="dashboard-reading__page-label">
          {{ currentPage + 1 }} / {{ totalPages }}
        </span>
        <button
          type="button"
          class="dashboard-reading__page-btn"
          :disabled="currentPage >= totalPages - 1"
          aria-label="Page suivante"
          @click="goToPage(currentPage + 1)"
        >
          ›
        </button>
      </nav>
    </template>
  </section>
</template>

<style scoped>
.dashboard-reading {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
  padding: 1rem 1.1rem;
  border-radius: 16px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-sizing: border-box;
}

.dashboard-reading__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.dashboard-reading__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: #ad81be;
}

.dashboard-reading__link {
  font-size: 0.78rem;
  font-weight: 700;
  color: #8c6a9e;
  text-decoration: none;
  white-space: nowrap;
}

.dashboard-reading__link:hover {
  text-decoration: underline;
}

.dashboard-reading__state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: #6c757d;
  font-weight: 700;
  font-size: 0.9rem;
  text-align: center;
}

.dashboard-reading__state--empty {
  padding: 0.35rem 0;
}

.dashboard-reading__error {
  margin: 0;
  color: #c0392b;
  font-weight: 700;
  font-size: 0.88rem;
  text-align: center;
}

.dashboard-reading__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.dashboard-reading__card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.45rem 0.5rem;
  border-radius: 12px;
  text-decoration: none;
  color: inherit;
  border: 1px solid rgba(213, 181, 234, 0.2);
  background: rgba(255, 255, 255, 0.45);
  transition: background 0.15s ease, border-color 0.15s ease;
}

.dashboard-reading__card:hover {
  background: rgba(213, 181, 234, 0.18);
  border-color: rgba(173, 129, 190, 0.35);
}

.dashboard-reading__cover-wrap {
  flex-shrink: 0;
  width: 44px;
  height: 64px;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.dashboard-reading__cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.dashboard-reading__cover--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(213, 181, 234, 0.25);
  color: #ad81be;
  font-weight: 800;
  font-size: 1.1rem;
}

.dashboard-reading__meta {
  min-width: 0;
  flex: 1;
}

.dashboard-reading__book-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 800;
  color: #2c3e50;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-reading__author {
  margin: 0.2rem 0 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: #8c98a4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-reading__pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
}

.dashboard-reading__page-btn {
  width: 2rem;
  height: 2rem;
  border: none;
  border-radius: 8px;
  background: rgba(213, 181, 234, 0.25);
  color: #ad81be;
  font-size: 1.2rem;
  font-weight: 700;
  cursor: pointer;
  line-height: 1;
}

.dashboard-reading__page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.dashboard-reading__page-label {
  font-size: 0.85rem;
  font-weight: 700;
  color: #6c757d;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(213, 181, 234, 0.35);
  border-top-color: #ad81be;
  border-radius: 50%;
  animation: dash-reading-spin 1s linear infinite;
}

@keyframes dash-reading-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-color-scheme: dark) {
  .dashboard-reading {
    background: rgba(25, 20, 35, 0.65);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .dashboard-reading__card {
    background: rgba(0, 0, 0, 0.2);
    border-color: rgba(213, 181, 234, 0.15);
  }

  .dashboard-reading__book-title {
    color: #f0e8f8;
  }

  .dashboard-reading__state,
  .dashboard-reading__page-label {
    color: #adb5bd;
  }
}
</style>
