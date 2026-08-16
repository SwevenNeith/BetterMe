<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ReadingBookFiche from '../components/ReadingBookFiche.vue'
import ReadingBooksFilterPopover from '../components/ReadingBooksFilterPopover.vue'
import ReadingPickModal from '../components/ReadingPickModal.vue'
import { supabase } from '../lib/supabase.js'
import { APP_PAGE_IDS } from '../constants/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import { setFilePickerActive, setFileUploadInProgress } from '../composables/useAppTabResume.js'
import { formDraftKey, useFormDraft } from '../composables/useFormDraft.js'
import { emptyBookForm } from '../utils/readingBookForm.js'
import { createReadingBook, listReadingBooksWithCovers } from '../services/readingBooks.js'
import {
  listReadingCollections,
  READING_COLLECTION_EN_COURS,
} from '../services/readingCollections.js'
import { applyReadingBookFilters, formatReadingFilterLabel } from '../utils/readingBookFilters.js'

/** Nombre de lignes toujours remplies dans la grille bibliothèque. */
const GRID_ROWS = 5
/** Largeur mini d’une couverture — le nombre de colonnes s’adapte à l’écran. */
const MIN_BOOK_COL_PX = 96

function isEnCoursBook(book) {
  return (
    String(book.collection ?? '').trim().toLowerCase() ===
    READING_COLLECTION_EN_COURS.toLowerCase()
  )
}

function sortBooksByTitle(a, b) {
  return String(a.title ?? '').localeCompare(String(b.title ?? ''), 'fr', { sensitivity: 'base' })
}

function computeGridColumnCount(widthPx, gapPx = 7.2) {
  const width = Math.max(0, Number(widthPx) || 0)
  const gap = Number.isFinite(gapPx) ? gapPx : 7.2
  return Math.max(2, Math.floor((width + gap) / (MIN_BOOK_COL_PX + gap)))
}

const { pageTitle } = usePageDisplayLabel(APP_PAGE_IDS.LECTURE, undefined, { setDocumentTitle: true })

const route = useRoute()
const router = useRouter()

const userId = ref(null)
const isLoading = ref(true)
const isSaving = ref(false)
const loadError = ref('')
const books = ref([])
const collections = ref([])
const pickModalOpen = ref(false)
const bookFormOpen = ref(false)
const coverFileInputRef = ref(null)
const coverPreviewUrl = ref('')
const searchQuery = ref('')
const bookFilters = ref([])
const filterOpen = ref(false)
const currentPage = ref(1)
const readingGridRef = ref(null)
const readingLayoutRef = ref(null)
const gridColumnCount = ref(4)
let coverPreviewObjectUrl = ''
let gridResizeObserver = null

const bookForm = reactive(emptyBookForm())
const coverFile = ref(null)

const bookDraftKey = computed(() => {
  if (!userId.value || !bookFormOpen.value) return null
  return formDraftKey('book-form', userId.value, 'new')
})

const { clearDraft: clearBookDraft, restoreDraft: restoreBookDraft } = useFormDraft(bookDraftKey, {
  enabled: computed(() => Boolean(userId.value) && bookFormOpen.value && !isSaving.value),
  getState: () => ({
    title: bookForm.title,
    author: bookForm.author,
    collection: bookForm.collection,
    isSaga: bookForm.isSaga,
    dateStart: bookForm.dateStart,
    dateEnd: bookForm.dateEnd,
    rating: bookForm.rating,
    genre: bookForm.genre,
    extraTags: bookForm.extraTags,
    pages: bookForm.pages,
    publicationYear: bookForm.publicationYear,
    comments: bookForm.comments,
    quote: bookForm.quote,
    spoil: bookForm.spoil,
    imageMode: bookForm.imageMode,
    imageUrl: bookForm.imageUrl,
  }),
  setState: (state) => {
    if (!state || typeof state !== 'object') return
    Object.assign(bookForm, emptyBookForm(), {
      title: state.title ?? '',
      author: state.author ?? '',
      collection: state.collection ?? '',
      isSaga: Boolean(state.isSaga),
      dateStart: state.dateStart ?? '',
      dateEnd: state.dateEnd ?? '',
      rating: state.rating ?? null,
      genre: state.genre ?? '',
      extraTags: state.extraTags ?? '',
      pages: state.pages ?? '',
      publicationYear: state.publicationYear ?? '',
      comments: state.comments ?? '',
      quote: state.quote ?? '',
      spoil: state.spoil ?? '',
      imageMode: state.imageMode === 'url' ? 'url' : 'upload',
      imageUrl: state.imageUrl ?? '',
    })
    coverFile.value = null
    revokeCoverPreview()
    if (bookForm.imageMode === 'url' && bookForm.imageUrl.trim()) {
      coverPreviewUrl.value = bookForm.imageUrl.trim()
    }
  },
})

