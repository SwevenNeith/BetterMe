<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../../lib/supabase.js'
import { resolveSessionUser } from '../../utils/auth/sessionUser.js'
import { batteryPriorityMeta } from '../../constants/battery/battery.js'
import {
  allDayEventsForDay,
  loadHistoryEdtWeekContext,
  timedEventsForDay,
} from '../../services/battery/batteryHistoryEdt.js'
import {
  WEEK_GRID_HOUR_HEIGHT_PX,
  buildWeekDays,
  categoryColorStyle,
  formatDateToLocalISO,
  getIsoWeekNumber,
  positionEventsForDay,
} from '../../utils/timetable/weekGridLayout.js'

defineOptions({ name: 'BatteryHistoryEdtWeek' })

const props = defineProps({
  /** Date de référence pour conserver le contexte (query.date Batterie). */
  anchorDate: { type: String, default: '' },
})

const router = useRouter()

/** @type {import('vue').Ref<'planned'|'actual'>} */
const edtMode = ref('planned')
const currentDate = ref(new Date())
const selectedDayIndex = ref(
  new Date().getDay() === 0 ? 6 : new Date().getDay() - 1,
)
const isLoading = ref(false)
const loadError = ref('')
const categories = ref([])
const plannedEvents = ref([])
const actualEvents = ref([])
const gridViewport = ref(null)
const mobileGridViewport = ref(null)

const hourHeight = WEEK_GRID_HOUR_HEIGHT_PX
const dayGridStyle = {
  '--hour-height': `${WEEK_GRID_HOUR_HEIGHT_PX}px`,
  '--day-grid-height': `${WEEK_GRID_HOUR_HEIGHT_PX * 24}px`,
}

const weekDays = computed(() => buildWeekDays(currentDate.value))
const weekNumber = computed(() => getIsoWeekNumber(currentDate.value))

const currentMonthYearString = computed(() => {
  const firstDay = weekDays.value[0].date
  const lastDay = weekDays.value[6].date
  const firstMonth = firstDay.toLocaleDateString('fr-FR', { month: 'long' })
  const lastMonth = lastDay.toLocaleDateString('fr-FR', { month: 'long' })
  const firstYear = firstDay.getFullYear()
  const lastYear = lastDay.getFullYear()
  if (firstYear !== lastYear) {
    return `${firstMonth} ${firstYear} - ${lastMonth} ${lastYear}`
  }
  if (firstMonth !== lastMonth) {
    return `${firstMonth} - ${lastMonth} ${firstYear}`
  }
  return `${firstMonth} ${firstYear}`
})

const activeEvents = computed(() =>
  edtMode.value === 'planned' ? plannedEvents.value : actualEvents.value,
)

const hasAllDayEvents = computed(() => {
  for (let i = 0; i < 7; i++) {
    if (getAllDayForDay(i).length) return true
  }
  return false
})

const modeHint = computed(() =>
  edtMode.value === 'planned'
    ? 'Emploi du temps prévu (comme sur la page EDT).'
    : 'Ce que tu as réellement fait (activités Batterie marquées comme faites).',
)

function formatHour(hour) {
  if (hour === 0) return ''
  return `${String(hour).padStart(2, '0')}:00`
}

function findCategory(categoryIdOrName) {
  if (!categoryIdOrName) return null
  return categories.value.find(
    (c) =>
      c.id === categoryIdOrName ||
      c.name?.toLowerCase() === String(categoryIdOrName).toLowerCase(),
  )
}

function getCategoryIcon(categoryIdOrName) {
  return findCategory(categoryIdOrName)?.icon || '📅'
}

function getCategoryName(categoryIdOrName) {
  return findCategory(categoryIdOrName)?.name || ''
}

function getCategoryStyle(categoryIdOrName) {
  const cat = findCategory(categoryIdOrName)
  return categoryColorStyle(cat?.color)
}

function eventPriorityShort(id) {
  const meta = batteryPriorityMeta(id)
  if (!meta) return ''
  return String(meta.label || id).slice(0, 2)
}

function dayIsoAt(idx) {
  return formatDateToLocalISO(weekDays.value[idx].date)
}

function getTimedForDay(dayIdx) {
  return timedEventsForDay(activeEvents.value, dayIsoAt(dayIdx))
}

function getAllDayForDay(dayIdx) {
  return allDayEventsForDay(activeEvents.value, dayIsoAt(dayIdx))
}

