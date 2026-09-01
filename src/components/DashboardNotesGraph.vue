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
import {
  DASHBOARD_VISIBILITY_UPDATED_EVENT,
  getDashboardNotesGraphVaultId,
  loadDashboardVisibility,
  mergeDashboardVisibility,
  patchDashboardNotesGraphVaultId,
  saveDashboardVisibility,
} from '../services/dashboardVisibility.js'
import { listNotes } from '../services/notes.js'
import { listNoteVaults } from '../services/noteVaults.js'
import { normalizeVaultIcon, vaultThemeStyle } from '../constants/noteVaults.js'
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
const dashboardVisibility = ref(mergeDashboardVisibility(null))
const isLoading = ref(false)
const loadError = ref('')
const notes = ref([])
const vaults = ref([])
const selectedVaultId = ref('')
const isSavingScope = ref(false)

const isNotesPageVisible = computed(() =>
  isPageVisible(APP_PAGE_IDS.NOTES, pageVisibility.value),
)

const activeVault = computed(() => {
  if (!selectedVaultId.value) return null
  return vaults.value.find((vault) => vault.id === selectedVaultId.value) ?? null
})

const scopedNotes = computed(() => {
  const vaultId = selectedVaultId.value || null
  return notes.value.filter((note) => (note.vault_id ?? null) === vaultId)
})

const graphThemeStyle = computed(() =>
  activeVault.value ? vaultThemeStyle(activeVault.value) : null,
)

const graphLinkTarget = computed(() => {
  if (selectedVaultId.value) {
    return {
      name: 'notes-vault-graph',
      params: { vaultId: selectedVaultId.value },
    }
  }
  return { name: 'notes-graph' }
})

const scopeLabel = computed(() => {
  if (!selectedVaultId.value) return 'Hors coffre'
  const vault = activeVault.value
  if (!vault) return 'Coffre'
  return `${normalizeVaultIcon(vault.icon)} ${vault.name}`
})

function syncSelectedVaultFromSettings({ persistInvalid = false } = {}) {
  const savedVaultId = getDashboardNotesGraphVaultId(dashboardVisibility.value)
  if (!savedVaultId) {
    selectedVaultId.value = ''
    return
  }
  if (!vaults.value.length) {
    selectedVaultId.value = savedVaultId
    return
  }
  if (vaults.value.some((vault) => vault.id === savedVaultId)) {
    selectedVaultId.value = savedVaultId
    return
  }
  selectedVaultId.value = ''
  if (persistInvalid) {
    void persistScopeSelection('')
  }
}

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

async function loadDashboardSettings() {
  if (!props.userId) {
    dashboardVisibility.value = mergeDashboardVisibility(null)
    selectedVaultId.value = ''
    return
  }
  try {
    dashboardVisibility.value = await loadDashboardVisibility(supabase, props.userId)
  } catch (err) {
    console.error('dashboard notes graph settings:', err)
    dashboardVisibility.value = mergeDashboardVisibility(null)
    selectedVaultId.value = ''
  }
}

