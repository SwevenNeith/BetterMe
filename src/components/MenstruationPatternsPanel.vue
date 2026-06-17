<script setup>
import { computed } from 'vue'
import {
  PATTERN_TYPE,
  SYMPTOM_LABELS,
  CLUSTER_LABELS,
} from '../services/menstruationPatternThresholds.js'

const props = defineProps({
  patterns: {
    type: Array,
    default: () => [],
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  error: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['refresh'])

const activePatterns = computed(() =>
  (props.patterns ?? []).filter((p) => p.actif !== false),
)

function patternTitle(p) {
  if (p.type_pattern === PATTERN_TYPE.COMBINED) {
    return CLUSTER_LABELS[p.cluster] ?? p.cluster ?? 'Cluster'
  }
  return SYMPTOM_LABELS[p.symptôme] ?? p.symptôme ?? 'Symptôme'
}

function formatRelativeWindow(p) {
  if (p.jour_relatif_début == null || p.jour_relatif_fin == null) return ''
  if (p.jour_relatif_début === p.jour_relatif_fin) {
    return ` le J-${p.jour_relatif_début} du cycle`
  }
  return ` entre le J-${p.jour_relatif_début} et le J-${p.jour_relatif_fin} du cycle`
}

function patternTypeLabel(type) {
  if (type === PATTERN_TYPE.SIMPLE) return 'Récurrence'
  if (type === PATTERN_TYPE.INTENSITY) return 'Intensité'
  if (type === PATTERN_TYPE.DURATION) return 'Durée'
  if (type === PATTERN_TYPE.COMBINED) return 'Cluster'
  return type
}

function patternDescription(p) {
  const ratio = Math.round((p.ratio_répétition ?? 0) * 100)
  const cycles = `${p.cycles_détectés}/${p.cycles_total} cycles`

  if (p.type_pattern === PATTERN_TYPE.SIMPLE) {
    const window = formatRelativeWindow(p)
    return `Se manifeste souvent${window} (${ratio} %, ${cycles}).`
  }

  if (p.type_pattern === PATTERN_TYPE.INTENSITY) {
    const dir = p.direction === 'hausse' ? 'plus intense' : 'moins intense'
    const val =
      p.intensité_moyenne != null ? ` (moyenne actuelle : ${p.intensité_moyenne.toFixed(1)})` : ''
    return `${dir} que d’habitude sur ce cycle${val}.`
  }

  if (p.type_pattern === PATTERN_TYPE.DURATION) {
    const dir = p.direction === 'hausse' ? 'plus longtemps' : 'moins longtemps'
    const val = p.durée_moyenne != null ? ` (${p.durée_moyenne} j)` : ''
    return `Dure ${dir} que d’habitude${val}.`
  }

  if (p.type_pattern === PATTERN_TYPE.COMBINED) {
    const window = formatRelativeWindow(p)
    return `Plusieurs symptômes apparaissent ensemble${window} (${ratio} %, ${cycles}).`
  }

  return `${ratio} % · ${cycles}`
}
</script>

<template>
  <section class="patterns-panel" aria-labelledby="patterns-panel-title">
    <header class="patterns-panel__head">
      <h3 id="patterns-panel-title" class="patterns-panel__title">Tes tendances</h3>
      <p class="patterns-panel__hint">
        Patterns détectés à partir de tes saisies (répétition sur plusieurs cycles).
      </p>
      <button type="button" class="patterns-panel__refresh" :disabled="isLoading" @click="emit('refresh')">
        Actualiser l’analyse
      </button>
    </header>

    <p v-if="error" class="patterns-panel__error">{{ error }}</p>
    <p v-else-if="isLoading" class="patterns-panel__loading">Analyse en cours…</p>
    <p v-else-if="!activePatterns.length" class="patterns-panel__empty">
      Pas encore assez de données pour dégager des tendances (au moins 2 cycles avec symptômes).
    </p>

    <ul v-else class="patterns-panel__list">
      <li v-for="p in activePatterns" :key="p.id" class="patterns-panel__item">
        <div class="patterns-panel__item-head">
          <span class="patterns-panel__badge">{{ patternTypeLabel(p.type_pattern) }}</span>
          <strong class="patterns-panel__item-title">{{ patternTitle(p) }}</strong>
        </div>
        <p class="patterns-panel__item-desc">{{ patternDescription(p) }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.patterns-panel {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(213, 181, 234, 0.35);
}

.patterns-panel__head {
  margin-bottom: 1rem;
}

.patterns-panel__title {
  margin: 0 0 0.35rem;
  font-size: 1.1rem;
  font-weight: 800;
  color: #ad81be;
}

.patterns-panel__hint,
.patterns-panel__empty,
.patterns-panel__loading,
.patterns-panel__error {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  line-height: 1.45;
  color: #6c757d;
}

.patterns-panel__error {
  color: #c0392b;
}

.patterns-panel__refresh {
  padding: 0.45rem 0.9rem;
  border: 1px solid rgba(173, 129, 190, 0.5);
  border-radius: 10px;
  background: transparent;
  color: #ad81be;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}

.patterns-panel__refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.patterns-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.patterns-panel__item {
  padding: 0.85rem 1rem;
  border-radius: 12px;
  background: rgba(213, 181, 234, 0.12);
  border: 1px solid rgba(173, 129, 190, 0.25);
}

.patterns-panel__item-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}

.patterns-panel__badge {
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.2rem 0.45rem;
  border-radius: 6px;
  background: rgba(173, 129, 190, 0.25);
  color: #7a5f8a;
}

.patterns-panel__item-title {
  font-size: 0.95rem;
  color: #2c3e50;
}

.patterns-panel__item-desc {
  margin: 0;
  font-size: 0.85rem;
  color: #5a6268;
  line-height: 1.45;
}

@media (prefers-color-scheme: dark) {
  .patterns-panel {
    border-top-color: rgba(213, 181, 234, 0.2);
  }

  .patterns-panel__hint,
  .patterns-panel__empty,
  .patterns-panel__loading {
    color: #adb5bd;
  }

  .patterns-panel__item {
    background: rgba(40, 32, 52, 0.6);
  }

  .patterns-panel__item-title {
    color: #f0e8f8;
  }

  .patterns-panel__item-desc {
    color: #c8c0d0;
  }
}
</style>
