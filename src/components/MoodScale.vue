<script setup>
import { useMoodSelection } from '../composables/useMoodSelection.js'

defineProps({
  compact: {
    type: Boolean,
    default: false,
  },
  showTitle: {
    type: Boolean,
    default: true,
  },
  showHint: {
    type: Boolean,
    default: true,
  },
})

const { MOODS, selectedMoodId, selectedMood, selectMood } = useMoodSelection()
</script>

<template>
  <div
    class="mood-scale-panel"
    :class="{ 'mood-scale-panel--compact': compact }"
  >
    <h2
      v-if="showTitle"
      class="mood-scale-panel__title"
      :id="compact ? undefined : 'mood-scale-heading'"
    >
      Humeur du moment
    </h2>

    <div
      class="mood-scale"
      role="radiogroup"
      :aria-label="compact ? 'Humeur du moment' : undefined"
      :aria-labelledby="showTitle && !compact ? 'mood-scale-heading' : undefined"
    >
      <button
        v-for="mood in MOODS"
        :key="mood.id"
        type="button"
        class="mood-scale__btn"
        :class="{ 'mood-scale__btn--selected': selectedMoodId === mood.id }"
        role="radio"
        :aria-checked="selectedMoodId === mood.id"
        :aria-label="mood.label"
        @click="selectMood(mood.id)"
      >
        <span class="mood-scale__emoji" aria-hidden="true">{{ mood.emoji }}</span>
        <span class="mood-scale__label">{{ mood.label }}</span>
      </button>
    </div>

    <p v-if="showHint && selectedMood" class="mood-scale-panel__hint">
      Tu as sélectionné : <strong>{{ selectedMood.emoji }} {{ selectedMood.label }}</strong>
    </p>
    <p v-else-if="showHint" class="mood-scale-panel__hint mood-scale-panel__hint--muted">
      Choisis une émotion sur l'échelle ci-dessus.
    </p>
  </div>
</template>

<style scoped>
.mood-scale-panel {
  width: 100%;
  box-sizing: border-box;
}

.mood-scale-panel--compact {
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(213, 181, 234, 0.3);
  border-radius: 14px;
  padding: 0.75rem 0.5rem;
}

@media (prefers-color-scheme: dark) {
  .mood-scale-panel--compact {
    background: rgba(35, 30, 48, 0.65);
    border-color: rgba(213, 181, 234, 0.2);
  }
}

.mood-scale-panel__title {
  margin: 0 0 1.25rem;
  font-size: 1rem;
  font-weight: 700;
  color: #ad81be;
  text-align: center;
}

.mood-scale-panel--compact .mood-scale-panel__title {
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
}

.mood-scale {
  display: flex;
  width: 100%;
  gap: 0.35rem;
}

.mood-scale-panel--compact .mood-scale {
  gap: 0.25rem;
}

.mood-scale__btn {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.65rem 0.25rem;
  border: 1px solid rgba(213, 181, 234, 0.4);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.55);
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    transform 0.15s ease,
    box-shadow 0.2s ease;
}

.mood-scale-panel--compact .mood-scale__btn {
  padding: 0.5rem 0.15rem;
  border-radius: 10px;
}

.mood-scale__btn:hover {
  background: rgba(213, 181, 234, 0.15);
  border-color: rgba(173, 129, 190, 0.55);
  transform: translateY(-1px);
}

.mood-scale__btn:focus-visible {
  outline: 2px solid #ad81be;
  outline-offset: 2px;
}

.mood-scale__btn--selected {
  background: linear-gradient(135deg, rgba(213, 181, 234, 0.4), rgba(149, 209, 170, 0.25));
  border-color: #ad81be;
  box-shadow: 0 4px 14px rgba(173, 129, 190, 0.25);
}

.mood-scale__btn--selected .mood-scale__label {
  color: #ad81be;
  font-weight: 700;
}

@media (prefers-color-scheme: dark) {
  .mood-scale__btn {
    background: rgba(0, 0, 0, 0.2);
    border-color: rgba(213, 181, 234, 0.25);
  }
  .mood-scale-panel--compact .mood-scale__btn {
    background: rgba(0, 0, 0, 0.25);
  }
  .mood-scale__btn--selected .mood-scale__label {
    color: #d5b5ea;
  }
}

.mood-scale__emoji {
  font-size: clamp(1.35rem, 4vw, 2rem);
  line-height: 1;
}

.mood-scale-panel--compact .mood-scale__emoji {
  font-size: clamp(1.2rem, 5.5vw, 1.65rem);
}

.mood-scale__label {
  font-size: clamp(0.6rem, 1.8vw, 0.78rem);
  font-weight: 600;
  color: #5d6d7e;
  text-align: center;
  line-height: 1.2;
  word-break: break-word;
  hyphens: auto;
}

.mood-scale-panel--compact .mood-scale__label {
  font-size: clamp(0.55rem, 2.2vw, 0.72rem);
}

@media (max-width: 400px) {
  .mood-scale-panel--compact .mood-scale__label {
    display: none;
  }

  .mood-scale-panel--compact .mood-scale__btn {
    padding: 0.55rem 0.1rem;
    gap: 0;
  }
}

@media (prefers-color-scheme: dark) {
  .mood-scale__label {
    color: #ced4da;
  }
}

.mood-scale-panel__hint {
  margin: 1.25rem 0 0;
  text-align: center;
  font-size: 0.95rem;
  color: #2c3e50;
}

.mood-scale-panel__hint strong {
  color: #ad81be;
  font-weight: 700;
}

.mood-scale-panel__hint--muted {
  color: #8c98a4;
  font-size: 0.9rem;
}

@media (prefers-color-scheme: dark) {
  .mood-scale-panel__hint {
    color: #e9ecef;
  }
  .mood-scale-panel__hint--muted {
    color: #adb5bd;
  }
}
</style>
