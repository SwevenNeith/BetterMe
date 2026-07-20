<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import ReadingSpoilChapterForm from '../components/ReadingSpoilChapterForm.vue'
import { supabase } from '../lib/supabase.js'
import { getReadingBookWithCover } from '../services/readingBooks.js'
import { createSpoilChapter, listSpoilChapters, updateSpoilChapter } from '../services/readingSpoilChapters.js'

const route = useRoute()
const router = useRouter()

const userId = ref(null)
const book = ref(null)
const chapter = ref(null)
const formRef = ref(null)
const isLoading = ref(true)
const isSaving = ref(false)
const loadError = ref('')
const saveError = ref('')
const leaveConfirmOpen = ref(false)
const skipLeaveGuard = ref(false)
/** Callback `next()` fourni par onBeforeRouteLeave quand la navigation est interceptée. */
let pendingRouteNext = null

const bookId = computed(() => String(route.params.bookId ?? ''))
const chapterId = computed(() => String(route.params.chapterId ?? ''))
const isEditMode = computed(() => route.name === 'lecture-spoil-edition')

function isFormDirty() {
  return Boolean(formRef.value?.isDirty)
}

function navigateToBook() {
  router.push({ name: 'lecture-livre', params: { bookId: bookId.value } })
}

function resumeNavigationAfterLeave() {
  skipLeaveGuard.value = true
  leaveConfirmOpen.value = false

  const resume = pendingRouteNext
  pendingRouteNext = null

  if (resume) {
    resume()
    return
  }

  navigateToBook()
}

function returnToBook() {
  if (!isFormDirty()) {
    navigateToBook()
    return
  }

  pendingRouteNext = null
  leaveConfirmOpen.value = true
}

function cancelForm() {
  resumeNavigationAfterLeave()
}

function cancelLeaveConfirm() {
  if (isSaving.value) return
  leaveConfirmOpen.value = false
  pendingRouteNext = null
}

function confirmLeaveAbandon() {
  resumeNavigationAfterLeave()
}

function confirmLeaveSave() {
  if (isSaving.value) return
  formRef.value?.submit()
}

async function loadData() {
  if (!userId.value || !bookId.value) {
    book.value = null
    chapter.value = null
    loadError.value = 'Livre introuvable.'
    return
  }

  isLoading.value = true
  loadError.value = ''
  try {
    book.value = await getReadingBookWithCover(supabase, userId.value, bookId.value)
    if (!book.value) {
      loadError.value = 'Livre introuvable.'
      chapter.value = null
      return
    }

    if (isEditMode.value) {
      const chapters = await listSpoilChapters(supabase, userId.value, bookId.value)
      chapter.value = chapters.find((item) => item.id === chapterId.value) ?? null
      if (!chapter.value) loadError.value = 'Chapitre introuvable.'
    } else {
      chapter.value = null
    }
  } catch (err) {
    console.error(err)
    book.value = null
    chapter.value = null
    loadError.value = err.message || 'Impossible de charger le chapitre.'
  } finally {
    isLoading.value = false
  }
}

async function onSubmit(payload) {
  if (!userId.value || !bookId.value || isSaving.value) return

  isSaving.value = true
  saveError.value = ''
  try {
    if (isEditMode.value) {
      if (!chapterId.value) throw new Error('Chapitre introuvable.')
      await updateSpoilChapter(supabase, userId.value, chapterId.value, payload)
    } else {
      await createSpoilChapter(supabase, userId.value, bookId.value, payload)
    }

    resumeNavigationAfterLeave()
  } catch (err) {
    console.error(err)
    saveError.value =
      err.message ||
      (isEditMode.value ? 'Impossible de modifier le chapitre.' : 'Impossible d’ajouter le chapitre.')
  } finally {
    isSaving.value = false
  }
}

onBeforeRouteLeave((_to, _from, next) => {
  if (skipLeaveGuard.value) {
    next()
    return
  }

  if (!isFormDirty()) {
    next()
    return
  }

  pendingRouteNext = next
  leaveConfirmOpen.value = true
  next(false)
})

onMounted(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) userId.value = user.id
})

watch([userId, bookId, chapterId, isEditMode], () => {
  if (userId.value && bookId.value) loadData()
})
</script>

