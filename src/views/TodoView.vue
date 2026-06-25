<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { supabase } from '../lib/supabase.js'
import { getLocalTodayISO } from '../services/scheduledReminders.js'
import {
  TODO_FREQUENCY,
  TODO_FREQUENCY_OPTIONS,
  TODO_PROMESSE_LIMIT_MESSAGE,
  TODO_WEEKDAYS,
} from '../constants/todoOptions.js'
import {
  listTodoItems,
  createTodoItem,
  replaceTodoItem,
  deleteTodoItem,
  persistTodoOrders,
  listTodoCompletionsInRange,
  setTodoCompletionForDate,
} from '../services/todoItems.js'
import {
  TODO_VIEW_MODE,
  buildCompletionKeyMap,
  assertPromesseLimitForDate,
  formatDayLabelFr,
  formatMonthLabelFr,
  formatWeekRangeLabelFr,
  getDateRangeForView,
  getIsoWeekdayFromISO,
  getMonthStartISO,
  getMonthEndISO,
  getWeekStartISO,
  getTodosForDate,
  getTodoProgressStats,
  getWeekDates,
  iterateISODateRange,
  normalizeDateISO,
  parseISODate,
  shiftAnchorISO,
} from '../utils/todoCalendar.js'
import {
  buildMonthOptions,
  buildYearOptions,
  toISODate,
} from '../utils/habitCalendar.js'
import TodoItemCard from '../components/TodoItemCard.vue'
import { APP_PAGE_IDS } from '../constants/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'

const { pageTitle } = usePageDisplayLabel(APP_PAGE_IDS.TODO, undefined, { setDocumentTitle: true })

const WEEKDAY_HEADERS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

const userId = ref(null)
const isLoading = ref(true)
const loadError = ref('')
const formError = ref('')
const isSaving = ref(false)
const isDeletingId = ref(null)
const formOpen = ref(false)
const editingItemId = ref(null)
const items = ref([])
const completionKeys = ref(new Map())
const draggingItemId = ref(null)
const pendingDeleteItem = ref(null)

const viewMode = ref(TODO_VIEW_MODE.DAY)
const anchorDate = ref(getLocalTodayISO())
const selectedWeekDayIndex = ref(0)

const todayParts = parseISODate(getLocalTodayISO())
const selectedYear = ref(todayParts.year)
const selectedMonth = ref(todayParts.month)
const yearOptions = buildYearOptions()
const monthOptions = buildMonthOptions()

const todoForm = reactive({
  nom: '',
  description: '',
  frequence: TODO_FREQUENCY.ONE_OFF,
  jour_semaine: null,
  heure: '',
  date_echeance: getLocalTodayISO(),
  is_promesse: false,
})

const showWeekdayPicker = computed(() => todoForm.frequence === TODO_FREQUENCY.WEEKLY)

const isEditMode = computed(() => Boolean(editingItemId.value))

const periodLabel = computed(() => {
  if (viewMode.value === TODO_VIEW_MODE.MONTH) {
    return formatMonthLabelFr(anchorDate.value)
  }
  if (viewMode.value === TODO_VIEW_MODE.WEEK) {
    return formatWeekRangeLabelFr(anchorDate.value)
  }
  return formatDayLabelFr(anchorDate.value)
})

const periodSubtitle = computed(() => {
  if (viewMode.value === TODO_VIEW_MODE.WEEK) {
    return formatMonthLabelFr(getWeekStartISO(anchorDate.value))
  }
  return ''
})

const dailyItems = computed(() =>
  getTodosForDate(items.value, anchorDate.value, completionKeys.value),
)

const weekSections = computed(() => {
  const dates = getWeekDates(anchorDate.value)
  return dates.map((dateISO) => ({
    dateISO,
    weekdayLabel: WEEKDAY_HEADERS[getIsoWeekdayFromISO(dateISO) - 1],
    dayNumber: parseISODate(dateISO).day,
    isToday: dateISO === getLocalTodayISO(),
    items: getTodosForDate(items.value, dateISO, completionKeys.value),
  }))
})

const monthGrid = computed(() => {
  const { dates } = getDateRangeForView(TODO_VIEW_MODE.MONTH, anchorDate.value)
  const monthStart = getMonthStartISO(anchorDate.value)
  const { year, month } = parseISODate(anchorDate.value)

  return dates.map((dateISO) => {
    const cell = parseISODate(dateISO)
    const inMonth = cell.year === year && cell.month === month
    const dayItems = inMonth
      ? getTodosForDate(items.value, dateISO, completionKeys.value)
      : []
    return {
      dateISO,
      day: cell.day,
      inMonth,
      isToday: dateISO === getLocalTodayISO(),
      isSelected: dateISO === anchorDate.value,
      items: dayItems,
      pendingCount: dayItems.filter((item) => !item.occurrenceDone).length,
    }
  })
})

const itemsSubtitle = computed(() => {
  if (viewMode.value === TODO_VIEW_MODE.DAY) {
    const count = dailyItems.value.length
    if (!count) return 'Rien de prévu ce jour-là.'
    const done = dailyItems.value.filter((item) => item.occurrenceDone).length
    return `${done}/${count} terminé${done > 1 ? 's' : ''} aujourd’hui.`
  }
  if (viewMode.value === TODO_VIEW_MODE.WEEK) {
    const total = weekSections.value.reduce((sum, section) => sum + section.items.length, 0)
    return total
      ? `${total} occurrence${total > 1 ? 's' : ''} cette semaine.`
      : 'Rien de prévu cette semaine.'
  }
  const total = monthGrid.value
    .filter((cell) => cell.inMonth)
    .reduce((sum, cell) => sum + cell.items.length, 0)
  return total
    ? `${total} occurrence${total > 1 ? 's' : ''} ce mois-ci.`
    : 'Rien de prévu ce mois-ci.'
})