function getPositionedForDay(dayIdx) {
  return positionEventsForDay(getTimedForDay(dayIdx), { hourHeight })
}

function scrollToStartingHour() {
  const top = 8.5 * hourHeight
  if (gridViewport.value) gridViewport.value.scrollTop = top
  if (mobileGridViewport.value) mobileGridViewport.value.scrollTop = top
}

function prevWeek() {
  const prev = new Date(currentDate.value)
  prev.setDate(currentDate.value.getDate() - 7)
  currentDate.value = prev
}

function nextWeek() {
  const next = new Date(currentDate.value)
  next.setDate(currentDate.value.getDate() + 7)
  currentDate.value = next
}

function resetToToday() {
  currentDate.value = new Date()
  selectedDayIndex.value = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1
}

function setMode(mode) {
  edtMode.value = mode
}

function openEvent(event) {
  const dayIso =
    event?._batteryDay ||
    String(event?.date_start || '').slice(0, 10) ||
    dayIsoAt(selectedDayIndex.value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayIso)) return
  router.push({ name: 'battery', query: { date: dayIso } })
}

async function loadWeek() {
  isLoading.value = true
  loadError.value = ''
  try {
    const user = await resolveSessionUser()
    if (!user) {
      plannedEvents.value = []
      actualEvents.value = []
      return
    }
    const ctx = await loadHistoryEdtWeekContext(supabase, user.id, currentDate.value)
    categories.value = ctx.categories
    plannedEvents.value = ctx.plannedEvents
    actualEvents.value = ctx.actualEvents
  } catch (err) {
    console.error(err)
    loadError.value = 'Impossible de charger la semaine EDT.'
    plannedEvents.value = []
    actualEvents.value = []
  } finally {
    isLoading.value = false
    await nextTick()
    scrollToStartingHour()
  }
}

watch(currentDate, () => {
  void loadWeek()
})

watch(selectedDayIndex, () => {
  setTimeout(scrollToStartingHour, 50)
})

onMounted(() => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(props.anchorDate)) {
    const [y, m, d] = props.anchorDate.split('-').map(Number)
    currentDate.value = new Date(y, m - 1, d)
    selectedDayIndex.value =
      currentDate.value.getDay() === 0 ? 6 : currentDate.value.getDay() - 1
  }
  void loadWeek()
})
</script>

