<script setup>
import { nextTick, ref, watch } from 'vue'
import { formatFrenchDate } from '../utils/readingBookForm.js'

const props = defineProps({
  rereadings: {
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
  rereadingInProgress: {
    type: Boolean,
    default: false,
  },
  isCancelling: {
    type: Boolean,
    default: false,
  },
  canStartRereading: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['start-rereading', 'update-rereading', 'cancel-rereading'])

const editingKey = ref(null)
const draft = ref('')
const fieldInputRef = ref(null)

function editKey(rereadingId, field) {
  return `${rereadingId}:${field}`
}

function isEditing(rereadingId, field) {
  return editingKey.value === editKey(rereadingId, field)
}

function startEdit(rereading, field) {
  if (props.disabled) return
  editingKey.value = editKey(rereading.id, field)
  draft.value = rereading[field === 'dateStart' ? 'date_start' : 'date_end'] ?? ''
}

function cancelEdit() {
  editingKey.value = null
  draft.value = ''
}

function commitEdit(rereading, field) {
  const nextValue = String(draft.value ?? '').trim()
  const currentValue = rereading[field === 'dateStart' ? 'date_start' : 'date_end'] ?? ''
  if (String(currentValue) === nextValue) {
    cancelEdit()
    return
  }
  emit('update-rereading', {
    rereadingId: rereading.id,
    field,
    value: nextValue,
  })
  cancelEdit()
}

function onFieldKeydown(event, rereading, field) {
  if (event.key === 'Escape') {
    event.preventDefault()
    cancelEdit()
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    commitEdit(rereading, field)
  }
}

watch(editingKey, async (key) => {
  if (!key) return
  await nextTick()
  fieldInputRef.value?.focus?.()
})
</script>

<template>
  <section class="reading-rereadings">
    <div
      v-if="rereadingInProgress"
      class="reading-rereadings__active"
      role="status"
    >
      <div class="reading-rereadings__active-text">
        <strong>Relecture en cours</strong>
        <span>Renseigne les dates ci-dessus pour cette nouvelle lecture.</span>
      </div>
      <button
        type="button"
        class="reading-rereadings__cancel-btn"
        :disabled="disabled || isCancelling"
        @click="emit('cancel-rereading')"
      >
        {{ isCancelling ? 'Annulation…' : 'Annuler la relecture' }}
      </button>
    </div>

    <div class="reading-rereadings__header">
      <h3 class="reading-rereadings__title">Historique des lectures</h3>
      <button
        v-if="!rereadingInProgress && canStartRereading"
        type="button"
        class="reading-rereadings__start-btn"
        :disabled="disabled || isStarting"
        @click="emit('start-rereading')"
      >
        {{ isStarting ? 'Préparation…' : 'Relire ce livre' }}
      </button>
    </div>

    <p v-if="!rereadingInProgress && !canStartRereading" class="reading-rereadings__hint">
      Pour relire ce livre, renseigne d’abord une <strong>date de début</strong> et une
      <strong>date de fin</strong> pour la lecture en cours.
    </p>

    <p v-if="!rereadings.length" class="reading-rereadings__empty">
      Aucune relecture enregistrée pour l’instant. Quand tu reliras ce livre, les dates de ta
      lecture actuelle seront conservées ici.
    </p>

    <ul v-else class="reading-rereadings__list">
      <li
        v-for="(rereading, index) in rereadings"
        :key="rereading.id"
        class="reading-rereadings__item"
      >
        <p class="reading-rereadings__item-label">Lecture {{ index + 1 }}</p>
        <div class="reading-rereadings__dates">
          <div class="reading-rereadings__field">
            <span class="reading-rereadings__field-label">Début</span>
            <template v-if="isEditing(rereading.id, 'dateStart')">
              <input
                ref="fieldInputRef"
                v-model="draft"
                type="date"
                class="reading-rereadings__input"
                :disabled="disabled"
                @keydown="onFieldKeydown($event, rereading, 'dateStart')"
                @change="commitEdit(rereading, 'dateStart')"
                @blur="commitEdit(rereading, 'dateStart')"
              />
            </template>
            <button
              v-else
              type="button"
              class="reading-rereadings__value"
              :disabled="disabled"
              @click="startEdit(rereading, 'dateStart')"
            >
              {{ formatFrenchDate(rereading.date_start) }}
            </button>
          </div>
          <div class="reading-rereadings__field">
            <span class="reading-rereadings__field-label">Fin</span>
            <template v-if="isEditing(rereading.id, 'dateEnd')">
              <input
                ref="fieldInputRef"
                v-model="draft"
                type="date"
                class="reading-rereadings__input"
                :disabled="disabled"
                @keydown="onFieldKeydown($event, rereading, 'dateEnd')"
                @change="commitEdit(rereading, 'dateEnd')"
                @blur="commitEdit(rereading, 'dateEnd')"
              />
            </template>
            <button
              v-else
              type="button"
              class="reading-rereadings__value"
              :disabled="disabled"
              @click="startEdit(rereading, 'dateEnd')"
            >
              {{ formatFrenchDate(rereading.date_end) }}
            </button>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.reading-rereadings {
  margin-top: 0.85rem;
  padding-top: 0.85rem;
  border-top: 1px dashed rgba(173, 129, 190, 0.35);
}

.reading-rereadings__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 0.75rem;
  margin-bottom: 0.65rem;
}

.reading-rereadings__title {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 800;
  color: #5a4a68;
}

.reading-rereadings__start-btn {
  padding: 0.45rem 0.75rem;
  border: none;
  border-radius: 10px;
  background: rgba(173, 129, 190, 0.2);
  color: #6b4f7c;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}

.reading-rereadings__start-btn:hover:not(:disabled) {
  background: rgba(173, 129, 190, 0.32);
}

.reading-rereadings__start-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.reading-rereadings__active {
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

.reading-rereadings__active-text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.reading-rereadings__active-text strong {
  font-size: 0.86rem;
  font-weight: 800;
  color: #5a4a68;
}

.reading-rereadings__active-text span {
  font-size: 0.78rem;
  line-height: 1.35;
  color: #6c757d;
}

.reading-rereadings__cancel-btn {
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

.reading-rereadings__cancel-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.95);
}

.reading-rereadings__cancel-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.reading-rereadings__empty {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.45;
  color: #6c757d;
}

.reading-rereadings__hint {
  margin: 0 0 0.65rem;
  font-size: 0.8rem;
  line-height: 1.45;
  color: #8c98a4;
}

.reading-rereadings__hint strong {
  color: #6b4f7c;
  font-weight: 700;
}

.reading-rereadings__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.reading-rereadings__item {
  padding: 0.55rem 0.65rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.55);
}

.reading-rereadings__item-label {
  margin: 0 0 0.35rem;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: #ad81be;
}

.reading-rereadings__dates {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem 0.75rem;
}

.reading-rereadings__field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.reading-rereadings__field-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: #8c98a4;
}

