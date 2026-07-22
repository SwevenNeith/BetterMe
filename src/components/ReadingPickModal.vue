<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import {
  accumulateSeenTags,
  pickNextReadingSuggestion,
} from '../utils/readingPick.js'
import { bookToEditForm } from '../utils/readingBookForm.js'
import { updateReadingBook } from '../services/readingBooks.js'
import { READING_COLLECTION_EN_COURS } from '../services/readingCollections.js'
import { supabase } from '../lib/supabase.js'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  books: {
    type: Array,
    default: () => [],
  },
  userId: {
    type: String,
    default: null,
  },
})

const emit = defineEmits(['close', 'accepted', 'updated'])

const isSaving = ref(false)
const errorMessage = ref('')
const emptyMessage = ref('')
const currentBook = ref(null)
const shownIds = ref([])
const seenTags = ref([])

const displayTags = computed(() => {
  const tags = currentBook.value?.tags ?? []
  return (tags ?? []).map((tag) => String(tag).trim()).filter(Boolean)
})

function resetSession() {
  shownIds.value = []
  seenTags.value = []
  currentBook.value = null
  errorMessage.value = ''
  emptyMessage.value = ''
  isSaving.value = false
}

function proposeNext(fromReject = false) {
  errorMessage.value = ''

  if (fromReject && currentBook.value) {
    seenTags.value = accumulateSeenTags(seenTags.value, currentBook.value)
    if (!shownIds.value.includes(currentBook.value.id)) {
      shownIds.value = [...shownIds.value, currentBook.value.id]
    }
  }

  const next = pickNextReadingSuggestion(props.books, {
    shownIds: shownIds.value,
    seenTags: seenTags.value,
  })

  if (!next) {
    currentBook.value = null
    emptyMessage.value = fromReject
      ? 'Plus de suggestion avec des tags différents. Réessaie plus tard ou ajoute des livres.'
      : 'Aucun livre disponible (hors « En cours » et « Terminé »).'
    return
  }

  if (!shownIds.value.includes(next.id)) {
    shownIds.value = [...shownIds.value, next.id]
  }
  currentBook.value = next
  emptyMessage.value = ''
}

function handleClose() {
  if (isSaving.value) return
  resetSession()
  emit('close')
}

function onOverlayClick(event) {
  if (event.target === event.currentTarget) handleClose()
}

function onKeydown(event) {
  if (!props.open || isSaving.value) return
  if (event.key === 'Escape') handleClose()
}

async function acceptBook() {
  if (!props.userId || !currentBook.value?.id || isSaving.value) return

  isSaving.value = true
  errorMessage.value = ''
  try {
    const payload = bookToEditForm(currentBook.value)
    payload.collection = READING_COLLECTION_EN_COURS
    const updated = await updateReadingBook(supabase, props.userId, currentBook.value.id, payload)
    emit('updated', updated)
    emit('accepted', updated)
    resetSession()
    emit('close')
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Impossible de passer le livre en « En cours ».'
  } finally {
    isSaving.value = false
  }
}

function rejectBook() {
  if (isSaving.value) return
  proposeNext(true)
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      resetSession()
      proposeNext(false)
      document.addEventListener('keydown', onKeydown)
    } else {
      document.removeEventListener('keydown', onKeydown)
      resetSession()
    }
  },
)

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="reading-pick-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Choisir ma lecture"
      @click="onOverlayClick"
    >
      <div class="reading-pick-panel" @click.stop>
        <header class="reading-pick-header">
          <h2 class="reading-pick-title">Choisir ma lecture</h2>
          <button
            type="button"
            class="reading-pick-close"
            title="Fermer"
            aria-label="Fermer"
            :disabled="isSaving"
            @click="handleClose"
          >
            ✕
          </button>
        </header>

        <div v-if="errorMessage" class="reading-pick-error">{{ errorMessage }}</div>

        <div v-if="emptyMessage" class="reading-pick-empty">
          <p>{{ emptyMessage }}</p>
          <button type="button" class="reading-pick-secondary" @click="handleClose">Fermer</button>
        </div>

        <template v-else-if="currentBook">
          <div class="reading-pick-cover-wrap">
            <img
              v-if="currentBook.coverUrl"
              :src="currentBook.coverUrl"
              :alt="`Couverture de ${currentBook.title}`"
              class="reading-pick-cover"
            />
            <div v-else class="reading-pick-cover reading-pick-cover--placeholder">
              <span>📖</span>
              <strong>{{ currentBook.title }}</strong>
            </div>
          </div>

          <p class="reading-pick-book-title">{{ currentBook.title }}</p>
          <p v-if="currentBook.author" class="reading-pick-book-author">{{ currentBook.author }}</p>

          <div v-if="displayTags.length" class="reading-pick-tags">
            <span v-for="tag in displayTags" :key="tag" class="reading-pick-tag">{{ tag }}</span>
          </div>
          <p v-else class="reading-pick-no-tags">Aucun tag</p>

          <div class="reading-pick-actions">
            <button
              type="button"
              class="reading-pick-thumb reading-pick-thumb--yes"
              title="Je lis ce livre"
              aria-label="Je lis ce livre"
              :disabled="isSaving"
              @click="acceptBook"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
                <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
              </svg>
              <span>Je lis ce livre</span>
            </button>

            <button
              type="button"
              class="reading-pick-thumb reading-pick-thumb--no"
              title="Pas cette fois"
              aria-label="Pas cette fois"
              :disabled="isSaving"
              @click="rejectBook"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" />
                <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
              </svg>
              <span>Pas cette fois</span>
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.reading-pick-modal {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(20, 24, 32, 0.45);
  backdrop-filter: blur(4px);
  box-sizing: border-box;
}

