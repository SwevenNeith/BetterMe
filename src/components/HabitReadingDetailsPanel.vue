<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import RichTextNoteEditor from './RichTextNoteEditor.vue'
import HabitReadingBookSessionModal from './HabitReadingBookSessionModal.vue'
import HabitReadingLibraryPickerModal from './HabitReadingLibraryPickerModal.vue'
import HabitReadingImportModal from './HabitReadingImportModal.vue'
import {
  buildReadingDetailsHtml,
  collectUnmatchedReadingTitles,
  computeEndPageFromPagesRead,
  getLastReadingPosition,
  isBookInProgress,
  matchBookByTitleExact,
  splitReadingDetails,
} from '../utils/habitReadingLink.js'
import { isRichNoteEmpty, sanitizeRichNoteHtml } from '../utils/sanitizeHtml.js'

const props = defineProps({
  habit: {
    type: Object,
    required: true,
  },
  selectedDate: {
    type: String,
    required: true,
  },
  books: {
    type: Array,
    default: () => [],
  },
  historyLogsByDate: {
    type: Object,
    default: () => ({}),
  },
  savedDetailsHtml: {
    type: String,
    default: '',
  },
  habitValue: {
    type: Number,
    default: 0,
  },
  userId: {
    type: String,
    required: true,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['save', 'update:habitValue', 'books-updated'])

/** @type {import('vue').Ref<Record<string, { startPage: number, endPage: string, pagesRead: string }>>} */
const bookSessions = ref({})
const freeNotesDraft = ref('')
const fieldError = ref('')
const modalBookId = ref(null)
const libraryOpen = ref(false)
const importOpen = ref(false)
const importAutoOpened = ref(false)
const libraryPickedIds = ref([])
/** @type {import('vue').Ref<Array<{ id: string, title: string, author?: string, coverUrl?: string, collection?: string }>>} */
const extraBooks = ref([])
let syncingFromPanel = false
let syncingFromValue = false
let isApplyingSavedState = false
let autoSaveTimer = null

const allBooks = computed(() => {
  const map = new Map(props.books.map((book) => [book.id, book]))
  for (const book of extraBooks.value) {
    map.set(book.id, book)
  }
  return [...map.values()]
})

const inProgressBooks = computed(() => allBooks.value.filter(isBookInProgress))

const unmatchedTitles = computed(() =>
  collectUnmatchedReadingTitles(props.historyLogsByDate, allBooks.value),
)

function resolveBookFromEntry(entry) {
  if (entry.bookId) {
    const byId = allBooks.value.find((book) => book.id === entry.bookId)
    if (byId) return byId
  }
  return matchBookByTitleExact(entry.title, allBooks.value)
}

const booksForSelect = computed(() => {
  const map = new Map(inProgressBooks.value.map((book) => [book.id, book]))
  const { readingEntries } = splitReadingDetails(props.savedDetailsHtml)
  for (const entry of readingEntries) {
    const matched = resolveBookFromEntry(entry)
    if (matched && !map.has(matched.id)) {
      map.set(matched.id, matched)
    }
  }
  for (const id of libraryPickedIds.value) {
    const book = allBooks.value.find((item) => item.id === id)
    if (book) map.set(id, book)
  }
  return [...map.values()]
})

const loggedBookIds = computed(() =>
  Object.keys(bookSessions.value).filter((bookId) => {
    const session = bookSessions.value[bookId]
    return Number(session?.pagesRead) > 0
  }),
)

const loggedBooks = computed(() =>
  loggedBookIds.value
    .map((id) => {
      const book = allBooks.value.find((item) => item.id === id)
      if (!book) return null
      const session = bookSessions.value[id]
      return {
        book,
        pagesRead: Number(session.pagesRead) || 0,
        endPage: Number(session.endPage) || 0,
      }
    })
    .filter(Boolean),
)

const totalPagesRead = computed(() =>
  loggedBooks.value.reduce((sum, item) => sum + item.pagesRead, 0),
)

const modalBook = computed(
  () => allBooks.value.find((book) => book.id === modalBookId.value) ?? null,
)

const modalBaseline = computed(() => {
  if (!modalBook.value) return { page: 0, date: null }
  const { lastEndPage, lastDate } = getLastReadingPosition(
    props.historyLogsByDate,
    modalBook.value.id,
    modalBook.value.title,
    props.selectedDate,
  )
  return { page: lastEndPage, date: lastDate }
})

const modalInitialSession = computed(() => {
  if (!modalBookId.value) return { endPage: '', pagesRead: '' }
  const session = bookSessions.value[modalBookId.value]
  return {
    endPage: session?.endPage ?? '',
    pagesRead: session?.pagesRead ?? '',
  }
})

const modalIsEdit = computed(() => {
  if (!modalBookId.value) return false
  return Number(bookSessions.value[modalBookId.value]?.pagesRead) > 0
})

function formatDateFr(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function getBaselineForBook(book) {
  const { lastEndPage, lastDate } = getLastReadingPosition(
    props.historyLogsByDate,
    book.id,
    book.title,
    props.selectedDate,
  )
  return { page: lastEndPage, date: lastDate }
}

function isBookLogged(bookId) {
  return Number(bookSessions.value[bookId]?.pagesRead) > 0
}

function addLibraryBook(bookId) {
  if (!libraryPickedIds.value.includes(bookId)) {
    libraryPickedIds.value = [...libraryPickedIds.value, bookId]
  }
}

function openLibrary() {
  libraryOpen.value = true
}

function closeLibrary() {
  libraryOpen.value = false
}

function onLibrarySelect(book) {
  if (book && !props.books.some((item) => item.id === book.id)) {
    extraBooks.value = [...extraBooks.value.filter((item) => item.id !== book.id), book]
  }
  addLibraryBook(book.id)
  closeLibrary()
  openBookModal(book.id)
}

function onLibraryBookCreated(book) {
  if (book) {
    extraBooks.value = [...extraBooks.value.filter((item) => item.id !== book.id), book]
  }
  emit('books-updated')
}

function onImportBooksCreated(createdBooks) {
  if (Array.isArray(createdBooks)) {
    for (const book of createdBooks) {
      extraBooks.value = [...extraBooks.value.filter((item) => item.id !== book.id), book]
    }
  }
  emit('books-updated')
  importOpen.value = false
}

function openImportModal() {
  importOpen.value = true
}

function onImportClose() {
  importOpen.value = false
}

function maybeAutoOpenImport() {
  if (importAutoOpened.value) return
  if (!unmatchedTitles.value.length) return
  importAutoOpened.value = true
  importOpen.value = true
}

function syncLibraryPickedFromSessions() {
  const ids = Object.keys(bookSessions.value).filter((id) => {
    const book = allBooks.value.find((item) => item.id === id)
    return book && !isBookInProgress(book)
  })
  libraryPickedIds.value = [...new Set([...libraryPickedIds.value, ...ids])]
}

function openBookModal(bookId) {
  fieldError.value = ''
  modalBookId.value = bookId

  if (!isBookLogged(bookId) && loggedBookIds.value.length === 0 && props.habitValue > 0) {
    const book = allBooks.value.find((item) => item.id === bookId)
    if (!book) return
    const { page } = getBaselineForBook(book)
    bookSessions.value = {
      ...bookSessions.value,
      [bookId]: {
        startPage: page,
        pagesRead: String(props.habitValue),
        endPage: String(computeEndPageFromPagesRead(page, props.habitValue)),
      },
    }
  }
}

function closeBookModal() {
  modalBookId.value = null
}

function onModalSave({ endPage, pagesRead }) {
  if (!modalBook.value) return
  const { page } = getBaselineForBook(modalBook.value)

  bookSessions.value = {
    ...bookSessions.value,
    [modalBook.value.id]: {
      startPage: page,
      endPage: String(endPage),
      pagesRead: String(pagesRead),
    },
  }

  closeBookModal()
  emitHabitValue()
  void persistAutoSave({ closeAfterSave: true })
}

function onModalRemove() {
  if (!modalBook.value) return
  const next = { ...bookSessions.value }
  delete next[modalBook.value.id]
  bookSessions.value = next
  closeBookModal()
  emitHabitValue()
  void persistAutoSave({ closeAfterSave: true })
}

function emitHabitValue() {
  if (syncingFromValue) return
  syncingFromPanel = true
  emit('update:habitValue', totalPagesRead.value)
  void nextTick(() => {
    syncingFromPanel = false
  })
}

function resetFromSavedDetails() {
  isApplyingSavedState = true
  fieldError.value = ''
  const { readingEntries, freeHtml } = splitReadingDetails(props.savedDetailsHtml)
  freeNotesDraft.value = freeHtml

  /** @type {Record<string, { startPage: number, endPage: string, pagesRead: string }>} */
  const sessions = {}

  for (const entry of readingEntries) {
    const matched = resolveBookFromEntry(entry)
    if (!matched) continue

    sessions[matched.id] = {
      startPage: entry.startPage,
      endPage: String(entry.endPage),
      pagesRead: String(entry.endPage - entry.startPage),
    }
    if (!isBookInProgress(matched)) {
      addLibraryBook(matched.id)
    }
  }

  bookSessions.value = sessions
  syncLibraryPickedFromSessions()

  if (!Object.keys(sessions).length && props.habitValue > 0 && booksForSelect.value.length === 1) {
    const book = booksForSelect.value[0]
    const { page } = getBaselineForBook(book)
    bookSessions.value = {
      [book.id]: {
        startPage: page,
        pagesRead: String(props.habitValue),
        endPage: String(computeEndPageFromPagesRead(page, props.habitValue)),
      },
    }
  }

  void nextTick(() => {
    isApplyingSavedState = false
  })
}

function buildValidPayload({ silent = false } = {}) {
  if (!loggedBookIds.value.length) {
    const sanitizedFree = sanitizeRichNoteHtml(freeNotesDraft.value)
    const { readingEntries } = splitReadingDetails(props.savedDetailsHtml)
    const hadReading = readingEntries.length > 0
    const hasFreeNotes = !isRichNoteEmpty(sanitizedFree)

    if (!hadReading && !hasFreeNotes) {
      if (!silent) fieldError.value = ''
      return null
    }

    if (!silent) fieldError.value = ''
    const detailsHtml = buildReadingDetailsHtml({
      entries: [],
      freeHtml: freeNotesDraft.value,
    })

    return {
      entries: [],
      totalPagesRead: 0,
      freeHtml: freeNotesDraft.value,
      detailsHtml: isRichNoteEmpty(sanitizeRichNoteHtml(detailsHtml ?? '')) ? null : detailsHtml,
    }
  }

  /** @type {Array<{ bookId: string, title: string, startPage: number, endPage: number, pagesRead: number }>} */
  const entries = []

  for (const bookId of loggedBookIds.value) {
    const book = allBooks.value.find((item) => item.id === bookId)
    if (!book) continue

    const session = bookSessions.value[bookId]
    const start = Number(session.startPage)
    const endPage = Number(session.endPage)
    const pagesRead = Number(session.pagesRead)

    if (!Number.isFinite(endPage) || endPage <= 0 || !Number.isFinite(pagesRead) || pagesRead <= 0) {
      if (!silent) fieldError.value = `Progression incomplète pour « ${book.title} ».`
      return null
    }

    if (endPage <= start || pagesRead !== endPage - start) {
      if (!silent) fieldError.value = `Progression incohérente pour « ${book.title} ».`
      return null
    }

    entries.push({
      bookId: book.id,
      title: book.title,
      startPage: start,
      endPage,
      pagesRead,
    })
  }

  if (!entries.length) {
    if (!silent) fieldError.value = 'Ajoutez au moins un livre lu aujourd’hui.'
    return null
  }

  if (!silent) fieldError.value = ''
  return {
    entries,
    totalPagesRead: entries.reduce((sum, entry) => sum + entry.pagesRead, 0),
    freeHtml: freeNotesDraft.value,
  }
}

function scheduleAutoSave(delayMs = 500) {
  if (isApplyingSavedState || props.disabled || modalBookId.value) return
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null
    void persistAutoSave()
  }, delayMs)
}

function persistAutoSave({ closeAfterSave = false } = {}) {
  if (isApplyingSavedState || props.disabled || modalBookId.value) return

  const payload = buildValidPayload({ silent: true })
  if (!payload) return

  emit('save', {
    ...payload,
    closeAfterSave,
    detailsHtml: buildReadingDetailsHtml({
      entries: payload.entries,
      freeHtml: payload.freeHtml,
    }),
  })
}

watch(
  () => [props.savedDetailsHtml, props.selectedDate, props.books],
  () => {
    if (props.selectedDate) {
      importAutoOpened.value = false
    }
    resetFromSavedDetails()
    maybeAutoOpenImport()
  },
  { immediate: true },
)

watch(
  () => props.habitValue,
  (value) => {
    if (syncingFromPanel) return
    if (loggedBookIds.value.length !== 1) return

    const bookId = loggedBookIds.value[0]
    const book = allBooks.value.find((item) => item.id === bookId)
    if (!book) return

    const pages = Math.max(0, Number(value) || 0)
    const { page } = getBaselineForBook(book)

    syncingFromValue = true
    if (!pages) {
      const next = { ...bookSessions.value }
      delete next[bookId]
      bookSessions.value = next
    } else {
      bookSessions.value = {
        ...bookSessions.value,
        [bookId]: {
          startPage: page,
          pagesRead: String(pages),
          endPage: String(computeEndPageFromPagesRead(page, pages)),
        },
      }
    }
    syncingFromValue = false
    scheduleAutoSave(300)
  },
)

watch(freeNotesDraft, () => {
  scheduleAutoSave(700)
})

watch(totalPagesRead, (total) => {
  if (total !== props.habitValue) {
    emit('update:habitValue', total)
  }
})

defineExpose({
  getFreeNotesDraft: () => freeNotesDraft.value,
  setFreeNotesDraft: (value) => {
    freeNotesDraft.value = typeof value === 'string' ? value : ''
  },
})
</script>

<template>
  <div class="habit-reading-details" :style="{ '--habit-color': habit.couleur }">
    <p class="habit-reading-details__intro">
      Choisissez un livre pour renseigner votre progression dans une fenêtre dédiée. Vous pouvez
      revenir modifier un livre plus tard dans la journée (total cumulé du jour).
    </p>

    <section v-if="loggedBooks.length" class="habit-reading-details__today" aria-label="Lectures du jour">
      <div class="habit-reading-details__today-head">
        <p class="habit-reading-details__field-label">Aujourd'hui</p>
        <p class="habit-reading-details__total">
          Total : <strong>{{ totalPagesRead }}</strong> page{{ totalPagesRead > 1 ? 's' : '' }}
        </p>
      </div>

      <ul class="habit-reading-details__logged-list">
        <li v-for="item in loggedBooks" :key="item.book.id" class="habit-reading-details__logged-item">
          <button
            type="button"
            class="habit-reading-details__logged-card"
            :disabled="disabled"
            @click="openBookModal(item.book.id)"
          >
            <div class="habit-reading-details__logged-cover-wrap">
              <img
                v-if="item.book.coverUrl"
                :src="item.book.coverUrl"
                :alt="`Couverture de ${item.book.title}`"
                class="habit-reading-details__logged-cover"
              />
              <div
                v-else
                class="habit-reading-details__logged-cover habit-reading-details__logged-cover--placeholder"
              >
                {{ item.book.title?.charAt(0)?.toUpperCase() || '?' }}
              </div>
            </div>
            <div class="habit-reading-details__logged-meta">
              <span class="habit-reading-details__logged-title">{{ item.book.title }}</span>
              <span class="habit-reading-details__logged-stats">
                {{ item.pagesRead }} p. · arrêt p. {{ item.endPage }}
              </span>
            </div>
            <span class="habit-reading-details__logged-edit" aria-hidden="true">Modifier</span>
          </button>
        </li>
      </ul>
    </section>

    <div class="habit-reading-details__toolbar">
      <p class="habit-reading-details__field-label">Ajouter ou modifier un livre</p>
      <div class="habit-reading-details__toolbar-actions">
        <button
          type="button"
          class="habit-reading-details__toolbar-btn"
          :disabled="disabled"
          @click="openLibrary"
        >
          Bibliothèque
        </button>
        <button
          v-if="unmatchedTitles.length"
          type="button"
          class="habit-reading-details__toolbar-btn habit-reading-details__toolbar-btn--accent"
          :disabled="disabled"
          @click="openImportModal"
        >
          Importer titres ({{ unmatchedTitles.length }})
        </button>
      </div>
    </div>

    <p v-if="!booksForSelect.length" class="habit-reading-details__empty">
      Aucun livre en cours dans votre bibliothèque.
    </p>

    <ul v-else class="habit-reading-details__covers">
      <li v-for="book in booksForSelect" :key="book.id">
        <button
          type="button"
          class="habit-reading-details__cover-btn"
          :class="{
            'habit-reading-details__cover-btn--logged': isBookLogged(book.id),
          }"
          :disabled="disabled"
          :aria-label="book.title"
          :title="book.title"
          @click="openBookModal(book.id)"
        >
          <div class="habit-reading-details__cover-wrap">
            <img
              v-if="book.coverUrl"
              :src="book.coverUrl"
              :alt="`Couverture de ${book.title}`"
              class="habit-reading-details__cover"
            />
            <div v-else class="habit-reading-details__cover habit-reading-details__cover--placeholder">
              {{ book.title?.charAt(0)?.toUpperCase() || '?' }}
            </div>
            <span v-if="isBookLogged(book.id)" class="habit-reading-details__badge">
              {{ bookSessions[book.id]?.pagesRead }} p.
            </span>
          </div>
        </button>
      </li>
    </ul>

    <div class="habit-reading-details__notes">
      <p class="habit-reading-details__notes-label">Notes libres (optionnel)</p>
      <RichTextNoteEditor
        v-model="freeNotesDraft"
        :disabled="disabled"
        placeholder="Ressenti, citations, contexte…"
      />
    </div>

    <p v-if="fieldError" class="habit-reading-details__error">{{ fieldError }}</p>

    <p v-if="disabled" class="habit-reading-details__autosave-hint">Enregistrement…</p>
    <p v-else class="habit-reading-details__autosave-hint">
      Les modifications sont enregistrées automatiquement.
    </p>

    <HabitReadingBookSessionModal
      :open="Boolean(modalBook)"
      :book="modalBook"
      :habit="habit"
      :baseline-page="modalBaseline.page"
      :baseline-date="modalBaseline.date ? formatDateFr(modalBaseline.date) : null"
      :initial-end-page="modalInitialSession.endPage"
      :initial-pages-read="modalInitialSession.pagesRead"
      :is-edit="modalIsEdit"
      :disabled="disabled"
      @close="closeBookModal"
      @save="onModalSave"
      @remove="onModalRemove"
    />

    <HabitReadingLibraryPickerModal
      :open="libraryOpen"
      :books="allBooks"
      :habit="habit"
      :user-id="userId"
      @close="closeLibrary"
      @select="onLibrarySelect"
      @created="onLibraryBookCreated"
    />

    <HabitReadingImportModal
      :open="importOpen"
      :titles="unmatchedTitles"
      :user-id="userId"
      @close="onImportClose"
      @created="onImportBooksCreated"
    />
  </div>
