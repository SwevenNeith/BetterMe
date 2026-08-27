<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { supabase } from '../lib/supabase.js'
import { APP_PAGE_IDS } from '../constants/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import {
  isPageVisible,
  loadPageVisibility,
  mergePageVisibility,
  PAGE_VISIBILITY_UPDATED_EVENT,
} from '../services/pageVisibility.js'
import { listNotes } from '../services/notes.js'
import NotesGraphView from './NotesGraphView.vue'

const props = defineProps({
  userId: {
    type: String,
    default: null,
  },
})

const router = useRouter()
const { pageTitle: notesPageTitle } = usePageDisplayLabel(APP_PAGE_IDS.NOTES)

const pageVisibility = ref(mergePageVisibility(null))
const isLoading = ref(false)
const loadError = ref('')
const notes = ref([])

const isNotesPageVisible = computed(() =>
  isPageVisible(APP_PAGE_IDS.NOTES, pageVisibility.value),
)

async function loadPageVisibilityState() {
  if (!props.userId) {
    pageVisibility.value = mergePageVisibility(null)
    return
  }
  try {
    pageVisibility.value = await loadPageVisibility(supabase, props.userId)
  } catch (err) {
    console.error('dashboard notes visibility:', err)
    pageVisibility.value = mergePageVisibility(null)
  }
}

async function loadNotes() {
  if (!props.userId || !isNotesPageVisible.value) {
    notes.value = []
    return
  }

  isLoading.value = true
  loadError.value = ''
  try {
    notes.value = await listNotes(supabase, props.userId)
  } catch (err) {
    console.error('dashboard notes graph:', err)
    loadError.value = err.message || 'Impossible de charger les notes.'
    notes.value = []
  } finally {
    isLoading.value = false
  }
}

async function reload() {
  await loadPageVisibilityState()
  await loadNotes()
}

function onSelectNote(noteId) {
  if (!noteId) return
  router.push({ name: 'notes-detail', params: { noteId } })
}

watch(
  () => props.userId,
  () => {
    reload()
  },
)

onMounted(() => {
  reload()
  window.addEventListener(PAGE_VISIBILITY_UPDATED_EVENT, reload)
})

onUnmounted(() => {
  window.removeEventListener(PAGE_VISIBILITY_UPDATED_EVENT, reload)
})
</script>

<template>
  <section
    v-if="isNotesPageVisible"
    class="dashboard-notes-graph"
    aria-labelledby="dashboard-notes-graph-title"
  >
    <div class="dashboard-notes-graph__header">
      <h2 id="dashboard-notes-graph-title" class="dashboard-notes-graph__title">Vue globale</h2>
      <RouterLink :to="{ name: 'notes-graph' }" class="dashboard-notes-graph__link">
        {{ notesPageTitle }}
      </RouterLink>
    </div>

    <div v-if="isLoading" class="dashboard-notes-graph__state">
      <span class="spinner" aria-hidden="true"></span>
      Chargement des notes…
    </div>

    <p v-else-if="loadError" class="dashboard-notes-graph__error">{{ loadError }}</p>

    <div v-else class="dashboard-notes-graph__body">
      <NotesGraphView
        compact
        :active="true"
        :notes="notes"
        @select-note="onSelectNote"
      />
    </div>
  </section>
</template>

<style scoped>
.dashboard-notes-graph {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  width: 100%;
  padding: 1rem 1.1rem;
  border-radius: 16px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-sizing: border-box;
}

.dashboard-notes-graph__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.dashboard-notes-graph__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: #ad81be;
}

.dashboard-notes-graph__link {
  font-size: 0.78rem;
  font-weight: 700;
  color: #8c6a9e;
  text-decoration: none;
  white-space: nowrap;
}

.dashboard-notes-graph__link:hover {
  text-decoration: underline;
}

.dashboard-notes-graph__state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 10rem;
  color: #6c757d;
  font-weight: 700;
  font-size: 0.9rem;
  text-align: center;
}

.dashboard-notes-graph__error {
  margin: 0;
  color: #c0392b;
  font-weight: 700;
  font-size: 0.88rem;
  text-align: center;
}

.dashboard-notes-graph__body {
  min-height: 260px;
  height: 280px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(213, 181, 234, 0.28);
}

.dashboard-notes-graph__body :deep(.notes-graph) {
  height: 100%;
  background: transparent;
}

.dashboard-notes-graph__body :deep(.notes-graph__viewport) {
  border-radius: 0;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(213, 181, 234, 0.35);
  border-top-color: #ad81be;
  border-radius: 50%;
  animation: dash-notes-spin 1s linear infinite;
}

@keyframes dash-notes-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-color-scheme: dark) {
  .dashboard-notes-graph {
    background: rgba(25, 20, 35, 0.65);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .dashboard-notes-graph__state {
    color: #adb5bd;
  }
}
</style>
