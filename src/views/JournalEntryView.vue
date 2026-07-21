<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import JournalEntryBook from '../components/JournalEntryBook.vue'
import JournalPromptPickerModal from '../components/JournalPromptPickerModal.vue'
import RichTextNoteEditor from '../components/RichTextNoteEditor.vue'
import { APP_PAGE_IDS } from '../constants/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import { supabase } from '../lib/supabase.js'
import {
  createJournalEntry,
  deleteJournalEntry,
  getJournalEntry,
  listJournalEntries,
  updateJournalEntry,
} from '../services/journalEntries.js'
import {
  getRandomPendingJournalPrompt,
  listJournalPromptsWithUsage,
} from '../services/journalPrompts.js'

usePageDisplayLabel(APP_PAGE_IDS.JOURNAL, undefined, { setDocumentTitle: true })

const route = useRoute()
const router = useRouter()

const userId = ref(null)
const entries = ref([])
const currentEntry = ref(null)
const isLoading = ref(true)
const isSaving = ref(false)
const isDeleting = ref(false)
const errorMessage = ref('')
const promptPickerOpen = ref(false)
const promptsLoading = ref(false)
const promptsError = ref('')
const prompts = ref([])
const deleteConfirmOpen = ref(false)
const isEditing = ref(false)

const form = reactive({
  title: '',
  contentHtml: '',
  promptId: null,
})

const entryId = computed(() => String(route.params.entryId ?? ''))
const isCreateMode = computed(() => route.name === 'journal-nouveau')
const currentEntryIndex = computed(() => entries.value.findIndex((entry) => entry.id === entryId.value))
const canGoPrevEntry = computed(() => currentEntryIndex.value >= 0 && currentEntryIndex.value < entries.value.length - 1)
const canGoNextEntry = computed(() => currentEntryIndex.value > 0)

function resetFormFromEntry(entry) {
  form.title = entry?.title ?? ''
  form.contentHtml = entry?.content_html ?? ''
  form.promptId = entry?.prompt_id ?? null
}

function returnToJournal() {
  router.push({ name: 'journal' })
}

function openEntryByIndex(index) {
  const target = entries.value[index]
  if (!target?.id) return
  router.push({ name: 'journal-entree', params: { entryId: target.id } })
}

function goPrevEntry() {
  if (!canGoPrevEntry.value) return
  openEntryByIndex(currentEntryIndex.value + 1)
}

function goNextEntry() {
  if (!canGoNextEntry.value) return
  openEntryByIndex(currentEntryIndex.value - 1)
}

async function loadEntries() {
  if (!userId.value) return
  entries.value = await listJournalEntries(supabase, userId.value)
}

async function loadCurrentEntry() {
  if (!userId.value) return

  isLoading.value = true
  errorMessage.value = ''

  try {
    await loadEntries()

    if (isCreateMode.value) {
      currentEntry.value = null
      isEditing.value = true
      resetFormFromEntry(null)
      return
    }

    currentEntry.value = await getJournalEntry(supabase, userId.value, entryId.value)
    if (!currentEntry.value) {
      errorMessage.value = 'Entrée introuvable.'
      return
    }

    resetFormFromEntry(currentEntry.value)
    isEditing.value = false
  } catch (err) {
    console.error(err)
    currentEntry.value = null
    entries.value = []
    errorMessage.value = err.message || 'Impossible de charger cette entrée.'
  } finally {
    isLoading.value = false
  }
}

async function ensurePromptsLoaded() {
  if (!userId.value) return
  promptsLoading.value = true
  promptsError.value = ''
  try {
    prompts.value = await listJournalPromptsWithUsage(supabase, userId.value)
  } catch (err) {
    console.error(err)
    prompts.value = []
    promptsError.value = err.message || 'Impossible de charger les prompts.'
  } finally {
    promptsLoading.value = false
  }
}

function applyPrompt(prompt) {
  form.title = prompt?.prompt_text ?? ''
  form.promptId = prompt?.id ?? null
  promptPickerOpen.value = false
}

async function pickRandomPrompt() {
  if (!userId.value || isSaving.value) return
  promptsError.value = ''
  try {
    const prompt = await getRandomPendingJournalPrompt(supabase, userId.value)
    if (!prompt) {
      promptsError.value = 'Aucune prompt disponible pour le moment.'
      return
    }
    applyPrompt(prompt)
    prompts.value = await listJournalPromptsWithUsage(supabase, userId.value)
  } catch (err) {
    console.error(err)
    promptsError.value = err.message || 'Impossible de choisir une prompt aléatoire.'
  }
}

