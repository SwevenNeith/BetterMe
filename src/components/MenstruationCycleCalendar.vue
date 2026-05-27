<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import {
  buildCalendarDataFromCycles,
  buildDayIndex,
  getMonthGrid,
  filterSummariesForMonth,
  buildVisibleLegendGroups,
  legendSwatchClasses,
} from '../services/menstruationCalendar.js'
import { COL } from '../services/menstruationCycles.js'
import { getLocalTodayISO } from '../services/scheduledReminders.js'

const props = defineProps({
  cycles: {
    type: Array,
    default: () => [],
  },
  compact: {
    type: Boolean,
    default: false,
  },
  showRulesForm: {
    type: Boolean,
    default: false,
  },
  isSubmittingRules: {
    type: Boolean,
    default: false,
  },
  rulesError: {
    type: String,
    default: '',
  },
})
const emit = defineEmits(['submit-rules-dates'])

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

const todayISO = getLocalTodayISO()
const viewYear = ref(new Date().getFullYear())
const viewMonth = ref(new Date().getMonth())

const calendarData = computed(() => buildCalendarDataFromCycles(props.cycles))
const dayIndex = computed(() =>
  buildDayIndex(calendarData.value.segments, calendarData.value.markers),
)

const monthTitle = computed(() => {
  const d = new Date(viewYear.value, viewMonth.value, 1)
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
})

const gridCells = computed(() => getMonthGrid(viewYear.value, viewMonth.value))

const monthSummaries = computed(() =>
  filterSummariesForMonth(
    calendarData.value.periodSummaries,
    viewYear.value,
    viewMonth.value,
  ).sort((a, b) => a.start.localeCompare(b.start)),
)

const visibleLegendGroups = computed(() => buildVisibleLegendGroups(calendarData.value))
const rulesForm = ref({
  dateDebutReglesReelle: '',
  dateFinReglesReelle: '',
})

function prevMonth() {
  if (viewMonth.value === 0) {
    viewMonth.value = 11
    viewYear.value -= 1
  } else {
    viewMonth.value -= 1
  }
}

function nextMonth() {
  if (viewMonth.value === 11) {
    viewMonth.value = 0
    viewYear.value += 1
  } else {
    viewMonth.value += 1
  }
}

function goToToday() {
  const now = new Date()
  viewYear.value = now.getFullYear()
  viewMonth.value = now.getMonth()
}

function onSubmitRulesDates() {
  emit('submit-rules-dates', {
    dateDebutReglesReelle: rulesForm.value.dateDebutReglesReelle || null,
    dateFinReglesReelle: rulesForm.value.dateFinReglesReelle || null,
  })
}

function cellLayers(iso) {
  if (!iso) return { segments: [], markers: [] }
  const entry = dayIndex.value.get(iso)
  return entry || { segments: [], markers: [] }
}

function cellTooltip(iso) {
  const entry = dayIndex.value.get(iso)
  if (!entry) return ''
  const lines = []
  if (entry._segmentDetails) {
    for (const s of entry._segmentDetails) {
      lines.push(`${s.label}: ${s.detail}`)
    }
  }
  if (entry._markerDetails) {
    for (const m of entry._markerDetails) {
      lines.push(m.label)
    }
  }
  return [...new Set(lines)].join('\n')
}

function dayCircleClasses(iso) {
  const markers = cellLayers(iso).markers
  return {
    'cycle-calendar__day-num--ring-plaquette': markers.includes('debut-plaquette'),
    'cycle-calendar__day-num--ring-debut-spm-estime': markers.includes('debut-spm-estime'),
    'cycle-calendar__day-num--ring-fin-spm-estime': markers.includes('fin-spm-estime'),
    'cycle-calendar__day-num--ring-debut-spm-reel': markers.includes('debut-spm-reel'),
    'cycle-calendar__day-num--ring-fin-spm-reel': markers.includes('fin-spm-reel'),
  }
}

let isMounted = true
onBeforeUnmount(() => {
  isMounted = false
})

