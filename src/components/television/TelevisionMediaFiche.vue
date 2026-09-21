<script setup>
import { computed } from 'vue'
import { tmdbPosterUrl } from '../../services/television/tmdb.js'

const STATUS_FR = {
  Rumored: 'Rumeur',
  Planned: 'Planifié',
  'In Production': 'En production',
  'Post Production': 'Post-production',
  Released: 'Sorti',
  Canceled: 'Annulé',
  Cancelled: 'Annulé',
  'Returning Series': 'En cours',
  Ended: 'Terminée',
  Pilot: 'Pilote',
}

const props = defineProps({
  media: {
    type: Object,
    required: true,
  },
})

const isTv = computed(() => props.media?.media_type === 'tv')

const ficheTitle = computed(() => (isTv.value ? 'Fiche Série' : 'Fiche Film'))

const displayTitle = computed(
  () =>
    props.media?.title ||
    props.media?.name ||
    props.media?.original_title ||
    props.media?.original_name ||
    '—',
)

const originalTitle = computed(() => {
  const original = props.media?.original_title || props.media?.original_name || ''
  return original.trim() || '—'
})

const posterUrl = computed(() => tmdbPosterUrl(props.media?.poster_path, 'w500'))

const releaseDate = computed(() => {
  const raw = props.media?.release_date || props.media?.first_air_date || ''
  return formatFrenchDate(raw)
})

const genresLabel = computed(() => {
  const list = Array.isArray(props.media?.genres) ? props.media.genres : []
  return list.map((g) => g?.name).filter(Boolean).join(', ') || '—'
})

const runtimeLabel = computed(() => {
  if (isTv.value) {
    const seasons = props.media?.number_of_seasons
    const episodes = props.media?.number_of_episodes
    const parts = []
    if (seasons != null) parts.push(`${seasons} saison${seasons > 1 ? 's' : ''}`)
    if (episodes != null) parts.push(`${episodes} épisode${episodes > 1 ? 's' : ''}`)
    const epRuntime = Array.isArray(props.media?.episode_run_time)
      ? props.media.episode_run_time[0]
      : null
    if (epRuntime) parts.push(`~${epRuntime} min / ép.`)
    return parts.join(' · ') || '—'
  }
  const mins = Number(props.media?.runtime)
  if (!mins) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h <= 0) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
})

const statusLabel = computed(() => {
  const raw = String(props.media?.status || '').trim()
  if (!raw) return '—'
  return STATUS_FR[raw] || raw
})

const voteAverage = computed(() => Number(props.media?.vote_average) || 0)

const voteLabel = computed(() => {
  if (!voteAverage.value) return '—'
  return `${voteAverage.value.toFixed(1)} / 10`
})

const starCount = computed(() => Math.round((voteAverage.value / 10) * 5))

const overview = computed(() => {
  const text = String(props.media?.overview || '').trim()
  return text || 'Aucun synopsis disponible.'
})

const directorLabel = computed(() => {
  if (isTv.value) {
    const creators = Array.isArray(props.media?.created_by) ? props.media.created_by : []
    return creators.map((c) => c?.name).filter(Boolean).join(', ') || '—'
  }
  const crew = Array.isArray(props.media?.credits?.crew) ? props.media.credits.crew : []
  const directors = crew.filter((c) => c?.job === 'Director').map((c) => c?.name).filter(Boolean)
  return [...new Set(directors)].join(', ') || '—'
})

const directorFieldLabel = computed(() => (isTv.value ? 'Création' : 'Réalisateur'))

const frWatchProviders = computed(() => getFrWatchProviders(props.media))

const buyLabel = computed(() => formatProviderList(providerNames(frWatchProviders.value?.buy)))

const rentLabel = computed(() => formatProviderList(providerNames(frWatchProviders.value?.rent)))

const castList = computed(() => {
  if (isTv.value) return []
  const cast = Array.isArray(props.media?.credits?.cast) ? props.media.credits.cast : []
  return cast.slice(0, 6).map((person) => ({
    id: person.id,
    name: person.name,
    character: person.character,
    photo: tmdbPosterUrl(person.profile_path, 'w185'),
  }))
})

function getFrWatchProviders(media) {
  const providersRoot = media?.['watch/providers'] || media?.watch_providers || null
  const results = providersRoot?.results
  if (!results || typeof results !== 'object') return null
  return results.FR || null
}