function formatTimeForInput(value) {
  if (!value) return ''
  return String(value).slice(0, 5)
}

function resetForm() {
  todoForm.nom = ''
  todoForm.description = ''
  todoForm.frequence = TODO_FREQUENCY.ONE_OFF
  todoForm.jour_semaine = null
  todoForm.heure = ''
  todoForm.date_echeance = anchorDate.value || getLocalTodayISO()
  todoForm.is_promesse = false
  editingItemId.value = null
  formError.value = ''
}

function openForm() {
  resetForm()
  formOpen.value = true
}

function openEditForm(item) {
  if (!item?.id) return

  editingItemId.value = item.id
  todoForm.nom = item.nom ?? ''
  todoForm.description = item.description ?? ''
  todoForm.frequence = item.frequence ?? TODO_FREQUENCY.ONE_OFF
  todoForm.jour_semaine = item.jour_semaine ?? null
  todoForm.heure = formatTimeForInput(item.heure)
  todoForm.date_echeance = normalizeDateISO(item.date_echeance) || getLocalTodayISO()
  todoForm.is_promesse = Boolean(item.is_promesse)
  formOpen.value = true
}

function closeForm() {
  formOpen.value = false
  resetForm()
}

function selectWeekday(dayId) {
  todoForm.jour_semaine = dayId
}

function setViewMode(mode) {
  viewMode.value = mode
  if (mode === TODO_VIEW_MODE.MONTH) {
    syncMonthYearFromAnchor()
  }
}

function syncMonthYearFromAnchor() {
  const { year, month } = parseISODate(anchorDate.value)
  if (year && selectedYear.value !== year) selectedYear.value = year
  if (month && selectedMonth.value !== month) selectedMonth.value = month
}

function applyMonthYearToAnchor() {
  const { day } = parseISODate(anchorDate.value)
  const daysInMonth = new Date(selectedYear.value, selectedMonth.value, 0).getDate()
  const safeDay = Math.min(day || 1, daysInMonth)
  const next = toISODate(selectedYear.value, selectedMonth.value, safeDay)
  if (next !== anchorDate.value) {
    anchorDate.value = next
  }
}

function goPrev() {
  anchorDate.value = shiftAnchorISO(anchorDate.value, viewMode.value, -1)
}

function goNext() {
  anchorDate.value = shiftAnchorISO(anchorDate.value, viewMode.value, 1)
}

function goToday() {
  anchorDate.value = getLocalTodayISO()
  if (viewMode.value === TODO_VIEW_MODE.MONTH) {
    syncMonthYearFromAnchor()
  }
}

function selectMonthDay(dateISO) {
  anchorDate.value = dateISO
  viewMode.value = TODO_VIEW_MODE.DAY
}

function syncSelectedWeekDay() {
  const idx = weekSections.value.findIndex((section) => section.isToday)
  selectedWeekDayIndex.value = idx >= 0 ? idx : 0
}

const selectedWeekSection = computed(() => weekSections.value[selectedWeekDayIndex.value] ?? null)

const currentProgress = computed(() => {
  const keys = completionKeys.value
  const list = items.value

  if (viewMode.value === TODO_VIEW_MODE.DAY) {
    const anchor = normalizeDateISO(anchorDate.value)
    return getTodoProgressStats(list, anchor ? [anchor] : [], keys)
  }

  if (viewMode.value === TODO_VIEW_MODE.WEEK) {
    return getTodoProgressStats(list, getWeekDates(anchorDate.value), keys)
  }

  return getTodoProgressStats(
    list,
    iterateISODateRange(getMonthStartISO(anchorDate.value), getMonthEndISO(anchorDate.value)),
    keys,
  )
})

const progressAriaLabel = computed(() => {
  const scope =
    viewMode.value === TODO_VIEW_MODE.DAY
      ? 'du jour'
      : viewMode.value === TODO_VIEW_MODE.WEEK
        ? 'de la semaine'
        : 'du mois'
  return `Progression ${scope} : ${currentProgress.value.percent} %`
})

async function loadData() {
  if (!userId.value) return

  isLoading.value = true
  loadError.value = ''
  try {
    const { start, end } = getDateRangeForView(viewMode.value, anchorDate.value)
    const [itemsData, completionsData] = await Promise.all([
      listTodoItems(supabase, userId.value),
      listTodoCompletionsInRange(supabase, userId.value, start, end),
    ])
    items.value = itemsData
    completionKeys.value = buildCompletionKeyMap(completionsData)
  } catch (err) {
    console.error(err)
    loadError.value = err.message || 'Impossible de charger la liste.'
    items.value = []
    completionKeys.value = new Map()
  } finally {
    isLoading.value = false
  }
}

