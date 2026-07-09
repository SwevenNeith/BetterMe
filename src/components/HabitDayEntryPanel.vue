<script setup>
import { ref, computed, watch } from 'vue'
import { supabase } from '../lib/supabase.js'
import { getLocalTodayISO } from '../services/scheduledReminders.js'
import { listHabitLogsForRange, upsertHabitLog } from '../services/habitLogs.js'
import { HABIT_VALUE_TYPE } from '../constants/habitOptions.js'
import {
  addDaysISO,
  iterateISODateRange,
  normalizeDateISO,
  parseISODate,
  toISODate,
} from '../utils/habitCalendar.js'
import {
  buildLogPayload,
  computeHabitStats,
  formatStatNumber,
  getEffectiveValeur,
  isHabitDayDone,
} from '../utils/habitStats.js'

const props = defineProps({
  habit: {
    type: Object,
    required: true,
  },
  userId: {
    type: String,
    required: true,
  },
  refreshKey: {
    type: Number,
    default: 0,
  },
})

const emit = defineEmits(['saved'])

const selectedDate = ref(getLocalTodayISO())
const inputValue = ref(0)
const logsByDate = ref({})
const isLoading = ref(false)
const isSaving = ref(false)
const loadError = ref('')
const saveError = ref('')
const saveMessage = ref('')

const historyOpen = ref(false)
const historyMode = ref('semaine') // 'jour' | 'semaine' | 'mois' | 'annee'
const historyYear = ref(new Date().getFullYear())
const historyLogsByDate = ref({})
const historyLoading = ref(false)
const historyError = ref('')
let historyLoadRequestId = 0
const historyLogsCache = new Map() // year:number -> logsByDate:Record<string, any>

const rangeStart = ref('')
const rangeEnd = ref(getLocalTodayISO()) // si vide au calcul => aujourd'hui
const rangeTotal = ref(null)
const rangeDetails = ref([])
const rangeLoading = ref(false)
const rangeError = ref('')
let rangeComputeRequestId = 0

const HISTORY_PAGE_SIZE = 10
const rangePage = ref(0)

const filterOpen = ref(false)
const dayPage = ref(0)
const weekPage = ref(0)
const monthPage = ref(0)
const yearPage = ref(0)

const isBoolean = computed(() => props.habit.type_valeur === HABIT_VALUE_TYPE.BOOLEAN)

const todayIso = computed(() => getLocalTodayISO())

const canEditEntry = computed(() => !isSaving.value)

const valueLabel = computed(() => {
  if (isBoolean.value) return 'Statut du jour'
  return props.habit.unite ? `Valeur (${props.habit.unite})` : 'Valeur du jour'
})

const stats = computed(() =>
  computeHabitStats(logsByDate.value, todayIso.value, selectedDate.value),
)

function syncInputFromLog() {
  const log = logsByDate.value[selectedDate.value]
  if (!isHabitDayDone(log)) {
    inputValue.value = 0
    return
  }
  inputValue.value = Math.max(0, Number(log.valeur ?? 0))
}

async function loadStatsLogs() {
  if (!props.userId || !props.habit?.id) return

  isLoading.value = true
  loadError.value = ''
  const today = todayIso.value
  const start = addDaysISO(today, -30)

  try {
    const rows = await listHabitLogsForRange(supabase, props.userId, props.habit.id, start, today)
    const map = {}
    for (const row of rows) {
      map[normalizeDateISO(row.date_jour)] = { ...row, date_jour: normalizeDateISO(row.date_jour) }
    }
    logsByDate.value = map
    syncInputFromLog()
  } catch (err) {
    console.error(err)
    loadError.value = err.message || 'Impossible de charger les statistiques.'
    logsByDate.value = {}
  } finally {
    isLoading.value = false
  }
}

async function persistValue() {
  if (!props.userId || !props.habit?.id) return
  if (selectedDate.value > todayIso.value) {
    saveError.value = 'Impossible de renseigner une date future.'
    return
  }

  isSaving.value = true
  saveError.value = ''
  saveMessage.value = ''

  try {
    const payload = buildLogPayload(inputValue.value, props.habit.type_valeur)
    const row = await upsertHabitLog(
      supabase,
      props.userId,
      props.habit.id,
      selectedDate.value,
      payload,
    )
    logsByDate.value = {
      ...logsByDate.value,
      [selectedDate.value]: { ...row, date_jour: normalizeDateISO(row.date_jour) },
    }
    inputValue.value = Math.max(0, Number(row.valeur ?? 0))
    saveMessage.value = 'Enregistré.'
    emit('saved', selectedDate.value)
    setTimeout(() => {
      saveMessage.value = ''
    }, 2000)
  } catch (err) {
    console.error(err)
    saveError.value = err.message || 'Impossible d’enregistrer.'
  } finally {
    isSaving.value = false
  }
}

function increment() {
  inputValue.value = Math.max(0, Number(inputValue.value) + 1)
  void persistValue()
}

function decrement() {
  inputValue.value = Math.max(0, Number(inputValue.value) - 1)
  void persistValue()
}

function onInputBlur() {
  const normalized = Math.max(0, Number(inputValue.value) || 0)
  inputValue.value = normalized
  void persistValue()
}

function onBooleanToggle(event) {
  inputValue.value = event.target.checked ? 1 : 0
  void persistValue()
}

function toLocalDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseISOToDate(iso) {
  const { year, month, day } = parseISODate(iso)
  return new Date(year, month - 1, day)
}

function getWeekBoundsFromDateISO(dateIso) {
  const date = parseISOToDate(dateIso)
  const jsDay = date.getDay()
  const diff = jsDay === 0 ? -6 : 1 - jsDay // lundi
  const monday = new Date(date)
  monday.setDate(date.getDate() + diff)
  const startIso = toLocalDateKey(monday)
  const endIso = addDaysISO(startIso, 6)
  return { startIso, endIso }
}

