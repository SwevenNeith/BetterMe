<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { supabase } from '../../lib/supabase.js'
import { APP_PAGE_IDS } from '../../constants/common/appPages.js'
import { usePageDisplayLabel } from '../../composables/usePageDisplayLabel.js'
import {
  isPageVisible,
  loadPageVisibility,
  mergePageVisibility,
  PAGE_VISIBILITY_UPDATED_EVENT,
} from '../../services/settings/pageVisibility.js'
import { listBatteryPlannedForDay } from '../../services/battery/batteryDays.js'
import { costIntensity, costStyleClass, sumEntryCosts } from '../../utils/battery/batteryMath.js'
import { normalizeDateISO } from '../../utils/habit/habitCalendar.js'

const props = defineProps({
  userId: {
    type: String,
    default: null,
  },
  dateIso: {
    type: String,
    required: true,
  },
})

const { pageTitle } = usePageDisplayLabel(APP_PAGE_IDS.BATTERY)

const pageVisibility = ref(mergePageVisibility(null))
const isLoading = ref(false)
const loadError = ref('')
const plannedEntries = ref([])

const isBatteryPageVisible = computed(() =>
  isPageVisible(APP_PAGE_IDS.BATTERY, pageVisibility.value),
)

const plannedTotal = computed(() => sumEntryCosts(plannedEntries.value))

function formatCost(n) {
  const v = Number(n) || 0
  if (v > 0) return `−${v}`
  if (v < 0) return `+${Math.abs(v)}`
  return '0'
}

function costEffectLabel(cost) {
  const v = Number(cost) || 0
  if (v > 0) return 'Dépense'
  if (v < 0) return 'Regain'
  return 'Neutre'
}

/** Fond pastel façon carte EDT, teinté selon drain / regain. */
function costCardStyle(cost) {
  const v = Number(cost) || 0
  const intensity = costIntensity(v)
  if (v === 0) {
    return {
      background: 'hsla(280, 35%, 88%, 0.85)',
      color: '#5a4a66',
    }
  }
  if (v > 0) {
    const lightness = 88 - intensity * 4
    return {
      background: `hsla(340, 55%, ${lightness}%, 0.9)`,
      color: '#6b2a40',
    }
  }
  const lightness = 86 - intensity * 4
  return {
    background: `hsla(145, 40%, ${lightness}%, 0.9)`,
    color: '#1e4a32',
  }
}

async function loadPageVisibilityState() {
  if (!props.userId) {
    pageVisibility.value = mergePageVisibility(null)
    return
  }
  try {
    pageVisibility.value = await loadPageVisibility(supabase, props.userId)
  } catch (err) {
    console.error('dashboard battery planned visibility:', err)
    pageVisibility.value = mergePageVisibility(null)
  }
}

async function loadPlanned() {
  if (!props.userId || !isBatteryPageVisible.value) {
    plannedEntries.value = []
    return
  }

  const dayIso = normalizeDateISO(props.dateIso)
  if (!dayIso) return

  isLoading.value = true
  loadError.value = ''
  try {
    const { planned } = await listBatteryPlannedForDay(supabase, props.userId, dayIso)
    plannedEntries.value = planned
  } catch (err) {
    console.error('dashboard battery planned:', err)
    loadError.value = 'Impossible de charger le prévu Batterie.'
    plannedEntries.value = []
  } finally {
    isLoading.value = false
  }
}

function onVisibilityUpdated() {
  loadPageVisibilityState().then(loadPlanned)
}

onMounted(async () => {
  window.addEventListener(PAGE_VISIBILITY_UPDATED_EVENT, onVisibilityUpdated)
  await loadPageVisibilityState()
  await loadPlanned()
})

onUnmounted(() => {
  window.removeEventListener(PAGE_VISIBILITY_UPDATED_EVENT, onVisibilityUpdated)
})

watch(
  () => [props.userId, props.dateIso],
  async () => {
    await loadPageVisibilityState()
    await loadPlanned()
  },
)
</script>

<template>
  <section v-if="isBatteryPageVisible" class="battery-planned-block">
    <h2 class="column-title">
      <RouterLink
        :to="{ name: 'battery', query: { date: dateIso } }"
        class="column-title__link"
      >
        <span>{{ pageTitle }} · prévu</span>
      </RouterLink>
      <span v-if="plannedEntries.length" class="column-date">Total {{ plannedTotal }}</span>
    </h2>

    <div class="today-events-container battery-planned-container">
      <div v-if="isLoading" class="loading-state">
        <span class="spinner" aria-hidden="true" />
        Chargement du prévu…
      </div>
      <div v-else-if="loadError" class="empty-state">
        <p>{{ loadError }}</p>
      </div>
      <div v-else-if="!plannedEntries.length" class="empty-state">
        <span class="empty-icon" aria-hidden="true">🔋</span>
        <p>Rien de planifié pour aujourd’hui.</p>
      </div>
      <div v-else class="today-events-list">
        <div
          v-for="entry in plannedEntries"
          :key="entry.id"
          class="dashboard-event-card"
          :class="`dashboard-event-card--${costStyleClass(entry.cost)}`"
          :style="costCardStyle(entry.cost)"
        >
          <div class="event-time">
            <span class="time-badge">{{ formatCost(entry.cost) }}</span>
          </div>
          <div class="event-details">
            <div class="event-title-row">
              <h4 class="event-title">{{ entry.label }}</h4>
            </div>
            <div class="event-tags">
              <span class="event-category-tag">{{ costEffectLabel(entry.cost) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.battery-planned-block {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.column-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0;
  font-size: 1.35rem;
  font-weight: 800;
  color: #2c3e50;
}

.column-title__link {
  color: inherit;
  text-decoration: none;
}

.column-title__link:hover {
  text-decoration: underline;
}

.column-date {
  font-size: 0.9rem;
  font-weight: 700;
  color: #8c98a4;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.battery-planned-container {
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.25);
  border-radius: 20px;
  padding: 1.5rem;
  box-shadow: 0 8px 32px rgba(173, 129, 190, 0.08);
  min-height: 140px;
  display: flex;
  flex-direction: column;
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
  gap: 0.75rem;
  font-weight: 600;
  min-height: 100px;
}

.empty-icon {
  font-size: 2.4rem;
  opacity: 0.75;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid rgba(213, 181, 234, 0.3);
  border-top-color: #ad81be;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.today-events-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.dashboard-event-card {
  border-radius: 12px;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
  position: relative;
  overflow: hidden;
}

.dashboard-event-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
}

.event-time {
  margin-bottom: 0.05rem;
}

.time-badge {
  background: rgba(255, 255, 255, 0.65);
  padding: 0.25rem 0.65rem;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 800;
  color: inherit;
  letter-spacing: 0.03em;
  font-variant-numeric: tabular-nums;
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

.event-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.event-category-tag {
  display: inline-flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.45);
  border-radius: 999px;
  padding: 0.2rem 0.65rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

@media (prefers-color-scheme: dark) {
  .column-title {
    color: #f0e8f8;
  }

  .column-date {
    color: #adb5bd;
  }

  .battery-planned-container {
    background: rgba(25, 20, 35, 0.65);
    border-color: rgba(213, 181, 234, 0.15);
  }

  .time-badge,
  .event-category-tag {
    background: rgba(0, 0, 0, 0.25);
  }
}
</style>