async function submitForm() {
  if (!userId.value || isSaving.value) return

  isSaving.value = true
  formError.value = ''
  const payload = {
    nom: todoForm.nom,
    description: todoForm.description,
    frequence: todoForm.frequence,
    jour_semaine: todoForm.jour_semaine,
    heure: todoForm.heure || null,
    date_echeance: todoForm.date_echeance,
    is_promesse: todoForm.is_promesse,
  }

  if (payload.is_promesse) {
    try {
      assertPromesseLimitForDate(items.value, payload.date_echeance, editingItemId.value)
    } catch (err) {
      formError.value = err.message || TODO_PROMESSE_LIMIT_MESSAGE
      isSaving.value = false
      return
    }
  }

  try {
    if (editingItemId.value) {
      await replaceTodoItem(supabase, userId.value, editingItemId.value, payload)
    } else {
      await createTodoItem(supabase, userId.value, payload)
    }
    closeForm()
    await loadData()
  } catch (err) {
    console.error(err)
    const message =
      err.message ||
      (editingItemId.value
        ? "Erreur lors de la modification de l'élément."
        : "Erreur lors de l'ajout de l'élément.")
    if (message === TODO_PROMESSE_LIMIT_MESSAGE) {
      formError.value = message
    } else {
      loadError.value = message
    }
  } finally {
    isSaving.value = false
  }
}

function removeItem(item) {
  if (!userId.value || !item?.id || isDeletingId.value) return
  pendingDeleteItem.value = item
}

function cancelDelete() {
  if (isDeletingId.value) return
  pendingDeleteItem.value = null
}

async function confirmDelete() {
  const item = pendingDeleteItem.value
  if (!userId.value || !item?.id || isDeletingId.value) return

  isDeletingId.value = item.id
  loadError.value = ''
  try {
    await deleteTodoItem(supabase, userId.value, item.id)
    pendingDeleteItem.value = null
    if (editingItemId.value === item.id) {
      closeForm()
    }
    await loadData()
  } catch (err) {
    console.error(err)
    loadError.value = err.message || 'Impossible de supprimer l’élément.'
  } finally {
    isDeletingId.value = null
  }
}

async function toggleItem(item) {
  if (!userId.value || !item?.id) return

  const dateISO = item.occurrenceDate || anchorDate.value
  const next = !item.occurrenceDone
  const key = `${item.id}:${normalizeDateISO(dateISO)}`

  if (next) {
    completionKeys.value.set(key, true)
  } else {
    completionKeys.value.delete(key)
  }
  completionKeys.value = new Map(completionKeys.value)

  if (item.frequence === TODO_FREQUENCY.ONE_OFF) {
    item.is_done = next
  }
  item.occurrenceDone = next

  try {
    await setTodoCompletionForDate(supabase, userId.value, item, dateISO, next)
  } catch (err) {
    console.error(err)
    if (next) {
      completionKeys.value.delete(key)
    } else {
      completionKeys.value.set(key, true)
    }
    completionKeys.value = new Map(completionKeys.value)
    item.occurrenceDone = !next
    if (item.frequence === TODO_FREQUENCY.ONE_OFF) {
      item.is_done = !next
    }
    loadError.value = err.message || 'Impossible de mettre à jour l’élément.'
  }
}

function onDragStart(id, event) {
  draggingItemId.value = id
  try {
    event.dataTransfer?.setData('text/plain', id)
    event.dataTransfer.effectAllowed = 'move'
  } catch {
    /* ignore */
  }
}

function onDragOver(id, event) {
  if (!draggingItemId.value || draggingItemId.value === id) return
  event.preventDefault()
  try {
    event.dataTransfer.dropEffect = 'move'
  } catch {
    /* ignore */
  }
}

function onDragEnd() {
  draggingItemId.value = null
}

function reorderById(list, sourceId, targetId) {
  const from = list.findIndex((item) => item.id === sourceId)
  const to = list.findIndex((item) => item.id === targetId)
  if (from < 0 || to < 0 || from === to) return false
  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved)
  return true
}

async function onItemDrop(targetId, event) {
  event.preventDefault()
  const source = draggingItemId.value || event.dataTransfer?.getData('text/plain')
  draggingItemId.value = null
  if (!source || source === targetId || !userId.value) return

  const dayIds = dailyItems.value.map((item) => item.id)
  if (!dayIds.includes(source) || !dayIds.includes(targetId)) return

  const reordered = [...dailyItems.value]
  const changed = reorderById(reordered, source, targetId)
  if (!changed) return

  const reorderedIds = new Set(reordered.map((item) => item.id))
  const rest = items.value.filter((item) => !reorderedIds.has(item.id))
  items.value = [...reordered, ...rest]

  try {
    await persistTodoOrders(supabase, userId.value, items.value)
    await loadData()
  } catch (err) {
    console.error(err)
    loadError.value = err.message || 'Erreur lors du réordonnancement.'
    await loadData()
  }
}

watch(
  () => todoForm.frequence,
  (freq) => {
    if (freq !== TODO_FREQUENCY.WEEKLY) {
      todoForm.jour_semaine = null
    }
  },
)

watch([selectedMonth, selectedYear], () => {
  if (viewMode.value === TODO_VIEW_MODE.MONTH) {
    applyMonthYearToAnchor()
  }
})

watch([viewMode, anchorDate], () => {
  if (viewMode.value === TODO_VIEW_MODE.WEEK) {
    syncSelectedWeekDay()
  }
  if (viewMode.value === TODO_VIEW_MODE.MONTH) {
    syncMonthYearFromAnchor()
  }
  if (userId.value) void loadData()
})

onMounted(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) userId.value = user.id
})

watch(userId, (id) => {
  if (id) void loadData()
})
</script>

