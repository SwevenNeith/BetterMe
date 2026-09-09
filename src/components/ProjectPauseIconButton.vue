<script setup>
defineProps({
  active: {
    type: Boolean,
    default: false,
  },
  small: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: 'Mettre en pause',
  },
})

defineEmits(['click'])
</script>

<template>
  <button
    type="button"
    class="project-pause-icon-btn"
    :class="{
      'project-pause-icon-btn--small': small,
      'project-pause-icon-btn--active': active,
    }"
    :title="title"
    :aria-label="title"
    @click.stop="$emit('click')"
  >
    <!-- Îlot + palmier (vacances) -->
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.5 18.5c1.8-1.2 3.9-1.9 7.5-1.9s5.7.7 7.5 1.9"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
      />
      <ellipse cx="12" cy="18.7" rx="5.2" ry="1.35" fill="currentColor" opacity="0.28" />
      <path
        d="M12 17.6V9.2"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
      />
      <path
        d="M12 10.2c-2.4-1.1-4.2-1.2-5.6-.6 1.7.2 3.2.9 4.4 1.9"
        stroke="currentColor"
        stroke-width="1.55"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M12 10.2c2.4-1.1 4.2-1.2 5.6-.6-1.7.2-3.2.9-4.4 1.9"
        stroke="currentColor"
        stroke-width="1.55"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M12 11.4c-2.1-.2-3.8.3-5 1.2 1.5-.15 2.9.05 4.1.7"
        stroke="currentColor"
        stroke-width="1.55"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M12 11.4c2.1-.2 3.8.3 5 1.2-1.5-.15-2.9.05-4.1.7"
        stroke="currentColor"
        stroke-width="1.55"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx="18.2" cy="6.2" r="1.55" fill="currentColor" opacity="0.55" />
    </svg>
  </button>
</template>

<style scoped>
.project-pause-icon-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.85rem;
  height: 1.85rem;
  padding: 0;
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 8px;
  background: transparent;
  color: #72a098;
  cursor: pointer;
}

.project-pause-icon-btn svg {
  width: 1.05rem;
  height: 1.05rem;
}

.project-pause-icon-btn--small {
  width: 1.55rem;
  height: 1.55rem;
  border-radius: 8px;
}

.project-pause-icon-btn--small svg {
  width: 0.9rem;
  height: 0.9rem;
}

.project-pause-icon-btn--active {
  border-color: rgba(114, 160, 152, 0.55);
  background: rgba(114, 160, 152, 0.16);
  color: #3d6b64;
}

.project-pause-icon-btn:hover {
  background: rgba(114, 160, 152, 0.12);
}
</style>