function formatDayLabelFr(iso) {
  const date = parseISOToDate(iso)
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function weekLabelFr(startIso) {
  const endIso = addDaysISO(startIso, 6)
  return `${formatDayLabelFr(startIso)} – ${formatDayLabelFr(endIso)}`
}

function monthLabelFr(year, month) {
  return new Date(year, month - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

function buildYearOptions(anchorYear = new Date().getFullYear(), span = 5) {
  const years = []
  for (let y = anchorYear - span; y <= anchorYear + span; y += 1) {
    years.push(y)
  }
  return years
}

const yearOptions = computed(() => buildYearOptions(new Date().getFullYear(), 6))

async function loadHistoryLogs(year) {
  if (!props.userId || !props.habit?.id) return

  const cached = historyLogsCache.get(year)
  if (cached) {
    historyLogsByDate.value = cached
    historyLoading.value = false
    historyError.value = ''
    return
  }

  const requestId = (historyLoadRequestId += 1)
  historyLoading.value = true
  historyError.value = ''

  const start = `${year}-01-01`
  const end = `${year}-12-31`

  try {
    const rows = await listHabitLogsForRange(supabase, props.userId, props.habit.id, start, end)
    if (requestId !== historyLoadRequestId || !historyOpen.value) return
    const map = {}
    for (const row of rows) {
      map[normalizeDateISO(row.date_jour)] = { ...row, date_jour: normalizeDateISO(row.date_jour) }
    }
    historyLogsByDate.value = map
    historyLogsCache.set(year, map)
  } catch (err) {
    if (requestId !== historyLoadRequestId || !historyOpen.value) return
    console.error(err)
    historyError.value = err.message || "Impossible de charger l'historique."
    historyLogsByDate.value = {}
  } finally {
    if (requestId === historyLoadRequestId) historyLoading.value = false
  }
}

const hasRangeOverride = computed(() => String(rangeStart.value || '').trim().length > 0)

const activeHistoryView = computed(() => (hasRangeOverride.value ? 'plage' : historyMode.value))

function computeYearDaySummaries() {
  const year = historyYear.value
  const start = toISODate(year, 1, 1)
  const end = toISODate(year, 12, 31)
  const days = []

  for (const dateIso of iterateISODateRange(start, end)) {
    const log = historyLogsByDate.value[dateIso]
    if (!isHabitDayDone(log)) continue
    days.push({
      dateIso,
      total: getEffectiveValeur(log),
    })
  }

  return days
    .sort((a, b) => (a.dateIso < b.dateIso ? 1 : -1))
    .map((day, index) => ({
      index: index + 1,
      dateIso: day.dateIso,
      label: `Jour ${index + 1}`,
      dateLabel: formatDayLabelFr(day.dateIso),
      total: day.total,
    }))
}

function computeYearWeekSummaries() {
  const year = historyYear.value
  const start = toISODate(year, 1, 1)
  const end = toISODate(year, 12, 31)
  const byWeekStart = new Map()

  for (const dateIso of iterateISODateRange(start, end)) {
    const { startIso } = getWeekBoundsFromDateISO(dateIso)
    if (!byWeekStart.has(startIso)) byWeekStart.set(startIso, 0)
    const log = historyLogsByDate.value[dateIso]
    if (isHabitDayDone(log)) byWeekStart.set(startIso, byWeekStart.get(startIso) + getEffectiveValeur(log))
  }

  return [...byWeekStart.entries()]
    .map(([startIso, total]) => ({ startIso, total }))
    .filter((w) => w.total > 0)
    .sort((a, b) => (a.startIso < b.startIso ? 1 : -1))
    .map((w, index) => ({
      index: index + 1,
      startIso: w.startIso,
      label: `Semaine ${index + 1}`,
      dateLabel: weekLabelFr(w.startIso),
      total: w.total,
    }))
}

function computeYearMonthSummaries() {
  const year = historyYear.value
  const byMonth = new Map(Array.from({ length: 12 }, (_, i) => [i + 1, 0]))
  const start = toISODate(year, 1, 1)
  const end = toISODate(year, 12, 31)
  for (const dateIso of iterateISODateRange(start, end)) {
    const log = historyLogsByDate.value[dateIso]
    if (!isHabitDayDone(log)) continue
    const { month } = parseISODate(dateIso)
    byMonth.set(month, (byMonth.get(month) ?? 0) + getEffectiveValeur(log))
  }
  return Array.from({ length: 12 }, (_, i) => 12 - i)
    .map((month) => ({
      month,
      label: monthLabelFr(year, month),
      total: byMonth.get(month) ?? 0,
    }))
    .filter((m) => m.total > 0)
}

function computeYearTotal(year) {
  const startIso = `${year}-01-01`
  const endIso = `${year}-12-31`
  let total = 0
  for (const d of iterateISODateRange(startIso, endIso)) {
    const log = historyLogsByDate.value[d]
    if (isHabitDayDone(log)) total += getEffectiveValeur(log)
  }
  return total
}

const historyDaySummaries = computed(() => (historyLoading.value ? [] : computeYearDaySummaries()))
const historyWeekSummaries = computed(() => (historyLoading.value ? [] : computeYearWeekSummaries()))
const historyMonthSummaries = computed(() => (historyLoading.value ? [] : computeYearMonthSummaries()))
const historyYearTotal = computed(() => computeYearTotal(historyYear.value))

const totalDayPages = computed(() => Math.max(1, Math.ceil(historyDaySummaries.value.length / HISTORY_PAGE_SIZE)))
const totalWeekPages = computed(() => Math.max(1, Math.ceil(historyWeekSummaries.value.length / HISTORY_PAGE_SIZE)))
const totalMonthPages = computed(() => Math.max(1, Math.ceil(historyMonthSummaries.value.length / HISTORY_PAGE_SIZE)))
const totalRangePages = computed(() => Math.max(1, Math.ceil(rangeDetails.value.length / HISTORY_PAGE_SIZE)))

const showDayPagination = computed(() => historyDaySummaries.value.length > HISTORY_PAGE_SIZE)
const showWeekPagination = computed(() => historyWeekSummaries.value.length > HISTORY_PAGE_SIZE)
const showMonthPagination = computed(() => historyMonthSummaries.value.length > HISTORY_PAGE_SIZE)
const showRangePagination = computed(() => rangeDetails.value.length > HISTORY_PAGE_SIZE)

const paginatedDaySummaries = computed(() => {
  const start = dayPage.value * HISTORY_PAGE_SIZE
  return historyDaySummaries.value.slice(start, start + HISTORY_PAGE_SIZE)
})

const paginatedWeekSummaries = computed(() => {
  const start = weekPage.value * HISTORY_PAGE_SIZE
  return historyWeekSummaries.value.slice(start, start + HISTORY_PAGE_SIZE)
})

const paginatedMonthSummaries = computed(() => {
  const start = monthPage.value * HISTORY_PAGE_SIZE
  return historyMonthSummaries.value.slice(start, start + HISTORY_PAGE_SIZE)
})

const paginatedRangeDetails = computed(() => {
  const start = rangePage.value * HISTORY_PAGE_SIZE
  return rangeDetails.value.slice(start, start + HISTORY_PAGE_SIZE)
})

function roundHistoryAverage(total, count) {
  if (!count) return 0
  return Math.round((total / count) * 10) / 10
}

const historyViewStats = computed(() => {
  if (historyLoading.value) return null

  if (activeHistoryView.value === 'plage') {
    if (rangeLoading.value || rangeTotal.value == null) return null
    const details = rangeDetails.value
    if (!details.length && !rangeTotal.value) return null
    const unit = historyMode.value === 'annee'
      ? 'année'
      : historyMode.value === 'mois'
        ? 'mois'
        : historyMode.value === 'jour'
          ? 'jour'
          : 'semaine'
    if (!details.length) {
      return {
        totalLabel: `Total : ${formatStatNumber(rangeTotal.value, 0)}`,
        averageLabel: null,
      }
    }
    const average = roundHistoryAverage(rangeTotal.value, details.length)
    return {
      totalLabel: `Total : ${formatStatNumber(rangeTotal.value, 0)}`,
      averageLabel: `En moyenne : ${formatStatNumber(average)} par ${unit}`,
    }
  }

  if (historyMode.value === 'jour') {
    const days = historyDaySummaries.value
    if (!days.length) return null
    const total = days.reduce((sum, day) => sum + day.total, 0)
    const average = roundHistoryAverage(total, days.length)
    return {
      totalLabel: `Total : ${formatStatNumber(total, 0)}`,
      averageLabel: `En moyenne : ${formatStatNumber(average)} par jour`,
    }
  }

  if (historyMode.value === 'semaine') {
    const weeks = historyWeekSummaries.value
    if (!weeks.length) return null
    const total = weeks.reduce((sum, week) => sum + week.total, 0)
    const average = roundHistoryAverage(total, weeks.length)
    return {
      totalLabel: `Total : ${formatStatNumber(total, 0)}`,
      averageLabel: `En moyenne : ${formatStatNumber(average)} par semaine`,
    }
  }

  if (historyMode.value === 'mois') {
    const months = historyMonthSummaries.value
    if (!months.length) return null
    const total = months.reduce((sum, month) => sum + month.total, 0)
    const average = roundHistoryAverage(total, months.length)
    return {
      totalLabel: `Total : ${formatStatNumber(total, 0)}`,
      averageLabel: `En moyenne : ${formatStatNumber(average)} par mois`,
    }
  }

  const total = historyYearTotal.value
  const months = historyMonthSummaries.value
  if (!total) return null
  if (!months.length) {
    return {
      totalLabel: `Total : ${formatStatNumber(total, 0)}`,
      averageLabel: null,
    }
  }
  const average = roundHistoryAverage(total, months.length)
  return {
    totalLabel: `Total : ${formatStatNumber(total, 0)}`,
    averageLabel: `En moyenne : ${formatStatNumber(average)} par mois`,
  }
})

function openHistory() {
  historyOpen.value = true
  historyMode.value = 'semaine'
  rangePage.value = 0
  dayPage.value = 0
  weekPage.value = 0
  monthPage.value = 0
  yearPage.value = 0
  historyYear.value = new Date().getFullYear()
  rangeStart.value = ''
  rangeEnd.value = getLocalTodayISO()
  void loadHistoryLogs(historyYear.value)
}

function closeHistory() {
  historyOpen.value = false
}

watch(historyYear, (year) => {
  if (!historyOpen.value) return
  dayPage.value = 0
  weekPage.value = 0
  monthPage.value = 0
  yearPage.value = 0
  void loadHistoryLogs(year)
})

// Important perf: on calcule la période uniquement via "Appliquer",
// sinon chaque changement de date déclenche une requête réseau.

function applyFilter() {
  filterOpen.value = false
  rangePage.value = 0
  dayPage.value = 0
  weekPage.value = 0
  monthPage.value = 0
  yearPage.value = 0
  rangeTotal.value = null
  rangeDetails.value = []
  rangeError.value = ''

  if (hasRangeOverride.value) {
    if (!rangeEnd.value) rangeEnd.value = getLocalTodayISO()
    void computeRangeResults()
  }

  // semaine/mois/année => charger l'année demandée (pour calculs rapides côté client)
  // historyYear est directement piloté par le select "Année"
}

async function computeRangeResults() {
  if (!props.userId || !props.habit?.id) return
  if (!rangeStart.value) return
  if (!rangeEnd.value) rangeEnd.value = getLocalTodayISO()
  if (rangeStart.value > rangeEnd.value) {
    rangeError.value = 'La date de début doit être avant la date de fin.'
    return
  }

  const requestId = (rangeComputeRequestId += 1)
  rangeLoading.value = true
  rangeError.value = ''
  rangeTotal.value = null
  rangeDetails.value = []

  try {
    const rows = await listHabitLogsForRange(
      supabase,
      props.userId,
      props.habit.id,
      rangeStart.value,
      rangeEnd.value,
    )
    if (requestId !== rangeComputeRequestId || !historyOpen.value) return
    const byDate = {}
    for (const row of rows) {
      byDate[normalizeDateISO(row.date_jour)] = { ...row, date_jour: normalizeDateISO(row.date_jour) }
    }

    // Total sur la plage
    let total = 0
    for (const dateIso of iterateISODateRange(rangeStart.value, rangeEnd.value)) {
      const log = byDate[dateIso]
      if (isHabitDayDone(log)) total += getEffectiveValeur(log)
    }
    rangeTotal.value = total

    // Détail jour/semaine/mois/année (uniquement périodes actives)
    const groups = new Map()
    for (const dateIso of iterateISODateRange(rangeStart.value, rangeEnd.value)) {
      const log = byDate[dateIso]
      if (!isHabitDayDone(log)) continue
      const value = getEffectiveValeur(log)

      if (historyMode.value === 'annee') {
        const { year } = parseISODate(dateIso)
        const key = String(year)
        if (!groups.has(key)) groups.set(key, { key, label: key, total: 0 })
        groups.get(key).total += value
      } else if (historyMode.value === 'mois') {
        const { year, month } = parseISODate(dateIso)
        const key = `${year}-${String(month).padStart(2, '0')}`
        if (!groups.has(key)) groups.set(key, { key, label: monthLabelFr(year, month), total: 0 })
        groups.get(key).total += value
      } else if (historyMode.value === 'jour') {
        const key = dateIso
        if (!groups.has(key)) groups.set(key, { key, label: formatDayLabelFr(dateIso), total: 0 })
        groups.get(key).total += value
      } else {
        const { startIso } = getWeekBoundsFromDateISO(dateIso)
        const key = startIso
        if (!groups.has(key)) groups.set(key, { key, label: weekLabelFr(startIso), total: 0 })
        groups.get(key).total += value
      }
    }

    rangeDetails.value = [...groups.values()].sort((a, b) => (a.key < b.key ? 1 : -1))
  } catch (err) {
    if (requestId !== rangeComputeRequestId || !historyOpen.value) return
    console.error(err)
    rangeError.value = err.message || 'Impossible de calculer la période.'
  } finally {
    if (requestId === rangeComputeRequestId) rangeLoading.value = false
  }
}

watch(
  () => [props.habit?.id, props.refreshKey],
  () => {
    loadStatsLogs()
  },
  { immediate: true },
)

watch(selectedDate, (date) => {
  if (date > todayIso.value) {
    selectedDate.value = todayIso.value
    saveError.value = 'Les dates futures ne sont pas autorisées.'
    return
  }
  saveError.value = ''
  syncInputFromLog()
})
</script>

<template>
  <div class="habit-entry" :style="{ '--habit-color': habit.couleur }">
    <label class="habit-entry__field habit-entry__field--date">
      <span>Date</span>
      <input v-model="selectedDate" type="date" class="habit-entry__date" :max="todayIso" />
    </label>

    <div v-if="isBoolean" class="habit-entry__boolean">
      <label class="habit-entry__toggle">
        <input
          type="checkbox"
          class="habit-entry__toggle-input"
          :checked="inputValue > 0"
          :disabled="!canEditEntry"
          @change="onBooleanToggle"
        />
        <span class="habit-entry__toggle-ui" aria-hidden="true" />
        <span class="habit-entry__toggle-label">Fait</span>
      </label>
    </div>

    <label v-else class="habit-entry__field">
      <span>{{ valueLabel }}</span>
      <div class="habit-entry__stepper">
        <button
          type="button"
          class="habit-entry__step-btn"
          :disabled="!canEditEntry || inputValue <= 0"
          aria-label="Diminuer"
          @click="decrement"
        >
          −
        </button>
        <input
          v-model.number="inputValue"
          type="number"
          min="0"
          step="1"
          class="habit-entry__value-input"
          :disabled="!canEditEntry"
          @blur="onInputBlur"
          @keydown.enter.prevent="onInputBlur"
        />
        <button
          type="button"
          class="habit-entry__step-btn"
          :disabled="!canEditEntry"
          aria-label="Augmenter"
          @click="increment"
        >
          +
        </button>
      </div>
    </label>

    <p v-if="saveMessage" class="habit-entry__feedback habit-entry__feedback--ok">
      {{ saveMessage }}
    </p>
    <p v-if="saveError" class="habit-entry__feedback habit-entry__feedback--error">
      {{ saveError }}
    </p>
    <p v-if="loadError" class="habit-entry__feedback habit-entry__feedback--error">
      {{ loadError }}
    </p>

    <section v-if="!isLoading" class="habit-entry__stats" aria-label="Statistiques">
      <h3 class="habit-entry__stats-title">Statistiques</h3>
      <dl class="habit-entry__stats-list">
        <div class="habit-entry__stat">
          <dt>Total 7 jours</dt>
          <dd>{{ formatStatNumber(stats.weekTotal, 0) }}</dd>
        </div>
        <div class="habit-entry__stat">
          <dt>Moyenne 7 jours</dt>
          <dd>{{ formatStatNumber(stats.weekAverage) }}</dd>
        </div>
        <div class="habit-entry__stat">
          <dt>Moyenne 30 jours</dt>
          <dd>{{ formatStatNumber(stats.monthAverage) }}</dd>
        </div>
        <div class="habit-entry__stat">
          <dt>Série en cours</dt>
          <dd>{{ stats.streak }} jour{{ stats.streak > 1 ? 's' : '' }}</dd>
        </div>
        <div v-if="!isBoolean" class="habit-entry__stat">
          <dt>Taux 30 jours</dt>
          <dd>{{ formatStatNumber(stats.rate30Days, 2) }}</dd>
        </div>
      </dl>

      <button type="button" class="habit-entry__history-btn" @click="openHistory">
        Historique
      </button>
    </section>

    <div v-else class="habit-entry__loading">Chargement…</div>

    <Teleport to="body">
      <div v-if="historyOpen" class="habit-history-modal" role="dialog" aria-modal="true">
        <div class="habit-history-modal__overlay" @click="closeHistory" />
        <div class="habit-history-modal__panel" :style="{ '--habit-color': habit.couleur }">
          <header class="habit-history-modal__header">
            <div>
              <h3 class="habit-history-modal__title">Historique</h3>
              <p class="habit-history-modal__subtitle">{{ habit.nom }}</p>
            </div>
            <button type="button" class="habit-history-modal__close" aria-label="Fermer" @click="closeHistory">✕</button>
          </header>

          <div class="habit-history-modal__controls">
            <button type="button" class="habit-history-modal__filter-btn" @click="filterOpen = true">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M3 4h18v2l-7 8v5l-4 1v-6L3 6V4z"
                />
              </svg>
              Filtre
            </button>

            <p class="habit-history-modal__hint">
              {{
                hasRangeOverride
                  ? 'Période (dates)'
                  : historyMode === 'annee'
                    ? `Année ${historyYear}`
                    : historyMode === 'mois'
                      ? `Mois (année ${historyYear})`
                      : historyMode === 'jour'
                        ? `Jours (année ${historyYear})`
                        : `Semaines (année ${historyYear})`
              }}
            </p>

            <div v-if="filterOpen" class="habit-history-modal__filter-overlay" @click="filterOpen = false" />
            <div v-if="filterOpen" class="habit-history-modal__filter-panel">
              <h4 class="habit-history-modal__filter-title">Afficher</h4>

              <div class="habit-history-modal__filter-grid">
                <label class="habit-history-modal__filter-radio">
                  <input v-model="historyMode" type="radio" value="jour" />
                  <span>Jour</span>
                </label>
                <label class="habit-history-modal__filter-radio">
                  <input v-model="historyMode" type="radio" value="semaine" />
                  <span>Semaine</span>
                </label>
                <label class="habit-history-modal__filter-radio">
                  <input v-model="historyMode" type="radio" value="mois" />
                  <span>Mois</span>
                </label>
                <label class="habit-history-modal__filter-radio">
                  <input v-model="historyMode" type="radio" value="annee" />
                  <span>Année</span>
                </label>
              </div>

              <div class="habit-history-modal__filter-range">
                <label class="habit-history-modal__control">
                  <span>Début (optionnel)</span>
                  <input v-model="rangeStart" type="date" class="habit-history-modal__select" />
                </label>
                <label class="habit-history-modal__control">
                  <span>Fin</span>
                  <input v-model="rangeEnd" type="date" class="habit-history-modal__select" />
                </label>
                <label class="habit-history-modal__control">
                  <span>Année</span>
                  <select v-model.number="historyYear" class="habit-history-modal__select">
                    <option v-for="y in yearOptions" :key="y" :value="y">{{ y }}</option>
                  </select>
                </label>
              </div>

              <div class="habit-history-modal__filter-actions">
                <button type="button" class="habit-history-modal__apply-btn" @click="applyFilter">
                  Appliquer
                </button>
              </div>
            </div>
          </div>

          <p v-if="historyViewStats" class="habit-history-modal__stats">
            <span>{{ historyViewStats.totalLabel }}</span>
            <span v-if="historyViewStats.averageLabel">{{ historyViewStats.averageLabel }}</span>
          </p>

          <p v-if="historyError" class="habit-entry__feedback habit-entry__feedback--error">
            {{ historyError }}
          </p>

          <div v-if="historyLoading" class="habit-history-modal__loading">Chargement…</div>

          <div v-else class="habit-history-modal__content">
            <template v-if="activeHistoryView === 'jour'">
              <ul v-if="paginatedDaySummaries.length > 0" class="habit-history-modal__list">
                <li v-for="d in paginatedDaySummaries" :key="d.dateIso" class="habit-history-modal__item">
                  <div class="habit-history-modal__item-head">
                    <span class="habit-history-modal__item-title">{{ d.label }}</span>
                    <span class="habit-history-modal__item-value">{{ formatStatNumber(d.total, 0) }}</span>
                  </div>
                  <span class="habit-history-modal__item-date">{{ d.dateLabel }}</span>
                </li>
              </ul>
              <p v-else class="habit-history-modal__empty">Aucun jour avec données sur cette année.</p>

              <nav v-if="showDayPagination" class="habit-history-modal__pagination" aria-label="Pagination jours">
                <button
                  type="button"
                  class="habit-history-modal__page-btn"
                  :disabled="dayPage === 0"
                  aria-label="Page précédente"
                  @click="dayPage = Math.max(0, dayPage - 1)"
                >
                  ‹
                </button>
                <span class="habit-history-modal__page-label">{{ dayPage + 1 }} / {{ totalDayPages }}</span>
                <button
                  type="button"
                  class="habit-history-modal__page-btn"
                  :disabled="dayPage >= totalDayPages - 1"
                  aria-label="Page suivante"
                  @click="dayPage = Math.min(totalDayPages - 1, dayPage + 1)"
                >
                  ›
                </button>
              </nav>
            </template>

            <template v-else-if="activeHistoryView === 'semaine'">
              <ul v-if="paginatedWeekSummaries.length > 0" class="habit-history-modal__list">
                <li v-for="w in paginatedWeekSummaries" :key="w.startIso" class="habit-history-modal__item">
                  <div class="habit-history-modal__item-head">
                    <span class="habit-history-modal__item-title">{{ w.label }}</span>
                    <span class="habit-history-modal__item-value">{{ formatStatNumber(w.total, 0) }}</span>
                  </div>
                  <span class="habit-history-modal__item-date">{{ w.dateLabel }}</span>
                </li>
              </ul>
              <p v-else class="habit-history-modal__empty">Aucune semaine avec données sur cette année.</p>

              <nav v-if="showWeekPagination" class="habit-history-modal__pagination" aria-label="Pagination semaines">
                <button
                  type="button"
                  class="habit-history-modal__page-btn"
                  :disabled="weekPage === 0"
                  aria-label="Page précédente"
                  @click="weekPage = Math.max(0, weekPage - 1)"
                >
                  ‹
                </button>
                <span class="habit-history-modal__page-label">{{ weekPage + 1 }} / {{ totalWeekPages }}</span>
                <button
                  type="button"
                  class="habit-history-modal__page-btn"
                  :disabled="weekPage >= totalWeekPages - 1"
                  aria-label="Page suivante"
                  @click="weekPage = Math.min(totalWeekPages - 1, weekPage + 1)"
                >
                  ›
                </button>
              </nav>
            </template>

            <template v-else-if="activeHistoryView === 'mois'">
              <ul v-if="paginatedMonthSummaries.length > 0" class="habit-history-modal__list">
                <li v-for="m in paginatedMonthSummaries" :key="m.month" class="habit-history-modal__item">
                  <div class="habit-history-modal__item-head">
                    <span class="habit-history-modal__item-title">{{ m.label }}</span>
                    <span class="habit-history-modal__item-value">{{ formatStatNumber(m.total, 0) }}</span>
                  </div>
                </li>
              </ul>
              <p v-else class="habit-history-modal__empty">Aucun mois avec données sur cette année.</p>

              <nav v-if="showMonthPagination" class="habit-history-modal__pagination" aria-label="Pagination mois">
                <button
                  type="button"
                  class="habit-history-modal__page-btn"
                  :disabled="monthPage === 0"
                  aria-label="Page précédente"
                  @click="monthPage = Math.max(0, monthPage - 1)"
                >
                  ‹
                </button>
                <span class="habit-history-modal__page-label">{{ monthPage + 1 }} / {{ totalMonthPages }}</span>
                <button
                  type="button"
                  class="habit-history-modal__page-btn"
                  :disabled="monthPage >= totalMonthPages - 1"
                  aria-label="Page suivante"
                  @click="monthPage = Math.min(totalMonthPages - 1, monthPage + 1)"
                >
                  ›
                </button>
              </nav>
            </template>

            <template v-else-if="activeHistoryView === 'annee'">
              <div class="habit-history-modal__single">
                <div class="habit-history-modal__single-head">
                  <span class="habit-history-modal__single-title">Année {{ historyYear }}</span>
                  <span class="habit-history-modal__single-value">{{ formatStatNumber(historyYearTotal, 0) }}</span>
                </div>
              </div>
            </template>

            <template v-else>
              <div class="habit-history-modal__range">
                <p v-if="rangeError" class="habit-entry__feedback habit-entry__feedback--error">{{ rangeError }}</p>
                <div v-if="rangeLoading" class="habit-history-modal__loading">Calcul…</div>

                <template v-else-if="rangeTotal != null">
                  <ul v-if="paginatedRangeDetails.length > 0" class="habit-history-modal__list">
                    <li v-for="row in paginatedRangeDetails" :key="row.key" class="habit-history-modal__item">
                      <div class="habit-history-modal__item-head">
                        <span class="habit-history-modal__item-title">{{ row.label }}</span>
                        <span class="habit-history-modal__item-value">{{ formatStatNumber(row.total, 0) }}</span>
                      </div>
                    </li>
                  </ul>
                  <p v-else class="habit-history-modal__empty">Aucune activité sur cette période.</p>

                  <nav
                    v-if="showRangePagination"
                    class="habit-history-modal__pagination"
                    aria-label="Pagination période"
                  >
                    <button
                      type="button"
                      class="habit-history-modal__page-btn"
                      :disabled="rangePage === 0"
                      aria-label="Page précédente"
                      @click="rangePage = Math.max(0, rangePage - 1)"
                    >
                      ‹
                    </button>
                    <span class="habit-history-modal__page-label">{{ rangePage + 1 }} / {{ totalRangePages }}</span>
                    <button
                      type="button"
                      class="habit-history-modal__page-btn"
                      :disabled="rangePage >= totalRangePages - 1"
                      aria-label="Page suivante"
                      @click="rangePage = Math.min(totalRangePages - 1, rangePage + 1)"
                    >
                      ›
                    </button>
                  </nav>
                </template>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.habit-entry {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}

.habit-entry__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.habit-entry__field span {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--habit-color, #ad81be);
}

.habit-entry__date,
.habit-entry__value-input {
  padding: 0.55rem 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  font-size: 0.95rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.9);
  color: #2c3e50;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.habit-entry__date-label {
  margin: -0.35rem 0 0;
  font-size: 0.88rem;
  color: #6c757d;
  line-height: 1.4;
}

.habit-entry__stepper {
  display: flex;
  align-items: stretch;
  gap: 0.45rem;
}

.habit-entry__step-btn {
  flex-shrink: 0;
  width: 2.5rem;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  font-size: 1.2rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    opacity 0.15s ease;
}

.habit-entry__step-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.habit-entry__step-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.habit-entry__value-input {
  flex: 1;
  min-width: 0;
  text-align: center;
}

.habit-entry__boolean {
  padding: 0.25rem 0;
}

.habit-entry__toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  cursor: pointer;
}

.habit-entry__toggle-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.habit-entry__toggle-ui {
  width: 2.75rem;
  height: 1.5rem;
  border-radius: 999px;
  background: rgba(213, 181, 234, 0.35);
  position: relative;
  transition: background 0.2s ease;
}

.habit-entry__toggle-ui::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 50%;
  background: white;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
  transition: transform 0.2s ease;
}

