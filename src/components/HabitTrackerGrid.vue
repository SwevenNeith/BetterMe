<script setup>
import { ref, computed, watch } from 'vue'
import { supabase } from '../lib/supabase.js'
import { getLocalTodayISO } from '../services/scheduledReminders.js'
import { HABIT_VALUE_TYPE, normalizeHabitValueType } from '../constants/habitOptions.js'
import { listHabitLogsForRange } from '../services/habitLogs.js'
import {
  HABIT_VIEW_MODE,
  addDaysISO,
  buildAnnualMonthColumns,
  buildMonthOptions,
  buildMonthlyPlacedDays,
  buildYearOptions,
  getAnnualDateRange,
  getMonthlyDateRange,
  getMonthLabelFr,
  isHabitScheduledOnDate,
  normalizeDateISO,
  parseISODate,
} from '../utils/habitCalendar.js'
import {
  formatStatNumber,
  getDayIntensity,
  getEffectiveValeur,
  getIntensityTier,
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
  focusDate: {
    type: String,
    default: null,
  },
})

const today = new Date()
const viewMode = ref(HABIT_VIEW_MODE.ANNUAL)
const selectedYear = ref(today.getFullYear())
const selectedMonth = ref(today.getMonth() + 1)

const logsByDate = ref({})
const isLoadingLogs = ref(false)
const logsError = ref('')

const todayIso = computed(() => getLocalTodayISO())

const yearOptions = buildYearOptions()
const monthOptions = buildMonthOptions()

const annualColumns = computed(() => buildAnnualMonthColumns(selectedYear.value))

const monthlyLayout = computed(() =>
  buildMonthlyPlacedDays(selectedYear.value, selectedMonth.value),
)

const monthlyGridStyle = computed(() => ({
  gridTemplateRows: `auto repeat(${monthlyLayout.value.rowCount}, minmax(0, 1fr))`,
}))

const periodLabel = computed(() => {
  if (viewMode.value === HABIT_VIEW_MODE.ANNUAL) {
    return String(selectedYear.value)
  }
  return `${getMonthLabelFr(selectedMonth.value, 'long')} ${selectedYear.value}`
})

function getLog(date) {
  return logsByDate.value[date] ?? null
}

function isCellInactive(date) {
  return !isHabitScheduledOnDate(props.habit, date)
}

function isBooleanHabit() {
  return normalizeHabitValueType(props.habit.type_valeur) === HABIT_VALUE_TYPE.BOOLEAN
}

function getCellTier(date) {
  const log = getLog(date)
  if (isBooleanHabit()) {
    return isHabitDayDone(log) ? 100 : 0
  }
  const intensity = getDayIntensity(log, date, logsByDate.value)
  return getIntensityTier(intensity, isHabitDayDone(log))
}

function getCellClass(date) {
  const tier = getCellTier(date)
  const classes = [tier > 0 ? `habit-grid__cell--tier-${tier}` : 'habit-grid__cell--tier-0']
  if (date === todayIso.value) {
    classes.push('habit-grid__cell--today')
  }
  return classes
}

