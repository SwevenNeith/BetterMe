<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { supabase } from '../lib/supabase.js'
import { APP_PAGE_IDS } from '../constants/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import {
  isPageVisible,
  loadPageVisibility,
  mergePageVisibility,
  PAGE_VISIBILITY_UPDATED_EVENT,
} from '../services/pageVisibility.js'
import { listHabits } from '../services/habits.js'
import HabitTrackerGrid from './HabitTrackerGrid.vue'

const props = defineProps({
  userId: {
    type: String,
    default: null,
  },
})

const { pageTitle: habitPageTitle } = usePageDisplayLabel(APP_PAGE_IDS.HABIT)

const pageVisibility = ref(mergePageVisibility(null))
const isLoading = ref(false)
const loadError = ref('')
const habits = ref([])
const activeHabitId = ref(null)

const isHabitPageVisible = computed(() => isPageVisible(APP_PAGE_IDS.HABIT, pageVisibility.value))

const activeHabit = computed(
  () => habits.value.find((habit) => habit.id === activeHabitId.value) ?? null,
)

watch(
  habits,
  (list) => {
    if (list.length === 0) {
      activeHabitId.value = null
      return
    }
    if (!list.some((habit) => habit.id === activeHabitId.value)) {
      activeHabitId.value = list[0].id
    }
  },
  { immediate: true },
)

async function loadPageVisibilityState() {
  if (!props.userId) {
    pageVisibility.value = mergePageVisibility(null)
    return
  }
  try {
    pageVisibility.value = await loadPageVisibility(supabase, props.userId)
  } catch (err) {
    console.error('dashboard habits visibility:', err)
    pageVisibility.value = mergePageVisibility(null)
  }
}

async function loadHabits() {
  if (!props.userId || !isHabitPageVisible.value) {
    habits.value = []
    return
  }

  isLoading.value = true
  loadError.value = ''
  try {
    habits.value = await listHabits(supabase, props.userId)
  } catch (err) {
    console.error('dashboard habits:', err)
    loadError.value = err.message || 'Impossible de charger les habitudes.'
    habits.value = []
  } finally {
    isLoading.value = false
  }
}

async function reload() {
  await loadPageVisibilityState()
  await loadHabits()
}

watch(
  () => props.userId,
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
  <section v-if="isHabitPageVisible" class="dashboard-habits" aria-labelledby="dashboard-habits-title">
    <h2 id="dashboard-habits-title" class="dashboard-habits__title">{{ habitPageTitle }}</h2>

    <div v-if="isLoading" class="dashboard-habits__state">
      <span class="spinner" aria-hidden="true"></span>
      Chargement des habitudes…
    </div>

    <p v-else-if="loadError" class="dashboard-habits__error">{{ loadError }}</p>

    <p v-else-if="habits.length === 0" class="dashboard-habits__state dashboard-habits__state--empty">
      Aucune habitude pour l’instant. Ajoute-en une depuis la page {{ habitPageTitle }}.
    </p>

    <template v-else>
      <nav class="dashboard-habits__tabs" role="tablist" :aria-label="habitPageTitle">
        <button
          v-for="habit in habits"
          :key="habit.id"
          type="button"
          role="tab"
          class="dashboard-habits__tab"
          :class="{ 'dashboard-habits__tab--active': activeHabitId === habit.id }"
          :aria-selected="activeHabitId === habit.id"
          :aria-label="habit.nom"
          :style="{ '--habit-color': habit.couleur }"
          @click="activeHabitId = habit.id"
        >
          <span
            class="dashboard-habits__tab-swatch"
            :class="{ 'dashboard-habits__tab-swatch--no-icon': !habit.icone }"
            aria-hidden="true"
          >
            {{ habit.icone || '' }}
          </span>
          <span class="dashboard-habits__tab-name">{{ habit.nom }}</span>
        </button>
      </nav>

      <HabitTrackerGrid
        v-if="activeHabit && userId"
        :key="activeHabit.id"
        monthly-only
        :habit="activeHabit"
        :user-id="userId"
      />
    </template>
  </section>
</template>

<style scoped>
.dashboard-habits {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  width: 100%;
  padding: 1.25rem;
  border-radius: 20px;
  border: 1px solid rgba(213, 181, 234, 0.25);
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 8px 32px rgba(173, 129, 190, 0.08);
  box-sizing: border-box;
}

.dashboard-habits__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: #ad81be;
  text-align: center;
}

.dashboard-habits__state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: #6c757d;
  font-weight: 700;
  font-size: 0.9rem;
  text-align: center;
}

.dashboard-habits__state--empty {
  flex-direction: column;
  padding: 0.35rem 0;
}

.dashboard-habits__error {
  margin: 0;
  color: #c0392b;
  font-weight: 700;
  font-size: 0.88rem;
  text-align: center;
}

.dashboard-habits__tabs {
  display: flex;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  gap: 0.5rem;
  margin: 0;
  padding: 0.35rem;
  border-radius: 14px;
  background: rgba(213, 181, 234, 0.12);
  border: 1px solid rgba(213, 181, 234, 0.25);
  box-sizing: border-box;
  overflow-x: auto;
  scrollbar-width: thin;
}

.dashboard-habits__tab {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  border: 2px solid transparent;
  border-radius: 10px;
  padding: 0.55rem 0.75rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: #6c757d;
  background: transparent;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.dashboard-habits__tab:hover {
  color: var(--habit-color, #ad81be);
  background: rgba(255, 255, 255, 0.45);
}

.dashboard-habits__tab--active {
  color: var(--habit-color, #ad81be);
  background: rgba(255, 255, 255, 0.85);
  border-color: var(--habit-color, #ad81be);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--habit-color, #ad81be) 25%, transparent);
}

.dashboard-habits__tab-swatch {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 8px;
  font-size: 0.9rem;
  line-height: 1;
  background-color: var(--habit-color, #ad81be);
}

.dashboard-habits__tab-swatch--no-icon {
  font-size: 0;
}

.dashboard-habits__tab-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spinner {
  display: inline-block;
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(173, 129, 190, 0.25);
  border-top-color: #ad81be;
  border-radius: 50%;
  animation: dashboard-habits-spin 0.8s linear infinite;
}

@keyframes dashboard-habits-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-color-scheme: dark) {
  .dashboard-habits {
    background: rgba(30, 25, 40, 0.65);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .dashboard-habits__tabs {
    background: rgba(35, 30, 48, 0.6);
    border-color: rgba(213, 181, 234, 0.15);
  }

  .dashboard-habits__tab {
    color: #adb5bd;
  }

  .dashboard-habits__tab:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .dashboard-habits__tab--active {
    background: rgba(45, 38, 58, 0.95);
    color: #d5b5ea;
  }

  .dashboard-habits__state {
    color: #adb5bd;
  }
}
</style>
