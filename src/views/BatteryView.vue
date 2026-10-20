<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '../lib/supabase.js'
import { APP_PAGE_IDS } from '../constants/common/appPages.js'
import {
  BATTERY_ENTRY_KINDS,
  BATTERY_EVENING_FEELINGS,
  BATTERY_MORNING_LABELS,
  BATTERY_SLEEP_QUALITIES,
} from '../constants/battery/battery.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import { resolveSessionUser } from '../utils/auth/sessionUser.js'
import { getLocalTodayISO } from '../services/common/scheduledReminders.js'
import {
  listBatteryActivities,
  searchBatteryActivities,
} from '../services/battery/batteryActivities.js'
import {
  addBatteryEntry,
  copyPlannedToActual,
  deleteBatteryEntry,
  ensureBatteryDay,
  updateBatteryDay,
  updateBatteryEntry,
} from '../services/battery/batteryDays.js'
import { getBatterySettings } from '../services/battery/batterySettings.js'
import {
  costStyleClass,
  formatMinutesAsHm,
  hoursBetweenTimes,
  lieInMinutes,
  shiftDayIso,
  sumEntryCosts,
  toTimeInputValue,
} from '../utils/battery/batteryMath.js'
import BatteryGauge from '../components/battery/BatteryGauge.vue'

defineOptions({ name: 'BatteryView' })

const { pageTitle } = usePageDisplayLabel(APP_PAGE_IDS.BATTERY, undefined, {
  setDocumentTitle: true,
})

const route = useRoute()
const router = useRouter()

const EVENING_META = {
  empty: {
    label: 'À sec',
    hint: 'Plus rien en réserve',
    tone: 'empty',
  },
  just: {
    label: 'Juste',
    hint: 'Pile le bon niveau',
    tone: 'just',
  },
  left: {
    label: 'Il m’en restait',
    hint: 'Encore un peu d’énergie',
    tone: 'left',
  },
}

const userId = ref(null)
const selectedDate = ref(getLocalTodayISO())
const dayPickerRef = ref(null)
const isLoading = ref(false)
const isSaving = ref(false)
const loadError = ref('')
const statusMessage = ref('')

const settings = ref({ base_energy: 10 })
const day = ref(null)
const entries = ref([])
const activities = ref([])

const morningEnergy = ref(null)
const sleepQuality = ref(null)
const sleepBedtime = ref('')
const sleepWakeTime = ref('')
const sleepOutOfBedTime = ref('')
const eveningFeeling = ref(null)

const entryLabel = ref('')
/** Coût signé : positif = dépense, négatif = regain (couleur dans la liste). */
const entryCost = ref(1)
const entryActivityId = ref('')
const entryKind = ref(BATTERY_ENTRY_KINDS.ACTUAL)
const entrySearch = ref('')
const entrySuggestions = ref([])

const todayIso = computed(() => getLocalTodayISO())
const isToday = computed(() => selectedDate.value === todayIso.value)

const actualEntries = computed(() =>
  entries.value.filter((e) => e.kind === BATTERY_ENTRY_KINDS.ACTUAL),
)
const plannedEntries = computed(() =>
  entries.value.filter((e) => e.kind === BATTERY_ENTRY_KINDS.PLANNED),
)

const spent = computed(() => sumEntryCosts(actualEntries.value))
const plannedSpent = computed(() => sumEntryCosts(plannedEntries.value))
const budget = computed(() => Number(day.value?.computed_budget) || 0)
const planOverBudget = computed(() => plannedSpent.value > budget.value)

const sleepDurationHours = computed(() =>
  hoursBetweenTimes(sleepBedtime.value, sleepWakeTime.value),
)
const lieInGapMinutes = computed(() =>
  lieInMinutes(sleepWakeTime.value, sleepOutOfBedTime.value),
)

const periodLabel = computed(() => {
  try {
    const [y, m, d] = selectedDate.value.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
  } catch {
    return selectedDate.value
  }
})

function formatCost(n) {
  const v = Number(n) || 0
  if (v > 0) return `−${v}`
  if (v < 0) return `+${Math.abs(v)}`
  return '0'
}

async function loadActivities() {
  if (!userId.value) return
  activities.value = await listBatteryActivities(supabase, userId.value)
}