function providerNames(list) {
  if (!Array.isArray(list)) return []
  const names = []
  const seen = new Set()
  for (const item of list) {
    const name = String(item?.provider_name || '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }
  return names
}

function formatProviderList(names) {
  return names.length ? names.join(', ') : '—'
}

function formatFrenchDate(value) {
  const raw = String(value || '').trim()
  if (!raw) return '—'
  const date = new Date(`${raw}T00:00:00`)
  if (Number.isNaN(date.getTime())) return raw
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}
</script>

<template>
  <article class="cinema-fiche" :aria-label="ficheTitle">
    <header class="cinema-fiche__header">
      <div class="cinema-filmstrip cinema-filmstrip--header" aria-hidden="true">
        <span v-for="n in 18" :key="`h-${n}`" class="cinema-filmstrip__hole" />
      </div>
      <div class="cinema-fiche__header-inner">
        <h2 class="cinema-fiche__title">{{ ficheTitle }}</h2>
        <div v-if="$slots.actions" class="cinema-fiche__actions">
          <slot name="actions" />
        </div>
      </div>
      <div class="cinema-filmstrip cinema-filmstrip--header" aria-hidden="true">
        <span v-for="n in 18" :key="`h2-${n}`" class="cinema-filmstrip__hole" />
      </div>
    </header>

    <slot name="alert" />

    <div v-if="$slots.tracking" class="cinema-fiche__tracking">
      <slot name="tracking" />
    </div>

    <div class="cinema-fiche__top">
      <div class="cinema-poster-frame">
        <div class="cinema-poster-frame__sprocket cinema-poster-frame__sprocket--left" aria-hidden="true">
          <span v-for="n in 8" :key="`pl-${n}`" class="cinema-poster-frame__hole" />
        </div>
        <div class="cinema-poster-frame__inner">
          <img
            v-if="posterUrl"
            :src="posterUrl"
            :alt="`Affiche de ${displayTitle}`"
            class="cinema-poster-frame__img"
          />
          <div v-else class="cinema-poster-frame__img cinema-poster-frame__img--placeholder">
            Affiche
          </div>
        </div>
        <div class="cinema-poster-frame__sprocket cinema-poster-frame__sprocket--right" aria-hidden="true">
          <span v-for="n in 8" :key="`pr-${n}`" class="cinema-poster-frame__hole" />
        </div>
      </div>

      <div class="cinema-fiche__panels">
        <section class="cinema-panel">
          <div class="cinema-field">
            <span class="cinema-field__label">Titre</span>
            <span class="cinema-field__value">{{ displayTitle }}</span>
          </div>
          <div class="cinema-field">
            <span class="cinema-field__label">Titre original</span>
            <span class="cinema-field__value">{{ originalTitle }}</span>
          </div>
          <div class="cinema-field">
            <span class="cinema-field__label">Type</span>
            <span class="cinema-field__value">{{ isTv ? 'Série' : 'Film' }}</span>
          </div>
          <div class="cinema-field">
            <span class="cinema-field__label">{{ directorFieldLabel }}</span>
            <span class="cinema-field__value">{{ directorLabel }}</span>
          </div>
          <div class="cinema-field">
            <span class="cinema-field__label">Genres</span>
            <span class="cinema-field__value">{{ genresLabel }}</span>
          </div>
        </section>

        <section class="cinema-panel cinema-panel--tech">
          <h3 class="cinema-panel__heading">Fiche technique</h3>
          <div class="cinema-field">
            <span class="cinema-field__label">Date de diffusion</span>
            <span class="cinema-field__value">{{ releaseDate }}</span>
          </div>
          <div class="cinema-field">
            <span class="cinema-field__label">Durée / format</span>
            <span class="cinema-field__value">{{ runtimeLabel }}</span>
          </div>
          <div class="cinema-field">
            <span class="cinema-field__label">Statut</span>
            <span class="cinema-field__value">{{ statusLabel }}</span>
          </div>
          <div class="cinema-field">
            <span class="cinema-field__label">Note</span>
            <span class="cinema-field__value">{{ voteLabel }}</span>
          </div>
          <div class="cinema-providers">
            <div class="cinema-field">
              <span class="cinema-field__label">Acheter</span>
              <span class="cinema-field__value">{{ buyLabel }}</span>
            </div>
            <div class="cinema-field">
              <span class="cinema-field__label">Louer</span>
              <span class="cinema-field__value">{{ rentLabel }}</span>
            </div>
          </div>
        </section>
      </div>
    </div>

    <template v-if="!isTv">
      <div class="cinema-section-bar" aria-hidden="true">
        <div class="cinema-filmstrip">
          <span v-for="n in 22" :key="`c-${n}`" class="cinema-filmstrip__hole" />
        </div>
        <h3 class="cinema-section-bar__title">Les personnages</h3>
        <div class="cinema-filmstrip">
          <span v-for="n in 22" :key="`c2-${n}`" class="cinema-filmstrip__hole" />
        </div>
      </div>

      <section class="cinema-cast-gallery" aria-label="Personnages">
        <article
          v-for="(person, index) in castList"
          :key="person.id"
          class="cinema-cast-card"
          :style="{ '--tilt': `${(index % 2 === 0 ? -1 : 1) * (1.8 + (index % 3) * 0.6)}deg` }"
        >
          <div class="cinema-cast-card__frame">
            <div class="cinema-cast-card__sprocket" aria-hidden="true">
              <span v-for="n in 5" :key="`cs-${person.id}-${n}`" class="cinema-cast-card__hole" />
            </div>
            <img
              v-if="person.photo"
              :src="person.photo"
              :alt="person.name"
              class="cinema-cast-card__photo"
              loading="lazy"
            />
            <div v-else class="cinema-cast-card__photo cinema-cast-card__photo--placeholder">
              {{ person.name?.slice(0, 1) || '?' }}
            </div>
            <div class="cinema-cast-card__sprocket" aria-hidden="true">
              <span v-for="n in 5" :key="`cs2-${person.id}-${n}`" class="cinema-cast-card__hole" />
            </div>
          </div>
          <p class="cinema-cast-card__name">{{ person.name }}</p>
          <p class="cinema-cast-card__role">{{ person.character || '—' }}</p>
        </article>
        <p v-if="!castList.length" class="cinema-empty">Aucun casting disponible.</p>
      </section>
    </template>

    <div class="cinema-section-bar" aria-hidden="true">
      <div class="cinema-filmstrip">
        <span v-for="n in 22" :key="`s-${n}`" class="cinema-filmstrip__hole" />
      </div>
      <h3 class="cinema-section-bar__title">L'histoire</h3>
      <div class="cinema-filmstrip">
        <span v-for="n in 22" :key="`s2-${n}`" class="cinema-filmstrip__hole" />
      </div>
    </div>

    <section class="cinema-panel cinema-panel--story">
      <div class="cinema-lined cinema-lined--story">
        <p class="cinema-lined__story">{{ overview }}</p>
      </div>
    </section>

    <section class="cinema-avis">
      <div class="cinema-section-bar cinema-section-bar--compact" aria-hidden="true">
        <div class="cinema-filmstrip">
          <span v-for="n in 16" :key="`a-${n}`" class="cinema-filmstrip__hole" />
        </div>
        <h3 class="cinema-section-bar__title">Note TMDB</h3>
        <div class="cinema-filmstrip">
          <span v-for="n in 16" :key="`a2-${n}`" class="cinema-filmstrip__hole" />
        </div>
      </div>
      <div class="cinema-avis__body">
        <div class="cinema-stars" aria-label="Note sur 5">
          <span
            v-for="n in 5"
            :key="n"
            class="cinema-stars__star"
            :class="{ 'cinema-stars__star--on': n <= starCount }"
            aria-hidden="true"
          >
            ★
          </span>
        </div>
        <p class="cinema-avis__score">{{ voteLabel }}</p>
      </div>
    </section>
  </article>
</template>

<style scoped>
.cinema-fiche {
  --cinema-ink: #3d2f4a;
  --cinema-muted: #6b5a78;
  --cinema-line: rgba(173, 129, 190, 0.45);
  --cinema-strip: #72a098;
  --cinema-strip-deep: #5a867f;
  --cinema-strip-light: #95d1aa;
  --cinema-cream: #fffefb;
  --cinema-lilac: #faf6ff;
  --cinema-accent: #ad81be;
  --cinema-line-step: 1.75rem;

  width: 100%;
  box-sizing: border-box;
  padding: 0 0 1.5rem;
  border: 1px solid rgba(173, 129, 190, 0.4);
  border-radius: 16px;
  background:
    radial-gradient(ellipse at top, rgba(213, 181, 234, 0.18), transparent 55%),
    linear-gradient(180deg, var(--cinema-cream) 0%, var(--cinema-lilac) 100%);
  box-shadow: 0 10px 32px rgba(92, 62, 112, 0.12);
  overflow: hidden;
  color: var(--cinema-ink);
}

.cinema-fiche__header {
  margin-bottom: 1.25rem;
}

.cinema-fiche__header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem 1.25rem;
  background: linear-gradient(135deg, rgba(213, 181, 234, 0.35), rgba(173, 129, 190, 0.18));
}

.cinema-fiche__title {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(1.55rem, 3.5vw, 2.1rem);
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--cinema-ink);
}