</template>

<style scoped>
.habit-reading-details {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.habit-reading-details__intro,
.habit-reading-details__empty {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.45;
  color: #6c757d;
}

.habit-reading-details__field-label,
.habit-reading-details__notes-label {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--habit-color, #ad81be);
}

.habit-reading-details__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.habit-reading-details__toolbar-actions {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.habit-reading-details__toolbar-btn {
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.85);
  color: var(--habit-color, #ad81be);
  font-size: 0.72rem;
  font-weight: 800;
  cursor: pointer;
}

.habit-reading-details__toolbar-btn--accent {
  border-color: var(--habit-color, #ad81be);
  background: rgba(213, 181, 234, 0.14);
}

.habit-reading-details__toolbar-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.habit-reading-details__today {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.65rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.28);
  background: rgba(213, 181, 234, 0.08);
}

.habit-reading-details__today-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.habit-reading-details__total {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
  color: #2c3e50;
}

.habit-reading-details__total strong {
  color: var(--habit-color, #ad81be);
}

.habit-reading-details__logged-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  max-height: 9.5rem;
  overflow: auto;
}

.habit-reading-details__logged-card {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.45rem 0.55rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.22);
  background: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  text-align: left;
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.habit-reading-details__logged-card:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: var(--habit-color, #ad81be);
}

.habit-reading-details__logged-card:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.habit-reading-details__logged-cover-wrap {
  width: 2rem;
  flex-shrink: 0;
  aspect-ratio: 2 / 3;
  border-radius: 5px;
  overflow: hidden;
}

.habit-reading-details__logged-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.habit-reading-details__logged-cover--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(213, 181, 234, 0.35), rgba(173, 129, 190, 0.45));
  color: white;
  font-size: 0.75rem;
  font-weight: 900;
}

