<script setup>
import { computed, nextTick, onUnmounted, reactive, ref, watch } from 'vue'
import ReadingBookFiche from './ReadingBookFiche.vue'
import { setFilePickerActive, setFileUploadInProgress } from '../composables/useAppTabResume.js'
import { bookToEditForm, getBookGenre, formatExtraTagsInput } from '../utils/readingBookForm.js'
import { deleteReadingBook, updateReadingBook } from '../services/readingBooks.js'
import { deleteSpoilChapter, listSpoilChapters, updateSpoilChapter } from '../services/readingSpoilChapters.js'
import { supabase } from '../lib/supabase.js'

const props = defineProps({
  book: {
    type: Object,
    default: null,
  },
  userId: {
    type: String,
    default: null,
  },
  open: {
    type: Boolean,
    default: false,
  },
  collections: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['close', 'updated', 'deleted', 'collections-changed'])

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

const FIELD_GETTERS = {
  title: (book) => book?.title ?? '',
  author: (book) => book?.author ?? '',
  collection: (book) => book?.collection ?? '',
  dateStart: (book) => book?.date_start ?? '',
  dateEnd: (book) => book?.date_end ?? '',
  genre: (book) => getBookGenre(book),
  pages: (book) => (book?.pages != null ? String(book.pages) : ''),
  publicationYear: (book) => (book?.publication_year != null ? String(book.publication_year) : ''),
  extraTags: (book) => formatExtraTagsInput(book),
  comments: (book) => book?.comments ?? '',
  quote: (book) => book?.quote ?? '',
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

async function loadSpoilChapters() {
  if (!props.userId || !props.book?.id) {
    spoilChapters.value = []
    return
  }
  try {
    spoilChapters.value = await listSpoilChapters(supabase, props.userId, props.book.id)
    spoilError.value = ''
  } catch (err) {
    console.error(err)
    spoilChapters.value = []
    spoilError.value = err.message || 'Impossible de charger les chapitres spoil.'
  }
}

function onNavigateToAddSpoil() {
  handleClose()
}

async function onUpdateSpoilChapter(payload) {
  if (!props.userId || !payload?.id || spoilSaving.value) return

  spoilSaving.value = true
  spoilError.value = ''
  try {
    await updateSpoilChapter(supabase, props.userId, payload.id, payload)
    await loadSpoilChapters()
  } catch (err) {
    console.error(err)
    spoilError.value = err.message || 'Impossible de modifier le chapitre.'
  } finally {
    spoilSaving.value = false
  }
}

async function onDeleteSpoilChapter(chapterId) {
  if (!props.userId || !chapterId || spoilSaving.value) return

  spoilSaving.value = true
  spoilError.value = ''
  try {
    await deleteSpoilChapter(supabase, props.userId, chapterId)
    await loadSpoilChapters()
  } catch (err) {
    console.error(err)
    spoilError.value = err.message || 'Impossible de supprimer le chapitre.'
  } finally {
    spoilSaving.value = false
  }
}

function handleClose() {
  if (isSaving.value) return
  if (deleteConfirmOpen.value) {
    deleteConfirmOpen.value = false
    return
  }
  resetInlineEdit()
  emit('close')
}

function onOverlayClick(event) {
  if (event.target === event.currentTarget) handleClose()
}

function onKeydown(event) {
  if (!props.open || isSaving.value) return
  if (event.key === 'Escape') {
    if (deleteConfirmOpen.value) {
      deleteConfirmOpen.value = false
      return
    }
    if (editingField.value) {
      cancelEdit()
      return
    }
    handleClose()
  }
}

async function startEdit(field) {
  if (!props.book || isSaving.value) return

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
    coverPreviewUrl.value = props.book.coverUrl ?? ''
    return
  }

  draft.value = FIELD_GETTERS[field]?.(props.book) ?? ''
}

function cancelEdit() {
  skipNextBlurCommit = true
  resetInlineEdit()
  nextTick(() => {
    skipNextBlurCommit = false
  })
}

function valuesEqual(field, nextValue, book) {
  const current = FIELD_GETTERS[field]?.(book) ?? ''
  return String(current) === String(nextValue ?? '')
}

async function commitEdit() {
  if (skipNextBlurCommit) {
    skipNextBlurCommit = false
    return
  }
  if (!props.userId || !props.book?.id || !editingField.value || isSaving.value) return

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

  if (valuesEqual(field, nextValue, props.book)) {
    resetInlineEdit()
    return
  }

  const payload = bookToEditForm(props.book)
  payload[field] = nextValue

  isSaving.value = true
  errorMessage.value = ''
  try {
    const updated = await updateReadingBook(supabase, props.userId, props.book.id, payload)
    emit('updated', updated)
    if (field === 'collection') emit('collections-changed')
    resetInlineEdit()
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Erreur lors de la modification.'
  } finally {
    isSaving.value = false
  }
}

async function commitCoverEdit() {
  if (!props.userId || !props.book?.id) return

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
    const payload = bookToEditForm(props.book)
    if (coverForm.imageMode === 'upload' && coverFile.value) {
      payload.file = coverFile.value
    } else if (coverForm.imageMode === 'url') {
      payload.imageUrl = coverForm.imageUrl
    }

    const updated = await updateReadingBook(supabase, props.userId, props.book.id, payload)
    emit('updated', updated)
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
  if (!props.userId || !props.book?.id || isSaving.value) return
  if (Number(props.book.rating) === Number(value) || (props.book.rating == null && value == null)) {
    return
  }

  if (editingField.value) {
    skipNextBlurCommit = true
    await commitEdit()
  }

  isSaving.value = true
  errorMessage.value = ''
  try {
    const payload = bookToEditForm(props.book)
    payload.rating = value
    const updated = await updateReadingBook(supabase, props.userId, props.book.id, payload)
    emit('updated', updated)
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Erreur lors de la modification de la note.'
  } finally {
    isSaving.value = false
  }
}

async function onIsSagaChange(value) {
  if (!props.userId || !props.book?.id || isSaving.value) return
  if (Boolean(props.book.is_saga) === Boolean(value)) return

  if (editingField.value) {
    skipNextBlurCommit = true
    await commitEdit()
  }

  isSaving.value = true
  errorMessage.value = ''
  try {
    const payload = bookToEditForm(props.book)
    payload.isSaga = Boolean(value)
    const updated = await updateReadingBook(supabase, props.userId, props.book.id, payload)
    emit('updated', updated)
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
    coverPreviewUrl.value = props.book?.coverUrl ?? ''
  } else {
    coverFile.value = null
    coverForm.imageUrl = ''
    revokeCoverPreview()
  }
}

const coverPreview = computed(() => {
  if (coverForm.imageMode === 'upload' && coverPreviewUrl.value) return coverPreviewUrl.value
  if (coverForm.imageMode === 'url' && coverForm.imageUrl.trim()) return coverForm.imageUrl.trim()
  if (coverForm.imageMode === 'keep') return props.book?.coverUrl ?? ''
  return coverPreviewUrl.value || props.book?.coverUrl || ''
})

function onDraftUpdate(value) {
  draft.value = value
}

function openDeleteConfirm() {
  if (!props.userId || !props.book || isSaving.value) return
  deleteConfirmOpen.value = true
}

function cancelDeleteConfirm() {
  if (isSaving.value) return
  deleteConfirmOpen.value = false
}

async function confirmDelete() {
  if (!props.userId || !props.book || isSaving.value) return

  isSaving.value = true
  errorMessage.value = ''
  try {
    await deleteReadingBook(supabase, props.userId, props.book)
    deleteConfirmOpen.value = false
    emit('deleted', props.book.id)
    resetInlineEdit()
    emit('close')
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Erreur lors de la suppression.'
    deleteConfirmOpen.value = false
  } finally {
    isSaving.value = false
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      resetInlineEdit()
      spoilError.value = ''
      deleteConfirmOpen.value = false
      loadSpoilChapters()
      document.addEventListener('keydown', onKeydown)
    } else {
      document.removeEventListener('keydown', onKeydown)
      resetInlineEdit()
      spoilChapters.value = []
      spoilError.value = ''
      deleteConfirmOpen.value = false
    }
  },
)

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  revokeCoverPreview()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && book"
      class="reading-review-modal"
      role="dialog"
      aria-modal="true"
      :aria-label="`Fiche de ${book.title}`"
      @click="onOverlayClick"
    >
      <ReadingBookFiche
        mode="sheet"
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
        @click.stop
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
        @navigate-to-add-spoil="onNavigateToAddSpoil"
        @update-spoil-chapter="onUpdateSpoilChapter"
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
          <button
            type="button"
            class="reading-fiche-close"
            title="Fermer"
            aria-label="Fermer"
            :disabled="isSaving"
            @click="handleClose"
          >
            ✕
          </button>
        </template>

        <template v-if="errorMessage" #alert>
          <div class="reading-fiche-error">{{ errorMessage }}</div>
        </template>
      </ReadingBookFiche>

      <div
        v-if="deleteConfirmOpen"
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
            <button
              type="button"
              class="reading-delete-cancel"
              :disabled="isSaving"
              @click="cancelDeleteConfirm"
            >
              Annuler
            </button>
            <button
              type="button"
              class="reading-delete-confirm"
              :disabled="isSaving"
              @click="confirmDelete"
            >
              {{ isSaving ? 'Suppression…' : 'Supprimer' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.reading-review-modal {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(20, 24, 32, 0.45);
  backdrop-filter: blur(4px);
  box-sizing: border-box;
}

.reading-delete-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
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
  transition: filter 0.15s ease, transform 0.15s ease;
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

.reading-delete-confirm:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.05);
}

.reading-delete-cancel:disabled,
.reading-delete-confirm:disabled {
  opacity: 0.65;
  cursor: wait;
}

@media (prefers-color-scheme: dark) {
  .reading-delete-dialog {
    background: linear-gradient(180deg, #2a2438 0%, #1f1a2c 100%);
    border-color: rgba(213, 181, 234, 0.28);
  }

  .reading-delete-title {
    color: #f0e8f8;
  }

  .reading-delete-message {
    color: #adb5bd;
  }

  .reading-delete-cancel {
    background: rgba(35, 30, 48, 0.95);
    border-color: rgba(173, 129, 190, 0.4);
    color: #e8dcf5;
  }
}
</style>