.cinema-fiche__actions {
  display: flex;
  gap: 0.35rem;
}

.cinema-fiche__tracking {
  margin: 0 1.25rem 1rem;
}

.cinema-filmstrip {
  display: flex;
  align-items: center;
  justify-content: space-evenly;
  gap: 0.35rem;
  min-height: 0.85rem;
  padding: 0.28rem 0.55rem;
  background: linear-gradient(180deg, var(--cinema-strip-light), var(--cinema-strip-deep));
}

.cinema-filmstrip--header {
  min-height: 1rem;
}

.cinema-filmstrip__hole {
  width: 0.55rem;
  height: 0.42rem;
  border-radius: 0.12rem;
  background: rgba(255, 254, 251, 0.92);
  box-shadow: inset 0 0 0 1px rgba(61, 47, 74, 0.08);
  flex-shrink: 0;
}

.cinema-section-bar {
  margin: 1.35rem 0 1rem;
}

.cinema-section-bar--compact {
  margin: 0 0 0.85rem;
}

.cinema-section-bar__title {
  margin: 0;
  padding: 0.45rem 1rem;
  text-align: center;
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #fff;
  background: linear-gradient(135deg, var(--cinema-strip-light), var(--cinema-strip));
}

.cinema-fiche__top {
  display: grid;
  grid-template-columns: minmax(140px, 200px) minmax(0, 1fr);
  gap: 1.1rem;
  padding: 0 1.25rem;
  align-items: start;
}