<template>
  <div class="edt-week">
    <div class="mode-row" role="group" aria-label="Type d’EDT">
      <button
        type="button"
        class="mode-chip"
        :class="{ 'is-active': edtMode === 'planned' }"
        @click="setMode('planned')"
      >
        EDT prévu
      </button>
      <button
        type="button"
        class="mode-chip"
        :class="{ 'is-active': edtMode === 'actual' }"
        @click="setMode('actual')"
      >
        EDT réel
      </button>
    </div>
    <p class="mode-hint">{{ modeHint }}</p>

    <div class="calendar-controls">
      <div class="navigation-group">
        <button type="button" class="nav-arrow" aria-label="Semaine précédente" @click="prevWeek">
          ‹
        </button>
        <div class="week-title-wrapper">
          <span class="week-badge-title">Semaine {{ weekNumber }}</span>
          <span class="week-date-span">{{ currentMonthYearString }}</span>
        </div>
        <button type="button" class="nav-arrow" aria-label="Semaine suivante" @click="nextWeek">
          ›
        </button>
      </div>
      <button type="button" class="today-btn" @click="resetToToday">Aujourd'hui</button>
    </div>

    <p v-if="loadError" class="flash flash--error">{{ loadError }}</p>
    <p v-else-if="isLoading" class="flash">Chargement de la semaine…</p>

    <div class="timetable-card" :class="{ 'is-dimmed': isLoading }">
      <div class="day-tabs">
        <button
          v-for="(day, idx) in weekDays"
          :key="idx"
          type="button"
          class="day-tab"
          :class="{
            'day-tab--active': selectedDayIndex === idx,
            'day-tab--today': day.isToday,
          }"
          @click="selectedDayIndex = idx"
        >
          <span class="day-tab-name">{{ day.shortName }}</span>
          <span class="day-tab-number">{{ day.dayOfMonth }}</span>
        </button>
      </div>

      <div class="weekly-grid-desktop">
        <div class="grid-header-row">
          <div class="time-header-spacer"></div>
          <div class="day-headers-container">
            <div
              v-for="(day, idx) in weekDays"
              :key="idx"
              class="grid-day-header"
              :class="{ 'grid-day-header--today': day.isToday }"
            >
              <span class="desktop-day-name">{{ day.name }}</span>
              <span class="desktop-day-number">{{ day.dayOfMonth }}</span>
            </div>
          </div>
        </div>

        <div v-if="hasAllDayEvents" class="all-day-row">
          <div class="time-header-spacer all-day-label">Journée</div>
          <div class="all-day-columns-container">
            <div v-for="(day, idx) in weekDays" :key="idx" class="all-day-column-slot">
              <button
                v-for="event in getAllDayForDay(idx)"
                :key="event.id"
                type="button"
                class="all-day-event-bar"
                :style="getCategoryStyle(event.category)"
                :title="event.title"
                @click="openEvent(event)"
              >
                <span class="all-day-event-icon">{{ getCategoryIcon(event.category) }}</span>
                <span class="all-day-event-title">{{ event.title }}</span>
              </button>
            </div>
          </div>
        </div>

        <div ref="gridViewport" class="grid-scroll-viewport">
          <div class="weekly-timetable-grid" :style="dayGridStyle">
            <div class="time-axis">
              <div v-for="hour in 24" :key="hour" class="time-hour-slot">
                <span class="time-label">{{ formatHour(hour - 1) }}</span>
              </div>
            </div>
            <div class="grid-columns-container">
              <div
                v-for="(day, idx) in weekDays"
                :key="idx"
                class="grid-day-column"
                :class="{ 'grid-day-column--today': day.isToday }"
              >
                <div class="grid-hour-lines">
                  <div v-for="hour in 24" :key="hour" class="grid-hour-line"></div>
                </div>
                <div class="grid-events-layer">
                  <button
                    v-for="event in getPositionedForDay(idx)"
                    :key="event.id"
                    type="button"
                    class="event-block"
                    :class="event.isShort ? 'event-block--short' : 'event-block--tall'"
                    :style="[getCategoryStyle(event.category), event.positionStyle]"
                    :title="[event.timeRangeLabel, event.title, getCategoryName(event.category)]
                      .filter(Boolean)
                      .join(' — ')"
                    @click="openEvent(event)"
                  >
                    <div class="event-content">
                      <div v-if="event.isVeryShort" class="event-main-line event-main-line--very-short">
                        <h4 class="event-title">{{ event.title }}</h4>
                      </div>
                      <template v-else-if="event.isShort">
                        <div class="event-main-line">
                          <span class="event-time">{{ event.timeStartLabel }}</span>
                          <h4 class="event-title">{{ event.title }}</h4>
                        </div>
                      </template>
                      <template v-else>
                        <span class="event-time">{{ event.timeRangeLabel }}</span>
                        <h4 class="event-title">{{ event.title }}</h4>
                        <span v-if="getCategoryName(event.category)" class="event-category">
                          {{ getCategoryName(event.category) }}
                        </span>
                        <span
                          v-if="event.priority"
                          class="event-priority"
                          :title="batteryPriorityMeta(event.priority)?.label"
                        >
                          {{ eventPriorityShort(event.priority) }}
                        </span>
                      </template>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="weekly-grid-mobile">
        <div class="mobile-day-heading">
          {{ weekDays[selectedDayIndex].name }}
          {{ weekDays[selectedDayIndex].dayOfMonth }}
        </div>
        <div v-if="getAllDayForDay(selectedDayIndex).length" class="mobile-all-day">
          <button
            v-for="event in getAllDayForDay(selectedDayIndex)"
            :key="event.id"
            type="button"
            class="all-day-event-bar"
            :style="getCategoryStyle(event.category)"
            @click="openEvent(event)"
          >
            <span class="all-day-event-icon">{{ getCategoryIcon(event.category) }}</span>
            <span class="all-day-event-title">{{ event.title }}</span>
          </button>
        </div>
        <div ref="mobileGridViewport" class="grid-scroll-viewport grid-scroll-viewport--mobile">
          <div class="weekly-timetable-grid" :style="dayGridStyle">
            <div class="time-axis">
              <div v-for="hour in 24" :key="hour" class="time-hour-slot">
                <span class="time-label">{{ formatHour(hour - 1) }}</span>
              </div>
            </div>
            <div class="grid-columns-container grid-columns-container--single">
              <div
                class="grid-day-column"
                :class="{ 'grid-day-column--today': weekDays[selectedDayIndex].isToday }"
              >
                <div class="grid-hour-lines">
                  <div v-for="hour in 24" :key="hour" class="grid-hour-line"></div>
                </div>
                <div class="grid-events-layer">
                  <button
                    v-for="event in getPositionedForDay(selectedDayIndex)"
                    :key="event.id"
                    type="button"
                    class="event-block"
                    :class="event.isShort ? 'event-block--short' : 'event-block--tall'"
                    :style="[getCategoryStyle(event.category), event.positionStyle]"
                    @click="openEvent(event)"
                  >
                    <div class="event-content">
                      <div v-if="event.isShort" class="event-main-line">
                        <span class="event-time">{{ event.timeStartLabel }}</span>
                        <h4 class="event-title">{{ event.title }}</h4>
                      </div>
                      <template v-else>
                        <span class="event-time">{{ event.timeRangeLabel }}</span>
                        <h4 class="event-title">{{ event.title }}</h4>
                      </template>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.edt-week {
  position: relative;
  z-index: 1;
  width: 100%;
}

