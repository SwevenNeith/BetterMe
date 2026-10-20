<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '../lib/supabase.js'
import { BATTERY_HISTORY_PRESETS } from '../constants/battery/battery.js'
import { resolveSessionUser } from '../utils/auth/sessionUser.js'
import { getLocalTodayISO } from '../services/common/scheduledReminders.js'
import { listBatteryHistory } from '../services/battery/batteryDays.js'
import { listEmotionLogs } from '../services/mood/emotionLogs.js'
import {
  correlateWithMood,
  describeAvgLieIn,
  describeAvgSpentByLieIn,
  describeAvgSpentBySleep,
  describeEmotionalEnergyCorrelation,
  describeLieInCorrelation,
  describeMoodCorrelation,
  describeSleepHoursCorrelation,
  seriesForChart,
  topCostliestDays,
  topGreedyActivities,
} from '../utils/battery/batteryInsights.js'
import { toDayDateIso } from '../utils/battery/batteryMath.js'
import { toISODate } from '../utils/habit/habitCalendar.js'

defineOptions({ name: 'BatteryHistoryView' })

const pageTitle = 'Historique'

const route = useRoute()
const router = useRouter()

const userId = ref(null)
const periodPreset = ref('30d')
const customFrom = ref('')
const customTo = ref('')
const history = ref([])
const emotionLogs = ref([])
const isLoading = ref(false)
const loadError = ref('')
const rangeError = ref('')

const todayIso = computed(() => getLocalTodayISO())

function monthRange(anchor = new Date()) {
  const y = anchor.getFullYear()
  const m = anchor.getMonth() + 1
  const lastDay = new Date(y, m, 0).getDate()
  return {
    from: toISODate(y, m, 1),
    to: toISODate(y, m, lastDay),
  }
}

function yearRange(anchor = new Date()) {
  const y = anchor.getFullYear()
  return {
    from: toISODate(y, 1, 1),
    to: toISODate(y, 12, 31),
  }
}

function resolvePeriodRange() {
  const today = todayIso.value
  const preset = periodPreset.value

  if (preset === '7d') {
    return { from: shiftDays(today, -6), to: today }
  }
  if (preset === '30d') {
    return { from: shiftDays(today, -29), to: today }
  }
  if (preset === '90d') {
    return { from: shiftDays(today, -89), to: today }
  }
  if (preset === 'month') {
    const range = monthRange()
    return { from: range.from, to: range.to > today ? today : range.to }
  }
  if (preset === 'year') {
    const range = yearRange()
    return { from: range.from, to: range.to > today ? today : range.to }
  }

  const from = customFrom.value
  const to = customTo.value || today
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return null
  }
  return from <= to ? { from, to } : { from: to, to: from }
}

function shiftDays(iso, delta) {
  const [y, m, d] = String(iso).split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + delta)
  return toDayDateIso(date)
}

const activeRange = computed(() => resolvePeriodRange())

const periodLabel = computed(() => {
  const range = activeRange.value
  if (!range) return 'période'
  if (periodPreset.value === '7d') return '7 jours'
  if (periodPreset.value === '30d') return '30 jours'
  if (periodPreset.value === '90d') return '90 jours'
  if (periodPreset.value === 'month') return 'ce mois'
  if (periodPreset.value === 'year') return 'cette année'
  return `du ${formatDateFr(range.from)} au ${formatDateFr(range.to)}`
})