.cinema-poster-frame {
  display: grid;
  grid-template-columns: 0.7rem minmax(0, 1fr) 0.7rem;
  background: var(--cinema-strip-deep);
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 10px 24px rgba(74, 53, 96, 0.22);
  transform: rotate(-1.5deg);
}

.cinema-poster-frame__sprocket {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-evenly;
  padding: 0.35rem 0;
  background: linear-gradient(180deg, var(--cinema-strip-light), var(--cinema-strip-deep));
}

.cinema-poster-frame__hole,
.cinema-cast-card__hole {
  width: 0.38rem;
  height: 0.32rem;
  border-radius: 0.08rem;
  background: rgba(255, 254, 251, 0.9);
}

.cinema-poster-frame__inner {
  background: #2a2235;
  padding: 0.35rem;
}

.cinema-poster-frame__img {
  display: block;
  width: 100%;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  border-radius: 2px;
}

.cinema-poster-frame__img--placeholder {
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, #f4eef8, #e8d9f0);
  color: var(--cinema-accent);
  font-weight: 700;
  font-size: 0.85rem;
}

.cinema-fiche__panels {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  min-width: 0;
}

.cinema-panel {
  padding: 0.85rem 1rem;
  border: 1px solid rgba(173, 129, 190, 0.4);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.72);
}

.cinema-panel--tech {
  background: rgba(244, 234, 252, 0.55);
}

.cinema-panel__heading {
  margin: 0 0 0.65rem;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cinema-accent);
}

.cinema-field {
  display: grid;
  grid-template-columns: minmax(7.5rem, 9.5rem) minmax(0, 1fr);
  gap: 0.45rem 0.75rem;
  align-items: end;
  margin-bottom: 0.55rem;
}

.cinema-field:last-child {
  margin-bottom: 0;
}

.cinema-field__label {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--cinema-muted);
  padding-bottom: 0.15rem;
}

.cinema-field__value {
  min-width: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--cinema-ink);
  line-height: 1.35;
  border-bottom: 1px dotted var(--cinema-line);
  padding: 0.05rem 0 0.2rem;
  word-break: break-word;
}

.cinema-providers {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
  margin-top: 0.35rem;
}

.cinema-providers .cinema-field {
  grid-template-columns: 1fr;
  gap: 0.2rem;
  margin-bottom: 0;
}

.cinema-cast-gallery {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1rem 1.15rem;
  padding: 0.25rem 1.25rem 1rem;
}

