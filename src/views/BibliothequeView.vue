<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { APP_PAGE_IDS } from '../constants/common/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import { supabase } from '../lib/supabase.js'
import { listReadingBooks } from '../services/lecture/readingBooks.js'
import { searchOpenLibrary } from '../services/bibliotheque/openLibrary.js'
import {
  findLectureBookForOpenLibraryDoc,
  syncLectureBooksWithOpenLibrary,
} from '../services/bibliotheque/openLibraryLink.js'

const { pageTitle } = usePageDisplayLabel(APP_PAGE_IDS.BIBLIOTHEQUE, undefined, {
  setDocumentTitle: true,
})

const router = useRouter()

const SEARCH_DEBOUNCE_MS = 350
const MIN_SEARCH_LENGTH = 2
const PAGE_SIZE = 24

const userId = ref(null)
const lectureBooks = ref([])
const searchQuery = ref('')
const isLoading = ref(false)
const loadError = ref('')
const results = ref([])
const numFound = ref(0)
const currentPage = ref(1)

const isSyncing = ref(false)
const syncError = ref('')
const syncSummary = ref('')
const syncProgress = ref(null)

let searchDebounceTimer = null
let searchAbortController = null
let searchRequestId = 0
let syncAbortController = null

const totalPages = computed(() => Math.max(1, Math.ceil(numFound.value / PAGE_SIZE)))

const showPagination = computed(
  () => !isLoading.value && results.value.length > 0 && totalPages.value > 1,
)

const linkedCount = computed(
  () => lectureBooks.value.filter((book) => String(book.open_library_work_key || '').trim()).length,
)

async function loadLectureBooks() {
  if (!userId.value) {
    lectureBooks.value = []
    return
  }
  try {
    lectureBooks.value = await listReadingBooks(supabase, userId.value)
  } catch (err) {
    console.error(err)
  }
}

function isLinkedDoc(doc) {
  return Boolean(findLectureBookForOpenLibraryDoc(lectureBooks.value, doc))
}

function openBook(doc) {
  if (!doc?.key) return

  const linked = findLectureBookForOpenLibraryDoc(lectureBooks.value, doc)
  if (linked?.id) {
    router.push({ name: 'lecture-livre', params: { bookId: linked.id } })
    return
  }

  const workKey = String(doc.key).replace(/^\/works\//, '')
  router.push({
    name: 'bibliotheque-livre',
    params: { workKey },
  })
}

async function runSearch(rawQuery, page = 1) {
  const q = String(rawQuery ?? '').trim()
  const requestId = ++searchRequestId

  searchAbortController?.abort()
  searchAbortController = null

  if (q.length < MIN_SEARCH_LENGTH) {
    results.value = []
    numFound.value = 0
    currentPage.value = 1
    loadError.value = ''
    isLoading.value = false
    return
  }

  isLoading.value = true
  loadError.value = ''
  currentPage.value = page

  const controller = new AbortController()
  searchAbortController = controller

  try {
    const payload = await searchOpenLibrary(q, {
      page,
      limit: PAGE_SIZE,
      signal: controller.signal,
    })
    if (requestId !== searchRequestId) return
    results.value = payload.docs
    numFound.value = payload.numFound
  } catch (err) {
    if (err?.name === 'AbortError') return
    if (requestId !== searchRequestId) return
    console.error(err)
    results.value = []
    numFound.value = 0
    loadError.value = err.message || 'Échec de la recherche Open Library.'
  } finally {
    if (requestId === searchRequestId) {
      isLoading.value = false
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
    searchAbortController?.abort()
    searchAbortController = null
    results.value = []
    numFound.value = 0
    currentPage.value = 1
    loadError.value = ''
    isLoading.value = false
    return
  }

  searchDebounceTimer = window.setTimeout(() => {
    searchDebounceTimer = null
    runSearch(q, 1)
  }, SEARCH_DEBOUNCE_MS)
}

function goToPage(page) {
  const next = Math.min(Math.max(page, 1), totalPages.value)
  if (next === currentPage.value && results.value.length) return
  runSearch(searchQuery.value, next)
}

const failedCoverKeys = ref(new Set())

function resultKey(doc) {
  return doc?.key || `${doc?.title}-${doc?.firstPublishYear}`
}

function coverFor(doc) {
  if (!doc?.coverUrl) return null
  if (failedCoverKeys.value.has(resultKey(doc))) return null
  return doc.coverUrl
}

function onCoverError(doc) {
  const key = resultKey(doc)
  if (!key || failedCoverKeys.value.has(key)) return
  const next = new Set(failedCoverKeys.value)
  next.add(key)
  failedCoverKeys.value = next
}

async function syncWithOpenLibrary() {
  if (!userId.value || isSyncing.value) return

  isSyncing.value = true
  syncError.value = ''
  syncSummary.value = ''
  syncProgress.value = { done: 0, total: lectureBooks.value.length || 0 }

  syncAbortController?.abort()
  syncAbortController = new AbortController()

  try {
    const result = await syncLectureBooksWithOpenLibrary(supabase, userId.value, {
      signal: syncAbortController.signal,
      onProgress: (info) => {
        syncProgress.value = info
      },
    })
    await loadLectureBooks()
    syncSummary.value =
      `${result.linked} livre${result.linked === 1 ? '' : 's'} lié${result.linked === 1 ? '' : 's'} ` +
      `(${result.alreadyLinked} déjà liés, ${result.unmatched} sans correspondance exacte).`
  } catch (err) {
    if (err?.name === 'AbortError') return
    console.error(err)
    syncError.value =
      err.message?.includes('open_library_work_key') || err.code === 'PGRST204'
        ? 'Colonne Open Library absente : exécute scripts/migrate-reading-books-open-library.sql dans Supabase.'
        : err.message || 'Échec de la synchronisation.'
  } finally {
    isSyncing.value = false
    syncAbortController = null
  }
}

watch(searchQuery, (value) => {
  scheduleSearch(value)
})

onMounted(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) userId.value = user.id
  await loadLectureBooks()
})

