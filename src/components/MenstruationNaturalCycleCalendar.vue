<script setup>
import { ref, computed, watch } from 'vue'
import { getLocalTodayISO } from '../services/scheduledReminders.js'
import { determinePhaseNaturel, COL_NATUREL } from '../services/menstruationCyclesNaturel.js'
import { addDaysToISODate } from '../services/menstruationCycles.js'
import { getCurrentCycle } from '../services/menstruationSymptomEnrichment.js'
import { TYPE_CYCLE } from '../services/menstruationSymptoms.js'
import {
  buildCalendarDataFromNaturalCycles,
  buildDayIndex,
  getMonthGrid,
  legendForNatural,
  legendSwatchClassesNatural,
} from '../services/menstruationCalendarNaturel.js'

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

function getTodayViewParts() {
  const [y, m] = getLocalTodayISO().split('-').map(Number)
  return { year: y, month: m - 1 }
}

const todayView = getTodayViewParts()
const viewYear = ref(todayView.year)
const viewMonth = ref(todayView.month)

const calendarData = computed(() => buildCalendarDataFromNaturalCycles(props.cycles))
const dayIndex = computed(() => buildDayIndex(calendarData.value.segments, calendarData.value.markers))

const monthTitle = computed(() => {
  const d = new Date(viewYear.value, viewMonth.value, 1)
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
})

const gridCells = computed(() => getMonthGrid(viewYear.value, viewMonth.value))
const legendGroups = computed(() => legendForNatural())

const editableCycle = computed(() =>
  getCurrentCycle(props.cycles, todayISO, TYPE_CYCLE.NATUREL),
)

const rulesForm = ref({
  dateDebutRegles: '',
  dateFinReglesReelle: '',
})

watch(
  () => editableCycle.value,
  (cycle) => {
    if (!cycle) {
      rulesForm.value.dateDebutRegles = ''
      rulesForm.value.dateFinReglesReelle = ''
      return
    }
    rulesForm.value.dateDebutRegles = cycle[COL_NATUREL.dateDebutRegles] || ''
    rulesForm.value.dateFinReglesReelle = cycle[COL_NATUREL.dateFinReglesReelle] || ''
  },
  { immediate: true },
)

function onSubmitRulesDates() {
  if (!editableCycle.value) return
  emit('submit-rules-dates', {
    cycleId: editableCycle.value.id,
    dateDebutRegles: rulesForm.value.dateDebutRegles || null,
    dateFinReglesReelle: rulesForm.value.dateFinReglesReelle || null,
  })
}

function phaseLabel(phase) {
  if (phase === 'folliculaire') return 'Folliculaire'
  if (phase === 'ovulatoire') return 'Ovulatoire'
  if (phase === 'lutéale') return 'Lutéale'
  return ''
}

function getCycleForDay(iso) {
  if (!iso || !props.cycles?.length) return null
  // Cycles triés par numéro_cycle asc (listCyclesNaturel) : on garde le dernier start <= iso
  let candidate = null
  for (const c of props.cycles) {
    const start = c?.[COL_NATUREL.dateDebutRegles]
    if (!start) continue
    if (start <= iso) candidate = c
    else break
  }
  return candidate
}

function phaseForDay(iso) {
  const c = getCycleForDay(iso)
  if (!c) return null
  const start = c[COL_NATUREL.dateDebutRegles]
  const dureeCycle = c[COL_NATUREL.dureeCycle]
  const dureeRegles = c[COL_NATUREL.dureeRegles]
  const phase = determinePhaseNaturel({ dateDebutRegles: start, dureeCycle, dureeRegles }, iso)
  // Pas besoin d'afficher "menstruelle"
  if (!phase || phase === 'menstruelle') return null
  return phase
}

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
  const { year, month } = getTodayViewParts()
  viewYear.value = year
  viewMonth.value = month
}

function cellLayers(iso) {
  if (!iso) return { segments: [], markers: [] }
  const entry = dayIndex.value.get(iso)
  return entry || { segments: [], markers: [] }
}

