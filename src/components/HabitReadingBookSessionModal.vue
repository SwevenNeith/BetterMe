<script setup>
import { computed, ref, watch } from 'vue'
import {
  computeEndPageFromPagesRead,
  computePagesReadFromEndPage,
} from '../utils/habitReadingLink.js'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  book: {
    type: Object,
    default: null,
  },
  habit: {
    type: Object,
    required: true,
  },
  baselinePage: {
    type: Number,
    default: 0,
  },
  baselineDate: {
    type: String,
    default: null,
  },
  initialEndPage: {
    type: [String, Number],
    default: '',
  },
  initialPagesRead: {
    type: [String, Number],
    default: '',
  },
  isEdit: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['close', 'save', 'remove'])

const endPageInput = ref('')
const pagesReadInput = ref('')
const fieldError = ref('')
let syncSource = null

const bookTitle = computed(() => props.book?.title ?? 'Livre')

const baselineLabel = computed(() => {
  if (props.baselinePage > 0) {
    const datePart = props.baselineDate ? ` (${props.baselineDate})` : ''
    return `Reprise à la page ${props.baselinePage}${datePart}`
  }
  return 'Première session pour ce livre (départ : page 0)'
})

const editHint = computed(() => {
  if (!props.isEdit) return null
  return 'Mettez à jour le total du jour : si vous aviez lu 5 pages ce matin et 15 au total ce soir, indiquez 15 pages lues (ou la page d’arrêt correspondante).'
})

function resetDraft() {
  endPageInput.value =
    props.initialEndPage !== '' && props.initialEndPage != null
      ? String(props.initialEndPage)
      : ''
  pagesReadInput.value =
    props.initialPagesRead !== '' && props.initialPagesRead != null
      ? String(props.initialPagesRead)
      : ''
  fieldError.value = ''
}

function onEndPageInput() {
  if (syncSource === 'pages') return
  syncSource = 'end'
  const pages = computePagesReadFromEndPage(props.baselinePage, endPageInput.value)
  pagesReadInput.value = pages > 0 ? String(pages) : ''
  syncSource = null
}

function onPagesReadInput() {
  if (syncSource === 'end') return
  syncSource = 'pages'
  const end = computeEndPageFromPagesRead(props.baselinePage, pagesReadInput.value)
  endPageInput.value = end > props.baselinePage ? String(end) : ''
  syncSource = null
}

function validate() {
  const endPage = Number(endPageInput.value)
  const pagesRead = Number(pagesReadInput.value)
  const start = props.baselinePage

  if (!Number.isFinite(endPage) || endPage <= 0) {
    fieldError.value = 'Indiquez la page où vous vous êtes arrêté.'
    return null
  }

  if (endPage <= start) {
    fieldError.value =
      start > 0
        ? `La page doit être supérieure à ${start} (dernière page avant aujourd'hui).`
        : 'La page doit être supérieure à 0.'
    return null
  }

  const computedPages = endPage - start
  if (!Number.isFinite(pagesRead) || pagesRead <= 0 || pagesRead !== computedPages) {
    fieldError.value = 'Le nombre de pages lues ne correspond pas à la progression.'
    return null
  }

  fieldError.value = ''
  return { endPage, pagesRead: computedPages }
}

function submit() {
  const payload = validate()
  if (!payload) return
  emit('save', payload)
}

function close() {
  emit('close')
}

function removeSession() {
  emit('remove')
}

watch(
  () => [props.open, props.book?.id, props.initialEndPage, props.initialPagesRead],
  () => {
    if (props.open) resetDraft()
  },
  { immediate: true },
)
</script>

