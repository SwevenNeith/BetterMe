<script setup>
import { computed, ref, watch } from 'vue'
import { hasQuantiteTracking, PROJECT_RESET_PERIODE } from '../constants/projectProgress.js'
import { getCurrentPeriodCount } from '../services/projectProgress.js'
import { buildHistoryEntries } from '../utils/projectProgressPeriods.js'

const HISTORY_PAGE_SIZE = 10
const FILTER_YEAR_SPAN = 6

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
  logs: {
    type: Array,
    default: () => [],
  },
  compact: {
    type: Boolean,
    default: false,
  },
  projectColor: {
    type: String,
    default: '#ad81be',
  },
})

const emit = defineEmits(['increment', 'decrement', 'toggle'])

const historyOpen = ref(false)
const historyPage = ref(0)
const filterOpen = ref(false)
const historyMode = ref('semaine') // 'jour' | 'semaine' | 'mois' | 'annee'
const historyYear = ref(new Date().getFullYear())
const rangeStart = ref('') // ISO yyyy-mm-dd (optionnel)
const rangeEnd = ref(new Date().toISOString().slice(0, 10)) // défaut: aujourd'hui
const dayPage = ref(0)
const weekPage = ref(0)
const monthPage = ref(0)
const yearPage = ref(0)
const rangePage = ref(0)

const usesQuantiteTracking = computed(() => hasQuantiteTracking(props.item))

const useJourFilter = computed(() => props.item.reset_periode === PROJECT_RESET_PERIODE.JOUR)

const currentCount = computed(() => getCurrentPeriodCount(props.logs, props.item.reset_periode))

const quantiteLabel = computed(() => `${currentCount.value}/${props.item.quantite_cible}`)

const historyEntries = computed(() => buildHistoryEntries(props.logs, props.item.reset_periode))

function roundAverage(total, count) {
  if (!count) return 0
  return Math.round((total / count) * 10) / 10
}

const historyViewStats = computed(() => {
  if (activeHistoryView.value === 'plage') {
    const details = rangeDetails.value
    const total = rangeTotal.value
    if (details.length === 0) return null
    const unit = historyMode.value === 'annee'
      ? 'année'
      : historyMode.value === 'mois'
        ? 'mois'
        : historyMode.value === 'jour'
          ? 'jour'
          : 'semaine'
    const average = roundAverage(total, details.length)
    return {
      total,
      average,
      totalLabel: `Total : ${total}`,
      averageLabel: `En moyenne : ${average} par ${unit}`,
    }
  }

  if (historyMode.value === 'jour') {
    const days = activeDaySummaries.value
    if (days.length === 0) return null
    const total = days.reduce((sum, day) => sum + day.count, 0)
    const average = roundAverage(total, days.length)
    return {
      total,
      average,
      totalLabel: `Total : ${total}`,
      averageLabel: `En moyenne : ${average} par jour`,
    }
  }

  if (historyMode.value === 'semaine') {
    const weeks = activeWeekSummaries.value
    if (weeks.length === 0) return null
    const total = weeks.reduce((sum, week) => sum + week.count, 0)
    const average = roundAverage(total, weeks.length)
    return {
      total,
      average,
      totalLabel: `Total : ${total}`,
      averageLabel: `En moyenne : ${average} par semaine`,
    }
  }

  if (historyMode.value === 'mois') {
    const months = activeMonthSummaries.value
    if (months.length === 0) return null
    const total = months.reduce((sum, month) => sum + month.count, 0)
    const average = roundAverage(total, months.length)
    return {
      total,
      average,
      totalLabel: `Total : ${total}`,
      averageLabel: `En moyenne : ${average} par mois`,
    }
  }

  const years = activeYearSummaries.value
  if (years.length === 0) return null
  const total = years.reduce((sum, year) => sum + year.count, 0)
  const average = roundAverage(total, years.length)
  return {
    total,
    average,
    totalLabel: `Total : ${total}`,
    averageLabel: `En moyenne : ${average} par année`,
  }
})

const totalHistoryPages = computed(() =>
  Math.max(1, Math.ceil(historyEntries.value.length / HISTORY_PAGE_SIZE)),
)

const showHistoryPagination = computed(() => historyEntries.value.length > HISTORY_PAGE_SIZE)

const paginatedHistoryEntries = computed(() => {
  const start = historyPage.value * HISTORY_PAGE_SIZE
  return historyEntries.value.slice(start, start + HISTORY_PAGE_SIZE)
})