async function loadDay() {
  if (!userId.value) return
  isLoading.value = true
  loadError.value = ''
  try {
    settings.value = await getBatterySettings(supabase, userId.value)
    const result = await ensureBatteryDay(supabase, userId.value, selectedDate.value)
    day.value = result.day
    entries.value = result.entries
    morningEnergy.value = result.day.morning_energy
    sleepQuality.value = result.day.sleep_quality
    sleepBedtime.value = toTimeInputValue(result.day.sleep_bedtime)
    sleepWakeTime.value = toTimeInputValue(result.day.sleep_wake_time)
    sleepOutOfBedTime.value = toTimeInputValue(result.day.sleep_out_of_bed_time)
    eveningFeeling.value = result.day.evening_feeling
  } catch (err) {
    console.error(err)
    loadError.value =
      err?.message?.includes('battery_') || err?.code === '42P01'
        ? 'Tables Batterie introuvables. Exécute scripts/create-battery.sql dans Supabase.'
        : 'Impossible de charger la journée.'
  } finally {
    isLoading.value = false
  }
}

async function persistDayFields(patch) {
  if (!userId.value || isSaving.value) return
  isSaving.value = true
  statusMessage.value = ''
  try {
    const result = await updateBatteryDay(supabase, userId.value, selectedDate.value, patch)
    day.value = result.day
    entries.value = result.entries
    settings.value = await getBatterySettings(supabase, userId.value)
    statusMessage.value = 'Enregistré'
  } catch (err) {
    console.error(err)
    statusMessage.value = 'Erreur d’enregistrement'
  } finally {
    isSaving.value = false
  }
}

async function onMorningChange(value) {
  morningEnergy.value = value
  await persistDayFields({ morning_energy: value })
}

async function onSleepQualityChange(value) {
  sleepQuality.value = value
  await persistDayFields({ sleep_quality: value })
}

async function onSleepTimesBlur() {
  await persistDayFields({
    sleep_bedtime: sleepBedtime.value || null,
    sleep_wake_time: sleepWakeTime.value || null,
    sleep_out_of_bed_time: sleepOutOfBedTime.value || null,
  })
}

async function onEveningChange(value) {
  eveningFeeling.value = value
  await persistDayFields({ evening_feeling: value })
}

async function refreshEntrySuggestions() {
  if (!userId.value) {
    entrySuggestions.value = []
    return
  }
  const q = entrySearch.value.trim() || entryLabel.value.trim()
  if (!q) {
    entrySuggestions.value = activities.value.slice(0, 8)
    return
  }
  try {
    entrySuggestions.value = await searchBatteryActivities(supabase, userId.value, q)
  } catch {
    entrySuggestions.value = []
  }
}

function pickSuggestion(activity) {
  entryLabel.value = activity.name
  entryCost.value = Number(activity.default_cost) || 1
  entryActivityId.value = activity.id
  entrySearch.value = activity.name
  entrySuggestions.value = []
}

async function submitEntry() {
  if (!userId.value || !entryLabel.value.trim()) return
  isSaving.value = true
  statusMessage.value = ''
  try {
    const result = await addBatteryEntry(supabase, userId.value, selectedDate.value, {
      label: entryLabel.value,
      cost: Math.round(Number(entryCost.value) || 0),
      kind: entryKind.value,
      activity_id: entryActivityId.value || null,
    })
    day.value = result.day
    entries.value = result.entries
    entryLabel.value = ''
    entryCost.value = 1
    entryActivityId.value = ''
    entrySearch.value = ''
    await loadActivities()
    statusMessage.value =
      entryKind.value === BATTERY_ENTRY_KINDS.PLANNED ? 'Ajouté au plan' : 'Activité ajoutée'
  } catch (err) {
    console.error(err)
    statusMessage.value = err?.message || 'Erreur'
  } finally {
    isSaving.value = false
  }
}

async function onEntryCostChange(entry, event) {
  const cost = Math.round(Number(event.target.value) || 0)
  try {
    const result = await updateBatteryEntry(supabase, userId.value, entry.id, { cost })
    day.value = result.day
    entries.value = result.entries
    await loadActivities()
  } catch (err) {
    console.error(err)
  }
}

async function removeEntry(entry) {
  try {
    const result = await deleteBatteryEntry(supabase, userId.value, entry.id)
    day.value = result.day
    entries.value = result.entries
  } catch (err) {
    console.error(err)
  }
}

async function doCopyPlanned() {
  try {
    const result = await copyPlannedToActual(supabase, userId.value, selectedDate.value)
    day.value = result.day
    entries.value = result.entries
    statusMessage.value = 'Plan copié vers le réel'
  } catch (err) {
    console.error(err)
  }
}

