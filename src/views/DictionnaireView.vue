<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '../lib/supabase.js'
import { APP_PAGE_IDS } from '../constants/appPages.js'
import { DICTIONARY_WORD_TYPES, dictionaryWordTypeAbbr } from '../constants/dictionaryWordTypes.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import { formDraftKey, useFormDraft } from '../composables/useFormDraft.js'
import {
  createDictionaryEntry,
  deleteDictionaryEntry,
  listDictionaryEntries,
  updateDictionaryEntry,
} from '../services/dictionaryEntries.js'
import {
  DICTIONARY_INDEX_KEYS,
  dictionaryLetter,
  emptyDictionaryForm,
  entriesForLetter,
  entryToForm,
  firstLetterWithEntries,
  letterCounts,
  normalizeDictionaryLetter,
} from '../utils/dictionary.js'

const { pageTitle } = usePageDisplayLabel(APP_PAGE_IDS.DICTIONNAIRE, undefined, {
  setDocumentTitle: true,
})

const route = useRoute()
const router = useRouter()

const userId = ref(null)
const isLoading = ref(true)
const loadError = ref('')
const formError = ref('')
const isSaving = ref(false)
const isDeletingId = ref(null)
const entries = ref([])
const formOpen = ref(false)
const editingEntryId = ref(null)
const pendingDeleteEntry = ref(null)
const formCardRef = ref(null)
const formWordInputRef = ref(null)

const dictForm = reactive(emptyDictionaryForm())

const isEditMode = computed(() => Boolean(editingEntryId.value))

const dictDraftKey = computed(() => {
  if (!userId.value || !formOpen.value) return null
  return formDraftKey('dictionary-form', userId.value, editingEntryId.value || 'new')
})

const { clearDraft: clearDictDraft, restoreDraft: restoreDictDraft } = useFormDraft(dictDraftKey, {
  enabled: computed(() => Boolean(userId.value) && formOpen.value && !isSaving.value),
  getState: () => ({ ...dictForm }),
  setState: (state) => {
    if (!state || typeof state !== 'object') return
    Object.assign(dictForm, emptyDictionaryForm(), state)
  },
})

const selectedLetter = computed(() => normalizeDictionaryLetter(route.query.letter))

const counts = computed(() => letterCounts(entries.value))

const visibleEntries = computed(() => entriesForLetter(entries.value, selectedLetter.value))

const indexKeys = computed(() => {
  if ((counts.value['#'] ?? 0) > 0 || selectedLetter.value === '#') {
    return DICTIONARY_INDEX_KEYS
  }
  return DICTIONARY_INDEX_KEYS.filter((key) => key !== '#')
})

const subtitle = computed(() => {
  const total = entries.value.length
  if (!total) return 'Ton répertoire de mots, classé de A à Z.'
  const letter = selectedLetter.value
  const n = visibleEntries.value.length
  if (letter === '#') {
    return `${total} mot${total > 1 ? 's' : ''} · ${n} hors A–Z`
  }
  return `${total} mot${total > 1 ? 's' : ''} · ${n} en ${letter}`
})

function letterAria(letter) {
  const n = counts.value[letter] ?? 0
  const label = letter === '#' ? 'Autres' : letter
  return `${label}, ${n} mot${n > 1 ? 's' : ''}`
}

async function selectLetter(letter) {
  const key = normalizeDictionaryLetter(letter)
  if (key === selectedLetter.value) return
  await router.replace({
    name: route.name,
    query: { ...route.query, letter: key },
  })
}

async function loadEntries() {
  if (!userId.value) return
  isLoading.value = true
  loadError.value = ''
  try {
    entries.value = await listDictionaryEntries(supabase, userId.value)
    if (!route.query.letter) {
      await selectLetter(firstLetterWithEntries(entries.value))
    }
  } catch (err) {
    console.error(err)
    entries.value = []
    loadError.value = err.message || 'Impossible de charger le dictionnaire.'
  } finally {
    isLoading.value = false
  }
}

function resetForm() {
  Object.assign(dictForm, emptyDictionaryForm())
  formError.value = ''
}

