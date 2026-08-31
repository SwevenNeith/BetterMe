<script setup>
import { computed, ref, watch } from 'vue'
import { supabase } from '../lib/supabase.js'
import { createReadingBook } from '../services/readingBooks.js'
import { READING_COLLECTION_EN_COURS } from '../services/readingCollections.js'
import { isBookInProgress } from '../utils/habitReadingLink.js'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  books: {
    type: Array,
    default: () => [],
  },
  habit: {
    type: Object,
    required: true,
  },
  userId: {
    type: String,
    required: true,
  },
})

const emit = defineEmits(['close', 'select', 'created'])

const searchQuery = ref('')
const filterMode = ref('all') // all | en-cours | autres
const newTitle = ref('')
const isCreating = ref(false)
const createError = ref('')

const sortedBooks = computed(() =>
  [...props.books].sort((a, b) =>
    String(a.title ?? '').localeCompare(String(b.title ?? ''), 'fr', { sensitivity: 'base' }),
  ),
)

const filteredBooks = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  return sortedBooks.value.filter((book) => {
    if (filterMode.value === 'en-cours' && !isBookInProgress(book)) return false
    if (filterMode.value === 'autres' && isBookInProgress(book)) return false
    if (!query) return true
    const haystack = `${book.title ?? ''} ${book.author ?? ''} ${book.collection ?? ''}`.toLowerCase()
    return haystack.includes(query)
  })
})

function resetState() {
  searchQuery.value = ''
  filterMode.value = 'all'
  newTitle.value = ''
  createError.value = ''
  isCreating.value = false
}

function close() {
  emit('close')
}

function selectBook(book) {
  emit('select', book)
}

async function createAndSelect() {
  const title = newTitle.value.trim()
  if (!title) {
    createError.value = 'Indiquez un titre.'
    return
  }

  isCreating.value = true
  createError.value = ''

  try {
    const book = await createReadingBook(supabase, props.userId, {
      title,
      collection: READING_COLLECTION_EN_COURS,
    })
    emit('created', book)
    emit('select', book)
  } catch (err) {
    console.error(err)
    createError.value = err.message || 'Impossible de créer le livre.'
  } finally {
    isCreating.value = false
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) resetState()
  },
)
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="habit-reading-library" role="dialog" aria-modal="true">
      <div class="habit-reading-library__overlay" @click="close" />
      <div class="habit-reading-library__panel" :style="{ '--habit-color': habit.couleur }">
        <header class="habit-reading-library__header">
          <div>
            <h3 class="habit-reading-library__title">Bibliothèque</h3>
            <p class="habit-reading-library__subtitle">
              Choisissez un livre, y compris hors collection « En cours ».
            </p>
          </div>
          <button type="button" class="habit-reading-library__close" aria-label="Fermer" @click="close">
            ✕
          </button>
        </header>

        <div class="habit-reading-library__search-row">
          <input
            v-model="searchQuery"
            type="search"
            class="habit-reading-library__search"
            placeholder="Rechercher un titre, auteur…"
          />
        </div>

        <div class="habit-reading-library__filters" role="tablist" aria-label="Filtrer la bibliothèque">
          <button
            type="button"
            class="habit-reading-library__filter"
            :class="{ 'habit-reading-library__filter--active': filterMode === 'all' }"
            @click="filterMode = 'all'"
          >
            Tous
          </button>
          <button
            type="button"
            class="habit-reading-library__filter"
            :class="{ 'habit-reading-library__filter--active': filterMode === 'en-cours' }"
            @click="filterMode = 'en-cours'"
          >
            En cours
          </button>
          <button
            type="button"
            class="habit-reading-library__filter"
            :class="{ 'habit-reading-library__filter--active': filterMode === 'autres' }"
            @click="filterMode = 'autres'"
          >
            Autres
          </button>
        </div>

        <p v-if="!filteredBooks.length" class="habit-reading-library__empty">Aucun livre trouvé.</p>

        <ul v-else class="habit-reading-library__grid">
          <li v-for="book in filteredBooks" :key="book.id">
            <button
              type="button"
              class="habit-reading-library__book-btn"
              :aria-label="book.title"
              :title="[book.title, book.author, book.collection].filter(Boolean).join(' · ')"
              @click="selectBook(book)"
            >
              <div class="habit-reading-library__cover-wrap">
                <img
                  v-if="book.coverUrl"
                  :src="book.coverUrl"
                  :alt="`Couverture de ${book.title}`"
                  class="habit-reading-library__cover"
                />
                <div
                  v-else
                  class="habit-reading-library__cover habit-reading-library__cover--placeholder"
                >
                  {{ book.title?.charAt(0)?.toUpperCase() || '?' }}
                </div>
              </div>
            </button>
          </li>
        </ul>

        <section class="habit-reading-library__create">
          <p class="habit-reading-library__create-label">Nouveau livre</p>
          <div class="habit-reading-library__create-row">
            <input
              v-model="newTitle"
              type="text"
              class="habit-reading-library__create-input"
              placeholder="Titre du livre"
              @keydown.enter.prevent="createAndSelect"
            />
            <button
              type="button"
              class="habit-reading-library__create-btn"
              :disabled="isCreating"
              @click="createAndSelect"
            >
              {{ isCreating ? 'Création…' : 'Créer' }}
            </button>
          </div>
          <p v-if="createError" class="habit-reading-library__error">{{ createError }}</p>
        </section>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.habit-reading-library {
  position: fixed;
  inset: 0;
  z-index: 1540;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
}