function formatDateLong(dateIso) {
  const [y, m, d] = dateIso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function getCellTooltip(date) {
  const label = formatDateLong(date)
  const log = getLog(date)

  if (isHabitDayDone(log)) {
    if (props.habit.type_valeur === HABIT_VALUE_TYPE.BOOLEAN) {
      return `${label} — Fait`
    }
    const value = getEffectiveValeur(log)
    const unit = props.habit.unite ? ` ${props.habit.unite}` : ''
    const intensity = getDayIntensity(log, date, logsByDate.value)
    const pct = Math.round(intensity * 100)
    return `${label} — ${formatStatNumber(value, 0)}${unit} (${pct} %)`
  }

  if (isCellInactive(date)) {
    return `${label} — Jour inactif`
  }

  return `${label} — Non renseigné`
}

function cellAriaLabel(date) {
  const tooltip = getCellTooltip(date)
  return date === todayIso.value ? `Aujourd'hui. ${tooltip}` : tooltip
}

function getLoadRange() {
  const base =
    viewMode.value === HABIT_VIEW_MODE.ANNUAL
      ? getAnnualDateRange(selectedYear.value)
      : getMonthlyDateRange(selectedYear.value, selectedMonth.value)

  return {
    start: addDaysISO(base.start, -29),
    end: base.end,
  }
}

async function loadLogs() {
  if (!props.userId || !props.habit?.id) return

  isLoadingLogs.value = true
  logsError.value = ''

  const range = getLoadRange()

  try {
    const rows = await listHabitLogsForRange(
      supabase,
      props.userId,
      props.habit.id,
      range.start,
      range.end,
    )
    const map = {}
    for (const row of rows) {
      const dateKey = normalizeDateISO(row.date_jour)
      map[dateKey] = { ...row, date_jour: dateKey }
    }
    logsByDate.value = map
  } catch (err) {
    console.error(err)
    const msg = err.message || ''
    logsError.value = msg.includes('habit_logs')
      ? 'Table habit_logs introuvable. Vérifie que la table est créée dans Supabase.'
      : msg || 'Impossible de charger le suivi.'
    logsByDate.value = {}
  } finally {
    isLoadingLogs.value = false
  }
}

watch(
  () => [
    props.habit?.id,
    props.refreshKey,
    viewMode.value,
    selectedYear.value,
    selectedMonth.value,
  ],
  () => {
    loadLogs()
  },
  { immediate: true },
)

watch(
  () => props.focusDate,
  (iso) => {
    if (!iso) return
    const { year, month } = parseISODate(iso)
    if (!year || !month) return
    selectedYear.value = year
    selectedMonth.value = month
  },
)
</script>

<template>
  <div class="habit-grid" :style="{ '--habit-color': habit.couleur }">
    <div class="habit-grid__toolbar">
      <div class="habit-grid__mode" role="tablist" aria-label="Mode d’affichage">
        <button
          type="button"
          role="tab"
          class="habit-grid__mode-btn"
          :class="{ 'habit-grid__mode-btn--active': viewMode === HABIT_VIEW_MODE.ANNUAL }"
          :aria-selected="viewMode === HABIT_VIEW_MODE.ANNUAL"
          @click="viewMode = HABIT_VIEW_MODE.ANNUAL"
        >
          Annuel
        </button>
        <button
          type="button"
          role="tab"
          class="habit-grid__mode-btn"
          :class="{ 'habit-grid__mode-btn--active': viewMode === HABIT_VIEW_MODE.MONTHLY }"
          :aria-selected="viewMode === HABIT_VIEW_MODE.MONTHLY"
          @click="viewMode = HABIT_VIEW_MODE.MONTHLY"
        >
          Mensuel
        </button>
      </div>

      <div class="habit-grid__period">
        <label v-if="viewMode === HABIT_VIEW_MODE.MONTHLY" class="habit-grid__select-wrap">
          <span class="habit-grid__select-label">Mois</span>
          <select v-model.number="selectedMonth" class="habit-grid__select">
            <option v-for="opt in monthOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </label>

        <label class="habit-grid__select-wrap">
          <span class="habit-grid__select-label">Année</span>
          <select v-model.number="selectedYear" class="habit-grid__select">
            <option v-for="year in yearOptions" :key="year" :value="year">
              {{ year }}
            </option>
          </select>
        </label>
      </div>
    </div>

    <p class="habit-grid__period-title">{{ periodLabel }}</p>

    <p v-if="logsError" class="habit-grid__feedback habit-grid__feedback--error">
      {{ logsError }}
    </p>

    <div v-if="isLoadingLogs" class="habit-grid__loading">Chargement du suivi…</div>

    <div v-else class="habit-grid__board">
      <div v-if="viewMode === HABIT_VIEW_MODE.ANNUAL" class="habit-grid__annual">
        <section
          v-for="column in annualColumns"
          :key="column.month"
          class="habit-grid__month-col"
          :aria-label="column.label"
        >
          <h3 class="habit-grid__month-label">{{ column.label }}</h3>
          <div class="habit-grid__month-stack">
            <span
              v-for="cell in column.days"
              :key="cell.date"
              class="habit-grid__cell"
              :class="getCellClass(cell.date)"
              :aria-label="cellAriaLabel(cell.date)"
              :data-tooltip="getCellTooltip(cell.date)"
              tabindex="0"
            />
          </div>
        </section>
      </div>

      <div v-else class="habit-grid__monthly" :style="monthlyGridStyle">
        <span
          v-for="(label, index) in monthlyLayout.weekdayHeaders"
          :key="`wh-${label}`"
          class="habit-grid__weekday-label"
          :style="{ gridColumn: index + 1, gridRow: 1 }"
        >
          {{ label }}
        </span>

        <span
          v-for="cell in monthlyLayout.days"
          :key="cell.date"
          class="habit-grid__cell habit-grid__cell--monthly"
          :class="getCellClass(cell.date)"
          :style="{
            gridRow: cell.gridRow,
            gridColumn: cell.gridColumn,
          }"
          :aria-label="cellAriaLabel(cell.date)"
          :data-tooltip="getCellTooltip(cell.date)"
          tabindex="0"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.habit-grid {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  min-width: 0;
  width: 100%;
}

