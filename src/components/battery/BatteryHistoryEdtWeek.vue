<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../../lib/supabase.js'
import { resolveSessionUser } from '../../utils/auth/sessionUser.js'
import {
  BATTERY_SOURCE_TYPES,
  batteryPriorityMeta,
} from '../../constants/battery/battery.js'
import {
  allDayEventsForDay,
  loadHistoryEdtWeekContext,
  timedEventsForDay,
} from '../../services/battery/batteryHistoryEdt.js'
import { getLinkedBatteryCost } from '../../services/battery/batterySourceSync.js'
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
const isReadModalOpen = ref(false)
const viewingEvent = ref(null)
const viewingCost = ref(null)
const viewingCostLoading = ref(false)
const userId = ref(null)

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
    ? 'Emploi du temps prévu (comme sur la page EDT), y compris les journées entières.'
    : 'Réel : horaires faits et journées entières ; les hobbies sans créneau n’apparaissent qu’avec un horaire ou « Journée entière ».',
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

function formatDayLong(iso) {
  const raw = String(iso || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return iso || ''
  const [y, m, d] = raw.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatCostLabel(cost) {
  if (cost == null || !Number.isFinite(Number(cost))) return null
  const n = Number(cost)
  if (n === 0) return '0 pt'
  const abs = Math.abs(n)
  const unit = abs === 1 ? 'pt' : 'pts'
  return n > 0 ? `${n} ${unit}` : `${n} ${unit} (regain)`
}

async function openEvent(event) {
  if (!event) return
  viewingEvent.value = event
  viewingCost.value = event.cost != null ? Number(event.cost) : null
  viewingCostLoading.value = false
  isReadModalOpen.value = true

  // Prévu (événement EDT) : charger le coût Batterie lié si besoin
  if (event._source !== 'actual' && event.id && userId.value) {
    viewingCostLoading.value = true
    try {
      const cost = await getLinkedBatteryCost(supabase, userId.value, [
        { sourceType: BATTERY_SOURCE_TYPES.TIMETABLE, sourceId: event.id },
      ])
      if (viewingEvent.value?.id === event.id) {
        viewingCost.value = cost
      }
    } catch (err) {
      console.warn('Coût Batterie lié:', err)
    } finally {
      if (viewingEvent.value?.id === event.id) viewingCostLoading.value = false
    }
  }
}

function closeReadModal() {
  isReadModalOpen.value = false
  viewingEvent.value = null
  viewingCost.value = null
  viewingCostLoading.value = false
}

function openEventOnBatteryDay() {
  const event = viewingEvent.value
  const dayIso =
    event?._batteryDay ||
    String(event?.date_start || '').slice(0, 10) ||
    dayIsoAt(selectedDayIndex.value)
  closeReadModal()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayIso)) return
  router.push({ name: 'battery', query: { date: dayIso } })
}