function formatDateFr(iso) {
  try {
    const [y, m, d] = String(iso).split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

const chartSeries = computed(() => seriesForChart(history.value))
const costliestDays = computed(() => topCostliestDays(history.value, 5))
const greedyActivities = computed(() => topGreedyActivities(history.value, 8))
const correlations = computed(() => correlateWithMood(history.value, emotionLogs.value))
const chartMax = computed(() => {
  const vals = chartSeries.value.flatMap((p) => [p.spent, p.budget])
  return Math.max(10, ...vals, 1)
})

async function loadHistory() {
  if (!userId.value) return

  const range = resolvePeriodRange()
  if (!range) {
    rangeError.value = 'Choisis une date de début et une date de fin.'
    return
  }
  rangeError.value = ''
  isLoading.value = true
  loadError.value = ''
  try {
    history.value = await listBatteryHistory(supabase, userId.value, range)
    emotionLogs.value = await listEmotionLogs(supabase, userId.value, {
      from: range.from,
      to: range.to,
    })
  } catch (err) {
    console.error(err)
    loadError.value =
      err?.message?.includes('battery_') || err?.code === '42P01'
        ? 'Tables Batterie introuvables. Exécute scripts/create-battery.sql dans Supabase.'
        : 'Impossible de charger l’historique.'
  } finally {
    isLoading.value = false
  }
}

function selectPreset(id) {
  periodPreset.value = id
  if (id !== 'custom') {
    void loadHistory()
    return
  }
  if (!customFrom.value || !customTo.value) {
    const today = todayIso.value
    customTo.value = today
    customFrom.value = shiftDays(today, -29)
  }
}

function applyCustomRange() {
  periodPreset.value = 'custom'
  void loadHistory()
}

function goBack() {
  const date = String(route.query.date || '')
  router.push({
    name: 'battery',
    query: /^\d{4}-\d{2}-\d{2}$/.test(date) ? { date } : undefined,
  })
}

function openDay(dayIso) {
  router.push({
    name: 'battery',
    query: { date: dayIso },
  })
}

onMounted(async () => {
  document.title = `${pageTitle} · BetterMe`
  const today = todayIso.value
  customTo.value = today
  customFrom.value = shiftDays(today, -29)
  const user = await resolveSessionUser()
  if (!user) return
  userId.value = user.id
  await loadHistory()
})
</script>

<template>
  <div class="history-page">
    <div class="bg-blob bg-blob--a" aria-hidden="true" />
    <div class="bg-blob bg-blob--b" aria-hidden="true" />

    <header class="page-header">
      <button type="button" class="page-back" @click="goBack">← Batterie</button>
      <h1 class="page-title">{{ pageTitle }}</h1>
      <p class="page-subtitle">Courbes, jours coûteux, activités gourmandes et corrélations.</p>
    </header>

    <div class="toolbar">
      <div class="window-chips" role="group" aria-label="Période">
        <button
          v-for="preset in BATTERY_HISTORY_PRESETS"
          :key="preset.id"
          type="button"
          class="chip"
          :class="{ 'is-active': periodPreset === preset.id }"
          @click="selectPreset(preset.id)"
        >
          {{ preset.label }}
        </button>
      </div>

      <div v-if="periodPreset === 'custom'" class="custom-range">
        <label class="custom-range__field">
          <span>Du</span>
          <input v-model="customFrom" type="date" :max="customTo || todayIso" />
        </label>
        <label class="custom-range__field">
          <span>Au</span>
          <input v-model="customTo" type="date" :min="customFrom || undefined" :max="todayIso" />
        </label>
        <button type="button" class="chip chip--apply" @click="applyCustomRange">Appliquer</button>
      </div>
      <p v-if="rangeError" class="range-error">{{ rangeError }}</p>
    </div>

    <p v-if="loadError" class="flash flash--error">{{ loadError }}</p>
    <p v-else-if="isLoading" class="flash">Chargement…</p>

    <template v-else>
      <section class="panel chart-panel">
        <h2 class="panel__title">Dépenses · {{ periodLabel }}</h2>
        <div class="chart" role="img" :aria-label="`Dépenses · ${periodLabel}`">
          <div
            v-for="point in chartSeries"
            :key="point.date"
            class="chart-col"
            :title="`${point.date} : ${point.spent} / ${point.budget}`"
          >
            <div class="chart-bars">
              <div
                class="chart-bar chart-bar--budget"
                :style="{ height: `${(point.budget / chartMax) * 100}%` }"
              />
              <div
                class="chart-bar chart-bar--spent"
                :style="{ height: `${(point.spent / chartMax) * 100}%` }"
              />
            </div>
          </div>
        </div>
        <p class="chart-legend">
          <span class="leg leg-budget">Budget</span>
          <span class="leg leg-spent">Dépensé</span>
        </p>
        <p v-if="!chartSeries.length" class="empty">Pas encore de données sur cette période.</p>
      </section>

      <div class="insights-grid">
        <section class="panel">
          <h2 class="panel__title">Jours les plus coûteux</h2>
          <ul class="plain-list">
            <li v-for="d in costliestDays" :key="d.day_date">
              <button type="button" class="link-btn" @click="openDay(d.day_date)">
                {{ d.day_date }}
              </button>
              <span class="meta">{{ d.spent }} pts</span>
            </li>
            <li v-if="!costliestDays.length" class="empty">Pas encore de données</li>
          </ul>
        </section>

        <section class="panel">
          <h2 class="panel__title">Activités gourmandes</h2>
          <ul class="plain-list">
            <li v-for="a in greedyActivities" :key="a.label + a.total">
              <span class="item-name">{{ a.label }}</span>
              <span class="meta">{{ a.total }} pts ({{ a.count }}×)</span>
            </li>
            <li v-if="!greedyActivities.length" class="empty">Pas encore de données</li>
          </ul>
        </section>

        <section class="panel">
          <h2 class="panel__title">Ce que disent tes données</h2>
          <p class="panel__intro">
            Lectures simples à partir de ta période sélectionnée — pas de chiffres bruts.
          </p>
          <ul class="insight-list">
            <li>
              <strong>Humeur</strong>
              <p>{{ describeMoodCorrelation(correlations.spentVsMood) }}</p>
            </li>
            <li>
              <strong>Énergie émotionnelle</strong>
              <p>{{ describeEmotionalEnergyCorrelation(correlations.spentVsEmotionalEnergy) }}</p>
            </li>
            <li>
              <strong>Qualité du sommeil</strong>
              <p>{{ describeAvgSpentBySleep(correlations.avgSpentBySleep) }}</p>
            </li>
            <li>
              <strong>Durée de sommeil</strong>
              <p>{{ describeSleepHoursCorrelation(correlations.spentVsSleepHours) }}</p>
            </li>
            <li>
              <strong>Temps au lit après réveil</strong>
              <p>{{ describeLieInCorrelation(correlations.spentVsLieIn) }}</p>
            </li>
            <li>
              <strong>Selon l’écart réveil → sortie</strong>
              <p>{{ describeAvgSpentByLieIn(correlations.avgSpentByLieIn) }}</p>
            </li>
            <li>
              <strong>Habitude du matin</strong>
              <p>{{ describeAvgLieIn(correlations.avgLieInMinutes) }}</p>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.history-page {
  position: relative;
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
  overflow: hidden;
}

.bg-blob {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  z-index: 0;
}

.bg-blob--a {
  width: 400px;
  height: 400px;
  top: -120px;
  right: -80px;
  background: radial-gradient(circle, rgba(213, 181, 234, 0.32) 0%, transparent 70%);
}

.bg-blob--b {
  width: 320px;
  height: 320px;
  bottom: 8%;
  left: -90px;
  background: radial-gradient(circle, rgba(149, 209, 170, 0.2) 0%, transparent 70%);
}

.page-header,
.toolbar,
.panel,
.flash,
.insights-grid {
  position: relative;
  z-index: 1;
}

.page-header {
  margin-bottom: 1.25rem;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  text-align: center;
}

.page-back {
  display: inline-block;
  align-self: flex-start;
  margin-bottom: 0.65rem;
  padding: 0.25rem 0;
  border: none;
  background: transparent;
  color: #6b4f7c;
  font: inherit;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
}

.page-back:hover {
  color: #3d2f4a;
}

.page-title {
  margin: 0;
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  letter-spacing: -0.5px;
}

.page-subtitle {
  margin: 0.5rem auto 0;
  max-width: 520px;
  color: #6c757d;
  font-size: 1rem;
  line-height: 1.45;
}

.toolbar {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.75rem;
  width: 100%;
  margin-bottom: 1.15rem;
}

.window-chips {
  display: flex;
  flex-wrap: wrap;
  width: 100%;
  gap: 0.4rem;
  padding: 0.28rem;
  border-radius: 12px;
  background: rgba(213, 181, 234, 0.14);
  border: 1px solid rgba(213, 181, 234, 0.28);
  box-sizing: border-box;
}

.chip {
  flex: 1 1 0;
  border: none;
  border-radius: 9px;
  padding: 0.45rem 0.55rem;
  font: inherit;
  font-size: 0.88rem;
  font-weight: 700;
  color: #6c757d;
  background: transparent;
  cursor: pointer;
  text-align: center;
  white-space: nowrap;
}

.chip.is-active {
  background: rgba(255, 255, 255, 0.92);
  color: #ad81be;
  box-shadow: 0 2px 6px rgba(173, 129, 190, 0.12);
}

.chip--apply {
  flex: 0 0 auto;
  background: rgba(173, 129, 190, 0.28);
  color: #5a3d6e;
  padding-inline: 1rem;
}

.custom-range {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  width: 100%;
  gap: 0.65rem;
  box-sizing: border-box;
}

.custom-range__field {
  display: flex;
  flex: 1 1 10rem;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #8a9098;
}

.custom-range__field input {
  width: 100%;
  border: 1px solid rgba(213, 181, 234, 0.4);
  border-radius: 9px;
  padding: 0.45rem 0.55rem;
  background: rgba(255, 255, 255, 0.88);
  font: inherit;
  font-size: 0.92rem;
  font-weight: 600;
  color: #2c3e50;
  text-transform: none;
  letter-spacing: normal;
  box-sizing: border-box;
}

.range-error {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 600;
  color: #c45c5c;
}

.panel {
  width: 100%;
  background: rgba(255, 255, 255, 0.68);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 18px;
  padding: 1.15rem 1.15rem 1.3rem;
  margin-bottom: 1rem;
  box-sizing: border-box;
}

.panel__title {
  margin: 0 0 0.85rem;
  font-size: 1.1rem;
  font-weight: 800;
  color: #2c3e50;
}

.chart-panel {
  margin-bottom: 1rem;
}

.chart {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 180px;
  padding: 0.35rem 0;
  overflow-x: auto;
}

.chart-col {
  flex: 1 0 8px;
  min-width: 5px;
  height: 100%;
}

.chart-bars {
  position: relative;
  width: 100%;
  height: 100%;
}

.chart-bar {
  position: absolute;
  left: 12%;
  right: 12%;
  bottom: 0;
  border-radius: 3px 3px 0 0;
}

.chart-bar--budget {
  background: rgba(173, 129, 190, 0.28);
}

.chart-bar--spent {
  background: linear-gradient(180deg, #ad81be, #8fa2d4);
}

.chart-legend {
  display: flex;
  gap: 1rem;
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
  color: #6c757d;
}

.leg::before {
  content: '';
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  margin-right: 0.35rem;
  vertical-align: middle;
}

.leg-budget::before {
  background: rgba(173, 129, 190, 0.35);
}

.leg-spent::before {
  background: #ad81be;
}

.insights-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

.insights-grid .panel {
  margin-bottom: 0;
}

.plain-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}

.plain-list li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.45rem 0;
  border-bottom: 1px solid rgba(213, 181, 234, 0.2);
  font-size: 0.95rem;
  color: #2c3e50;
}

.plain-list--stack li {
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
}

.panel__intro {
  margin: -0.25rem 0 0.85rem;
  font-size: 0.88rem;
  color: #8a9098;
  line-height: 1.4;
}

.insight-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.85rem;
}

