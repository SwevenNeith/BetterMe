<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { supabase } from '../lib/supabase.js'
import { APP_PAGE_IDS } from '../constants/appPages.js'
import { TODO_FREQUENCY, getTodoItemColorClass } from '../constants/todoOptions.js'
import '../styles/todo-frequency.css'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import {
  isPageVisible,
  loadPageVisibility,
  mergePageVisibility,
  PAGE_VISIBILITY_UPDATED_EVENT,
} from '../services/pageVisibility.js'
import { listTodoCompletionsInRange, listTodoItems, setTodoCompletionForDate, setTodoQuantiteForDate } from '../services/todoItems.js'
import {
  buildCompletionProgressMap,
  getTodosForDate,
  getTodoProgressStats,
  hasTodoQuantiteCible,
  getTodoOccurrenceKeyDate,
  normalizeDateISO,
} from '../utils/todoCalendar.js'

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

const { pageTitle: todoPageTitle } = usePageDisplayLabel(APP_PAGE_IDS.TODO)

const pageVisibility = ref(mergePageVisibility(null))
const isLoading = ref(false)
const loadError = ref('')
const items = ref([])
const completionProgress = ref(new Map())

const isTodoPageVisible = computed(() => isPageVisible(APP_PAGE_IDS.TODO, pageVisibility.value))

const todayTodos = computed(() =>
  getTodosForDate(items.value, props.dateIso, completionProgress.value),
)

const progress = computed(() =>
  getTodoProgressStats(items.value, [props.dateIso], completionProgress.value),
)

const progressLabel = computed(() => {
  const stats = progress.value
  if (!stats.total) return ''
  return `${stats.percent}%`
})

async function loadPageVisibilityState() {
  if (!props.userId) {
    pageVisibility.value = mergePageVisibility(null)
    return
  }
  try {
    pageVisibility.value = await loadPageVisibility(supabase, props.userId)
  } catch (err) {
    console.error('dashboard todos visibility:', err)
    pageVisibility.value = mergePageVisibility(null)
  }
}

async function loadTodos() {
  if (!props.userId || !isTodoPageVisible.value) {
    items.value = []
    completionProgress.value = new Map()
    return
  }

  const dateISO = normalizeDateISO(props.dateIso)
  if (!dateISO) return

  isLoading.value = true
  loadError.value = ''
  try {
    const [todoRows, completions] = await Promise.all([
      listTodoItems(supabase, props.userId),
      listTodoCompletionsInRange(supabase, props.userId, dateISO, dateISO),
    ])
    items.value = todoRows
    completionProgress.value = buildCompletionProgressMap(completions)
  } catch (err) {
    console.error('dashboard todos:', err)
    loadError.value = err.message || 'Impossible de charger les tâches du jour.'
    items.value = []
    completionProgress.value = new Map()
  } finally {
    isLoading.value = false
  }
}

async function reload() {
  await loadPageVisibilityState()
  await loadTodos()
}

async function adjustItemQuantite(item, delta) {
  if (!props.userId || !item?.id || !hasTodoQuantiteCible(item)) return

  const dateISO = normalizeDateISO(item.completionDate || item.occurrenceDate || props.dateIso)
  const key = `${item.id}:${getTodoOccurrenceKeyDate(item, dateISO) || dateISO}`
  const cible = Number(item.quantite_cible)
  const current = item.occurrenceQuantiteActuelle ?? 0
  const next = Math.max(0, Math.min(cible, current + delta))

  const prevEntry = completionProgress.value.get(key)
  if (next > 0) {
    completionProgress.value.set(key, { quantite_actuelle: next, binaryDone: true })
  } else {
    completionProgress.value.delete(key)
  }
  completionProgress.value = new Map(completionProgress.value)
  item.occurrenceQuantiteActuelle = next
  item.occurrenceDone = next >= cible
  if (item.frequence === TODO_FREQUENCY.ONE_OFF) {
    item.is_done = item.occurrenceDone
  }

  try {
    await setTodoQuantiteForDate(supabase, props.userId, item, dateISO, next)
  } catch (err) {
    console.error(err)
    if (prevEntry) completionProgress.value.set(key, prevEntry)
    else completionProgress.value.delete(key)
    completionProgress.value = new Map(completionProgress.value)
    item.occurrenceQuantiteActuelle = current
    item.occurrenceDone = current >= cible
    if (item.frequence === TODO_FREQUENCY.ONE_OFF) {
      item.is_done = item.occurrenceDone
    }
    loadError.value = err.message || 'Impossible de mettre à jour la tâche.'
  }
}

