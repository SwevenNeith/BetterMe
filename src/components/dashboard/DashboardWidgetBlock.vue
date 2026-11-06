<script setup>
import { defineAsyncComponent, computed } from 'vue'
import { DASHBOARD_WIDGET_IDS } from '../../constants/dashboard/dashboardWidgets.js'
import { isPinnedNoteWidgetId } from '../../constants/dashboard/dashboardPinnedNotes.js'

const MenstruationCycleCalendar = defineAsyncComponent(
  () => import('../menstruation/MenstruationCycleCalendar.vue'),
)
const MenstruationNaturalCycleCalendar = defineAsyncComponent(
  () => import('../menstruation/MenstruationNaturalCycleCalendar.vue'),
)
const DashboardEmotionalCheckin = defineAsyncComponent(
  () => import('./DashboardEmotionalCheckin.vue'),
)
const DashboardComfortImages = defineAsyncComponent(() => import('./DashboardComfortImages.vue'))
const DashboardWordOfTheDay = defineAsyncComponent(() => import('./DashboardWordOfTheDay.vue'))
const DashboardTodayTodos = defineAsyncComponent(() => import('./DashboardTodayTodos.vue'))
const DashboardHabitsAnnual = defineAsyncComponent(() => import('./DashboardHabitsAnnual.vue'))
const DashboardNotesGraph = defineAsyncComponent(() => import('./DashboardNotesGraph.vue'))
const DashboardDailyNote = defineAsyncComponent(() => import('./DashboardDailyNote.vue'))
const DashboardPinnedNote = defineAsyncComponent(() => import('./DashboardPinnedNote.vue'))
const DashboardReadingInProgress = defineAsyncComponent(
  () => import('./DashboardReadingInProgress.vue'),
)
const DashboardTelevisionInProgress = defineAsyncComponent(
  () => import('./DashboardTelevisionInProgress.vue'),
)
const DashboardActiveProjects = defineAsyncComponent(() => import('./DashboardActiveProjects.vue'))
const DashboardFinancesBreakdown = defineAsyncComponent(
  () => import('./DashboardFinancesBreakdown.vue'),
)
const DashboardBattery = defineAsyncComponent(() => import('./DashboardBattery.vue'))
const DashboardBatteryPlanned = defineAsyncComponent(
  () => import('./DashboardBatteryPlanned.vue'),
)