.habit-entry__toggle-input:checked + .habit-entry__toggle-ui {
  background: var(--habit-color, #ad81be);
}

.habit-entry__toggle-input:checked + .habit-entry__toggle-ui::after {
  transform: translateX(1.25rem);
}

.habit-entry__toggle-label {
  font-size: 0.95rem;
  font-weight: 700;
  color: #2c3e50;
}

.habit-entry__feedback {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
}

.habit-entry__feedback--ok {
  color: #27ae60;
}

.habit-entry__feedback--error {
  color: #c0392b;
}

.habit-entry__stats {
  padding-top: 0.5rem;
  border-top: 1px solid rgba(213, 181, 234, 0.25);
}

.habit-entry__stats-title {
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--habit-color, #ad81be);
}

.habit-entry__stats-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.habit-entry__history-btn {
  margin-top: 0.85rem;
  width: 100%;
  padding: 0.6rem 0.85rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.65);
  color: var(--habit-color, #ad81be);
  font-weight: 800;
  cursor: pointer;
}

.habit-entry__history-btn:hover {
  background: rgba(255, 255, 255, 0.9);
}

.habit-entry__stat {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.75rem;
}

.habit-entry__stat dt {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: #6c757d;
}

.habit-entry__stat dd {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 800;
  color: #2c3e50;
}

.habit-entry__stats-hint {
  margin: 0.75rem 0 0;
  font-size: 0.78rem;
  color: #8c98a4;
  line-height: 1.4;
}

.habit-entry__loading {
  margin: 0;
  text-align: center;
  color: #6c757d;
  font-size: 0.9rem;
}

.habit-history-modal {
  position: fixed;
  inset: 0;
  z-index: 1400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
}

.habit-history-modal__overlay {
  position: absolute;
  inset: 0;
  background: rgba(20, 30, 40, 0.5);
}

.habit-history-modal__panel {
  position: relative;
  width: min(100%, 48rem);
  max-height: min(88vh, 42rem);
  overflow: auto;
  background: white;
  border-radius: 16px;
  padding: 1.2rem 1.35rem 1.25rem;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
}

.habit-history-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.habit-history-modal__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 900;
  color: var(--habit-color, #ad81be);
}

.habit-history-modal__subtitle {
  margin: 0.25rem 0 0;
  font-size: 0.9rem;
  color: #6c757d;
  font-weight: 600;
}

.habit-history-modal__close {
  border: none;
  background: none;
  font-size: 1.15rem;
  cursor: pointer;
  color: #8c98a4;
  padding: 0.15rem;
}

.habit-history-modal__controls {
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

.habit-history-modal__filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.75rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.7);
  color: var(--habit-color, #ad81be);
  font-weight: 900;
  cursor: pointer;
}

.habit-history-modal__filter-btn svg {
  width: 1rem;
  height: 1rem;
}

.habit-history-modal__filter-btn:hover {
  background: rgba(255, 255, 255, 0.95);
}

.habit-history-modal__hint {
  margin: 0 0 0.25rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: #6c757d;
}

.habit-history-modal__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1rem;
  margin: 0.35rem 0 0.85rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: #6c757d;
}

