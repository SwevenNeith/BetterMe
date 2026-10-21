<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { supabase } from '../../lib/supabase.js'
import { APP_PAGE_IDS } from '../../constants/common/appPages.js'
import {
  isPageVisible,
  loadPageVisibility,
  mergePageVisibility,
  PAGE_VISIBILITY_UPDATED_EVENT,
} from '../../services/settings/pageVisibility.js'
import {
  BATTERY_UPDATED_EVENT,
  completePlannedBatteryEntry,
  isPlannedEntryDone,
  listBatteryPlannedForDay,
} from '../../services/battery/batteryDays.js'
import {
  costIntensity,
  costStyleClass,
  normalizeBatteryCost,
  sumEntryCosts,
} from '../../utils/battery/batteryMath.js'
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

const pageVisibility = ref(mergePageVisibility(null))
const isLoading = ref(false)
const loadError = ref('')
const plannedEntries = ref([])
const dayBudget = ref(0)
const completingId = ref(null)
const actionError = ref('')
/** Coût saisi par entrée (chaîne vide = défaut). */
const costDrafts = reactive(/** @type {Record<string, string>} */ ({}))

const isBatteryPageVisible = computed(() =>
  isPageVisible(APP_PAGE_IDS.BATTERY, pageVisibility.value),
)

const plannedTotal = computed(() => sumEntryCosts(plannedEntries.value))
const planOverBudget = computed(
  () => plannedEntries.value.length > 0 && plannedTotal.value > dayBudget.value,
)

function defaultAmount(cost) {
  return Math.abs(Number(cost) || 0)
}

/**
 * Résout le coût réel : vide → défaut prévu ; sinon magnitude + même signe que le prévu.
 * @param {object} entry
 */
function resolveActualCost(entry) {
  const raw = costDrafts[entry.id]
  if (raw == null || String(raw).trim() === '') {
    return normalizeBatteryCost(entry.cost)
  }
  const amount = Math.abs(normalizeBatteryCost(raw))
  const planned = Number(entry.cost) || 0
  if (planned < 0) return -amount
  return amount
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
    dayBudget.value = 0
    return
  }

  const dayIso = normalizeDateISO(props.dateIso)
  if (!dayIso) return

  isLoading.value = true
  loadError.value = ''
  try {
    const { planned, day } = await listBatteryPlannedForDay(supabase, props.userId, dayIso)
    plannedEntries.value = planned
    dayBudget.value = Number(day?.computed_budget) || 0
    for (const entry of planned) {
      if (!(entry.id in costDrafts)) costDrafts[entry.id] = ''
    }
  } catch (err) {
    console.error('dashboard battery planned:', err)
    loadError.value = 'Impossible de charger le prévu Batterie.'
    plannedEntries.value = []
    dayBudget.value = 0
  } finally {
    isLoading.value = false
  }
}

async function markDone(entry) {
  if (!props.userId || completingId.value) return
  completingId.value = entry.id
  actionError.value = ''
  try {
    await completePlannedBatteryEntry(supabase, props.userId, entry.id, {
      cost: resolveActualCost(entry),
    })
    delete costDrafts[entry.id]
    await loadPlanned()
  } catch (err) {
    console.error(err)
    actionError.value = err?.message || 'Impossible de valider cette activité.'
  } finally {
    completingId.value = null
  }
}

function onVisibilityUpdated() {
  loadPageVisibilityState().then(loadPlanned)
}

onMounted(async () => {
  window.addEventListener(PAGE_VISIBILITY_UPDATED_EVENT, onVisibilityUpdated)
  window.addEventListener(BATTERY_UPDATED_EVENT, loadPlanned)
  await loadPageVisibilityState()
  await loadPlanned()
})