const props = defineProps({
  widgetId: {
    type: String,
    required: true,
  },
  userId: {
    type: String,
    default: null,
  },
  pin: {
    type: Object,
    default: null,
  },
  dateIso: {
    type: String,
    required: true,
  },
  formattedToday: {
    type: String,
    default: '',
  },
  userEvents: {
    type: Array,
    default: () => [],
  },
  isLoadingEvents: {
    type: Boolean,
    default: false,
  },
  getCategoryStyle: {
    type: Function,
    required: true,
  },
  getCategoryIcon: {
    type: Function,
    required: true,
  },
  getCategoryName: {
    type: Function,
    required: true,
  },
  isLoadingMenstruationBoard: {
    type: Boolean,
    default: false,
  },
  hasMenstruationCycleData: {
    type: Boolean,
    default: false,
  },
  menstruationMode: {
    type: String,
    default: null,
  },
  menstruationCycles: {
    type: Array,
    default: () => [],
  },
  menstruationCyclesNaturel: {
    type: Array,
    default: () => [],
  },
  patternMessage: {
    type: String,
    default: '',
  },
  savedToday: {
    type: Boolean,
    default: false,
  },
  statusMessage: {
    type: String,
    default: '',
  },
  saving: {
    type: Boolean,
    default: false,
  },
  asColumn: {
    type: Boolean,
    default: true,
  },
  checkinCompact: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['save-checkin', 'cancel-checkin'])

const IDS = DASHBOARD_WIDGET_IDS

const COLUMN_CLASS_BY_ID = {
  [IDS.COMFORT]: 'intro-column comfort-column',
  [IDS.DICTIONARY_WORD]: 'dictionary-word-column',
  [IDS.TODO]: 'todo-column',
  [IDS.BATTERY_PLANNED]: 'battery-planned-column',
  [IDS.TIMETABLE]: 'edt-column',
  [IDS.CHECKIN]: 'checkin-column',
  [IDS.DAILY_NOTE]: 'daily-note-column',
  [IDS.MENSTRUATION]: 'menstruation-column right-column',
  [IDS.FINANCES]: 'finances-column right-column',
  [IDS.HABITS]: 'habits-column',
  [IDS.BATTERY]: 'battery-column right-column',
  [IDS.NOTES_GRAPH]: 'notes-graph-column',
  [IDS.READING_IN_PROGRESS]: 'reading-column',
  [IDS.TELEVISION_IN_PROGRESS]: 'television-column',
  [IDS.PROJECTS]: 'projects-column',
}

function rootClass(widgetId, asColumn) {
  if (!asColumn) return 'dashboard-widget-inner'
  if (isPinnedNoteWidgetId(widgetId)) {
    return ['dashboard-column', 'pinned-note-column']
  }
  return ['dashboard-column', COLUMN_CLASS_BY_ID[widgetId] || `${widgetId}-column`]
}

const timedEvents = computed(() =>
  props.userEvents.filter((ev) => ev.startDecimal >= 0 && ev.endDecimal >= 0)
)

const allDayEvents = computed(() =>
  props.userEvents.filter((ev) => ev.startDecimal < 0)
)

const timelineStart = computed(() => {
  if (timedEvents.value.length === 0) return 8
  const minStart = Math.min(...timedEvents.value.map((ev) => ev.startDecimal))
  return Math.max(0, Math.floor(minStart) - 1)
})

const timelineEnd = computed(() => {
  if (timedEvents.value.length === 0) return 18
  const maxEnd = Math.max(...timedEvents.value.map((ev) => ev.endDecimal))
  return Math.min(24, Math.ceil(maxEnd) + 1)
})

const timelineHours = computed(() => {
  const hours = []
  for (let h = timelineStart.value; h <= timelineEnd.value; h++) {
    hours.push(h)
  }
  return hours
})

function formatTimeShort(decimal) {
  const h = Math.floor(decimal)
  const m = Math.round((decimal - h) * 60)
  return `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}`
}
</script>

<template>
  <div :class="rootClass(widgetId, asColumn)">
    <DashboardPinnedNote
      v-if="isPinnedNoteWidgetId(widgetId)"
      :user-id="userId"
      :widget-id="widgetId"
      :pin="pin"
    />

    <DashboardComfortImages v-else-if="widgetId === IDS.COMFORT" :user-id="userId" />

    <DashboardWordOfTheDay
      v-else-if="widgetId === IDS.DICTIONARY_WORD"
      :user-id="userId"
    />

    <DashboardTodayTodos
      v-else-if="widgetId === IDS.TODO"
      :user-id="userId"
      :date-iso="dateIso"
    />

    <DashboardBatteryPlanned
      v-else-if="widgetId === IDS.BATTERY_PLANNED"
      :user-id="userId"
      :date-iso="dateIso"
    />

    <template v-else-if="widgetId === IDS.TIMETABLE">
      <h2 class="column-title">
        <span>Aujourd'hui</span>
        <span class="column-date">{{ formattedToday }}</span>
      </h2>
      <div class="today-events-container">
        <div v-if="isLoadingEvents" class="loading-state">
          <span class="spinner"></span> Chargement de ton planning...
        </div>
        <div v-else-if="userEvents.length === 0" class="empty-state">
          <span class="empty-icon">☕</span>
          <p>Aucun événement prévu aujourd'hui. Profite de ton temps libre !</p>
        </div>
        <div v-else class="today-timeline">
          <div v-if="allDayEvents.length > 0" class="all-day-section all-day-section--top">
            <div
              v-for="event in allDayEvents"
              :key="event.id"
              class="all-day-event-pill"
              :style="getCategoryStyle(event.category)"
            >
              <span class="all-day-icon">{{ getCategoryIcon(event.category) }}</span>
              <span class="all-day-title">{{ event.title }}</span>
            </div>
          </div>
          <div class="timeline-wrapper">
            <div class="timeline-axis">
              <div
                v-for="hour in timelineHours"
                :key="hour"
                class="timeline-hour-mark"
                :style="{ top: `${((hour - timelineStart) / (timelineEnd - timelineStart)) * 100}%` }"
              >
                <span class="timeline-hour-label">{{ hour }}h</span>
              </div>
            </div>
            <div class="timeline-events">
              <div
                v-for="event in timedEvents"
                :key="event.id"
                class="timeline-event-block"
                :style="{
                  ...getCategoryStyle(event.category),
                  top: `${((event.startDecimal - timelineStart) / (timelineEnd - timelineStart)) * 100}%`,
                  height: `${Math.max(((event.endDecimal - event.startDecimal) / (timelineEnd - timelineStart)) * 100, 8)}%`,
                }"
                :title="`${event.time} — ${event.title}`"
              >
                <span class="timeline-event-time">{{ formatTimeShort(event.startDecimal) }}</span>
                <span class="timeline-event-title">{{ event.title }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <DashboardEmotionalCheckin
      v-else-if="widgetId === IDS.CHECKIN"
      :compact="checkinCompact"
      show-footer
      show-note
      :pattern-message="patternMessage"
      :saved-today="savedToday"
      :status-message="statusMessage"
      :saving="saving"
      @save="$emit('save-checkin', $event)"
      @cancel="$emit('cancel-checkin')"
    />

    <DashboardDailyNote v-else-if="widgetId === IDS.DAILY_NOTE" :user-id="userId" />

    <DashboardFinancesBreakdown v-else-if="widgetId === IDS.FINANCES" :user-id="userId" />

    <DashboardBattery v-else-if="widgetId === IDS.BATTERY" :user-id="userId" />

    <DashboardHabitsAnnual v-else-if="widgetId === IDS.HABITS" :user-id="userId" />

    <DashboardNotesGraph v-else-if="widgetId === IDS.NOTES_GRAPH" :user-id="userId" />

    <div
      v-else-if="widgetId === IDS.MENSTRUATION"
      class="mini-calendar-wrapper dashboard-menstruation-wrap"
    >
      <div
        v-if="isLoadingMenstruationBoard"
        class="dashboard-menstruation-loading"
        aria-live="polite"
      >
        <span class="spinner"></span>
        Chargement de ton suivi cycle…
      </div>
      <div v-else-if="!hasMenstruationCycleData" class="dashboard-menstruation-empty">
        <p class="dashboard-menstruation-empty-text">
          Tu n’as pas encore renseigné ton suivi cycle. Configure la
          <strong>première configuration</strong> sur la page Menstruation pour afficher ton
          calendrier ici.
        </p>
        <router-link class="dashboard-menstruation-empty-link" :to="{ name: 'menstruation' }">
          Compléter la configuration
        </router-link>
      </div>
      <MenstruationCycleCalendar
        v-else-if="menstruationMode === 'pilule'"
        :cycles="menstruationCycles"
        :compact="true"
      />
      <MenstruationNaturalCycleCalendar
        v-else-if="menstruationMode === 'naturel'"
        :cycles="menstruationCyclesNaturel"
        :compact="true"
      />
    </div>

    <DashboardReadingInProgress
      v-else-if="widgetId === IDS.READING_IN_PROGRESS"
      :user-id="userId"
    />

    <DashboardTelevisionInProgress
      v-else-if="widgetId === IDS.TELEVISION_IN_PROGRESS"
      :user-id="userId"
    />

    <DashboardActiveProjects v-else-if="widgetId === IDS.PROJECTS" :user-id="userId" />
  </div>
</template>

<style scoped>
.dashboard-column,
.dashboard-widget-inner {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  min-width: 0;
}

.dashboard-widget-inner {
  gap: 1rem;
  width: 100%;
}

.intro-column,
.edt-column,
.habits-column,
.notes-graph-column,
.projects-column,
.reading-column,
.television-column,
.dictionary-word-column,
.todo-column,
.comfort-column,
.daily-note-column,
.pinned-note-column,
.finances-column,
.battery-column,
.checkin-column {
  gap: 1rem;
}

.column-title {
  font-size: 1.4rem;
  font-weight: 800;
  color: #2c3e50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid rgba(213, 181, 234, 0.2);
}

.column-date {
  font-size: 0.95rem;
  font-weight: 600;
  color: #ad81be;
  background: rgba(213, 181, 234, 0.15);
  padding: 0.2rem 0.6rem;
  border-radius: 8px;
}

@media (prefers-color-scheme: dark) {
  .column-title {
    color: #f0e8f8;
    border-bottom-color: rgba(213, 181, 234, 0.1);
  }
}

.today-events-container {
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.25);
  border-radius: 20px;
  padding: 1.5rem;
  box-shadow: 0 8px 32px rgba(173, 129, 190, 0.08);
  min-height: 250px;
  display: flex;
  flex-direction: column;
}

