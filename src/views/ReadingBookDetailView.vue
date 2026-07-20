<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ReadingBookFiche from '../components/ReadingBookFiche.vue'
import { setFilePickerActive, setFileUploadInProgress } from '../composables/useAppTabResume.js'
import { bookToEditForm, getBookGenre, formatExtraTagsInput } from '../utils/readingBookForm.js'
import { deleteReadingBook, getReadingBookWithCover, updateReadingBook } from '../services/readingBooks.js'
import { deleteSpoilChapter, listSpoilChapters, updateSpoilChapter } from '../services/readingSpoilChapters.js'
import { listReadingCollections } from '../services/readingCollections.js'
import { supabase } from '../lib/supabase.js'

const route = useRoute()
const router = useRouter()

const userId = ref(null)
const book = ref(null)
const collections = ref([])
const isLoading = ref(true)
const isSaving = ref(false)
const errorMessage = ref('')
const editingField = ref(null)
const draft = ref('')
const coverFileInputRef = ref(null)
const coverPreviewUrl = ref('')
const spoilChapters = ref([])
const spoilSaving = ref(false)
const spoilError = ref('')
const deleteConfirmOpen = ref(false)
let coverPreviewObjectUrl = ''
let skipNextBlurCommit = false

const coverForm = reactive({
  imageMode: 'keep',
  imageUrl: '',
})
const coverFile = ref(null)

const bookId = computed(() => String(route.params.bookId ?? ''))

const FIELD_GETTERS = {
  title: (item) => item?.title ?? '',
  author: (item) => item?.author ?? '',
  collection: (item) => item?.collection ?? '',
  dateStart: (item) => item?.date_start ?? '',
  dateEnd: (item) => item?.date_end ?? '',
  genre: (item) => getBookGenre(item),
  pages: (item) => (item?.pages != null ? String(item.pages) : ''),
  publicationYear: (item) => (item?.publication_year != null ? String(item.publication_year) : ''),
  extraTags: (item) => formatExtraTagsInput(item),
  comments: (item) => item?.comments ?? '',
  quote: (item) => item?.quote ?? '',
}

function returnToLibrary() {
  router.push({ name: 'lecture' })
}

function revokeCoverPreview() {
  if (coverPreviewObjectUrl) {
    URL.revokeObjectURL(coverPreviewObjectUrl)
    coverPreviewObjectUrl = ''
  }
  coverPreviewUrl.value = ''
}

function resetCoverState() {
  coverFile.value = null
  coverForm.imageMode = 'keep'
  coverForm.imageUrl = ''
  revokeCoverPreview()
  if (coverFileInputRef.value) coverFileInputRef.value.value = ''
}

function resetInlineEdit() {
  editingField.value = null
  draft.value = ''
  resetCoverState()
  errorMessage.value = ''
}