<template>
  <Teleport to="body">
    <div v-if="open && book" class="habit-reading-session" role="dialog" aria-modal="true">
      <div class="habit-reading-session__overlay" @click="close" />
      <div class="habit-reading-session__panel" :style="{ '--habit-color': habit.couleur }">
        <header class="habit-reading-session__header">
          <div class="habit-reading-session__book">
            <div class="habit-reading-session__cover-wrap">
              <img
                v-if="book.coverUrl"
                :src="book.coverUrl"
                :alt="`Couverture de ${bookTitle}`"
                class="habit-reading-session__cover"
              />
              <div
                v-else
                class="habit-reading-session__cover habit-reading-session__cover--placeholder"
              >
                {{ bookTitle.charAt(0)?.toUpperCase() || '?' }}
              </div>
            </div>
            <div>
              <h3 class="habit-reading-session__title">{{ bookTitle }}</h3>
              <p v-if="book.author" class="habit-reading-session__author">{{ book.author }}</p>
            </div>
          </div>
          <button
            type="button"
            class="habit-reading-session__close"
            aria-label="Fermer"
            @click="close"
          >
            ✕
          </button>
        </header>

        <p class="habit-reading-session__baseline">{{ baselineLabel }}</p>
        <p v-if="editHint" class="habit-reading-session__edit-hint">{{ editHint }}</p>

        <div class="habit-reading-session__grid">
          <label class="habit-reading-session__field">
            <span>Page d'arrêt</span>
            <input
              v-model="endPageInput"
              type="number"
              min="1"
              step="1"
              class="habit-reading-session__input"
              :disabled="disabled"
              placeholder="Ex. 120"
              @input="onEndPageInput"
            />
          </label>

          <label class="habit-reading-session__field">
            <span>Pages lues aujourd'hui</span>
            <input
              v-model="pagesReadInput"
              type="number"
              min="1"
              step="1"
              class="habit-reading-session__input"
              :disabled="disabled"
              placeholder="Ex. 25"
              @input="onPagesReadInput"
            />
          </label>
        </div>

        <p class="habit-reading-session__sync-hint">
          Renseignez l'une des deux valeurs : l'autre se calcule automatiquement.
        </p>

        <p v-if="fieldError" class="habit-reading-session__error">{{ fieldError }}</p>

        <footer class="habit-reading-session__footer">
          <button
            v-if="isEdit"
            type="button"
            class="habit-reading-session__btn habit-reading-session__btn--danger"
            :disabled="disabled"
            @click="removeSession"
          >
            Retirer
          </button>
          <div class="habit-reading-session__footer-right">
            <button
              type="button"
              class="habit-reading-session__btn habit-reading-session__btn--ghost"
              :disabled="disabled"
              @click="close"
            >
              Annuler
            </button>
            <button
              type="button"
              class="habit-reading-session__btn habit-reading-session__btn--primary"
              :disabled="disabled"
              @click="submit"
            >
              {{ isEdit ? 'Mettre à jour' : 'Ajouter' }}
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.habit-reading-session {
  position: fixed;
  inset: 0;
  z-index: 1550;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
}

.habit-reading-session__overlay {
  position: absolute;
  inset: 0;
  background: rgba(20, 30, 40, 0.55);
}

.habit-reading-session__panel {
  position: relative;
  width: min(100%, 26rem);
  max-height: min(90vh, 36rem);
  overflow: auto;
  background: white;
  border-radius: 18px;
  padding: 1.1rem 1.15rem 1rem;
  box-shadow: 0 18px 52px rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(213, 181, 234, 0.25);
}

.habit-reading-session__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.habit-reading-session__book {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  min-width: 0;
}

.habit-reading-session__cover-wrap {
  width: 3.25rem;
  flex-shrink: 0;
  aspect-ratio: 2 / 3;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
}

.habit-reading-session__cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.habit-reading-session__cover--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(213, 181, 234, 0.45), rgba(173, 129, 190, 0.65));
  color: white;
  font-size: 1.2rem;
  font-weight: 900;
}

.habit-reading-session__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 900;
  color: #2c3e50;
  line-height: 1.3;
}

.habit-reading-session__author {
  margin: 0.2rem 0 0;
  font-size: 0.82rem;
  color: #6c757d;
  font-weight: 600;
}

.habit-reading-session__close {
  border: none;
  background: transparent;
  color: #8c98a4;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0.15rem;
}

.habit-reading-session__baseline,
.habit-reading-session__edit-hint,
.habit-reading-session__sync-hint {
  margin: 0 0 0.75rem;
  font-size: 0.82rem;
  line-height: 1.45;
  color: #6c757d;
}

.habit-reading-session__edit-hint {
  padding: 0.55rem 0.65rem;
  border-radius: 10px;
  background: rgba(213, 181, 234, 0.12);
  border: 1px solid rgba(213, 181, 234, 0.22);
  color: #5c6b7a;
}

.habit-reading-session__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
}

.habit-reading-session__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.habit-reading-session__field span {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--habit-color, #ad81be);
}

.habit-reading-session__input {
  padding: 0.55rem 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  font-size: 0.95rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.95);
  color: #2c3e50;
  width: 100%;
  box-sizing: border-box;
}

.habit-reading-session__error {
  margin: 0.65rem 0 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: #c0392b;
}

.habit-reading-session__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 1rem;
  flex-wrap: wrap;
}

.habit-reading-session__footer-right {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
}

.habit-reading-session__btn {
  padding: 0.5rem 0.9rem;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  border: none;
}

.habit-reading-session__btn--ghost {
  background: rgba(213, 181, 234, 0.2);
  color: #5c6b7a;
}

.habit-reading-session__btn--primary {
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
}

.habit-reading-session__btn--danger {
  background: rgba(192, 57, 43, 0.1);
  color: #c0392b;
}

.habit-reading-session__btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (max-width: 520px) {
  .habit-reading-session__grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-color-scheme: dark) {
  .habit-reading-session__panel {
    background: #1e2832;
    border-color: rgba(213, 181, 234, 0.15);
  }

  .habit-reading-session__title {
    color: #f0e8f8;
  }

  .habit-reading-session__author,
  .habit-reading-session__baseline,
  .habit-reading-session__sync-hint {
    color: #adb5bd;
  }

  .habit-reading-session__edit-hint {
    color: #ced4da;
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(213, 181, 234, 0.15);
  }

  .habit-reading-session__input {
    background: rgba(30, 25, 40, 0.9);
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.2);
  }
}
</style>
