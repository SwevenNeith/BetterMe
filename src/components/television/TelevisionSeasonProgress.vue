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

const episodes = computed(() => seasonDetail.value?.episodes ?? [])

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
    seasonDetail.value = detail
  } catch (err) {
    if (requestId !== seasonRequestId) return
    console.error(err)
    seasonError.value = err?.message || 'Impossible de charger la saison.'
  } finally {
    if (requestId === seasonRequestId) isLoadingSeason.value = false
  }
}

function onSeasonChange() {
  if (selectedSeason.value == null || selectedSeason.value === '') {
    seasonDetail.value = null
    return
  }
  loadSeason(selectedSeason.value)
}

function onToggleEpisode(episodeNumber, event) {
  if (props.disabled || props.busy || selectedSeason.value == null) return
  emit('toggle-episode', {
    seasonNumber: selectedSeason.value,
    episodeNumber,
    watched: Boolean(event?.target?.checked),
  })
}

function onToggleSeason(event) {
  if (props.disabled || props.busy || selectedSeason.value == null) return
  emit('toggle-season', {
    seasonNumber: selectedSeason.value,
    episodeNumbers: seasonEpisodeNumbers.value,
    watched: Boolean(event?.target?.checked),
  })
}

watch(
  seasonOptions,
  (options) => {
    if (!options.length) {
      selectedSeason.value = null
      return
    }
    const preferred =
      options.find((s) => s.seasonNumber === 1) ||
      options.find((s) => s.seasonNumber > 0) ||
      options[0]
    if (selectedSeason.value == null) {
      selectedSeason.value = preferred.seasonNumber
      loadSeason(preferred.seasonNumber)
    }
  },
  { immediate: true },
)

watch(
  () => props.tmdbId,
  () => {
    if (selectedSeason.value != null) loadSeason(selectedSeason.value)
  },
)
</script>

<template>
  <section class="tv-season-progress">
    <header class="tv-season-progress__header">
      <h3 class="tv-season-progress__title">Suivi des épisodes</h3>
      <p class="tv-season-progress__hint">Coche les épisodes (ou toute une saison) que tu as vus.</p>
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
  margin-bottom: 0.75rem;
}

.tv-season-progress__label {
  font-size: 0.78rem;
  font-weight: 700;
  color: #6b4f7c;
}

.tv-season-progress__select {
  width: 100%;
  max-width: 22rem;
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
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-height: 22rem;
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
