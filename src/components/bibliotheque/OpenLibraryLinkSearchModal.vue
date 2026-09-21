<script setup>
import { onUnmounted, ref, watch } from 'vue'
import { searchOpenLibrary } from '../../services/bibliotheque/openLibrary.js'
import { stripLeadingArticles } from '../../utils/bibliotheque/openLibraryMatch.js'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  book: {
    type: Object,
    default: null,
  },
  linking: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['close', 'select'])

const SEARCH_DEBOUNCE_MS = 350
const MIN_SEARCH_LENGTH = 2

const titleQuery = ref('')
const authorQuery = ref('')
const isLoading = ref(false)
const loadError = ref('')
const results = ref([])
const numFound = ref(0)

let searchDebounceTimer = null
let searchAbortController = null
let searchRequestId = 0

function close() {
  if (props.linking) return
  emit('close')
}

function coverFor(doc) {
  return doc?.coverUrl || null
}

function onCoverError(doc) {
  if (doc) doc.coverUrl = null
}

function canSearch(title, author) {
  return (
    String(title ?? '').trim().length >= MIN_SEARCH_LENGTH ||
    String(author ?? '').trim().length >= MIN_SEARCH_LENGTH
  )
}

async function runSearch(titleRaw, authorRaw) {
  const title = String(titleRaw ?? '').trim()
  const author = String(authorRaw ?? '').trim()
  const requestId = ++searchRequestId

  searchAbortController?.abort()
  searchAbortController = null

  if (!canSearch(title, author)) {
    results.value = []
    numFound.value = 0
    loadError.value = ''
    isLoading.value = false
    return
  }

  isLoading.value = true
  loadError.value = ''
  searchAbortController = new AbortController()

  try {
    const bareTitle = title ? stripLeadingArticles(title) : ''
    const titleAttempts = title
      ? bareTitle && bareTitle !== title
        ? [title, bareTitle]
        : [title]
      : [undefined]

    let docs = []
    let found = 0

    for (const attemptTitle of titleAttempts) {
      const payload = await searchOpenLibrary('', {
        title: attemptTitle,
        author: author || undefined,
        page: 1,
        limit: 20,
        signal: searchAbortController.signal,
      })
      if (requestId !== searchRequestId) return
      if (payload.docs.length) {
        docs = payload.docs
        found = payload.numFound
        break
      }
    }

    // Si titre+auteur ne donne rien, élargir au titre seul
    if (!docs.length && title && author) {
      for (const attemptTitle of titleAttempts) {
        const payload = await searchOpenLibrary('', {
          title: attemptTitle,
          page: 1,
          limit: 20,
          signal: searchAbortController.signal,
        })
        if (requestId !== searchRequestId) return
        if (payload.docs.length) {
          docs = payload.docs
          found = payload.numFound
          break
        }
      }
    }

    results.value = docs
    numFound.value = found
  } catch (err) {
    if (err?.name === 'AbortError') return
    if (requestId !== searchRequestId) return
    console.error(err)
    results.value = []
    numFound.value = 0
    loadError.value = err.message || 'Recherche impossible.'
  } finally {
    if (requestId === searchRequestId) isLoading.value = false
  }
}

function scheduleSearch() {
  if (searchDebounceTimer != null) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = window.setTimeout(() => {
    searchDebounceTimer = null
    runSearch(titleQuery.value, authorQuery.value)
  }, SEARCH_DEBOUNCE_MS)
}

function selectDoc(doc) {
  if (!doc?.key || props.linking) return
  emit('select', doc)
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    titleQuery.value = String(props.book?.title ?? '').trim()
    authorQuery.value = String(props.book?.author ?? '').trim()
    results.value = []
    numFound.value = 0
    loadError.value = ''
    if (canSearch(titleQuery.value, authorQuery.value)) {
      runSearch(titleQuery.value, authorQuery.value)
    }
  },
)