onUnmounted(() => {
  window.removeEventListener(PAGE_VISIBILITY_UPDATED_EVENT, onVisibilityUpdated)
  window.removeEventListener(BATTERY_UPDATED_EVENT, loadPlanned)
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
        <span>Activités · prévues</span>
      </RouterLink>
      <span v-if="plannedEntries.length" class="column-date">Total {{ plannedTotal }}</span>
    </h2>

    <p v-if="planOverBudget" class="battery-planned-hint">
      Plan ({{ plannedTotal }}) au-dessus du budget ({{ dayBudget }}).
    </p>
    <p v-if="actionError" class="battery-planned-error">{{ actionError }}</p>

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
          :class="[
            `dashboard-event-card--${costStyleClass(entry.cost)}`,
            { 'dashboard-event-card--done': isPlannedEntryDone(entry) },
          ]"
          :style="isPlannedEntryDone(entry) ? undefined : costCardStyle(entry.cost)"
        >
          <h4 class="event-title">{{ entry.label }}</h4>

          <span
            v-if="isPlannedEntryDone(entry)"
            class="event-done-pill"
          >
            Fait
          </span>
          <div v-else class="event-complete">
            <input
              v-model="costDrafts[entry.id]"
              class="event-complete__input"
              type="number"
              min="0"
              step="0.5"
              inputmode="decimal"
              :placeholder="String(defaultAmount(entry.cost))"
              :disabled="completingId === entry.id"
              :aria-label="`Coût réel pour ${entry.label}`"
              :title="`Coût réel (défaut ${defaultAmount(entry.cost)})`"
            />
            <button
              type="button"
              class="event-complete__btn"
              :disabled="completingId === entry.id"
              @click="markDone(entry)"
            >
              {{ completingId === entry.id ? '…' : 'Fait' }}
            </button>
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
  gap: 0.55rem;
}

.battery-planned-hint {
  margin: 0;
  font-size: 0.8rem;
  color: #8a6a40;
  line-height: 1.3;
}

.battery-planned-error {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: #c45c5c;
}

.column-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0;
  font-size: 1.15rem;
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
  font-size: 0.82rem;
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
  border-radius: 14px;
  padding: 0.75rem;
  box-shadow: 0 6px 20px rgba(173, 129, 190, 0.06);
  min-height: 0;
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
  gap: 0.4rem;
  font-weight: 600;
  font-size: 0.88rem;
  min-height: 64px;
  padding: 0.5rem;
}

.empty-icon {
  font-size: 1.5rem;
  opacity: 0.75;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(213, 181, 234, 0.3);
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
  gap: 0.4rem;
}

.dashboard-event-card {
  border-radius: 10px;
  padding: 0.45rem 0.6rem;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
  box-shadow: none;
  position: relative;
  overflow: hidden;
  min-width: 0;
}

.dashboard-event-card--done {
  background: rgba(173, 129, 190, 0.08) !important;
  color: #8a9098 !important;
  opacity: 0.72;
}

.dashboard-event-card--done .event-title {
  font-weight: 600;
  text-decoration: line-through;
  text-decoration-thickness: 1px;
  color: #8a9098;
}

.event-title {
  flex: 1;
  min-width: 0;
  font-size: 0.92rem;
  font-weight: 700;
  margin: 0;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-done-pill {
  flex-shrink: 0;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: #2f6b4a;
  background: rgba(149, 209, 170, 0.35);
  border-radius: 999px;
  padding: 0.15rem 0.45rem;
}

.event-complete {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.event-complete__input {
  width: 3rem;
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 7px;
  padding: 0.28rem 0.35rem;
  background: rgba(255, 255, 255, 0.7);
  color: #2c3e50;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 700;
  text-align: center;
  box-sizing: border-box;
  -moz-appearance: textfield;
  appearance: textfield;
}

.event-complete__input::-webkit-outer-spin-button,
.event-complete__input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.event-complete__btn {
  border: none;
  border-radius: 7px;
  padding: 0.28rem 0.65rem;
  background: rgba(255, 255, 255, 0.75);
  color: #2f6b4a;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.event-complete__btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.95);
}

.event-complete__btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

@media (prefers-color-scheme: dark) {
  .column-title {
    color: #f0e8f8;
  }

  .column-date {
    color: #adb5bd;
  }

  .battery-planned-hint {
    color: #d4b56a;
  }

  .battery-planned-container {
    background: rgba(25, 20, 35, 0.65);
    border-color: rgba(213, 181, 234, 0.15);
  }

  .dashboard-event-card--done {
    background: rgba(173, 129, 190, 0.1) !important;
    color: #adb5bd !important;
  }

  .dashboard-event-card--done .event-title {
    color: #adb5bd;
  }

  .event-done-pill {
    background: rgba(149, 209, 170, 0.22);
    color: #95d1aa;
  }

  .event-complete__input {
    background: rgba(25, 20, 35, 0.55);
    border-color: rgba(255, 255, 255, 0.2);
    color: #f0e8f8;
  }

  .event-complete__btn {
    background: rgba(25, 20, 35, 0.55);
    color: #95d1aa;
  }
}
</style>