async function openForm() {
  editingEntryId.value = null
  resetForm()
  formOpen.value = true
  await nextTick()
  restoreDictDraft()
  formWordInputRef.value?.focus()
  formCardRef.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

async function openEdit(entry) {
  if (!entry?.id) return
  editingEntryId.value = entry.id
  Object.assign(dictForm, entryToForm(entry))
  formError.value = ''
  formOpen.value = true
  await nextTick()
  restoreDictDraft()
  formWordInputRef.value?.focus()
  formCardRef.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

function closeForm() {
  clearDictDraft()
  formOpen.value = false
  editingEntryId.value = null
  resetForm()
}

async function submitForm() {
  if (!userId.value || isSaving.value) return

  isSaving.value = true
  formError.value = ''
  try {
    const payload = {
      word: dictForm.word,
      definition: dictForm.definition,
      word_type: dictForm.word_type,
    }

    let saved
    if (isEditMode.value) {
      saved = await updateDictionaryEntry(supabase, userId.value, editingEntryId.value, payload)
      entries.value = entries.value.map((item) => (item.id === saved.id ? saved : item))
    } else {
      saved = await createDictionaryEntry(supabase, userId.value, payload)
      entries.value = [...entries.value, saved]
    }

    clearDictDraft()
    closeForm()
    await selectLetter(dictionaryLetter(saved.word))
  } catch (err) {
    console.error(err)
    formError.value = err.message || "Impossible d'enregistrer l'entrée."
  } finally {
    isSaving.value = false
  }
}

function askDelete(entry) {
  pendingDeleteEntry.value = entry
}

function cancelDelete() {
  pendingDeleteEntry.value = null
}

async function confirmDelete() {
  const entry = pendingDeleteEntry.value
  if (!entry?.id || !userId.value || isDeletingId.value) return

  isDeletingId.value = entry.id
  try {
    await deleteDictionaryEntry(supabase, userId.value, entry.id)
    entries.value = entries.value.filter((item) => item.id !== entry.id)
    pendingDeleteEntry.value = null
    if (editingEntryId.value === entry.id) closeForm()
  } catch (err) {
    console.error(err)
    loadError.value = err.message || "Impossible de supprimer l'entrée."
  } finally {
    isDeletingId.value = null
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
  <div class="dict-page">
    <header class="dict-header">
      <h1 class="dict-title">{{ pageTitle }}</h1>
      <p class="dict-subtitle">{{ subtitle }}</p>
    </header>

    <div class="dict-toolbar">
      <button type="button" class="dict-add-btn" :disabled="formOpen && !isEditMode" @click="openForm">
        Ajouter un mot
      </button>
    </div>

    <form v-if="formOpen" ref="formCardRef" class="dict-form" @submit.prevent="submitForm">
      <h2 class="dict-form__title">{{ isEditMode ? 'Modifier l’entrée' : 'Nouvelle entrée' }}</h2>

      <div class="dict-form__grid">
        <label class="dict-form__field">
          <span>Mot</span>
          <input
            ref="formWordInputRef"
            v-model="dictForm.word"
            type="text"
            class="dict-form__input"
            maxlength="120"
            required
            autocomplete="off"
          />
        </label>

        <label class="dict-form__field">
          <span>Type</span>
          <select v-model="dictForm.word_type" class="dict-form__input dict-form__select" required>
            <option v-for="type in DICTIONARY_WORD_TYPES" :key="type.id" :value="type.id">
              {{ type.label }}
            </option>
          </select>
        </label>

        <label class="dict-form__field dict-form__field--full">
          <span>Définition</span>
          <textarea
            v-model="dictForm.definition"
            class="dict-form__input dict-form__textarea"
            rows="4"
            maxlength="4000"
            required
            placeholder="Sens, nuances, exemple d’emploi…"
          />
        </label>
      </div>

      <p v-if="formError" class="dict-form__error">{{ formError }}</p>

      <div class="dict-form__actions">
        <button type="submit" class="dict-submit" :disabled="isSaving">
          {{ isSaving ? 'Enregistrement…' : isEditMode ? 'Enregistrer' : 'Ajouter' }}
        </button>
        <button type="button" class="dict-cancel" :disabled="isSaving" @click="closeForm">Annuler</button>
      </div>
    </form>

    <p v-if="loadError" class="dict-error">{{ loadError }}</p>
    <p v-else-if="isLoading" class="dict-status">Chargement…</p>

    <section v-else class="dict-directory" aria-label="Répertoire alphabétique">
      <div class="dict-sheet">
        <p v-if="!visibleEntries.length" class="dict-sheet__empty">
          Aucun mot pour cette lettre. Ajoute-en un, ou choisis une autre lettre.
        </p>

        <article v-for="entry in visibleEntries" :key="entry.id" class="dict-entry">
          <header class="dict-entry__head">
            <h3 class="dict-entry__word">
              {{ entry.word }}
              <span v-if="dictionaryWordTypeAbbr(entry.word_type)" class="dict-entry__type">
                {{ dictionaryWordTypeAbbr(entry.word_type) }}
              </span>
            </h3>
            <div class="dict-entry__actions">
              <button type="button" class="dict-entry__btn" @click="openEdit(entry)">Modifier</button>
              <button type="button" class="dict-entry__btn dict-entry__btn--danger" @click="askDelete(entry)">
                Supprimer
              </button>
            </div>
          </header>
          <p class="dict-entry__def">{{ entry.definition }}</p>
        </article>
      </div>

      <nav class="dict-index" aria-label="Index alphabétique">
        <button
          v-for="letter in indexKeys"
          :key="letter"
          type="button"
          class="dict-index__letter"
          :class="{
            'dict-index__letter--active': selectedLetter === letter,
            'dict-index__letter--empty': (counts[letter] ?? 0) === 0,
          }"
          :aria-current="selectedLetter === letter ? 'true' : undefined"
          :aria-label="letterAria(letter)"
          @click="selectLetter(letter)"
        >
          {{ letter }}
        </button>
      </nav>
    </section>

    <div
      v-if="pendingDeleteEntry"
      class="dict-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dict-delete-title"
      @click.self="cancelDelete"
    >
      <div class="dict-modal">
        <h2 id="dict-delete-title" class="dict-modal__title">Supprimer cette entrée ?</h2>
        <p class="dict-modal__body">« {{ pendingDeleteEntry.word }} » sera définitivement supprimé.</p>
        <div class="dict-modal__actions">
          <button
            type="button"
            class="dict-submit dict-submit--danger"
            :disabled="Boolean(isDeletingId)"
            @click="confirmDelete"
          >
            {{ isDeletingId ? 'Suppression…' : 'Supprimer' }}
          </button>
          <button type="button" class="dict-cancel" :disabled="Boolean(isDeletingId)" @click="cancelDelete">
            Annuler
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dict-page {
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 2rem;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.dict-header {
  margin-bottom: 1rem;
  text-align: center;
}

.dict-title {
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  margin: 0;
}

.dict-subtitle {
  margin: 0.5rem 0 0;
  color: #6c757d;
  font-size: 1rem;
}

.dict-toolbar {
  display: flex;
  justify-content: center;
  margin-bottom: 1rem;
}

.dict-add-btn {
  padding: 0.75rem 1rem;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  font-weight: 800;
  font-size: 0.95rem;
  cursor: pointer;
}

.dict-add-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.dict-form {
  margin-bottom: 1.25rem;
  padding: 1.25rem;
  border-radius: 16px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(12px);
}

.dict-form__title {
  margin: 0 0 1rem;
  font-size: 1.15rem;
  font-weight: 800;
  color: #6b4f7c;
}

.dict-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}

.dict-form__field {
  display: grid;
  gap: 0.35rem;
  min-width: 0;
}

.dict-form__field--full {
  grid-column: 1 / -1;
}

.dict-form__field > span {
  font-size: 0.82rem;
  font-weight: 800;
  color: #6c757d;
}

.dict-form__input,
.dict-form__select,
.dict-form__textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0.6rem 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.9);
  color: #2c3e50;
  font: inherit;
}

.dict-form__textarea {
  resize: vertical;
  min-height: 5.5rem;
}

.dict-form__error {
  margin: 0.75rem 0 0;
  color: #b02a37;
  font-size: 0.9rem;
}

.dict-form__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 1rem;
}