.habit-grid__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.75rem;
}

.habit-grid__mode {
  display: flex;
  gap: 0.35rem;
  padding: 0.3rem;
  border-radius: 12px;
  background: rgba(213, 181, 234, 0.12);
  border: 1px solid rgba(213, 181, 234, 0.25);
}

.habit-grid__mode-btn {
  border: none;
  border-radius: 9px;
  padding: 0.5rem 0.85rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: #6c757d;
  background: transparent;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
}

.habit-grid__mode-btn:hover {
  color: var(--habit-color, #ad81be);
  background: rgba(255, 255, 255, 0.45);
}

.habit-grid__mode-btn--active {
  color: var(--habit-color, #ad81be);
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--habit-color, #ad81be) 20%, transparent);
}

.habit-grid__period {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}

.habit-grid__select-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.habit-grid__select-label {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #ad81be;
}

.habit-grid__select {
  padding: 0.45rem 0.65rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  font-size: 0.88rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.9);
  color: #2c3e50;
  cursor: pointer;
}

.habit-grid__period-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: #2c3e50;
  text-transform: capitalize;
}

.habit-grid__feedback {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 600;
}

.habit-grid__feedback--error {
  color: #c0392b;
}

.habit-grid__loading {
  margin: 0;
  text-align: center;
  color: #6c757d;
  font-size: 0.9rem;
}

.habit-grid__board {
  width: 100%;
  padding: 0.75rem;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(213, 181, 234, 0.3);
  box-shadow: 0 6px 24px rgba(173, 129, 190, 0.1);
  box-sizing: border-box;
  overflow: visible;
}

.habit-grid__annual {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 0.35rem;
  width: 100%;
  align-items: start;
}

.habit-grid__month-col {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
  overflow: visible;
}

.habit-grid__month-label {
  margin: 0;
  padding: 0.2rem 0;
  font-size: clamp(0.48rem, 1.6vw, 0.65rem);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  text-align: center;
  color: #ad81be;
}

.habit-grid__month-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: visible;
}

.habit-grid__monthly {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.35rem;
  width: 100%;
}

.habit-grid__weekday-label {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #ad81be;
  padding-bottom: 0.15rem;
}

.habit-grid__cell {
  position: relative;
  aspect-ratio: 1;
  width: 100%;
  min-width: 0;
  border-radius: 4px;
  border: 1px solid rgba(213, 181, 234, 0.22);
  box-sizing: border-box;
  cursor: default;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease,
    z-index 0s;
}

.habit-grid__cell--monthly {
  border-radius: 6px;
}

.habit-grid__cell--tier-0 {
  background: rgba(255, 255, 255, 0.95);
}