@media (prefers-color-scheme: dark) {
  .today-events-container {
    background: rgba(25, 20, 35, 0.65);
    border-color: rgba(213, 181, 234, 0.15);
  }
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  text-align: center;
  color: #8c98a4;
  gap: 1rem;
  font-weight: 600;
}

.empty-icon {
  font-size: 3rem;
  opacity: 0.7;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid rgba(213, 181, 234, 0.3);
  border-top-color: #ad81be;
  border-radius: 50%;
  animation: dash-widget-spin 1s linear infinite;
}

@keyframes dash-widget-spin {
  to {
    transform: rotate(360deg);
  }
}

.today-events-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Timeline View */
.today-timeline {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex: 1;
}

.timeline-wrapper {
  position: relative;
  height: 280px;
  margin-left: 2.5rem;
}

.timeline-axis {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 100%;
  border-left: 2px solid rgba(213, 181, 234, 0.3);
}

.timeline-hour-mark {
  position: absolute;
  left: -2.5rem;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: calc(100% + 2.5rem);
}

.timeline-hour-label {
  font-size: 0.68rem;
  font-weight: 700;
  color: #9b59b6;
  width: 2rem;
  text-align: right;
  flex-shrink: 0;
}

@media (prefers-color-scheme: dark) {
  .timeline-hour-label {
    color: #d5b5ea;
  }
  .timeline-axis {
    border-left-color: rgba(213, 181, 234, 0.2);
  }
}