.habit-history-modal__stats span:first-child {
  color: #2c3e50;
  font-weight: 800;
}

.habit-history-modal__filter-overlay {
  position: fixed;
  inset: 0;
  z-index: 1450;
}

.habit-history-modal__filter-panel {
  position: fixed;
  z-index: 1451;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(92vw, 30rem);
  max-height: min(80vh, 36rem);
  overflow: auto;
  border-radius: 14px;
  border: 1px solid rgba(213, 181, 234, 0.25);
  background: white;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18);
  padding: 0.9rem 1rem 1rem;
}

.habit-history-modal__filter-title {
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
  font-weight: 900;
  color: #2c3e50;
}

.habit-history-modal__filter-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}

.habit-history-modal__filter-radio {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.55rem 0.65rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.25);
  background: rgba(213, 181, 234, 0.08);
  cursor: pointer;
  font-weight: 800;
  color: #2c3e50;
}

.habit-history-modal__filter-radio input {
  accent-color: var(--habit-color, #ad81be);
}

.habit-history-modal__filter-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: 0.85rem;
}

.habit-history-modal__filter-range {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: 0.95rem;
  padding-top: 0.85rem;
  border-top: 1px solid rgba(213, 181, 234, 0.2);
}

.habit-history-modal__filter-grid .habit-history-modal__filter-radio {
  justify-content: center;
}