.habit-reading-details__logged-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.habit-reading-details__logged-title {
  font-size: 0.82rem;
  font-weight: 800;
  color: #2c3e50;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.habit-reading-details__logged-stats {
  font-size: 0.72rem;
  font-weight: 600;
  color: #6c757d;
}

.habit-reading-details__logged-edit {
  flex-shrink: 0;
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--habit-color, #ad81be);
}

.habit-reading-details__covers {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.4rem;
  max-height: 14rem;
  overflow: auto;
}

.habit-reading-details__cover-btn {
  display: block;
  width: 100%;
  padding: 0.2rem;
  border-radius: 8px;
  border: 2px solid rgba(213, 181, 234, 0.3);
  background: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

.habit-reading-details__cover-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.habit-reading-details__cover-btn--logged {
  border-color: var(--habit-color, #ad81be);
  box-shadow: 0 0 0 2px rgba(173, 129, 190, 0.2);
  background: rgba(213, 181, 234, 0.12);
}

.habit-reading-details__cover-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.habit-reading-details__cover-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: 5px;
  overflow: hidden;
}

.habit-reading-details__cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.habit-reading-details__cover--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(213, 181, 234, 0.35), rgba(173, 129, 190, 0.45));
  color: white;
  font-size: 0.85rem;
  font-weight: 900;
}

.habit-reading-details__badge {
  position: absolute;
  right: 0.15rem;
  bottom: 0.15rem;
  padding: 0.08rem 0.28rem;
  border-radius: 999px;
  background: var(--habit-color, #ad81be);
  color: white;
  font-size: 0.55rem;
  font-weight: 800;
  line-height: 1.2;
}

.habit-reading-details__notes {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.habit-reading-details__error {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: #c0392b;
}

.habit-reading-details__autosave-hint {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 600;
  color: #6c757d;
  text-align: right;
}

@media (prefers-color-scheme: dark) {
  .habit-reading-details__intro,
  .habit-reading-details__empty,
  .habit-reading-details__logged-stats {
    color: #adb5bd;
  }

  .habit-reading-details__today {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(213, 181, 234, 0.15);
  }

  .habit-reading-details__total,
  .habit-reading-details__logged-title {
    color: #f0e8f8;
  }

  .habit-reading-details__logged-card,
  .habit-reading-details__cover-btn,
  .habit-reading-details__toolbar-btn {
    background: rgba(30, 25, 40, 0.85);
    border-color: rgba(213, 181, 234, 0.2);
  }
}
</style>
