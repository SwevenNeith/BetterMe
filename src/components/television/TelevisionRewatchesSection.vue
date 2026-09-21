<script setup>
import { nextTick, ref, watch } from 'vue'
import { formatFrenchDate } from '../../utils/lecture/readingBookForm.js'

const props = defineProps({
  rewatches: {
    type: Array,
    default: () => [],
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  isStarting: {
    type: Boolean,
    default: false,
  },
  rewatchInProgress: {
    type: Boolean,
    default: false,
  },
  isCancelling: {
    type: Boolean,
    default: false,
  },
  canStartRewatch: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['start-rewatch', 'update-rewatch', 'cancel-rewatch'])

const editingKey = ref(null)
const draft = ref('')
const fieldInputRef = ref(null)

function editKey(rewatchId, field) {
  return `${rewatchId}:${field}`
}

function isEditing(rewatchId, field) {
  return editingKey.value === editKey(rewatchId, field)
}

function startEdit(rewatch, field) {
  if (props.disabled) return
  editingKey.value = editKey(rewatch.id, field)
  draft.value = rewatch[field === 'dateStart' ? 'date_start' : 'date_end'] ?? ''
}

function cancelEdit() {
  editingKey.value = null
  draft.value = ''
}

function commitEdit(rewatch, field) {
  const nextValue = String(draft.value ?? '').trim()
  const currentValue = rewatch[field === 'dateStart' ? 'date_start' : 'date_end'] ?? ''
  if (String(currentValue) === nextValue) {
    cancelEdit()
    return
  }
  emit('update-rewatch', {
    rewatchId: rewatch.id,
    field,
    value: nextValue,
  })
  cancelEdit()
}

function onFieldKeydown(event, rewatch, field) {
  if (event.key === 'Escape') {
    event.preventDefault()
    cancelEdit()
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    commitEdit(rewatch, field)
  }
}

watch(editingKey, async (key) => {
  if (!key) return
  await nextTick()
  fieldInputRef.value?.focus?.()
})
</script>

<template>
  <section class="tv-rewatches">
    <div v-if="rewatchInProgress" class="tv-rewatches__active" role="status">
      <div class="tv-rewatches__active-text">
        <strong>Re-regardage en cours</strong>
        <span>Renseigne les dates ci-dessus pour ce nouveau passage.</span>
      </div>
      <button
        type="button"
        class="tv-rewatches__cancel-btn"
        :disabled="disabled || isCancelling"
        @click="emit('cancel-rewatch')"
      >
        {{ isCancelling ? 'Annulation…' : 'Annuler le re-regardage' }}
      </button>
    </div>

    <div class="tv-rewatches__header">
      <h3 class="tv-rewatches__title">Historique des passages</h3>
      <button
        v-if="!rewatchInProgress && canStartRewatch"
        type="button"
        class="tv-rewatches__start-btn"
        :disabled="disabled || isStarting"
        @click="emit('start-rewatch')"
      >
        {{ isStarting ? 'Préparation…' : 'Re-regarder' }}
      </button>
    </div>

    <p v-if="!rewatchInProgress && !canStartRewatch" class="tv-rewatches__hint">
      Pour re-regarder, renseigne d’abord une <strong>date de début</strong> et une
      <strong>date de fin</strong> pour le passage actuel.
    </p>

    <p v-if="!rewatches.length" class="tv-rewatches__empty">
      Aucun passage archivé. Quand tu re-regarderas ce titre, les dates actuelles seront conservées
      ici.
    </p>

    <ul v-else class="tv-rewatches__list">
      <li v-for="(rewatch, index) in rewatches" :key="rewatch.id" class="tv-rewatches__item">
        <p class="tv-rewatches__item-label">Passage {{ index + 1 }}</p>
        <div class="tv-rewatches__dates">
          <div class="tv-rewatches__field">
            <span class="tv-rewatches__field-label">Début</span>
            <template v-if="isEditing(rewatch.id, 'dateStart')">
              <input
                ref="fieldInputRef"
                v-model="draft"
                type="date"
                class="tv-rewatches__input"
                :disabled="disabled"
                @keydown="onFieldKeydown($event, rewatch, 'dateStart')"
                @change="commitEdit(rewatch, 'dateStart')"
                @blur="commitEdit(rewatch, 'dateStart')"
              />
            </template>
            <button
              v-else
              type="button"
              class="tv-rewatches__value"
              :disabled="disabled"
              @click="startEdit(rewatch, 'dateStart')"
            >
              {{ formatFrenchDate(rewatch.date_start) }}
            </button>
          </div>
          <div class="tv-rewatches__field">
            <span class="tv-rewatches__field-label">Fin</span>
            <template v-if="isEditing(rewatch.id, 'dateEnd')">
              <input
                ref="fieldInputRef"
                v-model="draft"
                type="date"
                class="tv-rewatches__input"
                :disabled="disabled"
                @keydown="onFieldKeydown($event, rewatch, 'dateEnd')"
                @change="commitEdit(rewatch, 'dateEnd')"
                @blur="commitEdit(rewatch, 'dateEnd')"
              />
            </template>
            <button
              v-else
              type="button"
              class="tv-rewatches__value"
              :disabled="disabled"
              @click="startEdit(rewatch, 'dateEnd')"
            >
              {{ formatFrenchDate(rewatch.date_end) }}
            </button>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.tv-rewatches {
  margin-top: 0.85rem;
  padding-top: 0.85rem;
  border-top: 1px dashed rgba(173, 129, 190, 0.35);
}

.tv-rewatches__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 0.75rem;
  margin-bottom: 0.65rem;
}

.tv-rewatches__title {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 800;
  color: #5a4a68;
}

.tv-rewatches__start-btn {
  padding: 0.45rem 0.75rem;
  border: none;
  border-radius: 10px;
  background: rgba(173, 129, 190, 0.2);
  color: #6b4f7c;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}

.tv-rewatches__start-btn:hover:not(:disabled) {
  background: rgba(173, 129, 190, 0.32);
}

.tv-rewatches__start-btn:disabled,
.tv-rewatches__cancel-btn:disabled,
.tv-rewatches__value:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.tv-rewatches__active {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 0.75rem;
  margin-bottom: 0.75rem;
  padding: 0.6rem 0.7rem;
  border-radius: 12px;
  border: 1px solid rgba(173, 129, 190, 0.45);
  background: rgba(213, 181, 234, 0.16);
}

.tv-rewatches__active-text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.tv-rewatches__active-text strong {
  font-size: 0.86rem;
  font-weight: 800;
  color: #5a4a68;
}

.tv-rewatches__active-text span {
  font-size: 0.78rem;
  line-height: 1.35;
  color: #6c757d;
}

.tv-rewatches__cancel-btn {
  flex-shrink: 0;
  padding: 0.4rem 0.7rem;
  border: 1px solid rgba(173, 129, 190, 0.4);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.75);
  color: #6b4f7c;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}

.tv-rewatches__hint,
.tv-rewatches__empty {
  margin: 0 0 0.65rem;
  font-size: 0.8rem;
  line-height: 1.4;
  color: #6c757d;
}

.tv-rewatches__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.tv-rewatches__item {
  padding: 0.55rem 0.65rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.3);
  background: rgba(255, 255, 255, 0.55);
}

.tv-rewatches__item-label {
  margin: 0 0 0.4rem;
  font-size: 0.78rem;
  font-weight: 800;
  color: #6b4f7c;
}

.tv-rewatches__dates {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.tv-rewatches__field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.tv-rewatches__field-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: #8a6a9a;
}

.tv-rewatches__value,
.tv-rewatches__input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.35rem 0.45rem;
  border-radius: 8px;
  border: 1px solid rgba(213, 181, 234, 0.4);
  background: rgba(255, 255, 255, 0.9);
  font-size: 0.82rem;
  color: #2c3e50;
}

.tv-rewatches__value {
  text-align: left;
  cursor: pointer;
}

@media (prefers-color-scheme: dark) {
  .tv-rewatches__title,
  .tv-rewatches__active-text strong,
  .tv-rewatches__item-label {
    color: #e9d5f5;
  }
  .tv-rewatches__hint,
  .tv-rewatches__empty,
  .tv-rewatches__active-text span {
    color: #adb5bd;
  }
  .tv-rewatches__item,
  .tv-rewatches__active {
    background: rgba(35, 30, 48, 0.85);
  }
  .tv-rewatches__value,
  .tv-rewatches__input {
    background: rgba(30, 24, 42, 0.9);
    color: #f0e8f8;
  }
}
</style>