async function loadBook() {
  if (!userId.value || !bookId.value) {
    book.value = null
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  try {
    book.value = await getReadingBookWithCover(supabase, userId.value, bookId.value)
    if (!book.value) errorMessage.value = 'Livre introuvable.'
  } catch (err) {
    console.error(err)
    book.value = null
    errorMessage.value = err.message || 'Impossible de charger le livre.'
  } finally {
    isLoading.value = false
  }
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

async function loadSpoilChapters() {
  if (!userId.value || !bookId.value) {
    spoilChapters.value = []
    return
  }
  try {
    spoilChapters.value = await listSpoilChapters(supabase, userId.value, bookId.value)
    spoilError.value = ''
  } catch (err) {
    console.error(err)
    spoilChapters.value = []
    spoilError.value = err.message || 'Impossible de charger les chapitres spoil.'
  }
}

async function reloadAll() {
  await Promise.all([loadBook(), loadCollections(), loadSpoilChapters()])
}

async function startEdit(field) {
  if (!book.value || isSaving.value) return

  if (editingField.value && editingField.value !== field) {
    skipNextBlurCommit = true
    await commitEdit()
    await nextTick()
  }

  editingField.value = field
  if (field === 'cover') {
    coverForm.imageMode = 'keep'
    coverForm.imageUrl = ''
    coverFile.value = null
    coverPreviewUrl.value = book.value.coverUrl ?? ''
    return
  }

  draft.value = FIELD_GETTERS[field]?.(book.value) ?? ''
}

function cancelEdit() {
  skipNextBlurCommit = true
  resetInlineEdit()
  nextTick(() => {
    skipNextBlurCommit = false
  })
}

function valuesEqual(field, nextValue, item) {
  const current = FIELD_GETTERS[field]?.(item) ?? ''
  return String(current) === String(nextValue ?? '')
}

async function commitEdit() {
  if (skipNextBlurCommit) {
    skipNextBlurCommit = false
    return
  }
  if (!userId.value || !book.value?.id || !editingField.value || isSaving.value) return

  const field = editingField.value

  if (field === 'cover') {
    await commitCoverEdit()
    return
  }

  const nextValue = draft.value
  if (field === 'title' && !String(nextValue ?? '').trim()) {
    errorMessage.value = 'Le titre est obligatoire.'
    return
  }

  if (valuesEqual(field, nextValue, book.value)) {
    resetInlineEdit()
    return
  }

  const payload = bookToEditForm(book.value)
  payload[field] = nextValue

  isSaving.value = true
  errorMessage.value = ''
  try {
    book.value = await updateReadingBook(supabase, userId.value, book.value.id, payload)
    if (field === 'collection') await loadCollections()
    resetInlineEdit()
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Erreur lors de la modification.'
  } finally {
    isSaving.value = false
  }
}

async function commitCoverEdit() {
  if (!userId.value || !book.value?.id) return

  if (coverForm.imageMode === 'keep' && !coverFile.value) {
    resetInlineEdit()
    return
  }

  if (coverForm.imageMode === 'upload' && !coverFile.value) {
    errorMessage.value = 'Choisis une image à téléverser.'
    return
  }

  isSaving.value = true
  setFileUploadInProgress(Boolean(coverFile.value))
  errorMessage.value = ''

  try {
    const payload = bookToEditForm(book.value)
    if (coverForm.imageMode === 'upload' && coverFile.value) {
      payload.file = coverFile.value
    } else if (coverForm.imageMode === 'url') {
      payload.imageUrl = coverForm.imageUrl
    }

    book.value = await updateReadingBook(supabase, userId.value, book.value.id, payload)
    resetInlineEdit()
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Erreur lors de la modification de la couverture.'
  } finally {
    isSaving.value = false
    setFileUploadInProgress(false)
  }
}

async function onRatingChange(value) {
  if (!userId.value || !book.value?.id || isSaving.value) return
  if (Number(book.value.rating) === Number(value) || (book.value.rating == null && value == null)) return

  if (editingField.value) {
    skipNextBlurCommit = true
    await commitEdit()
  }

  isSaving.value = true
  errorMessage.value = ''
  try {
    const payload = bookToEditForm(book.value)
    payload.rating = value
    book.value = await updateReadingBook(supabase, userId.value, book.value.id, payload)
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Erreur lors de la modification de la note.'
  } finally {
    isSaving.value = false
  }
}

async function onIsSagaChange(value) {
  if (!userId.value || !book.value?.id || isSaving.value) return
  if (Boolean(book.value.is_saga) === Boolean(value)) return

  if (editingField.value) {
    skipNextBlurCommit = true
    await commitEdit()
  }

  isSaving.value = true
  errorMessage.value = ''
  try {
    const payload = bookToEditForm(book.value)
    payload.isSaga = Boolean(value)
    book.value = await updateReadingBook(supabase, userId.value, book.value.id, payload)
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Erreur lors de la modification du statut série.'
  } finally {
    isSaving.value = false
  }
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
  coverForm.imageUrl = ''
  coverForm.imageMode = 'upload'
  coverPreviewObjectUrl = URL.createObjectURL(file)
  coverPreviewUrl.value = coverPreviewObjectUrl
}

function onImageUrlInput() {
  if (coverForm.imageMode !== 'url') return
  coverFile.value = null
  if (coverFileInputRef.value) coverFileInputRef.value.value = ''
  revokeCoverPreview()
  coverPreviewUrl.value = coverForm.imageUrl.trim()
}

function switchImageMode(nextMode) {
  if (coverForm.imageMode === nextMode) return
  coverForm.imageMode = nextMode
  if (nextMode === 'keep') {
    coverFile.value = null
    coverForm.imageUrl = ''
    revokeCoverPreview()
    coverPreviewUrl.value = book.value?.coverUrl ?? ''
  } else {
    coverFile.value = null
    coverForm.imageUrl = ''
    revokeCoverPreview()
  }
}

const coverPreview = computed(() => {
  if (coverForm.imageMode === 'upload' && coverPreviewUrl.value) return coverPreviewUrl.value
  if (coverForm.imageMode === 'url' && coverForm.imageUrl.trim()) return coverForm.imageUrl.trim()
  if (coverForm.imageMode === 'keep') return book.value?.coverUrl ?? ''
  return coverPreviewUrl.value || book.value?.coverUrl || ''
})

function onDraftUpdate(value) {
  draft.value = value
}

function openDeleteConfirm() {
  if (!userId.value || !book.value || isSaving.value) return
  deleteConfirmOpen.value = true
}

function cancelDeleteConfirm() {
  if (isSaving.value) return
  deleteConfirmOpen.value = false
}

async function confirmDelete() {
  if (!userId.value || !book.value || isSaving.value) return

  isSaving.value = true
  errorMessage.value = ''
  try {
    await deleteReadingBook(supabase, userId.value, book.value)
    deleteConfirmOpen.value = false
    returnToLibrary()
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Erreur lors de la suppression.'
    deleteConfirmOpen.value = false
  } finally {
    isSaving.value = false
  }
}

async function onDeleteSpoilChapter(chapterId) {
  if (!userId.value || !chapterId || spoilSaving.value) return

  spoilSaving.value = true
  spoilError.value = ''
  try {
    await deleteSpoilChapter(supabase, userId.value, chapterId)
    await loadSpoilChapters()
  } catch (err) {
    console.error(err)
    spoilError.value = err.message || 'Impossible de supprimer le chapitre.'
  } finally {
    spoilSaving.value = false
  }
}

function onKeydown(event) {
  if (isSaving.value) return
  if (event.key !== 'Escape') return
  if (deleteConfirmOpen.value) {
    deleteConfirmOpen.value = false
    return
  }
  if (editingField.value) cancelEdit()
}

onMounted(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) userId.value = user.id
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  revokeCoverPreview()
})