.habit-history-modal__filter-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.85rem;
}

.habit-history-modal__apply-btn {
  padding: 0.6rem 0.9rem;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  font-weight: 900;
  cursor: pointer;
}

.habit-history-modal__apply-btn:hover {
  transform: translateY(-1px);
}

.habit-history-modal__single {
  padding: 0.85rem 0.95rem;
  border-radius: 14px;
  border: 1px solid rgba(213, 181, 234, 0.22);
  background: rgba(213, 181, 234, 0.08);
}

.habit-history-modal__single-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}

.habit-history-modal__single-title {
  font-weight: 900;
  color: #2c3e50;
}

.habit-history-modal__single-value {
  font-weight: 900;
  color: var(--habit-color, #ad81be);
}

.habit-history-modal__pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.85rem;
  margin-top: 1rem;
  padding-top: 0.85rem;
  border-top: 1px solid rgba(213, 181, 234, 0.22);
}

.habit-history-modal__page-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 10px;
  background: white;
  color: var(--habit-color, #ad81be);
  font-size: 1.25rem;
  font-weight: 900;
  line-height: 1;
  cursor: pointer;
}

.habit-history-modal__page-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.habit-history-modal__page-label {
  min-width: 4.5rem;
  text-align: center;
  font-size: 0.9rem;
  font-weight: 900;
  color: #2c3e50;
}

