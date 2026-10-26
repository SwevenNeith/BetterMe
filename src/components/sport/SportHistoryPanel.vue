<script setup>
import { computed, ref, watch } from 'vue'
import { formatDuration } from '../../services/sport/sportStats.js'
import { snapshotDisplayName } from '../../utils/sport/wgerExercise.js'

defineOptions({ name: 'SportHistoryPanel' })

const props = defineProps({
  sessions: { type: Array, default: () => [] },
  detail: { type: Object, default: null },
  progressSeries: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['select', 'copy', 'filter'])

const period = ref('all')
const statusFilter = ref('completed')

watch([period, statusFilter], () => {
  emit('filter', { period: period.value, status: statusFilter.value })
})

const chart = computed(() => {
  const series = props.progressSeries || []
  if (series.length < 2) return null
  const width = 280
  const height = 72
  const pad = 8
  const values = series.map((p) => Number(p.maxWeight) || 0)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const n = Math.max(1, values.length - 1)
  const points = values.map((v, i) => {
    const x = pad + (i / n) * (width - pad * 2)
    const y = pad + (height - pad * 2) - ((v - min) / range) * (height - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return {
    width,
    height,
    path: `M ${points.join(' L ')}`,
    min,
    max,
    unit: series[0]?.weightUnit || 'kg',
  }
})

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <section class="shp" aria-label="Historique des séances">
    <div class="shp__filters">
      <label class="shp-field">
        Période
        <select v-model="period" class="shp-input">
          <option value="all">Tout</option>
          <option value="week">7 jours</option>
          <option value="month">30 jours</option>
        </select>
      </label>
      <label class="shp-field">
        Statut
        <select v-model="statusFilter" class="shp-input">
          <option value="completed">Terminées</option>
          <option value="abandoned">Abandonnées</option>
          <option value="all">Tous</option>
        </select>
      </label>
    </div>

    <p v-if="loading" class="shp__muted">Chargement…</p>
    <p v-else-if="!sessions.length" class="shp__muted">Aucune séance dans cet historique.</p>

    <ul v-else class="shp__list">
      <li v-for="s in sessions" :key="s.id" class="shp-card">
        <button type="button" class="shp-card__btn" @click="emit('select', s.id)">
          <strong>{{ s.name }}</strong>
          <span class="shp__muted">
            {{ formatDate(s.started_at) }} · {{ formatDuration(s.duration_seconds) }} ·
            {{ s.status }}
          </span>
        </button>
        <button
          v-if="s.status === 'completed'"
          type="button"
          class="shp-btn"
          @click="emit('copy', s.id)"
        >
          Copier en modèle
        </button>
      </li>
    </ul>

    <div v-if="detail" class="shp__detail">
      <h3 class="shp__detail-title">{{ detail.name }}</h3>
      <p class="shp__muted">
        {{ formatDate(detail.started_at) }}
        <template v-if="detail.ended_at"> → {{ formatDate(detail.ended_at) }}</template>
        · {{ formatDuration(detail.duration_seconds) }}
      </p>
      <p v-if="detail.notes" class="shp__notes">{{ detail.notes }}</p>
      <div v-for="ex in detail.exercises || []" :key="ex.id" class="shp-ex">
        <h4>{{ snapshotDisplayName(ex.snapshot) }}</h4>
        <ul v-if="ex.sets?.length">
          <li v-for="set in ex.sets" :key="set.id">
            S{{ set.set_number }} ·
            <template v-if="set.reps != null">{{ set.reps }} reps</template>
            <template v-if="set.weight != null"> · {{ set.weight }} {{ set.weight_unit }}</template>
            <template v-if="set.difficulty"> · difficulté {{ set.difficulty }}/5</template>
            <template v-if="set.notes"> — {{ set.notes }}</template>
          </li>
        </ul>
        <p v-else class="shp__muted">Aucune série enregistrée.</p>
      </div>

      <div v-if="chart" class="shp-chart" aria-label="Évolution charge">
        <p class="shp-chart__title">Charge max (exercice sélectionné)</p>
        <svg :viewBox="`0 0 ${chart.width} ${chart.height}`" class="shp-chart__svg">
          <path :d="chart.path" class="shp-chart__line" fill="none" />
        </svg>
        <p class="shp__muted">{{ chart.min }} → {{ chart.max }} {{ chart.unit }}</p>
      </div>
      <p v-else-if="progressSeries.length === 1" class="shp__muted">
        Pas assez de points pour un graphique (il en faut au moins 2).
      </p>
    </div>
  </section>
</template>

<style scoped>
.shp__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-bottom: 0.85rem;
}
.shp-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: #6d5a7e;
}
.shp-input {
  border: 1px solid rgba(213, 181, 234, 0.4);
  border-radius: 10px;
  padding: 0.45rem 0.6rem;
  font: inherit;
  font-weight: 600;
}
.shp__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}
.shp-card {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  align-items: center;
  justify-content: space-between;
  border: 1px solid rgba(213, 181, 234, 0.3);
  border-radius: 12px;
  padding: 0.65rem 0.75rem;
  background: rgba(255, 255, 255, 0.55);
}
.shp-card__btn {
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font: inherit;
  color: inherit;
  padding: 0;
  flex: 1;
  min-width: 0;
}
.shp-btn {
  border: 1px solid rgba(213, 181, 234, 0.45);
  background: rgba(255, 255, 255, 0.7);
  border-radius: 10px;
  padding: 0.35rem 0.65rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.shp__muted {
  color: #6d5a7e;
  font-size: 0.85rem;
}
.shp__detail {
  margin-top: 1rem;
  padding: 0.9rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.3);
}
.shp__detail-title {
  margin: 0 0 0.35rem;
}
.shp-ex {
  margin-top: 0.75rem;
}
.shp-ex h4 {
  margin: 0 0 0.25rem;
  font-size: 0.95rem;
}
.shp-ex ul {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.88rem;
  line-height: 1.45;
}
.shp-chart {
  margin-top: 1rem;
}
.shp-chart__title {
  margin: 0 0 0.35rem;
  font-weight: 750;
  font-size: 0.9rem;
}
.shp-chart__svg {
  width: 100%;
  max-width: 320px;
  height: auto;
  display: block;
}
.shp-chart__line {
  stroke: #ad81be;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
@media (prefers-color-scheme: dark) {
  .shp-card,
  .shp-input,
  .shp-btn,
  .shp__detail {
    background: #2a2438;
    color: #f0e8f8;
  }
}
</style>
