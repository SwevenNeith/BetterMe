<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ReadingBookFiche from '../components/ReadingBookFiche.vue'
import ReadingBooksFilterPopover from '../components/ReadingBooksFilterPopover.vue'
import ReadingPickModal from '../components/ReadingPickModal.vue'
import { supabase } from '../lib/supabase.js'
import { APP_PAGE_IDS } from '../constants/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import { setFilePickerActive, setFileUploadInProgress } from '../composables/useAppTabResume.js'
import { emptyBookForm } from '../utils/readingBookForm.js'
import { createReadingBook, listReadingBooksWithCovers } from '../services/readingBooks.js'
import { listReadingCollections } from '../services/readingCollections.js'
import { applyReadingBookFilters, formatReadingFilterLabel } from '../utils/readingBookFilters.js'

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
let coverPreviewObjectUrl = ''

const bookForm = reactive(emptyBookForm())
const coverFile = ref(null)

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

  return list.sort((a, b) =>
    String(a.title ?? '').localeCompare(String(b.title ?? ''), 'fr', { sensitivity: 'base' }),
  )
})

const hasActiveFilters = computed(() => searchQuery.value.trim() !== '' || bookFilters.value.length > 0)

function removeBookFilter(filterId) {
  bookFilters.value = bookFilters.value.filter((filter) => filter.id !== filterId)
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

function openBookForm() {
  Object.assign(bookForm, emptyBookForm())
  resetCoverSelection()
  bookFormOpen.value = true
}

function closeBookForm() {
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
})

onUnmounted(() => {
  revokeCoverPreview()
})

watch(userId, (id) => {
  if (id) loadBooks()
})

watch(
  () => [route.query.book, books.value.length, isLoading.value],
  () => openBookFromQuery(),
)
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

    <section class="reading-card">
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

        <div class="reading-grid">
          <div v-if="books.length === 0" class="reading-empty">Aucun livre pour le moment.</div>
          <div v-else-if="displayedBooks.length === 0" class="reading-empty">
            Aucun livre ne correspond à ta recherche.
          </div>

        <article v-for="book in displayedBooks" :key="book.id" class="reading-book">
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
            <div v-else class="reading-book-cover reading-book-cover--placeholder" aria-hidden="true">
              <span>📖</span>
            </div>
          </button>
        </article>
        </div>
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

.reading-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 0.45rem;
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

@media (max-width: 1280px) {
  .reading-grid {
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }
}

@media (max-width: 1100px) {
  .reading-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .reading-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .reading-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 540px) {
  .reading-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 400px) {
  .reading-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