.habit-grid__cell--tier-25 {
  background: color-mix(in srgb, var(--habit-color, #ad81be) 25%, white);
  border-color: color-mix(in srgb, var(--habit-color, #ad81be) 35%, transparent);
}

.habit-grid__cell--tier-50 {
  background: color-mix(in srgb, var(--habit-color, #ad81be) 50%, white);
  border-color: color-mix(in srgb, var(--habit-color, #ad81be) 45%, transparent);
}

.habit-grid__cell--tier-75 {
  background: color-mix(in srgb, var(--habit-color, #ad81be) 75%, white);
  border-color: color-mix(in srgb, var(--habit-color, #ad81be) 55%, transparent);
}

.habit-grid__cell--tier-100 {
  background: var(--habit-color, #ad81be);
  border-color: color-mix(in srgb, var(--habit-color, #ad81be) 80%, transparent);
  box-shadow: 0 1px 5px color-mix(in srgb, var(--habit-color, #ad81be) 35%, transparent);
}

.habit-grid__cell--today {
  z-index: 2;
  box-shadow:
    0 0 0 2px rgba(255, 255, 255, 0.95),
    0 0 0 3px var(--habit-color, #ad81be),
    0 2px 8px color-mix(in srgb, var(--habit-color, #ad81be) 45%, transparent);
}

.habit-grid__cell--today.habit-grid__cell--tier-100 {
  box-shadow:
    0 0 0 2px rgba(255, 255, 255, 0.9),
    0 0 0 3px #fff,
    0 2px 10px color-mix(in srgb, var(--habit-color, #ad81be) 55%, transparent);
}

.habit-grid__cell:hover,
.habit-grid__cell:focus-visible {
  z-index: 3;
  outline: none;
  transform: scale(1.08);
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--habit-color, #ad81be) 25%, transparent),
    0 4px 12px rgba(173, 129, 190, 0.2);
}

.habit-grid__cell[data-tooltip]:hover::after,
.habit-grid__cell[data-tooltip]:focus-visible::after {
  content: attr(data-tooltip);
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  transform: translateX(-50%);
  z-index: 10;
  width: max-content;
  max-width: 14rem;
  padding: 0.45rem 0.6rem;
  border-radius: 10px;
  background: rgba(44, 38, 58, 0.94);
  color: #f8f4fc;
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1.35;
  text-align: center;
  pointer-events: none;
  white-space: normal;
  box-shadow: 0 6px 20px rgba(173, 129, 190, 0.25);
  border: 1px solid rgba(213, 181, 234, 0.25);
}

.habit-grid__cell[data-tooltip]:hover::before,
.habit-grid__cell[data-tooltip]:focus-visible::before {
  content: '';
  position: absolute;
  left: 50%;
  bottom: calc(100% + 3px);
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: rgba(44, 38, 58, 0.94);
  z-index: 10;
  pointer-events: none;
}

@media (prefers-color-scheme: dark) {
  .habit-grid__mode {
    background: rgba(35, 30, 48, 0.6);
    border-color: rgba(213, 181, 234, 0.15);
  }

  .habit-grid__mode-btn {
    color: #adb5bd;
  }

  .habit-grid__mode-btn:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .habit-grid__mode-btn--active {
    background: rgba(45, 38, 58, 0.95);
    color: #d5b5ea;
  }

  .habit-grid__select {
    background: rgba(30, 25, 40, 0.9);
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.2);
  }

  .habit-grid__period-title {
    color: #f0e8f8;
  }

  .habit-grid__board {
    background: rgba(30, 25, 40, 0.55);
    border-color: rgba(213, 181, 234, 0.18);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.2);
  }

  .habit-grid__month-label,
  .habit-grid__weekday-label {
    color: #d5b5ea;
  }

  .habit-grid__cell {
    border-color: rgba(213, 181, 234, 0.15);
  }

  .habit-grid__cell--tier-0 {
    background: rgba(45, 38, 58, 0.65);
  }

  .habit-grid__cell--tier-25 {
    background: color-mix(in srgb, var(--habit-color, #ad81be) 25%, #2d2638);
  }

  .habit-grid__cell--tier-50 {
    background: color-mix(in srgb, var(--habit-color, #ad81be) 50%, #2d2638);
  }

  .habit-grid__cell--tier-75 {
    background: color-mix(in srgb, var(--habit-color, #ad81be) 75%, #2d2638);
  }

  .habit-grid__cell--tier-100 {
    background: color-mix(in srgb, var(--habit-color, #ad81be) 92%, #2d2638);
  }

  .habit-grid__cell--today {
    box-shadow:
      0 0 0 2px rgba(30, 25, 40, 0.95),
      0 0 0 3px #d5b5ea,
      0 2px 10px color-mix(in srgb, var(--habit-color, #ad81be) 50%, transparent);
  }

  .habit-grid__cell--today.habit-grid__cell--tier-100 {
    box-shadow:
      0 0 0 2px rgba(30, 25, 40, 0.9),
      0 0 0 3px #fff,
      0 2px 12px color-mix(in srgb, var(--habit-color, #ad81be) 60%, transparent);
  }
}
</style>
