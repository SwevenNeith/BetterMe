<script setup>
import { computed, ref, watch } from 'vue'
import { getTmdbSeason } from '../../services/television/tmdb.js'
import { episodeKey } from '../../services/television/televisionEpisodeProgress.js'

const props = defineProps({
  tmdbId: {
    type: [Number, String],
    required: true,
  },
  seasons: {
    type: Array,
    default: () => [],
  },
  /** @type {Set<string> | string[]} */
  watchedKeys: {
    type: [Set, Array],
    default: () => new Set(),
  },
  /** Saison à afficher en priorité (ex. saison en cours). */
  preferredSeasonNumber: {
    type: Number,
    default: null,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  busy: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['toggle-episode', 'toggle-season'])

const selectedSeason = ref(null)
const seasonDetail = ref(null)
const isLoadingSeason = ref(false)
const seasonError = ref('')
const userPickedSeason = ref(false)
let seasonRequestId = 0

const seasonOptions = computed(() => {
  const list = Array.isArray(props.seasons) ? props.seasons : []
  return list
    .filter((s) => s && Number.isFinite(Number(s.season_number)))
    .map((s) => ({
      seasonNumber: Number(s.season_number),
      name: String(s.name || '').trim() || `Saison ${s.season_number}`,
      episodeCount: Number(s.episode_count) || 0,
    }))
    .sort((a, b) => a.seasonNumber - b.seasonNumber)
})

const watchedSet = computed(() => {
  if (props.watchedKeys instanceof Set) return props.watchedKeys
  return new Set(props.watchedKeys ?? [])
})

const episodes = computed(() => {
  const loaded = seasonDetail.value?.episodes ?? []
  if (!detailMatchesSeason(selectedSeason.value)) return []

  const option = seasonOptions.value.find((s) => s.seasonNumber === selectedSeason.value)
  const expected = Number(option?.episodeCount) || 0
  if (expected <= 0 || loaded.length >= expected) return loaded

  const byNumber = new Map(loaded.map((ep) => [ep.episodeNumber, ep]))
  const padded = []
  for (let n = 1; n <= expected; n += 1) {
    padded.push(
      byNumber.get(n) || {
        id: null,
        episodeNumber: n,
        name: `Épisode ${n}`,
        overview: '',
        airDate: null,
        runtime: null,
        stillPath: null,
      },
    )
  }
  // Conserver d’éventuels épisodes hors plage 1..expected
  for (const ep of loaded) {
    if (ep.episodeNumber > expected) padded.push(ep)
  }
  return padded
})

const seasonEpisodeNumbers = computed(() =>
  episodes.value.map((ep) => ep.episodeNumber).filter((n) => n > 0),
)

const watchedInSeasonCount = computed(() => {
  const season = selectedSeason.value
  if (season == null) return 0
  return seasonEpisodeNumbers.value.filter((n) =>
    watchedSet.value.has(episodeKey(season, n)),
  ).length
})

const allSeasonWatched = computed(() => {
  const total = seasonEpisodeNumbers.value.length
  return total > 0 && watchedInSeasonCount.value >= total
})

const someSeasonWatched = computed(
  () => watchedInSeasonCount.value > 0 && !allSeasonWatched.value,
)

function isEpisodeWatched(episodeNumber) {
  if (selectedSeason.value == null) return false
  return watchedSet.value.has(episodeKey(selectedSeason.value, episodeNumber))
}

function formatAirDate(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const date = new Date(`${raw}T00:00:00`)
  if (Number.isNaN(date.getTime())) return raw
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function resolvePreferredSeason(options) {
  if (!options.length) return null
  const preferred = Number(props.preferredSeasonNumber)
  if (Number.isFinite(preferred) && options.some((s) => s.seasonNumber === preferred)) {
    return preferred
  }
  const firstRegular =
    options.find((s) => s.seasonNumber === 1) ||
    options.find((s) => s.seasonNumber > 0) ||
    options[0]
  return firstRegular.seasonNumber
}

async function loadSeason(seasonNumber) {
  const season = Number(seasonNumber)
  if (!Number.isFinite(season) || season < 0) return

  const requestId = ++seasonRequestId
  isLoadingSeason.value = true
  seasonError.value = ''
  seasonDetail.value = null

  try {
    const detail = await getTmdbSeason(props.tmdbId, season, 'fr-FR')
    if (requestId !== seasonRequestId) return
    // Sécurité : ignorer une réponse qui ne correspond pas à la saison demandée
    if (Number(detail?.seasonNumber) !== season) {
      seasonError.value = 'Réponse saison incohérente.'
      return
    }
    seasonDetail.value = detail
  } catch (err) {
    if (requestId !== seasonRequestId) return
    console.error(err)
    seasonError.value = err?.message || 'Impossible de charger la saison.'
  } finally {
    if (requestId === seasonRequestId) isLoadingSeason.value = false
  }
}

function detailMatchesSeason(seasonNumber) {
  return (
    seasonDetail.value != null &&
    Number(seasonDetail.value.seasonNumber) === Number(seasonNumber)
  )
}

function selectSeason(seasonNumber, { userInitiated = false } = {}) {
  if (userInitiated) userPickedSeason.value = true
  if (seasonNumber == null || seasonNumber === '') {
    selectedSeason.value = null
    seasonDetail.value = null
    return
  }

  const season = Number(seasonNumber)
  if (!Number.isFinite(season) || season < 0) return

  // Ne pas court-circuiter si le détail affiché est celui d’une autre saison
  // (v-model du <select> met à jour selectedSeason avant @change).
  if (selectedSeason.value === season && detailMatchesSeason(season)) {
    return
  }

  selectedSeason.value = season
  loadSeason(season)
}

function onSeasonChange() {
  selectSeason(selectedSeason.value, { userInitiated: true })
}

function onToggleEpisode(episodeNumber, event) {
  if (props.disabled || props.busy || selectedSeason.value == null) return
  if (!detailMatchesSeason(selectedSeason.value)) return
  emit('toggle-episode', {
    seasonNumber: selectedSeason.value,
    episodeNumber,
    watched: Boolean(event?.target?.checked),
    seasonEpisodeNumbers: seasonEpisodeNumbers.value,
  })
}

function onToggleSeason(event) {
  if (props.disabled || props.busy || selectedSeason.value == null) return
  if (!detailMatchesSeason(selectedSeason.value)) return
  emit('toggle-season', {
    seasonNumber: selectedSeason.value,
    episodeNumbers: seasonEpisodeNumbers.value,
    watched: Boolean(event?.target?.checked),
  })
}

watch(
  [seasonOptions, () => props.preferredSeasonNumber],
  ([options]) => {
    if (!options.length) {
      selectedSeason.value = null
      seasonDetail.value = null
      return
    }

    const stillValid = options.some((s) => s.seasonNumber === selectedSeason.value)
    if (userPickedSeason.value && stillValid) {
      if (!detailMatchesSeason(selectedSeason.value) && !isLoadingSeason.value) {
        loadSeason(selectedSeason.value)
      }
      return
    }

    const next = resolvePreferredSeason(options)
    if (next == null) return
    if (selectedSeason.value === next && detailMatchesSeason(next)) return
    selectSeason(next)
  },
  { immediate: true },
)

watch(
  () => props.tmdbId,
  () => {
    userPickedSeason.value = false
    seasonDetail.value = null
    if (selectedSeason.value != null) loadSeason(selectedSeason.value)
  },
)
</script>

<template>
  <section class="tv-season-progress">
    <header class="tv-season-progress__header">
      <h3 class="tv-season-progress__title">Suivi des épisodes</h3>
      <p class="tv-season-progress__hint">
        Cocher un épisode coche aussi tous les précédents ; décocher décoche aussi les suivants.
      </p>
    </header>

    <label v-if="seasonOptions.length" class="tv-season-progress__select-wrap">
      <span class="tv-season-progress__label">Saison</span>
      <select
        v-model.number="selectedSeason"
        class="tv-season-progress__select"
        :disabled="disabled || busy"
        @change="onSeasonChange"
      >
        <option
          v-for="season in seasonOptions"
          :key="season.seasonNumber"
          :value="season.seasonNumber"
        >
          {{ season.name }}
          <template v-if="season.episodeCount"> ({{ season.episodeCount }} ép.)</template>
        </option>
      </select>
    </label>
    <p v-else class="tv-season-progress__status">Aucune saison disponible.</p>

    <p v-if="isLoadingSeason" class="tv-season-progress__status">Chargement des épisodes…</p>
    <p v-else-if="seasonError" class="tv-season-progress__error">{{ seasonError }}</p>

    <template v-else-if="episodes.length">
      <label class="tv-season-progress__season-check">
        <input
          type="checkbox"
          :checked="allSeasonWatched"
          :indeterminate.prop="someSeasonWatched"
          :disabled="disabled || busy"
          @change="onToggleSeason"
        />
        <span>
          Toute la saison
          <span class="tv-season-progress__count">
            ({{ watchedInSeasonCount }}/{{ seasonEpisodeNumbers.length }})
          </span>
        </span>
      </label>

      <ul class="tv-season-progress__list">
        <li v-for="ep in episodes" :key="ep.episodeNumber" class="tv-season-progress__item">
          <label class="tv-season-progress__episode">
            <input
              type="checkbox"
              :checked="isEpisodeWatched(ep.episodeNumber)"
              :disabled="disabled || busy"
              @change="onToggleEpisode(ep.episodeNumber, $event)"
            />
            <span class="tv-season-progress__ep-meta">
              <span class="tv-season-progress__ep-title">
                E{{ ep.episodeNumber }} · {{ ep.name }}
              </span>
              <span v-if="ep.airDate" class="tv-season-progress__ep-date">
                {{ formatAirDate(ep.airDate) }}
              </span>
            </span>
          </label>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.tv-season-progress {
  width: 100%;
  box-sizing: border-box;
  margin-top: 1rem;
  padding: 0.85rem 0.9rem;
  border-radius: 14px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.55);
}

.tv-season-progress__header {
  margin-bottom: 0.75rem;
}

.tv-season-progress__title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 800;
  color: #5a4a68;
}

.tv-season-progress__hint {
  margin: 0.25rem 0 0;
  font-size: 0.78rem;
  color: #6c757d;
}

.tv-season-progress__select-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  width: 100%;
  margin-bottom: 0.75rem;
}