onUnmounted(() => {
  if (searchDebounceTimer != null) clearTimeout(searchDebounceTimer)
  searchRequestId += 1
  searchAbortController?.abort()
  searchAbortController = null
  syncAbortController?.abort()
  syncAbortController = null
})
</script>

<template>
  <div class="bibliotheque-wrapper">
    <header class="bibliotheque-header">
      <h1 class="bibliotheque-title">{{ pageTitle }}</h1>
      <p class="bibliotheque-subtitle">
        Explore des livres via Open Library : titre, auteur, ISBN…
      </p>
      <div class="bibliotheque-sync">
        <button
          type="button"
          class="bibliotheque-sync__btn"
          :disabled="!userId || isSyncing"
          @click="syncWithOpenLibrary"
        >
          {{
            isSyncing
              ? `Liaison… ${syncProgress?.done || 0}/${syncProgress?.total || '—'}`
              : 'Lier mes livres Lecture'
          }}
        </button>
        <p v-if="lectureBooks.length" class="bibliotheque-sync__meta">
          {{ linkedCount }} / {{ lectureBooks.length }} déjà liés
        </p>
        <p v-if="syncSummary" class="bibliotheque-sync__ok">{{ syncSummary }}</p>
        <p v-if="syncError" class="bibliotheque-sync__error">{{ syncError }}</p>
      </div>
    </header>

    <section class="bibliotheque-card">
      <div class="bibliotheque-toolbar">
        <label class="bibliotheque-search">
          <span class="bibliotheque-search__label">Rechercher</span>
          <input
            v-model="searchQuery"
            type="search"
            class="bibliotheque-search__input"
            placeholder="Titre, auteur, ISBN…"
            maxlength="200"
            autocomplete="off"
          />
        </label>
      </div>

      <p v-if="isLoading" class="bibliotheque-status">Recherche en cours…</p>
      <p v-else-if="loadError" class="bibliotheque-error">{{ loadError }}</p>

      <template v-else-if="results.length">
        <p class="bibliotheque-count">
          {{ numFound }} résultat{{ numFound === 1 ? '' : 's' }}
          <span v-if="totalPages > 1">· page {{ currentPage }} / {{ totalPages }}</span>
        </p>

        <div class="bibliotheque-grid">
          <article v-for="doc in results" :key="resultKey(doc)" class="bibliotheque-book">
            <button
              type="button"
              class="bibliotheque-book__link"
              :aria-label="`${doc.title} — ${doc.authorLabel}`"
              @click="openBook(doc)"
            >
              <div class="bibliotheque-book__cover-wrap">
                <img
                  v-if="coverFor(doc)"
                  :src="coverFor(doc)"
                  :alt="`Couverture de ${doc.title}`"
                  class="bibliotheque-book__cover"
                  loading="lazy"
                  @error="onCoverError(doc)"
                />
                <div
                  v-else
                  class="bibliotheque-book__cover bibliotheque-book__cover--placeholder"
                  aria-hidden="true"
                >
                  <span>📖</span>
                </div>
                <span v-if="isLinkedDoc(doc)" class="bibliotheque-book__badge">Dans Lecture</span>
              </div>
              <div class="bibliotheque-book__meta">
                <h2 class="bibliotheque-book__title">{{ doc.title }}</h2>
                <p v-if="doc.subtitle" class="bibliotheque-book__subtitle">{{ doc.subtitle }}</p>
                <p class="bibliotheque-book__author">{{ doc.authorLabel }}</p>
                <p class="bibliotheque-book__details">
                  <span v-if="doc.firstPublishYear">{{ doc.firstPublishYear }}</span>
                  <span v-if="doc.editionCount">
                    · {{ doc.editionCount }} édition{{ doc.editionCount > 1 ? 's' : '' }}
                  </span>
                </p>
              </div>
            </button>
          </article>
        </div>

        <nav
          v-if="showPagination"
          class="bibliotheque-pagination"
          aria-label="Pagination des résultats"
        >
          <button
            type="button"
            class="bibliotheque-pagination__btn"
            :disabled="currentPage <= 1"
            aria-label="Page précédente"
            @click="goToPage(currentPage - 1)"
          >
            ‹
          </button>
          <span class="bibliotheque-pagination__label">
            Page {{ currentPage }} / {{ totalPages }}
          </span>
          <button
            type="button"
            class="bibliotheque-pagination__btn"
            :disabled="currentPage >= totalPages"
            aria-label="Page suivante"
            @click="goToPage(currentPage + 1)"
          >
            ›
          </button>
        </nav>
      </template>

      <p
        v-else-if="!isLoading && searchQuery.trim().length > 0 && searchQuery.trim().length < MIN_SEARCH_LENGTH"
        class="bibliotheque-status"
      >
        Tape au moins {{ MIN_SEARCH_LENGTH }} caractères…
      </p>

      <p
        v-else-if="!isLoading && searchQuery.trim().length >= MIN_SEARCH_LENGTH"
        class="bibliotheque-status"
      >
        Aucun livre trouvé.
      </p>

      <p v-else-if="!isLoading" class="bibliotheque-status">
        Tape un titre, un auteur ou un ISBN pour lancer la recherche.
      </p>
    </section>
  </div>