.habit-reading-library__overlay {
  position: absolute;
  inset: 0;
  background: rgba(20, 30, 40, 0.55);
}

.habit-reading-library__panel {
  position: relative;
  width: min(100%, 28rem);
  max-height: min(90vh, 40rem);
  overflow: auto;
  background: white;
  border-radius: 18px;
  padding: 1rem 1.05rem 1rem;
  box-shadow: 0 18px 52px rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(213, 181, 234, 0.25);
}

.habit-reading-library__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.habit-reading-library__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 900;
  color: var(--habit-color, #ad81be);
}

.habit-reading-library__subtitle {
  margin: 0.25rem 0 0;
  font-size: 0.8rem;
  line-height: 1.4;
  color: #6c757d;
}

.habit-reading-library__close {
  border: none;
  background: transparent;
  color: #8c98a4;
  font-size: 1.1rem;
  cursor: pointer;
}

.habit-reading-library__search-row {
  margin-bottom: 0.55rem;
}

.habit-reading-library__search {
  width: 100%;
  box-sizing: border-box;
  padding: 0.5rem 0.7rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  font-size: 0.9rem;
  font-weight: 600;
}

.habit-reading-library__filters {
  display: flex;
  gap: 0.35rem;
  margin-bottom: 0.65rem;
}

.habit-reading-library__filter {
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  border: 1px solid rgba(213, 181, 234, 0.3);
  background: rgba(213, 181, 234, 0.08);
  color: #5c6b7a;
  font-size: 0.75rem;
  font-weight: 800;
  cursor: pointer;
}

.habit-reading-library__filter--active {
  border-color: var(--habit-color, #ad81be);
  background: rgba(213, 181, 234, 0.18);
  color: var(--habit-color, #ad81be);
}

.habit-reading-library__empty {
  margin: 0.5rem 0;
  font-size: 0.85rem;
  color: #8c98a4;
  text-align: center;
}

.habit-reading-library__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.4rem;
  max-height: 16rem;
  overflow: auto;
}

.habit-reading-library__book-btn {
  display: block;
  width: 100%;
  padding: 0.2rem;
  border-radius: 8px;
  border: 2px solid rgba(213, 181, 234, 0.25);
  background: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.15s ease;
}

.habit-reading-library__book-btn:hover {
  transform: translateY(-1px);
  border-color: var(--habit-color, #ad81be);
}

.habit-reading-library__cover-wrap {
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: 5px;
  overflow: hidden;
}

.habit-reading-library__cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.habit-reading-library__cover--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(213, 181, 234, 0.35), rgba(173, 129, 190, 0.45));
  color: white;
  font-size: 0.85rem;
  font-weight: 900;
}

.habit-reading-library__create {
  margin-top: 0.85rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(213, 181, 234, 0.22);
}

.habit-reading-library__create-label {
  margin: 0 0 0.45rem;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--habit-color, #ad81be);
}

.habit-reading-library__create-row {
  display: flex;
  gap: 0.45rem;
}

.habit-reading-library__create-input {
  flex: 1;
  min-width: 0;
  padding: 0.5rem 0.7rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  font-size: 0.9rem;
  font-weight: 600;
}

.habit-reading-library__create-btn {
  padding: 0.5rem 0.85rem;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}

.habit-reading-library__create-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.habit-reading-library__error {
  margin: 0.45rem 0 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: #c0392b;
}

@media (prefers-color-scheme: dark) {
  .habit-reading-library__panel {
    background: #1e2832;
    border-color: rgba(213, 181, 234, 0.15);
  }

  .habit-reading-library__subtitle {
    color: #adb5bd;
  }

  .habit-reading-library__search,
  .habit-reading-library__create-input {
    background: rgba(30, 25, 40, 0.9);
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.2);
  }

  .habit-reading-library__book-btn {
    background: rgba(30, 25, 40, 0.85);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .habit-reading-library__filter {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(213, 181, 234, 0.15);
    color: #ced4da;
  }
}
</style>
