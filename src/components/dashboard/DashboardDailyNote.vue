<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { supabase } from '../lib/supabase.js'
import { APP_PAGE_IDS } from '../constants/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import {
  isPageVisible,
  loadPageVisibility,
  mergePageVisibility,
  PAGE_VISIBILITY_UPDATED_EVENT,
} from '../services/pageVisibility.js'
import { getTodayDailyNote, saveTodayDailyNote } from '../services/dailyNotes.js'

const AUTO_SAVE_DELAY_MS = 2000

const props = defineProps({
  userId: {
    type: String,
    default: null,
  },
})

const { pageTitle: notesPageTitle } = usePageDisplayLabel(APP_PAGE_IDS.NOTES)

const pageVisibility = ref(mergePageVisibility(null))
const isLoading = ref(false)
const loadError = ref('')
const draft = ref('')
const noteId = ref(null)
const isSaving = ref(false)
const saveError = ref('')
const saveState = ref('idle')

let autoSaveTimer = null
let savedStateTimer = null
let pendingContent = null
let loadGen = 0

const isNotesPageVisible = computed(() =>
  isPageVisible(APP_PAGE_IDS.NOTES, pageVisibility.value),
)

const saveStatusLabel = computed(() => {
  if (saveError.value) return saveError.value
  if (saveState.value === 'saving') return 'Enregistrement…'
  if (saveState.value === 'pending') return 'Modification en cours…'
  if (saveState.value === 'saved') return 'Enregistré'
  return ''
})

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

async function loadPageVisibilityState() {
  if (!props.userId) {
    pageVisibility.value = mergePageVisibility(null)
    return
  }
  try {
    pageVisibility.value = await loadPageVisibility(supabase, props.userId)
  } catch (err) {
    console.error('dashboard daily note visibility:', err)
    pageVisibility.value = mergePageVisibility(null)
  }
}

async function loadTodayNote() {
  const gen = ++loadGen
  if (!props.userId || !isNotesPageVisible.value) {
    draft.value = ''
    noteId.value = null
    return
  }

  isLoading.value = true
  loadError.value = ''
  try {
    const note = await getTodayDailyNote(supabase, props.userId)
    if (gen !== loadGen) return
    noteId.value = note?.id ?? null
    draft.value = note?.content_md ?? ''
  } catch (err) {
    console.error('dashboard daily note load:', err)
    if (gen === loadGen) {
      loadError.value = err.message || 'Impossible de charger la note du jour.'
      draft.value = ''
      noteId.value = null
    }
  } finally {
    if (gen === loadGen) isLoading.value = false
  }
}

async function reload() {
  clearAutoSaveTimer()
  pendingContent = null
  saveState.value = 'idle'
  saveError.value = ''
  await loadPageVisibilityState()
  await loadTodayNote()
}

function scheduleAutoSave(content) {
  pendingContent = content
  saveError.value = ''
  saveState.value = 'pending'
  clearAutoSaveTimer()
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null
    void performAutoSave(content)
  }, AUTO_SAVE_DELAY_MS)
}

async function performAutoSave(content) {
  const nextContent = content ?? pendingContent ?? draft.value
  pendingContent = null

  if (!props.userId || !isNotesPageVisible.value) {
    if (saveState.value === 'pending') saveState.value = 'idle'
    return
  }

  // Première création uniquement quand il y a du contenu
  if (!noteId.value && !String(nextContent).trim()) {
    if (saveState.value === 'pending') saveState.value = 'idle'
    return
  }

  if (isSaving.value) {
    pendingContent = nextContent
    return
  }

  isSaving.value = true
  saveError.value = ''
  saveState.value = 'saving'

  try {
    const saved = await saveTodayDailyNote(supabase, props.userId, nextContent, {
      noteId: noteId.value,
    })
    noteId.value = saved.id
    markSavedState()
  } catch (err) {
    console.error('dashboard daily note save:', err)
    saveError.value = err.message || 'Enregistrement impossible.'
    saveState.value = 'idle'
  } finally {
    isSaving.value = false
    if (pendingContent !== null) {
      const queued = pendingContent
      pendingContent = null
      scheduleAutoSave(queued)
    }
  }
}

async function flushAutoSave() {
  clearAutoSaveTimer()
  if (pendingContent !== null || saveState.value === 'pending') {
    await performAutoSave(pendingContent ?? draft.value)
  }
}

function onInput(event) {
  draft.value = event.target.value
  scheduleAutoSave(draft.value)
}

watch(
  () => props.userId,
  () => {
    void reload()
  },
)

onMounted(() => {
  void reload()
  window.addEventListener(PAGE_VISIBILITY_UPDATED_EVENT, reload)
})