<template>
  <div class="todo-wrapper">
    <header class="todo-header">
      <h1 class="todo-title">{{ pageTitle }}</h1>
      <p class="todo-subtitle">{{ itemsSubtitle }}</p>
    </header>

    <nav class="todo-view-tabs" aria-label="Mode d'affichage">
      <button
        type="button"
        class="todo-view-tab"
        :class="{ 'todo-view-tab--active': viewMode === TODO_VIEW_MODE.DAY }"
        @click="setViewMode(TODO_VIEW_MODE.DAY)"
      >
        Jour
      </button>
      <button
        type="button"
        class="todo-view-tab"
        :class="{ 'todo-view-tab--active': viewMode === TODO_VIEW_MODE.WEEK }"
        @click="setViewMode(TODO_VIEW_MODE.WEEK)"
      >
        Semaine
      </button>
      <button
        type="button"
        class="todo-view-tab"
        :class="{ 'todo-view-tab--active': viewMode === TODO_VIEW_MODE.MONTH }"
        @click="setViewMode(TODO_VIEW_MODE.MONTH)"
      >
        Mois
      </button>
    </nav>

    <div class="todo-calendar-controls">
      <div class="todo-navigation-group">
        <button type="button" class="todo-nav-arrow" aria-label="Période précédente" @click="goPrev">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div class="todo-nav-title">
          <span class="todo-nav-title__main">{{ periodLabel }}</span>

          <div v-if="viewMode === TODO_VIEW_MODE.MONTH" class="todo-nav-filters">
            <select
              v-model.number="selectedMonth"
              class="todo-nav-filter-select"
              aria-label="Mois"
            >
              <option v-for="opt in monthOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
            <select
              v-model.number="selectedYear"
              class="todo-nav-filter-select"
              aria-label="Année"
            >
              <option v-for="year in yearOptions" :key="year" :value="year">
                {{ year }}
              </option>
            </select>
          </div>

          <span v-else-if="periodSubtitle" class="todo-nav-title__sub">{{ periodSubtitle }}</span>
        </div>

        <button type="button" class="todo-nav-arrow" aria-label="Période suivante" @click="goNext">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <div class="todo-action-group">
        <button type="button" class="todo-today-btn" @click="goToday">Aujourd’hui</button>
        <button
          type="button"
          class="todo-add-btn"
          :disabled="formOpen && !isEditMode"
          @click="openForm"
        >
          <span class="todo-add-btn__plus">+</span>
          Ajouter
        </button>
      </div>
    </div>

    <div class="todo-progress">
      <div class="todo-progress__header">
        <span class="todo-progress__value">{{ currentProgress.percent }}%</span>
        <span class="todo-progress__meta">
          {{ currentProgress.done }}/{{ currentProgress.total }} terminé{{
            currentProgress.done > 1 ? 's' : ''
          }}
        </span>
      </div>
      <div
        class="todo-progress__track"
        role="progressbar"
        :aria-valuenow="currentProgress.percent"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="progressAriaLabel"
      >
        <div
          class="todo-progress__fill"
          :class="{
            'todo-progress__fill--complete':
              currentProgress.percent === 100 && currentProgress.total > 0,
          }"
          :style="{ width: `${currentProgress.percent}%` }"
        />
      </div>
    </div>

    <form v-if="formOpen" class="todo-form-card" @submit.prevent="submitForm">
      <h2 class="todo-form-title">
        {{ isEditMode ? 'Modifier l’élément' : 'Nouvel élément' }}
      </h2>

      <label class="todo-form-field">
        <span class="todo-form-label">Nom</span>
        <input
          v-model="todoForm.nom"
          type="text"
          class="todo-form-input"
          maxlength="120"
          placeholder="Ex : Méditer 10 min, Appeler le médecin…"
          required
          autofocus
        />
      </label>

      <label class="todo-form-field">
        <span class="todo-form-label">
          Description <span class="todo-form-optional">(optionnel)</span>
        </span>
        <textarea
          v-model="todoForm.description"
          class="todo-form-textarea"
          rows="3"
          maxlength="1000"
          placeholder="Détails, contexte, notes…"
        />
      </label>

      <label class="todo-form-field">
        <span class="todo-form-label">Pour quand</span>
        <input
          v-model="todoForm.date_echeance"
          type="date"
          class="todo-form-input"
          required
          @change="formError = ''"
        />
      </label>

      <label class="todo-form-field">
        <span class="todo-form-label">Fréquence</span>
        <select v-model="todoForm.frequence" class="todo-form-select" required>
          <option v-for="opt in TODO_FREQUENCY_OPTIONS" :key="opt.id" :value="opt.id">
            {{ opt.label }}
          </option>
        </select>
      </label>

      <fieldset v-if="showWeekdayPicker" class="todo-form-field todo-form-weekdays">
        <legend class="todo-form-label">Jour de la semaine</legend>
        <div class="todo-weekday-row">
          <button
            v-for="day in TODO_WEEKDAYS"
            :key="day.id"
            type="button"
            class="todo-weekday-btn"
            :class="{ 'todo-weekday-btn--active': todoForm.jour_semaine === day.id }"
            :aria-pressed="todoForm.jour_semaine === day.id"
            @click="selectWeekday(day.id)"
          >
            {{ day.label }}
          </button>
        </div>
      </fieldset>

      <label class="todo-form-field">
        <span class="todo-form-label">
          Horaire <span class="todo-form-optional">(optionnel)</span>
        </span>
        <input v-model="todoForm.heure" type="time" class="todo-form-input todo-form-input--time" />
      </label>

      <label class="todo-form-promesse choice-check">
        <input v-model="todoForm.is_promesse" type="checkbox" @change="formError = ''" />
        <span>Promesse</span>
      </label>

      <p v-if="formError" class="todo-error" role="alert">{{ formError }}</p>

      <div class="todo-form-actions">
        <button type="submit" class="todo-add-btn" :disabled="isSaving">
          {{ isSaving ? 'Enregistrement…' : 'Valider' }}
        </button>
        <button type="button" class="todo-cancel-btn" :disabled="isSaving" @click="closeForm">
          Annuler
        </button>
      </div>
    </form>

    <p v-if="loadError" class="todo-error todo-error--global" role="alert">{{ loadError }}</p>

    <section class="todo-card" aria-label="Calendrier des tâches">
      <p v-if="isLoading" class="todo-loading">Chargement…</p>

      <template v-else>
        <div v-if="viewMode === TODO_VIEW_MODE.DAY" class="todo-list" role="list">
          <p v-if="!dailyItems.length" class="todo-empty">Aucun élément pour ce jour.</p>
          <TodoItemCard
            v-for="item in dailyItems"
            :key="`${item.id}-${item.occurrenceDate}`"
            :item="item"
            draggable
            :dragging="draggingItemId === item.id"
            role="listitem"
            @toggle="toggleItem(item)"
            @edit="openEditForm(item)"
            @delete="removeItem(item)"
            @dragstart="onDragStart(item.id, $event)"
            @dragover="onDragOver(item.id, $event)"
            @drop="onItemDrop(item.id, $event)"
            @dragend="onDragEnd"
          />
        </div>

        <div v-else-if="viewMode === TODO_VIEW_MODE.WEEK" class="todo-week">
          <div class="todo-week-tabs" role="tablist" aria-label="Jours de la semaine">
            <button
              v-for="(section, idx) in weekSections"
              :key="section.dateISO"
              type="button"
              role="tab"
              class="todo-week-tab"
              :class="{
                'todo-week-tab--active': selectedWeekDayIndex === idx,
                'todo-week-tab--today': section.isToday,
              }"
              :aria-selected="selectedWeekDayIndex === idx"
              @click="selectedWeekDayIndex = idx"
            >
              <span class="todo-week-tab__name">{{ section.weekdayLabel }}</span>
              <span class="todo-week-tab__number">{{ section.dayNumber }}</span>
            </button>
          </div>

          <div v-if="selectedWeekSection" class="todo-week-mobile">
            <p v-if="!selectedWeekSection.items.length" class="todo-week-mobile__empty">
              Aucun élément ce jour-là.
            </p>
            <div v-else class="todo-week-mobile__list">
              <TodoItemCard
                v-for="item in selectedWeekSection.items"
                :key="`${item.id}-${item.occurrenceDate}`"
                :item="item"
                @toggle="toggleItem(item)"
                @edit="openEditForm(item)"
                @delete="removeItem(item)"
              />
            </div>
          </div>

          <div class="todo-week-desktop">
            <div class="todo-week-grid">
              <div class="todo-week-grid__headers">
                <button
                  v-for="section in weekSections"
                  :key="`header-${section.dateISO}`"
                  type="button"
                  class="todo-week-grid__header"
                  :class="{ 'todo-week-grid__header--today': section.isToday }"
                  :title="`Voir le ${formatDayLabelFr(section.dateISO)}`"
                  @click="selectMonthDay(section.dateISO)"
                >
                  <span class="todo-week-grid__day-name">{{ section.weekdayLabel }}</span>
                  <span class="todo-week-grid__day-number">{{ section.dayNumber }}</span>
                </button>
              </div>

              <div class="todo-week-grid__columns">
                <div
                  v-for="section in weekSections"
                  :key="`column-${section.dateISO}`"
                  class="todo-week-grid__column"
                  :class="{ 'todo-week-grid__column--today': section.isToday }"
                >
                  <p v-if="!section.items.length" class="todo-week-grid__empty">—</p>
                  <TodoItemCard
                    v-for="item in section.items"
                    :key="`${item.id}-${item.occurrenceDate}`"
                    :item="item"
                    compact
                    @toggle="toggleItem(item)"
                    @edit="openEditForm(item)"
                    @delete="removeItem(item)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="todo-month">
          <div class="todo-month-weekdays" aria-hidden="true">
            <span v-for="wd in WEEKDAY_HEADERS" :key="wd" class="todo-month-weekday">{{ wd }}</span>
          </div>
          <div class="todo-month-grid">
            <button
              v-for="cell in monthGrid"
              :key="cell.dateISO"
              type="button"
              class="todo-month-cell"
              :class="{
                'todo-month-cell--outside': !cell.inMonth,
                'todo-month-cell--today': cell.isToday,
                'todo-month-cell--selected': cell.isSelected,
              }"
              :aria-label="formatDayLabelFr(cell.dateISO)"
              @click="cell.inMonth ? selectMonthDay(cell.dateISO) : undefined"
            >
              <span class="todo-month-cell__day">{{ cell.inMonth ? cell.day : '' }}</span>
              <span v-if="cell.pendingCount" class="todo-month-cell__badge">{{ cell.pendingCount }}</span>
              <ul v-if="cell.items.length" class="todo-month-cell__preview">
                <li
                  v-for="item in cell.items.slice(0, 2)"
                  :key="`${item.id}-${item.occurrenceDate}`"
                  class="todo-month-cell__preview-item"
                  :class="{ 'todo-month-cell__preview-item--done': item.occurrenceDone }"
                >
                  {{ item.nom }}
                </li>
                <li v-if="cell.items.length > 2" class="todo-month-cell__preview-more">
                  +{{ cell.items.length - 2 }}
                </li>
              </ul>
            </button>
          </div>
        </div>
      </template>
    </section>

    <div
      v-if="pendingDeleteItem"
      class="todo-confirm-overlay"
      @click.self="cancelDelete"
      @keydown.escape="cancelDelete"
    >
      <div
        class="todo-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="todo-delete-title"
        aria-describedby="todo-delete-message"
      >
        <h2 id="todo-delete-title" class="todo-confirm-title">Supprimer cet élément ?</h2>
        <p id="todo-delete-message" class="todo-confirm-message">
          « {{ pendingDeleteItem.nom }} » sera définitivement supprimé.
        </p>
        <div class="todo-confirm-actions">
          <button
            type="button"
            class="todo-cancel-btn"
            :disabled="Boolean(isDeletingId)"
            @click="cancelDelete"
          >
            Annuler
          </button>
          <button
            type="button"
            class="todo-confirm-delete-btn"
            :disabled="Boolean(isDeletingId)"
            @click="confirmDelete"
          >
            {{ isDeletingId ? 'Suppression…' : 'Supprimer' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.todo-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: none;
  min-width: 0;
  min-height: 100%;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
}

.todo-header {
  margin-bottom: 1.5rem;
  text-align: center;
}

.todo-title {
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  margin: 0;
}

.todo-subtitle {
  margin: 0.5rem 0 0;
  color: #6c757d;
  font-size: 1rem;
}

.todo-view-tabs {
  display: flex;
  gap: 0.35rem;
  padding: 0.3rem;
  margin-bottom: 1rem;
  border-radius: 12px;
  background: rgba(213, 181, 234, 0.12);
  border: 1px solid rgba(213, 181, 234, 0.25);
}

.todo-view-tab {
  flex: 1;
  border: none;
  border-radius: 9px;
  padding: 0.55rem 0.75rem;
  font-size: 0.88rem;
  font-weight: 700;
  color: #6c757d;
  background: transparent;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.todo-view-tab--active {
  color: #ad81be;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 2px 6px rgba(173, 129, 190, 0.12);
}

.todo-calendar-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}

.todo-navigation-group {
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

.todo-nav-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: #ad81be;
  cursor: pointer;
  transition: all 0.2s ease;
}

.todo-nav-arrow svg {
  width: 18px;
  height: 18px;
}

.todo-nav-arrow:hover {
  background: rgba(213, 181, 234, 0.15);
  color: #d5b5ea;
}

.todo-nav-title {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  min-width: 0;
  flex: 1;
  text-align: center;
}

.todo-nav-title__main {
  font-size: 1.05rem;
  font-weight: 800;
  color: #ad81be;
  text-transform: capitalize;
  line-height: 1.25;
}

.todo-nav-title__sub {
  font-size: 0.8rem;
  color: #72a098;
  font-weight: 600;
  text-transform: capitalize;
}

.todo-nav-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
}