const booksPerPage = computed(() => Math.max(2, gridColumnCount.value) * GRID_ROWS)

const readingGridStyle = computed(() => ({
  '--reading-cols': String(gridColumnCount.value),
}))

const collectionFilterOptions = computed(() =>
  [...collections.value].sort((a, b) => {
    const orderA = a.sort_order ?? 999
    const orderB = b.sort_order ?? 999
    if (orderA !== orderB) return orderA - orderB
    return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'fr', { sensitivity: 'base' })
  }),
)

const displayedBooks = computed(() => {
  let list = [...books.value]
  const query = searchQuery.value.trim().toLowerCase()

  if (query) {
    list = list.filter((book) => {
      const title = String(book.title ?? '').toLowerCase()
      const author = String(book.author ?? '').toLowerCase()
      const collection = String(book.collection ?? '').toLowerCase()
      return title.includes(query) || author.includes(query) || collection.includes(query)
    })
  }

  list = applyReadingBookFilters(list, bookFilters.value)

  return list.sort(sortBooksByTitle)
})

const inProgressBooks = computed(() => displayedBooks.value.filter(isEnCoursBook))

const libraryBooks = computed(() => displayedBooks.value.filter((book) => !isEnCoursBook(book)))

const totalPages = computed(() =>
  Math.max(1, Math.ceil(libraryBooks.value.length / booksPerPage.value)),
)

const paginatedBooks = computed(() => {
  const start = (currentPage.value - 1) * booksPerPage.value
  return libraryBooks.value.slice(start, start + booksPerPage.value)
})

const showPagination = computed(() => libraryBooks.value.length > booksPerPage.value)

function updateGridColumnCount() {
  const el = readingLayoutRef.value
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

  const el = readingLayoutRef.value
  if (!el) return

  updateGridColumnCount()

  if (typeof ResizeObserver === 'undefined') return
  gridResizeObserver = new ResizeObserver(() => {
    updateGridColumnCount()
  })
  gridResizeObserver.observe(el)
}

const hasActiveFilters = computed(() => searchQuery.value.trim() !== '' || bookFilters.value.length > 0)

function removeBookFilter(filterId) {
  bookFilters.value = bookFilters.value.filter((filter) => filter.id !== filterId)
}