async function loadVaults() {
  if (!props.userId) {
    vaults.value = []
    return
  }
  try {
    vaults.value = await listNoteVaults(supabase, props.userId)
  } catch (err) {
    console.error('dashboard notes vaults:', err)
    vaults.value = []
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

async function persistScopeSelection(vaultId) {
  if (!props.userId || isSavingScope.value) return
  isSavingScope.value = true
  try {
    const next = patchDashboardNotesGraphVaultId(dashboardVisibility.value, vaultId || null)
    await saveDashboardVisibility(supabase, props.userId, next)
    dashboardVisibility.value = next
  } catch (err) {
    console.error('dashboard notes graph scope:', err)
  } finally {
    isSavingScope.value = false
  }
}

async function onScopeChange() {
  await persistScopeSelection(selectedVaultId.value)
}

async function reload() {
  await Promise.all([loadPageVisibilityState(), loadDashboardSettings(), loadVaults()])
  syncSelectedVaultFromSettings({ persistInvalid: true })
  await loadNotes()
}

function onSelectNote(noteId) {
  if (!noteId) return
  const note = notes.value.find((item) => item.id === noteId)
  const vaultId = note?.vault_id ?? null
  if (vaultId) {
    router.push({ name: 'notes-vault-detail', params: { vaultId, noteId } })
    return
  }
  router.push({ name: 'notes-detail', params: { noteId } })
}

function onDashboardVisibilityUpdated() {
  void loadDashboardSettings().then(() => {
    syncSelectedVaultFromSettings({ persistInvalid: true })
  })
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
  window.addEventListener(DASHBOARD_VISIBILITY_UPDATED_EVENT, onDashboardVisibilityUpdated)
})

onUnmounted(() => {
  window.removeEventListener(PAGE_VISIBILITY_UPDATED_EVENT, reload)
  window.removeEventListener(DASHBOARD_VISIBILITY_UPDATED_EVENT, onDashboardVisibilityUpdated)
})
</script>

<template>
  <section
    v-if="isNotesPageVisible"
    class="dashboard-notes-graph"
    aria-labelledby="dashboard-notes-graph-title"
  >
    <div class="dashboard-notes-graph__header">
      <div class="dashboard-notes-graph__title-row">
        <h2 id="dashboard-notes-graph-title" class="dashboard-notes-graph__title">Vue globale</h2>
        <RouterLink :to="graphLinkTarget" class="dashboard-notes-graph__link">
          {{ notesPageTitle }}
        </RouterLink>
      </div>

      <label class="dashboard-notes-graph__scope">
        <span class="dashboard-notes-graph__scope-label">Périmètre</span>
        <select
          v-model="selectedVaultId"
          class="dashboard-notes-graph__scope-select"
          :disabled="isSavingScope"
          aria-label="Choisir le périmètre de la vue globale"
          @change="onScopeChange"
        >
          <option value="">Hors coffre (général)</option>
          <option v-for="vault in vaults" :key="vault.id" :value="vault.id">
            {{ normalizeVaultIcon(vault.icon) }} {{ vault.name }}
          </option>
        </select>
      </label>

      <p class="dashboard-notes-graph__scope-meta">{{ scopeLabel }}</p>
    </div>

    <div v-if="isLoading" class="dashboard-notes-graph__state">
      <span class="spinner" aria-hidden="true"></span>
      Chargement des notes…
    </div>

    <p v-else-if="loadError" class="dashboard-notes-graph__error">{{ loadError }}</p>

    <div v-else class="dashboard-notes-graph__body" :style="graphThemeStyle || undefined">
      <NotesGraphView
        compact
        :active="true"
        :notes="scopedNotes"
        :theme-style="graphThemeStyle"
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
  flex-direction: column;
  gap: 0.45rem;
}

.dashboard-notes-graph__title-row {
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

.dashboard-notes-graph__scope {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}

.dashboard-notes-graph__scope-label {
  flex-shrink: 0;
  font-size: 0.72rem;
  font-weight: 700;
  color: #6d5a7e;
}

.dashboard-notes-graph__scope-select {
  flex: 1;
  min-width: 0;
  padding: 0.32rem 0.45rem;
  border-radius: 8px;
  border: 1px solid rgba(173, 129, 190, 0.35);
  background: rgba(255, 255, 255, 0.92);
  color: #3b2a4a;
  font-size: 0.78rem;
  font-weight: 650;
}

.dashboard-notes-graph__scope-meta {
  margin: 0;
  font-size: 0.68rem;
  color: #8b7a96;
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

  .dashboard-notes-graph__scope-label,
  .dashboard-notes-graph__scope-meta {
    color: #c5b8d2;
  }

  .dashboard-notes-graph__scope-select {
    background: rgba(35, 30, 48, 0.95);
    border-color: rgba(173, 129, 190, 0.35);
    color: #f0e8f8;
  }

  .dashboard-notes-graph__state {
    color: #adb5bd;
  }
}
</style>