.mode-row {
  display: flex;
  gap: 0.4rem;
  padding: 0.28rem;
  border-radius: 12px;
  background: rgba(143, 162, 212, 0.14);
  border: 1px solid rgba(143, 162, 212, 0.28);
  margin-bottom: 0.55rem;
}

.mode-chip {
  flex: 1;
  border: none;
  border-radius: 9px;
  padding: 0.5rem 0.65rem;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 700;
  color: #6c757d;
  background: transparent;
  cursor: pointer;
}

.mode-chip.is-active {
  background: rgba(255, 255, 255, 0.92);
  color: #5b8def;
  box-shadow: 0 2px 6px rgba(91, 141, 239, 0.14);
}

.mode-hint {
  margin: 0 0 0.85rem;
  font-size: 0.88rem;
  color: #6c757d;
  line-height: 1.4;
}

.calendar-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.9rem;
}

.navigation-group {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.nav-arrow {
  width: 2.1rem;
  height: 2.1rem;
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.75);
  color: #6b4f7c;
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
}

.week-title-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 9rem;
}

.week-badge-title {
  font-weight: 800;
  color: #2c3e50;
  font-size: 0.98rem;
}

.week-date-span {
  font-size: 0.78rem;
  color: #8a9098;
  text-transform: capitalize;
}

.today-btn {
  border: none;
  border-radius: 10px;
  padding: 0.45rem 0.85rem;
  font: inherit;
  font-weight: 700;
  font-size: 0.88rem;
  color: #5a3d6e;
  background: rgba(173, 129, 190, 0.22);
  cursor: pointer;
}

.flash {
  margin: 0 0 0.75rem;
  text-align: center;
  color: #6c757d;
}

.flash--error {
  color: #c45c5c;
  font-weight: 600;
}

.timetable-card {
  background: rgba(255, 255, 255, 0.68);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 18px;
  overflow: hidden;
  transition: opacity 0.2s ease;
}

.timetable-card.is-dimmed {
  opacity: 0.65;
}

.day-tabs {
  display: none;
  gap: 0.35rem;
  padding: 0.65rem 0.65rem 0.35rem;
  overflow-x: auto;
}

.day-tab {
  flex: 1;
  min-width: 3.2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  border: none;
  border-radius: 12px;
  padding: 0.45rem 0.3rem;
  background: transparent;
  cursor: pointer;
  color: #6c757d;
  font: inherit;
}

.day-tab--active {
  background: rgba(173, 129, 190, 0.18);
  color: #5a3d6e;
}

.day-tab--today .day-tab-number {
  color: #3d9a6a;
  font-weight: 800;
}

.day-tab-name {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
}

.day-tab-number {
  font-size: 1rem;
  font-weight: 800;
}

.grid-header-row {
  display: flex;
  border-bottom: 1px solid rgba(213, 181, 234, 0.2);
  padding: 0.55rem 0.5rem 0.45rem;
}

.time-header-spacer {
  width: 60px;
  flex-shrink: 0;
}

.day-headers-container {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.75rem;
}

.grid-day-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
}

.grid-day-header--today .desktop-day-number {
  color: #3d9a6a;
}

.desktop-day-name {
  font-size: 0.72rem;
  font-weight: 700;
  color: #8a9098;
  text-transform: uppercase;
}

.desktop-day-number {
  font-size: 1.05rem;
  font-weight: 800;
  color: #2c3e50;
}

