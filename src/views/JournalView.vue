<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../lib/supabase.js'
import { APP_PAGE_IDS } from '../constants/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import { listJournalEntries } from '../services/journalEntries.js'
import { createJournalPrompt } from '../services/journalPrompts.js'

const { pageTitle } = usePageDisplayLabel(APP_PAGE_IDS.JOURNAL, undefined, { setDocumentTitle: true })

const router = useRouter()

const userId = ref(null)
const isLoading = ref(true)
const errorMessage = ref('')
const entries = ref([])
const promptFormOpen = ref(false)
const promptText = ref('')
const promptSaving = ref(false)
const promptError = ref('')

const subtitle = computed(() => {
  const count = entries.value.length
  if (!count) return 'Ton journal personnel, du plus récent au plus ancien.'
  return `${count} entrée${count > 1 ? 's' : ''} dans ton journal.`
})

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value))
}

async function loadEntries() {
  if (!userId.value) return
  isLoading.value = true
  errorMessage.value = ''
  try {
    entries.value = await listJournalEntries(supabase, userId.value)
  } catch (err) {
    console.error(err)
    entries.value = []
    errorMessage.value = err.message || 'Impossible de charger le journal.'
  } finally {
    isLoading.value = false
  }
}

function openNewEntry() {
  router.push({ name: 'journal-nouveau' })
}

function openEntry(entry) {
  if (!entry?.id) return
  router.push({ name: 'journal-entree', params: { entryId: entry.id } })
}

function togglePromptForm() {
  promptFormOpen.value = !promptFormOpen.value
  promptText.value = ''
  promptError.value = ''
}

async function submitPrompt() {
  if (!userId.value || promptSaving.value) return
  const text = promptText.value.trim()
  if (!text) return

  promptSaving.value = true
  promptError.value = ''
  try {
    await createJournalPrompt(supabase, userId.value, text)
    promptText.value = ''
    promptFormOpen.value = false
  } catch (err) {
    console.error(err)
    promptError.value = err.message || "Impossible d'ajouter la prompt."
  } finally {
    promptSaving.value = false
  }
}

onMounted(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) userId.value = user.id
})

watch(userId, (id) => {
  if (id) void loadEntries()
})
</script>

<template>
  <div class="journal-page">
    <header class="journal-page__header">
      <h1 class="journal-page__title">{{ pageTitle }}</h1>
      <p class="journal-page__subtitle">{{ subtitle }}</p>
    </header>

    <div class="journal-page__actions">
      <button type="button" class="journal-page__add" @click="openNewEntry">
        Ajouter une nouvelle entrée
      </button>
      <button type="button" class="journal-page__add-prompt" @click="togglePromptForm">
        {{ promptFormOpen ? 'Annuler' : 'Ajouter une prompt' }}
      </button>
    </div>

    <form v-if="promptFormOpen" class="journal-page__prompt-form" @submit.prevent="submitPrompt">
      <input
        v-model="promptText"
        type="text"
        class="journal-page__prompt-input"
        maxlength="500"
        placeholder="Écris ta prompt ici…"
        :disabled="promptSaving"
      />
      <button type="submit" class="journal-page__prompt-submit" :disabled="promptSaving || !promptText.trim()">
        {{ promptSaving ? 'Ajout…' : 'Ajouter' }}
      </button>
      <p v-if="promptError" class="journal-page__prompt-error">{{ promptError }}</p>
    </form>

    <section class="journal-page__card">
      <p v-if="errorMessage" class="journal-page__error">{{ errorMessage }}</p>
      <p v-else-if="isLoading" class="journal-page__status">Chargement…</p>
      <p v-else-if="!entries.length" class="journal-page__status">Aucune entrée pour le moment.</p>

      <div v-else class="journal-page__table-wrap">
        <table class="journal-page__table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Titre</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="entry in entries"
              :key="entry.id"
              class="journal-page__row"
              tabindex="0"
              @click="openEntry(entry)"
              @keydown.enter.prevent="openEntry(entry)"
              @keydown.space.prevent="openEntry(entry)"
            >
              <td>{{ formatDate(entry.created_at) }}</td>
              <td>{{ entry.title }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.journal-page {
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
}

.journal-page__header {
  margin-bottom: 1rem;
  text-align: center;
}

.journal-page__title {
  margin: 0;
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
}

.journal-page__subtitle {
  margin: 0.45rem 0 0;
  color: #6c757d;
  font-size: 1rem;
}

.journal-page__actions {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-bottom: 1.25rem;
}

.journal-page__add {
  padding: 0.75rem 1rem;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  font-weight: 800;
  font-size: 0.95rem;
  cursor: pointer;
}

.journal-page__add-prompt {
  padding: 0.75rem 1rem;
  border-radius: 12px;
  border: 1px solid rgba(173, 129, 190, 0.5);
  background: rgba(255, 255, 255, 0.85);
  color: #6b4f7c;
  font-weight: 800;
  font-size: 0.95rem;
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease;
}

.journal-page__add-prompt:hover {
  transform: translateY(-1px);
  background: rgba(213, 181, 234, 0.28);
}

.journal-page__prompt-form {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.25rem;
}

.journal-page__prompt-input {
  flex: 1 1 16rem;
  min-width: 0;
  padding: 0.7rem 0.85rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.88);
  color: #2c3e50;
  font: inherit;
  font-weight: 600;
}

.journal-page__prompt-input:focus {
  outline: 2px solid rgba(173, 129, 190, 0.45);
  outline-offset: 1px;
}

.journal-page__prompt-submit {
  padding: 0.7rem 1rem;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  font-weight: 800;
  cursor: pointer;
}

.journal-page__prompt-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.journal-page__prompt-error {
  width: 100%;
  margin: 0;
  font-size: 0.85rem;
  color: #b02a37;
  text-align: center;
}

.journal-page__card {
  width: 100%;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 16px;
  padding: 1.25rem;
  box-sizing: border-box;
}

.journal-page__error,
.journal-page__status {
  margin: 0;
  padding: 1rem 0;
  text-align: center;
  color: #6c757d;
}

.journal-page__error {
  color: #b02a37;
}

.journal-page__table-wrap {
  overflow: auto;
}

.journal-page__table {
  width: 100%;
  border-collapse: collapse;
}

.journal-page__table th,
.journal-page__table td {
  padding: 0.9rem 0.8rem;
  border-bottom: 1px solid rgba(213, 181, 234, 0.24);
  text-align: left;
}

.journal-page__table th {
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8b7a96;
}

.journal-page__row {
  cursor: pointer;
  transition: background 0.15s ease;
}

.journal-page__row:hover,
.journal-page__row:focus-visible {
  background: rgba(213, 181, 234, 0.1);
  outline: none;
}

.journal-page__row td:first-child {
  white-space: nowrap;
  color: #6c757d;
  width: 14rem;
}

.journal-page__row td:last-child {
  font-weight: 700;
  color: #2c3e50;
}
</style>