.dict-submit,
.dict-cancel {
  padding: 0.65rem 1rem;
  border-radius: 10px;
  font-weight: 800;
  cursor: pointer;
  border: none;
}

.dict-submit {
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
}

.dict-submit--danger {
  background: linear-gradient(135deg, #e8a0a8, #c45c66);
}

.dict-cancel {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(213, 181, 234, 0.45);
  color: #6b4f7c;
}

.dict-error,
.dict-status {
  text-align: center;
  color: #6c757d;
}

.dict-error {
  color: #b02a37;
}

.dict-directory {
  flex: 1;
  display: flex;
  min-height: 28rem;
  border-radius: 16px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  overflow: hidden;
}

.dict-sheet {
  --dict-line: 28px;
  flex: 1;
  min-width: 0;
  padding: var(--dict-line) 1.25rem calc(var(--dict-line) * 2);
  overflow: auto;
  font-size: 1rem;
  line-height: var(--dict-line);
  background-color: transparent;
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(var(--dict-line) - 1px),
    rgba(213, 181, 234, 0.45) calc(var(--dict-line) - 1px),
    rgba(213, 181, 234, 0.45) var(--dict-line)
  );
  background-size: 100% var(--dict-line);
  background-attachment: local;
}

.dict-sheet__empty {
  margin: 0;
  padding: 0;
  color: #8b7a96;
  font-style: italic;
  font-size: 1rem;
  line-height: var(--dict-line);
}

.dict-entry {
  margin: 0 0 var(--dict-line);
  padding: 0;
}

.dict-entry:last-child {
  margin-bottom: 0;
}

.dict-entry__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: var(--dict-line);
  height: var(--dict-line);
}

