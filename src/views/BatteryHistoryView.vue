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
  activityDurationStats,
  avgSpentByActivityDuration,
  buildRealizationInsights,
  correlateWithMood,
  describeAvgLieIn,
  describeAvgSpentByActivityDuration,
  describeAvgSpentByLieIn,
  describeAvgSpentBySleep,
  describeEmotionalEnergyCorrelation,
  describeLieInCorrelation,
  describeMoodCorrelation,
  describeSleepHoursCorrelation,
  formatCompletionRate,
  seriesForChart,
  topCostliestDays,
  topGreedyActivities,
} from '../utils/battery/batteryInsights.js'
import { formatDurationMinutesLabel } from '../utils/battery/batteryDuration.js'
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
const costliestDays = computed(() => topCostliestDays(history.value, 3))
const greedyActivities = computed(() => topGreedyActivities(history.value, 10))
const activityStats = computed(() =>
  activityDurationStats(history.value, { minSamples: 3, limit: 8 }).filter((row) => row.enoughData),
)
const durationEnergyAverages = computed(() => avgSpentByActivityDuration(history.value))
const correlations = computed(() => correlateWithMood(history.value, emotionLogs.value))
const realization = computed(() => buildRealizationInsights(history.value))

/**
 * @param {number | null | undefined} n
 * @param {number} [digits]
 */
function formatStatNumber(n, digits = 1) {
  if (n == null || !Number.isFinite(Number(n))) return null
  const v = Number(n)
  return Number.isInteger(v) ? String(v) : v.toFixed(digits)
}

/**
 * Résumé compact : durée moyenne + coût moyen.
 * @param {ReturnType<typeof activityDurationStats>[number]} row
 */
function activityStatSummary(row) {
  if (!row.enoughData) return 'Pas assez de données'
  const parts = []
  if (row.enoughDurationData && row.avgDurationMinutes != null) {
    parts.push(
      formatDurationMinutesLabel(row.avgDurationMinutes, { compactOver2h: false }),
    )
  }
  if (row.avgCost != null) {
    parts.push(`${formatStatNumber(row.avgCost)} pts`)
  }
  return parts.length ? parts.join(' · ') : 'Pas assez de données'
}

const reasonBarMax = computed(() =>
  Math.max(0, ...realization.value.reasonShares.map((r) => Number(r.cost) || 0), 0.1),
)

const CHART_W = 640
const CHART_H = 220
const CHART_PAD = { top: 16, right: 12, bottom: 28, left: 36 }

const chartDomain = computed(() => {
  const vals = chartSeries.value.flatMap((p) => [p.spent, p.budget])
  if (!vals.length) return { min: 0, max: 10 }
  const rawMin = Math.min(0, ...vals)
  const rawMax = Math.max(...vals, 1)
  const pad = Math.max(0.5, (rawMax - rawMin) * 0.08)
  return { min: rawMin - (rawMin < 0 ? pad : 0), max: rawMax + pad }
})

/**
 * Polyline lissée (Catmull-Rom → cubic Bézier).
 * @param {{ x: number, y: number }[]} points
 */
function smoothPath(points) {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
  }

  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] || p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
  }
  return d
}