<template>
  <div class="spoil-chapter-page">
    <header class="spoil-chapter-page__header">
      <button type="button" class="spoil-chapter-page__back" @click="returnToBook">
        ← Retour à la fiche
      </button>
      <p v-if="book?.title" class="spoil-chapter-page__book">{{ book.title }}</p>
    </header>

    <div v-if="isLoading" class="spoil-chapter-page__status">Chargement…</div>
    <div v-else-if="loadError" class="spoil-chapter-page__error">{{ loadError }}</div>

    <div v-else class="spoil-chapter-page__inner">
      <p v-if="saveError" class="spoil-chapter-page__error spoil-chapter-page__error--inline">
        {{ saveError }}
      </p>
      <ReadingSpoilChapterForm
        ref="formRef"
        :title="isEditMode ? `Modifier le chapitre ${chapter?.chapter_number ?? ''}` : 'Ajouter un chapitre'"
        :chapter="isEditMode ? chapter : null"
        :disabled="isSaving"
        :submit-label="isEditMode ? 'Enregistrer' : 'Valider'"
        @submit="onSubmit"
        @cancel="cancelForm"
      />
    </div>

    <Teleport to="body">
      <div
        v-if="leaveConfirmOpen"
        class="spoil-leave-overlay"
        @click.self="cancelLeaveConfirm"
      >
        <div
          class="spoil-leave-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="spoil-leave-title"
          aria-describedby="spoil-leave-message"
        >
          <h2 id="spoil-leave-title" class="spoil-leave-title">Modifications non enregistrées</h2>
          <p id="spoil-leave-message" class="spoil-leave-message">
            Des modifications ont été faites mais pas enregistrées.
          </p>
          <div class="spoil-leave-actions">
            <button
              type="button"
              class="spoil-leave-abandon"
              :disabled="isSaving"
              @click="confirmLeaveAbandon"
            >
              Abandonner
            </button>
            <button
              type="button"
              class="spoil-leave-save"
              :disabled="isSaving"
              @click="confirmLeaveSave"
            >
              {{ isSaving ? 'Enregistrement…' : 'Enregistrer' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.spoil-chapter-page {
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
}

.spoil-chapter-page__header {
  max-width: none;
  margin: 0 0 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.spoil-chapter-page__back {
  align-self: flex-start;
  padding: 0.35rem 0;
  border: none;
  background: transparent;
  color: #6b4f7c;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
}

.spoil-chapter-page__back:hover {
  color: #3d2f4a;
}

.spoil-chapter-page__book {
  margin: 0;
  font-size: 0.88rem;
  color: #8b7a96;
  font-style: italic;
}

.spoil-chapter-page__inner {
  width: 100%;
  margin: 0;
}

.spoil-chapter-page__status {
  text-align: center;
  color: #6c757d;
  padding: 2rem 0;
}

.spoil-chapter-page__error {
  max-width: none;
  margin: 0;
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  background: rgba(220, 53, 69, 0.1);
  color: #b02a37;
  font-size: 0.9rem;
  text-align: center;
}

.spoil-chapter-page__error--inline {
  margin-bottom: 0.75rem;
}

.spoil-leave-overlay {
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

.spoil-leave-dialog {
  width: 100%;
  max-width: 24rem;
  padding: 1.25rem;
  border-radius: 16px;
  border: 1px solid rgba(173, 129, 190, 0.45);
  background: linear-gradient(180deg, #fffefb 0%, #faf6ff 100%);
  box-shadow: 0 18px 50px rgba(92, 62, 112, 0.18);
  box-sizing: border-box;
}

.spoil-leave-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: #3d2f4a;
}

.spoil-leave-message {
  margin: 0.65rem 0 1.1rem;
  font-size: 0.92rem;
  color: #6c757d;
  line-height: 1.45;
}

.spoil-leave-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: flex-end;
}

.spoil-leave-abandon,
.spoil-leave-save {
  padding: 0.7rem 1rem;
  border-radius: 12px;
  font-weight: 700;
  font-size: 0.92rem;
  cursor: pointer;
}

.spoil-leave-abandon {
  border: 1px solid rgba(173, 129, 190, 0.35);
  background: rgba(255, 255, 255, 0.85);
  color: #5a4a68;
}

.spoil-leave-save {
  border: none;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: #fff;
}

.spoil-leave-abandon:disabled,
.spoil-leave-save:disabled {
  opacity: 0.65;
  cursor: wait;
}
</style>
