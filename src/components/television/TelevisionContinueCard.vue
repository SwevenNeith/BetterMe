<script setup>
import { computed } from 'vue'
import { tmdbPosterUrl } from '../../services/television/tmdb.js'
import { formatNextEpisodeLabel } from '../../utils/television/nextEpisode.js'
import TelevisionFavoriteStar from './TelevisionFavoriteStar.vue'

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
  /** @type {{ seasonNumber: number, episodeNumber: number, episodeName?: string, complete?: boolean }|null} */
  nextEpisode: {
    type: Object,
    default: null,
  },
  busy: {
    type: Boolean,
    default: false,
  },
  favoriteBusy: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['open', 'mark-watched', 'toggle-favorite'])

const title = computed(
  () => props.item?.title || props.item?.original_title || 'Sans titre',
)

const posterUrl = computed(
  () => props.item?.posterUrl || tmdbPosterUrl(props.item?.poster_path, 'w185'),
)

const isFavorite = computed(() => Boolean(props.item?.is_favorite))

const label = computed(() => {
  if (!props.nextEpisode) return 'Progression…'
  if (props.nextEpisode.complete) return formatNextEpisodeLabel(props.nextEpisode)
  const base = formatNextEpisodeLabel(props.nextEpisode)
  const name = String(props.nextEpisode.episodeName || '').trim()
  return name ? `${base} — ${name}` : base
})

const canMark = computed(
  () =>
    Boolean(props.nextEpisode) &&
    !props.nextEpisode.complete &&
    Number.isFinite(props.nextEpisode.seasonNumber) &&
    Number.isFinite(props.nextEpisode.episodeNumber),
)

/** Force le remontage de la case pour qu’elle reparte décochée à chaque épisode. */
const checkboxKey = computed(
  () =>
    `${props.item?.id ?? 'x'}-${props.nextEpisode?.seasonNumber ?? 0}-${props.nextEpisode?.episodeNumber ?? 0}`,
)

function onMark(event) {
  event.stopPropagation()
  // Remet immédiatement la case à décochée (avant le prochain épisode)
  if (event?.target) event.target.checked = false
  if (!canMark.value || props.busy) return
  emit('mark-watched', {
    item: props.item,
    seasonNumber: props.nextEpisode.seasonNumber,
    episodeNumber: props.nextEpisode.episodeNumber,
  })
}

function onToggleFavorite() {
  emit('toggle-favorite', props.item)
}
</script>

<template>
  <article class="tv-continue">
    <button type="button" class="tv-continue__main" @click="emit('open', item)">
      <div class="tv-continue__poster-wrap">
        <img
          v-if="posterUrl"
          :src="posterUrl"
          :alt="title"
          class="tv-continue__poster"
          loading="lazy"
        />
        <div v-else class="tv-continue__poster tv-continue__poster--placeholder" aria-hidden="true">
          🎬
        </div>
        <TelevisionFavoriteStar
          class="tv-continue__fav"
          size="sm"
          :active="isFavorite"
          :disabled="favoriteBusy"
          @toggle="onToggleFavorite"
        />
      </div>
      <div class="tv-continue__meta">
        <p class="tv-continue__title">{{ title }}</p>
        <p class="tv-continue__episode">{{ label }}</p>
      </div>
    </button>

    <label
      v-if="canMark"
      :key="checkboxKey"
      class="tv-continue__check"
      :class="{ 'tv-continue__check--busy': busy }"
      @click.stop
    >
      <input
        type="checkbox"
        :checked="false"
        :disabled="busy"
        :aria-label="`Marquer vu : ${label}`"
        @change="onMark"
      />
      <span>{{ busy ? '…' : 'Vu' }}</span>
    </label>
    <span v-else-if="nextEpisode?.complete" class="tv-continue__done">Terminé</span>
  </article>
</template>

<style scoped>
.tv-continue {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.45rem 0.55rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.72);
}

.tv-continue__main {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  flex: 1;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.tv-continue__poster-wrap {
  position: relative;
  flex-shrink: 0;
}

.tv-continue__fav {
  position: absolute;
  top: -0.2rem;
  right: -0.2rem;
  z-index: 2;
  font-size: 0.85rem;
  width: 1.35rem;
  height: 1.35rem;
}

.tv-continue__poster {
  width: 2.75rem;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  border-radius: 4px;
  display: block;
  border: 1px solid rgba(213, 181, 234, 0.25);
}

.tv-continue__poster--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, #f4eef8, #e8d9f0);
  font-size: 0.9rem;
}

.tv-continue__meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.tv-continue__title {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 800;
  color: #2c3e50;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tv-continue__episode {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 650;
  color: #6b4f7c;
  line-height: 1.3;
}

.tv-continue__check {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
  padding: 0.4rem 0.55rem;
  border-radius: 10px;
  border: 1px solid rgba(173, 129, 190, 0.4);
  background: rgba(173, 129, 190, 0.14);
  color: #6b4f7c;
  font-size: 0.8rem;
  font-weight: 750;
  cursor: pointer;
  user-select: none;
}

.tv-continue__check--busy {
  opacity: 0.65;
  cursor: wait;
}

.tv-continue__check input {
  width: 1rem;
  height: 1rem;
  accent-color: #ad81be;
  cursor: pointer;
}

.tv-continue__done {
  flex-shrink: 0;
  font-size: 0.78rem;
  font-weight: 700;
  color: #6c757d;
}

@media (prefers-color-scheme: dark) {
  .tv-continue {
    background: rgba(35, 30, 48, 0.85);
  }
  .tv-continue__title {
    color: #f0e8f8;
  }
  .tv-continue__episode {
    color: #c9b0d8;
  }
  .tv-continue__check {
    background: rgba(173, 129, 190, 0.22);
    color: #e9d5f5;
  }
}
</style>