function cellTooltip(iso) {
  const phase = phaseForDay(iso)
  const entry = dayIndex.value.get(iso)
  const lines = []
  if (phase) lines.push(`Phase : ${phaseLabel(phase)}`)
  if (entry?._segmentDetails) {
    for (const s of entry._segmentDetails) lines.push(`${s.label}: ${s.detail}`)
  }
  if (entry?._markerDetails) {
    for (const m of entry._markerDetails) lines.push(m.label)
  }
  return [...new Set(lines)].join('\n')
}

function dayCircleClasses(iso) {
  const markers = cellLayers(iso).markers
  const phase = phaseForDay(iso)
  const prevPhase = phase ? phaseForDay(addDaysToISODate(iso, -1)) : null
  const isPhaseStart = phase && prevPhase !== phase
  return {
    'nat-day-num--ring-ovulation': markers.includes('ovulation'),
    'nat-day-num--ring-next': markers.includes('prochaines-regles'),
    'nat-day-num--ring-phase-folliculaire': isPhaseStart && phase === 'folliculaire',
    'nat-day-num--ring-phase-ovulatoire': isPhaseStart && phase === 'ovulatoire',
    'nat-day-num--ring-phase-luteale': isPhaseStart && phase === 'lutéale',
  }
}

</script>

<template>
  <div class="nat-calendar" :class="{ 'nat-calendar--compact': compact }">
    <div class="nat-calendar__nav">
      <button type="button" class="nat-nav-btn" aria-label="Mois précédent" @click="prevMonth">‹</button>
      <div class="nat-calendar__title-wrap">
        <h3 class="nat-calendar__title">{{ monthTitle }}</h3>
        <button v-if="!compact" type="button" class="nat-today-btn" @click="goToToday">Aujourd’hui</button>
      </div>
      <button type="button" class="nat-nav-btn" aria-label="Mois suivant" @click="nextMonth">›</button>
    </div>

    <div class="nat-calendar__grid" role="grid" aria-label="Calendrier du cycle (naturel)">
      <div class="nat-calendar__weekdays" role="row">
        <span v-for="wd in WEEKDAYS" :key="wd" class="nat-calendar__weekday" role="columnheader">
          {{ wd }}
        </span>
      </div>
      <div class="nat-calendar__days">
        <div
          v-for="(cell, idx) in gridCells"
          :key="cell.iso ?? `pad-${idx}`"
          class="nat-calendar__cell"
          :class="{
            'nat-calendar__cell--empty': !cell.inMonth,
            'nat-calendar__cell--today': cell.iso === todayISO,
          }"
          role="gridcell"
          :aria-label="cell.inMonth ? cell.iso : undefined"
        >
          <template v-if="cell.inMonth">
            <span class="nat-calendar__day-num" :class="dayCircleClasses(cell.iso)">{{ cell.day }}</span>
            <div class="nat-calendar__layers" :title="cellTooltip(cell.iso)">
              <span
                v-for="kind in cellLayers(cell.iso).segments"
                :key="kind"
                class="nat-calendar__bar"
                :class="`nat-calendar__bar--${kind}`"
              ></span>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div class="nat-calendar__legend" aria-label="Légende du calendrier naturel">
      <h4 class="nat-legend__title">Légende</h4>
      <div class="nat-legend__groups">
        <div v-for="g in legendGroups" :key="g.id" class="nat-legend__group">
          <h5 class="nat-legend__group-title">{{ g.title }}</h5>
          <ul class="nat-legend__list">
            <li v-for="item in g.items" :key="item.kind" class="nat-legend__item">
              <span class="nat-legend__swatch" :class="legendSwatchClassesNatural(item)"></span>
              <span class="nat-legend__text">
                <strong>{{ item.label }}</strong>
                <span v-if="item.description" class="nat-legend__desc">{{ item.description }}</span>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <form
      v-if="showRulesForm && !compact && editableCycle"
      class="nat-calendar__rules-form"
      @submit.prevent="onSubmitRulesDates"
    >
      <h4 class="nat-legend__title">Renseigner le réel</h4>
      <p class="nat-calendar__rules-hint">
        Ces dates remplaceront l’estimé pour tes calculs (durée des règles, phases, etc.).
      </p>
      <div class="nat-calendar__field">
        <label>
          <span>Début des règles</span>
          <input v-model="rulesForm.dateDebutRegles" type="date" required />
        </label>
      </div>
      <div class="nat-calendar__field">
        <label>
          <span>Fin des règles</span>
          <input v-model="rulesForm.dateFinReglesReelle" type="date" />
        </label>
      </div>
      <p v-if="rulesError" class="nat-calendar__rules-error">{{ rulesError }}</p>
      <button type="submit" class="nat-calendar__rules-btn" :disabled="isSubmittingRules">
        {{ isSubmittingRules ? 'Validation…' : 'Valider les dates' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.nat-calendar {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.nat-calendar--compact {
  gap: 0.8rem;
}

.nat-calendar__nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.nat-calendar__title-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
}

.nat-calendar__title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: #ad81be;
  text-transform: capitalize;
}

.nat-nav-btn {
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

.nat-nav-btn:hover {
  background: rgba(213, 181, 234, 0.55);
}

.nat-today-btn {
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

.nat-calendar__grid {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.nat-calendar__weekdays,
.nat-calendar__days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.nat-calendar__weekday {
  text-align: center;
  font-size: 0.72rem;
  font-weight: 700;
  color: #6c757d;
  padding-bottom: 0.25rem;
}

.nat-calendar__cell {
  min-height: 3.25rem;
  border-radius: 10px;
  padding: 0.2rem 0.25rem 0.15rem;
  background: rgba(255, 255, 255, 0.45);
  border: 1px solid transparent;
  display: flex;
  flex-direction: column;
}

.nat-calendar__cell--empty {
  background: transparent;
  border: none;
  min-height: 0;
}

.nat-calendar__cell--today {
  border-color: #ad81be;
  box-shadow: 0 0 0 1px rgba(173, 129, 190, 0.35);
}

/* Phases (hors période menstruelle) : léger fond pour guider visuellement */
/* Phases : on n'entoure que le 1er jour de chaque phase (anneau) */
.nat-day-num--ring-phase-folliculaire {
  border: 2px solid #7a5bb8;
  box-shadow: 0 0 0 2px rgba(122, 91, 184, 0.12);
}

.nat-day-num--ring-phase-ovulatoire {
  border: 2px solid #2ea98c;
  box-shadow: 0 0 0 2px rgba(46, 169, 140, 0.12);
}

.nat-day-num--ring-phase-luteale {
  border: 2px solid #ad81be;
  box-shadow: 0 0 0 2px rgba(173, 129, 190, 0.12);
}

.nat-calendar__day-num {
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

.nat-day-num--ring-ovulation {
  border: 2px dashed #7a5bb8;
}

.nat-day-num--ring-next {
  border: 2px solid #c45c7a;
}

.nat-calendar__layers {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 2px;
  margin-top: 0.15rem;
  min-height: 1.1rem;
}

.nat-calendar__bar {
  display: block;
  height: 4px;
  border-radius: 3px;
  width: 100%;
}

.nat-calendar__bar--regles {
  background: color-mix(in srgb, #c45c7a 40%, transparent);
  border: 1px dashed #c45c7a;
  height: 5px;
}

.nat-calendar__bar--fenetre-fertile {
  background: color-mix(in srgb, #2ea98c 35%, transparent);
  border: 1px dashed #2ea98c;
  height: 5px;
}

.nat-calendar__legend {
  padding-top: 0.5rem;
  border-top: 1px solid rgba(213, 181, 234, 0.25);
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  /* Décision 1 vs 3 colonnes basée sur la largeur réelle du bloc */
  container-type: inline-size;
  container-name: nat-legend;
}

.nat-calendar__rules-form {
  border-top: 1px solid rgba(213, 181, 234, 0.25);
  padding-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.nat-calendar__rules-hint {
  margin: -0.25rem 0 0.4rem;
  font-size: 0.82rem;
  color: #6c757d;
}

.nat-calendar__field label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.nat-calendar__field span {
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #ad81be;
}

.nat-calendar__field input {
  padding: 0.45rem 0.55rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.8);
  color: #2c3e50;
  font-family: inherit;
}

.nat-calendar__rules-btn {
  border: none;
  border-radius: 10px;
  padding: 0.55rem 0.75rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  cursor: pointer;
}

.nat-calendar__rules-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.nat-calendar__rules-error {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 600;
  color: #c0392b;
}

.nat-legend__title {
  margin: 0 0 0.6rem;
  font-size: 0.9rem;
  font-weight: 700;
  color: #5d6d7e;
}

.nat-legend__groups {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
  min-width: 0;
}

/* 3 colonnes uniquement quand le conteneur est assez large (Dashboard peut être étroit) */
@container nat-legend (min-width: 520px) {
  .nat-legend__groups {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.65rem 0.95rem;
    align-items: start;
  }
}

.nat-legend__group {
  min-width: 0;
}

.nat-legend__group-title {
  margin: 0 0 0.4rem;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #ad81be;
  min-width: 0;
  white-space: normal;
  overflow-wrap: normal;
  word-break: normal;
}

.nat-legend__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.45rem;
}

.nat-legend__item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;
  min-width: 0;
}

.nat-legend__swatch {
  width: 100%;
  max-width: 100%;
}

.nat-legend__text {
  display: flex;
  flex-direction: column;
  font-size: 0.82rem;
  color: #5d6d7e;
  min-width: 0;
  width: 100%;
  overflow-wrap: normal;
  word-break: normal;
  hyphens: auto;
}

.nat-legend__text strong {
  color: #2c3e50;
  font-weight: 700;
}

.nat-legend__desc {
  font-size: 0.75rem;
  color: #6c757d;
}

.nat-legend-swatch {
  display: block;
  width: 100%;
  border-radius: 6px;
}

.nat-legend-swatch--regles {
  background: color-mix(in srgb, #c45c7a 40%, transparent);
  border: 1px dashed #c45c7a;
  height: 5px;
}

.nat-legend-swatch--fertile {
  background: color-mix(in srgb, #2ea98c 35%, transparent);
  border: 1px dashed #2ea98c;
  height: 5px;
}

.nat-legend-swatch--ovulation,
.nat-legend-swatch--next {
  /* Les marqueurs sont des anneaux : ne pas étirer sur toute la colonne */
  align-self: flex-start;
}

.nat-legend-swatch--ovulation {
  height: 14px;
  border-radius: 999px;
  border: 2px dashed #7a5bb8;
  background: transparent;
  width: 1.75rem;
}

.nat-legend-swatch--next {
  height: 14px;
  border-radius: 999px;
  border: 2px solid #c45c7a;
  background: transparent;
  width: 1.75rem;
}

.nat-legend-swatch--phase-folliculaire,
.nat-legend-swatch--phase-ovulatoire,
.nat-legend-swatch--phase-luteale {
  height: 14px;
  width: 1.75rem;
  border-radius: 999px;
  background: transparent;
}

.nat-legend-swatch--phase-folliculaire {
  border: 2px solid #7a5bb8;
}

.nat-legend-swatch--phase-ovulatoire {
  border: 2px solid #2ea98c;
}

.nat-legend-swatch--phase-luteale {
  border: 2px solid #ad81be;
}

@media (prefers-color-scheme: dark) {
  .nat-calendar__cell {
    background: rgba(0, 0, 0, 0.2);
  }
  .nat-calendar__day-num {
    color: #ced4da;
  }
  .nat-legend__title,
  .nat-legend__text {
    color: #c5b8d2;
  }
  .nat-legend__text strong {
    color: #f0e8f8;
  }
  .nat-calendar__weekday {
    color: #adb5bd;
  }
  .nat-calendar__rules-hint {
    color: #adb5bd;
  }
  .nat-calendar__field input {
    background: rgba(0, 0, 0, 0.2);
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.2);
  }
}
</style>