.all-day-row {
  display: flex;
  gap: 0;
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid rgba(213, 181, 234, 0.15);
  min-height: 2.4rem;
}

.all-day-label {
  display: flex;
  align-items: center;
  font-size: 0.68rem;
  font-weight: 700;
  color: #8a9098;
  text-transform: uppercase;
}

.all-day-columns-container {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.75rem;
}

.all-day-column-slot {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.all-day-event-bar {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  width: 100%;
  border: none;
  border-radius: 8px;
  padding: 0.28rem 0.4rem;
  font: inherit;
  cursor: pointer;
  text-align: left;
  min-width: 0;
}

.all-day-event-icon {
  flex-shrink: 0;
  font-size: 0.8rem;
}

.all-day-event-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.78rem;
  font-weight: 700;
}

.grid-scroll-viewport {
  height: min(62vh, 640px);
  overflow: auto;
  padding: 0 0.5rem 0.5rem;
}

.weekly-timetable-grid {
  display: flex;
  position: relative;
  width: 100%;
  height: var(--day-grid-height, 1440px);
}

.time-axis {
  width: 60px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(213, 181, 234, 0.15);
}

.time-hour-slot {
  height: var(--hour-height, 60px);
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding-right: 0.6rem;
  box-sizing: border-box;
}

.time-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: #72a098;
  transform: translateY(-7px);
}

.grid-columns-container {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.75rem;
  position: relative;
  height: 100%;
}

.grid-columns-container--single {
  grid-template-columns: 1fr;
}

.grid-day-column {
  position: relative;
  height: 100%;
  border-right: 1px solid rgba(213, 181, 234, 0.08);
}

.grid-day-column:last-child {
  border-right: none;
}

.grid-day-column--today {
  background: rgba(149, 209, 170, 0.03);
}

.grid-hour-lines {
  position: absolute;
  inset: 0;
}

.grid-hour-line {
  height: var(--hour-height, 60px);
  border-bottom: 1px dashed rgba(213, 181, 234, 0.08);
  box-sizing: border-box;
}

.grid-events-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.event-block {
  box-sizing: border-box;
  border-radius: 10px;
  padding: 0.28rem 0.4rem 0.26rem 0.42rem;
  cursor: pointer;
  z-index: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  pointer-events: auto;
  min-width: 0;
  border: none;
  font: inherit;
  text-align: left;
}

.event-content {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  height: 100%;
  gap: 0.1rem;
  overflow: hidden;
}

.event-block--short .event-content {
  justify-content: center;
}

.event-main-line {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
}

.event-time {
  font-size: 0.68rem;
  font-weight: 700;
  opacity: 0.85;
  white-space: nowrap;
}

.event-title {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 800;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.event-category {
  font-size: 0.68rem;
  font-weight: 600;
  opacity: 0.8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-priority {
  font-size: 0.65rem;
  font-weight: 800;
  opacity: 0.75;
}

.weekly-grid-mobile {
  display: none;
}

.mobile-day-heading {
  padding: 0.55rem 0.85rem 0.25rem;
  font-weight: 800;
  color: #2c3e50;
}

.mobile-all-day {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.35rem 0.65rem;
}

@media (max-width: 900px) {
  .weekly-grid-desktop {
    display: none;
  }

  .day-tabs,
  .weekly-grid-mobile {
    display: block;
  }

  .day-tabs {
    display: flex;
  }

  .grid-scroll-viewport--mobile {
    height: min(58vh, 560px);
  }
}

@media (prefers-color-scheme: dark) {
  .mode-chip.is-active {
    background: rgba(35, 30, 48, 0.9);
    color: #9db7f0;
  }

  .week-badge-title,
  .desktop-day-number,
  .mobile-day-heading,
  .event-title {
    color: #f0e8f8;
  }

  .mode-hint,
  .week-date-span,
  .desktop-day-name,
  .flash {
    color: #adb5bd;
  }

  .timetable-card,
  .nav-arrow {
    background: rgba(35, 30, 48, 0.78);
    border-color: rgba(213, 181, 234, 0.22);
  }

  .nav-arrow {
    color: #c9b0d8;
  }

  .today-btn {
    background: rgba(173, 129, 190, 0.35);
    color: #e8d4f0;
  }

  .day-tab--active {
    background: rgba(173, 129, 190, 0.22);
    color: #e8d4f0;
  }
}
</style>