function shiftSelected(delta) {
  selectedDate.value = shiftDayIso(selectedDate.value, delta)
}

function goToday() {
  selectedDate.value = getLocalTodayISO()
}

function goCatalog() {
  router.push({
    name: 'battery-catalogue',
    query: { date: selectedDate.value },
  })
}

function goHistory() {
  router.push({
    name: 'battery-historique',
    query: { date: selectedDate.value },
  })
}

function openDayPicker() {
  const input = dayPickerRef.value
  if (!input) return
  if (typeof input.showPicker === 'function') input.showPicker()
  else input.click()
}

function onDayPickerChange(event) {
  const next = event.target?.value
  if (next) selectedDate.value = next
}

watch(selectedDate, () => {
  loadDay()
})

watch([entrySearch, entryLabel], () => {
  refreshEntrySuggestions()
})

onMounted(async () => {
  const qDate = String(route.query.date || '')
  if (/^\d{4}-\d{2}-\d{2}$/.test(qDate)) selectedDate.value = qDate

  const user = await resolveSessionUser()
  if (!user) return
  userId.value = user.id
  await loadActivities()
  await loadDay()
})
</script>

<template>
  <div class="battery-page">
    <div class="bg-blob bg-blob--a" aria-hidden="true" />
    <div class="bg-blob bg-blob--b" aria-hidden="true" />

    <header class="page-header">
      <h1 class="page-title">{{ pageTitle }}</h1>
      <p class="page-subtitle">
        Suis ton énergie du jour — base {{ settings.base_energy }}, ajustée au ressenti.
      </p>
    </header>

    <div class="calendar-controls">
      <div class="navigation-group">
        <button type="button" class="nav-arrow" aria-label="Jour précédent" @click="shiftSelected(-1)">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div class="nav-title">
          <button type="button" class="nav-title__date-btn" :title="`Choisir une date — ${periodLabel}`" @click="openDayPicker">
            <span class="nav-title__main">{{ periodLabel }}</span>
            <span v-if="isToday" class="nav-title__badge">Aujourd’hui</span>
          </button>
          <input
            ref="dayPickerRef"
            type="date"
            class="nav-date-input"
            :value="selectedDate"
            tabindex="-1"
            aria-label="Choisir une date"
            @change="onDayPickerChange"
          />
        </div>

        <button type="button" class="nav-arrow" aria-label="Jour suivant" @click="shiftSelected(1)">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <div class="action-group">
        <button v-if="!isToday" type="button" class="today-btn" @click="goToday">Aujourd’hui</button>
        <div class="action-stack">
          <button type="button" class="catalog-btn" @click="goCatalog">Catalogue</button>
          <button type="button" class="history-btn" @click="goHistory">Historique</button>
        </div>
      </div>
    </div>

    <p v-if="loadError" class="flash flash--error">{{ loadError }}</p>
    <p v-else-if="isLoading" class="flash">Chargement…</p>

    <template v-else>
      <!-- Jauge hero -->
      <section class="hero-card">
        <div class="hero-card__top">
          <p class="hero-kicker">Énergie du jour</p>
          <ul class="hero-meta">
            <li><span>Budget</span><strong>{{ budget }}</strong></li>
            <li><span>Dépensé</span><strong>{{ spent }}</strong></li>
            <li v-if="day?.carryover"><span>Report</span><strong>{{ day.carryover }}</strong></li>
          </ul>
        </div>
        <BatteryGauge :budget="budget" :spent="spent" size="md" />
        <p v-if="statusMessage" class="hero-status">{{ statusMessage }}</p>
      </section>

      <!-- Réveil / sommeil -->
      <section class="check-panel">
        <div class="check-row">
          <div class="check-block">
            <p class="check-label">Énergie au réveil</p>
            <div class="mini-chips">
              <button
                v-for="n in 5"
                :key="n"
                type="button"
                class="mini-chip"
                :class="{ 'is-active': morningEnergy === n }"
                :title="BATTERY_MORNING_LABELS[n]"
                @click="onMorningChange(n)"
              >
                {{ n }}
              </button>
            </div>
          </div>
          <div class="check-block">
            <p class="check-label">Qualité du sommeil</p>
            <div class="mini-chips">
              <button
                v-for="opt in BATTERY_SLEEP_QUALITIES"
                :key="opt.id"
                type="button"
                class="mini-chip mini-chip--text"
                :class="{ 'is-active': sleepQuality === opt.id }"
                @click="onSleepQualityChange(opt.id)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
        </div>

        <div class="sleep-times">
          <label class="sleep-time-field">
            <span>Coucher</span>
            <input v-model="sleepBedtime" type="time" @change="onSleepTimesBlur" />
          </label>
          <label class="sleep-time-field">
            <span>Réveil</span>
            <input v-model="sleepWakeTime" type="time" @change="onSleepTimesBlur" />
          </label>
          <label class="sleep-time-field">
            <span>Sortie du lit</span>
            <input v-model="sleepOutOfBedTime" type="time" @change="onSleepTimesBlur" />
          </label>
        </div>

        <div class="sleep-metrics">
          <p class="sleep-metric">
            Sommeil
            <strong>
              {{ sleepDurationHours != null ? `${sleepDurationHours} h` : '—' }}
            </strong>
          </p>
          <p class="sleep-metric">
            Au lit après réveil
            <strong>{{ formatMinutesAsHm(lieInGapMinutes) }}</strong>
          </p>
        </div>
      </section>

      <!-- Activités du jour (prévu + réel) -->
      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">Activités</h2>
          <div class="kind-toggle" role="group" aria-label="Type d’entrée">
            <button
              type="button"
              class="kind-toggle__btn"
              :class="{ 'is-active': entryKind === BATTERY_ENTRY_KINDS.ACTUAL }"
              @click="entryKind = BATTERY_ENTRY_KINDS.ACTUAL"
            >
              Réel
            </button>
            <button
              type="button"
              class="kind-toggle__btn"
              :class="{ 'is-active': entryKind === BATTERY_ENTRY_KINDS.PLANNED }"
              @click="entryKind = BATTERY_ENTRY_KINDS.PLANNED"
            >
              Plan
            </button>
          </div>
        </div>

        <div class="plan-summary" :class="{ 'is-over': planOverBudget }">
          <span>Total prévu <strong>{{ plannedSpent }}</strong></span>
          <span class="dot">·</span>
          <span>Total réel <strong>{{ spent }}</strong></span>
          <span class="dot">·</span>
          <span>Écart <strong>{{ spent - plannedSpent }}</strong></span>
          <span v-if="planOverBudget" class="over-pill">dépassement prévu</span>
          <button
            v-if="plannedEntries.length && !actualEntries.length"
            type="button"
            class="link-btn"
            @click="doCopyPlanned"
          >
            Copier le plan → réel
          </button>
        </div>

        <form class="entry-form" @submit.prevent="submitEntry">
          <div class="entry-search-wrap">
            <input
              v-model="entrySearch"
              type="search"
              placeholder="Chercher dans le catalogue…"
              autocomplete="off"
              @focus="refreshEntrySuggestions"
            />
            <ul v-if="entrySuggestions.length" class="suggestions">
              <li v-for="a in entrySuggestions" :key="a.id">
                <button type="button" @click="pickSuggestion(a)">
                  <span>{{ a.name }}</span>
                  <span class="cost-tag" :class="`cost-tag--${costStyleClass(a.default_cost)}`">
                    {{ formatCost(a.default_cost) }}
                  </span>
                </button>
              </li>
            </ul>
          </div>
          <div class="entry-form__row">
            <input
              v-model="entryLabel"
              class="entry-form__label"
              type="text"
              placeholder="Libellé (hors catalogue OK)"
              required
            />
            <input
              v-model.number="entryCost"
              class="entry-form__cost"
              type="number"
              step="1"
              title="Positif = dépense, négatif = regain"
            />
            <button type="submit" class="primary-btn entry-form__submit" :disabled="isSaving">
              {{ entryKind === BATTERY_ENTRY_KINDS.PLANNED ? 'Planifier' : 'Ajouter' }}
            </button>
          </div>
        </form>

        <div class="lists-grid">
          <div class="list-col list-col--plan">
            <h3 class="list-col__title">Prévu</h3>
            <ul class="entry-list">
              <li
                v-for="entry in plannedEntries"
                :key="entry.id"
                class="entry-row"
                :class="`entry-row--${costStyleClass(entry.cost)}`"
              >
                <span class="entry-label">{{ entry.label }}</span>
                <span class="cost-tag" :class="`cost-tag--${costStyleClass(entry.cost)}`">
                  {{ formatCost(entry.cost) }}
                </span>
                <input
                  class="entry-cost-input"
                  type="number"
                  :value="entry.cost"
                  @change="onEntryCostChange(entry, $event)"
                />
                <button type="button" class="icon-btn" aria-label="Supprimer" @click="removeEntry(entry)">×</button>
              </li>
              <li v-if="!plannedEntries.length" class="empty-line">Rien de planifié</li>
            </ul>
          </div>
          <div class="list-col list-col--actual">
            <h3 class="list-col__title">Réel</h3>
            <ul class="entry-list">
              <li
                v-for="entry in actualEntries"
                :key="entry.id"
                class="entry-row"
                :class="`entry-row--${costStyleClass(entry.cost)}`"
              >
                <span class="entry-label">{{ entry.label }}</span>
                <span class="cost-tag" :class="`cost-tag--${costStyleClass(entry.cost)}`">
                  {{ formatCost(entry.cost) }}
                </span>
                <input
                  class="entry-cost-input"
                  type="number"
                  :value="entry.cost"
                  @change="onEntryCostChange(entry, $event)"
                />
                <button type="button" class="icon-btn" aria-label="Supprimer" @click="removeEntry(entry)">×</button>
              </li>
              <li v-if="!actualEntries.length" class="empty-line">Aucune activité réelle</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Ressenti du soir -->
      <section class="panel evening-panel">
        <h2 class="panel__title">Ressenti du soir</h2>
        <p class="panel__hint">Comment tu as fini la journée ?</p>
        <div class="evening-cards">
          <button
            v-for="opt in BATTERY_EVENING_FEELINGS"
            :key="opt.id"
            type="button"
            class="evening-card"
            :class="[`evening-card--${EVENING_META[opt.id].tone}`, { 'is-active': eveningFeeling === opt.id }]"
            @click="onEveningChange(opt.id)"
          >
            <span class="evening-card__dot" aria-hidden="true" />
            <span class="evening-card__label">{{ EVENING_META[opt.id].label }}</span>
            <span class="evening-card__hint">{{ EVENING_META[opt.id].hint }}</span>
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.battery-page {
  position: relative;
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
  overflow: hidden;
}

