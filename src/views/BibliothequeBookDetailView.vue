<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ReadingBookSheet from '../components/lecture/ReadingBookSheet.vue'
import { supabase } from '../lib/supabase.js'
import {
  createReadingBook,
  linkReadingBookToOpenLibrary,
  listReadingBooks,
} from '../services/lecture/readingBooks.js'
import { getOpenLibraryWork } from '../services/bibliotheque/openLibrary.js'
import { findLectureBookForOpenLibraryDoc } from '../services/bibliotheque/openLibraryLink.js'
import { isExactOpenLibraryMatch } from '../utils/bibliotheque/openLibraryMatch.js'
import { normalizeOpenLibrarySubjects } from '../utils/bibliotheque/openLibrarySubjects.js'
import { seriesToReadingBookFields } from '../utils/bibliotheque/openLibrarySeries.js'
import { READING_COLLECTION_WISHLIST } from '../services/lecture/readingCollections.js'

const route = useRoute()
const router = useRouter()

const userId = ref(null)
const work = ref(null)
const lectureBooks = ref([])
const isLoading = ref(true)
const isSaving = ref(false)
const errorMessage = ref('')

const workKeyParam = computed(() => {
  const raw = String(route.params.workKey ?? '')
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
})

const linkedLectureBook = computed(() =>
  work.value ? findLectureBookForOpenLibraryDoc(lectureBooks.value, work.value) : null,
)

const subjectsLabel = computed(() => {
  const list = Array.isArray(work.value?.subjects) ? work.value.subjects : []
  return list.join(', ') || '—'
})

function returnToLibrary() {
  const isEmbed = route.path.startsWith('/embed')
  router.push({ name: isEmbed ? 'embed-bibliotheque' : 'bibliotheque' })
}

function openLectureFiche() {
  if (!linkedLectureBook.value?.id) return
  const isEmbed = route.path.startsWith('/embed')
  router.push({
    name: isEmbed ? 'embed-lecture-livre' : 'lecture-livre',
    params: { bookId: linkedLectureBook.value.id },
  })
}

async function loadLectureBooks() {
  if (!userId.value) {
    lectureBooks.value = []
    return
  }
  lectureBooks.value = await listReadingBooks(supabase, userId.value)
}

async function loadWork() {
  if (!workKeyParam.value) {
    work.value = null
    errorMessage.value = 'Livre introuvable.'
    isLoading.value = false
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  work.value = null

  try {
    work.value = await getOpenLibraryWork(workKeyParam.value)
    if (work.value?.title) document.title = `${work.value.title} · BetterMe`
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Impossible de charger la fiche.'
  } finally {
    isLoading.value = false
  }
}

async function addToLecture() {
  if (!userId.value || !work.value || isSaving.value) return
  isSaving.value = true
  errorMessage.value = ''

  try {
    const matched =
      findLectureBookForOpenLibraryDoc(lectureBooks.value, work.value) ||
      lectureBooks.value.find((book) => isExactOpenLibraryMatch(book, work.value)) ||
      null

    if (matched) {
      const seriesFields = seriesToReadingBookFields(work.value)
      await linkReadingBookToOpenLibrary(supabase, userId.value, matched.id, {
        workKey: work.value.key,
        pages: work.value.pageCount,
        publicationYear: work.value.firstPublishYear,
        subjects: work.value.subjects,
        ...seriesFields,
      })
      await loadLectureBooks()
      const isEmbed = route.path.startsWith('/embed')
      router.push({
        name: isEmbed ? 'embed-lecture-livre' : 'lecture-livre',
        params: { bookId: matched.id },
      })
      return
    }

    const subjects = normalizeOpenLibrarySubjects(work.value.subjects)
    const seriesFields = seriesToReadingBookFields(work.value)
    const created = await createReadingBook(supabase, userId.value, {
      title: work.value.title,
      author: work.value.authorLabel === 'Auteur inconnu' ? '' : work.value.authorLabel,
      collection: READING_COLLECTION_WISHLIST,
      pages: work.value.pageCount ?? '',
      publicationYear: work.value.firstPublishYear ?? '',
      imageUrl: work.value.coverUrl || '',
      openLibraryWorkKey: work.value.key,
      genre: subjects[0] || '',
      extraTags: subjects.slice(1).join(', '),
      ...seriesFields,
    })

    const isEmbed = route.path.startsWith('/embed')
    router.push({
      name: isEmbed ? 'embed-lecture-livre' : 'lecture-livre',
      params: { bookId: created.id },
    })
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Impossible d’ajouter ce livre à Lecture.'
  } finally {
    isSaving.value = false
  }
}

onMounted(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) userId.value = user.id
  await Promise.all([loadWork(), loadLectureBooks()])
})

watch(workKeyParam, () => loadWork())
</script>