const chartGeometry = computed(() => {
  const series = chartSeries.value
  const { min, max } = chartDomain.value
  const innerW = CHART_W - CHART_PAD.left - CHART_PAD.right
  const innerH = CHART_H - CHART_PAD.top - CHART_PAD.bottom
  const range = Math.max(max - min, 0.1)
  const n = series.length

  const toX = (i) =>
    CHART_PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const toY = (v) => CHART_PAD.top + innerH - ((Number(v) - min) / range) * innerH

  const budgetPts = series.map((p, i) => ({ x: toX(i), y: toY(p.budget) }))
  const spentPts = series.map((p, i) => ({ x: toX(i), y: toY(p.spent) }))

  const spentArea =
    spentPts.length > 0
      ? `${smoothPath(spentPts)} L ${spentPts[spentPts.length - 1].x} ${CHART_PAD.top + innerH} L ${spentPts[0].x} ${CHART_PAD.top + innerH} Z`
      : ''

  const tickCount = 4
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const value = min + (range * i) / tickCount
    return { value, y: toY(value) }
  })

  const labelStep = n <= 8 ? 1 : Math.ceil(n / 6)
  const xLabels = series
    .map((p, i) => ({
      date: p.date,
      x: toX(i),
      short: String(p.date).slice(5),
      show: i === 0 || i === n - 1 || i % labelStep === 0,
    }))
    .filter((l) => l.show)

  return {
    budgetPath: smoothPath(budgetPts),
    spentPath: smoothPath(spentPts),
    spentArea,
    budgetPts,
    spentPts,
    yTicks,
    xLabels,
    zeroY: toY(0),
  }
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
        <div
          v-if="chartSeries.length"
          class="chart"
          role="img"
          :aria-label="`Dépenses · ${periodLabel}`"
        >
          <svg
            class="chart-svg"
            :viewBox="`0 0 ${CHART_W} ${CHART_H}`"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <linearGradient id="hist-spent-stroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="#ad81be" />
                <stop offset="100%" stop-color="#8fa2d4" />
              </linearGradient>
              <linearGradient id="hist-spent-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#ad81be" stop-opacity="0.28" />
                <stop offset="100%" stop-color="#ad81be" stop-opacity="0.02" />
              </linearGradient>
            </defs>

            <line
              v-for="tick in chartGeometry.yTicks"
              :key="`grid-${tick.y}`"
              class="chart-grid"
              :x1="CHART_PAD.left"
              :x2="CHART_W - CHART_PAD.right"
              :y1="tick.y"
              :y2="tick.y"
            />

            <text
              v-for="tick in chartGeometry.yTicks"
              :key="`ylab-${tick.y}`"
              class="chart-axis-label"
              :x="CHART_PAD.left - 8"
              :y="tick.y + 3"
              text-anchor="end"
            >
              {{ Number(tick.value.toFixed(1)) }}
            </text>

            <text
              v-for="label in chartGeometry.xLabels"
              :key="`xlab-${label.date}`"
              class="chart-axis-label chart-axis-label--x"
              :x="label.x"
              :y="CHART_H - 8"
              text-anchor="middle"
            >
              {{ label.short }}
            </text>

            <path
              v-if="chartGeometry.spentArea"
              class="chart-area chart-area--spent"
              :d="chartGeometry.spentArea"
            />
            <path
              class="chart-line chart-line--budget"
              fill="none"
              :d="chartGeometry.budgetPath"
            />
            <path
              class="chart-line chart-line--spent"
              fill="none"
              :d="chartGeometry.spentPath"
            />

            <circle
              v-for="(pt, i) in chartGeometry.spentPts"
              :key="`spent-dot-${chartSeries[i].date}`"
              class="chart-dot chart-dot--spent"
              :cx="pt.x"
              :cy="pt.y"
              r="3.2"
            >
              <title>
                {{ chartSeries[i].date }} · dépensé {{ chartSeries[i].spent }} / budget
                {{ chartSeries[i].budget }}
              </title>
            </circle>
          </svg>
        </div>
        <p class="chart-legend">
          <span class="leg leg-budget">Budget</span>
          <span class="leg leg-spent">Dépensé</span>
        </p>
        <p v-if="!chartSeries.length" class="empty">Pas encore de données sur cette période.</p>
      </section>

      <section class="panel realization-panel">
        <h2 class="panel__title">Réalisation du plan · {{ periodLabel }}</h2>
        <p class="panel__intro">
          Jours avec au moins une activité planifiée (dépense) :
          <strong>{{ realization.sampleDays }}</strong>
        </p>

        <div v-if="realization.sampleDays" class="realization-kpis">
          <div class="kpi">
            <p class="kpi__label">Taux de réalisation moyen</p>
            <p class="kpi__value">{{ formatCompletionRate(realization.avgCompletionRate) }}</p>
          </div>
          <div class="kpi">
            <p class="kpi__label">Report lié à « pas envie »</p>
            <p class="kpi__value">{{ formatCompletionRate(realization.desireDeferralRate) }}</p>
            <p class="kpi__hint">Part du prévu reportée pour cette raison</p>
          </div>
        </div>
        <p v-else class="empty">Pas encore de jours avec un plan sur cette période.</p>

        <div v-if="realization.sampleDays" class="realization-split">
          <div>
            <h3 class="sub-title">Raisons de non-réalisation</h3>
            <p class="panel__intro">Pondérées par le coût des activités non faites.</p>
            <ul class="reason-bars">
              <li v-for="reason in realization.reasonShares" :key="reason.id">
                <div class="reason-bars__head">
                  <span>{{ reason.label }}</span>
                  <span class="meta">
                    {{ reason.cost }} pts
                    <template v-if="reason.share != null"> · {{ formatCompletionRate(reason.share) }}</template>
                  </span>
                </div>
                <div class="reason-bars__track" aria-hidden="true">
                  <span
                    class="reason-bars__fill"
                    :style="{ width: `${Math.round((reason.cost / reasonBarMax) * 100)}%` }"
                  />
                </div>
              </li>
            </ul>
            <p
              v-if="realization.reasonShares.every((r) => !r.cost)"
              class="empty"
            >
              Aucune raison renseignée pour l’instant.
            </p>
          </div>

          <div>
            <h3 class="sub-title">Réalisation selon la batterie de départ</h3>
            <ul class="bucket-list">
              <li v-for="bucket in realization.completionByStartBucket" :key="bucket.id">
                <span class="bucket-list__label">{{ bucket.label }}</span>
                <span class="bucket-list__value">
                  {{ formatCompletionRate(bucket.avgRate) }}
                </span>
                <span class="meta">{{ bucket.sampleDays }} j</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <div class="insights-grid">
        <section class="panel">
          <h2 class="panel__title">Top 3 jours les plus coûteux</h2>
          <ul class="plain-list">
            <li v-for="d in costliestDays" :key="d.day_date">
              <button type="button" class="link-btn" @click="openDay(d.day_date)">
                {{ d.day_date }}
              </button>
              <span class="meta">{{ d.spent }} pts</span>
            </li>
            <li v-if="!costliestDays.length" class="empty">Pas encore de données</li>
          </ul>

          <h2 class="panel__title panel__title--nested">Durée par activité</h2>
          <p class="panel__intro panel__intro--tight">
            Moyenne durée · coût (activités faites, ≥ 3×).
          </p>
          <ul class="plain-list activity-stats">
            <li v-for="row in activityStats" :key="(row.activity_id || row.label) + row.count">
              <div class="activity-stats__head">
                <span class="item-name">{{ row.label }}</span>
                <span class="meta">{{ row.count }}×</span>
              </div>
              <p class="activity-stats__detail">{{ activityStatSummary(row) }}</p>
            </li>
            <li v-if="!activityStats.length" class="empty">Pas encore de données</li>
          </ul>
        </section>

        <section class="panel">
          <h2 class="panel__title">Top 10 activités gourmandes</h2>
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
              <strong>Énergie – Durée</strong>
              <p>{{ describeAvgSpentByActivityDuration(durationEnergyAverages) }}</p>
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