watch([titleQuery, authorQuery], () => {
  if (!props.open) return
  scheduleSearch()
})

onUnmounted(() => {
  if (searchDebounceTimer != null) clearTimeout(searchDebounceTimer)
  searchRequestId += 1
  searchAbortController?.abort()
  searchAbortController = null
})
</script>

<template>
  <Teleport to="body">
    <template v-if="open">
      <div class="ol-link-picker__overlay" @click="close" />
      <div
        class="ol-link-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ol-link-picker-title"
      >
        <header class="ol-link-picker__header">
          <div>
            <h2 id="ol-link-picker-title" class="ol-link-picker__title">
              Lier à Open Library
            </h2>
            <p class="ol-link-picker__subtitle">
              Cherche la bonne fiche pour
              <strong>{{ book?.title || 'ce livre' }}</strong>
              <span v-if="book?.author"> ({{ book.author }})</span>
              — ta couverture et tes données restent intactes.
            </p>
          </div>
          <button
            type="button"
            class="ol-link-picker__close"
            aria-label="Fermer"
            :disabled="linking"
            @click="close"
          >
            ✕
          </button>
        </header>

        <div class="ol-link-picker__fields">
          <label class="ol-link-picker__search">
            <span class="ol-link-picker__search-label">Titre</span>
            <input
              v-model="titleQuery"
              type="search"
              class="ol-link-picker__search-input"
              placeholder="Titre du livre"
              maxlength="200"
              autocomplete="off"
              :disabled="linking"
            />
          </label>
          <label class="ol-link-picker__search">
            <span class="ol-link-picker__search-label">Auteur</span>
            <input
              v-model="authorQuery"
              type="search"
              class="ol-link-picker__search-input"
              placeholder="Auteur (optionnel)"
              maxlength="200"
              autocomplete="off"
              :disabled="linking"
            />
          </label>
        </div>

        <p v-if="isLoading" class="ol-link-picker__status">Recherche…</p>
        <p v-else-if="loadError" class="ol-link-picker__error">{{ loadError }}</p>
        <p
          v-else-if="canSearch(titleQuery, authorQuery) && !results.length"
          class="ol-link-picker__status"
        >
          Aucun résultat.
        </p>

        <div v-else-if="results.length" class="ol-link-picker__list">
          <p class="ol-link-picker__count">
            {{ numFound }} résultat{{ numFound === 1 ? '' : 's' }}
          </p>
          <button
            v-for="doc in results"
            :key="doc.key"
            type="button"
            class="ol-link-picker__row"
            :disabled="linking"
            @click="selectDoc(doc)"
          >
            <img
              v-if="coverFor(doc)"
              :src="coverFor(doc)"
              :alt="`Couverture de ${doc.title}`"
              class="ol-link-picker__cover"
              loading="lazy"
              @error="onCoverError(doc)"
            />
            <div
              v-else
              class="ol-link-picker__cover ol-link-picker__cover--placeholder"
              aria-hidden="true"
            >
              —
            </div>
            <div class="ol-link-picker__meta">
              <span class="ol-link-picker__book-title">{{ doc.title }}</span>
              <span class="ol-link-picker__book-author">{{ doc.authorLabel }}</span>
              <span v-if="doc.firstPublishYear || doc.editionCount" class="ol-link-picker__book-extra">
                <template v-if="doc.firstPublishYear">{{ doc.firstPublishYear }}</template>
                <template v-if="doc.firstPublishYear && doc.editionCount"> · </template>
                <template v-if="doc.editionCount">{{ doc.editionCount }} éditions</template>
              </span>
            </div>
          </button>
        </div>

        <p v-if="linking" class="ol-link-picker__status">Liaison en cours…</p>
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
.ol-link-picker__overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(28, 22, 38, 0.45);
  backdrop-filter: blur(2px);
}