async function openPromptPicker() {
  promptPickerOpen.value = true
  await ensurePromptsLoaded()
}

async function saveEntry() {
  if (!userId.value || isSaving.value) return

  isSaving.value = true
  errorMessage.value = ''
  try {
    if (isCreateMode.value) {
      const created = await createJournalEntry(supabase, userId.value, form)
      await loadEntries()
      router.replace({ name: 'journal-entree', params: { entryId: created.id } })
      return
    }

    currentEntry.value = await updateJournalEntry(supabase, userId.value, entryId.value, form)
    await loadEntries()
    isEditing.value = false
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Impossible d’enregistrer cette entrée.'
  } finally {
    isSaving.value = false
  }
}

function cancelEdit() {
  if (isCreateMode.value) {
    returnToJournal()
    return
  }
  resetFormFromEntry(currentEntry.value)
  errorMessage.value = ''
  isEditing.value = false
}

function startEdit() {
  if (!currentEntry.value) return
  resetFormFromEntry(currentEntry.value)
  errorMessage.value = ''
  isEditing.value = true
}

function askDeleteEntry() {
  if (isDeleting.value) return
  deleteConfirmOpen.value = true
}

function cancelDeleteEntry() {
  if (isDeleting.value) return
  deleteConfirmOpen.value = false
}

async function confirmDeleteEntry() {
  if (!userId.value || !currentEntry.value?.id || isDeleting.value) return
  const fallbackIndex =
    currentEntryIndex.value > 0 ? currentEntryIndex.value - 1 : currentEntryIndex.value + 1 < entries.value.length ? currentEntryIndex.value + 1 : -1

  isDeleting.value = true
  errorMessage.value = ''
  try {
    await deleteJournalEntry(supabase, userId.value, currentEntry.value.id)
    await loadEntries()
    deleteConfirmOpen.value = false

    if (fallbackIndex >= 0 && entries.value[fallbackIndex]?.id) {
      router.replace({ name: 'journal-entree', params: { entryId: entries.value[fallbackIndex].id } })
    } else {
      returnToJournal()
    }
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Impossible de supprimer cette entrée.'
    deleteConfirmOpen.value = false
  } finally {
    isDeleting.value = false
  }
}

onMounted(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) userId.value = user.id
})

watch([userId, entryId, isCreateMode], () => {
  if (userId.value) void loadCurrentEntry()
})
</script>