function goToPage(page) {
  const nextPage = Math.min(Math.max(page, 1), totalPages.value)
  if (nextPage === currentPage.value) return
  currentPage.value = nextPage
  readingGridRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const booksSubtitle = computed(() => {
  const total = books.value.length
  if (total === 0) return 'Ta bibliothèque personnelle.'

  const displayed = displayedBooks.value.length
  if (hasActiveFilters.value && displayed !== total) {
    return `${displayed} livre${displayed > 1 ? 's' : ''} sur ${total} affiché${displayed > 1 ? 's' : ''}.`
  }

  return `${total} livre${total > 1 ? 's' : ''} enregistré${total > 1 ? 's' : ''}.`
})

const addCoverPreview = computed(() => {
  if (bookForm.imageMode === 'upload' && coverPreviewUrl.value) return coverPreviewUrl.value
  if (bookForm.imageMode === 'url' && bookForm.imageUrl.trim()) return bookForm.imageUrl.trim()
  return ''
})

function revokeCoverPreview() {
  if (coverPreviewObjectUrl) {
    URL.revokeObjectURL(coverPreviewObjectUrl)
    coverPreviewObjectUrl = ''
  }
  coverPreviewUrl.value = ''
}

function resetCoverSelection() {
  coverFile.value = null
  bookForm.imageUrl = ''
  revokeCoverPreview()
  if (coverFileInputRef.value) coverFileInputRef.value.value = ''
}

async function openBookForm() {
  Object.assign(bookForm, emptyBookForm())
  resetCoverSelection()
  bookFormOpen.value = true
  await nextTick()
  restoreBookDraft()
}

function closeBookForm() {
  clearBookDraft()
  bookFormOpen.value = false
  Object.assign(bookForm, emptyBookForm())
  resetCoverSelection()
}

function onCoverFilePickerOpen() {
  setFilePickerActive(true)
}

function onCoverFilePickerClose() {
  setFilePickerActive(false)
}

function triggerCoverFilePicker() {
  if (isSaving.value) return
  onCoverFilePickerOpen()
  coverFileInputRef.value?.click()
}

function onCoverFileChange(event) {
  const file = event.target.files?.[0] ?? null
  event.target.value = ''
  onCoverFilePickerClose()

  if (!file) return

  revokeCoverPreview()
  coverFile.value = file
  bookForm.imageUrl = ''
  coverPreviewObjectUrl = URL.createObjectURL(file)
  coverPreviewUrl.value = coverPreviewObjectUrl
}

function onImageUrlInput() {
  if (bookForm.imageMode !== 'url') return
  coverFile.value = null
  if (coverFileInputRef.value) coverFileInputRef.value.value = ''
  revokeCoverPreview()
  const url = bookForm.imageUrl.trim()
  coverPreviewUrl.value = url
}

function switchImageMode(mode) {
  if (bookForm.imageMode === mode) return
  bookForm.imageMode = mode
  resetCoverSelection()
}

async function loadCollections() {
  if (!userId.value) return
  try {
    collections.value = await listReadingCollections(supabase, userId.value)
  } catch (err) {
    console.error(err)
    collections.value = []
  }
}

async function loadBooks() {
  if (!userId.value) return

  isLoading.value = true
  loadError.value = ''
  try {
    await loadCollections()
    books.value = await listReadingBooksWithCovers(supabase, userId.value)
  } catch (err) {
    console.error(err)
    loadError.value = err.message || 'Impossible de charger les livres.'
    books.value = []
  } finally {
    isLoading.value = false
  }
}

async function submitBookForm() {
  if (!userId.value) return

  const title = bookForm.title.trim()
  if (!title) return

  isSaving.value = true
  setFileUploadInProgress(Boolean(coverFile.value))
  loadError.value = ''

  try {
    await createReadingBook(supabase, userId.value, {
      ...bookForm,
      file: bookForm.imageMode === 'upload' ? coverFile.value : null,
      imageUrl: bookForm.imageMode === 'url' ? bookForm.imageUrl : null,
    })
    clearBookDraft()
    closeBookForm()
    await loadBooks()
    await loadCollections()
  } catch (err) {
    console.error(err)
    loadError.value = err.message || "Erreur lors de l'ajout du livre."
  } finally {
    isSaving.value = false
    setFileUploadInProgress(false)
  }
}

function openPickModal() {
  bookFormOpen.value = false
  pickModalOpen.value = true
}

function closePickModal() {
  pickModalOpen.value = false
}

function openBookPage(book) {
  if (!book?.id) return
  router.push({ name: 'lecture-livre', params: { bookId: book.id } })
}

function onPickAccepted(updated) {
  const index = books.value.findIndex((book) => book.id === updated.id)
  if (index >= 0) books.value[index] = updated
  else loadBooks()
  loadCollections()
}

function openBookFromQuery() {
  const bookId = String(route.query.book ?? '')
  if (!bookId || isLoading.value) return

  const book = books.value.find((item) => item.id === bookId)
  if (book) openBookPage(book)

  if (route.query.book) {
    router.replace({ name: 'lecture' })
  }
}

onMounted(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) userId.value = user.id
  await nextTick()
  bindGridResizeObserver()
})