.todo-nav-filter-select {
  padding: 0.35rem 0.55rem;
  border-radius: 8px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  font-size: 0.78rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.9);
  color: #2c3e50;
  cursor: pointer;
  max-width: 8.5rem;
}

.todo-action-group {
  display: flex;
  gap: 0.75rem;
  flex-shrink: 0;
}

.todo-today-btn {
  padding: 0.6rem 1.2rem;
  border: 1px solid rgba(149, 209, 170, 0.5);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.8);
  color: #72a098;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.todo-today-btn:hover {
  background: rgba(149, 209, 170, 0.15);
  transform: translateY(-1px);
}

.todo-progress {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 1.25rem;
  padding: 0.9rem 1rem;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  box-sizing: border-box;
}

.todo-progress__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.todo-progress__value {
  font-size: 1rem;
  font-weight: 800;
  color: #ad81be;
}

.todo-progress__track {
  height: 0.55rem;
  border-radius: 999px;
  background: rgba(213, 181, 234, 0.22);
  overflow: hidden;
}

.todo-progress__fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  transition: width 0.25s ease;
}

.todo-progress__fill--complete {
  background: linear-gradient(135deg, #95d1aa, #72a098);
}

.todo-progress__meta {
  font-size: 0.72rem;
  font-weight: 600;
  color: #8c98a4;
}

.todo-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 16px;
  padding: 1.25rem;
  box-sizing: border-box;
}