.timeline-hour-mark::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(213, 181, 234, 0.2);
}

.timeline-events {
  position: absolute;
  top: 0;
  left: 0.5rem;
  right: 0;
  bottom: 0;
}

.timeline-event-block {
  position: absolute;
  left: 0;
  right: 0.5rem;
  min-height: 22px;
  border-radius: 6px;
  padding: 0.25rem 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  cursor: default;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.timeline-event-block:hover {
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  z-index: 10;
}

.timeline-event-time {
  font-size: 0.62rem;
  font-weight: 800;
  opacity: 0.85;
  flex-shrink: 0;
}

.timeline-event-title {
  font-size: 0.72rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.all-day-section {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.all-day-section--top {
  padding-bottom: 0.65rem;
  margin-bottom: 0.5rem;
  border-bottom: 1px dashed rgba(213, 181, 234, 0.25);
}

.all-day-event-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.65rem;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 700;
}

.all-day-icon {
  font-size: 0.85rem;
}

.all-day-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 150px;
}

.dashboard-event-card {
  border-radius: 12px;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  position: relative;
  overflow: hidden;
}

.dashboard-event-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
}

.event-time {
  margin-bottom: 0.15rem;
}

.time-badge {
  background: rgba(255, 255, 255, 0.6);
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 800;
  color: inherit;
  letter-spacing: 0.5px;
}

@media (prefers-color-scheme: dark) {
  .time-badge {
    background: rgba(0, 0, 0, 0.25);
  }
}

.event-title-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.event-title {
  font-size: 1.1rem;
  font-weight: 800;
  margin: 0;
  line-height: 1.3;
}

.event-icon {
  font-size: 1.2rem;
}

.event-description {
  font-size: 0.85rem;
  line-height: 1.45;
  margin: 0.25rem 0 0 0;
  opacity: 0.85;
}

.event-tags {
  margin-top: 0.5rem;
}

.event-category-tag {
  display: inline-block;
  font-size: 0.65rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.75;
}

.mini-calendar-wrapper {
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.25);
  border-radius: 20px;
  padding: 1.25rem;
  box-shadow: 0 8px 32px rgba(173, 129, 190, 0.08);
  max-width: 320px;
  width: 100%;
  margin: 0 auto;
}

.dashboard-menstruation-wrap.mini-calendar-wrapper,
.right-column .dashboard-menstruation-wrap.mini-calendar-wrapper {
  max-width: 100%;
  width: 100%;
  margin-left: 0;
  margin-right: 0;
  align-self: stretch;
  box-sizing: border-box;
}

.dashboard-menstruation-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  min-height: 8rem;
  color: #8c98a4;
  font-weight: 600;
}

.dashboard-menstruation-empty {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.85rem;
  padding: 0.35rem 0;
}

.dashboard-menstruation-empty-text {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.45;
  color: #6c757d;
  font-weight: 600;
}

.dashboard-menstruation-empty-text strong {
  color: #ad81be;
  font-weight: 800;
}

.dashboard-menstruation-empty-link {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  padding: 0.45rem 0.85rem;
  border-radius: 10px;
  background: rgba(213, 181, 234, 0.22);
  color: #ad81be;
  font-weight: 700;
  font-size: 0.88rem;
  text-decoration: none;
}

.dashboard-menstruation-empty-link:hover {
  background: rgba(213, 181, 234, 0.35);
}

@media (prefers-color-scheme: dark) {
  .mini-calendar-wrapper {
    background: rgba(25, 20, 35, 0.65);
    border-color: rgba(213, 181, 234, 0.15);
  }

  .dashboard-menstruation-empty-text {
    color: #adb5bd;
  }
}

@media (min-width: 769px) {
  .edt-column .today-events-container {
    flex: 0 1 auto;
    min-height: 0;
  }
}
</style>
