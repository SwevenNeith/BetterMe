<script setup>
import { computed, ref, watch } from 'vue'
import { supabase } from '../lib/supabase.js'
import { dictionaryWordTypeAbbr } from '../constants/dictionaryWordTypes.js'
import { createDictionaryAlias } from '../services/dictionaryAliases.js'
import { compareDictionaryWords } from '../utils/dictionary.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  userId: { type: String, default: '' },
  aliasText: { type: String, default: '' },
  entries: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'linked'])

const search = ref('')
const selectedEntryId = ref('')
const errorMessage = ref('')
const isSaving = ref(false)

const trimmedAlias = computed(() => String(props.aliasText ?? '').trim())

const filteredEntries = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('fr')
  const list = [...(props.entries ?? [])].sort((a, b) => compareDictionaryWords(a.word, b.word))
  if (!query) return list
  return list.filter((entry) => {
    const word = String(entry.word ?? '').toLocaleLowerCase('fr')
    const definition = String(entry.definition ?? '').toLocaleLowerCase('fr')
    return word.includes(query) || definition.includes(query)
  })
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    search.value = ''
    selectedEntryId.value = ''
    errorMessage.value = ''
  },
)

function handleClose() {
  if (isSaving.value) return
  emit('close')
}

function selectEntry(entryId) {
  selectedEntryId.value = entryId
}

async function submitLink() {
  if (!props.userId || !selectedEntryId.value || isSaving.value) return

  isSaving.value = true
  errorMessage.value = ''
  try {
    const alias = await createDictionaryAlias(
      supabase,
      props.userId,
      selectedEntryId.value,
      trimmedAlias.value,
    )
    emit('linked', alias)
    emit('close')
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Impossible de lier cette forme.'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="dict-link-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dict-link-modal-title"
      @click.self="handleClose"
    >
      <div class="dict-link-modal__card">
        <header class="dict-link-modal__head">
          <div>
            <h2 id="dict-link-modal-title" class="dict-link-modal__title">Lier à une définition</h2>
            <p class="dict-link-modal__subtitle">
              La forme « {{ trimmedAlias }} » pointera vers l’entrée choisie.
            </p>
          </div>
          <button type="button" class="dict-link-modal__close" aria-label="Fermer" @click="handleClose">
            ×
          </button>
        </header>

        <input
          v-model="search"
          type="search"
          class="dict-link-modal__search"
          placeholder="Rechercher un mot ou une définition…"
          autocomplete="off"
        />

        <div class="dict-link-modal__list" role="listbox" aria-label="Entrées du dictionnaire">
          <p v-if="!filteredEntries.length" class="dict-link-modal__empty">Aucune entrée trouvée.</p>
          <button
            v-for="entry in filteredEntries"
            :key="entry.id"
            type="button"
            class="dict-link-modal__item"
            :class="{ 'dict-link-modal__item--active': selectedEntryId === entry.id }"
            role="option"
            :aria-selected="selectedEntryId === entry.id"
            @click="selectEntry(entry.id)"
          >
            <span class="dict-link-modal__word">
              {{ entry.word }}
              <span v-if="dictionaryWordTypeAbbr(entry.word_type)" class="dict-link-modal__type">
                {{ dictionaryWordTypeAbbr(entry.word_type) }}
              </span>
            </span>
            <span class="dict-link-modal__def">{{ entry.definition }}</span>
          </button>
        </div>

        <p v-if="errorMessage" class="dict-link-modal__error">{{ errorMessage }}</p>

        <div class="dict-link-modal__actions">
          <button type="button" class="dict-link-modal__btn" :disabled="isSaving" @click="handleClose">
            Annuler
          </button>
          <button
            type="button"
            class="dict-link-modal__btn dict-link-modal__btn--primary"
            :disabled="!selectedEntryId || isSaving"
            @click="submitLink"
          >
            {{ isSaving ? 'Liaison…' : 'Lier la forme' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.dict-link-modal {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(24, 16, 36, 0.45);
}

.dict-link-modal__card {
  width: min(100%, 560px);
  max-height: calc(100vh - 2rem);
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1.25rem 1.35rem 1.35rem;
  border-radius: 16px;
  background: #fff;
  border: 1px solid #e6ddf2;
  box-shadow: 0 18px 48px rgba(58, 34, 86, 0.18);
}

.dict-link-modal__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.dict-link-modal__title {
  margin: 0;
  font-size: 1.15rem;
  color: #3a2256;
}

.dict-link-modal__subtitle {
  margin: 0.35rem 0 0;
  font-size: 0.9rem;
  color: #6b5a7d;
}

.dict-link-modal__close {
  border: none;
  background: transparent;
  color: #6b5a7d;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.15rem 0.35rem;
  border-radius: 8px;
}

.dict-link-modal__close:hover {
  background: #f4f0fa;
  color: #3a2256;
}

.dict-link-modal__search {
  width: 100%;
  border: 1px solid #ddd2ea;
  border-radius: 10px;
  padding: 0.55rem 0.7rem;
  font: inherit;
}

.dict-link-modal__list {
  min-height: 220px;
  max-height: min(50vh, 360px);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.dict-link-modal__empty {
  margin: 0;
  padding: 1rem 0.25rem;
  color: #6b5a7d;
  font-size: 0.92rem;
}

.dict-link-modal__item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
  width: 100%;
  text-align: left;
  border: 1px solid #ebe3f4;
  border-radius: 12px;
  background: #faf8fc;
  padding: 0.65rem 0.75rem;
  cursor: pointer;
  font: inherit;
}

.dict-link-modal__item:hover,
.dict-link-modal__item--active {
  border-color: #c9a8e8;
  background: #f4edf9;
}

.dict-link-modal__word {
  color: #3a2256;
  font-weight: 600;
}

.dict-link-modal__type {
  margin-left: 0.35rem;
  font-size: 0.78rem;
  font-weight: 500;
  color: #8a739f;
}

.dict-link-modal__def {
  color: #5c4d6d;
  font-size: 0.88rem;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.dict-link-modal__error {
  margin: 0;
  color: #b42318;
  font-size: 0.9rem;
}

.dict-link-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.55rem;
}

.dict-link-modal__btn {
  border: 1px solid #ddd2ea;
  background: #fff;
  color: #3a2256;
  border-radius: 10px;
  padding: 0.5rem 0.9rem;
  font: inherit;
  cursor: pointer;
}

.dict-link-modal__btn--primary {
  background: #ad81be;
  border-color: #ad81be;
  color: #fff;
}

.dict-link-modal__btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
</style>