onUnmounted(() => {
  window.removeEventListener(PAGE_VISIBILITY_UPDATED_EVENT, reload)
  clearAutoSaveTimer()
  clearSavedStateTimer()
  void flushAutoSave()
})
</script>

<template>
  <section
    v-if="isNotesPageVisible"
    class="dashboard-daily-note"
    aria-labelledby="dashboard-daily-note-title"
  >
    <div class="dashboard-daily-note__chrome">
      <h2 id="dashboard-daily-note-title" class="dashboard-daily-note__heading">Note du jour</h2>
      <span
        v-if="saveStatusLabel"
        class="dashboard-daily-note__status"
        :class="{ 'dashboard-daily-note__status--error': Boolean(saveError) }"
        aria-live="polite"
      >
        {{ saveStatusLabel }}
      </span>
    </div>

    <div v-if="isLoading" class="dashboard-daily-note__state">
      <span class="spinner" aria-hidden="true"></span>
      Chargement…
    </div>

    <p v-else-if="loadError" class="dashboard-daily-note__error">{{ loadError }}</p>

    <div v-else class="dashboard-daily-note__postit" :title="notesPageTitle">
      <textarea
        class="dashboard-daily-note__textarea"
        :value="draft"
        rows="8"
        maxlength="20000"
        placeholder="Écris ta note du jour…"
        aria-label="Note du jour"
        @input="onInput"
      />
    </div>
  </section>
</template>

<style scoped>
.dashboard-daily-note {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  width: 100%;
  box-sizing: border-box;
}

.dashboard-daily-note__chrome {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.65rem;
  padding: 0 0.15rem;
}

.dashboard-daily-note__heading {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: #ad81be;
}

.dashboard-daily-note__status {
  font-size: 0.72rem;
  font-weight: 700;
  color: #8c98a4;
  white-space: nowrap;
}

.dashboard-daily-note__status--error {
  color: #c0392b;
}

.dashboard-daily-note__state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 8rem;
  color: #6c757d;
  font-weight: 700;
  font-size: 0.9rem;
}

.dashboard-daily-note__error {
  margin: 0;
  color: #c0392b;
  font-weight: 700;
  font-size: 0.88rem;
  text-align: center;
}

.dashboard-daily-note__postit {
  position: relative;
  min-height: 11rem;
  padding: 1.1rem 1.05rem 1.2rem;
  border-radius: 4px 4px 10px 10px;
  border: 1px solid rgba(213, 181, 234, 0.45);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.55) 0%, transparent 28%),
    linear-gradient(155deg, #f6edfb 0%, #eddff8 42%, #e4d0f3 100%);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.65) inset,
    0 8px 24px rgba(173, 129, 190, 0.18);
  transform: rotate(-0.5deg);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.dashboard-daily-note__postit::before {
  content: '';
  position: absolute;
  top: 0.35rem;
  left: 22%;
  right: 22%;
  height: 0.45rem;
  border-radius: 2px;
  background: rgba(213, 181, 234, 0.45);
  box-shadow: 0 1px 2px rgba(173, 129, 190, 0.15);
}

.dashboard-daily-note__textarea {
  display: block;
  width: 100%;
  min-height: 9.5rem;
  margin: 0.45rem 0 0;
  padding: 0.35rem 0.2rem;
  border: none;
  resize: vertical;
  background: transparent;
  color: #3b2a4a;
  font-family: inherit;
  font-size: 0.95rem;
  line-height: 1.5;
  font-weight: 600;
  box-sizing: border-box;
}

.dashboard-daily-note__textarea::placeholder {
  color: rgba(109, 90, 126, 0.55);
}

.dashboard-daily-note__textarea:focus {
  outline: none;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(213, 181, 234, 0.35);
  border-top-color: #ad81be;
  border-radius: 50%;
  animation: dash-daily-spin 1s linear infinite;
}

@keyframes dash-daily-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-color-scheme: dark) {
  .dashboard-daily-note__status {
    color: #adb5bd;
  }

  .dashboard-daily-note__postit {
    border-color: rgba(213, 181, 234, 0.22);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, transparent 30%),
      linear-gradient(155deg, #2a2235 0%, #241c30 50%, #1e1728 100%);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.06) inset,
      0 8px 28px rgba(0, 0, 0, 0.35);
  }

  .dashboard-daily-note__postit::before {
    background: rgba(173, 129, 190, 0.35);
    box-shadow: none;
  }

  .dashboard-daily-note__textarea {
    color: #f0e8f8;
  }

  .dashboard-daily-note__textarea::placeholder {
    color: rgba(168, 149, 188, 0.65);
  }
}
</style>
