<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { supabase } from '../lib/supabase.js'
import { DICTIONARY_WORD_TYPES } from '../constants/dictionaryWordTypes.js'
import { formDraftKey, useFormDraft } from '../composables/useFormDraft.js'
import { createDictionaryEntry, updateDictionaryEntry } from '../services/dictionaryEntries.js'
import { emptyDictionaryForm, entryToForm } from '../utils/dictionary.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  userId: { type: String, default: '' },
  initialWord: { type: String, default: '' },
  entry: { type: Object, default: null },
})

const emit = defineEmits(['close', 'saved'])

const formWordInputRef = ref(null)
const formError = ref('')
const isSaving = ref(false)
const dictForm = reactive(emptyDictionaryForm())

const isEditMode = computed(() => Boolean(props.entry?.id))
const modalTitle = computed(() =>
  isEditMode.value ? 'Modifier l’entrée' : 'Ajouter au dictionnaire',
)

const dictDraftKey = computed(() => {
  if (!props.userId || !props.open) return null
  return formDraftKey('dictionary-modal', props.userId, props.entry?.id || 'new')
})

const { clearDraft: clearDictDraft, restoreDraft: restoreDictDraft } = useFormDraft(dictDraftKey, {
  enabled: computed(() => Boolean(props.userId) && props.open && !isSaving.value),
  getState: () => ({ ...dictForm }),
  setState: (state) => {
    if (!state || typeof state !== 'object') return
    Object.assign(dictForm, emptyDictionaryForm(), state)
  },
})

function resetForm() {
  Object.assign(dictForm, emptyDictionaryForm())
  formError.value = ''
}

async function focusWordInput() {
  await nextTick()
  formWordInputRef.value?.focus()
  formWordInputRef.value?.select()
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    resetForm()
    if (props.entry?.id) {
      Object.assign(dictForm, entryToForm(props.entry))
    } else if (props.initialWord) {
      dictForm.word = props.initialWord.trim()
    }
    await focusWordInput()
    restoreDictDraft()
  },
)

function handleClose() {
  if (isSaving.value) return
  clearDictDraft()
  emit('close')
}

async function submitForm() {
  if (!props.userId || isSaving.value) return

  isSaving.value = true
  formError.value = ''
  try {
    const payload = {
      word: dictForm.word,
      definition: dictForm.definition,
      word_type: dictForm.word_type,
    }

    const saved = isEditMode.value
      ? await updateDictionaryEntry(supabase, props.userId, props.entry.id, payload)
      : await createDictionaryEntry(supabase, props.userId, payload)

    clearDictDraft()
    emit('saved', saved)
    emit('close')
  } catch (err) {
    console.error(err)
    formError.value = err.message || "Impossible d'enregistrer l'entrée."
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="dict-entry-modal"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="'dict-entry-modal-title'"
      @click.self="handleClose"
    >
      <form class="dict-entry-modal__card" @submit.prevent="submitForm">
        <header class="dict-entry-modal__head">
          <h2 id="dict-entry-modal-title" class="dict-entry-modal__title">{{ modalTitle }}</h2>
          <button type="button" class="dict-entry-modal__close" aria-label="Fermer" @click="handleClose">
            ×
          </button>
        </header>

        <div class="dict-entry-modal__grid">
          <label class="dict-entry-modal__field">
            <span>Mot</span>
            <input
              ref="formWordInputRef"
              v-model="dictForm.word"
              type="text"
              class="dict-entry-modal__input"
              maxlength="120"
              required
              autocomplete="off"
            />
          </label>

          <label class="dict-entry-modal__field">
            <span>Type</span>
            <select v-model="dictForm.word_type" class="dict-entry-modal__input dict-entry-modal__select" required>
              <option v-for="type in DICTIONARY_WORD_TYPES" :key="type.id" :value="type.id">
                {{ type.label }}
              </option>
            </select>
          </label>

          <label class="dict-entry-modal__field dict-entry-modal__field--full">
            <span>Définition</span>
            <textarea
              v-model="dictForm.definition"
              class="dict-entry-modal__input dict-entry-modal__textarea"
              rows="4"
              maxlength="4000"
              required
              placeholder="Sens, nuances, exemple d’emploi…"
            />
          </label>
        </div>

        <p v-if="formError" class="dict-entry-modal__error">{{ formError }}</p>

        <div class="dict-entry-modal__actions">
          <button type="button" class="dict-entry-modal__btn" :disabled="isSaving" @click="handleClose">
            Annuler
          </button>
          <button type="submit" class="dict-entry-modal__btn dict-entry-modal__btn--primary" :disabled="isSaving">
            {{ isSaving ? 'Enregistrement…' : isEditMode ? 'Enregistrer' : 'Ajouter' }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.dict-entry-modal {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(24, 16, 36, 0.45);
}

.dict-entry-modal__card {
  width: min(100%, 520px);
  max-height: calc(100vh - 2rem);
  overflow: auto;
  padding: 1.25rem 1.35rem 1.35rem;
  border-radius: 16px;
  background: #fff;
  border: 1px solid #e6ddf2;
  box-shadow: 0 18px 48px rgba(58, 34, 86, 0.18);
}

.dict-entry-modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.dict-entry-modal__title {
  margin: 0;
  font-size: 1.15rem;
  color: #3a2256;
}

.dict-entry-modal__close {
  border: none;
  background: transparent;
  color: #6b5a7d;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.15rem 0.35rem;
  border-radius: 8px;
}

.dict-entry-modal__close:hover {
  background: #f4f0fa;
  color: #3a2256;
}

.dict-entry-modal__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.85rem 0.75rem;
}

.dict-entry-modal__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: #5c4d6d;
}

.dict-entry-modal__field--full {
  grid-column: 1 / -1;
}

.dict-entry-modal__input {
  width: 100%;
  border: 1px solid #ddd2ea;
  border-radius: 10px;
  padding: 0.55rem 0.7rem;
  font: inherit;
  color: #2f203f;
  background: #fff;
}

.dict-entry-modal__input:focus {
  outline: 2px solid #c9a8e8;
  outline-offset: 1px;
}

.dict-entry-modal__textarea {
  resize: vertical;
  min-height: 6.5rem;
}

.dict-entry-modal__error {
  margin: 0.75rem 0 0;
  color: #b42318;
  font-size: 0.9rem;
}

.dict-entry-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.55rem;
  margin-top: 1rem;
}

.dict-entry-modal__btn {
  border: 1px solid #ddd2ea;
  background: #fff;
  color: #3a2256;
  border-radius: 10px;
  padding: 0.5rem 0.9rem;
  font: inherit;
  cursor: pointer;
}

.dict-entry-modal__btn--primary {
  background: #ad81be;
  border-color: #ad81be;
  color: #fff;
}

.dict-entry-modal__btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

@media (max-width: 560px) {
  .dict-entry-modal__grid {
    grid-template-columns: 1fr;
  }
}
</style>
