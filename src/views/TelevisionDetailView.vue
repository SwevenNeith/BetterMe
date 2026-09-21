<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TelevisionMediaFiche from '../components/television/TelevisionMediaFiche.vue'
import { getTmdbDetailsBilingual } from '../services/television/tmdb.js'

const route = useRoute()
const router = useRouter()

const media = ref(null)
const isLoading = ref(true)
const errorMessage = ref('')

const mediaType = computed(() => {
  const raw = String(route.params.mediaType ?? '').toLowerCase()
  return raw === 'tv' ? 'tv' : raw === 'movie' ? 'movie' : ''
})

const mediaId = computed(() => String(route.params.tmdbId ?? ''))

function returnToSearch() {
  const isEmbed = route.path.startsWith('/embed')
  router.push({ name: isEmbed ? 'embed-television' : 'television' })
}

async function loadDetails() {
  if (!mediaType.value || !mediaId.value) {
    media.value = null
    errorMessage.value = 'Fiche introuvable.'
    isLoading.value = false
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  media.value = null

  try {
    media.value = await getTmdbDetailsBilingual(mediaType.value, mediaId.value)
    const title =
      media.value?.title ||
      media.value?.name ||
      media.value?.original_title ||
      media.value?.original_name
    if (title) document.title = `${title} · BetterMe`
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Impossible de charger la fiche TMDB.'
  } finally {
    isLoading.value = false
  }
}

onMounted(loadDetails)

watch(
  () => [mediaType.value, mediaId.value],
  () => loadDetails(),
)
</script>

<template>
  <div class="tv-detail-page">
    <header class="tv-detail-page__header">
      <button type="button" class="tv-detail-page__back" @click="returnToSearch">
        ← Retour à la recherche
      </button>
    </header>

    <div v-if="isLoading" class="tv-detail-page__status">Chargement de la fiche…</div>
    <div v-else-if="!media" class="tv-detail-page__error">
      {{ errorMessage || 'Contenu introuvable.' }}
    </div>

    <TelevisionMediaFiche v-else :media="media">
      <template v-if="errorMessage" #alert>
        <div class="reading-fiche-error">{{ errorMessage }}</div>
      </template>
    </TelevisionMediaFiche>
  </div>
</template>

<style scoped>
.tv-detail-page {
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
}

.tv-detail-page__header {
  margin: 0 0 1rem;
}

.tv-detail-page__back {
  padding: 0.35rem 0;
  border: none;
  background: transparent;
  color: #6b4f7c;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
}

.tv-detail-page__back:hover {
  color: #3d2f4a;
}

.tv-detail-page__status {
  text-align: center;
  color: #6c757d;
  padding: 2rem 0;
}

.tv-detail-page__error {
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  background: rgba(220, 53, 69, 0.1);
  color: #b02a37;
  font-size: 0.9rem;
  text-align: center;
}

@media (prefers-color-scheme: dark) {
  .tv-detail-page__back {
    color: #c9b0d8;
  }
  .tv-detail-page__back:hover {
    color: #f0e8f8;
  }
  .tv-detail-page__status {
    color: #adb5bd;
  }
  .tv-detail-page__error {
    background: rgba(220, 53, 69, 0.18);
    color: #ff8a8a;
  }
}
</style>