.bg-blob {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  z-index: 0;
  filter: blur(2px);
}

.bg-blob--a {
  width: 420px;
  height: 420px;
  top: -120px;
  right: -80px;
  background: radial-gradient(circle, rgba(213, 181, 234, 0.35) 0%, transparent 70%);
}

.bg-blob--b {
  width: 360px;
  height: 360px;
  bottom: 10%;
  left: -100px;
  background: radial-gradient(circle, rgba(149, 209, 170, 0.22) 0%, transparent 70%);
}

.page-header,
.calendar-controls,
.hero-card,
.check-panel,
.panel,
.flash {
  position: relative;
  z-index: 1;
}

.page-header {
  margin-bottom: 1.5rem;
  text-align: center;
}

.page-title {
  margin: 0;
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  letter-spacing: -0.5px;
}

.page-subtitle {
  margin: 0.5rem auto 0;
  max-width: 520px;
  color: #6c757d;
  font-size: 1rem;
  line-height: 1.45;
}

.calendar-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}

.navigation-group {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex: 1;
  min-width: 0;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  padding: 0.5rem 1rem;
  border-radius: 16px;
  border: 1px solid rgba(213, 181, 234, 0.3);
  box-shadow: 0 4px 12px rgba(173, 129, 190, 0.05);
}

