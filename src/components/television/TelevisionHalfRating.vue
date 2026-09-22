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

const stars = [0, 1, 2, 3, 4]

const displayRating = computed(() => {
  const value = Number(props.modelValue)
  return Number.isFinite(value) ? Math.max(0, Math.min(5, value)) : 0
})

function starFill(index) {
  const rating = displayRating.value
  if (rating >= index + 1) return 1
  if (rating >= index + 0.5) return 0.5
  return 0
}

function setRating(value) {
  if (props.readonly || props.disabled) return
  const next = Math.max(0, Math.min(5, value))
  if (Number(props.modelValue) === next) {
    const decreased = Math.max(0, next - 0.5)
    emit('update:modelValue', decreased === 0 ? null : decreased)
    return
  }
  emit('update:modelValue', next === 0 ? null : next)
}

function onStarClick(index, event) {
  if (props.readonly || props.disabled) return
  const rect = event.currentTarget.getBoundingClientRect()
  const isLeftHalf = event.clientX - rect.left < rect.width / 2
  setRating(index + (isLeftHalf ? 0.5 : 1))
}
</script>

<template>
  <div
    class="tv-rating"
    :class="{ 'tv-rating--readonly': readonly, 'tv-rating--disabled': disabled }"
    role="group"
    aria-label="Ma note sur 5"
  >
    <button
      v-for="index in stars"
      :key="index"
      type="button"
      class="tv-rating__star"
      :class="{
        'tv-rating__star--half': starFill(index) === 0.5,
        'tv-rating__star--full': starFill(index) === 1,
      }"
      :disabled="readonly || disabled"
      :aria-label="`Note ${index + 1} sur 5`"
      @click="onStarClick(index, $event)"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          class="tv-rating__outline"
          d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.47L12 17.77l-5.8 3.05 1.11-6.47-4.7-4.58 6.49-.94L12 2.5z"
        />
        <path
          v-if="starFill(index) > 0"
          class="tv-rating__fill"
          :class="{ 'tv-rating__fill--half': starFill(index) === 0.5 }"
          d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.47L12 17.77l-5.8 3.05 1.11-6.47-4.7-4.58 6.49-.94L12 2.5z"
        />
      </svg>
    </button>
    <span v-if="!readonly" class="tv-rating__hint">0,5 par clic</span>
  </div>
</template>

<style scoped>
.tv-rating {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.15rem 0.4rem;
}

.tv-rating__star {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.7rem;
  height: 1.7rem;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #c9a227;
}

.tv-rating__star svg {
  width: 1.45rem;
  height: 1.45rem;
  display: block;
}

.tv-rating__outline {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linejoin: round;
}

.tv-rating__fill {
  fill: currentColor;
}

.tv-rating__fill--half {
  clip-path: inset(0 50% 0 0);
}

.tv-rating--readonly .tv-rating__star,
.tv-rating--disabled .tv-rating__star {
  cursor: default;
}

.tv-rating__hint {
  font-size: 0.72rem;
  color: #8b7a96;
  font-style: italic;
}

@media (prefers-color-scheme: dark) {
  .tv-rating__star {
    color: #e6c35a;
  }
  .tv-rating__hint {
    color: #c5b8d2;
  }
}
</style>