watch(
  () => props.cycles,
  () => {
    if (!isMounted || !props.cycles?.length) return
    const first = props.cycles[0]
    const start = first[COL.dateDebutPlaquette]
    if (start) {
      const [y, m] = start.split('-').map(Number)
      viewYear.value = y
      viewMonth.value = m - 1
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="cycle-calendar" :class="{ 'cycle-calendar--compact': compact }">
    <div class="cycle-calendar__nav">
      <button type="button" class="cal-nav-btn" aria-label="Mois précédent" @click="prevMonth">
        ‹
      </button>
      <div class="cycle-calendar__title-wrap">
        <h3 class="cycle-calendar__title">{{ monthTitle }}</h3>
        <button v-if="!compact" type="button" class="cal-today-btn" @click="goToToday">Aujourd’hui</button>
      </div>
      <button type="button" class="cal-nav-btn" aria-label="Mois suivant" @click="nextMonth">
        ›
      </button>
    </div>

    <div class="cycle-calendar__grid" role="grid" aria-label="Calendrier du cycle">
      <div class="cycle-calendar__weekdays" role="row">
        <span v-for="wd in WEEKDAYS" :key="wd" class="cycle-calendar__weekday" role="columnheader">
          {{ wd }}
        </span>
      </div>
      <div class="cycle-calendar__days">
        <div
          v-for="(cell, idx) in gridCells"
          :key="cell.iso ?? `pad-${idx}`"
          class="cycle-calendar__cell"
          :class="{
            'cycle-calendar__cell--empty': !cell.inMonth,
            'cycle-calendar__cell--today': cell.iso === todayISO,
          }"
          role="gridcell"
          :aria-label="cell.inMonth ? cell.iso : undefined"
        >
          <template v-if="cell.inMonth">
            <span class="cycle-calendar__day-num" :class="dayCircleClasses(cell.iso)">{{ cell.day }}</span>
            <div
              class="cycle-calendar__layers"
              :title="cellTooltip(cell.iso)"
            >
              <span
                v-for="kind in cellLayers(cell.iso).segments"
                :key="kind"
                class="cycle-calendar__bar"
                :class="`cycle-calendar__bar--${kind}`"
              ></span>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div class="cycle-calendar__meta">
      <div
        v-if="visibleLegendGroups.length"
        class="cycle-calendar__legend"
        aria-label="Légende du calendrier"
      >
        <h4 class="cycle-calendar__legend-title">Légende</h4>
        <div class="cycle-calendar__legend-groups">
          <div
            v-for="group in visibleLegendGroups"
            :key="group.id"
            class="cycle-calendar__legend-group"
          >
            <h5 class="cycle-calendar__legend-group-title">{{ group.title }}</h5>
            <ul class="cycle-calendar__legend-list">
              <li
                v-for="item in group.items"
                :key="item.kind"
                class="cycle-calendar__legend-item"
              >
                <span class="cycle-calendar__legend-swatch" :class="legendSwatchClasses(item)"></span>
                <span class="cycle-calendar__legend-text">
                  <strong>{{ item.label }}</strong>
                  <span v-if="item.description" class="cycle-calendar__legend-desc">
                    {{ item.description }}
                  </span>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <form
        v-if="showRulesForm && !compact"
        class="cycle-calendar__rules-form"
        @submit.prevent="onSubmitRulesDates"
      >
        <h4 class="cycle-calendar__legend-title">Renseigner le réel</h4>
        <label class="cycle-calendar__field">
          <span>Début des règles</span>
          <input v-model="rulesForm.dateDebutReglesReelle" type="date" />
        </label>
        <label class="cycle-calendar__field">
          <span>Fin des règles</span>
          <input v-model="rulesForm.dateFinReglesReelle" type="date" />
        </label>
        <p v-if="rulesError" class="cycle-calendar__rules-error">{{ rulesError }}</p>
        <button type="submit" class="cycle-calendar__rules-btn" :disabled="isSubmittingRules">
          {{ isSubmittingRules ? 'Validation…' : 'Valider les dates' }}
        </button>
      </form>
    </div>

    <section v-if="monthSummaries.length && !compact" class="cycle-calendar__periods">
      <h4 class="cycle-calendar__periods-title">Périodes ce mois</h4>
      <ul class="cycle-calendar__periods-list">
        <li
          v-for="(p, i) in monthSummaries"
          :key="`${p.cycleNum}-${p.kind}-${i}`"
          class="cycle-calendar__periods-item"
        >
          <span
            class="cycle-calendar__periods-swatch"
            :class="`cycle-calendar__bar cycle-calendar__bar--${p.kind}`"
          ></span>
          <div class="cycle-calendar__periods-body">
            <span class="cycle-calendar__periods-label">{{ p.title }}</span>
            <span class="cycle-calendar__periods-detail">{{ p.detail }}</span>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.cycle-calendar {
  --cal-regles-estime: #e79aae;
  --cal-regles-reel: #c45c7a;
  --cal-spm-estime: #7a5bb8;
  --cal-spm-reel: #d9782e;
  --cal-plaquette: #2ea98c;

  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.cycle-calendar--compact {
  gap: 0.8rem;
}

.cycle-calendar--compact .cycle-calendar__title {
  font-size: 1rem;
}

.cycle-calendar--compact .cal-nav-btn {
  width: 1.9rem;
  height: 1.9rem;
  font-size: 1.1rem;
}

.cycle-calendar--compact .cycle-calendar__cell {
  min-height: 2.5rem;
  padding: 0.15rem 0.2rem 0.1rem;
}

.cycle-calendar--compact .cycle-calendar__day-num {
  width: 1.25rem;
  height: 1.25rem;
  font-size: 0.72rem;
}

.cycle-calendar--compact .cycle-calendar__legend-list {
  grid-template-columns: 1fr;
  gap: 0.4rem;
}

.cycle-calendar--compact .cycle-calendar__legend-text {
  font-size: 0.78rem;
}

.cycle-calendar--compact .cycle-calendar__legend-desc {
  font-size: 0.71rem;
}

.cycle-calendar__nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.cycle-calendar__title-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.cycle-calendar__title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: #ad81be;
  text-transform: capitalize;
}

.cal-nav-btn {
  width: 2.25rem;
  height: 2.25rem;
  border: none;
  border-radius: 12px;
  background: rgba(213, 181, 234, 0.35);
  color: #ad81be;
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
  transition: background 0.2s ease;
}

.cal-nav-btn:hover {
  background: rgba(213, 181, 234, 0.55);
}

.cal-today-btn {
  border: none;
  background: none;
  padding: 0;
  font-size: 0.8rem;
  font-weight: 700;
  color: #c45c7a;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.cal-today-btn:hover {
  color: #ad81be;
}

.cycle-calendar__grid {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.cycle-calendar__weekdays,
.cycle-calendar__days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.cycle-calendar__weekday {
  text-align: center;
  font-size: 0.72rem;
  font-weight: 700;
  color: #6c757d;
  padding-bottom: 0.25rem;
}

.cycle-calendar__cell {
  min-height: 3.25rem;
  border-radius: 10px;
  padding: 0.2rem 0.25rem 0.15rem;
  background: rgba(255, 255, 255, 0.45);
  border: 1px solid transparent;
  display: flex;
  flex-direction: column;
}

.cycle-calendar__cell--empty {
  background: transparent;
  border: none;
  min-height: 0;
}

.cycle-calendar__cell--today {
  border-color: #ad81be;
  box-shadow: 0 0 0 1px rgba(173, 129, 190, 0.35);
}

.cycle-calendar__day-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.45rem;
  height: 1.45rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: #5d6d7e;
  line-height: 1.2;
  border-radius: 999px;
}

.cycle-calendar__day-num--ring-plaquette,
.cycle-calendar__day-num--ring-debut-plaquette {
  border: 2px solid var(--cal-plaquette);
}

.cycle-calendar__day-num--ring-debut-spm-estime {
  border: 2px dashed var(--cal-spm-estime);
}

.cycle-calendar__day-num--ring-fin-spm-estime {
  border: 2px solid var(--cal-spm-estime);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--cal-spm-estime) 35%, transparent);
}

