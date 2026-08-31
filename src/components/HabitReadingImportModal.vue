<script setup>
import { computed, ref, watch } from 'vue'
import { supabase } from '../lib/supabase.js'
import { createReadingBook } from '../services/readingBooks.js'
import { createReadingBookAlias } from '../services/readingBookAliases.js'
import { READING_COLLECTION_EN_COURS } from '../services/readingCollections.js'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  titles: {
    type: Array,
    default: () => [],
  },
  books: {
    type: Array,
    default: () => [],
  },
  userId: {
    type: String,
    required: true,
  },
})

const emit = defineEmits(['close', 'created', 'linked'])

const selectedTitles = ref([])
const isCreating = ref(false)
const errorMessage = ref('')
const linkingTitle = ref(null)
const linkSearchQuery = ref('')
const isLinking = ref(false)

const allSelected = computed(
  () => props.titles.length > 0 && selectedTitles.value.length === props.titles.length,
)

const sortedBooks = computed(() =>
  [...props.books].sort((a, b) =>
    String(a.title ?? '').localeCompare(String(b.title ?? ''), 'fr', { sensitivity: 'base' }),
  ),
)

const filteredLinkBooks = computed(() => {
  const query = linkSearchQuery.value.trim().toLowerCase()
  if (!query) return sortedBooks.value
  return sortedBooks.value.filter((book) => {
    const haystack = `${book.title ?? ''} ${book.author ?? ''}`.toLowerCase()
    return haystack.includes(query)
  })
})

watch(
  () => [props.open, props.titles],
  () => {
    if (!props.open) return
    selectedTitles.value = [...props.titles]
    errorMessage.value = ''
    isCreating.value = false
    linkingTitle.value = null
    linkSearchQuery.value = ''
    isLinking.value = false
  },
  { immediate: true },
)

function toggleAll(event) {
  selectedTitles.value = event.target.checked ? [...props.titles] : []
}

function toggleTitle(title) {
  if (selectedTitles.value.includes(title)) {
    selectedTitles.value = selectedTitles.value.filter((item) => item !== title)
  } else {
    selectedTitles.value = [...selectedTitles.value, title]
  }
}

function dismiss() {
  emit('close', { dismissed: true })
}

function startLink(title) {
  linkingTitle.value = title
  linkSearchQuery.value = ''
  errorMessage.value = ''
}

function cancelLink() {
  linkingTitle.value = null
  linkSearchQuery.value = ''
  errorMessage.value = ''
}

async function confirmLink(book) {
  if (!linkingTitle.value || !book) return

  isLinking.value = true
  errorMessage.value = ''

  try {
    await createReadingBookAlias(supabase, props.userId, book.id, linkingTitle.value)
    emit('linked', {
      alias: linkingTitle.value,
      bookId: book.id,
      book,
    })
    linkingTitle.value = null
    linkSearchQuery.value = ''
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Impossible d’associer ce titre.'
  } finally {
    isLinking.value = false
  }
}