async function loadWeek() {
  isLoading.value = true
  loadError.value = ''
  try {
    const user = await resolveSessionUser()
    if (!user) {
      userId.value = null
      plannedEvents.value = []
      actualEvents.value = []
      return
    }
    userId.value = user.id
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
                    :title="[
                      event.timeRangeLabel || event.time,
                      event.title,
                      getCategoryName(event.category),
                      event.detail || '',
                    ]
                      .filter(Boolean)
                      .join(' — ')"
                    @click="openEvent(event)"
                  >
                    <div class="event-content">
                      <div
                        v-if="event.isVeryShort"
                        class="event-main-line event-main-line--very-short"
                      >
                        <h4 class="event-title">{{ event.title }}</h4>
                        <span
                          v-if="event.priority"
                          class="event-priority-pill event-priority-pill--inline"
                          :class="`event-priority-pill--${event.priority}`"
                          :title="batteryPriorityMeta(event.priority)?.label"
                        >
                          {{ eventPriorityShort(event.priority) }}
                        </span>
                      </div>
                      <div v-else-if="event.isShort" class="event-main-line">
                        <span class="event-time">{{ event.timeStartLabel }}</span>
                        <h4 class="event-title">{{ event.title }}</h4>
                        <span
                          v-if="event.priority"
                          class="event-priority-pill event-priority-pill--inline"
                          :class="`event-priority-pill--${event.priority}`"
                          :title="batteryPriorityMeta(event.priority)?.label"
                        >
                          {{ eventPriorityShort(event.priority) }}
                        </span>
                      </div>
                      <template v-else>
                        <div class="event-meta-row">
                          <span class="event-time">{{ event.timeRangeLabel }}</span>
                          <span
                            v-if="event.priority"
                            class="event-priority-pill"
                            :class="`event-priority-pill--${event.priority}`"
                            :title="batteryPriorityMeta(event.priority)?.label"
                          >
                            {{ eventPriorityShort(event.priority) }}
                          </span>
                        </div>
                        <h4 class="event-title">{{ event.title }}</h4>
                        <span v-if="event.category" class="event-category-tag">
                          {{ getCategoryName(event.category) }}
                        </span>
                      </template>
                      <p v-if="event.detail" class="event-description">{{ event.detail }}</p>
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
                    class="event-block event-block--mobile"
                    :class="event.isShort ? 'event-block--short' : 'event-block--tall'"
                    :style="[getCategoryStyle(event.category), event.positionStyle]"
                    @click="openEvent(event)"
                  >
                    <div class="event-content">
                      <div
                        v-if="event.isVeryShort"
                        class="event-main-line event-main-line--very-short"
                      >
                        <h4 class="event-title">{{ event.title }}</h4>
                        <span
                          v-if="event.priority"
                          class="event-priority-pill event-priority-pill--inline"
                          :class="`event-priority-pill--${event.priority}`"
                        >
                          {{ eventPriorityShort(event.priority) }}
                        </span>
                      </div>
                      <div v-else-if="event.isShort" class="event-main-line">
                        <span class="event-time">{{ event.timeStartLabel }}</span>
                        <h4 class="event-title">{{ event.title }}</h4>
                        <span
                          v-if="event.priority"
                          class="event-priority-pill event-priority-pill--inline"
                          :class="`event-priority-pill--${event.priority}`"
                        >
                          {{ eventPriorityShort(event.priority) }}
                        </span>
                      </div>
                      <template v-else>
                        <div class="event-meta-row">
                          <span class="event-time">{{ event.timeRangeLabel }}</span>
                          <span
                            v-if="event.priority"
                            class="event-priority-pill"
                            :class="`event-priority-pill--${event.priority}`"
                          >
                            {{ eventPriorityShort(event.priority) }}
                          </span>
                        </div>
                        <h4 class="event-title">{{ event.title }}</h4>
                        <span v-if="event.category" class="event-category-tag">
                          {{ getCategoryName(event.category) }}
                        </span>
                      </template>
                      <p v-if="event.detail" class="event-description">{{ event.detail }}</p>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Popup détail (même logique que la page EDT) -->
    <div
      v-if="isReadModalOpen"
      class="modal-overlay"
      @click.self="closeReadModal"
    >
      <div class="modal-card modal-card--read" role="dialog" aria-modal="true">
        <div class="modal-header modal-header--read">
          <h3>{{ viewingEvent?.title || "Détails de l'activité" }}</h3>
          <div class="modal-header-actions">
            <button
              type="button"
              class="modal-edit-btn"
              title="Ouvrir le jour Batterie"
              @click="openEventOnBatteryDay"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                width="18"
                height="18"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button type="button" class="modal-close" @click="closeReadModal">✕</button>
          </div>
        </div>

        <div v-if="viewingEvent" class="read-modal-content">
          <div v-if="viewingEvent.detail" class="read-field">
            <span class="read-label">Description</span>
            <p class="read-value read-value--description">{{ viewingEvent.detail }}</p>
          </div>

          <div class="read-field-row">
            <div v-if="viewingEvent.date_start" class="read-field">
              <span class="read-label">Date</span>
              <span class="read-value">
                {{ formatDayLong(viewingEvent.date_start) }}
                <template
                  v-if="
                    viewingEvent.date_end &&
                    viewingEvent.date_end !== viewingEvent.date_start
                  "
                >
                  → {{ formatDayLong(viewingEvent.date_end) }}
                </template>
              </span>
            </div>
          </div>

          <div
            v-if="!viewingEvent.all_day && viewingEvent.time"
            class="read-field-row"
          >
            <div class="read-field">
              <span class="read-label">Horaire</span>
              <span class="read-value">{{ viewingEvent.time }}</span>
            </div>
          </div>

          <div v-if="viewingEvent.all_day" class="read-field">
            <span class="read-label">Type</span>
            <span class="read-value read-value--tag">Toute la journée 🕒</span>
          </div>

          <div class="read-field-row">
            <div v-if="viewingEvent.category" class="read-field">
              <span class="read-label">Catégorie</span>
              <span
                class="read-value read-value--category"
                :style="getCategoryStyle(viewingEvent.category)"
              >
                {{ getCategoryIcon(viewingEvent.category) }}
                {{ getCategoryName(viewingEvent.category) }}
              </span>
            </div>
            <div v-if="viewingEvent.priority" class="read-field">
              <span class="read-label">Priorité</span>
              <span
                class="read-value read-value--priority"
                :class="`event-priority-pill--${viewingEvent.priority}`"
              >
                {{
                  batteryPriorityMeta(viewingEvent.priority)?.label ||
                  viewingEvent.priority
                }}
              </span>
            </div>
          </div>

          <div class="read-field">
            <span class="read-label">Coût énergie</span>
            <span v-if="viewingCostLoading" class="read-value read-value--muted">
              Chargement…
            </span>
            <span v-else-if="formatCostLabel(viewingCost)" class="read-value">
              {{ formatCostLabel(viewingCost) }}
            </span>
            <span v-else class="read-value read-value--muted">Non renseigné</span>
          </div>

          <div class="read-modal-actions">
            <button
              type="button"
              class="read-action-btn read-action-btn--edit"
              @click="openEventOnBatteryDay"
            >
              Ouvrir le jour Batterie
            </button>
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
  height: min(70vh, 720px);
  overflow: auto;
  padding: 0 0.5rem 0.5rem;
}

