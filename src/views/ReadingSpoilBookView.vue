<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ReadingSpoilBook from '../components/ReadingSpoilBook.vue'
import { supabase } from '../lib/supabase.js'
import { getReadingBookWithCover } from '../services/readingBooks.js'
import { deleteSpoilChapter, listSpoilChapters } from '../services/readingSpoilChapters.js'

const route = useRoute()
const router = useRouter()

const userId = ref(null)
const book = ref(null)
const chapters = ref([])
const isLoading = ref(true)
const isDeleting = ref(false)
const errorMessage = ref('')
const deleteConfirmOpen = ref(false)

const bookId = computed(() => String(route.params.bookId ?? ''))
const chapterId = computed(() => String(route.params.chapterId ?? ''))

const currentChapterIndex = computed(() =>
  chapters.value.findIndex((chapter) => chapter.id === chapterId.value),
)

const currentChapter = computed(() => {
  if (!chapters.value.length) return null
  if (currentChapterIndex.value >= 0) return chapters.value[currentChapterIndex.value]
  return chapters.value[0]
})

const canGoPrevChapter = computed(() => currentChapterIndex.value > 0)
const canGoNextChapter = computed(
  () => currentChapterIndex.value >= 0 && currentChapterIndex.value < chapters.value.length - 1,
)

function isNumericChapterNumber(value) {
  const label = String(value ?? '').trim()
  if (!label) return false
  return /^-?\d+(?:[.,]\d+)?$/.test(label)
}

function formatChapterLabel(chapterNumber) {
  const label = String(chapterNumber ?? '').trim()
  if (!label) return 'ce chapitre'
  if (isNumericChapterNumber(label)) return `le chapitre ${label}`
  return `« ${label} »`
}

function returnToBook() {
  router.push({ name: 'lecture-livre', params: { bookId: bookId.value } })
}

function openChapterByIndex(index) {
  const target = chapters.value[index]
  if (!target?.id) return
  router.push({
    name: 'lecture-spoil-lecture',
    params: { bookId: bookId.value, chapterId: target.id },
  })
}

function goPrevChapter() {
  if (!canGoPrevChapter.value) return
  openChapterByIndex(currentChapterIndex.value - 1)
}

function goNextChapter() {
  if (!canGoNextChapter.value) return
  openChapterByIndex(currentChapterIndex.value + 1)
}

function openEditChapter() {
  const chapter = currentChapter.value
  if (!chapter?.id) return
  router.push({
    name: 'lecture-spoil-edition',
    params: { bookId: bookId.value, chapterId: chapter.id },
  })
}

function askDeleteChapter() {
  if (!currentChapter.value?.id) return
  deleteConfirmOpen.value = true
}

function cancelDeleteChapter() {
  if (isDeleting.value) return
  deleteConfirmOpen.value = false
}

async function confirmDeleteChapter() {
  const chapter = currentChapter.value
  if (!chapter?.id || !userId.value || isDeleting.value) return

  isDeleting.value = true
  errorMessage.value = ''

  try {
    await deleteSpoilChapter(supabase, userId.value, chapter.id)
    deleteConfirmOpen.value = false

    const deletedIndex = currentChapterIndex.value
    chapters.value = chapters.value.filter((item) => item.id !== chapter.id)

    if (!chapters.value.length) {
      returnToBook()
      return
    }

    const nextIndex = Math.min(deletedIndex, chapters.value.length - 1)
    openChapterByIndex(nextIndex)
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Impossible de supprimer le chapitre.'
  } finally {
    isDeleting.value = false
  }
}

async function loadData() {
  if (!userId.value || !bookId.value) {
    book.value = null
    chapters.value = []
    errorMessage.value = 'Livre introuvable.'
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    book.value = await getReadingBookWithCover(supabase, userId.value, bookId.value)
    if (!book.value) {
      chapters.value = []
      errorMessage.value = 'Livre introuvable.'
      return
    }

    chapters.value = await listSpoilChapters(supabase, userId.value, bookId.value)
    if (!chapters.value.length) {
      returnToBook()
      return
    }

    if (!chapterId.value || !chapters.value.some((chapter) => chapter.id === chapterId.value)) {
      openChapterByIndex(0)
    }
  } catch (err) {
    console.error(err)
    book.value = null
    chapters.value = []
    errorMessage.value = err.message || 'Impossible de charger les spoils.'
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) userId.value = user.id
})

watch([userId, bookId], () => {
  if (userId.value && bookId.value) loadData()
})
</script>