async function confirmCreate() {
  if (!selectedTitles.value.length) {
    dismiss()
    return
  }

  isCreating.value = true
  errorMessage.value = ''

  /** @type {Array<{ id: string, title: string }>} */
  const created = []

  try {
    for (const title of selectedTitles.value) {
      const book = await createReadingBook(supabase, props.userId, {
        title,
        collection: READING_COLLECTION_EN_COURS,
      })
      created.push({ id: book.id, title: book.title })
    }
    emit('created', created)
    emit('close', { dismissed: false, created })
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Impossible de créer les livres.'
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="habit-reading-import" role="dialog" aria-modal="true">
      <div class="habit-reading-import__overlay" @click="dismiss" />
      <div class="habit-reading-import__panel">
        <header class="habit-reading-import__header">
          <h3 class="habit-reading-import__title">Titres non trouvés dans la bibliothèque</h3>
          <p class="habit-reading-import__subtitle">
            Des détails d'habitude mentionnent des livres absents de votre bibliothèque. Associez-les
            à un livre existant (ex. abréviation « PNL » → titre complet) ou créez de nouveaux livres.
          </p>
        </header>

        <section v-if="linkingTitle" class="habit-reading-import__link-panel">
          <p class="habit-reading-import__link-intro">
            Associer « <strong>{{ linkingTitle }}</strong> » à un livre de la bibliothèque :
          </p>
          <input
            v-model="linkSearchQuery"
            type="search"
            class="habit-reading-import__search"
            placeholder="Rechercher un livre…"
            :disabled="isLinking"
          />
          <ul v-if="filteredLinkBooks.length" class="habit-reading-import__link-list">
            <li v-for="book in filteredLinkBooks" :key="book.id">
              <button
                type="button"
                class="habit-reading-import__link-book"
                :disabled="isLinking"
                @click="confirmLink(book)"
              >
                <span class="habit-reading-import__link-book-title">{{ book.title }}</span>
                <span v-if="book.author" class="habit-reading-import__link-book-author">
                  {{ book.author }}
                </span>
              </button>
            </li>
          </ul>
          <p v-else class="habit-reading-import__empty">Aucun livre trouvé.</p>
          <button
            type="button"
            class="habit-reading-import__btn habit-reading-import__btn--ghost habit-reading-import__link-back"
            :disabled="isLinking"
            @click="cancelLink"
          >
            Retour
          </button>
        </section>

        <template v-else>
          <ul v-if="titles.length" class="habit-reading-import__list">
            <li class="habit-reading-import__item habit-reading-import__item--all">
              <label>
                <input type="checkbox" :checked="allSelected" @change="toggleAll" />
                <span>Tout sélectionner pour créer</span>
              </label>
            </li>
            <li v-for="title in titles" :key="title" class="habit-reading-import__item">
              <label class="habit-reading-import__item-label">
                <input
                  type="checkbox"
                  :checked="selectedTitles.includes(title)"
                  @change="toggleTitle(title)"
                />
                <span>{{ title }}</span>
              </label>
              <button
                type="button"
                class="habit-reading-import__link-btn"
                :disabled="isCreating"
                @click="startLink(title)"
              >
                Associer
              </button>
            </li>
          </ul>

          <p v-else class="habit-reading-import__empty">Aucun titre à importer.</p>
        </template>

        <p v-if="errorMessage" class="habit-reading-import__error">{{ errorMessage }}</p>

        <footer v-if="!linkingTitle" class="habit-reading-import__footer">
          <button
            type="button"
            class="habit-reading-import__btn habit-reading-import__btn--ghost"
            :disabled="isCreating"
            @click="dismiss"
          >
            Ignorer
          </button>
          <button
            type="button"
            class="habit-reading-import__btn habit-reading-import__btn--primary"
            :disabled="isCreating || !selectedTitles.length"
            @click="confirmCreate"
          >
            {{
              isCreating
                ? 'Création…'
                : `Créer ${selectedTitles.length} livre${selectedTitles.length > 1 ? 's' : ''}`
            }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.habit-reading-import {
  position: fixed;
  inset: 0;
  z-index: 1600;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
}

.habit-reading-import__overlay {
  position: absolute;
  inset: 0;
  background: rgba(20, 30, 40, 0.55);
}

.habit-reading-import__panel {
  position: relative;
  width: min(100%, 34rem);
  max-height: min(85vh, 32rem);
  overflow: auto;
  background: white;
  border-radius: 16px;
  padding: 1.1rem 1.2rem 1rem;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
}

.habit-reading-import__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 900;
  color: #ad81be;
}

.habit-reading-import__subtitle {
  margin: 0.45rem 0 0;
  font-size: 0.86rem;
  line-height: 1.45;
  color: #6c757d;
}

.habit-reading-import__list {
  list-style: none;
  margin: 1rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.habit-reading-import__item {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.habit-reading-import__item-label {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex: 1;
  min-width: 0;
  padding: 0.55rem 0.65rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.25);
  background: rgba(213, 181, 234, 0.08);
  cursor: pointer;
  font-weight: 650;
  color: #2c3e50;
}

.habit-reading-import__item--all .habit-reading-import__item-label {
  background: rgba(213, 181, 234, 0.14);
  font-weight: 800;
}

.habit-reading-import__item-label span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.habit-reading-import__link-btn {
  flex-shrink: 0;
  padding: 0.45rem 0.65rem;
  border-radius: 10px;
  border: 1px solid rgba(173, 129, 190, 0.45);
  background: rgba(213, 181, 234, 0.16);
  color: #8b5fa8;
  font-size: 0.78rem;
  font-weight: 800;
  cursor: pointer;
}

.habit-reading-import__link-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.habit-reading-import__link-panel {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.habit-reading-import__link-intro {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.45;
  color: #2c3e50;
}

.habit-reading-import__search {
  width: 100%;
  padding: 0.55rem 0.7rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  font-size: 0.86rem;
}

.habit-reading-import__link-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-height: 14rem;
  overflow: auto;
}

.habit-reading-import__link-book {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  width: 100%;
  padding: 0.55rem 0.65rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.25);
  background: rgba(213, 181, 234, 0.08);
  cursor: pointer;
  text-align: left;
}

.habit-reading-import__link-book:hover:not(:disabled) {
  border-color: #ad81be;
  background: rgba(213, 181, 234, 0.16);
}

.habit-reading-import__link-book:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.habit-reading-import__link-book-title {
  font-size: 0.84rem;
  font-weight: 800;
  color: #2c3e50;
}

.habit-reading-import__link-book-author {
  font-size: 0.75rem;
  font-weight: 600;
  color: #6c757d;
}

.habit-reading-import__link-back {
  align-self: flex-start;
}

.habit-reading-import__empty {
  margin: 1rem 0 0;
  color: #8c98a4;
  font-size: 0.9rem;
}

.habit-reading-import__error {
  margin: 0.75rem 0 0;
  color: #c0392b;
  font-size: 0.85rem;
  font-weight: 600;
}

.habit-reading-import__footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
}

.habit-reading-import__btn {
  padding: 0.5rem 0.9rem;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  border: none;
}

.habit-reading-import__btn--ghost {
  background: rgba(213, 181, 234, 0.2);
  color: #5c6b7a;
}

.habit-reading-import__btn--primary {
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
}

.habit-reading-import__btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (prefers-color-scheme: dark) {
  .habit-reading-import__panel {
    background: #1e2832;
  }

  .habit-reading-import__subtitle,
  .habit-reading-import__link-book-author {
    color: #adb5bd;
  }

  .habit-reading-import__item-label,
  .habit-reading-import__link-book,
  .habit-reading-import__link-intro,
  .habit-reading-import__link-book-title {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(213, 181, 234, 0.15);
    color: #f0e8f8;
  }

  .habit-reading-import__search {
    background: rgba(30, 25, 40, 0.85);
    border-color: rgba(213, 181, 234, 0.2);
    color: #f0e8f8;
  }
}
</style>