.grid-scroll-viewport::-webkit-scrollbar {
  width: 8px;
}

.grid-scroll-viewport::-webkit-scrollbar-thumb {
  background: rgba(213, 181, 234, 0.3);
  border-radius: 4px;
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
  height: 100%;
  pointer-events: none;
}

.event-block {
  position: absolute;
  box-sizing: border-box;
  border-radius: 10px;
  padding: 0.28rem 0.4rem 0.26rem 0.42rem;
  transition:
    transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.25s ease,
    z-index 0.1s ease;
  cursor: pointer;
  z-index: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  pointer-events: auto;
  min-width: 0;
  border: none;
  font: inherit;
  text-align: left;
}

.event-block:hover {
  width: max(100%, max-content) !important;
  min-width: 100% !important;
  max-width: 280px;
  height: auto !important;
  min-height: var(--event-block-height, 0px) !important;
  padding: 0.45rem 0.55rem 0.45rem 0.55rem !important;
  z-index: 50;
  overflow: hidden;
  transform: translateY(-2px) scale(1.05);
  transform-origin: left top;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.16);
  background: #ffffff !important;
  border: 1px solid var(--event-color-solid) !important;
  border-left: 4px solid var(--event-color-solid) !important;
}

.grid-day-column:first-child .event-block:hover {
  left: 0 !important;
  right: auto !important;
  transform-origin: left top;
}

.grid-day-column:last-child .event-block:hover {
  left: auto !important;
  right: 0 !important;
  transform-origin: right top;
}

.event-content {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  height: 100%;
  position: relative;
  gap: 0.1rem;
  overflow: hidden;
}

.event-block--short .event-content {
  justify-content: center;
}

.event-block--tall .event-content {
  justify-content: flex-start;
  padding-top: 0.05rem;
  gap: 0.08rem;
}

.event-block:hover .event-content {
  flex: 1 1 auto;
  height: auto;
  min-height: 0;
  justify-content: flex-start;
  overflow: visible;
}