.todo-add-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 1.4rem;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 15px rgba(213, 181, 234, 0.35);
  white-space: nowrap;
}

.todo-add-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(213, 181, 234, 0.5);
}

.todo-add-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.todo-add-btn__plus {
  font-size: 1.1rem;
  font-weight: 800;
  line-height: 1;
}

.todo-form-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding: 1rem 1.25rem;
  border-radius: 16px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  box-sizing: border-box;
}

.todo-error--global {
  margin: 0 0 1rem;
}

.todo-form-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: #ad81be;
}

.todo-form-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;
}

.todo-form-weekdays {
  margin: 0;
  padding: 0;
  border: none;
}

.todo-form-label {
  font-size: 0.78rem;
  font-weight: 800;
  color: #95a5a6;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.todo-form-optional {
  font-weight: 700;
  text-transform: none;
  letter-spacing: 0;
  color: #b0b8bf;
}

.todo-form-input,
.todo-form-textarea,
.todo-form-select {
  width: 100%;
  padding: 0.65rem 0.85rem;
  border: 1px solid rgba(213, 181, 234, 0.45);
  border-radius: 10px;
  font-size: 0.95rem;
  font-weight: 500;
  color: #2c3e50;
  background: rgba(255, 255, 255, 0.9);
  box-sizing: border-box;
}