.cycle-calendar__day-num--ring-debut-spm-reel {
  border: 2px dashed var(--cal-spm-reel);
}

.cycle-calendar__day-num--ring-fin-spm-reel {
  border: 2px solid var(--cal-spm-reel);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--cal-spm-reel) 35%, transparent);
}

.cycle-calendar__day-num--legend {
  width: 1.1rem;
  height: 1.1rem;
  font-size: 0;
}

.cycle-calendar__layers {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 2px;
  margin-top: 0.15rem;
  min-height: 1.1rem;
  position: relative;
}

.cycle-calendar__bar {
  display: block;
  height: 4px;
  border-radius: 3px;
  width: 100%;
}

.cycle-calendar__bar--comprimes-actifs {
  background: linear-gradient(90deg, #d5b5ea, #ad81be);
}

.cycle-calendar__bar--pause-plaquette {
  background: rgba(149, 209, 170, 0.55);
  border: 1px dashed rgba(149, 209, 170, 0.9);
  height: 3px;
}

.cycle-calendar__bar--spm-estime {
  background: color-mix(in srgb, var(--cal-spm-estime) 40%, transparent);
  border: 1px dashed var(--cal-spm-estime);
  height: 6px;
}

.cycle-calendar__bar--spm-reel {
  background: color-mix(in srgb, var(--cal-spm-reel) 40%, transparent);
  border: 1px dashed var(--cal-spm-reel);
  height: 6px;
}

.cycle-calendar__bar--regles-estime {
  background: color-mix(in srgb, var(--cal-regles-estime) 55%, transparent);
  border: 1px dashed var(--cal-regles-estime);
  height: 5px;
}

.cycle-calendar__bar--regles-reel {
  background: linear-gradient(90deg, var(--cal-regles-estime), var(--cal-regles-reel));
  border: 1px solid var(--cal-regles-reel);
  height: 5px;
}

.cycle-calendar__legend {
  padding-top: 0.5rem;
  border-top: 1px solid rgba(213, 181, 234, 0.25);
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  /* Largeur réelle de la carte (pas le viewport) pour décider 1 vs 3 colonnes */
  container-type: inline-size;
  container-name: cycle-legend;
}

.cycle-calendar__meta {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.cycle-calendar__rules-form {
  border-top: 1px solid rgba(213, 181, 234, 0.25);
  padding-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.cycle-calendar__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.cycle-calendar__field span {
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #ad81be;
}

.cycle-calendar__field input {
  padding: 0.45rem 0.55rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.8);
  color: #2c3e50;
  font-family: inherit;
}

.cycle-calendar__rules-btn {
  border: none;
  border-radius: 10px;
  padding: 0.55rem 0.75rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  cursor: pointer;
}

.cycle-calendar__rules-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.cycle-calendar__rules-error {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 600;
  color: #c0392b;
}

.cycle-calendar__legend-title,
.cycle-calendar__periods-title {
  margin: 0 0 0.6rem;
  font-size: 0.9rem;
  font-weight: 700;
  color: #5d6d7e;
}

.cycle-calendar__legend-groups {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.cycle-calendar__legend-group {
  margin-bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}

.cycle-calendar__legend-group-title {
  display: block;
  margin: 0 0 0.4rem;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #ad81be;
  width: 100%;
  min-width: 0;
  overflow-wrap: normal;
  word-break: normal;
}

.cycle-calendar__legend-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.5rem 1rem;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.cycle-calendar__legend-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  min-width: 0;
}

.cycle-calendar__legend-swatch {
  flex-shrink: 0;
  width: 2rem;
  margin-top: 0.15rem;
}

.cycle-calendar__legend-text {
  display: flex;
  flex-direction: column;
  font-size: 0.82rem;
  color: #5d6d7e;
  min-width: 0;
  flex: 1 1 auto;
  overflow-wrap: break-word;
  word-break: normal;
}

.cycle-calendar__legend-text strong {
  color: #2c3e50;
  font-weight: 700;
  overflow-wrap: normal;
}

.cycle-calendar__legend-desc {
  font-size: 0.75rem;
  color: #6c757d;
}

.cycle-calendar__periods {
  padding-top: 0.25rem;
}

.cycle-calendar__periods-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.cycle-calendar__periods-item {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.5rem 0.65rem;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(213, 181, 234, 0.2);
}

.cycle-calendar__periods-swatch {
  width: 2rem;
  flex-shrink: 0;
  margin-top: 0.2rem;
}

.cycle-calendar__periods-body {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  font-size: 0.85rem;
}

.cycle-calendar__periods-label {
  font-weight: 700;
  color: #2c3e50;
}

.cycle-calendar__periods-detail {
  color: #6c757d;
  font-size: 0.8rem;
}

@media (prefers-color-scheme: dark) {
  .cycle-calendar__title {
    color: #d5b5ea;
  }

  .cycle-calendar__cell {
    background: rgba(0, 0, 0, 0.2);
  }

  .cycle-calendar__day-num {
    color: #ced4da;
  }

  .cycle-calendar__legend-group-title {
    color: #d5b5ea;
  }

  .cycle-calendar__legend-text strong,
  .cycle-calendar__periods-label {
    color: #f0e8f8;
  }

  .cycle-calendar__periods-item {
    background: rgba(0, 0, 0, 0.2);
  }

  .cycle-calendar__field input {
    background: rgba(0, 0, 0, 0.2);
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.2);
  }
}

/* 3 colonnes dès que la zone légende est assez large (colonne dashboard étroite ≠ viewport) */
@container cycle-legend (min-width: 360px) {
  .cycle-calendar__legend-groups {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.65rem 0.85rem;
    align-items: start;
    width: 100%;
    min-width: 0;
  }

  .cycle-calendar__legend-group {
    min-width: 0;
  }

  .cycle-calendar__legend-groups .cycle-calendar__legend-list,
  .cycle-calendar.cycle-calendar--compact .cycle-calendar__legend-groups .cycle-calendar__legend-list {
    grid-template-columns: 1fr;
    gap: 0.45rem;
    width: 100%;
    min-width: 0;
  }
}

@media (min-width: 880px) {
  .cycle-calendar__meta {
    grid-template-columns: minmax(0, 1fr) 280px;
    align-items: start;
  }

  /* Dashboard / compact : pas de formulaire à droite — ne pas réserver 280px vides */
  .cycle-calendar--compact .cycle-calendar__meta {
    grid-template-columns: 1fr;
  }

  /* Vue complète sans formulaire : une seule colonne pour la légende pleine largeur */
  .cycle-calendar__meta:not(:has(.cycle-calendar__rules-form)) {
    grid-template-columns: 1fr;
  }
}
</style>