.nav-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: none;
  border-radius: 12px;
  background: rgba(213, 181, 234, 0.18);
  color: #ad81be;
  cursor: pointer;
  flex-shrink: 0;
}

.nav-arrow svg {
  width: 1.1rem;
  height: 1.1rem;
}

.nav-arrow:hover {
  background: rgba(173, 129, 190, 0.28);
}

.nav-title {
  position: relative;
  flex: 1;
  text-align: center;
  min-width: 0;
}

.nav-title__date-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0.15rem 0.35rem;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
}

.nav-title__main {
  font-size: 1.05rem;
  font-weight: 800;
  color: #2c3e50;
  text-transform: capitalize;
}

.nav-title__badge {
  font-size: 0.72rem;
  font-weight: 700;
  color: #ad81be;
  background: rgba(213, 181, 234, 0.28);
  border-radius: 999px;
  padding: 0.12rem 0.55rem;
}

.nav-date-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
  width: 0;
  height: 0;
}

.action-group {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: flex-start;
}

.action-stack {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 8.5rem;
}

.today-btn,
.catalog-btn,
.history-btn,
.primary-btn {
  border: none;
  border-radius: 12px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.today-btn {
  padding: 0.55rem 0.95rem;
  background: rgba(255, 255, 255, 0.85);
  color: #ad81be;
  border: 1px solid rgba(213, 181, 234, 0.4);
}

.catalog-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 0.55rem 1rem;
  background: linear-gradient(135deg, #ad81be, #8fa2d4);
  color: #fff;
  box-shadow: 0 4px 14px rgba(173, 129, 190, 0.28);
  box-sizing: border-box;
}

.history-btn {
  width: 100%;
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: #8a7a98;
  background: transparent;
  border: 1px solid transparent;
  box-sizing: border-box;
}

.history-btn:hover {
  color: #ad81be;
  border-color: rgba(213, 181, 234, 0.4);
  background: rgba(213, 181, 234, 0.12);
}

.primary-btn {
  padding: 0 0.95rem;
  background: #ad81be;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.5rem;
  box-sizing: border-box;
}

.primary-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.hero-card {
  background: linear-gradient(
    145deg,
    rgba(255, 255, 255, 0.82) 0%,
    rgba(213, 181, 234, 0.16) 55%,
    rgba(149, 209, 170, 0.12) 100%
  );
  backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.4);
  border-radius: 16px;
  padding: 0.85rem 1.1rem 1rem;
  margin-bottom: 0.85rem;
  box-shadow: 0 6px 20px rgba(173, 129, 190, 0.07);
}