.reading-rereadings__value,
.reading-rereadings__input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.35rem 0.45rem;
  border-radius: 8px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.85);
  font-size: 0.84rem;
  color: #3d2f4a;
}

.reading-rereadings__value {
  text-align: left;
  cursor: pointer;
}

.reading-rereadings__value:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (prefers-color-scheme: dark) {
  .reading-rereadings__title {
    color: #e8dcf5;
  }

  .reading-rereadings__active {
    background: rgba(213, 181, 234, 0.12);
    border-color: rgba(213, 181, 234, 0.28);
  }

  .reading-rereadings__active-text strong {
    color: #e8dcf5;
  }

  .reading-rereadings__active-text span {
    color: #adb5bd;
  }

  .reading-rereadings__cancel-btn {
    background: rgba(25, 20, 35, 0.75);
    border-color: rgba(213, 181, 234, 0.3);
    color: #d5b5ea;
  }

  .reading-rereadings__empty {
    color: #adb5bd;
  }

  .reading-rereadings__hint {
    color: #adb5bd;
  }

  .reading-rereadings__hint strong {
    color: #d5b5ea;
  }

  .reading-rereadings__item {
    background: rgba(25, 20, 35, 0.55);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .reading-rereadings__value,
  .reading-rereadings__input {
    background: rgba(25, 20, 35, 0.75);
    border-color: rgba(213, 181, 234, 0.25);
    color: #f0e8f8;
  }
}
</style>