.reading-pick-panel {
  width: 100%;
  max-width: 360px;
  max-height: min(92vh, 720px);
  overflow-y: auto;
  padding: 1.15rem 1.2rem 1.35rem;
  border-radius: 18px;
  border: 1px solid rgba(173, 129, 190, 0.45);
  background: linear-gradient(180deg, #fffefb 0%, #faf6ff 100%);
  box-shadow: 0 18px 50px rgba(92, 62, 112, 0.16);
  box-sizing: border-box;
}

.reading-pick-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.reading-pick-title {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.45rem;
  color: #3d2f4a;
}

.reading-pick-close {
  width: 2rem;
  height: 2rem;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #7a6b86;
  cursor: pointer;
}

.reading-pick-close:hover:not(:disabled) {
  background: rgba(173, 129, 190, 0.15);
}

.reading-pick-error {
  margin-bottom: 0.75rem;
  padding: 0.55rem 0.7rem;
  border-radius: 8px;
  background: rgba(220, 53, 69, 0.1);
  color: #b02a37;
  font-size: 0.88rem;
}

.reading-pick-empty {
  text-align: center;
  color: #6c757d;
  padding: 1rem 0.5rem;
}

.reading-pick-secondary {
  margin-top: 0.75rem;
  padding: 0.55rem 0.9rem;
  border-radius: 10px;
  border: 1px solid rgba(173, 129, 190, 0.45);
  background: #fff;
  color: #5a4a68;
  font-weight: 700;
  cursor: pointer;
}

.reading-pick-cover-wrap {
  width: min(180px, 62%);
  margin: 0 auto 0.85rem;
  aspect-ratio: 2 / 3;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(213, 181, 234, 0.45);
  box-shadow: 0 10px 24px rgba(61, 47, 74, 0.12);
}

.reading-pick-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.reading-pick-cover--placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem;
  text-align: center;
  background: linear-gradient(145deg, #f4eef8, #e8d9f0);
  font-size: 2rem;
}

.reading-pick-cover--placeholder strong {
  font-size: 0.9rem;
  color: #5a4a68;
}

.reading-pick-book-title {
  margin: 0;
  text-align: center;
  font-size: 1.05rem;
  font-weight: 800;
  color: #2c2434;
}

.reading-pick-book-author {
  margin: 0.25rem 0 0;
  text-align: center;
  font-size: 0.9rem;
  color: #6c757d;
}

.reading-pick-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.35rem;
  margin: 0.85rem 0 0;
}

.reading-pick-tag {
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: rgba(213, 181, 234, 0.35);
  color: #5a3f6d;
  font-size: 0.78rem;
  font-weight: 700;
}

.reading-pick-no-tags {
  margin: 0.75rem 0 0;
  text-align: center;
  font-size: 0.85rem;
  color: #9a8aa6;
  font-style: italic;
}

.reading-pick-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
  margin-top: 1.15rem;
}

.reading-pick-thumb {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.75rem 0.5rem;
  border-radius: 12px;
  border: 1px solid transparent;
  font-weight: 700;
  font-size: 0.82rem;
  cursor: pointer;
  transition: transform 0.15s ease, filter 0.15s ease;
}

.reading-pick-thumb svg {
  width: 1.55rem;
  height: 1.55rem;
}

.reading-pick-thumb:hover:not(:disabled) {
  transform: translateY(-1px);
}

.reading-pick-thumb:disabled {
  opacity: 0.65;
  cursor: wait;
}

.reading-pick-thumb--yes {
  background: rgba(40, 167, 69, 0.12);
  border-color: rgba(40, 167, 69, 0.35);
  color: #1e7e34;
}

.reading-pick-thumb--no {
  background: rgba(220, 53, 69, 0.1);
  border-color: rgba(220, 53, 69, 0.3);
  color: #b02a37;
}

@media (max-width: 520px) {
  .reading-pick-modal {
    padding: 1.75rem 1.35rem;
  }

  .reading-pick-panel {
    max-width: min(340px, calc(100vw - 2.75rem));
  }
}
</style>