.hero-card__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem 1rem;
  margin-bottom: 0.65rem;
}

.hero-kicker {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #ad81be;
}

.hero-meta {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: 0.85rem;
  flex-wrap: wrap;
}

.hero-meta li {
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
  min-width: 3.2rem;
}

.hero-meta span {
  font-size: 0.68rem;
  font-weight: 600;
  color: #8a9098;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.hero-meta strong {
  font-size: 0.95rem;
  color: #2c3e50;
  font-variant-numeric: tabular-nums;
}

.hero-status {
  margin: 0.55rem 0 0;
  text-align: center;
  font-size: 0.85rem;
  font-weight: 600;
  color: #5a9e78;
}

.check-panel {
  margin-bottom: 1rem;
  padding: 1rem 1.15rem 1.1rem;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgba(213, 181, 234, 0.28);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.check-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.9rem 1.35rem;
}

.check-block {
  flex: 1;
  min-width: 160px;
}

.check-label {
  margin: 0 0 0.45rem;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #8a9098;
}

.mini-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.mini-chip {
  border: 1px solid rgba(173, 129, 190, 0.3);
  background: rgba(255, 255, 255, 0.7);
  border-radius: 9px;
  min-width: 2.15rem;
  height: 2.15rem;
  padding: 0 0.55rem;
  font-size: 0.88rem;
  font-weight: 700;
  color: #6c757d;
  cursor: pointer;
}

.mini-chip--text {
  min-width: 0;
  height: auto;
  padding: 0.4rem 0.7rem;
  font-size: 0.82rem;
}

.mini-chip.is-active {
  background: rgba(173, 129, 190, 0.35);
  border-color: rgba(173, 129, 190, 0.65);
  color: #2c3e50;
}

.sleep-times {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.65rem;
}

.sleep-time-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #8a9098;
}

.sleep-time-field input {
  border: 1px solid rgba(213, 181, 234, 0.4);
  border-radius: 9px;
  padding: 0.5rem 0.55rem;
  background: rgba(255, 255, 255, 0.85);
  font: inherit;
  font-size: 0.95rem;
  font-weight: 600;
  color: #2c3e50;
  text-transform: none;
  letter-spacing: normal;
}

.sleep-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.25rem;
}

.sleep-metric {
  margin: 0;
  font-size: 0.88rem;
  color: #6c757d;
}

.sleep-metric strong {
  margin-left: 0.35rem;
  color: #2c3e50;
  font-variant-numeric: tabular-nums;
}

.panel {
  background: rgba(255, 255, 255, 0.68);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 18px;
  padding: 1.15rem 1.1rem 1.3rem;
  margin-bottom: 1rem;
}

.panel__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  margin-bottom: 0.75rem;
}

.panel__title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: #2c3e50;
}

.panel__hint {
  margin: 0.35rem 0 0.85rem;
  font-size: 0.9rem;
  color: #6c757d;
}

.kind-toggle {
  display: flex;
  padding: 0.22rem;
  border-radius: 10px;
  background: rgba(213, 181, 234, 0.15);
  border: 1px solid rgba(213, 181, 234, 0.3);
}

.kind-toggle__btn {
  border: none;
  border-radius: 8px;
  padding: 0.4rem 0.75rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: #6c757d;
  background: transparent;
  cursor: pointer;
}

