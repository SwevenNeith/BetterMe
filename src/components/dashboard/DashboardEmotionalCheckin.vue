<script setup>
import {
  CHECKIN_REASSURING_NOTE,
  CHECKIN_SENTIMENTS,
  useDashboardEmotionalCheckin,
} from '../composables/useDashboardEmotionalCheckin.js'
import { computed } from 'vue'

const props = defineProps({
  compact: {
    type: Boolean,
    default: false,
  },
  /** Affiche les boutons dans la carte */
  showFooter: {
    type: Boolean,
    default: false,
  },
  /** Affiche le texte rassurant sous la carte */
  showNote: {
    type: Boolean,
    default: false,
  },
  patternMessage: {
    type: String,
    default: '',
  },
  savedToday: {
    type: Boolean,
    default: false,
  },
  statusMessage: {
    type: String,
    default: '',
  },
  saving: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['save', 'cancel'])

const {
  humeurGenerale,
  energieEmotionnelle,
  besoinReassurance,
  sentimentGeneral,
  sentimentSelected,
  resetCheckin,
  getCheckinPayload,
} = useDashboardEmotionalCheckin()

const canSave = computed(() => {
  const p = getCheckinPayload()
  return (
    p.humeurGenerale != null &&
    p.energieEmotionnelle != null &&
    p.sentimentGeneral != null
  )
})

function onCancel() {
  resetCheckin()
  emit('cancel')
}

function onSave() {
  if (!canSave.value || props.saving) return
  emit('save', getCheckinPayload())
}
</script>

<template>
  <div class="checkin-wrapper">
    <section class="checkin" :class="{ 'checkin--compact': compact }">
      <div class="checkin__grid">
      <div class="checkin__item">
        <div class="checkin__label">Humeur générale</div>
        <div class="scale" role="radiogroup" aria-label="Humeur générale (1 à 5)">
          <button
            v-for="n in 5"
            :key="`hg-${n}`"
            type="button"
            class="scale__chip"
            :class="{ 'scale__chip--on': humeurGenerale === n }"
            role="radio"
            :aria-checked="humeurGenerale === n"
            @click="humeurGenerale = n"
          >
            {{ n }}
          </button>
        </div>
      </div>

      <div class="checkin__item">
        <div class="checkin__label">Énergie émotionnelle</div>
        <div class="scale" role="radiogroup" aria-label="Énergie émotionnelle (1 à 5)">
          <button
            v-for="n in 5"
            :key="`ee-${n}`"
            type="button"
            class="scale__chip"
            :class="{ 'scale__chip--on': energieEmotionnelle === n }"
            role="radio"
            :aria-checked="energieEmotionnelle === n"
            @click="energieEmotionnelle = n"
          >
            {{ n }}
          </button>
        </div>
      </div>

      <label class="checkin__item checkin__item--check support-check">
        <input v-model="besoinReassurance" type="checkbox" />
        <span>Besoin de réassurance</span>
      </label>

      <div class="checkin__item checkin__item--sentiment">
        <div class="checkin__label">Sentiment général</div>
        <div class="scale scale--sentiment" role="radiogroup" aria-label="Sentiment général (1 à 5)">
          <button
            v-for="s in CHECKIN_SENTIMENTS"
            :key="`sg-${s.value}`"
            type="button"
            class="scale__chip scale__chip--sentiment"
            :class="{ 'scale__chip--on': sentimentGeneral === s.value }"
            role="radio"
            :aria-checked="sentimentGeneral === s.value"
            :aria-label="`${s.value} — ${s.label} (${s.detail})`"
            @click="sentimentGeneral = s.value"
          >
            <span class="scale__num">{{ s.value }}</span>
            <span class="scale__text">{{ s.label }}</span>
          </button>
        </div>
        <p v-if="sentimentSelected" class="checkin__sentiment-detail">
          {{ sentimentSelected.detail }}
        </p>
      </div>
    </div>

    <footer v-if="showFooter" class="checkin__footer">
      <div class="checkin__actions">
        <button
          type="button"
          class="btn btn--primary"
          :disabled="!canSave || saving"
          @click="onSave"
        >
          {{ saving ? 'Enregistrement…' : savedToday ? 'Modifier' : 'Enregistrer' }}
        </button>
        <button type="button" class="btn btn--secondary" @click="onCancel">
          {{ savedToday ? 'Annuler les changements' : 'Annuler' }}
        </button>
      </div>

      <p v-if="statusMessage" class="checkin-status">
        {{ statusMessage }}
      </p>
    </footer>
    </section>

    <p v-if="showNote" class="checkin-note">
      {{ CHECKIN_REASSURING_NOTE }}
    </p>
    <p v-if="showNote && props.patternMessage" class="checkin-pattern">
      {{ props.patternMessage }}
    </p>
  </div>
</template>

<style scoped>
.checkin-wrapper {
  width: 100%;
}

.checkin {
  width: 100%;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 16px;
  padding: 1rem;
}

@media (prefers-color-scheme: dark) {
  .checkin {
    background: rgba(35, 30, 48, 0.75);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .checkin__label {
    color: #d5b5ea;
  }

  .scale__chip:not(.scale__chip--on) {
    background: rgba(40, 32, 52, 0.95);
    border-color: rgba(213, 181, 234, 0.38);
    color: #f0e8f8;
  }

  .scale__chip:hover:not(.scale__chip--on) {
    background: rgba(213, 181, 234, 0.22);
    border-color: rgba(213, 181, 234, 0.5);
  }

  .support-check {
    color: #f0e8f8;
  }

  .checkin__sentiment-detail,
  .checkin-note {
    color: #c5c9d0;
  }

  .checkin-pattern {
    color: #d5b5ea;
  }

  .btn--secondary {
    color: #d5b5ea;
    background: rgba(213, 181, 234, 0.14);
    border-color: rgba(213, 181, 234, 0.32);
  }

  .btn--secondary:hover:not(:disabled) {
    background: rgba(213, 181, 234, 0.24);
  }
}

.checkin--compact {
  padding: 0.85rem 0.75rem;
}

.checkin__grid {
  display: grid;
  grid-template-columns: 1fr 1fr auto 2fr;
  gap: 0.9rem 1rem;
  align-items: start;
}

.checkin__item {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: 0;
}

.checkin__label {
  font-size: 0.85rem;
  font-weight: 800;
  color: var(--color-primary-dark);
}

.scale {
  display: flex;
  gap: 0.35rem;
  flex-wrap: nowrap;
}

.scale__chip {
  min-width: 2.1rem;
  padding: 0.4rem 0.55rem;
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
  align-items: center;
  flex-direction: row;
  gap: 0.6rem;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 800;
  color: var(--color-text);
  padding-top: 1.65rem;
  white-space: nowrap;
}

.support-check input {
  width: 1.1rem;
  height: 1.1rem;
  accent-color: var(--color-primary-dark);
}

.scale--sentiment {
  flex-wrap: wrap;
  gap: 0.4rem;
}

.scale__chip--sentiment {
  min-width: 0;
  padding: 0.45rem 0.6rem;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.scale__num {
  font-weight: 900;
}

.scale__text {
  font-weight: 800;
  font-size: 0.8rem;
  color: inherit;
}

.checkin__sentiment-detail {
  margin: 0.15rem 0 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-light);
  line-height: 1.35;
}

.checkin__footer {
  margin-top: 0.9rem;
  padding-top: 0.9rem;
  border-top: 1px solid color-mix(in srgb, var(--color-primary) 20%, transparent);
}

.checkin__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: flex-end;
}

.checkin-status {
  margin: 0.75rem 0 0;
  text-align: right;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-tertiary);
}