onUnmounted(() => {
  revokeCoverPreview()
  gridResizeObserver?.disconnect()
  gridResizeObserver = null
})

watch(userId, (id) => {
  if (id) loadBooks()
})

watch(
  () => [route.query.book, books.value.length, isLoading.value],
  () => openBookFromQuery(),
)

watch([searchQuery, bookFilters], () => {
  currentPage.value = 1
}, { deep: true })

watch(totalPages, (pages) => {
  if (currentPage.value > pages) currentPage.value = pages
})

watch(
  () => [isLoading.value],
  async () => {
    await nextTick()
    bindGridResizeObserver()
  },
)

watch(booksPerPage, () => {
  if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
})
</script>

<template>
  <div class="reading-wrapper">
    <header class="reading-header">
      <h1 class="reading-title">{{ pageTitle }}</h1>
      <p class="reading-subtitle">{{ booksSubtitle }}</p>
    </header>

    <div class="reading-add">
      <button type="button" class="reading-pick-btn" @click="openPickModal">
        Choisir ma lecture
      </button>
      <button type="button" class="reading-add-btn" @click="openBookForm">
        Ajouter un livre
      </button>
    </div>

    <form v-if="bookFormOpen" @submit.prevent="submitBookForm">
      <ReadingBookFiche
        mode="create"
        :form="bookForm"
        :collections="collections"
        :cover-preview="addCoverPreview"
        show-cover-controls
        :cover-file-input-ref="coverFileInputRef"
        :disabled="isSaving"
        inline
        @switch-image-mode="switchImageMode"
        @cover-file-change="onCoverFileChange"
        @trigger-cover-picker="triggerCoverFilePicker"
        @image-url-input="onImageUrlInput"
      >
        <template #actions>
          <button
            type="button"
            class="reading-fiche-close"
            title="Fermer"
            aria-label="Fermer le formulaire"
            :disabled="isSaving"
            @click="closeBookForm"
          >
            ✕
          </button>
        </template>

        <template #footer>
          <div class="reading-fiche-form-actions">
            <button type="submit" class="reading-fiche-add-btn" :disabled="isSaving">
              {{ isSaving ? 'Ajout…' : 'Ajouter' }}
            </button>
            <button type="button" class="reading-fiche-cancel-btn" :disabled="isSaving" @click="closeBookForm">
              Annuler
            </button>
          </div>
        </template>
      </ReadingBookFiche>
    </form>

    <section class="reading-card" :style="readingGridStyle">
      <div ref="readingLayoutRef" class="reading-layout-measure" aria-hidden="true"></div>
      <div v-if="loadError" class="reading-error">{{ loadError }}</div>
      <div v-if="isLoading" class="reading-loading">Chargement…</div>

      <template v-else>
        <div v-if="books.length > 0" class="reading-toolbar">
          <label class="reading-search">
            <span class="reading-search__label">Rechercher</span>
            <input
              v-model="searchQuery"
              type="search"
              class="reading-search__input"
              placeholder="Titre, auteur, collection…"
              autocomplete="off"
            />
          </label>

          <div class="reading-toolbar__filters">
            <button
              type="button"
              class="reading-filter-btn"
              :class="{ 'reading-filter-btn--active': bookFilters.length > 0 }"
              @click="filterOpen = true"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M3 4h18v2l-7 8v5l-4 1v-6L3 6V4z" />
              </svg>
              Filtre
              <span v-if="bookFilters.length > 0" class="reading-filter-btn__count">{{ bookFilters.length }}</span>
            </button>
          </div>
        </div>

        <div v-if="bookFilters.length > 0" class="reading-active-filters">
          <button
            v-for="filter in bookFilters"
            :key="filter.id"
            type="button"
            class="reading-active-filter-pill"
            @click="filterOpen = true"
          >
            <span>{{ formatReadingFilterLabel(filter) }}</span>
            <span
              class="reading-active-filter-pill__remove"
              role="button"
              tabindex="0"
              aria-label="Retirer ce filtre"
              @click.stop="removeBookFilter(filter.id)"
              @keydown.enter.stop.prevent="removeBookFilter(filter.id)"
              @keydown.space.stop.prevent="removeBookFilter(filter.id)"
            >
              ✕
            </span>
          </button>
        </div>

        <div v-if="books.length === 0" class="reading-empty">Aucun livre pour le moment.</div>
        <div v-else-if="displayedBooks.length === 0" class="reading-empty">
          Aucun livre ne correspond à ta recherche.
        </div>

        <template v-else>
          <section v-if="inProgressBooks.length > 0" class="reading-section reading-section--en-cours">
            <h2 class="reading-section__title">En cours</h2>
            <div class="reading-grid">
              <article
                v-for="book in inProgressBooks"
                :key="book.id"
                class="reading-book reading-book--en-cours"
              >
                <button
                  type="button"
                  class="reading-book-btn"
                  :title="book.title"
                  :aria-label="`Ouvrir ${book.title}`"
                  @click="openBookPage(book)"
                >
                  <img
                    v-if="book.coverUrl"
                    :src="book.coverUrl"
                    :alt="`Couverture de ${book.title}`"
                    class="reading-book-cover"
                  />
                  <div
                    v-else
                    class="reading-book-cover reading-book-cover--placeholder"
                    aria-hidden="true"
                  >
                    <span>📖</span>
                  </div>
                </button>
              </article>
            </div>
          </section>

          <section v-if="libraryBooks.length > 0" class="reading-section">
            <h2 v-if="inProgressBooks.length > 0" class="reading-section__title">Bibliothèque</h2>
            <div ref="readingGridRef" class="reading-grid">
              <article v-for="book in paginatedBooks" :key="book.id" class="reading-book">
                <button
                  type="button"
                  class="reading-book-btn"
                  :title="book.title"
                  :aria-label="`Ouvrir ${book.title}`"
                  @click="openBookPage(book)"
                >
                  <img
                    v-if="book.coverUrl"
                    :src="book.coverUrl"
                    :alt="`Couverture de ${book.title}`"
                    class="reading-book-cover"
                  />
                  <div
                    v-else
                    class="reading-book-cover reading-book-cover--placeholder"
                    aria-hidden="true"
                  >
                    <span>📖</span>
                  </div>
                </button>
              </article>
            </div>

            <nav
              v-if="showPagination"
              class="reading-pagination"
              aria-label="Pagination de la bibliothèque"
            >
              <button
                type="button"
                class="reading-pagination__btn"
                :disabled="currentPage <= 1"
                aria-label="Page précédente"
                @click="goToPage(currentPage - 1)"
              >
                ‹
              </button>
              <span class="reading-pagination__label">
                Page {{ currentPage }} / {{ totalPages }}
              </span>
              <button
                type="button"
                class="reading-pagination__btn"
                :disabled="currentPage >= totalPages"
                aria-label="Page suivante"
                @click="goToPage(currentPage + 1)"
              >
                ›
              </button>
            </nav>
          </section>
        </template>
      </template>
    </section>

    <ReadingBooksFilterPopover
      v-model:filters="bookFilters"
      :open="filterOpen"
      :collections="collectionFilterOptions"
      @close="filterOpen = false"
    />

    <ReadingPickModal
      :open="pickModalOpen"
      :books="books"
      :user-id="userId"
      @close="closePickModal"
      @accepted="onPickAccepted"
      @updated="onPickAccepted"
    />
  </div>