async function toggleItem(item) {
  if (!props.userId || !item?.id) return
  if (hasTodoQuantiteCible(item)) {
    const cible = Number(item.quantite_cible)
    const next = item.occurrenceDone ? 0 : cible
    await adjustItemQuantite(item, next - (item.occurrenceQuantiteActuelle ?? 0))
    return
  }

  const dateISO = normalizeDateISO(item.completionDate || item.occurrenceDate || props.dateIso)
  const next = !item.occurrenceDone
  const key = `${item.id}:${getTodoOccurrenceKeyDate(item, dateISO) || dateISO}`

  if (next) completionProgress.value.set(key, { quantite_actuelle: 1, binaryDone: true })
  else completionProgress.value.delete(key)
  completionProgress.value = new Map(completionProgress.value)

  if (item.frequence === TODO_FREQUENCY.ONE_OFF) {
    item.is_done = next
  }
  item.occurrenceDone = next

  try {
    await setTodoCompletionForDate(supabase, props.userId, item, dateISO, next)
  } catch (err) {
    console.error(err)
    if (next) completionProgress.value.delete(key)
    else completionProgress.value.set(key, { quantite_actuelle: 1, binaryDone: true })
    completionProgress.value = new Map(completionProgress.value)
    item.occurrenceDone = !next
    if (item.frequence === TODO_FREQUENCY.ONE_OFF) {
      item.is_done = !next
    }
    loadError.value = err.message || 'Impossible de mettre à jour la tâche.'
  }
}

watch(
  () => [props.userId, props.dateIso],
  () => {
    reload()
  },
)

onMounted(() => {
  reload()
  window.addEventListener(PAGE_VISIBILITY_UPDATED_EVENT, reload)
})

onUnmounted(() => {
  window.removeEventListener(PAGE_VISIBILITY_UPDATED_EVENT, reload)
})
</script>

<template>
  <section v-if="isTodoPageVisible" class="dashboard-todos" aria-labelledby="dashboard-todos-title">
    <div class="dashboard-todos__header">
      <h2 id="dashboard-todos-title" class="dashboard-todos__title">{{ todoPageTitle }}</h2>
      <span v-if="!isLoading && progress.total > 0" class="dashboard-todos__progress">
        {{ progressLabel }}
      </span>
    </div>

    <div v-if="isLoading" class="dashboard-todos__state">
      <span class="spinner" aria-hidden="true"></span>
      Chargement…
    </div>

    <p v-else-if="loadError" class="dashboard-todos__error">{{ loadError }}</p>

    <div v-else-if="todayTodos.length === 0" class="dashboard-todos__state dashboard-todos__state--empty">
      <span class="dashboard-todos__empty-icon" aria-hidden="true">✓</span>
      <p>Aucune tâche prévue aujourd’hui.</p>
    </div>

    <ul v-else class="dashboard-todos__list">
      <li
        v-for="item in todayTodos"
        :key="`${item.id}:${item.occurrenceDate}`"
        class="dashboard-todos__item"
        :class="[
          getTodoItemColorClass(item),
          {
            'dashboard-todos__item--done': item.occurrenceDone,
          },
        ]"
      >
        <div v-if="item.occurrenceQuantiteCible" class="dashboard-todos__quantite">
          <button
            type="button"
            class="dashboard-todos__quantite-btn"
            :disabled="(item.occurrenceQuantiteActuelle ?? 0) <= 0"
            aria-label="Diminuer"
            @click="adjustItemQuantite(item, -1)"
          >
            −
          </button>
          <span class="dashboard-todos__quantite-value">
            {{ item.occurrenceQuantiteActuelle ?? 0 }}/{{ item.occurrenceQuantiteCible }}
          </span>
          <button
            type="button"
            class="dashboard-todos__quantite-btn"
            :disabled="item.occurrenceDone"
            aria-label="Augmenter"
            @click="adjustItemQuantite(item, 1)"
          >
            +
          </button>
        </div>
        <label
          v-else
          class="dashboard-todos__check"
          :title="item.occurrenceDone ? 'Marquer comme à faire' : 'Marquer comme fait'"
        >
          <input
            type="checkbox"
            class="dashboard-todos__check-input"
            :checked="item.occurrenceDone"
            @change="toggleItem(item)"
          />
          <span class="dashboard-todos__check-box" aria-hidden="true" />
        </label>
        <span class="dashboard-todos__label">{{ item.nom }}</span>
        <span v-if="item.is_promesse" class="dashboard-todos__badge">Promesse</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.dashboard-todos {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 0.85rem 1rem;
  border-radius: 16px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
}

