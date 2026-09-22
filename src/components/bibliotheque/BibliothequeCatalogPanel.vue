<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../../lib/supabase.js'
import {
  createReadingBook,
  linkReadingBookToOpenLibrary,
  listReadingBooks,
} from '../../services/lecture/readingBooks.js'
import { READING_COLLECTION_WISHLIST } from '../../services/lecture/readingCollections.js'
import { searchOpenLibrary, getOpenLibraryWorkSeriesInfo } from '../../services/bibliotheque/openLibrary.js'
import {
  findLectureBookForOpenLibraryDoc,
  resolveSubjectsForWork,
  syncLectureBooksWithOpenLibrary,
} from '../../services/bibliotheque/openLibraryLink.js'
import { isExactOpenLibraryMatch } from '../../utils/bibliotheque/openLibraryMatch.js'
import { normalizeOpenLibrarySubjects } from '../../utils/bibliotheque/openLibrarySubjects.js'
import { seriesToReadingBookFields } from '../../utils/bibliotheque/openLibrarySeries.js'
import {
  OPEN_LIBRARY_EBOOK_OPTIONS,
  OPEN_LIBRARY_LANGUAGE_OPTIONS,
  OPEN_LIBRARY_SORT_OPTIONS,
  createDefaultOpenLibrarySearchFilters,
} from '../../constants/bibliotheque/openLibrarySearchFilters.js'
import {
  readPersistedPageState,
  writePersistedPageState,
} from '../../composables/usePersistedPageState.js'

const CATALOG_SEARCH_STORAGE_KEY = 'betterme-bibliotheque-catalog-v2'

const props = defineProps({
  /** Livres Lecture déjà chargés (évite un 2e fetch si le parent les a). */
  lectureBooks: {
    type: Array,
    default: null,
  },
})

const emit = defineEmits(['linked-change', 'request-add-book'])

const router = useRouter()

const SEARCH_DEBOUNCE_MS = 350
const MIN_SEARCH_LENGTH = 2
const PAGE_SIZE = 24

const persistedCatalog = readPersistedPageState(CATALOG_SEARCH_STORAGE_KEY, {
  searchQuery: '',
  filtersOpen: false,
  searchFilters: createDefaultOpenLibrarySearchFilters(),
  currentPage: 1,
})

const userId = ref(null)
const localLectureBooks = ref([])
const searchQuery = ref(String(persistedCatalog.searchQuery ?? ''))
const filtersOpen = ref(Boolean(persistedCatalog.filtersOpen))
const searchFilters = ref({
  ...createDefaultOpenLibrarySearchFilters(),
  ...(persistedCatalog.searchFilters && typeof persistedCatalog.searchFilters === 'object'
    ? persistedCatalog.searchFilters
    : {}),
})
const isLoading = ref(false)
const loadError = ref('')
const results = ref([])
const numFound = ref(0)
const currentPage = ref(Math.max(1, Number(persistedCatalog.currentPage) || 1))

const isSyncing = ref(false)
const syncError = ref('')
const syncSummary = ref('')
const syncProgress = ref(null)
/** Clé work Open Library en cours d’ajout rapide. */
const addingWorkKey = ref('')
const addError = ref('')

let searchDebounceTimer = null
let searchAbortController = null
let searchRequestId = 0
let syncAbortController = null

const books = computed(() =>
  Array.isArray(props.lectureBooks) ? props.lectureBooks : localLectureBooks.value,
)

const totalPages = computed(() => Math.max(1, Math.ceil(numFound.value / PAGE_SIZE)))

const showPagination = computed(
  () => !isLoading.value && results.value.length > 0 && totalPages.value > 1,
)

const linkedCount = computed(
  () => books.value.filter((book) => String(book.open_library_work_key || '').trim()).length,
)

async function loadLectureBooks() {
  if (Array.isArray(props.lectureBooks)) return
  if (!userId.value) {
    localLectureBooks.value = []
    return
  }
  try {
    localLectureBooks.value = await listReadingBooks(supabase, userId.value)
  } catch (err) {
    console.error(err)
  }
}

