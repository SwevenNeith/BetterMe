<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: Number,
    default: null,
  },
  readonly: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue'])

const hearts = [0, 1, 2, 3, 4]

const displayRating = computed(() => {
  const value = Number(props.modelValue)
  return Number.isFinite(value) ? Math.max(0, Math.min(5, value)) : 0
})

function heartFill(index) {
  const rating = displayRating.value
  if (rating >= index + 1) return 1
  if (rating >= index + 0.5) return 0.5
  return 0
}

function setRating(value) {
  if (props.readonly || props.disabled) return
  const next = Math.max(0, Math.min(5, value))
  if (props.modelValue === next) {
    emit('update:modelValue', Math.max(0, next - 0.5))
    return
  }
  emit('update:modelValue', next === 0 ? null : next)
}

function onHeartClick(index, event) {
  if (props.readonly || props.disabled) return
  const rect = event.currentTarget.getBoundingClientRect()
  const isLeftHalf = event.clientX - rect.left < rect.width / 2
  setRating(index + (isLeftHalf ? 0.5 : 1))
}
</script>

<template>
  <div
    class="reading-rating"
    :class="{ 'reading-rating--readonly': readonly, 'reading-rating--disabled': disabled }"
    role="group"
    aria-label="Note sur 5"
  >
    <button
      v-for="index in hearts"
      :key="index"
      type="button"
      class="reading-rating-heart"
      :class="{
        'reading-rating-heart--half': heartFill(index) === 0.5,
        'reading-rating-heart--full': heartFill(index) === 1,
      }"
      :disabled="readonly || disabled"
      :aria-label="`Note ${index + 1} sur 5`"
      @click="onHeartClick(index, $event)"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          class="reading-rating-heart-outline"
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        />
        <path
          v-if="heartFill(index) > 0"
          class="reading-rating-heart-fill"
          :class="{ 'reading-rating-heart-fill--half': heartFill(index) === 0.5 }"
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        />
      </svg>
    </button>
    <span v-if="!readonly" class="reading-rating-hint">0,5 par clic</span>
  </div>
</template>

<style scoped>
.reading-rating {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.2rem 0.45rem;
}

.reading-rating-heart {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.65rem;
  height: 1.65rem;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.reading-rating-heart svg {
  width: 1.45rem;
  height: 1.45rem;
}

.reading-rating-heart-outline {
  fill: none;
  stroke: #ad81be;
  stroke-width: 1.5;
}

.reading-rating-heart-fill {
  fill: #ad81be;
}

.reading-rating-heart-fill--half {
  clip-path: inset(0 50% 0 0);
}

.reading-rating--readonly .reading-rating-heart,
.reading-rating--disabled .reading-rating-heart {
  cursor: default;
}

.reading-rating-hint {
  font-size: 0.72rem;
  color: #8b7a96;
  font-style: italic;
}

@media (prefers-color-scheme: dark) {
  .reading-rating-hint {
    color: #c5b8d2;
  }
}
</style>