.habit-history-modal__control {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.habit-history-modal__control--inline {
  flex: 1;
}

.habit-history-modal__control span {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--habit-color, #ad81be);
}

.habit-history-modal__select {
  padding: 0.55rem 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  font-size: 0.95rem;
  font-weight: 650;
  background: rgba(255, 255, 255, 0.95);
  color: #2c3e50;
}

.habit-history-modal__select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.habit-history-modal__loading {
  text-align: center;
  font-weight: 700;
  color: #6c757d;
  padding: 1.25rem 0;
}

.habit-history-modal__content {
  min-height: 6rem;
}

.habit-history-modal__range-row {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

.habit-history-modal__range-btn {
  padding: 0.6rem 0.9rem;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  font-weight: 900;
  cursor: pointer;
  transition: transform 0.15s ease, filter 0.15s ease;
}

.habit-history-modal__range-btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.03);
}

.habit-history-modal__range-total {
  margin: 0.5rem 0 0.85rem;
  font-size: 0.95rem;
  font-weight: 800;
  color: #2c3e50;
}

.habit-history-modal__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.habit-history-modal__item {
  padding: 0.75rem 0.85rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.22);
  background: rgba(213, 181, 234, 0.08);
}

.habit-history-modal__item-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}

.habit-history-modal__item-title {
  font-weight: 900;
  color: #2c3e50;
}