function toISODateLocal(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

function parseISOToDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

function getWeekBoundsFromISO(iso) {
  const d = parseISOToDate(iso)
  const jsDay = d.getDay()
  const diff = jsDay === 0 ? -6 : 1 - jsDay
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  const start = startOfDay(monday)
  const sunday = new Date(start)
  sunday.setDate(start.getDate() + 6)
  return { start, end: endOfDay(sunday) }
}

function formatDayLabel(date) {
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function weekLabel(bounds) {
  return `${formatDayLabel(bounds.start)} – ${formatDayLabel(bounds.end)}`
}

function monthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

function isInRange(date, startIso, endIso) {
  const t = new Date(date).getTime()
  const start = startOfDay(parseISOToDate(startIso)).getTime()
  const end = endOfDay(parseISOToDate(endIso)).getTime()
  return t >= start && t <= end
}

const hasRangeOverride = computed(() => String(rangeStart.value || '').trim().length > 0)
const activeHistoryView = computed(() => (hasRangeOverride.value ? 'plage' : historyMode.value))

const yearOptions = computed(() => {
  const anchor = new Date().getFullYear()
  const years = []
  for (let y = anchor - FILTER_YEAR_SPAN; y <= anchor + 1; y += 1) years.push(y)
  return years
})

const filteredLogs = computed(() => {
  const logs = props.logs ?? []
  if (!hasRangeOverride.value) return logs
  const end = rangeEnd.value || new Date().toISOString().slice(0, 10)
  return logs.filter((log) => isInRange(log.logged_at, rangeStart.value, end))
})

const rangeTotal = computed(() => filteredLogs.value.length)

const activeDaySummaries = computed(() => {
  const year = Number(historyYear.value)
  if (!Number.isFinite(year)) return []
  const byDay = new Map()
  for (const log of props.logs ?? []) {
    const d = new Date(log.logged_at)
    if (d.getFullYear() !== year) continue
    const key = toISODateLocal(d)
    byDay.set(key, (byDay.get(key) ?? 0) + 1)
  }
  return [...byDay.entries()]
    .map(([dayIso, count]) => ({ dayIso, count }))
    .filter((d) => d.count > 0)
    .sort((a, b) => (a.dayIso < b.dayIso ? 1 : -1))
    .map((d, idx) => ({
      index: idx + 1,
      label: `Jour ${idx + 1}`,
      dateLabel: formatDayLabel(parseISOToDate(d.dayIso)),
      count: d.count,
    }))
})

const activeWeekSummaries = computed(() => {
  const year = Number(historyYear.value)
  if (!Number.isFinite(year)) return []
  const byWeek = new Map()
  for (const log of props.logs ?? []) {
    const d = new Date(log.logged_at)
    if (d.getFullYear() !== year) continue
    const key = toISODateLocal(getWeekBoundsFromISO(toISODateLocal(d)).start)
    byWeek.set(key, (byWeek.get(key) ?? 0) + 1)
  }
  return [...byWeek.entries()]
    .map(([weekStartIso, count]) => ({ weekStartIso, count }))
    .filter((w) => w.count > 0)
    .sort((a, b) => (a.weekStartIso < b.weekStartIso ? 1 : -1))
    .map((w, idx) => {
      const bounds = getWeekBoundsFromISO(w.weekStartIso)
      return {
        index: idx + 1,
        label: `Semaine ${idx + 1}`,
        dateLabel: weekLabel(bounds),
        count: w.count,
      }
    })
})

const activeMonthSummaries = computed(() => {
  const year = Number(historyYear.value)
  if (!Number.isFinite(year)) return []
  const byMonth = new Map(Array.from({ length: 12 }, (_, i) => [i + 1, 0]))
  for (const log of props.logs ?? []) {
    const d = new Date(log.logged_at)
    if (d.getFullYear() !== year) continue
    byMonth.set(d.getMonth() + 1, (byMonth.get(d.getMonth() + 1) ?? 0) + 1)
  }
  return Array.from({ length: 12 }, (_, i) => 12 - i)
    .map((month) => ({
      month,
      label: monthLabel(year, month),
      count: byMonth.get(month) ?? 0,
    }))
    .filter((m) => m.count > 0)
})

const activeYearSummaries = computed(() => {
  const byYear = new Map()
  for (const log of props.logs ?? []) {
    const y = new Date(log.logged_at).getFullYear()
    byYear.set(y, (byYear.get(y) ?? 0) + 1)
  }
  return [...byYear.entries()]
    .map(([year, count]) => ({ year, count }))
    .filter((y) => y.count > 0)
    .sort((a, b) => b.year - a.year)
})

const rangeDetails = computed(() => {
  if (!hasRangeOverride.value) return []
  const logs = filteredLogs.value
  if (historyMode.value === 'annee') {
    const byYear = new Map()
    for (const log of logs) {
      const y = new Date(log.logged_at).getFullYear()
      byYear.set(y, (byYear.get(y) ?? 0) + 1)
    }
    return [...byYear.entries()]
      .map(([year, count]) => ({ key: String(year), label: String(year), count }))
      .sort((a, b) => (a.key < b.key ? 1 : -1))
  }

  if (historyMode.value === 'mois') {
    const byKey = new Map()
    for (const log of logs) {
      const d = new Date(log.logged_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      byKey.set(key, (byKey.get(key) ?? 0) + 1)
    }
    return [...byKey.entries()]
      .map(([key, count]) => ({
        key,
        label: monthLabel(Number(key.slice(0, 4)), Number(key.slice(5, 7))),
        count,
      }))
      .sort((a, b) => (a.key < b.key ? 1 : -1))
  }

  if (historyMode.value === 'jour') {
    const byKey = new Map()
    for (const log of logs) {
      const d = new Date(log.logged_at)
      const key = toISODateLocal(d)
      byKey.set(key, (byKey.get(key) ?? 0) + 1)
    }
    return [...byKey.entries()]
      .map(([key, count]) => ({ key, label: formatDayLabel(parseISOToDate(key)), count }))
      .sort((a, b) => (a.key < b.key ? 1 : -1))
  }

  const byKey = new Map()
  for (const log of logs) {
    const d = new Date(log.logged_at)
    const weekStartIso = toISODateLocal(getWeekBoundsFromISO(toISODateLocal(d)).start)
    byKey.set(weekStartIso, (byKey.get(weekStartIso) ?? 0) + 1)
  }
  return [...byKey.entries()]
    .map(([weekStartIso, count]) => ({ key: weekStartIso, label: weekLabel(getWeekBoundsFromISO(weekStartIso)), count }))
    .sort((a, b) => (a.key < b.key ? 1 : -1))
})

const totalDayPages = computed(() => Math.max(1, Math.ceil(activeDaySummaries.value.length / HISTORY_PAGE_SIZE)))
const totalWeekPages = computed(() => Math.max(1, Math.ceil(activeWeekSummaries.value.length / HISTORY_PAGE_SIZE)))
const totalMonthPages = computed(() => Math.max(1, Math.ceil(activeMonthSummaries.value.length / HISTORY_PAGE_SIZE)))
const totalYearPages = computed(() => Math.max(1, Math.ceil(activeYearSummaries.value.length / HISTORY_PAGE_SIZE)))
const totalRangePages = computed(() => Math.max(1, Math.ceil(rangeDetails.value.length / HISTORY_PAGE_SIZE)))

const showDayPagination = computed(() => activeDaySummaries.value.length > HISTORY_PAGE_SIZE)
const showWeekPagination = computed(() => activeWeekSummaries.value.length > HISTORY_PAGE_SIZE)
const showMonthPagination = computed(() => activeMonthSummaries.value.length > HISTORY_PAGE_SIZE)
const showYearPagination = computed(() => activeYearSummaries.value.length > HISTORY_PAGE_SIZE)
const showRangePagination = computed(() => rangeDetails.value.length > HISTORY_PAGE_SIZE)

const paginatedDays = computed(() => {
  const start = dayPage.value * HISTORY_PAGE_SIZE
  return activeDaySummaries.value.slice(start, start + HISTORY_PAGE_SIZE)
})
const paginatedWeeks = computed(() => {
  const start = weekPage.value * HISTORY_PAGE_SIZE
  return activeWeekSummaries.value.slice(start, start + HISTORY_PAGE_SIZE)
})
const paginatedMonths = computed(() => {
  const start = monthPage.value * HISTORY_PAGE_SIZE
  return activeMonthSummaries.value.slice(start, start + HISTORY_PAGE_SIZE)
})
const paginatedYears = computed(() => {
  const start = yearPage.value * HISTORY_PAGE_SIZE
  return activeYearSummaries.value.slice(start, start + HISTORY_PAGE_SIZE)
})
const paginatedRangeDetails = computed(() => {
  const start = rangePage.value * HISTORY_PAGE_SIZE
  return rangeDetails.value.slice(start, start + HISTORY_PAGE_SIZE)
})

const resetLabel = computed(() => {
  if (props.item.reset_periode === 'semaine') return 'semaine'
  if (props.item.reset_periode === 'mois') return 'mois'
  return 'jour'
})

const accentStyle = computed(() => ({
  '--project-color': props.projectColor || '#ad81be',
}))

watch(historyEntries, () => {
  if (historyPage.value > totalHistoryPages.value - 1) {
    historyPage.value = Math.max(0, totalHistoryPages.value - 1)
  }
})

function openHistory() {
  historyPage.value = 0
  dayPage.value = 0
  weekPage.value = 0
  monthPage.value = 0
  yearPage.value = 0
  rangePage.value = 0
  filterOpen.value = false
  if (props.item.reset_periode === PROJECT_RESET_PERIODE.MOIS) {
    historyMode.value = 'mois'
  } else if (props.item.reset_periode === PROJECT_RESET_PERIODE.JOUR) {
    historyMode.value = 'jour'
  } else {
    historyMode.value = 'semaine'
  }
  historyYear.value = new Date().getFullYear()
  rangeStart.value = ''
  rangeEnd.value = new Date().toISOString().slice(0, 10)
  historyOpen.value = true
}

function closeHistory() {
  historyOpen.value = false
  historyPage.value = 0
  filterOpen.value = false
}

function goToHistoryPage(page) {
  historyPage.value = Math.max(0, Math.min(page, totalHistoryPages.value - 1))
}
</script>

<template>
  <div
    v-if="!usesQuantiteTracking"
    class="project-progress project-progress--checkbox"
    :class="{ 'project-progress--compact': compact, 'project-progress--done': item.is_done }"
    :style="accentStyle"
  >
    <label
      class="project-progress__check"
      :class="{ 'project-progress__check--small': compact }"
      :title="item.is_done ? 'Marquer comme à faire' : 'Marquer comme terminée'"
    >
      <input
        type="checkbox"
        class="project-progress__check-input"
        :checked="item.is_done"
        @change.stop="emit('toggle')"
      />
      <span class="project-progress__check-box" aria-hidden="true" />
    </label>
  </div>

  <div
    v-else
    class="project-progress"
    :class="{ 'project-progress--compact': compact, 'project-progress--done': item.is_done }"
    :style="accentStyle"
  >
    <div
      class="project-progress__quantite"
      role="group"
      :aria-label="`Progression : ${quantiteLabel}`"
    >
      <button
        type="button"
        class="project-progress__quantite-btn"
        title="Diminuer"
        aria-label="Diminuer la quantité"
        :disabled="currentCount <= 0"
        @click.stop="emit('decrement')"
      >
        −
      </button>
      <span class="project-progress__quantite-value">{{ quantiteLabel }}</span>
      <button
        type="button"
        class="project-progress__quantite-btn"
        title="Augmenter"
        aria-label="Augmenter la quantité"
        @click.stop="emit('increment')"
      >
        +
      </button>
    </div>

    <div class="project-progress__aside">
      <span class="project-progress__reset">Par {{ resetLabel }}</span>
      <button type="button" class="project-progress__history-btn" @click.stop="openHistory">
        Historique
      </button>
    </div>

    <Teleport to="body">
      <div v-if="historyOpen" class="project-history-modal" role="dialog" aria-modal="true">
        <div class="project-history-modal__overlay" @click="closeHistory" />
        <div class="project-history-modal__panel" :style="accentStyle">
          <header class="project-history-modal__header">
            <div>
              <h3 class="project-history-modal__title">Historique</h3>
              <p class="project-history-modal__subtitle">
                {{
                  hasRangeOverride
                    ? 'Période (dates)'
                    : historyMode === 'annee'
                      ? 'Années'
                      : historyMode === 'mois'
                        ? `Mois (année ${historyYear})`
                        : historyMode === 'jour'
                          ? `Jours (année ${historyYear})`
                          : `Semaines (année ${historyYear})`
                }}
              </p>
            </div>
            <button
              type="button"
              class="project-history-modal__close"
              aria-label="Fermer"
              @click="closeHistory"
            >
              ✕
            </button>
          </header>

          <div class="project-history-modal__controls">
            <button type="button" class="project-history-modal__filter-btn" @click="filterOpen = true">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M3 4h18v2l-7 8v5l-4 1v-6L3 6V4z" />
              </svg>
              Filtre
            </button>

            <div v-if="filterOpen" class="project-history-modal__filter-overlay" @click="filterOpen = false" />
            <div v-if="filterOpen" class="project-history-modal__filter-panel" :style="accentStyle">
              <h4 class="project-history-modal__filter-title">Afficher</h4>

              <div class="project-history-modal__filter-grid">
                <label v-if="useJourFilter" class="project-history-modal__filter-radio">
                  <input v-model="historyMode" type="radio" value="jour" />
                  <span>Jour</span>
                </label>
                <label class="project-history-modal__filter-radio">
                  <input v-model="historyMode" type="radio" value="semaine" />
                  <span>Semaine</span>
                </label>
                <label class="project-history-modal__filter-radio">
                  <input v-model="historyMode" type="radio" value="mois" />
                  <span>Mois</span>
                </label>
                <label class="project-history-modal__filter-radio">
                  <input v-model="historyMode" type="radio" value="annee" />
                  <span>Année</span>
                </label>
              </div>

              <div class="project-history-modal__filter-range">
                <label class="project-history-modal__control">
                  <span>Début (optionnel)</span>
                  <input v-model="rangeStart" type="date" class="project-history-modal__select" />
                </label>
                <label class="project-history-modal__control">
                  <span>Fin</span>
                  <input v-model="rangeEnd" type="date" class="project-history-modal__select" />
                </label>
                <label class="project-history-modal__control">
                  <span>Année</span>
                  <select v-model.number="historyYear" class="project-history-modal__select" :disabled="hasRangeOverride">
                    <option v-for="y in yearOptions" :key="y" :value="y">{{ y }}</option>
                  </select>
                </label>
              </div>

              <div class="project-history-modal__filter-actions">
                <button type="button" class="project-history-modal__apply-btn" @click="filterOpen = false">
                  Appliquer
                </button>
              </div>
            </div>
          </div>

          <p v-if="historyViewStats" class="project-history-modal__stats">
            <span>{{ historyViewStats.totalLabel }}</span>
            <span>{{ historyViewStats.averageLabel }}</span>
          </p>

          <template v-if="activeHistoryView === 'plage'">
            <ul v-if="paginatedRangeDetails.length > 0" class="project-history-modal__list">
              <li v-for="row in paginatedRangeDetails" :key="row.key" class="project-history-modal__item">
                <div class="project-history-modal__item-head">
                  <span class="project-history-modal__item-title">{{ row.label }}</span>
                  <span class="project-history-modal__item-count">{{ row.count }} fois</span>
                </div>
              </li>
            </ul>
            <p v-else class="project-history-modal__empty">Aucune activité sur cette période.</p>

            <nav v-if="showRangePagination" class="project-history-modal__pagination" aria-label="Pagination période">
              <button
                type="button"
                class="project-history-modal__page-btn"
                :disabled="rangePage === 0"
                aria-label="Page précédente"
                @click="rangePage = Math.max(0, rangePage - 1)"
              >
                ‹
              </button>
              <span class="project-history-modal__page-label">{{ rangePage + 1 }} / {{ totalRangePages }}</span>
              <button
                type="button"
                class="project-history-modal__page-btn"
                :disabled="rangePage >= totalRangePages - 1"
                aria-label="Page suivante"
                @click="rangePage = Math.min(totalRangePages - 1, rangePage + 1)"
              >
                ›
              </button>
            </nav>
          </template>

          <template v-else-if="historyMode === 'jour'">
            <ul v-if="paginatedDays.length > 0" class="project-history-modal__list">
              <li v-for="d in paginatedDays" :key="d.index" class="project-history-modal__item">
                <div class="project-history-modal__item-head">
                  <span class="project-history-modal__item-title">{{ d.label }}</span>
                  <span class="project-history-modal__item-count">{{ d.count }} fois</span>
                </div>
                <span class="project-history-modal__item-date">{{ d.dateLabel }}</span>
              </li>
            </ul>
            <p v-else class="project-history-modal__empty">Aucun jour avec données.</p>

            <nav v-if="showDayPagination" class="project-history-modal__pagination" aria-label="Pagination jours">
              <button
                type="button"
                class="project-history-modal__page-btn"
                :disabled="dayPage === 0"
                aria-label="Page précédente"
                @click="dayPage = Math.max(0, dayPage - 1)"
              >
                ‹
              </button>
              <span class="project-history-modal__page-label">{{ dayPage + 1 }} / {{ totalDayPages }}</span>
              <button
                type="button"
                class="project-history-modal__page-btn"
                :disabled="dayPage >= totalDayPages - 1"
                aria-label="Page suivante"
                @click="dayPage = Math.min(totalDayPages - 1, dayPage + 1)"
              >
                ›
              </button>
            </nav>
          </template>

          <template v-else-if="historyMode === 'semaine'">
            <ul v-if="paginatedWeeks.length > 0" class="project-history-modal__list">
              <li v-for="w in paginatedWeeks" :key="w.index" class="project-history-modal__item">
                <div class="project-history-modal__item-head">
                  <span class="project-history-modal__item-title">{{ w.label }}</span>
                  <span class="project-history-modal__item-count">{{ w.count }} fois</span>
                </div>
                <span class="project-history-modal__item-date">{{ w.dateLabel }}</span>
              </li>
            </ul>
            <p v-else class="project-history-modal__empty">Aucune semaine avec données.</p>

            <nav v-if="showWeekPagination" class="project-history-modal__pagination" aria-label="Pagination semaines">
              <button
                type="button"
                class="project-history-modal__page-btn"
                :disabled="weekPage === 0"
                aria-label="Page précédente"
                @click="weekPage = Math.max(0, weekPage - 1)"
              >
                ‹
              </button>
              <span class="project-history-modal__page-label">{{ weekPage + 1 }} / {{ totalWeekPages }}</span>
              <button
                type="button"
                class="project-history-modal__page-btn"
                :disabled="weekPage >= totalWeekPages - 1"
                aria-label="Page suivante"
                @click="weekPage = Math.min(totalWeekPages - 1, weekPage + 1)"
              >
                ›
              </button>
            </nav>
          </template>

          <template v-else-if="historyMode === 'mois'">
            <ul v-if="paginatedMonths.length > 0" class="project-history-modal__list">
              <li v-for="m in paginatedMonths" :key="m.month" class="project-history-modal__item">
                <div class="project-history-modal__item-head">
                  <span class="project-history-modal__item-title">{{ m.label }}</span>
                  <span class="project-history-modal__item-count">{{ m.count }} fois</span>
                </div>
              </li>
            </ul>
            <p v-else class="project-history-modal__empty">Aucun mois avec données.</p>

            <nav v-if="showMonthPagination" class="project-history-modal__pagination" aria-label="Pagination mois">
              <button
                type="button"
                class="project-history-modal__page-btn"
                :disabled="monthPage === 0"
                aria-label="Page précédente"
                @click="monthPage = Math.max(0, monthPage - 1)"
              >
                ‹
              </button>
              <span class="project-history-modal__page-label">{{ monthPage + 1 }} / {{ totalMonthPages }}</span>
              <button
                type="button"
                class="project-history-modal__page-btn"
                :disabled="monthPage >= totalMonthPages - 1"
                aria-label="Page suivante"
                @click="monthPage = Math.min(totalMonthPages - 1, monthPage + 1)"
              >
                ›
              </button>
            </nav>
          </template>

          <template v-else>
            <ul v-if="paginatedYears.length > 0" class="project-history-modal__list">
              <li v-for="y in paginatedYears" :key="y.year" class="project-history-modal__item">
                <div class="project-history-modal__item-head">
                  <span class="project-history-modal__item-title">{{ y.year }}</span>
                  <span class="project-history-modal__item-count">{{ y.count }} fois</span>
                </div>
              </li>
            </ul>
            <p v-else class="project-history-modal__empty">Aucune année avec données.</p>

            <nav v-if="showYearPagination" class="project-history-modal__pagination" aria-label="Pagination années">
              <button
                type="button"
                class="project-history-modal__page-btn"
                :disabled="yearPage === 0"
                aria-label="Page précédente"
                @click="yearPage = Math.max(0, yearPage - 1)"
              >
                ‹
              </button>
              <span class="project-history-modal__page-label">{{ yearPage + 1 }} / {{ totalYearPages }}</span>
              <button
                type="button"
                class="project-history-modal__page-btn"
                :disabled="yearPage >= totalYearPages - 1"
                aria-label="Page suivante"
                @click="yearPage = Math.min(totalYearPages - 1, yearPage + 1)"
              >
                ›
              </button>
            </nav>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.project-progress {
  display: flex;
  align-items: stretch;
  align-self: stretch;
  flex-shrink: 0;
  gap: 0.5rem;
}

.project-progress--checkbox {
  align-items: center;
  align-self: auto;
}

.project-progress__check {
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.project-progress__check--small .project-progress__check-box {
  width: 1rem;
  height: 1rem;
}

.project-progress__check-input {
  position: absolute;
  opacity: 0;
  width: 1.15rem;
  height: 1.15rem;
  margin: 0;
  cursor: pointer;
}

.project-progress__check-box {
  display: block;
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 4px;
  border: 2px solid color-mix(in srgb, var(--project-color, #ad81be) 65%, transparent);
  background: white;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.project-progress__check-input:checked + .project-progress__check-box {
  background: linear-gradient(135deg, #2ecc71, #27ae60);
  border-color: #27ae60;
  box-shadow: inset 0 0 0 2px white;
}

.project-progress--compact {
  gap: 0.35rem;
}

.project-progress__quantite {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  align-self: stretch;
  gap: 0.35rem;
  padding: 0.55rem 0.4rem;
  margin: -0.75rem 0 -0.75rem -0.75rem;
  border-radius: 12px 0 0 12px;
  background: color-mix(in srgb, var(--project-color, #ad81be) 16%, white);
  border-right: 1px solid color-mix(in srgb, var(--project-color, #ad81be) 22%, transparent);
}

.project-progress--compact .project-progress__quantite {
  padding: 0.4rem 0.3rem;
  margin: -0.35rem 0 -0.35rem -0.25rem;
  border-radius: 8px 0 0 8px;
}

.project-progress__quantite-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.85rem;
  height: 1.85rem;
  flex-shrink: 0;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.7);
  color: var(--project-color, #ad81be);
  font-size: 1rem;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
}

.project-progress--compact .project-progress__quantite-btn {
  width: 1.55rem;
  height: 1.55rem;
  font-size: 0.9rem;
}

.project-progress__quantite-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.project-progress__quantite-btn:not(:disabled):hover {
  background: #fff;
}

.project-progress__quantite-value {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 2.4rem;
  text-align: center;
  font-size: 0.82rem;
  font-weight: 800;
  color: #2c3e50;
  line-height: 1.2;
}

.project-progress--done .project-progress__quantite-value {
  color: #72a098;
}

.project-progress__aside {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.2rem;
  min-width: 0;
  padding: 0.15rem 0;
}

.project-progress--compact .project-progress__aside {
  gap: 0.1rem;
  padding: 0.05rem 0;
}

.project-progress__reset {
  font-size: 0.72rem;
  font-weight: 700;
  color: #8a96a3;
  text-transform: capitalize;
  white-space: nowrap;
}

.project-progress--compact .project-progress__reset {
  font-size: 0.65rem;
}

.project-progress__history-btn {
  border: none;
  background: none;
  padding: 0;
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--project-color, #ad81be);
  cursor: pointer;
  text-decoration: underline;
  text-align: left;
  white-space: nowrap;
}

.project-progress--compact .project-progress__history-btn {
  font-size: 0.65rem;
}

.project-history-modal {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
}

.project-history-modal__overlay {
  position: absolute;
  inset: 0;
  background: rgba(20, 30, 40, 0.5);
}

.project-history-modal__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(100%, 44rem);
  min-height: min(70vh, 28rem);
  max-height: min(88vh, 40rem);
  background: white;
  border-radius: 16px;
  padding: 1.25rem 1.35rem 1.1rem;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
}

.project-history-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
  flex-shrink: 0;
}

.project-history-modal__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 800;
  color: #2c3e50;
}

.project-history-modal__subtitle {
  margin: 0.2rem 0 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: #8a96a3;
}

.project-history-modal__close {
  border: none;
  background: none;
  font-size: 1.15rem;
  cursor: pointer;
  color: #8a96a3;
  padding: 0.15rem;
}

.project-history-modal__empty {
  margin: auto 0;
  text-align: center;
  color: #8a96a3;
  font-weight: 600;
}

.project-history-modal__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.project-history-modal__item {
  padding: 0.75rem 0.85rem;
  border-radius: 10px;
  background: #f6f8fa;
  border: 1px solid #e8edf2;
}

.project-history-modal__item--current {
  border-color: color-mix(in srgb, var(--project-color, #ad81be) 40%, transparent);
  background: color-mix(in srgb, var(--project-color, #ad81be) 8%, white);
}

.project-history-modal__item-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.project-history-modal__item-title {
  font-weight: 800;
  font-size: 0.95rem;
  color: #2c3e50;
}

.project-history-modal__item-count {
  font-weight: 800;
  color: var(--project-color, #ad81be);
  white-space: nowrap;
}

.project-history-modal__item-date {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.85rem;
  color: #6b7a88;
}

.project-history-modal__item-badge {
  display: inline-block;
  margin-top: 0.35rem;
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--project-color, #ad81be);
}

.project-history-modal__pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.85rem;
  margin-top: 1rem;
  padding-top: 0.85rem;
  border-top: 1px solid #e8edf2;
  flex-shrink: 0;
}

.project-history-modal__controls {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin: 0.25rem 0 1rem;
  flex-shrink: 0;
}

.project-history-modal__filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.75rem;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--project-color, #ad81be) 35%, transparent);
  background: rgba(255, 255, 255, 0.7);
  color: var(--project-color, #ad81be);
  font-weight: 900;
  cursor: pointer;
}

.project-history-modal__filter-btn svg {
  width: 1rem;
  height: 1rem;
}

.project-history-modal__filter-overlay {
  position: fixed;
  inset: 0;
  z-index: 1250;
}

.project-history-modal__filter-panel {
  position: fixed;
  z-index: 1251;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(92vw, 30rem);
  max-height: min(80vh, 36rem);
  overflow: auto;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--project-color, #ad81be) 25%, transparent);
  background: white;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18);
  padding: 0.9rem 1rem 1rem;
}

.project-history-modal__filter-title {
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
  font-weight: 900;
  color: #2c3e50;
}

.project-history-modal__filter-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}

.project-history-modal__filter-radio {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  padding: 0.55rem 0.65rem;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--project-color, #ad81be) 22%, transparent);
  background: color-mix(in srgb, var(--project-color, #ad81be) 10%, white);
  cursor: pointer;
  font-weight: 800;
  color: #2c3e50;
}

.project-history-modal__filter-radio input {
  accent-color: var(--project-color, #ad81be);
}

.project-history-modal__filter-range {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: 0.95rem;
  padding-top: 0.85rem;
  border-top: 1px solid color-mix(in srgb, var(--project-color, #ad81be) 20%, transparent);
}

.project-history-modal__control {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
  max-width: 100%;
}

.project-history-modal__control span {
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--project-color, #ad81be);
}

.project-history-modal__select {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 0.55rem 0.75rem;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--project-color, #ad81be) 22%, transparent);
  font-size: 0.95rem;
  font-weight: 650;
  background: rgba(255, 255, 255, 0.95);
  color: #2c3e50;
}

.project-history-modal__filter-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.85rem;
}

.project-history-modal__apply-btn {
  padding: 0.6rem 0.9rem;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  font-weight: 900;
  cursor: pointer;
}

.project-history-modal__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1rem;
  margin: 0.35rem 0 0.85rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: #6b7a88;
}

.project-history-modal__stats span:first-child {
  color: #2c3e50;
  font-weight: 800;
}

.project-history-modal__page-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 1px solid color-mix(in srgb, var(--project-color, #ad81be) 35%, transparent);
  border-radius: 10px;
  background: white;
  color: var(--project-color, #ad81be);
  font-size: 1.25rem;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
}

.project-history-modal__page-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.project-history-modal__page-btn:not(:disabled):hover {
  background: color-mix(in srgb, var(--project-color, #ad81be) 10%, white);
}

.project-history-modal__page-label {
  min-width: 4.5rem;
  text-align: center;
  font-size: 0.9rem;
  font-weight: 800;
  color: #2c3e50;
}

@media (max-width: 520px) {
  .project-progress__reset {
    display: none;
  }

  .project-history-modal__panel {
    width: 100%;
    min-height: min(80vh, 24rem);
  }
}

@media (prefers-color-scheme: dark) {
  .project-progress__quantite {
    background: color-mix(in srgb, var(--project-color, #ad81be) 24%, transparent);
    border-right-color: rgba(213, 181, 234, 0.22);
  }

  .project-progress__quantite-btn {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(213, 181, 234, 0.28);
    color: var(--project-color, #d5b5ea);
  }

  .project-progress__quantite-btn:not(:disabled):hover {
    background: rgba(255, 255, 255, 0.18);
  }

  .project-progress__quantite-value {
    color: #f0e8f8;
  }

  .project-progress--done .project-progress__quantite-value {
    color: #95d1aa;
  }

  .project-history-modal__panel {
    background: #1e2832;
  }

  .project-history-modal__filter-panel {
    background: #1e2832;
  }

  .project-history-modal__filter-title,
  .project-history-modal__stats span:first-child {
    color: #e8edf2;
  }

  .project-history-modal__stats {
    color: #a8b4c0;
  }

  .project-history-modal__filter-radio {
    background: rgba(255, 255, 255, 0.06);
    border-color: #3a4654;
    color: #e8edf2;
  }

  .project-history-modal__select {
    background: rgba(30, 25, 40, 0.9);
    border-color: rgba(213, 181, 234, 0.2);
    color: #f0e8f8;
  }

  .project-history-modal__title,
  .project-history-modal__page-label {
    color: #e8edf2;
  }

  .project-history-modal__item {
    background: #2a3540;
    border-color: #3a4654;
  }

  .project-history-modal__item-title {
    color: #e8edf2;
  }

  .project-history-modal__pagination {
    border-top-color: #3a4654;
  }

  .project-history-modal__page-btn {
    background: #2a3540;
    border-color: #3a4654;
  }
}
</style>