<template>
  <div class="journal-entry-page">
    <header class="journal-entry-page__header">
      <button type="button" class="journal-entry-page__back" @click="returnToJournal">
        ← Retour au journal
      </button>
    </header>

    <p v-if="promptsError && isEditing" class="journal-entry-page__inline-info">
      {{ promptsError }}
    </p>
    <p v-if="errorMessage" class="journal-entry-page__error">{{ errorMessage }}</p>
    <div v-if="isLoading" class="journal-entry-page__status">Chargement…</div>
    <div v-else-if="!isCreateMode && !currentEntry" class="journal-entry-page__status">
      Entrée introuvable.
    </div>

    <div v-else-if="isEditing" class="journal-editor">
      <div class="journal-editor__title-row">
        <input
          v-model="form.title"
          type="text"
          class="journal-editor__title-input"
          maxlength="200"
          placeholder="Titre"
        />
        <button type="button" class="journal-editor__primary journal-editor__prompt-btn" :disabled="isSaving" @click="pickRandomPrompt">
          Prompt aléatoire
        </button>
        <button type="button" class="journal-editor__primary journal-editor__prompt-btn" :disabled="isSaving" @click="openPromptPicker">
          Choisir ma prompt
        </button>
      </div>

      <div class="journal-editor__paper">
        <RichTextNoteEditor
          v-model="form.contentHtml"
          lined
          enable-notes
          fill-height
          placeholder="Écris ici comme dans ton journal…"
        />
      </div>

      <div class="journal-editor__footer">
        <button type="button" class="journal-editor__primary" :disabled="isSaving" @click="saveEntry">
          {{ isSaving ? 'Enregistrement…' : isCreateMode ? 'Créer l’entrée' : 'Enregistrer' }}
        </button>
        <button type="button" class="journal-editor__secondary" :disabled="isSaving" @click="cancelEdit">
          Annuler
        </button>
      </div>
    </div>

    <JournalEntryBook
      v-else
      :entry="currentEntry"
      :can-go-prev-entry="canGoPrevEntry"
      :can-go-next-entry="canGoNextEntry"
      :deleting="isDeleting"
      @prev-entry="goPrevEntry"
      @next-entry="goNextEntry"
      @edit="startEdit"
      @delete="askDeleteEntry"
    />

    <JournalPromptPickerModal
      :open="promptPickerOpen"
      :prompts="prompts"
      :is-loading="promptsLoading"
      :error="promptsError"
      @close="promptPickerOpen = false"
      @select="applyPrompt"
    />

    <Teleport to="body">
      <div
        v-if="deleteConfirmOpen && currentEntry"
        class="journal-delete-overlay"
        @click.self="cancelDeleteEntry"
      >
        <div
          class="journal-delete-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="journal-delete-title"
          aria-describedby="journal-delete-message"
        >
          <h2 id="journal-delete-title" class="journal-delete-dialog__title">Supprimer cette entrée ?</h2>
          <p id="journal-delete-message" class="journal-delete-dialog__message">
            « {{ currentEntry.title }} » sera définitivement supprimée.
          </p>
          <div class="journal-delete-dialog__actions">
            <button type="button" class="journal-editor__secondary" :disabled="isDeleting" @click="cancelDeleteEntry">
              Annuler
            </button>
            <button type="button" class="journal-delete-dialog__confirm" :disabled="isDeleting" @click="confirmDeleteEntry">
              {{ isDeleting ? 'Suppression…' : 'Supprimer' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.journal-entry-page {
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

.journal-entry-page__header {
  margin-bottom: 1rem;
}

.journal-entry-page__back {
  padding: 0.35rem 0;
  border: none;
  background: transparent;
  color: #6b4f7c;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
}

.journal-entry-page__status,
.journal-entry-page__error,
.journal-entry-page__inline-info {
  margin: 0 0 1rem;
  padding: 0.75rem 0.9rem;
  border-radius: 12px;
  text-align: center;
}

.journal-entry-page__status,
.journal-entry-page__inline-info {
  background: rgba(213, 181, 234, 0.1);
  color: #6c757d;
}

.journal-entry-page__error {
  background: rgba(220, 53, 69, 0.1);
  color: #b02a37;
}

.journal-editor {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 1rem;
  min-height: calc(100vh - 11rem);
}

.journal-editor__paper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 1rem;
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(250, 246, 255, 0.96));
  border: 1px solid rgba(213, 181, 234, 0.32);
  box-shadow: 0 18px 40px rgba(92, 62, 112, 0.12);
  overflow: hidden;
}

.journal-editor__title-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 0.7rem;
  align-items: center;
}

.journal-editor__title-input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.8rem 0.9rem;
  border-radius: 14px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.88);
  color: #2c3e50;
  font: inherit;
  font-weight: 700;
}

.journal-editor__footer {
  display: flex;
  gap: 0.7rem;
  flex-wrap: wrap;
}

.journal-editor__primary,
.journal-editor__secondary,
.journal-delete-dialog__confirm {
  padding: 0.78rem 1rem;
  border-radius: 12px;
  font-weight: 700;
  cursor: pointer;
}

.journal-editor__primary {
  border: none;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  box-shadow: 0 4px 12px rgba(173, 129, 190, 0.35);
}

.journal-editor__primary:hover:not(:disabled) {
  transform: translateY(-1px);
}

.journal-editor__primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.journal-editor__prompt-btn {
  white-space: nowrap;
  font-size: 0.9rem;
  padding: 0.7rem 0.9rem;
}

.journal-editor__secondary {
  border: 1px solid rgba(173, 129, 190, 0.35);
  background: rgba(255, 255, 255, 0.88);
  color: #5a4a68;
}

.journal-delete-overlay {
  position: fixed;
  inset: 0;
  z-index: 1400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(20, 24, 32, 0.5);
  backdrop-filter: blur(4px);
}

.journal-delete-dialog {
  width: min(100%, 24rem);
  padding: 1.25rem;
  border-radius: 16px;
  border: 1px solid rgba(173, 129, 190, 0.45);
  background: linear-gradient(180deg, #fffefb 0%, #faf6ff 100%);
  box-shadow: 0 18px 50px rgba(92, 62, 112, 0.18);
  box-sizing: border-box;
}

.journal-delete-dialog__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: #3d2f4a;
}

.journal-delete-dialog__message {
  margin: 0.65rem 0 1.1rem;
  font-size: 0.92rem;
  color: #6c757d;
  line-height: 1.45;
}

.journal-delete-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.journal-delete-dialog__confirm {
  border: none;
  background: #c0392b;
  color: white;
}

@media (max-width: 860px) {
  .journal-editor__title-row {
    grid-template-columns: 1fr;
  }
}
</style>
