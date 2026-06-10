<script setup>
import { ref, computed, watch } from 'vue'
import { supabase } from '../lib/supabase.js'
import { getLocalTodayISO } from '../services/scheduledReminders.js'
import { listHabitLogsForRange, upsertHabitLog } from '../services/habitLogs.js'
import { HABIT_VALUE_TYPE } from '../constants/habitOptions.js'
import { addDaysISO, normalizeDateISO } from '../utils/habitCalendar.js'
import {
  buildLogPayload,
  computeHabitStats,
  formatStatNumber,
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
})

const emit = defineEmits(['saved'])

const selectedDate = ref(getLocalTodayISO())
const inputValue = ref(0)
const logsByDate = ref({})
const isLoading = ref(false)
const isSaving = ref(false)
const loadError = ref('')
const saveError = ref('')
const saveMessage = ref('')

const isBoolean = computed(() => props.habit.type_valeur === HABIT_VALUE_TYPE.BOOLEAN)

const todayIso = computed(() => getLocalTodayISO())

const canEditEntry = computed(() => !isSaving.value)

const valueLabel = computed(() => {
  if (isBoolean.value) return 'Statut du jour'
  return props.habit.unite ? `Valeur (${props.habit.unite})` : 'Valeur du jour'
})

const stats = computed(() =>
  computeHabitStats(logsByDate.value, todayIso.value, selectedDate.value),
)

const formattedSelectedDate = computed(() => {
  const [y, m, d] = selectedDate.value.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
})

function syncInputFromLog() {
  const log = logsByDate.value[selectedDate.value]
  if (!log || log.fait === false) {
    inputValue.value = 0
    return
  }
  inputValue.value = Math.max(0, Number(log.valeur ?? 0))
}

async function loadStatsLogs() {
  if (!props.userId || !props.habit?.id) return

  isLoading.value = true
  loadError.value = ''
  const today = todayIso.value
  const start = addDaysISO(today, -30)

  try {
    const rows = await listHabitLogsForRange(
      supabase,
      props.userId,
      props.habit.id,
      start,
      today,
    )
    const map = {}
    for (const row of rows) {
      map[normalizeDateISO(row.date_jour)] = { ...row, date_jour: normalizeDateISO(row.date_jour) }
    }
    logsByDate.value = map
    syncInputFromLog()
  } catch (err) {
    console.error(err)
    loadError.value = err.message || 'Impossible de charger les statistiques.'
    logsByDate.value = {}
  } finally {
    isLoading.value = false
  }
}

async function persistValue() {
  if (!props.userId || !props.habit?.id) return
  if (selectedDate.value > todayIso.value) {
    saveError.value = 'Impossible de renseigner une date future.'
    return
  }

  isSaving.value = true
  saveError.value = ''
  saveMessage.value = ''

  try {
    const payload = buildLogPayload(inputValue.value, props.habit.type_valeur)
    const row = await upsertHabitLog(
      supabase,
      props.userId,
      props.habit.id,
      selectedDate.value,
      payload,
    )
    logsByDate.value = {
      ...logsByDate.value,
      [selectedDate.value]: { ...row, date_jour: normalizeDateISO(row.date_jour) },
    }
    inputValue.value = Math.max(0, Number(row.valeur ?? 0))
    saveMessage.value = 'Enregistré.'
    emit('saved', selectedDate.value)
    setTimeout(() => {
      saveMessage.value = ''
    }, 2000)
  } catch (err) {
    console.error(err)
    saveError.value = err.message || 'Impossible d’enregistrer.'
  } finally {
    isSaving.value = false
  }
}

function increment() {
  inputValue.value = Math.max(0, Number(inputValue.value) + 1)
  void persistValue()
}

function decrement() {
  inputValue.value = Math.max(0, Number(inputValue.value) - 1)
  void persistValue()
}

function onInputBlur() {
  const normalized = Math.max(0, Number(inputValue.value) || 0)
  inputValue.value = normalized
  void persistValue()
}

function onBooleanToggle(event) {
  inputValue.value = event.target.checked ? 1 : 0
  void persistValue()
}

watch(
  () => [props.habit?.id, props.refreshKey],
  () => {
    loadStatsLogs()
  },
  { immediate: true },
)

watch(selectedDate, (date) => {
  if (date > todayIso.value) {
    selectedDate.value = todayIso.value
    saveError.value = 'Les dates futures ne sont pas autorisées.'
    return
  }
  saveError.value = ''
  syncInputFromLog()
})
</script>