.insight-list li {
  padding: 0.65rem 0.75rem;
  border-radius: 12px;
  background: rgba(213, 181, 234, 0.1);
  border: 1px solid rgba(213, 181, 234, 0.22);
}

.insight-list strong {
  display: block;
  margin-bottom: 0.3rem;
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: #8a6a9e;
}

.insight-list p {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.45;
  color: #2c3e50;
}

.item-name {
  font-weight: 600;
}

.meta {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: #6c757d;
  white-space: nowrap;
}

.link-btn {
  border: none;
  background: none;
  color: #7a5a8e;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
}

.subtle {
  color: #8a9098;
  font-size: 0.85rem;
  line-height: 1.35;
}

.empty {
  color: #8a9098;
  font-size: 0.9rem;
}

.flash {
  margin: 0 0 1rem;
  text-align: center;
  color: #6c757d;
}

.flash--error {
  color: #c45c5c;
  font-weight: 600;
}

@media (max-width: 900px) {
  .insights-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-color-scheme: dark) {
  .page-title,
  .panel__title,
  .plain-list li,
  .item-name,
  .insight-list p {
    color: #f0e8f8;
  }

  .panel__intro {
    color: #adb5bd;
  }

  .insight-list li {
    background: rgba(35, 30, 48, 0.55);
    border-color: rgba(213, 181, 234, 0.18);
  }

  .insight-list strong {
    color: #c9b0d8;
  }

  .page-back {
    color: #c9b0d8;
  }

  .page-back:hover {
    color: #f0e8f8;
  }

  .page-subtitle,
  .chart-legend,
  .meta,
  .subtle,
  .empty,
  .flash {
    color: #adb5bd;
  }

  .panel,
  .chip.is-active {
    background: rgba(35, 30, 48, 0.78);
    border-color: rgba(213, 181, 234, 0.22);
  }

  .chip.is-active {
    color: #d5b5ea;
  }

  .custom-range__field {
    color: #adb5bd;
  }

  .custom-range__field input {
    background: rgba(35, 30, 48, 0.78);
    border-color: rgba(213, 181, 234, 0.28);
    color: #f0e8f8;
    color-scheme: dark;
  }

  .chip--apply {
    background: rgba(173, 129, 190, 0.35);
    color: #e8d4f0;
  }
}
</style>