.dashboard-todos__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.dashboard-todos__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: #ad81be;
}

.dashboard-todos__progress {
  flex-shrink: 0;
  font-size: 0.82rem;
  font-weight: 800;
  color: #27ae60;
}

.dashboard-todos__state {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #6c757d;
  font-weight: 700;
  font-size: 0.9rem;
}

.dashboard-todos__state--empty {
  flex-direction: column;
  text-align: center;
  padding: 0.35rem 0;
}

.dashboard-todos__state--empty p {
  margin: 0;
}

.dashboard-todos__empty-icon {
  font-size: 1.25rem;
  opacity: 0.65;
}

.dashboard-todos__error {
  margin: 0;
  color: #c0392b;
  font-weight: 700;
  font-size: 0.88rem;
}

.dashboard-todos__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.dashboard-todos__item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.55rem;
  border-radius: 10px;
  border: 1px solid var(--todo-freq-border, rgba(213, 181, 234, 0.25));
  border-left-width: 3px;
  border-left-color: var(--todo-freq-accent, #ad81be);
  background: var(--todo-freq-bg, rgba(213, 181, 234, 0.08));
}

.dashboard-todos__item--done {
  opacity: 0.72;
}

.dashboard-todos__check {
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
  cursor: pointer;
}

.dashboard-todos__check-input {
  position: absolute;
  opacity: 0;
  width: 1rem;
  height: 1rem;
  margin: 0;
  cursor: pointer;
}

.dashboard-todos__check-box {
  display: block;
  width: 1rem;
  height: 1rem;
  border-radius: 4px;
  border: 2px solid rgba(173, 129, 190, 0.65);
  background: white;
}

.dashboard-todos__check-input:checked + .dashboard-todos__check-box {
  background: linear-gradient(135deg, #2ecc71, #27ae60);
  border-color: #27ae60;
  box-shadow: inset 0 0 0 2px white;
}

.dashboard-todos__label {
  flex: 1;
  min-width: 0;
  font-weight: 700;
  font-size: 0.9rem;
  color: #2c3e50;
  overflow-wrap: anywhere;
}

.dashboard-todos__item--done .dashboard-todos__label {
  text-decoration: line-through;
  color: #7f8c8d;
}

.dashboard-todos__badge {
  flex-shrink: 0;
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--todo-freq-accent, #d4a06a);
}

.dashboard-todos__quantite {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
}

.dashboard-todos__quantite-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.45rem;
  height: 1.45rem;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.85);
  color: #ad81be;
  font-size: 0.95rem;
  font-weight: 800;
  cursor: pointer;
}

.dashboard-todos__quantite-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.dashboard-todos__quantite-value {
  min-width: 2.4rem;
  text-align: center;
  font-size: 0.78rem;
  font-weight: 800;
  color: #2c3e50;
}

.spinner {
  display: inline-block;
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(173, 129, 190, 0.25);
  border-top-color: #ad81be;
  border-radius: 50%;
  animation: dashboard-todos-spin 0.8s linear infinite;
}

@keyframes dashboard-todos-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-color-scheme: dark) {
  .dashboard-todos {
    background: rgba(30, 25, 40, 0.65);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .dashboard-todos__label {
    color: #f0e8f8;
  }

  .dashboard-todos__item {
    background: rgba(213, 181, 234, 0.1);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .dashboard-todos__check-box {
    background: rgba(0, 0, 0, 0.25);
    border-color: rgba(213, 181, 234, 0.45);
  }

  .dashboard-todos__state {
    color: #adb5bd;
  }
}
</style>
