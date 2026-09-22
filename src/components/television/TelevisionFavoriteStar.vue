<script setup>
defineProps({
  active: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  /** Variante visuelle compacte (affiche) ou bouton (fiche). */
  size: {
    type: String,
    default: 'md', // sm | md
  },
})

const emit = defineEmits(['toggle'])

function onClick(event) {
  event?.stopPropagation?.()
  event?.preventDefault?.()
  emit('toggle', event)
}
</script>

<template>
  <button
    type="button"
    class="tv-fav-star"
    :class="[
      `tv-fav-star--${size}`,
      { 'tv-fav-star--active': active, 'tv-fav-star--disabled': disabled },
    ]"
    :disabled="disabled"
    :aria-pressed="active"
    :aria-label="active ? 'Retirer des favoris' : 'Ajouter aux favoris'"
    :title="active ? 'Retirer des favoris' : 'Ajouter aux favoris'"
    @click="onClick"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        v-if="active"
        fill="currentColor"
        d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.47L12 17.77l-5.8 3.05 1.11-6.47-4.7-4.58 6.49-.94L12 2.5z"
      />
      <path
        v-else
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linejoin="round"
        d="M12 3.2l2.62 5.31 5.86.85-4.24 4.13 1 5.84L12 16.7l-5.24 2.75 1-5.84-4.24-4.13 5.86-.85L12 3.2z"
      />
    </svg>
  </button>
</template>

<style scoped>
.tv-fav-star {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  color: #c9a227;
  cursor: pointer;
  line-height: 0;
  border-radius: 999px;
  transition:
    transform 0.12s ease,
    color 0.12s ease,
    background 0.12s ease;
}

.tv-fav-star svg {
  width: 1.15em;
  height: 1.15em;
  display: block;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35));
}

.tv-fav-star--sm {
  font-size: 1rem;
  width: 1.7rem;
  height: 1.7rem;
  background: rgba(20, 16, 28, 0.45);
  color: rgba(255, 236, 170, 0.95);
}

.tv-fav-star--md {
  font-size: 1.25rem;
  width: 2.15rem;
  height: 2.15rem;
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid rgba(213, 181, 234, 0.4);
  color: #b8961f;
}

.tv-fav-star--active {
  color: #e6b422;
}

.tv-fav-star--sm.tv-fav-star--active {
  color: #ffd54a;
  background: rgba(20, 16, 28, 0.55);
}

.tv-fav-star:hover:not(:disabled) {
  transform: scale(1.08);
}

.tv-fav-star:focus-visible {
  outline: 2px solid rgba(173, 129, 190, 0.7);
  outline-offset: 2px;
}

.tv-fav-star--disabled,
.tv-fav-star:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

@media (prefers-color-scheme: dark) {
  .tv-fav-star--md {
    background: rgba(35, 30, 48, 0.85);
    color: #e6c35a;
  }
}
</style>