.todo-form-input--time {
  max-width: 12rem;
}

.todo-form-textarea {
  resize: vertical;
  min-height: 4.5rem;
  font-family: inherit;
}

.todo-form-input:focus,
.todo-form-textarea:focus,
.todo-form-select:focus {
  outline: none;
  border-color: #ad81be;
  box-shadow: 0 0 0 3px rgba(173, 129, 190, 0.2);
}

.todo-weekday-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.todo-weekday-btn {
  min-width: 2.5rem;
  padding: 0.45rem 0.55rem;
  border-radius: 8px;
  border: 1px solid rgba(213, 181, 234, 0.4);
  background: rgba(255, 255, 255, 0.85);
  color: #6c757d;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}

.todo-weekday-btn--active {
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  border-color: transparent;
  color: #fff;
}

.todo-form-promesse {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.92rem;
  font-weight: 700;
  color: #2c3e50;
  cursor: pointer;
}

.todo-form-promesse input {
  width: 1.1rem;
  height: 1.1rem;
  accent-color: #95d1aa;
}

.todo-form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.todo-cancel-btn {
  padding: 0.75rem 1rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.45);
  background: transparent;
  color: #ad81be;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
}

.todo-cancel-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.todo-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(44, 62, 80, 0.35);
  backdrop-filter: blur(4px);
}

.todo-confirm-dialog {
  width: 100%;
  max-width: 22rem;
  padding: 1.25rem;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(213, 181, 234, 0.35);
  box-shadow: 0 12px 40px rgba(173, 129, 190, 0.2);
  box-sizing: border-box;
}

.todo-confirm-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: #ad81be;
}

.todo-confirm-message {
  margin: 0.65rem 0 1.1rem;
  font-size: 0.92rem;
  color: #6c757d;
  line-height: 1.45;
}

.todo-confirm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: flex-end;
}

.todo-confirm-delete-btn {
  padding: 0.75rem 1rem;
  border-radius: 12px;
  border: none;
  background: #c0392b;
  color: #fff;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    filter 0.15s ease;
}

.todo-confirm-delete-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.05);
}

.todo-confirm-delete-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.todo-error {
  margin: 0 0 0.75rem;
  color: #c0392b;
  font-size: 0.9rem;
  font-weight: 600;
}

.todo-loading,
.todo-empty {
  margin: 0;
  text-align: center;
  color: #8c98a4;
  font-size: 0.95rem;
  font-weight: 600;
  padding: 1rem 0.5rem;
}

.todo-list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.todo-week {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.todo-week-tabs {
  display: none;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 1rem;
  background: rgba(213, 181, 234, 0.08);
  padding: 0.4rem;
  border-radius: 18px;
  border: 1px solid rgba(213, 181, 234, 0.15);
}

.todo-week-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.65rem 0.5rem;
  border-radius: 14px;
  border: none;
  background: transparent;
  color: #6c757d;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.todo-week-tab__name {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.todo-week-tab__number {
  font-size: 1.1rem;
  font-weight: 800;
}

.todo-week-tab:hover {
  background: rgba(213, 181, 234, 0.15);
  color: #ad81be;
}

