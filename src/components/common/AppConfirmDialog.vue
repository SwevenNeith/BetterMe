<script setup>
import { onUnmounted, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: 'Confirmation' },
  message: { type: String, default: '' },
  confirmLabel: { type: String, default: 'Confirmer' },
  cancelLabel: { type: String, default: 'Annuler' },
  danger: { type: Boolean, default: false },
})

const emit = defineEmits(['confirm', 'cancel'])

function onKeydown(event) {
  if (!props.open) return
  if (event.key === 'Escape') emit('cancel')
  if (event.key === 'Enter') emit('confirm')
}

watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
)

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="app-confirm" role="dialog" aria-modal="true" :aria-label="title">
      <div class="app-confirm__overlay" @click="emit('cancel')" />
      <div class="app-confirm__card">
        <h2 class="app-confirm__title">{{ title }}</h2>
        <p v-if="message" class="app-confirm__message">{{ message }}</p>
        <div class="app-confirm__actions">
          <button type="button" class="app-confirm__btn" @click="emit('cancel')">
            {{ cancelLabel }}
          </button>
          <button
            type="button"
            class="app-confirm__btn"
            :class="danger ? 'app-confirm__btn--danger' : 'app-confirm__btn--primary'"
            @click="emit('confirm')"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.app-confirm__overlay {
  position: fixed;
  inset: 0;
  background: rgba(40, 25, 55, 0.35);
  z-index: 100;
}

.app-confirm__card {
  position: fixed;
  z-index: 101;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(420px, calc(100vw - 2rem));
  background: #fff;
  border-radius: 14px;
  padding: 1.15rem 1.25rem;
  box-shadow: 0 16px 40px rgba(60, 30, 80, 0.18);
  display: grid;
  gap: 0.75rem;
}

.app-confirm__title {
  margin: 0;
  font-size: 1.1rem;
  color: #3b2a4a;
}

.app-confirm__message {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.45;
  color: #5a4a68;
  white-space: pre-line;
}

.app-confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.app-confirm__btn {
  border: 1px solid #d5c4e6;
  background: #fff;
  color: #3b2a4a;
  border-radius: 8px;
  padding: 0.4rem 0.8rem;
  font: inherit;
  font-size: 0.9rem;
  cursor: pointer;
}

.app-confirm__btn--primary {
  background: var(--color-success, #95d1aa);
  border-color: var(--color-tertiary, #72a098);
  font-weight: 600;
}

.app-confirm__btn--danger {
  background: #fff5f5;
  border-color: #e0b4b4;
  color: #8a3030;
  font-weight: 600;
}
</style>
