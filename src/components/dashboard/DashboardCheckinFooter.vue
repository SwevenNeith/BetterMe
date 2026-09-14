<script setup>
import {
  CHECKIN_REASSURING_NOTE,
  useDashboardEmotionalCheckin,
} from '../composables/useDashboardEmotionalCheckin.js'

const emit = defineEmits(['save', 'cancel'])

const { resetCheckin, getCheckinPayload } = useDashboardEmotionalCheckin()

function onCancel() {
  resetCheckin()
  emit('cancel')
}

function onSave() {
  emit('save', getCheckinPayload())
}
</script>

<template>
  <section class="checkin-footer" aria-label="Actions check-in émotionnel">
    <p class="checkin-footer__note">{{ CHECKIN_REASSURING_NOTE }}</p>
    <div class="checkin-footer__actions">
      <button type="button" class="btn btn--primary" @click="onSave">Enregistrer</button>
      <button type="button" class="btn btn--secondary" @click="onCancel">Annuler</button>
    </div>
  </section>
</template>

<style scoped>
.checkin-footer {
  width: 100%;
  max-width: 1000px;
  box-sizing: border-box;
  padding: 0.25rem 0 0;
}

.checkin-footer__note {
  margin: 0 0 1rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-light);
  line-height: 1.5;
  text-align: center;
}

.checkin-footer__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: center;
}

.btn {
  border: none;
  border-radius: 12px;
  padding: 0.65rem 1.25rem;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn--primary {
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  color: white;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary-dark) 35%, transparent);
}

.btn--primary:hover:not(:disabled) {
  transform: translateY(-1px);
}

.btn--secondary {
  background: color-mix(in srgb, var(--color-primary) 20%, transparent);
  color: var(--color-primary-dark);
  border: 1px solid color-mix(in srgb, var(--color-primary) 35%, transparent);
}

.btn--secondary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-primary) 28%, transparent);
  transform: translateY(-1px);
}

@media (max-width: 768px) {
  .checkin-footer {
    display: none;
  }
}
</style>
