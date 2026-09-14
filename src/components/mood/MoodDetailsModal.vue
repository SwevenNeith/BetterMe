<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  mood: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['cancel', 'save'])

const intensite = ref(3)
const energie = ref(3)
const stress = ref(3)
const sommeil = ref(3)
const douleur = ref(3)
const besoinSoutien = ref(false)

function resetFields() {
  intensite.value = 3
  energie.value = 3
  stress.value = 3
  sommeil.value = 3
  douleur.value = 3
  besoinSoutien.value = false
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) resetFields()
  },
)

function onCancel() {
  emit('cancel')
}

function onSave() {
  emit('save', {
    intensite: intensite.value,
    etatGeneral: {
      energie: energie.value,
      stress: stress.value,
      sommeil: sommeil.value,
      douleur: douleur.value,
    },
    besoinSoutien: besoinSoutien.value,
  })
}
</script>

<template>
  <teleport to="body">
    <div v-if="open" class="mood-modal" role="dialog" aria-modal="true">
      <div class="mood-modal__overlay" @click="onCancel"></div>

      <div class="mood-modal__panel">
        <header class="mood-modal__header">
          <div class="mood-modal__mood" v-if="mood">
            <span class="mood-modal__emoji" aria-hidden="true">{{ mood.emoji }}</span>
            <span class="mood-modal__label">{{ mood.label }}</span>
          </div>
          <button type="button" class="mood-modal__close" @click="onCancel" aria-label="Fermer">
            ×
          </button>
        </header>

        <div class="mood-modal__content">
          <div class="mood-modal__field">
            <span class="mood-modal__field-label">Intensité</span>
            <div class="scale" role="radiogroup" aria-label="Intensité (1 à 5)">
              <button
                v-for="n in 5"
                :key="`intensite-${n}`"
                type="button"
                class="scale__chip"
                :class="{ 'scale__chip--on': intensite === n }"
                role="radio"
                :aria-checked="intensite === n"
                @click="intensite = n"
              >
                {{ n }}
              </button>
            </div>
          </div>

          <div class="mood-modal__group">
            <div class="mood-modal__group-title">État général</div>

            <div class="mood-modal__field">
              <span class="mood-modal__field-label">Énergie</span>
              <div class="scale" role="radiogroup" aria-label="Énergie (1 à 5)">
                <button
                  v-for="n in 5"
                  :key="`energie-${n}`"
                  type="button"
                  class="scale__chip"
                  :class="{ 'scale__chip--on': energie === n }"
                  role="radio"
                  :aria-checked="energie === n"
                  @click="energie = n"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div class="mood-modal__field">
              <span class="mood-modal__field-label">Stress</span>
              <div class="scale" role="radiogroup" aria-label="Stress (1 à 5)">
                <button
                  v-for="n in 5"
                  :key="`stress-${n}`"
                  type="button"
                  class="scale__chip"
                  :class="{ 'scale__chip--on': stress === n }"
                  role="radio"
                  :aria-checked="stress === n"
                  @click="stress = n"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div class="mood-modal__field">
              <span class="mood-modal__field-label">Sommeil</span>
              <div class="scale" role="radiogroup" aria-label="Sommeil (1 à 5)">
                <button
                  v-for="n in 5"
                  :key="`sommeil-${n}`"
                  type="button"
                  class="scale__chip"
                  :class="{ 'scale__chip--on': sommeil === n }"
                  role="radio"
                  :aria-checked="sommeil === n"
                  @click="sommeil = n"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div class="mood-modal__field">
              <span class="mood-modal__field-label">Douleur</span>
              <div class="scale" role="radiogroup" aria-label="Douleur (1 à 5)">
                <button
                  v-for="n in 5"
                  :key="`douleur-${n}`"
                  type="button"
                  class="scale__chip"
                  :class="{ 'scale__chip--on': douleur === n }"
                  role="radio"
                  :aria-checked="douleur === n"
                  @click="douleur = n"
                >
                  {{ n }}
                </button>
              </div>
            </div>
          </div>

          <label class="support-check">
            <input v-model="besoinSoutien" type="checkbox" />
            <span>J'ai besoin de soutien aujourd'hui</span>
          </label>
        </div>

        <footer class="mood-modal__actions">
          <button type="button" class="btn btn--primary" @click="onSave">Enregistrer</button>
          <button type="button" class="btn btn--secondary" @click="onCancel">Annuler</button>
        </footer>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.mood-modal {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.mood-modal__overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(2px);
}

.mood-modal__panel {
  position: relative;
  width: 100%;
  max-width: 560px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 35%, transparent);
  background: color-mix(in srgb, var(--color-background) 92%, transparent);
  backdrop-filter: blur(14px);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

.mood-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1rem 0.75rem;
  border-bottom: 1px solid color-mix(in srgb, var(--color-primary) 25%, transparent);
}

.mood-modal__mood {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-weight: 800;
  color: var(--color-primary-dark);
}

.mood-modal__emoji {
  font-size: 1.6rem;
  line-height: 1;
}

.mood-modal__label {
  font-size: 1.05rem;
}

.mood-modal__close {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 25%, transparent);
  background: transparent;
  color: var(--color-primary-dark);
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
}

.mood-modal__close:hover {
  background: color-mix(in srgb, var(--color-primary) 15%, transparent);
}

.mood-modal__content {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.mood-modal__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.mood-modal__field-label {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-text);
}

.mood-modal__group {
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 20%, transparent);
  background: color-mix(in srgb, var(--color-background) 60%, transparent);
  padding: 0.85rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.mood-modal__group-title {
  font-size: 0.9rem;
  font-weight: 800;
  color: var(--color-primary-dark);
}

.scale {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.scale__chip {
  min-width: 2.25rem;
  padding: 0.45rem 0.65rem;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 35%, transparent);
  background: color-mix(in srgb, var(--color-background) 65%, transparent);
  color: var(--color-text);
  font-weight: 800;
  cursor: pointer;
  transition: all 0.15s ease;
}

.scale__chip:hover:not(.scale__chip--on) {
  transform: translateY(-1px);
  background: color-mix(in srgb, var(--color-primary) 15%, transparent);
}

.scale__chip--on:hover {
  transform: translateY(-1px);
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
}

.scale__chip--on {
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  border-color: var(--color-primary-dark);
  color: white;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary-dark) 30%, transparent);
}

.scale__chip:focus-visible {
  outline: 2px solid var(--color-primary-dark);
  outline-offset: 2px;
}

.support-check {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-text);
}

.support-check input {
  width: 1.1rem;
  height: 1.1rem;
  accent-color: var(--color-primary-dark);
}

.mood-modal__actions {
  display: flex;
  gap: 0.5rem;
  padding: 0.9rem 1rem 1rem;
  justify-content: flex-end;
  border-top: 1px solid color-mix(in srgb, var(--color-primary) 25%, transparent);
}

@media (max-width: 420px) {
  .mood-modal__actions {
    flex-direction: column;
    align-items: stretch;
  }
}

.btn {
  border: none;
  border-radius: 12px;
  padding: 0.65rem 1.15rem;
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

.btn--primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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
</style>