<template>
  <div class="habit-entry" :style="{ '--habit-color': habit.couleur }">
    <label class="habit-entry__field habit-entry__field--date">
      <span>Date</span>
      <input
        v-model="selectedDate"
        type="date"
        class="habit-entry__date"
        :max="todayIso"
      />
    </label>
    <p class="habit-entry__date-label">{{ formattedSelectedDate }}</p>

    <div v-if="isBoolean" class="habit-entry__boolean">
      <label class="habit-entry__toggle">
        <input
          type="checkbox"
          class="habit-entry__toggle-input"
          :checked="inputValue > 0"
          :disabled="!canEditEntry"
          @change="onBooleanToggle"
        />
        <span class="habit-entry__toggle-ui" aria-hidden="true" />
        <span class="habit-entry__toggle-label">Fait</span>
      </label>
    </div>

    <label v-else class="habit-entry__field">
      <span>{{ valueLabel }}</span>
      <div class="habit-entry__stepper">
        <button
          type="button"
          class="habit-entry__step-btn"
          :disabled="!canEditEntry || inputValue <= 0"
          aria-label="Diminuer"
          @click="decrement"
        >
          −
        </button>
        <input
          v-model.number="inputValue"
          type="number"
          min="0"
          step="1"
          class="habit-entry__value-input"
          :disabled="!canEditEntry"
          @blur="onInputBlur"
          @keydown.enter.prevent="onInputBlur"
        />
        <button
          type="button"
          class="habit-entry__step-btn"
          :disabled="!canEditEntry"
          aria-label="Augmenter"
          @click="increment"
        >
          +
        </button>
      </div>
    </label>

    <p v-if="saveMessage" class="habit-entry__feedback habit-entry__feedback--ok">{{ saveMessage }}</p>
    <p v-if="saveError" class="habit-entry__feedback habit-entry__feedback--error">{{ saveError }}</p>
    <p v-if="loadError" class="habit-entry__feedback habit-entry__feedback--error">{{ loadError }}</p>

    <section v-if="!isLoading" class="habit-entry__stats" aria-label="Statistiques">
      <h3 class="habit-entry__stats-title">Statistiques</h3>
      <dl class="habit-entry__stats-list">
        <div class="habit-entry__stat">
          <dt>Total 7 jours</dt>
          <dd>{{ formatStatNumber(stats.weekTotal, 0) }}</dd>
        </div>
        <div class="habit-entry__stat">
          <dt>Moyenne 7 jours</dt>
          <dd>{{ formatStatNumber(stats.weekAverage) }}</dd>
        </div>
        <div class="habit-entry__stat">
          <dt>Moyenne 30 jours</dt>
          <dd>{{ formatStatNumber(stats.monthAverage) }}</dd>
        </div>
        <div class="habit-entry__stat">
          <dt>Série en cours</dt>
          <dd>{{ stats.streak }} jour{{ stats.streak > 1 ? 's' : '' }}</dd>
        </div>
        <div v-if="!isBoolean" class="habit-entry__stat">
          <dt>Taux 30 jours</dt>
          <dd>{{ formatStatNumber(stats.rate30Days, 2) }}</dd>
        </div>
      </dl>
      <p v-if="!isBoolean" class="habit-entry__stats-hint">
        Taux du jour = valeur du jour ÷ max enregistré sur les 30 derniers jours (entre 0 et 1).
      </p>
    </section>

    <div v-else class="habit-entry__loading">Chargement…</div>
  </div>
</template>

<style scoped>
.habit-entry {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  min-width: 0;
}

.habit-entry__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.habit-entry__field span {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--habit-color, #ad81be);
}

.habit-entry__date,
.habit-entry__value-input {
  padding: 0.55rem 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  font-size: 0.95rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.9);
  color: #2c3e50;
}

.habit-entry__date-label {
  margin: -0.35rem 0 0;
  font-size: 0.88rem;
  color: #6c757d;
  line-height: 1.4;
}

.habit-entry__stepper {
  display: flex;
  align-items: stretch;
  gap: 0.45rem;
}

.habit-entry__step-btn {
  flex-shrink: 0;
  width: 2.5rem;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  font-size: 1.2rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.habit-entry__step-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.habit-entry__step-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.habit-entry__value-input {
  flex: 1;
  min-width: 0;
  text-align: center;
}

.habit-entry__boolean {
  padding: 0.25rem 0;
}

.habit-entry__toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  cursor: pointer;
}

.habit-entry__toggle-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.habit-entry__toggle-ui {
  width: 2.75rem;
  height: 1.5rem;
  border-radius: 999px;
  background: rgba(213, 181, 234, 0.35);
  position: relative;
  transition: background 0.2s ease;
}

.habit-entry__toggle-ui::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 50%;
  background: white;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
  transition: transform 0.2s ease;
}

.habit-entry__toggle-input:checked + .habit-entry__toggle-ui {
  background: var(--habit-color, #ad81be);
}

.habit-entry__toggle-input:checked + .habit-entry__toggle-ui::after {
  transform: translateX(1.25rem);
}

.habit-entry__toggle-label {
  font-size: 0.95rem;
  font-weight: 700;
  color: #2c3e50;
}

.habit-entry__feedback {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
}

.habit-entry__feedback--ok {
  color: #27ae60;
}

.habit-entry__feedback--error {
  color: #c0392b;
}

.habit-entry__stats {
  padding-top: 0.5rem;
  border-top: 1px solid rgba(213, 181, 234, 0.25);
}

.habit-entry__stats-title {
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--habit-color, #ad81be);
}

.habit-entry__stats-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.habit-entry__stat {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.75rem;
}

.habit-entry__stat dt {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: #6c757d;
}

.habit-entry__stat dd {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 800;
  color: #2c3e50;
}

.habit-entry__stats-hint {
  margin: 0.75rem 0 0;
  font-size: 0.78rem;
  color: #8c98a4;
  line-height: 1.4;
}

.habit-entry__loading {
  margin: 0;
  text-align: center;
  color: #6c757d;
  font-size: 0.9rem;
}

@media (prefers-color-scheme: dark) {
  .habit-entry__date,
  .habit-entry__value-input {
    background: rgba(30, 25, 40, 0.9);
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.2);
  }

  .habit-entry__date-label,
  .habit-entry__stat dt {
    color: #adb5bd;
  }

  .habit-entry__toggle-label,
  .habit-entry__stat dd {
    color: #f0e8f8;
  }

  .habit-entry__stats {
    border-top-color: rgba(213, 181, 234, 0.15);
  }

  .habit-entry__stats-hint {
    color: #adb5bd;
  }
}
</style>
