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

function formatCost(n) {
  const v = Number(n) || 0
  const abs = Math.abs(v)
  const label = Number.isInteger(abs) ? String(abs) : abs.toFixed(1)
  if (v > 0) return `−${label}`
  if (v < 0) return `+${label}`
  return '0'
}

function costEffectLabel(cost) {
  const v = Number(cost) || 0
  if (v > 0) return 'Dépense'
  if (v < 0) return 'Regain'
  return 'Neutre'
}

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
          <div class="event-details">
            <div class="event-title-row">
              <h4 class="event-title">{{ entry.label }}</h4>
            </div>
            <div class="event-tags">
              <span class="event-category-tag">{{ costEffectLabel(entry.cost) }}</span>
              <span class="event-category-tag">prévu {{ formatCost(entry.cost) }}</span>
              <span v-if="isPlannedEntryDone(entry)" class="event-category-tag event-category-tag--done">
                Fait
              </span>
            </div>
          </div>

          <div v-if="!isPlannedEntryDone(entry)" class="event-complete">
            <label class="event-complete__field">
              <span>Coût réel</span>
              <input
                v-model="costDrafts[entry.id]"
                type="number"
                min="0"
                step="0.5"
                inputmode="decimal"
                :placeholder="String(defaultAmount(entry.cost))"
                :disabled="completingId === entry.id"
                :aria-label="`Coût réel pour ${entry.label}`"
              />
            </label>
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
  gap: 0.85rem;
}

.battery-planned-hint {
  margin: 0;
  font-size: 0.88rem;
  color: #8a6a40;
  line-height: 1.35;
}

.battery-planned-error {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 600;
  color: #c45c5c;
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

.dashboard-event-card--done {
  background: rgba(173, 129, 190, 0.08) !important;
  color: #8a9098 !important;
  opacity: 0.72;
  box-shadow: none;
}

.dashboard-event-card--done:hover {
  transform: none;
  box-shadow: none;
}

.dashboard-event-card--done .event-title {
  font-weight: 700;
  text-decoration: line-through;
  text-decoration-thickness: 1px;
  color: #8a9098;
}

.event-category-tag--done {
  background: rgba(149, 209, 170, 0.35) !important;
  color: #2f6b4a;
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

.event-complete {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.55rem;
  margin-top: 0.25rem;
}

.event-complete__field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  flex: 1;
  min-width: 5.5rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: inherit;
  opacity: 0.85;
}

.event-complete__field input {
  width: 100%;
  max-width: 7rem;
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 8px;
  padding: 0.4rem 0.5rem;
  background: rgba(255, 255, 255, 0.7);
  color: #2c3e50;
  font: inherit;
  font-size: 0.95rem;
  font-weight: 700;
  text-transform: none;
  letter-spacing: normal;
  box-sizing: border-box;
}

.event-complete__btn {
  border: none;
  border-radius: 9px;
  padding: 0.45rem 0.95rem;
  background: rgba(255, 255, 255, 0.75);
  color: #2f6b4a;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
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

  .event-category-tag {
    background: rgba(0, 0, 0, 0.25);
  }

  .dashboard-event-card--done {
    background: rgba(173, 129, 190, 0.1) !important;
    color: #adb5bd !important;
  }

  .dashboard-event-card--done .event-title {
    color: #adb5bd;
  }

  .event-category-tag--done {
    background: rgba(149, 209, 170, 0.22) !important;
    color: #95d1aa;
  }

  .event-complete__field input {
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