function isLinkedDoc(doc) {
  return Boolean(findLectureBookForOpenLibraryDoc(books.value, doc))
}

function openBook(doc) {
  if (!doc?.key) return

  const linked = findLectureBookForOpenLibraryDoc(books.value, doc)
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

function docWorkKey(doc) {
  return String(doc?.key || '').trim()
}

async function refreshLectureBooksAfterAdd() {
  if (Array.isArray(props.lectureBooks)) {
    emit('linked-change')
    return
  }
  await loadLectureBooks()
  emit('linked-change')
}

async function quickAddToLibrary(doc) {
  if (!doc?.key || !userId.value || addingWorkKey.value) return
  if (isLinkedDoc(doc)) return

  const workKey = docWorkKey(doc)
  addingWorkKey.value = workKey
  addError.value = ''

  try {
    const matched =
      findLectureBookForOpenLibraryDoc(books.value, doc) ||
      books.value.find((book) => isExactOpenLibraryMatch(book, doc)) ||
      null

    if (matched) {
      const series = await getOpenLibraryWorkSeriesInfo(doc.key)
      const seriesFields = seriesToReadingBookFields(series)
      const subjects = await resolveSubjectsForWork(doc.key, doc.subjects)
      await linkReadingBookToOpenLibrary(supabase, userId.value, matched.id, {
        workKey: doc.key,
        pages: doc.pageCount,
        publicationYear: doc.firstPublishYear,
        subjects,
        ...seriesFields,
      })
    } else {
      const subjects = normalizeOpenLibrarySubjects(
        await resolveSubjectsForWork(doc.key, doc.subjects),
      )
      const series = await getOpenLibraryWorkSeriesInfo(doc.key)
      const seriesFields = seriesToReadingBookFields(series)
      await createReadingBook(supabase, userId.value, {
        title: doc.title,
        author: doc.authorLabel === 'Auteur inconnu' ? '' : doc.authorLabel,
        collection: READING_COLLECTION_WISHLIST,
        pages: doc.pageCount ?? '',
        publicationYear: doc.firstPublishYear ?? '',
        imageUrl: doc.coverUrl || '',
        openLibraryWorkKey: doc.key,
        // Tableau de tags direct (évite le round-trip genre/extraTags qui re-coupe les virgules)
        tags: subjects,
        ...seriesFields,
      })
    }

    await refreshLectureBooksAfterAdd()
  } catch (err) {
    console.error(err)
    addError.value = err?.message || 'Impossible d’ajouter ce livre.'
  } finally {
    addingWorkKey.value = ''
  }
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
    addError.value = ''
    isLoading.value = false
    return
  }

  isLoading.value = true
  loadError.value = ''
  addError.value = ''
  currentPage.value = page

  const controller = new AbortController()
  searchAbortController = controller

  try {
    const filters = searchFilters.value
    const payload = await searchOpenLibrary(q, {
      page,
      limit: PAGE_SIZE,
      signal: controller.signal,
      language: filters.language,
      sort: filters.sort || null,
      yearFrom: filters.yearFrom,
      yearTo: filters.yearTo,
      subject: filters.subject,
      author: filters.author,
      hasFulltext: filters.hasFulltext,
      ebookAccess: filters.ebookAccess || null,
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
    if (requestId === searchRequestId) isLoading.value = false
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
  syncProgress.value = { done: 0, total: books.value.length || 0 }

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
    emit('linked-change')
    syncSummary.value =
      `${result.linked} nouvellement lié${result.linked === 1 ? '' : 's'} · ` +
      `${result.alreadyLinked} déjà lié${result.alreadyLinked === 1 ? '' : 's'} · ` +
      `${result.subjectsUpdated || 0} sujet${result.subjectsUpdated === 1 ? '' : 's'} complété${result.subjectsUpdated === 1 ? '' : 's'} · ` +
      `${result.unmatched} sans match exact titre+auteur` +
      (result.unmatched
        ? ' (titre/auteur différent sur Open Library, faute de frappe, ou introuvable — normal).'
        : '.')
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

watch(
  searchFilters,
  () => {
    if (String(searchQuery.value ?? '').trim().length >= MIN_SEARCH_LENGTH) {
      scheduleSearch(searchQuery.value)
    }
  },
  { deep: true },
)

watch(
  [searchQuery, searchFilters, filtersOpen, currentPage],
  () => {
    writePersistedPageState(CATALOG_SEARCH_STORAGE_KEY, {
      searchQuery: searchQuery.value,
      filtersOpen: filtersOpen.value,
      searchFilters: searchFilters.value,
      currentPage: currentPage.value,
    })
  },
  { deep: true },
)

function resetSearchFilters() {
  searchFilters.value = createDefaultOpenLibrarySearchFilters()
}

function requestAddMissingBook() {
  emit('request-add-book', {
    query: String(searchQuery.value ?? '').trim(),
    author: String(searchFilters.value.author ?? '').trim(),
  })
}

onMounted(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) userId.value = user.id
  await loadLectureBooks()

  const q = String(searchQuery.value ?? '').trim()
  if (q.length >= MIN_SEARCH_LENGTH) {
    await runSearch(q, currentPage.value || 1)
  }
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
  <div class="catalog-panel">
    <div class="catalog-panel__sync">
      <button
        type="button"
        class="catalog-panel__sync-btn"
        :disabled="!userId || isSyncing"
        @click="syncWithOpenLibrary"
      >
        {{
          isSyncing
            ? `Liaison… ${syncProgress?.done || 0}/${syncProgress?.total || '—'}`
            : 'Lier mes livres à Open Library'
        }}
      </button>
      <p v-if="books.length" class="catalog-panel__sync-meta">
        {{ linkedCount }} / {{ books.length }} déjà liés
      </p>
      <p v-if="syncSummary" class="catalog-panel__sync-ok">{{ syncSummary }}</p>
      <p v-if="syncError" class="catalog-panel__sync-error">{{ syncError }}</p>
    </div>

    <div class="catalog-panel__toolbar">
      <label class="catalog-panel__search">
        <span class="catalog-panel__search-label">Catalogue Open Library</span>
        <input
          v-model="searchQuery"
          type="search"
          class="catalog-panel__search-input"
          placeholder="Titre, auteur, ISBN…"
          maxlength="200"
          autocomplete="off"
        />
      </label>
      <button
        type="button"
        class="catalog-panel__filter-btn"
        :class="{ 'catalog-panel__filter-btn--active': filtersOpen }"
        @click="filtersOpen = !filtersOpen"
      >
        Filtres
      </button>
    </div>

    <div v-if="filtersOpen" class="catalog-panel__filters">
      <label class="catalog-panel__filter-field">
        <span>Langue</span>
        <select v-model="searchFilters.language">
          <option
            v-for="option in OPEN_LIBRARY_LANGUAGE_OPTIONS"
            :key="option.id"
            :value="option.id"
          >
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="catalog-panel__filter-field">
        <span>Tri</span>
        <select v-model="searchFilters.sort">
          <option
            v-for="option in OPEN_LIBRARY_SORT_OPTIONS"
            :key="option.id || 'relevance'"
            :value="option.id"
          >
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="catalog-panel__filter-field">
        <span>E-book</span>
        <select v-model="searchFilters.ebookAccess">
          <option
            v-for="option in OPEN_LIBRARY_EBOOK_OPTIONS"
            :key="option.id || 'all'"
            :value="option.id"
          >
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="catalog-panel__filter-field catalog-panel__filter-field--check">
        <input v-model="searchFilters.hasFulltext" type="checkbox" />
        <span>Texte intégral disponible</span>
      </label>

      <label class="catalog-panel__filter-field">
        <span>Année min</span>
        <input v-model="searchFilters.yearFrom" type="number" min="0" max="2100" placeholder="ex. 1990" />
      </label>

      <label class="catalog-panel__filter-field">
        <span>Année max</span>
        <input v-model="searchFilters.yearTo" type="number" min="0" max="2100" placeholder="ex. 2024" />
      </label>

      <label class="catalog-panel__filter-field catalog-panel__filter-field--wide">
        <span>Auteur</span>
        <input v-model="searchFilters.author" type="text" maxlength="120" placeholder="Nom d’auteur…" />
      </label>

      <label class="catalog-panel__filter-field catalog-panel__filter-field--wide">
        <span>Sujet</span>
        <input v-model="searchFilters.subject" type="text" maxlength="120" placeholder="Fantasy, histoire…" />
      </label>

      <div class="catalog-panel__filters-actions">
        <button type="button" class="catalog-panel__filters-reset" @click="resetSearchFilters">
          Réinitialiser
        </button>
      </div>
    </div>

    <div
      v-if="searchQuery.trim().length >= MIN_SEARCH_LENGTH"
      class="catalog-panel__manual-add"
    >
      <p class="catalog-panel__manual-add-hint">
        Tu ne trouves pas ton livre dans Open Library ?
      </p>
      <button type="button" class="catalog-panel__manual-add-btn" @click="requestAddMissingBook">
        Ajouter un livre manuellement
      </button>
    </div>

    <p v-if="isLoading" class="catalog-panel__status">Recherche en cours…</p>
    <p v-else-if="loadError" class="catalog-panel__error">{{ loadError }}</p>

    <template v-else-if="results.length">
      <p v-if="addError" class="catalog-panel__error">{{ addError }}</p>
      <p class="catalog-panel__count">
        {{ numFound }} résultat{{ numFound === 1 ? '' : 's' }}
        <span v-if="totalPages > 1">· page {{ currentPage }} / {{ totalPages }}</span>
      </p>

      <div class="catalog-panel__grid">
        <article v-for="doc in results" :key="resultKey(doc)" class="catalog-book">
          <div class="catalog-book__cover-area">
            <button
              type="button"
              class="catalog-book__cover-btn"
              :aria-label="`Ouvrir la fiche de ${doc.title}`"
              @click="openBook(doc)"
            >
              <img
                v-if="coverFor(doc)"
                :src="coverFor(doc)"
                :alt="`Couverture de ${doc.title}`"
                class="catalog-book__cover"
                loading="lazy"
                @error="onCoverError(doc)"
              />
              <div
                v-else
                class="catalog-book__cover catalog-book__cover--placeholder"
                aria-hidden="true"
              >
                <span>📖</span>
              </div>
              <span v-if="isLinkedDoc(doc)" class="catalog-book__badge">Dans ma bibliothèque</span>
            </button>

            <button
              v-if="!isLinkedDoc(doc)"
              type="button"
              class="catalog-book__add"
              :disabled="!userId || addingWorkKey === docWorkKey(doc)"
              :aria-label="`Ajouter « ${doc.title} » à ma bibliothèque`"
              :title="userId ? 'Ajouter à ma bibliothèque' : 'Connecte-toi pour ajouter'"
              @click="quickAddToLibrary(doc)"
            >
              <span aria-hidden="true">{{ addingWorkKey === docWorkKey(doc) ? '…' : '+' }}</span>
            </button>
          </div>

          <button
            type="button"
            class="catalog-book__meta-btn"
            :aria-label="`${doc.title} — ${doc.authorLabel}`"
            @click="openBook(doc)"
          >
            <h3 class="catalog-book__title">{{ doc.title }}</h3>
            <p v-if="doc.subtitle" class="catalog-book__subtitle">{{ doc.subtitle }}</p>
            <p class="catalog-book__author">{{ doc.authorLabel }}</p>
            <p class="catalog-book__details">
              <span v-if="doc.firstPublishYear">{{ doc.firstPublishYear }}</span>
              <span v-if="doc.editionCount">
                · {{ doc.editionCount }} édition{{ doc.editionCount > 1 ? 's' : '' }}
              </span>
            </p>
          </button>
        </article>
      </div>

      <nav
        v-if="showPagination"
        class="catalog-panel__pagination"
        aria-label="Pagination catalogue"
      >
        <button
          type="button"
          class="catalog-panel__page-btn"
          :disabled="currentPage <= 1"
          aria-label="Page précédente"
          @click="goToPage(currentPage - 1)"
        >
          ‹
        </button>
        <span class="catalog-panel__page-label">Page {{ currentPage }} / {{ totalPages }}</span>
        <button
          type="button"
          class="catalog-panel__page-btn"
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
      class="catalog-panel__status"
    >
      Tape au moins {{ MIN_SEARCH_LENGTH }} caractères…
    </p>

    <p
      v-else-if="!isLoading && searchQuery.trim().length >= MIN_SEARCH_LENGTH"
      class="catalog-panel__status"
    >
      Aucun livre trouvé dans Open Library.
    </p>

    <p v-else-if="!isLoading" class="catalog-panel__status">
      Cherche un livre dans Open Library. S’il n’y est pas, tu pourras l’ajouter manuellement.
    </p>
  </div>
</template>

<style scoped>
.catalog-panel {
  display: grid;
  gap: 1rem;
}

.catalog-panel__sync {
  display: grid;
  gap: 0.35rem;
  justify-items: start;
}

.catalog-panel__sync-btn {
  border: none;
  border-radius: 12px;
  padding: 0.65rem 1.1rem;
  font-weight: 800;
  font-size: 0.9rem;
  cursor: pointer;
  background: linear-gradient(135deg, #95d1aa, #72a098);
  color: #fff;
}

.catalog-panel__sync-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.catalog-panel__sync-meta,
.catalog-panel__sync-ok {
  margin: 0;
  font-size: 0.82rem;
  color: #6c757d;
}

.catalog-panel__sync-ok {
  color: #72a098;
  font-weight: 700;
}

.catalog-panel__sync-error {
  margin: 0;
  font-size: 0.85rem;
  color: #c0392b;
  font-weight: 700;
}

.catalog-panel__toolbar {
  display: flex;
  align-items: flex-end;
  gap: 0.65rem;
  flex-wrap: wrap;
}

.catalog-panel__search {
  flex: 1;
  min-width: 12rem;
  display: grid;
  gap: 0.35rem;
}

.catalog-panel__filter-btn {
  border-radius: 10px;
  border: 1px solid rgba(173, 129, 190, 0.45);
  background: rgba(255, 255, 255, 0.9);
  color: #6b4f7c;
  font-weight: 800;
  font-size: 0.88rem;
  padding: 0.65rem 0.9rem;
  cursor: pointer;
}

.catalog-panel__filter-btn--active,
.catalog-panel__filter-btn:hover {
  background: rgba(213, 181, 234, 0.28);
}

.catalog-panel__filters {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10.5rem, 1fr));
  gap: 0.65rem 0.75rem;
  padding: 0.85rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.7);
}

.catalog-panel__filter-field {
  display: grid;
  gap: 0.3rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: #6b4f7c;
}

.catalog-panel__filter-field--wide {
  grid-column: span 2;
}

.catalog-panel__filter-field--check {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  align-self: end;
  padding-bottom: 0.35rem;
}

.catalog-panel__filter-field select,
.catalog-panel__filter-field input[type='text'],
.catalog-panel__filter-field input[type='number'] {
  width: 100%;
  box-sizing: border-box;
  padding: 0.45rem 0.55rem;
  border-radius: 8px;
  border: 1px solid rgba(213, 181, 234, 0.45);
  background: rgba(255, 255, 255, 0.95);
  font-size: 0.85rem;
  font-weight: 650;
  color: #2c3e50;
}

.catalog-panel__filters-actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
}

.catalog-panel__filters-reset {
  border: none;
  background: transparent;
  color: #ad81be;
  font-weight: 800;
  font-size: 0.82rem;
  cursor: pointer;
  padding: 0.2rem 0;
}

.catalog-panel__filters-reset:hover {
  color: #6b4f7c;
}

@media (max-width: 640px) {
  .catalog-panel__filter-field--wide {
    grid-column: span 1;
  }
}

.catalog-panel__search-label {
  font-size: 0.82rem;
  font-weight: 800;
  color: #6c757d;
}

.catalog-panel__search-input {
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

.catalog-panel__search-input:focus {
  outline: 2px solid rgba(173, 129, 190, 0.45);
  outline-offset: 1px;
}

.catalog-panel__status,
.catalog-panel__error,
.catalog-panel__count {
  margin: 0;
  font-size: 0.92rem;
}

.catalog-panel__status {
  color: #6c757d;
  text-align: center;
}

.catalog-panel__error {
  color: #c0392b;
  font-weight: 700;
  text-align: center;
}

.catalog-panel__count {
  font-weight: 700;
  color: #4a5560;
}

.catalog-panel__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10.5rem, 1fr));
  gap: 1rem;
}