.tv-season-progress__label {
  font-size: 0.78rem;
  font-weight: 700;
  color: #6b4f7c;
}

.tv-season-progress__select {
  width: 100%;
  box-sizing: border-box;
  padding: 0.5rem 0.65rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.45);
  background: rgba(255, 255, 255, 0.95);
  font: inherit;
  font-weight: 600;
  color: #2c3e50;
}

.tv-season-progress__status,
.tv-season-progress__error {
  margin: 0;
  font-size: 0.85rem;
}

.tv-season-progress__status {
  color: #6c757d;
}

.tv-season-progress__error {
  color: #b02a37;
}

.tv-season-progress__season-check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.65rem;
  font-size: 0.88rem;
  font-weight: 700;
  color: #5a4a68;
  cursor: pointer;
}

.tv-season-progress__count {
  font-weight: 600;
  color: #6c757d;
}

.tv-season-progress__list {
  list-style: none;
  margin: 0;
  padding: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-height: 28rem;
  overflow: auto;
}

.tv-season-progress__item {
  border-radius: 8px;
  border: 1px solid rgba(213, 181, 234, 0.22);
  background: rgba(255, 255, 255, 0.7);
}

.tv-season-progress__episode {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  padding: 0.45rem 0.55rem;
  cursor: pointer;
}

.tv-season-progress__ep-meta {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.tv-season-progress__ep-title {
  font-size: 0.84rem;
  font-weight: 650;
  color: #2c3e50;
}

.tv-season-progress__ep-date {
  font-size: 0.74rem;
  color: #6c757d;
}

@media (prefers-color-scheme: dark) {
  .tv-season-progress {
    background: rgba(35, 30, 48, 0.75);
  }
  .tv-season-progress__title,
  .tv-season-progress__season-check,
  .tv-season-progress__ep-title {
    color: #f0e8f8;
  }
  .tv-season-progress__hint,
  .tv-season-progress__status,
  .tv-season-progress__count,
  .tv-season-progress__ep-date {
    color: #adb5bd;
  }
  .tv-season-progress__select,
  .tv-season-progress__item {
    background: rgba(30, 24, 42, 0.9);
    color: #f0e8f8;
  }
}
</style>