watch([userId, bookId], () => {
  if (userId.value && bookId.value) reloadAll()
})

watch(bookId, () => {
  resetInlineEdit()
  deleteConfirmOpen.value = false
})
</script>

<template>
  <div class="reading-book-page">
    <header class="reading-book-page__header">
      <button type="button" class="reading-book-page__back" @click="returnToLibrary">
        ← Retour à la bibliothèque
      </button>
    </header>

    <div v-if="isLoading" class="reading-book-page__status">Chargement…</div>
    <div v-else-if="!book" class="reading-book-page__error">{{ errorMessage || 'Livre introuvable.' }}</div>

    <ReadingBookFiche
      v-else
      mode="sheet"
      page
      :book="book"
      :form="coverForm"
      :collections="collections"
      :editing-field="editingField"
      :draft="draft"
      :cover-preview="coverPreview"
      :cover-file-input-ref="coverFileInputRef"
      :disabled="isSaving"
      :spoil-chapters="spoilChapters"
      :spoil-saving="spoilSaving"
      :spoil-error="spoilError"
      @start-edit="startEdit"
      @commit-edit="commitEdit"
      @cancel-edit="cancelEdit"
      @update:draft="onDraftUpdate"
      @rating-change="onRatingChange"
      @is-saga-change="onIsSagaChange"
      @switch-image-mode="switchImageMode"
      @cover-file-change="onCoverFileChange"
      @trigger-cover-picker="triggerCoverFilePicker"
      @image-url-input="onImageUrlInput"
      @delete-spoil-chapter="onDeleteSpoilChapter"
    >
      <template #actions>
        <button
          type="button"
          class="reading-fiche-icon-btn reading-fiche-icon-btn--delete"
          title="Supprimer le livre"
          aria-label="Supprimer le livre"
          :disabled="isSaving"
          @click="openDeleteConfirm"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      </template>

      <template v-if="errorMessage" #alert>
        <div class="reading-fiche-error">{{ errorMessage }}</div>
      </template>
    </ReadingBookFiche>

    <Teleport to="body">
      <div
        v-if="deleteConfirmOpen && book"
        class="reading-delete-overlay"
        @click.self="cancelDeleteConfirm"
      >
        <div
          class="reading-delete-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="reading-delete-title"
          aria-describedby="reading-delete-message"
          @click.stop
        >
          <h2 id="reading-delete-title" class="reading-delete-title">Supprimer cette fiche ?</h2>
          <p id="reading-delete-message" class="reading-delete-message">
            « {{ book.title }} » sera définitivement supprimé.
          </p>
          <div class="reading-delete-actions">
            <button type="button" class="reading-delete-cancel" :disabled="isSaving" @click="cancelDeleteConfirm">
              Annuler
            </button>
            <button type="button" class="reading-delete-confirm" :disabled="isSaving" @click="confirmDelete">
              {{ isSaving ? 'Suppression…' : 'Supprimer' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.reading-book-page {
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
}

.reading-book-page__header {
  margin: 0 0 1rem;
}

.reading-book-page__back {
  padding: 0.35rem 0;
  border: none;
  background: transparent;
  color: #6b4f7c;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
}

.reading-book-page__back:hover {
  color: #3d2f4a;
}

.reading-book-page__status {
  text-align: center;
  color: #6c757d;
  padding: 2rem 0;
}

.reading-book-page__error {
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  background: rgba(220, 53, 69, 0.1);
  color: #b02a37;
  font-size: 0.9rem;
  text-align: center;
}

.reading-delete-overlay {
  position: fixed;
  inset: 0;
  z-index: 1400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(20, 24, 32, 0.5);
  backdrop-filter: blur(4px);
  box-sizing: border-box;
}

.reading-delete-dialog {
  width: 100%;
  max-width: 22rem;
  padding: 1.25rem;
  border-radius: 16px;
  border: 1px solid rgba(173, 129, 190, 0.45);
  background: linear-gradient(180deg, #fffefb 0%, #faf6ff 100%);
  box-shadow: 0 18px 50px rgba(92, 62, 112, 0.18);
  box-sizing: border-box;
}

.reading-delete-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: #3d2f4a;
}

.reading-delete-message {
  margin: 0.65rem 0 1.1rem;
  font-size: 0.92rem;
  color: #6c757d;
  line-height: 1.45;
}

.reading-delete-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: flex-end;
}

.reading-delete-cancel,
.reading-delete-confirm {
  padding: 0.7rem 1rem;
  border-radius: 12px;
  font-weight: 700;
  font-size: 0.92rem;
  cursor: pointer;
}

.reading-delete-cancel {
  border: 1px solid rgba(173, 129, 190, 0.35);
  background: rgba(255, 255, 255, 0.85);
  color: #5a4a68;
}

.reading-delete-confirm {
  border: none;
  background: #c0392b;
  color: #fff;
}

.reading-delete-cancel:disabled,
.reading-delete-confirm:disabled {
  opacity: 0.65;
  cursor: wait;
}
</style>