.event-main-line {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  font-size: 0.62rem;
  line-height: 1.15;
}

.event-block--short {
  padding: 0.22rem 0.38rem 0.2rem 0.4rem;
  overflow: hidden;
}

.event-block--short .event-main-line {
  font-size: clamp(0.52rem, 1.1vw, 0.64rem);
}

.event-main-line--very-short {
  font-size: clamp(0.5rem, 1vw, 0.6rem);
}

.event-main-line--very-short .event-title {
  font-weight: 700;
}

.event-block--short .event-priority-pill--inline {
  font-size: 0.48rem;
  padding: 0.12rem 0.28rem;
}

.event-block--short .event-title {
  flex: 1 1 auto;
  min-width: 0;
}

.event-block--short:not(:hover) .event-description {
  display: none;
}

.event-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.3rem;
  min-width: 0;
  width: 100%;
  flex-shrink: 0;
  font-size: 0.68rem;
  line-height: 1.2;
  box-sizing: border-box;
}

.event-block--tall {
  padding: 0.3rem 0.4rem 0.28rem 0.42rem;
  overflow: hidden;
}

.event-block--tall .event-meta-row {
  font-size: 0.64rem;
  line-height: 1.15;
}

.event-block--tall .event-title {
  flex: 0 1 auto;
  width: 100%;
  font-size: 0.74rem;
  line-height: 1.2;
  white-space: normal;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word;
}

.event-block--tall .event-category-tag {
  flex: 0 0 auto;
  max-width: 100%;
  width: fit-content;
  font-size: 0.58rem;
  line-height: 1.15;
}

.event-block--tall:not(:hover) .event-description {
  display: none;
}

.event-block:hover .event-main-line {
  white-space: normal;
  flex-wrap: wrap;
  overflow: visible;
  font-size: 0.72rem;
  row-gap: 0.2rem;
}

.event-block--short:hover .event-main-line {
  flex-wrap: nowrap;
  white-space: nowrap;
}

.event-block:hover .event-meta-row {
  font-size: 0.75rem;
}

.event-time {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 0.95em;
  font-weight: 700;
  letter-spacing: -0.15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}

.event-meta-row .event-time {
  flex: 1 1 auto;
}

.event-title {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  font-size: 1em;
  font-weight: 700;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: inherit;
}

.event-block:hover .event-title {
  flex: 1 1 100%;
  white-space: normal;
  overflow: visible;
  text-overflow: unset;
  display: block;
  -webkit-line-clamp: unset;
  word-break: break-word;
}