.kind-toggle__btn.is-active {
  background: #fff;
  color: #ad81be;
  box-shadow: 0 2px 6px rgba(173, 129, 190, 0.12);
}

.plan-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.55rem;
  margin-bottom: 0.9rem;
  padding: 0.55rem 0.75rem;
  border-radius: 12px;
  background: rgba(143, 162, 212, 0.12);
  font-size: 0.88rem;
  color: #495057;
}

.plan-summary.is-over {
  background: rgba(232, 160, 192, 0.18);
}

.plan-summary .dot {
  opacity: 0.4;
}

.over-pill {
  font-size: 0.75rem;
  font-weight: 700;
  color: #c45c5c;
  background: rgba(196, 92, 92, 0.12);
  border-radius: 999px;
  padding: 0.15rem 0.55rem;
}

.link-btn {
  border: none;
  background: none;
  color: #7a5a8e;
  font: inherit;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
  margin-left: auto;
}

.entry-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.entry-form__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 5rem 7.5rem;
  gap: 0.5rem;
  align-items: stretch;
}

.entry-form__label,
.entry-form__cost,
.entry-form__submit {
  width: 100%;
  box-sizing: border-box;
}

.entry-form__submit {
  min-width: 0;
}

.entry-search-wrap {
  position: relative;
  width: 100%;
}

.entry-search-wrap input,
.entry-form input,
.entry-cost-input {
  border: 1px solid rgba(213, 181, 234, 0.45);
  border-radius: 10px;
  padding: 0.5rem 0.65rem;
  background: rgba(255, 255, 255, 0.88);
  color: #2c3e50;
  font: inherit;
}

.entry-search-wrap input {
  width: 100%;
  box-sizing: border-box;
}

.suggestions {
  position: absolute;
  z-index: 6;
  left: 0;
  right: 0;
  margin: 0.25rem 0 0;
  padding: 0.25rem;
  list-style: none;
  background: #fff;
  border: 1px solid rgba(213, 181, 234, 0.45);
  border-radius: 12px;
  max-height: 200px;
  overflow: auto;
  box-shadow: 0 10px 28px rgba(44, 62, 80, 0.12);
}

.suggestions button {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  border: none;
  background: transparent;
  padding: 0.45rem 0.55rem;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  font: inherit;
}

.suggestions button:hover {
  background: rgba(213, 181, 234, 0.2);
}

.lists-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.list-col {
  border-radius: 14px;
  padding: 0.75rem;
  min-height: 4rem;
}

.list-col--plan {
  background: rgba(143, 162, 212, 0.12);
  border: 1px solid rgba(143, 162, 212, 0.28);
}

.list-col--actual {
  background: rgba(149, 209, 170, 0.12);
  border: 1px solid rgba(149, 209, 170, 0.28);
}

.list-col__title {
  margin: 0 0 0.55rem;
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #6c757d;
}

.entry-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}

.entry-row {
  display: grid;
  grid-template-columns: 1fr auto 4.2rem auto;
  align-items: center;
  gap: 0.4rem;
  border-radius: 10px;
  padding: 0.25rem 0.35rem;
}

.entry-row--drain-1 { background: rgba(250, 230, 238, 0.7); }
.entry-row--drain-2 { background: rgba(244, 200, 218, 0.55); }
.entry-row--drain-3 { background: rgba(232, 160, 192, 0.4); }
.entry-row--drain-4 { background: rgba(212, 120, 150, 0.35); }
.entry-row--drain-5 { background: rgba(180, 70, 100, 0.32); }

.entry-row--restore-1 { background: rgba(232, 245, 236, 0.75); }
.entry-row--restore-2 { background: rgba(200, 232, 210, 0.55); }
.entry-row--restore-3 { background: rgba(149, 209, 170, 0.4); }
.entry-row--restore-4 { background: rgba(90, 170, 120, 0.35); }
.entry-row--restore-5 { background: rgba(45, 120, 80, 0.32); }

.entry-label {
  font-weight: 600;
  color: #2c3e50;
  font-size: 0.92rem;
}

.entry-cost-input {
  width: 100%;
  text-align: center;
  padding: 0.35rem 0.25rem;
}

.cost-tag {
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  font-size: 0.85rem;
  color: #6c757d;
  border-radius: 999px;
  padding: 0.15rem 0.45rem;
}

.cost-tag--neutral {
  background: rgba(173, 129, 190, 0.18);
  color: #6c757d;
}

