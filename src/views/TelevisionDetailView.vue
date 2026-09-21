<script setup>
import { computed, onActivated, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ReadingCollectionCombobox from '../components/lecture/ReadingCollectionCombobox.vue'
import TelevisionMediaFiche from '../components/television/TelevisionMediaFiche.vue'
import TelevisionRewatchesSection from '../components/television/TelevisionRewatchesSection.vue'
import TelevisionSeasonProgress from '../components/television/TelevisionSeasonProgress.vue'
import { supabase } from '../lib/supabase.js'
import { getTmdbDetailsBilingual } from '../services/television/tmdb.js'
import {
  TELEVISION_COLLECTION_A_REGARDER,
  TELEVISION_COLLECTION_EN_COURS,
  TELEVISION_COLLECTION_TERMINE,
  listTelevisionCollections,
} from '../services/television/televisionCollections.js'
import {
  deleteTelevisionMedia,
  getTelevisionMediaByTmdb,
  updateTelevisionMedia,
  upsertTelevisionMediaFromTmdb,
} from '../services/television/televisionMedia.js'
import {
  canStartTelevisionRewatch,
  cancelTelevisionRewatch,
  listTelevisionRewatches,
  startTelevisionRewatch,
  updateTelevisionRewatch,
} from '../services/television/televisionRewatches.js'
import {
  episodeKey,
  episodeProgressKeySet,
  listEpisodeProgress,
  setEpisodeWatched,
  setSeasonWatched,
} from '../services/television/televisionEpisodeProgress.js'

const REWATCH_UNDO_PREFIX = 'betterme-tv-rewatch-undo-'

const route = useRoute()
const router = useRouter()

const media = ref(null)
const libraryItem = ref(null)
const collections = ref([])
const rewatches = ref([])
const watchedKeys = ref(new Set())
const rewatchUndo = ref(null)

const isLoading = ref(true)
const errorMessage = ref('')
const actionError = ref('')
const isSaving = ref(false)
const isStartingRewatch = ref(false)
const isCancellingRewatch = ref(false)
const episodeBusy = ref(false)

const userId = ref(null)

const mediaType = computed(() => {
  const raw = String(route.params.mediaType ?? '').toLowerCase()
  return raw === 'tv' ? 'tv' : raw === 'movie' ? 'movie' : ''
})

const mediaId = computed(() => String(route.params.tmdbId ?? ''))

const isInLibrary = computed(() => Boolean(libraryItem.value?.id))

const canStartRewatch = computed(() => canStartTelevisionRewatch(libraryItem.value))

const rewatchInProgress = computed(() => {
  if (!libraryItem.value) return false
  if (rewatchUndo.value) return true
  const emptyCurrent = !libraryItem.value.date_start && !libraryItem.value.date_end
  const last = rewatches.value[rewatches.value.length - 1]
  return emptyCurrent && Boolean(last?.date_start || last?.date_end)
})

const regularSeasons = computed(() => {
  const list = Array.isArray(media.value?.seasons) ? media.value.seasons : []
  return list.filter((s) => Number(s?.season_number) > 0)
})

function returnToSearch() {
  const isEmbed = route.path.startsWith('/embed')
  router.push({ name: isEmbed ? 'embed-television' : 'television' })
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function readRewatchUndo(id) {
  try {
    const raw = sessionStorage.getItem(`${REWATCH_UNDO_PREFIX}${id}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeRewatchUndo(id, undo) {
  if (!id) return
  if (!undo) {
    sessionStorage.removeItem(`${REWATCH_UNDO_PREFIX}${id}`)
    return
  }
  sessionStorage.setItem(`${REWATCH_UNDO_PREFIX}${id}`, JSON.stringify(undo))
}

async function loadCollections() {
  if (!userId.value) {
    collections.value = []
    return
  }
  try {
    collections.value = await listTelevisionCollections(supabase, userId.value)
  } catch (err) {
    console.warn(err)
    collections.value = []
  }
}

async function loadLibraryState() {
  if (!userId.value || !mediaType.value || !mediaId.value) {
    libraryItem.value = null
    rewatches.value = []
    watchedKeys.value = new Set()
    rewatchUndo.value = null
    return
  }

  libraryItem.value = await getTelevisionMediaByTmdb(
    supabase,
    userId.value,
    mediaType.value,
    mediaId.value,
  )

  if (!libraryItem.value?.id) {
    rewatches.value = []
    watchedKeys.value = new Set()
    rewatchUndo.value = null
    return
  }

  rewatchUndo.value = readRewatchUndo(libraryItem.value.id)
  rewatches.value = await listTelevisionRewatches(supabase, userId.value, libraryItem.value.id)

  if (libraryItem.value.media_type === 'tv') {
    const rows = await listEpisodeProgress(supabase, userId.value, libraryItem.value.id)
    watchedKeys.value = episodeProgressKeySet(rows)
  } else {
    watchedKeys.value = new Set()
  }
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
  actionError.value = ''
  media.value = null

  try {
    media.value = await getTmdbDetailsBilingual(mediaType.value, mediaId.value)
    const title =
      media.value?.title ||
      media.value?.name ||
      media.value?.original_title ||
      media.value?.original_name
    if (title) document.title = `${title} · BetterMe`
    await loadLibraryState()
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Impossible de charger la fiche TMDB.'
  } finally {
    isLoading.value = false
  }
}

async function addToLibrary(collection) {
  if (!userId.value || !media.value || isSaving.value) return
  isSaving.value = true
  actionError.value = ''
  try {
    libraryItem.value = await upsertTelevisionMediaFromTmdb(supabase, userId.value, media.value, {
      collection,
    })
    await loadCollections()
    await loadLibraryState()
  } catch (err) {
    console.error(err)
    actionError.value = err.message || 'Impossible d’ajouter à ta télé.'
  } finally {
    isSaving.value = false
  }
}

async function onCollectionCommit(name) {
  if (!userId.value || !libraryItem.value?.id || isSaving.value) return
  isSaving.value = true
  actionError.value = ''
  try {
    const patch = { collection: name }
    if (name === TELEVISION_COLLECTION_EN_COURS && !libraryItem.value.date_start) {
      patch.dateStart = todayIso()
    }
    if (name === TELEVISION_COLLECTION_TERMINE) {
      if (!libraryItem.value.date_start) patch.dateStart = todayIso()
      if (!libraryItem.value.date_end) patch.dateEnd = todayIso()
    }
    libraryItem.value = await updateTelevisionMedia(
      supabase,
      userId.value,
      libraryItem.value.id,
      patch,
    )
    await loadCollections()
  } catch (err) {
    console.error(err)
    actionError.value = err.message || 'Impossible de mettre à jour la collection.'
  } finally {
    isSaving.value = false
  }
}

async function onDateChange(field, value) {
  if (!userId.value || !libraryItem.value?.id || isSaving.value) return
  isSaving.value = true
  actionError.value = ''
  try {
    const patch =
      field === 'dateStart' ? { dateStart: value } : { dateEnd: value }
    libraryItem.value = await updateTelevisionMedia(
      supabase,
      userId.value,
      libraryItem.value.id,
      patch,
    )
  } catch (err) {
    console.error(err)
    actionError.value = err.message || 'Impossible de mettre à jour la date.'
  } finally {
    isSaving.value = false
  }
}

async function removeFromLibrary() {
  if (!userId.value || !libraryItem.value?.id || isSaving.value) return
  if (!window.confirm('Retirer ce titre de ta télé ?')) return
  isSaving.value = true
  actionError.value = ''
  try {
    writeRewatchUndo(libraryItem.value.id, null)
    await deleteTelevisionMedia(supabase, userId.value, libraryItem.value.id)
    libraryItem.value = null
    rewatches.value = []
    watchedKeys.value = new Set()
    rewatchUndo.value = null
  } catch (err) {
    console.error(err)
    actionError.value = err.message || 'Impossible de retirer ce titre.'
  } finally {
    isSaving.value = false
  }
}

async function onStartRewatch() {
  if (!userId.value || !libraryItem.value || isStartingRewatch.value) return
  isStartingRewatch.value = true
  actionError.value = ''
  try {
    const result = await startTelevisionRewatch(supabase, userId.value, libraryItem.value)
    libraryItem.value = result.media
    rewatches.value = result.rewatches
    rewatchUndo.value = result.undo
    writeRewatchUndo(libraryItem.value.id, result.undo)
    watchedKeys.value = new Set()
  } catch (err) {
    console.error(err)
    actionError.value = err.message || 'Impossible de démarrer le re-regardage.'
  } finally {
    isStartingRewatch.value = false
  }
}

async function onCancelRewatch() {
  if (!userId.value || !libraryItem.value || isCancellingRewatch.value) return
  isCancellingRewatch.value = true
  actionError.value = ''
  try {
    const result = await cancelTelevisionRewatch(
      supabase,
      userId.value,
      libraryItem.value,
      rewatchUndo.value,
      rewatches.value,
    )
    libraryItem.value = result.media
    rewatches.value = result.rewatches
    rewatchUndo.value = null
    writeRewatchUndo(libraryItem.value.id, null)
    if (libraryItem.value.media_type === 'tv') {
      const rows = await listEpisodeProgress(supabase, userId.value, libraryItem.value.id)
      watchedKeys.value = episodeProgressKeySet(rows)
    }
  } catch (err) {
    console.error(err)
    actionError.value = err.message || 'Impossible d’annuler le re-regardage.'
  } finally {
    isCancellingRewatch.value = false
  }
}

async function onUpdateRewatch({ rewatchId, field, value }) {
  if (!userId.value) return
  actionError.value = ''
  try {
    const input =
      field === 'dateStart' ? { dateStart: value } : { dateEnd: value }
    const updated = await updateTelevisionRewatch(supabase, userId.value, rewatchId, input)
    rewatches.value = rewatches.value.map((row) => (row.id === updated.id ? updated : row))
  } catch (err) {
    console.error(err)
    actionError.value = err.message || 'Impossible de mettre à jour le passage.'
  }
}

async function maybePromoteOnEpisodeWatch() {
  if (!libraryItem.value?.id || !userId.value) return
  const collection = String(libraryItem.value.collection || '')
  if (collection === TELEVISION_COLLECTION_A_REGARDER) {
    libraryItem.value = await updateTelevisionMedia(supabase, userId.value, libraryItem.value.id, {
      collection: TELEVISION_COLLECTION_EN_COURS,
      dateStart: libraryItem.value.date_start || todayIso(),
    })
  }
}

async function maybeMarkSeriesFinished() {
  if (!libraryItem.value?.id || libraryItem.value.media_type !== 'tv') return
  if (!regularSeasons.value.length) return

  // Nécessite d’avoir chargé chaque saison pour connaître les numéros d’épisodes :
  // on se base uniquement sur episode_count TMDB + clés watched (approximation).
  for (const season of regularSeasons.value) {
    const seasonNumber = Number(season.season_number)
    const expected = Number(season.episode_count) || 0
    if (expected <= 0) continue
    let watched = 0
    for (let ep = 1; ep <= expected; ep += 1) {
      if (watchedKeys.value.has(episodeKey(seasonNumber, ep))) watched += 1
    }
    if (watched < expected) return
  }

  if (libraryItem.value.collection !== TELEVISION_COLLECTION_TERMINE) {
    libraryItem.value = await updateTelevisionMedia(supabase, userId.value, libraryItem.value.id, {
      collection: TELEVISION_COLLECTION_TERMINE,
      dateStart: libraryItem.value.date_start || todayIso(),
      dateEnd: libraryItem.value.date_end || todayIso(),
    })
  }
}

async function onToggleEpisode({ seasonNumber, episodeNumber, watched }) {
  if (!userId.value || !libraryItem.value?.id || episodeBusy.value) return
  episodeBusy.value = true
  actionError.value = ''
  try {
    await setEpisodeWatched(
      supabase,
      userId.value,
      libraryItem.value.id,
      seasonNumber,
      episodeNumber,
      watched,
    )
    const next = new Set(watchedKeys.value)
    const key = episodeKey(seasonNumber, episodeNumber)
    if (watched) next.add(key)
    else next.delete(key)
    watchedKeys.value = next

    if (watched) {
      await maybePromoteOnEpisodeWatch()
      await maybeMarkSeriesFinished()
    }
  } catch (err) {
    console.error(err)
    actionError.value = err.message || 'Impossible de mettre à jour l’épisode.'
  } finally {
    episodeBusy.value = false
  }
}

async function onToggleSeason({ seasonNumber, episodeNumbers, watched }) {
  if (!userId.value || !libraryItem.value?.id || episodeBusy.value) return
  episodeBusy.value = true
  actionError.value = ''
  try {
    const rows = await setSeasonWatched(
      supabase,
      userId.value,
      libraryItem.value.id,
      seasonNumber,
      episodeNumbers,
      watched,
    )
    watchedKeys.value = episodeProgressKeySet(rows)

    if (watched) {
      await maybePromoteOnEpisodeWatch()
      await maybeMarkSeriesFinished()
    }
  } catch (err) {
    console.error(err)
    actionError.value = err.message || 'Impossible de mettre à jour la saison.'
  } finally {
    episodeBusy.value = false
  }
}

async function initUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) userId.value = user.id
}

onMounted(async () => {
  await initUser()
  await loadCollections()
  await loadDetails()
})

onActivated(async () => {
  if (userId.value) {
    await loadLibraryState()
  }
})

watch(
  () => [mediaType.value, mediaId.value],
  () => loadDetails(),
)

watch(userId, async (id) => {
  if (!id) return
  await loadCollections()
  await loadLibraryState()
})
</script>

<template>
  <div class="tv-detail-page">
    <header class="tv-detail-page__header">
      <button type="button" class="tv-detail-page__back" @click="returnToSearch">
        ← Retour
      </button>
    </header>

    <div v-if="isLoading" class="tv-detail-page__status">Chargement de la fiche…</div>
    <div v-else-if="!media" class="tv-detail-page__error">
      {{ errorMessage || 'Contenu introuvable.' }}
    </div>

    <TelevisionMediaFiche v-else :media="media">
      <template #actions>
        <template v-if="!isInLibrary">
          <button
            type="button"
            class="tv-action-btn"
            :disabled="isSaving || !userId"
            @click="addToLibrary(TELEVISION_COLLECTION_A_REGARDER)"
          >
            À regarder
          </button>
          <button
            type="button"
            class="tv-action-btn tv-action-btn--primary"
            :disabled="isSaving || !userId"
            @click="addToLibrary(TELEVISION_COLLECTION_EN_COURS)"
          >
            En cours
          </button>
          <button
            type="button"
            class="tv-action-btn"
            :disabled="isSaving || !userId"
            @click="addToLibrary(TELEVISION_COLLECTION_TERMINE)"
          >
            Terminé
          </button>
        </template>
        <button
          v-else
          type="button"
          class="tv-action-btn tv-action-btn--danger"
          :disabled="isSaving"
          @click="removeFromLibrary"
        >
          Retirer
        </button>
      </template>

      <template v-if="errorMessage || actionError" #alert>
        <div v-if="errorMessage" class="tv-detail-page__error">{{ errorMessage }}</div>
        <div v-if="actionError" class="tv-detail-page__error">{{ actionError }}</div>
      </template>

      <template v-if="isInLibrary" #tracking>
        <section class="tv-tracking">
          <div class="tv-tracking__row">
            <label class="tv-tracking__field">
              <span class="tv-tracking__label">Collection</span>
              <ReadingCollectionCombobox
                :model-value="libraryItem.collection || ''"
                :collections="collections"
                :disabled="isSaving"
                placeholder="À regarder, En cours…"
                appearance="form"
                @commit="onCollectionCommit"
              />
            </label>
            <label class="tv-tracking__field">
              <span class="tv-tracking__label">Début</span>
              <input
                type="date"
                class="tv-tracking__input"
                :value="libraryItem.date_start || ''"
                :disabled="isSaving"
                @change="onDateChange('dateStart', $event.target.value)"
              />
            </label>
            <label class="tv-tracking__field">
              <span class="tv-tracking__label">Fin</span>
              <input
                type="date"
                class="tv-tracking__input"
                :value="libraryItem.date_end || ''"
                :disabled="isSaving"
                @change="onDateChange('dateEnd', $event.target.value)"
              />
            </label>
          </div>

          <TelevisionRewatchesSection
            :rewatches="rewatches"
            :disabled="isSaving"
            :is-starting="isStartingRewatch"
            :is-cancelling="isCancellingRewatch"
            :rewatch-in-progress="rewatchInProgress"
            :can-start-rewatch="canStartRewatch"
            @start-rewatch="onStartRewatch"
            @cancel-rewatch="onCancelRewatch"
            @update-rewatch="onUpdateRewatch"
          />

          <TelevisionSeasonProgress
            v-if="mediaType === 'tv'"
            :tmdb-id="mediaId"
            :seasons="media.seasons || []"
            :watched-keys="watchedKeys"
            :disabled="isSaving"
            :busy="episodeBusy"
            @toggle-episode="onToggleEpisode"
            @toggle-season="onToggleSeason"
          />
        </section>
      </template>
    </TelevisionMediaFiche>

    <p v-if="!userId && !isLoading" class="tv-detail-page__status">
      Connecte-toi pour ajouter des titres à ta télé.
    </p>
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
  margin-bottom: 0.75rem;
}

.tv-action-btn {
  padding: 0.4rem 0.7rem;
  border-radius: 10px;
  border: 1px solid rgba(173, 129, 190, 0.4);
  background: rgba(255, 255, 255, 0.85);
  color: #6b4f7c;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.tv-action-btn--primary {
  background: rgba(173, 129, 190, 0.28);
  border-color: rgba(173, 129, 190, 0.55);
}

.tv-action-btn--danger {
  color: #b02a37;
  border-color: rgba(176, 42, 55, 0.35);
}

.tv-action-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.tv-tracking {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.tv-tracking__row {
  display: grid;
  grid-template-columns: minmax(10rem, 1.4fr) repeat(2, minmax(8rem, 1fr));
  gap: 0.65rem;
}

.tv-tracking__field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;
}

.tv-tracking__label {
  font-size: 0.78rem;
  font-weight: 700;
  color: #6b4f7c;
}

.tv-tracking__input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.5rem 0.6rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.45);
  background: rgba(255, 255, 255, 0.95);
  font: inherit;
  color: #2c3e50;
}

@media (max-width: 720px) {
  .tv-tracking__row {
    grid-template-columns: 1fr;
  }
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
  .tv-action-btn,
  .tv-tracking__input {
    background: rgba(35, 30, 48, 0.9);
    color: #f0e8f8;
  }
  .tv-tracking__label {
    color: #c9b0d8;
  }
}
</style>
