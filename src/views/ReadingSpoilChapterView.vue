<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import ReadingSpoilChapterForm from '../components/ReadingSpoilChapterForm.vue'
import { supabase } from '../lib/supabase.js'
import { getReadingBookWithCover } from '../services/readingBooks.js'
import { createSpoilChapter, listSpoilChapters, updateSpoilChapter } from '../services/readingSpoilChapters.js'

const AUTO_SAVE_DELAY_MS = 2000

const route = useRoute()
const router = useRouter()

const userId = ref(null)
const book = ref(null)
const chapter = ref(null)
const formChapter = ref(null)
const formRef = ref(null)
const isLoading = ref(true)
const isSaving = ref(false)
const loadError = ref('')
const saveError = ref('')
const saveState = ref('idle')
const localChapterId = ref('')
const suppressLoad = ref(false)

let autoSaveTimer = null
let savedStateTimer = null
let pendingAutoSave = null

const bookId = computed(() => String(route.params.bookId ?? ''))
const chapterId = computed(() => String(route.params.chapterId ?? ''))
const isEditMode = computed(() => route.name === 'lecture-spoil-edition')
const effectiveChapterId = computed(() => localChapterId.value || chapterId.value)
const isPersistedChapter = computed(() => Boolean(effectiveChapterId.value))

const saveStatusLabel = computed(() => {
  if (saveError.value) return saveError.value
  if (saveState.value === 'saving') return 'Enregistrement…'
  if (saveState.value === 'pending') return 'Modification en cours…'
  if (saveState.value === 'saved') return 'Enregistré automatiquement'
  return ''
})

const pageTitle = computed(() => {
  if (!isPersistedChapter.value) return 'Ajouter un chapitre'
  const number =
    chapter.value?.chapter_number ?? formRef.value?.buildPayload?.()?.chapterNumber ?? ''
  return `Modifier le chapitre ${number}`
})

function navigateToBook() {
  router.push({ name: 'lecture-livre', params: { bookId: bookId.value } })
}

function clearAutoSaveTimer() {
  if (!autoSaveTimer) return
  clearTimeout(autoSaveTimer)
  autoSaveTimer = null
}

function clearSavedStateTimer() {
  if (!savedStateTimer) return
  clearTimeout(savedStateTimer)
  savedStateTimer = null
}

function markSavedState() {
  saveState.value = 'saved'
  clearSavedStateTimer()
  savedStateTimer = setTimeout(() => {
    if (saveState.value === 'saved') saveState.value = 'idle'
  }, 2200)
}

async function returnToBook() {
  await flushAutoSave()
  navigateToBook()
}

function scheduleAutoSave(payload) {
  pendingAutoSave = payload
  saveError.value = ''
  saveState.value = 'pending'
  clearAutoSaveTimer()
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null
    performAutoSave(payload)
  }, AUTO_SAVE_DELAY_MS)
}

async function performAutoSave(payload) {
  const nextPayload = payload ?? pendingAutoSave ?? formRef.value?.buildPayload?.()
  pendingAutoSave = null

  if (!nextPayload?.chapterNumber?.trim()) {
    if (saveState.value === 'pending') saveState.value = 'idle'
    return true
  }

  if (!userId.value || !bookId.value || isSaving.value) {
    if (isSaving.value && nextPayload) pendingAutoSave = nextPayload
    return false
  }

  isSaving.value = true
  saveError.value = ''
  saveState.value = 'saving'

  try {
    if (isPersistedChapter.value) {
      await updateSpoilChapter(
        supabase,
        userId.value,
        effectiveChapterId.value,
        nextPayload,
      )
      chapter.value = {
        ...(chapter.value ?? {}),
        id: effectiveChapterId.value,
        chapter_number: nextPayload.chapterNumber,
        characters_met: nextPayload.charactersMet,
        world_building: nextPayload.worldBuilding,
        scene: nextPayload.scene,
      }
    } else {
      const created = await createSpoilChapter(supabase, userId.value, bookId.value, nextPayload)
      localChapterId.value = created.id
      chapter.value = created
      suppressLoad.value = true
      await router.replace({
        name: 'lecture-spoil-edition',
        params: { bookId: bookId.value, chapterId: created.id },
      })
      suppressLoad.value = false
    }

    formRef.value?.markSaved?.()
    markSavedState()
    return true
  } catch (err) {
    console.error(err)
    saveState.value = 'error'
    saveError.value =
      err.message ||
      (isPersistedChapter.value
        ? 'Impossible de modifier le chapitre.'
        : 'Impossible d’ajouter le chapitre.')
    return false
  } finally {
    isSaving.value = false
    if (pendingAutoSave) {
      const queued = pendingAutoSave
      pendingAutoSave = null
      scheduleAutoSave(queued)
    }
  }
}