.catalog-book {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.catalog-book__cover-area {
  position: relative;
}

.catalog-book__cover-btn {
  position: relative;
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  overflow: hidden;
  background: linear-gradient(145deg, #f4eef8, #e8d9f0);
  border: 1px solid rgba(213, 181, 234, 0.25);
  transition: transform 0.15s ease;
}

.catalog-book__cover-btn:hover {
  transform: translateY(-2px);
}

.catalog-book__add {
  position: absolute;
  top: 0.35rem;
  right: 0.35rem;
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

.catalog-book__add:hover:not(:disabled) {
  transform: scale(1.08);
  background: rgba(173, 129, 190, 0.92);
}

.catalog-book__add:focus-visible {
  outline: 2px solid rgba(173, 129, 190, 0.75);
  outline-offset: 2px;
}

.catalog-book__add:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

.catalog-book__meta-btn {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  border-radius: 8px;
}

.catalog-book__meta-btn:focus-visible {
  outline: 2px solid rgba(173, 129, 190, 0.65);
  outline-offset: 2px;
}

.catalog-book__cover {
  display: block;
  width: 100%;
  aspect-ratio: 2 / 3;
  object-fit: cover;
}

.catalog-book__cover--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ad81be;
  font-size: 1.5rem;
}

.catalog-book__badge {
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

.catalog-book__title {
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

.catalog-book__subtitle,
.catalog-book__details {
  margin: 0;
  font-size: 0.78rem;
  color: #6c757d;
}

.catalog-book__author {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: #5a4a68;
}

.catalog-panel__pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}

.catalog-panel__page-btn {
  width: 2rem;
  height: 2rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.45);
  background: rgba(255, 255, 255, 0.85);
  color: #ad81be;
  font-weight: 800;
  cursor: pointer;
}

.catalog-panel__page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.catalog-panel__page-label {
  min-width: 6.5rem;
  text-align: center;
  font-size: 0.88rem;
  font-weight: 700;
  color: #6c757d;
}

.catalog-panel__manual-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.55rem;
  margin-top: 0.35rem;
  padding: 0.85rem 1rem;
  border-radius: 12px;
  border: 1px dashed rgba(173, 129, 190, 0.45);
  background: rgba(213, 181, 234, 0.1);
}

.catalog-panel__manual-add-hint {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 650;
  color: #6c757d;
  text-align: center;
}

.catalog-panel__manual-add-btn {
  border: none;
  border-radius: 12px;
  padding: 0.65rem 1.1rem;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: #fff;
  font-weight: 800;
  font-size: 0.9rem;
  cursor: pointer;
  transition: transform 0.15s ease, filter 0.15s ease;
}

.catalog-panel__manual-add-btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.04);
}

@media (prefers-color-scheme: dark) {
  .catalog-panel__search-input,
  .catalog-panel__filter-field select,
  .catalog-panel__filter-field input[type='text'],
  .catalog-panel__filter-field input[type='number'] {
    background: rgba(30, 24, 42, 0.9);
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.28);
  }

  .catalog-panel__filter-btn,
  .catalog-panel__filters {
    background: rgba(35, 30, 48, 0.9);
    border-color: rgba(213, 181, 234, 0.28);
    color: #e8dcf5;
  }

  .catalog-panel__filter-field {
    color: #d5b5ea;
  }

  .catalog-panel__manual-add {
    background: rgba(173, 129, 190, 0.12);
    border-color: rgba(213, 181, 234, 0.35);
  }

  .catalog-panel__manual-add-hint {
    color: #adb5bd;
  }

  .catalog-book__title {
    color: #e9ecef;
  }
  .catalog-book__author {
    color: #c9b0d8;
  }
  .catalog-book__cover-btn,
  .catalog-book__cover--placeholder {
    background: linear-gradient(145deg, #2a2235, #3a2f48);
  }
}
</style>