.checkin-note {
  margin: 0.85rem 0 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-light);
  line-height: 1.5;
  text-align: center;
}

.checkin-pattern {
  margin: 0.5rem 0 0;
  font-size: 0.92rem;
  font-weight: 800;
  color: var(--color-primary-dark);
  line-height: 1.45;
  text-align: center;
}

@media (max-width: 420px) {
  .checkin__actions {
    flex-direction: column;
    align-items: stretch;
  }

  .checkin-status {
    text-align: left;
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

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

.btn:disabled:hover {
  transform: none;
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

@media (min-width: 769px) {
  .checkin__grid {
    grid-template-columns: 1fr 1fr;
    grid-template-areas:
      'hg ee'
      'reassurance reassurance'
      'sentiment sentiment';
    gap: 0.85rem 1rem;
  }

  .checkin__item:nth-child(1) {
    grid-area: hg;
  }
  .checkin__item:nth-child(2) {
    grid-area: ee;
  }
  .checkin__item--check {
    grid-area: reassurance;
  }
  .checkin__item--sentiment {
    grid-area: sentiment;
  }

  .checkin__label {
    font-size: 0.82rem;
  }

  .scale {
    flex-wrap: wrap;
  }

  .scale__chip {
    min-width: 1.95rem;
    padding: 0.35rem 0.5rem;
    border-radius: 11px;
    font-size: 0.85rem;
  }

  .scale__chip--sentiment {
    padding: 0.38rem 0.55rem;
    gap: 0.4rem;
  }

  .support-check {
    padding-top: 0;
    white-space: normal;
  }
}

@media (max-width: 768px) {
  .checkin__grid {
    grid-template-columns: 1fr;
  }

  .scale {
    flex-wrap: wrap;
  }

  .support-check {
    padding-top: 0;
  }
}
</style>