</template>

<style scoped>
.reading-wrapper {
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
}

.reading-header {
  margin-bottom: 1rem;
  text-align: center;
}

.reading-title {
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  margin: 0;
}

.reading-subtitle {
  margin: 0.5rem 0 0;
  color: #6c757d;
  font-size: 1rem;
}

.reading-card {
  width: 100%;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 16px;
  padding: 1.25rem;
}

.reading-add {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-bottom: 1.25rem;
}

.reading-pick-btn {
  padding: 0.75rem 1rem;
  border-radius: 12px;
  border: 1px solid rgba(173, 129, 190, 0.5);
  background: rgba(255, 255, 255, 0.85);
  color: #6b4f7c;
  font-weight: 800;
  font-size: 0.95rem;
  cursor: pointer;
  transition: transform 0.15s ease, filter 0.15s ease, background 0.15s ease;
}

.reading-pick-btn:hover {
  transform: translateY(-1px);
  background: rgba(213, 181, 234, 0.28);
}

.reading-add-btn {
  padding: 0.75rem 1rem;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  font-weight: 800;
  font-size: 0.95rem;
  cursor: pointer;
  transition: transform 0.15s ease, filter 0.15s ease;
}

.reading-add-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.03);
}

.reading-add-btn:disabled {
  opacity: 0.7;
  cursor: wait;
}