.realization-panel {
  margin-bottom: 1rem;
}

.realization-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
  margin: 0.75rem 0 1rem;
}

.kpi {
  padding: 0.85rem 0.95rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.55);
}

.kpi__label {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 700;
  color: #6d5a7e;
}

.kpi__value {
  margin: 0.25rem 0 0;
  font-size: 1.55rem;
  font-weight: 800;
  color: #3b2a4a;
}

.kpi__hint {
  margin: 0.2rem 0 0;
  font-size: 0.75rem;
  color: #8a779c;
}

.realization-split {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.1rem;
}

.sub-title {
  margin: 0 0 0.25rem;
  font-size: 0.98rem;
  color: #3b2a4a;
}

.reason-bars {
  list-style: none;
  margin: 0.55rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}

.reason-bars__head {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.86rem;
  font-weight: 650;
  color: #3b2a4a;
}

.reason-bars__track {
  height: 0.45rem;
  border-radius: 999px;
  background: rgba(213, 181, 234, 0.25);
  overflow: hidden;
}

.reason-bars__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #d5b5ea, #ad81be);
  min-width: 0;
}

.bucket-list {
  list-style: none;
  margin: 0.55rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}

.bucket-list li {
  display: grid;
  grid-template-columns: 4.5rem 1fr auto;
  gap: 0.5rem;
  align-items: center;
  padding: 0.45rem 0.55rem;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgba(213, 181, 234, 0.28);
}

.bucket-list__label {
  font-weight: 750;
  color: #5e4a6c;
}

.bucket-list__value {
  font-weight: 800;
  color: #3b2a4a;
}

.chart-panel {
  margin-bottom: 1rem;
}

.chart {
  width: 100%;
  height: 220px;
  padding: 0.15rem 0 0.35rem;
}

.chart-svg {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}

.chart-grid {
  stroke: rgba(173, 129, 190, 0.18);
  stroke-width: 1;
  stroke-dasharray: 4 5;
}

.chart-axis-label {
  fill: #8a9098;
  font-size: 11px;
  font-weight: 600;
}

.chart-axis-label--x {
  font-size: 10px;
}

.chart-area--spent {
  fill: url(#hist-spent-fill);
}

.chart-line {
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.chart-line--budget {
  stroke: rgba(173, 129, 190, 0.55);
  stroke-dasharray: 6 5;
  stroke-width: 2;
}

.chart-line--spent {
  stroke: url(#hist-spent-stroke);
}

.chart-dot--spent {
  fill: #ad81be;
  stroke: #fff;
  stroke-width: 1.5;
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
  width: 14px;
  height: 3px;
  border-radius: 999px;
  margin-right: 0.35rem;
  vertical-align: middle;
}

.leg-budget::before {
  background: rgba(173, 129, 190, 0.55);
  box-shadow: inset 0 0 0 0 transparent;
  background-image: repeating-linear-gradient(
    90deg,
    rgba(173, 129, 190, 0.7) 0 6px,
    transparent 6px 10px
  );
}

.leg-spent::before {
  background: linear-gradient(90deg, #ad81be, #8fa2d4);
}

.insights-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

.insights-grid .panel {
  margin-bottom: 0;
}

.panel__title--nested {
  margin-top: 1.15rem;
}

.panel__intro--tight {
  margin: 0 0 0.55rem;
  font-size: 0.8rem;
}

.activity-stats li {
  flex-direction: column;
  align-items: stretch;
  gap: 0.15rem;
}

.activity-stats__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.activity-stats__detail {
  margin: 0;
  font-size: 0.8rem;
  color: #6c757d;
  line-height: 1.3;
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
  .flash,
  .chart-axis-label {
    color: #adb5bd;
  }

  .chart-axis-label {
    fill: #adb5bd;
  }

  .chart-grid {
    stroke: rgba(213, 181, 234, 0.16);
  }

  .chart-dot--spent {
    stroke: #2a2438;
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