<template>
  <div class="spoil-reader-page">
    <header class="spoil-reader-page__header">
      <button type="button" class="spoil-reader-page__back" @click="returnToBook">
        ← Retour à la fiche
      </button>
    </header>

    <p v-if="errorMessage" class="spoil-reader-page__error">{{ errorMessage }}</p>
    <div v-if="isLoading" class="spoil-reader-page__status">Chargement…</div>
    <div v-else-if="!currentChapter" class="spoil-reader-page__status">Aucun spoil à afficher.</div>

    <ReadingSpoilBook
      v-else
      :chapter="currentChapter"
      :book-title="book?.title ?? ''"
      :can-go-prev-chapter="canGoPrevChapter"
      :can-go-next-chapter="canGoNextChapter"
      :deleting="isDeleting"
      @prev-chapter="goPrevChapter"
      @next-chapter="goNextChapter"
      @edit="openEditChapter"
      @delete="askDeleteChapter"
    />

    <Teleport to="body">
      <div
        v-if="deleteConfirmOpen && currentChapter"
        class="spoil-reader-delete-overlay"
        @click.self="cancelDeleteChapter"
      >
        <div
          class="spoil-reader-delete-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="spoil-reader-delete-title"
          aria-describedby="spoil-reader-delete-message"
        >
          <h2 id="spoil-reader-delete-title" class="spoil-reader-delete-dialog__title">
            Supprimer ce chapitre ?
          </h2>
          <p id="spoil-reader-delete-message" class="spoil-reader-delete-dialog__message">
            {{ formatChapterLabel(currentChapter.chapter_number) }} sera définitivement supprimé.
          </p>
          <div class="spoil-reader-delete-dialog__actions">
            <button
              type="button"
              class="spoil-reader-delete-dialog__cancel"
              :disabled="isDeleting"
              @click="cancelDeleteChapter"
            >
              Annuler
            </button>
            <button
              type="button"
              class="spoil-reader-delete-dialog__confirm"
              :disabled="isDeleting"
              @click="confirmDeleteChapter"
            >
              {{ isDeleting ? 'Suppression…' : 'Supprimer' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.spoil-reader-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 2rem;
  box-sizing: border-box;
  min-height: 0;
}

.spoil-reader-page__header {
  margin-bottom: 1rem;
}

.spoil-reader-page__back {
  padding: 0.35rem 0;
  border: none;
  background: transparent;
  color: #6b4f7c;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
}

.spoil-reader-page__back:hover {
  color: #3d2f4a;
}

.spoil-reader-page__status,
.spoil-reader-page__error {
  margin: 0 0 1rem;
  padding: 0.75rem 0.9rem;
  border-radius: 12px;
  text-align: center;
}

.spoil-reader-page__status {
  background: rgba(213, 181, 234, 0.1);
  color: #6c757d;
}

.spoil-reader-page__error {
  background: rgba(220, 53, 69, 0.1);
  color: #b02a37;
}

.spoil-reader-delete-overlay {
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

.spoil-reader-delete-dialog {
  width: 100%;
  max-width: 24rem;
  padding: 1.25rem;
  border-radius: 16px;
  border: 1px solid rgba(173, 129, 190, 0.45);
  background: linear-gradient(180deg, #fffefb 0%, #faf6ff 100%);
  box-shadow: 0 18px 50px rgba(92, 62, 112, 0.18);
  box-sizing: border-box;
}

.spoil-reader-delete-dialog__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: #3d2f4a;
}

.spoil-reader-delete-dialog__message {
  margin: 0.65rem 0 1.1rem;
  font-size: 0.92rem;
  color: #6c757d;
  line-height: 1.45;
}

.spoil-reader-delete-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: flex-end;
}

.spoil-reader-delete-dialog__cancel,
.spoil-reader-delete-dialog__confirm {
  padding: 0.7rem 1rem;
  border-radius: 12px;
  font-weight: 700;
  font-size: 0.92rem;
  cursor: pointer;
}

.spoil-reader-delete-dialog__cancel {
  border: 1px solid rgba(173, 129, 190, 0.35);
  background: rgba(255, 255, 255, 0.85);
  color: #5a4a68;
}

.spoil-reader-delete-dialog__confirm {
  border: none;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: #fff;
}

.spoil-reader-delete-dialog__cancel:disabled,
.spoil-reader-delete-dialog__confirm:disabled {
  opacity: 0.65;
  cursor: wait;
}

@media (prefers-color-scheme: dark) {
  .spoil-reader-page__back {
    color: #d5b5ea;
  }

  .spoil-reader-page__back:hover {
    color: #f0e8f8;
  }

  .spoil-reader-page__status {
    color: #adb5bd;
    background: rgba(213, 181, 234, 0.1);
  }

  .spoil-reader-page__error {
    background: rgba(220, 53, 69, 0.18);
    color: #ff8a95;
  }

  .spoil-reader-delete-dialog {
    background: linear-gradient(180deg, #2a2438 0%, #1f1a2c 100%);
    border-color: rgba(213, 181, 234, 0.28);
  }

  .spoil-reader-delete-dialog__title {
    color: #f0e8f8;
  }

  .spoil-reader-delete-dialog__message {
    color: #adb5bd;
  }

  .spoil-reader-delete-dialog__cancel {
    background: rgba(35, 30, 48, 0.95);
    border-color: rgba(173, 129, 190, 0.4);
    color: #e8dcf5;
  }
}
</style>