.reading-error {
  margin-bottom: 0.75rem;
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  background: rgba(220, 53, 69, 0.1);
  color: #b02a37;
  font-size: 0.9rem;
}

.reading-loading,
.reading-empty {
  padding: 1rem 0;
  text-align: center;
  color: #6c757d;
}

.reading-toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

.reading-search {
  flex: 1 1 14rem;
  min-width: 0;
  display: grid;
  gap: 0.35rem;
}

.reading-search__label {
  font-size: 0.82rem;
  font-weight: 800;
  color: #6c757d;
}

.reading-search__input {
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

.reading-search__input:focus {
  outline: 2px solid rgba(173, 129, 190, 0.45);
  outline-offset: 1px;
}

.reading-search__input::-webkit-search-cancel-button {
  cursor: pointer;
}

.reading-toolbar__filters {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;
}

.reading-filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.75rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.7);
  color: #ad81be;
  font-weight: 900;
  cursor: pointer;
}

.reading-filter-btn svg {
  width: 1rem;
  height: 1rem;
}

.reading-filter-btn:hover {
  background: rgba(255, 255, 255, 0.95);
}

.reading-filter-btn--active {
  border-color: rgba(173, 129, 190, 0.55);
  background: color-mix(in srgb, #ad81be 12%, white);
}

.reading-filter-btn__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: #ad81be;
  color: white;
  font-size: 0.72rem;
  font-weight: 900;
  line-height: 1;
}

.reading-active-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-bottom: 0.85rem;
}

.reading-active-filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.55rem;
  border-radius: 999px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: color-mix(in srgb, #ad81be 10%, white);
  color: #2c3e50;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 800;
  cursor: pointer;
}

.reading-active-filter-pill__remove {
  color: #6c757d;
  font-size: 0.85rem;
  line-height: 1;
}

.reading-active-filter-pill__remove:hover {
  color: #b02a37;
}

.reading-section {
  margin-top: 0.35rem;
}

.reading-section + .reading-section {
  margin-top: 1.35rem;
}

.reading-section__title {
  margin: 0 0 0.65rem;
  font-size: 0.92rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: #6b4f7c;
}

.reading-section--en-cours {
  padding: 0.85rem 0.85rem 1rem;
  margin: 0 -0.15rem 0;
  border-radius: 14px;
  background: linear-gradient(145deg, rgba(213, 181, 234, 0.22), rgba(173, 129, 190, 0.1));
  border: 1px solid rgba(173, 129, 190, 0.28);
}

.reading-section--en-cours .reading-section__title {
  color: #7a4f8f;
}

.reading-book--en-cours .reading-book-cover {
  border-color: rgba(173, 129, 190, 0.45);
  box-shadow: 0 2px 10px rgba(173, 129, 190, 0.18);
}