.event-block--short:hover .event-title {
  flex: 1 1 auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-category-tag {
  flex: 0 1 auto;
  max-width: 32%;
  margin: 0;
  font-size: 0.82em;
  font-weight: 700;
  opacity: 0.75;
  text-transform: uppercase;
  letter-spacing: 0.15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-block:hover .event-category-tag {
  max-width: none;
  flex: 1 1 100%;
  white-space: normal;
  overflow: visible;
  text-overflow: unset;
}

.event-priority-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  padding: 0.12rem 0.34rem;
  border-radius: 999px;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.01em;
  line-height: 1;
  border: 1px solid transparent;
  flex: 0 0 auto;
  box-sizing: border-box;
  white-space: nowrap;
  max-width: 100%;
}

.event-priority-pill--inline {
  margin-left: 0.2rem;
}

.event-priority-pill--p1 {
  background: rgba(212, 160, 23, 0.22);
  border-color: rgba(212, 160, 23, 0.4);
  color: #7a5c0c;
}

.event-priority-pill--p2 {
  background: rgba(90, 120, 180, 0.2);
  border-color: rgba(90, 120, 180, 0.35);
  color: #3a4f7a;
}

.event-priority-pill--p3 {
  background: rgba(80, 90, 110, 0.12);
  border-color: rgba(80, 90, 110, 0.25);
  color: #4a5260;
}

.event-priority-pill--p4 {
  background: rgba(80, 90, 110, 0.08);
  border-color: rgba(80, 90, 110, 0.18);
  color: #6a7280;
}

.event-description {
  display: block;
  max-height: 0;
  overflow: hidden;
  opacity: 0;
  font-size: 0.72rem;
  line-height: 1.35;
  color: #4f5f6f;
  margin-top: 0;
  white-space: normal;
  word-break: break-word;
}

.event-block:hover .event-description {
  max-height: 8rem;
  opacity: 1;
  margin-top: 0.35rem;
  padding-top: 0.35rem;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
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
  .mobile-day-heading {
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

  .event-block:hover {
    background: #1c1825 !important;
  }

  .event-description {
    color: #c5b8d4;
  }

  .event-block:hover .event-description {
    border-top-color: rgba(213, 181, 234, 0.2);
  }

  .event-priority-pill--p1 {
    color: #f0d78a;
  }

  .event-priority-pill--p2 {
    color: #a8bce8;
  }

  .event-priority-pill--p3,
  .event-priority-pill--p4 {
    color: #c5cad3;
  }
}

/* ─── Popup détail (aligné page EDT) ─── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.modal-card {
  width: 100%;
  max-width: 430px;
  max-height: calc(100vh - 3rem);
  overflow-x: hidden;
  overflow-y: auto;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(16px);
  border-radius: 24px;
  border: 1px solid rgba(213, 181, 234, 0.4);
  box-shadow: 0 20px 50px rgba(173, 129, 190, 0.25);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.modal-card--read {
  max-width: 380px;
}

.modal-header--read {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.modal-header--read h3 {
  flex: 1;
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: #2c3e50;
  line-height: 1.3;
  word-break: break-word;
}

.modal-header-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.modal-edit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: rgba(173, 129, 190, 0.15);
  color: #ad81be;
  cursor: pointer;
}

.modal-edit-btn:hover {
  background: #ad81be;
  color: white;
}

.modal-close {
  background: transparent;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: #6c757d;
}

.modal-close:hover {
  color: #ad81be;
}

.read-modal-content {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  margin-top: 0.5rem;
}

.read-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.read-field-row {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.read-field-row .read-field {
  flex: 1;
  min-width: 120px;
}

.read-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: #9b59b6;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.read-value {
  font-size: 0.92rem;
  color: #2c3e50;
  line-height: 1.4;
}

.read-value--muted {
  color: #8a9098;
  font-style: italic;
}

.read-value--description {
  font-size: 0.88rem;
  color: #5d6d7e;
  line-height: 1.45;
  padding: 0.5rem 0.65rem;
  background: rgba(213, 181, 234, 0.08);
  border-radius: 8px;
  margin: 0;
}

.read-value--tag {
  display: inline-block;
  font-size: 0.82rem;
  font-weight: 600;
  padding: 0.25rem 0.6rem;
  background: rgba(173, 129, 190, 0.15);
  border-radius: 6px;
  color: #9b59b6;
}

.read-value--category {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.3rem 0.65rem;
  border-radius: 8px;
}

.read-value--priority {
  display: inline-block;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0.25rem 0.55rem;
  border-radius: 5px;
}

.read-modal-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.75rem;
  padding-top: 0.85rem;
  border-top: 1px solid rgba(213, 181, 234, 0.2);
}

.read-action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  padding: 0.65rem 1rem;
  font: inherit;
  font-size: 0.88rem;
  font-weight: 700;
  border: none;
  border-radius: 10px;
  cursor: pointer;
}

.read-action-btn--edit {
  background: linear-gradient(145deg, #ad81be, #9b59b6);
  color: white;
}

.read-action-btn--edit:hover {
  filter: brightness(1.08);
}

@media (prefers-color-scheme: dark) {
  .modal-card {
    background: rgba(25, 20, 35, 0.95);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .modal-header--read h3,
  .read-value {
    color: #f0e8f8;
  }

  .read-label {
    color: #d5b5ea;
  }

  .read-value--muted {
    color: #adb5bd;
  }

  .read-value--description {
    color: #aeb6bf;
    background: rgba(173, 129, 190, 0.1);
  }

  .read-value--tag {
    background: rgba(173, 129, 190, 0.2);
    color: #d5b5ea;
  }
}
</style>