</template>

<style scoped>
.bibliotheque-wrapper {
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
}

.bibliotheque-header {
  margin-bottom: 1.5rem;
  text-align: center;
}

.bibliotheque-title {
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  margin: 0;
}

.bibliotheque-subtitle {
  margin: 0.5rem 0 0;
  color: #6c757d;
  font-size: 1rem;
}

.bibliotheque-sync {
  margin-top: 1rem;
  display: grid;
  gap: 0.35rem;
  justify-items: center;
}

.bibliotheque-sync__btn {
  border: none;
  border-radius: 12px;
  padding: 0.65rem 1.1rem;
  font-weight: 800;
  font-size: 0.9rem;
  cursor: pointer;
  background: linear-gradient(135deg, #95d1aa, #72a098);
  color: #fff;
}

.bibliotheque-sync__btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.bibliotheque-sync__meta,
.bibliotheque-sync__ok {
  margin: 0;
  font-size: 0.82rem;
  color: #6c757d;
}

.bibliotheque-sync__ok {
  color: #72a098;
  font-weight: 700;
}

.bibliotheque-sync__error {
  margin: 0;
  font-size: 0.85rem;
  color: #c0392b;
  font-weight: 700;
  max-width: 36rem;
}

.bibliotheque-card {
  width: 100%;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 16px;
  padding: 1.5rem 1.25rem;
  box-sizing: border-box;
}

.bibliotheque-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: end;
  margin-bottom: 1.15rem;
}