<template>
  <div class="ol-book-page">
    <header class="ol-book-page__header">
      <button type="button" class="ol-book-page__back" @click="returnToLibrary">
        ← Retour à la bibliothèque
      </button>
    </header>

    <div v-if="isLoading" class="ol-book-page__status">Chargement de la fiche…</div>
    <div v-else-if="!work" class="ol-book-page__error">
      {{ errorMessage || 'Livre introuvable.' }}
    </div>

    <ReadingBookSheet
      v-else
      page
      :show-spoil="false"
      :show-quote="false"
      :show-comments="false"
      title="Fiche de Lecture"
      about-title="À propos"
    >
      <template #actions>
        <button
          v-if="linkedLectureBook"
          type="button"
          class="ol-book-page__action ol-book-page__action--primary"
          @click="openLectureFiche"
        >
          Ouvrir ma fiche
        </button>
        <button
          v-else
          type="button"
          class="ol-book-page__action ol-book-page__action--primary"
          :disabled="isSaving"
          @click="addToLecture"
        >
          {{ isSaving ? 'Ajout…' : 'Ajouter à Lecture' }}
        </button>
      </template>

      <template v-if="errorMessage" #alert>
        <div class="reading-fiche-error">{{ errorMessage }}</div>
      </template>

      <template #cover>
        <img
          v-if="work.coverUrl"
          :src="work.coverUrl"
          :alt="`Couverture de ${work.title}`"
          class="reading-fiche-cover"
        />
        <div v-else class="reading-fiche-cover reading-fiche-cover--placeholder">
          <span>couverture du livre</span>
        </div>
      </template>

      <template #info>
        <div class="reading-fiche-field">
          <span class="reading-fiche-label">Titre :</span>
          <span class="ol-book-value">{{ work.title }}</span>
        </div>
        <div v-if="work.subtitle" class="reading-fiche-field">
          <span class="reading-fiche-label">Sous-titre :</span>
          <span class="ol-book-value">{{ work.subtitle }}</span>
        </div>
        <div class="reading-fiche-field">
          <span class="reading-fiche-label">Auteur :</span>
          <span class="ol-book-value">{{ work.authorLabel }}</span>
        </div>
        <div class="reading-fiche-field">
          <span class="reading-fiche-label">Collection :</span>
          <span class="ol-book-value">
            {{ linkedLectureBook?.collection || '— (sera WishList à l’ajout)' }}
          </span>
        </div>
        <div class="reading-fiche-field">
          <span class="reading-fiche-label">Année :</span>
          <span class="ol-book-value">{{ work.firstPublishYear || '—' }}</span>
        </div>
        <div class="reading-fiche-field">
          <span class="reading-fiche-label">Pages :</span>
          <span class="ol-book-value">{{ work.pageCount || '—' }}</span>
        </div>
        <div class="reading-fiche-field">
          <span class="reading-fiche-label">Éditions :</span>
          <span class="ol-book-value">{{ work.editionCount || '—' }}</span>
        </div>
        <div class="reading-fiche-field">
          <span class="reading-fiche-label">ISBN :</span>
          <span class="ol-book-value">{{ work.isbn || '—' }}</span>
        </div>
        <div class="reading-fiche-field">
          <span class="reading-fiche-label">Sujets :</span>
          <span class="ol-book-value">{{ subjectsLabel }}</span>
        </div>
        <div v-if="linkedLectureBook" class="reading-fiche-field">
          <span class="reading-fiche-label">Dans Lecture :</span>
          <span class="ol-book-value ol-book-value--linked">Oui — données perso conservées</span>
        </div>
      </template>

      <template #about>
        <p class="ol-book-overview">{{ work.description }}</p>
      </template>
    </ReadingBookSheet>
  </div>
</template>

<style scoped>
.ol-book-page {
  flex: 1;
  width: 100%;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
}

.ol-book-page__header {
  margin: 0 0 1rem;
}

.ol-book-page__back {
  padding: 0.35rem 0;
  border: none;
  background: transparent;
  color: #6b4f7c;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
}

.ol-book-page__back:hover {
  color: #3d2f4a;
}

.ol-book-page__status,
.ol-book-page__error {
  text-align: center;
  padding: 2rem 0;
}

.ol-book-page__status {
  color: #6c757d;
}

.ol-book-page__error {
  color: #b02a37;
  font-weight: 700;
}

.ol-book-page__action {
  border: none;
  border-radius: 10px;
  padding: 0.55rem 0.9rem;
  font-weight: 800;
  font-size: 0.85rem;
  cursor: pointer;
}

.ol-book-page__action--primary {
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: #fff;
}

.ol-book-page__action--primary:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.ol-book-value {
  display: block;
  width: 100%;
  min-height: 1.35em;
  padding: 0.1rem 0 0.2rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: #2c2434;
  border-bottom: 1px dashed rgba(173, 129, 190, 0.55);
  word-break: break-word;
}

.ol-book-value--linked {
  color: #72a098;
}

.ol-book-overview {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.55;
  color: #4a3f55;
  white-space: pre-wrap;
}

@media (prefers-color-scheme: dark) {
  .ol-book-page__back {
    color: #c9b0d8;
  }
  .ol-book-page__back:hover {
    color: #f0e8f8;
  }
  .ol-book-value {
    color: #f0e8f8;
    border-bottom-color: rgba(173, 129, 190, 0.45);
  }
  .ol-book-overview {
    color: #d5c8e0;
  }
}
</style>
