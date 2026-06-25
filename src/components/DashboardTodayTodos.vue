<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { supabase } from '../lib/supabase.js'
import { APP_PAGE_IDS } from '../constants/appPages.js'
import { TODO_FREQUENCY } from '../constants/todoOptions.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import {
  isPageVisible,
  loadPageVisibility,
  mergePageVisibility,
  PAGE_VISIBILITY_UPDATED_EVENT,
} from '../services/pageVisibility.js'
import { listTodoCompletionsInRange, listTodoItems, setTodoCompletionForDate } from '../services/todoItems.js'
import {
  buildCompletionKeyMap,
  getTodosForDate,
  getTodoProgressStats,
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
const completionKeys = ref(new Map())

const isTodoPageVisible = computed(() => isPageVisible(APP_PAGE_IDS.TODO, pageVisibility.value))

const todayTodos = computed(() =>
  getTodosForDate(items.value, props.dateIso, completionKeys.value),
)

const progress = computed(() =>
  getTodoProgressStats(items.value, [props.dateIso], completionKeys.value),
)

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
    completionKeys.value = new Map()
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
    completionKeys.value = buildCompletionKeyMap(completions)
  } catch (err) {
    console.error('dashboard todos:', err)
    loadError.value = err.message || 'Impossible de charger les tâches du jour.'
    items.value = []
    completionKeys.value = new Map()
  } finally {
    isLoading.value = false
  }
}

async function reload() {
  await loadPageVisibilityState()
  await loadTodos()
}

async function toggleItem(item) {
  if (!props.userId || !item?.id) return

  const dateISO = normalizeDateISO(item.occurrenceDate || props.dateIso)
  const next = !item.occurrenceDone
  const key = `${item.id}:${dateISO}`

  if (next) completionKeys.value.set(key, true)
  else completionKeys.value.delete(key)
  completionKeys.value = new Map(completionKeys.value)

  if (item.frequence === TODO_FREQUENCY.ONE_OFF) {
    item.is_done = next
  }
  item.occurrenceDone = next

  try {
    await setTodoCompletionForDate(supabase, props.userId, item, dateISO, next)
  } catch (err) {
    console.error(err)
    if (next) completionKeys.value.delete(key)
    else completionKeys.value.set(key, true)
    completionKeys.value = new Map(completionKeys.value)
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
        {{ progress.done }}/{{ progress.total }}
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
        :class="{
          'dashboard-todos__item--done': item.occurrenceDone,
          'dashboard-todos__item--promesse': item.is_promesse,
        }"
      >
        <label class="dashboard-todos__check" :title="item.occurrenceDone ? 'Marquer comme à faire' : 'Marquer comme fait'">
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
  border: 1px solid rgba(213, 181, 234, 0.25);
  background: rgba(213, 181, 234, 0.08);
}

.dashboard-todos__item--promesse {
  border-color: rgba(39, 174, 96, 0.35);
  background: rgba(39, 174, 96, 0.06);
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
  color: #27ae60;
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