.bibliotheque-search {
  flex: 1;
  min-width: 12rem;
  display: grid;
  gap: 0.35rem;
}

.bibliotheque-search__label {
  font-size: 0.82rem;
  font-weight: 800;
  color: #6c757d;
}

.bibliotheque-search__input {
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

.bibliotheque-search__input:focus {
  outline: 2px solid rgba(173, 129, 190, 0.45);
  outline-offset: 1px;
}

.bibliotheque-search__input::-webkit-search-cancel-button {
  cursor: pointer;
}

.bibliotheque-status {
  margin: 0;
  color: #6c757d;
  font-size: 0.95rem;
  line-height: 1.45;
  text-align: center;
}

.bibliotheque-error {
  margin: 0;
  color: #c0392b;
  font-weight: 700;
  text-align: center;
}

.bibliotheque-count {
  margin: 0 0 1rem;
  font-size: 0.9rem;
  font-weight: 700;
  color: #4a5560;
}

.bibliotheque-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10.5rem, 1fr));
  gap: 1rem;
}

.bibliotheque-book__link {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  width: 100%;
  height: 100%;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  text-decoration: none;
  color: inherit;
  border-radius: 10px;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.bibliotheque-book__link:hover {
  transform: translateY(-2px);
}

.bibliotheque-book__cover-wrap {
  position: relative;
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  background: linear-gradient(145deg, #f4eef8, #e8d9f0);
  border: 1px solid rgba(213, 181, 234, 0.25);
}

.bibliotheque-book__badge {
  position: absolute;
  left: 0.4rem;
  bottom: 0.4rem;
  padding: 0.2rem 0.45rem;
  border-radius: 999px;
  background: rgba(114, 160, 152, 0.95);
  color: #fff;
  font-size: 0.68rem;
  font-weight: 800;
}

.bibliotheque-book__cover {
  display: block;
  width: 100%;
  aspect-ratio: 2 / 3;
  object-fit: cover;
}

.bibliotheque-book__cover--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ad81be;
  font-size: 1.5rem;
}

.bibliotheque-book__meta {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.bibliotheque-book__title {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 800;
  color: #2c3e50;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.bibliotheque-book__subtitle {
  margin: 0;
  font-size: 0.78rem;
  color: #6c757d;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.bibliotheque-book__author {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: #5a4a68;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.bibliotheque-book__details {
  margin: 0.15rem 0 0;
  font-size: 0.75rem;
  color: #6c757d;
}

.bibliotheque-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 1.25rem;
}

.bibliotheque-pagination__btn {
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

.bibliotheque-pagination__btn:hover:not(:disabled) {
  background: rgba(213, 181, 234, 0.2);
}

.bibliotheque-pagination__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.bibliotheque-pagination__label {
  min-width: 6.5rem;
  text-align: center;
  font-size: 0.88rem;
  font-weight: 700;
  color: #6c757d;
}

@media (prefers-color-scheme: dark) {
  .bibliotheque-title {
    color: #f0e8f8;
  }
  .bibliotheque-subtitle,
  .bibliotheque-status,
  .bibliotheque-pagination__label,
  .bibliotheque-book__subtitle,
  .bibliotheque-book__details {
    color: #adb5bd;
  }
  .bibliotheque-card {
    background: rgba(35, 30, 48, 0.75);
    border-color: rgba(213, 181, 234, 0.2);
  }
  .bibliotheque-search__input {
    background: rgba(30, 24, 42, 0.9);
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.28);
  }
  .bibliotheque-search__label {
    color: #adb5bd;
  }
  .bibliotheque-count,
  .bibliotheque-book__title {
    color: #e9ecef;
  }
  .bibliotheque-book__author {
    color: #c9b0d8;
  }
  .bibliotheque-pagination__btn {
    background: rgba(30, 24, 42, 0.85);
  }
  .bibliotheque-book__cover-wrap,
  .bibliotheque-book__cover--placeholder {
    background: linear-gradient(145deg, #2a2235, #3a2f48);
  }
}
</style>