.cinema-cast-card {
  width: min(108px, 28vw);
  text-align: center;
  transform: rotate(var(--tilt, -2deg));
}

.cinema-cast-card__frame {
  display: grid;
  grid-template-columns: 0.55rem minmax(0, 1fr) 0.55rem;
  background: var(--cinema-strip-deep);
  border-radius: 3px;
  overflow: hidden;
  box-shadow: 0 8px 18px rgba(74, 53, 96, 0.2);
  margin-bottom: 0.45rem;
}

.cinema-cast-card__sprocket {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-evenly;
  padding: 0.25rem 0;
  background: linear-gradient(180deg, var(--cinema-strip-light), var(--cinema-strip-deep));
}

.cinema-cast-card__photo {
  display: block;
  width: 100%;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  background: #2a2235;
}

.cinema-cast-card__photo--placeholder {
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, #f4eef8, #e8d9f0);
  color: var(--cinema-accent);
  font-weight: 800;
  font-size: 1.35rem;
}

.cinema-cast-card__name {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 800;
  color: var(--cinema-ink);
  line-height: 1.25;
}

.cinema-cast-card__role {
  margin: 0.15rem 0 0;
  font-size: 0.7rem;
  color: var(--cinema-muted);
  line-height: 1.25;
}

.cinema-panel--story {
  margin: 0 1.25rem;
}

.cinema-lined {
  --cinema-line-step: 1.75rem;
  margin: 0;
  padding: 0;
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(var(--cinema-line-step) - 1px),
    var(--cinema-line) calc(var(--cinema-line-step) - 1px),
    var(--cinema-line) var(--cinema-line-step)
  );
  background-size: 100% var(--cinema-line-step);
}

.cinema-lined--story {
  min-height: calc(var(--cinema-line-step) * 6);
}

.cinema-lined__story {
  margin: 0;
  padding: 0;
  font-size: 0.95rem;
  line-height: var(--cinema-line-step);
  color: var(--cinema-ink);
  white-space: pre-wrap;
}

.cinema-avis {
  margin: 1.25rem 1.25rem 0;
}

.cinema-avis__body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1rem;
  border: 1px solid rgba(173, 129, 190, 0.4);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.72);
}

.cinema-stars {
  display: flex;
  gap: 0.25rem;
  font-size: 1.45rem;
  letter-spacing: 0.05em;
}

.cinema-stars__star {
  color: rgba(173, 129, 190, 0.28);
}

.cinema-stars__star--on {
  color: var(--cinema-accent);
}

.cinema-avis__score {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: var(--cinema-ink);
}

.cinema-empty {
  margin: 0.5rem 0;
  width: 100%;
  text-align: center;
  color: var(--cinema-muted);
  font-size: 0.92rem;
}

@media (max-width: 760px) {
  .cinema-fiche__top {
    grid-template-columns: 1fr;
    justify-items: center;
  }

  .cinema-poster-frame {
    width: min(220px, 70vw);
    transform: none;
  }

  .cinema-fiche__panels {
    width: 100%;
  }

  .cinema-field {
    grid-template-columns: 1fr;
    gap: 0.15rem;
  }

  .cinema-providers {
    grid-template-columns: 1fr;
  }

  .cinema-panel--story,
  .cinema-avis {
    margin-left: 0.85rem;
    margin-right: 0.85rem;
  }
}

@media (prefers-color-scheme: dark) {
  .cinema-fiche {
    --cinema-ink: #f0e8f8;
    --cinema-muted: #c9b0d8;
    --cinema-line: rgba(213, 181, 234, 0.35);
    --cinema-cream: #2a2438;
    --cinema-lilac: #1f1a2c;
    border-color: rgba(213, 181, 234, 0.25);
  }

  .cinema-fiche__header-inner {
    background: linear-gradient(135deg, rgba(173, 129, 190, 0.28), rgba(61, 47, 74, 0.55));
  }

  .cinema-panel,
  .cinema-avis__body {
    background: rgba(35, 30, 48, 0.78);
    border-color: rgba(213, 181, 234, 0.25);
  }

  .cinema-panel--tech {
    background: rgba(61, 47, 74, 0.4);
  }

  .cinema-filmstrip__hole,
  .cinema-poster-frame__hole,
  .cinema-cast-card__hole {
    background: rgba(250, 246, 255, 0.88);
  }
}
</style>