.cost-tag--drain-1,
.cost-tag--drain-2 {
  background: rgba(232, 160, 192, 0.35);
  color: #9a3d5c;
}
.cost-tag--drain-3 {
  background: rgba(217, 120, 160, 0.45);
  color: #8a2d4c;
}
.cost-tag--drain-4,
.cost-tag--drain-5 {
  background: rgba(180, 70, 100, 0.5);
  color: #5c1830;
}

.cost-tag--restore-1,
.cost-tag--restore-2 {
  background: rgba(149, 209, 170, 0.35);
  color: #2f6b4a;
}
.cost-tag--restore-3 {
  background: rgba(90, 170, 120, 0.45);
  color: #1e5a38;
}
.cost-tag--restore-4,
.cost-tag--restore-5 {
  background: rgba(45, 120, 80, 0.5);
  color: #0f3d28;
}

.icon-btn {
  border: none;
  background: transparent;
  color: #c45c5c;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.15rem 0.35rem;
  border-radius: 8px;
}

.icon-btn:hover {
  background: rgba(196, 92, 92, 0.1);
}

.empty-line {
  color: #8a9098;
  font-size: 0.88rem;
  padding: 0.25rem 0;
}

.evening-panel {
  background: linear-gradient(
    160deg,
    rgba(255, 255, 255, 0.7) 0%,
    rgba(232, 160, 192, 0.12) 100%
  );
}

.evening-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.evening-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  text-align: center;
  border: 1.5px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.7);
  border-radius: 16px;
  padding: 1rem 0.65rem;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.evening-card:hover {
  transform: translateY(-2px);
}

.evening-card.is-active {
  box-shadow: 0 6px 18px rgba(173, 129, 190, 0.18);
}

.evening-card--empty.is-active {
  border-color: #e8a0c0;
  background: rgba(232, 160, 192, 0.22);
}

.evening-card--just.is-active {
  border-color: #8fa2d4;
  background: rgba(143, 162, 212, 0.22);
}

.evening-card--left.is-active {
  border-color: #95d1aa;
  background: rgba(149, 209, 170, 0.22);
}

.evening-card__dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-bottom: 0.15rem;
  background: #ad81be;
}

.evening-card--empty .evening-card__dot {
  background: linear-gradient(135deg, #e8a0c0, #c45c5c);
}

.evening-card--just .evening-card__dot {
  background: linear-gradient(135deg, #8fa2d4, #ad81be);
}

.evening-card--left .evening-card__dot {
  background: linear-gradient(135deg, #95d1aa, #72a098);
}

.evening-card__label {
  font-weight: 800;
  font-size: 0.95rem;
  color: #2c3e50;
}

.evening-card__hint {
  font-size: 0.75rem;
  color: #8a9098;
  line-height: 1.3;
}

.flash {
  margin: 0 0 1rem;
  color: #6c757d;
  font-size: 0.95rem;
}

.flash--error {
  color: #c45c5c;
  font-weight: 600;
}

@media (max-width: 860px) {
  .lists-grid,
  .evening-cards {
    grid-template-columns: 1fr;
  }

  .entry-form__row {
    grid-template-columns: 1fr;
  }

  .entry-form__submit {
    width: 100%;
  }

  .sleep-times {
    grid-template-columns: 1fr;
  }
}

@media (prefers-color-scheme: dark) {
  .page-title,
  .nav-title__main,
  .hero-meta strong,
  .panel__title,
  .entry-label,
  .evening-card__label {
    color: #f0e8f8;
  }

  .page-subtitle,
  .panel__hint,
  .check-label,
  .list-col__title,
  .empty-line,
  .flash,
  .evening-card__hint {
    color: #adb5bd;
  }

  .navigation-group,
  .hero-card,
  .check-panel,
  .panel,
  .evening-card,
  .mini-chip,
  .entry-form input,
  .entry-cost-input,
  .sleep-time-field input,
  .today-btn {
    background: rgba(35, 30, 48, 0.78);
    border-color: rgba(213, 181, 234, 0.22);
    color: #f0e8f8;
  }

  .sleep-metric strong {
    color: #f0e8f8;
  }

  .kind-toggle__btn.is-active {
    background: rgba(55, 45, 70, 0.95);
  }

  .suggestions {
    background: #2a2438;
    border-color: rgba(213, 181, 234, 0.25);
  }

  .list-col--plan {
    background: rgba(143, 162, 212, 0.12);
  }

  .list-col--actual {
    background: rgba(149, 209, 170, 0.1);
  }
}
</style>