async function flushAutoSave() {
  clearAutoSaveTimer()
  const payload = pendingAutoSave ?? formRef.value?.buildPayload?.()
  pendingAutoSave = null
  if (!formRef.value?.isDirty) return true
  return performAutoSave(payload)
}

function onFormChange(payload) {
  scheduleAutoSave(payload)
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
      formChapter.value = chapter.value
      if (!chapter.value) loadError.value = 'Chapitre introuvable.'
    } else {
      chapter.value = null
      formChapter.value = null
      localChapterId.value = ''
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

function handleBeforeUnload(event) {
  if (!formRef.value?.isDirty) return
  flushAutoSave()
  event.preventDefault()
  event.returnValue = ''
}

onBeforeRouteLeave(async (_to, _from, next) => {
  const saved = await flushAutoSave()
  if (!saved && formRef.value?.isDirty) {
    next(false)
    return
  }
  next()
})

onMounted(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) userId.value = user.id
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onBeforeUnmount(() => {
  clearAutoSaveTimer()
  clearSavedStateTimer()
  window.removeEventListener('beforeunload', handleBeforeUnload)
  flushAutoSave()
})

watch([userId, bookId, chapterId, isEditMode], () => {
  if (suppressLoad.value) return
  if (localChapterId.value && chapterId.value === localChapterId.value && chapter.value) return
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
      <p
        v-if="saveStatusLabel"
        class="spoil-chapter-page__save-status"
        :class="{
          'spoil-chapter-page__save-status--error': Boolean(saveError),
          'spoil-chapter-page__save-status--saved': saveState === 'saved',
        }"
        role="status"
        aria-live="polite"
      >
        {{ saveStatusLabel }}
      </p>
      <ReadingSpoilChapterForm
        ref="formRef"
        auto-save
        :title="pageTitle"
        :chapter="formChapter"
        @change="onFormChange"
      />
    </div>
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

.spoil-chapter-page__save-status {
  margin: 0 0 0.75rem;
  padding: 0.55rem 0.75rem;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 700;
  text-align: center;
  color: #6b4f7c;
  background: rgba(213, 181, 234, 0.12);
  border: 1px solid rgba(173, 129, 190, 0.22);
}

.spoil-chapter-page__save-status--saved {
  color: #3d8b5f;
  background: rgba(149, 209, 170, 0.14);
  border-color: rgba(149, 209, 170, 0.35);
}

.spoil-chapter-page__save-status--error {
  color: #b02a37;
  background: rgba(220, 53, 69, 0.1);
  border-color: rgba(220, 53, 69, 0.22);
}

@media (prefers-color-scheme: dark) {
  .spoil-chapter-page__back {
    color: #d5b5ea;
  }

  .spoil-chapter-page__back:hover {
    color: #f0e8f8;
  }

  .spoil-chapter-page__book,
  .spoil-chapter-page__status {
    color: #adb5bd;
  }

  .spoil-chapter-page__error {
    background: rgba(220, 53, 69, 0.18);
    color: #ff8a95;
  }

  .spoil-chapter-page__save-status {
    color: #d5b5ea;
    background: rgba(213, 181, 234, 0.1);
    border-color: rgba(213, 181, 234, 0.18);
  }

  .spoil-chapter-page__save-status--saved {
    color: #95d1aa;
    background: rgba(149, 209, 170, 0.12);
    border-color: rgba(149, 209, 170, 0.28);
  }

  .spoil-chapter-page__save-status--error {
    color: #ff8a95;
    background: rgba(220, 53, 69, 0.18);
    border-color: rgba(220, 53, 69, 0.28);
  }
}
</style>