.ol-link-picker {
  position: fixed;
  z-index: 1201;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(40rem, calc(100vw - 1.5rem));
  max-height: min(86vh, 40rem);
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1rem 1.1rem 1.1rem;
  border-radius: 16px;
  background: linear-gradient(180deg, #fff 0%, #faf6fd 100%);
  border: 1px solid rgba(213, 181, 234, 0.45);
  box-shadow: 0 18px 48px rgba(44, 30, 60, 0.28);
  box-sizing: border-box;
}

.ol-link-picker__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.ol-link-picker__title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: #2c3e50;
}

.ol-link-picker__subtitle {
  margin: 0.35rem 0 0;
  color: #6c757d;
  font-size: 0.88rem;
  line-height: 1.35;
}

.ol-link-picker__close {
  border: none;
  background: transparent;
  color: #8a6a9a;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0.2rem 0.4rem;
  border-radius: 8px;
}

.ol-link-picker__close:hover:not(:disabled) {
  background: rgba(213, 181, 234, 0.25);
}

.ol-link-picker__close:disabled {
  opacity: 0.5;
  cursor: wait;
}

.ol-link-picker__fields {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 0.65rem;
}

.ol-link-picker__search {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
}

.ol-link-picker__search-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: #6b4f7c;
}

.ol-link-picker__search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.65rem 0.8rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.55);
  background: rgba(255, 255, 255, 0.95);
  font-size: 0.95rem;
}

.ol-link-picker__status,
.ol-link-picker__error,
.ol-link-picker__count {
  margin: 0;
  font-weight: 650;
}

.ol-link-picker__status,
.ol-link-picker__count {
  color: #6c757d;
  font-size: 0.88rem;
}

.ol-link-picker__error {
  color: #b02a37;
}

.ol-link-picker__list {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  overflow: auto;
  min-height: 0;
  flex: 1;
}

.ol-link-picker__row {
  display: grid;
  grid-template-columns: 3rem 1fr;
  gap: 0.75rem;
  align-items: center;
  width: 100%;
  padding: 0.45rem 0.5rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.28);
  background: rgba(255, 255, 255, 0.85);
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.ol-link-picker__row:hover:not(:disabled) {
  background: rgba(213, 181, 234, 0.18);
  border-color: rgba(173, 129, 190, 0.45);
}

.ol-link-picker__row:disabled {
  opacity: 0.6;
  cursor: wait;
}

.ol-link-picker__cover {
  width: 3rem;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  border-radius: 4px;
  display: block;
  background: #f0e8f8;
}

.ol-link-picker__cover--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ad81be;
  font-size: 0.85rem;
}

.ol-link-picker__meta {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  min-width: 0;
}

.ol-link-picker__book-title {
  font-weight: 800;
  color: #2c3e50;
  font-size: 0.92rem;
}

.ol-link-picker__book-author,
.ol-link-picker__book-extra {
  font-size: 0.8rem;
  color: #6c757d;
}

@media (max-width: 520px) {
  .ol-link-picker__fields {
    grid-template-columns: 1fr;
  }
}

@media (prefers-color-scheme: dark) {
  .ol-link-picker {
    background: linear-gradient(180deg, #2a2438 0%, #1f1a2c 100%);
    border-color: rgba(213, 181, 234, 0.28);
  }

  .ol-link-picker__title,
  .ol-link-picker__book-title {
    color: #f0e8f8;
  }

  .ol-link-picker__subtitle,
  .ol-link-picker__status,
  .ol-link-picker__count,
  .ol-link-picker__book-author,
  .ol-link-picker__book-extra,
  .ol-link-picker__search-label {
    color: #adb5bd;
  }

  .ol-link-picker__search-input,
  .ol-link-picker__row {
    background: rgba(35, 30, 48, 0.9);
    border-color: rgba(213, 181, 234, 0.28);
    color: #f0e8f8;
  }

  .ol-link-picker__row:hover:not(:disabled) {
    background: rgba(173, 129, 190, 0.22);
  }
}
</style>