.reading-layout-measure {
  width: 100%;
  height: 0;
  overflow: hidden;
  pointer-events: none;
}

.reading-grid {
  display: grid;
  grid-template-columns: repeat(var(--reading-cols, 4), minmax(0, 1fr));
  gap: 0.45rem;
  scroll-margin-top: 1rem;
}

.reading-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 1rem;
}

.reading-pagination__btn {
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
  transition: background 0.15s ease, opacity 0.15s ease;
}

.reading-pagination__btn:hover:not(:disabled) {
  background: rgba(213, 181, 234, 0.2);
}

.reading-pagination__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.reading-pagination__label {
  min-width: 6.5rem;
  text-align: center;
  font-size: 0.88rem;
  font-weight: 700;
  color: #6c757d;
}

.reading-book {
  min-width: 0;
}

.reading-book-btn {
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 5px;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.reading-book-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(173, 129, 190, 0.25);
}

.reading-book-btn:focus-visible {
  outline: 2px solid rgba(173, 129, 190, 0.65);
  outline-offset: 2px;
}

.reading-book-cover {
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: 5px;
  object-fit: cover;
  display: block;
  border: 1px solid rgba(213, 181, 234, 0.2);
}

.reading-book-cover--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, #f4eef8, #e8d9f0);
  font-size: 1.15rem;
}

@media (prefers-color-scheme: dark) {
  .reading-title {
    color: #f0e8f8;
  }

  .reading-subtitle,
  .reading-loading,
  .reading-empty,
  .reading-search__label {
    color: #adb5bd;
  }

  .reading-card {
    background: rgba(35, 30, 48, 0.75);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .reading-pick-btn {
    background: rgba(35, 30, 48, 0.85);
    border-color: rgba(173, 129, 190, 0.45);
    color: #e8dcf5;
  }

  .reading-pick-btn:hover {
    background: rgba(173, 129, 190, 0.28);
  }

  .reading-search__input {
    background: rgba(35, 30, 48, 0.9);
    border-color: rgba(213, 181, 234, 0.28);
    color: #f0e8f8;
  }

  .reading-filter-btn {
    background: rgba(35, 30, 48, 0.85);
    border-color: rgba(213, 181, 234, 0.28);
    color: #d5b5ea;
  }

  .reading-filter-btn:hover {
    background: rgba(61, 47, 74, 0.9);
  }

  .reading-filter-btn--active {
    background: color-mix(in srgb, #ad81be 28%, #2a2438);
    border-color: rgba(173, 129, 190, 0.55);
  }

  .reading-active-filter-pill {
    background: color-mix(in srgb, #ad81be 22%, #2a2438);
    border-color: rgba(213, 181, 234, 0.3);
    color: #f0e8f8;
  }

  .reading-active-filter-pill__remove {
    color: #c5b8d2;
  }

  .reading-pagination__btn {
    background: rgba(35, 30, 48, 0.85);
    border-color: rgba(213, 181, 234, 0.28);
    color: #d5b5ea;
  }

  .reading-pagination__btn:hover:not(:disabled) {
    background: rgba(61, 47, 74, 0.9);
  }

  .reading-pagination__label {
    color: #adb5bd;
  }

  .reading-section__title {
    color: #d5b5ea;
  }

  .reading-section--en-cours {
    background: linear-gradient(145deg, rgba(173, 129, 190, 0.22), rgba(61, 47, 74, 0.55));
    border-color: rgba(213, 181, 234, 0.28);
  }

  .reading-section--en-cours .reading-section__title {
    color: #e8dcf5;
  }

  .reading-book--en-cours .reading-book-cover {
    border-color: rgba(213, 181, 234, 0.4);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  }

  .reading-book-cover--placeholder {
    background: linear-gradient(145deg, #3a3148, #2a2438);
    color: #c5b8d2;
  }

  .reading-error {
    background: rgba(220, 53, 69, 0.18);
    color: #ff8a95;
  }
}
</style>