.todo-week-tab--active {
  background: linear-gradient(135deg, #d5b5ea, #ad81be) !important;
  color: white !important;
  box-shadow: 0 4px 15px rgba(213, 181, 234, 0.35);
  transform: translateY(-2px);
}

.todo-week-tab--today:not(.todo-week-tab--active) {
  border: 1.5px solid rgba(149, 209, 170, 0.6);
  color: #95d1aa;
}

.todo-week-mobile {
  display: none;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.todo-week-mobile__list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.todo-week-mobile__empty {
  margin: 0;
  text-align: center;
  color: #b0b8bf;
  font-size: 0.9rem;
  padding: 1.5rem 0;
}

.todo-week-desktop {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.todo-week-grid {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.45);
  border-radius: 16px;
  border: 1px solid rgba(213, 181, 234, 0.2);
  overflow: hidden;
}

.todo-week-grid__headers {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.5rem;
  padding: 0.75rem 0.65rem;
  border-bottom: 1px solid rgba(213, 181, 234, 0.2);
  background: rgba(255, 255, 255, 0.8);
}

.todo-week-grid__header {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.1rem;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 10px;
  transition: background 0.15s ease;
}

.todo-week-grid__header:hover {
  background: rgba(213, 181, 234, 0.12);
}

.todo-week-grid__day-name {
  font-size: 0.72rem;
  font-weight: 700;
  color: #72a098;
  text-transform: uppercase;
}

.todo-week-grid__day-number {
  font-size: 1.25rem;
  font-weight: 800;
  color: #ad81be;
}

.todo-week-grid__header--today .todo-week-grid__day-number {
  color: #95d1aa;
}

.todo-week-grid__columns {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  overflow-y: auto;
}

.todo-week-grid__column {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.65rem 0.4rem;
  min-height: 10rem;
  min-width: 0;
  border-right: 1px solid rgba(213, 181, 234, 0.12);
}

.todo-week-grid__column:last-child {
  border-right: none;
}

.todo-week-grid__column--today {
  background: rgba(149, 209, 170, 0.06);
}

.todo-week-grid__empty {
  margin: 0;
  text-align: center;
  color: #b0b8bf;
  font-size: 0.85rem;
  padding: 0.5rem 0;
}

.todo-month {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.todo-month-weekdays {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.25rem;
}

.todo-month-weekday {
  text-align: center;
  font-size: 0.72rem;
  font-weight: 800;
  color: #ad81be;
  text-transform: uppercase;
}

.todo-month-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.35rem;
  flex: 1;
  min-height: 0;
}

.todo-month-cell {
  min-height: 5.5rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.22);
  background: rgba(255, 255, 255, 0.5);
  padding: 0.35rem;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  position: relative;
}

.todo-month-cell--outside {
  opacity: 0.35;
  cursor: default;
}

.todo-month-cell--today {
  border-color: rgba(149, 209, 170, 0.55);
}

.todo-month-cell--selected {
  box-shadow: inset 0 0 0 2px rgba(173, 129, 190, 0.45);
}

.todo-month-cell__day {
  font-size: 0.82rem;
  font-weight: 800;
  color: #2c3e50;
}

.todo-month-cell__badge {
  position: absolute;
  top: 0.3rem;
  right: 0.3rem;
  min-width: 1.1rem;
  height: 1.1rem;
  border-radius: 999px;
  background: #ad81be;
  color: #fff;
  font-size: 0.62rem;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.2rem;
}

.todo-month-cell__preview {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.todo-month-cell__preview-item {
  font-size: 0.62rem;
  font-weight: 600;
  color: #6c757d;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.todo-month-cell__preview-item--done {
  text-decoration: line-through;
  opacity: 0.65;
}

.todo-month-cell__preview-more {
  font-size: 0.6rem;
  font-weight: 700;
  color: #ad81be;
}

@media (prefers-color-scheme: dark) {
  .todo-title {
    color: #f0e8f8;
  }

  .todo-subtitle,
  .todo-empty,
  .todo-loading {
    color: #adb5bd;
  }

  .todo-card {
    background: rgba(35, 30, 48, 0.75);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .todo-view-tabs {
    background: rgba(35, 30, 48, 0.6);
    border-color: rgba(213, 181, 234, 0.15);
  }

  .todo-view-tab {
    color: #adb5bd;
  }

  .todo-view-tab--active {
    background: rgba(45, 38, 58, 0.95);
    color: #d5b5ea;
  }

  .todo-navigation-group {
    background: rgba(30, 26, 40, 0.75);
    border-color: rgba(213, 181, 234, 0.15);
  }

  .todo-progress {
    background: rgba(35, 30, 48, 0.75);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .todo-progress__meta {
    color: #adb5bd;
  }

  .todo-today-btn {
    background: rgba(30, 26, 40, 0.8);
    border-color: rgba(149, 209, 170, 0.25);
  }

  .todo-form-card {
    background: rgba(25, 20, 35, 0.6);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .todo-form-input,
  .todo-form-textarea,
  .todo-form-select,
  .todo-weekday-btn,
  .todo-nav-filter-select {
    color: #f0e8f8;
    background: rgba(25, 20, 35, 0.6);
    border-color: rgba(213, 181, 234, 0.25);
  }

  .todo-form-promesse {
    color: #f0e8f8;
  }

  .todo-confirm-dialog {
    background: rgba(35, 30, 48, 0.95);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .todo-confirm-message {
    color: #adb5bd;
  }

  .todo-week-grid {
    background: rgba(25, 20, 35, 0.4);
    border-color: rgba(213, 181, 234, 0.1);
  }

  .todo-week-grid__headers {
    background: rgba(30, 26, 40, 0.9);
    border-bottom-color: rgba(213, 181, 234, 0.1);
  }

  .todo-week-grid__column {
    border-right-color: rgba(213, 181, 234, 0.08);
  }

  .todo-week-grid__column--today {
    background: rgba(149, 209, 170, 0.08);
  }

  .todo-week-tab {
    color: #adb5bd;
  }

  .todo-month-cell {
    background: rgba(25, 20, 35, 0.45);
    border-color: rgba(213, 181, 234, 0.15);
  }

  .todo-month-cell__day {
    color: #f0e8f8;
  }

  .todo-month-cell__preview-item {
    color: #adb5bd;
  }
}

@media (max-width: 1024px) {
  .todo-week-desktop {
    display: none;
  }

  .todo-week-tabs {
    display: flex;
  }

  .todo-week-mobile {
    display: flex;
    flex-direction: column;
  }
}

@media (max-width: 768px) {
  .todo-calendar-controls {
    flex-direction: column;
    align-items: stretch;
  }

  .todo-navigation-group {
    width: 100%;
    box-sizing: border-box;
  }

  .todo-action-group {
    width: 100%;
  }

  .todo-today-btn,
  .todo-add-btn {
    flex: 1;
    justify-content: center;
  }

  .todo-month-cell {
    min-height: 4.5rem;
  }

  .todo-month-cell__preview {
    display: none;
  }

  .todo-week-tab {
    padding: 0.5rem 0.3rem;
  }

  .todo-week-tab__name {
    font-size: 0.6rem;
  }

  .todo-week-tab__number {
    font-size: 0.95rem;
  }
}
</style>