.habit-history-modal__item-value {
  font-weight: 900;
  color: var(--habit-color, #ad81be);
}

.habit-history-modal__item-date {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.85rem;
  color: #6c757d;
}

.habit-history-modal__empty {
  margin: 0.9rem 0 0;
  text-align: center;
  color: #8c98a4;
  font-weight: 650;
}

@media (max-width: 760px) {
  .habit-history-modal__filter-grid {
    grid-template-columns: 1fr;
  }

  .habit-history-modal__filter-range {
    grid-template-columns: 1fr;
  }

  .habit-history-modal__controls {
    align-items: stretch;
  }
}

@media (prefers-color-scheme: dark) {
  .habit-entry__date,
  .habit-entry__value-input {
    background: rgba(30, 25, 40, 0.9);
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.2);
  }

  .habit-entry__date-label,
  .habit-entry__stat dt {
    color: #adb5bd;
  }

  .habit-entry__toggle-label,
  .habit-entry__stat dd {
    color: #f0e8f8;
  }

  .habit-entry__stats {
    border-top-color: rgba(213, 181, 234, 0.15);
  }

  .habit-entry__stats-hint {
    color: #adb5bd;
  }

  .habit-entry__history-btn {
    background: rgba(30, 25, 40, 0.7);
    border-color: rgba(213, 181, 234, 0.18);
  }

  .habit-history-modal__panel {
    background: #1e2832;
  }

  .habit-history-modal__subtitle,
  .habit-history-modal__loading,
  .habit-history-modal__item-date {
    color: #adb5bd;
  }

  .habit-history-modal__select {
    background: rgba(30, 25, 40, 0.9);
    border-color: rgba(213, 181, 234, 0.2);
    color: #f0e8f8;
  }

  .habit-history-modal__filter-btn {
    background: rgba(30, 25, 40, 0.7);
    border-color: rgba(213, 181, 234, 0.18);
  }

  .habit-history-modal__hint {
    color: #adb5bd;
  }

  .habit-history-modal__stats {
    color: #a8b4c0;
  }

  .habit-history-modal__stats span:first-child {
    color: #e8edf2;
  }

  .habit-history-modal__filter-panel {
    background: #1e2832;
    border-color: rgba(213, 181, 234, 0.15);
  }

  .habit-history-modal__filter-title {
    color: #f0e8f8;
  }

  .habit-history-modal__filter-radio {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(213, 181, 234, 0.15);
    color: #f0e8f8;
  }

  .habit-history-modal__single {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(213, 181, 234, 0.15);
  }

  .habit-history-modal__single-title {
    color: #f0e8f8;
  }

  .habit-history-modal__pagination {
    border-top-color: rgba(213, 181, 234, 0.15);
  }

  .habit-history-modal__page-btn {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(213, 181, 234, 0.15);
  }

  .habit-history-modal__page-label {
    color: #f0e8f8;
  }

  .habit-history-modal__item {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(213, 181, 234, 0.15);
  }

  .habit-history-modal__item-title {
    color: #f0e8f8;
  }

  .habit-history-modal__range-total {
    color: #f0e8f8;
  }
}
</style>