.dict-entry__word {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: 1rem;
  font-weight: 800;
  color: #2c3e50;
  line-height: var(--dict-line);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dict-entry__type {
  margin-left: 0.35rem;
  font-weight: 600;
  font-style: italic;
  font-size: 0.92rem;
  color: #8b7a96;
}

.dict-entry__actions {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-shrink: 0;
  height: var(--dict-line);
}

.dict-entry__btn {
  padding: 0;
  border: none;
  background: transparent;
  color: #8b7a96;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}

.dict-entry__btn:hover {
  color: #6b4f7c;
  text-decoration: underline;
}

.dict-entry__btn--danger:hover {
  color: #b02a37;
}

.dict-entry__def {
  margin: 0;
  padding: 0;
  color: #6c757d;
  font-size: 1rem;
  line-height: var(--dict-line);
  white-space: pre-wrap;
}

.dict-index {
  flex: 0 0 2.55rem;
  display: flex;
  flex-direction: column;
  border-left: 2px solid rgba(173, 129, 190, 0.45);
  box-shadow: inset 3px 0 0 rgba(213, 181, 234, 0.35);
  background: rgba(213, 181, 234, 0.16);
  padding: 0.15rem 0;
}

.dict-index__letter {
  flex: 1 1 0;
  min-height: 0;
  border: none;
  background: transparent;
  color: #6b4f7c;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  line-height: 1;
}

.dict-index__letter--empty {
  color: rgba(139, 122, 150, 0.55);
}

.dict-index__letter--active {
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: #fff;
}

.dict-index__letter:hover:not(.dict-index__letter--active) {
  background: rgba(173, 129, 190, 0.22);
}

.dict-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(44, 36, 52, 0.45);
}

.dict-modal {
  width: min(100%, 24rem);
  padding: 1.25rem;
  border-radius: 16px;
  background: #fff;
  border: 1px solid rgba(213, 181, 234, 0.35);
}

.dict-modal__title {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
  font-weight: 800;
  color: #2c3e50;
}

.dict-modal__body {
  margin: 0 0 1rem;
  color: #6c757d;
}

.dict-modal__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}

@media (max-width: 720px) {
  .dict-form__grid {
    grid-template-columns: 1fr;
  }

  .dict-directory {
    flex-direction: column;
    min-height: 22rem;
  }

  .dict-sheet {
    --dict-line: 28px;
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .dict-index {
    flex: 0 0 auto;
    flex-direction: row;
    flex-wrap: wrap;
    border-left: none;
    border-top: 2px solid rgba(173, 129, 190, 0.45);
    box-shadow: inset 0 3px 0 rgba(213, 181, 234, 0.35);
    padding: 0.2rem;
  }

  .dict-index__letter {
    flex: 0 0 calc(100% / 9);
    min-height: 1.85rem;
    font-size: 0.78rem;
  }
}

@media (prefers-color-scheme: dark) {
  .dict-title {
    color: #e8dcf5;
  }

  .dict-subtitle,
  .dict-status {
    color: #b5a6c4;
  }

  .dict-form,
  .dict-directory {
    background: rgba(35, 30, 48, 0.72);
    border-color: rgba(213, 181, 234, 0.22);
  }

  .dict-sheet {
    background-image: repeating-linear-gradient(
      to bottom,
      transparent 0,
      transparent calc(var(--dict-line) - 1px),
      rgba(213, 181, 234, 0.28) calc(var(--dict-line) - 1px),
      rgba(213, 181, 234, 0.28) var(--dict-line)
    );
  }

  .dict-sheet__empty {
    color: #8b7a96;
  }

  .dict-entry__word {
    color: #efe8f6;
  }

  .dict-entry__type,
  .dict-entry__def {
    color: #b5a6c4;
  }

  .dict-index {
    background: rgba(61, 47, 74, 0.55);
    border-color: rgba(173, 129, 190, 0.4);
    box-shadow: inset 3px 0 0 rgba(213, 181, 234, 0.18);
  }

  .dict-index__letter {
    color: #e8dcf5;
  }

  .dict-index__letter--empty {
    color: rgba(139, 122, 150, 0.65);
  }

  .dict-index__letter--active {
    background: linear-gradient(135deg, #d5b5ea, #ad81be);
    color: #fff;
  }

  .dict-index__letter:hover:not(.dict-index__letter--active) {
    background: rgba(173, 129, 190, 0.28);
  }

  .dict-form__input,
  .dict-form__select,
  .dict-form__textarea,
  .dict-cancel {
    background: rgba(28, 24, 38, 0.9);
    color: #efe8f6;
    border-color: rgba(213, 181, 234, 0.28);
  }

  .dict-modal {
    background: #2a2436;
  }

  .dict-modal__title {
    color: #e8dcf5;
  }
}
</style>
