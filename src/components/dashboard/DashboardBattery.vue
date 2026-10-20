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
import {
  BATTERY_UPDATED_EVENT,
  getBatteryDashboardSnapshot,
} from '../../services/battery/batteryDays.js'
import { getLocalTodayISO } from '../../services/common/scheduledReminders.js'
import BatteryGauge from '../battery/BatteryGauge.vue'

const props = defineProps({
  userId: {
    type: String,
    default: null,
  },
})

const { pageTitle } = usePageDisplayLabel(APP_PAGE_IDS.BATTERY)

const pageVisibility = ref(mergePageVisibility(null))
const isLoading = ref(false)
const loadError = ref('')
const budget = ref(10)
const spent = ref(0)
const plannedSpent = ref(0)
const planOverBudget = ref(false)

const isBatteryPageVisible = computed(() =>
  isPageVisible(APP_PAGE_IDS.BATTERY, pageVisibility.value),
)

async function loadPageVisibilityState() {
  if (!props.userId) {
    pageVisibility.value = mergePageVisibility(null)
    return
  }
  try {
    pageVisibility.value = await loadPageVisibility(supabase, props.userId)
  } catch (err) {
    console.error('dashboard battery visibility:', err)
    pageVisibility.value = mergePageVisibility(null)
  }
}

async function loadSnapshot() {
  if (!props.userId || !isBatteryPageVisible.value) {
    budget.value = 10
    spent.value = 0
    plannedSpent.value = 0
    planOverBudget.value = false
    return
  }
  isLoading.value = true
  loadError.value = ''
  try {
    const snap = await getBatteryDashboardSnapshot(
      supabase,
      props.userId,
      getLocalTodayISO(),
    )
    budget.value = snap.budget
    spent.value = snap.spent
    plannedSpent.value = snap.plannedSpent ?? 0
    planOverBudget.value = Boolean(snap.planOverBudget)
  } catch (err) {
    console.error('dashboard battery:', err)
    loadError.value = 'Impossible de charger la batterie.'
  } finally {
    isLoading.value = false
  }
}

function onVisibilityUpdated() {
  loadPageVisibilityState().then(loadSnapshot)
}

onMounted(async () => {
  window.addEventListener(PAGE_VISIBILITY_UPDATED_EVENT, onVisibilityUpdated)
  window.addEventListener(BATTERY_UPDATED_EVENT, loadSnapshot)
  await loadPageVisibilityState()
  await loadSnapshot()
})

onUnmounted(() => {
  window.removeEventListener(PAGE_VISIBILITY_UPDATED_EVENT, onVisibilityUpdated)
  window.removeEventListener(BATTERY_UPDATED_EVENT, loadSnapshot)
})

watch(
  () => props.userId,
  async () => {
    await loadPageVisibilityState()
    await loadSnapshot()
  },
)
</script>

<template>
  <section v-if="isBatteryPageVisible" class="dash-battery" aria-labelledby="dash-battery-title">
    <div class="dash-battery__head">
      <h2 id="dash-battery-title" class="dash-battery__title">
        <RouterLink :to="{ name: 'battery' }" class="dash-battery__link">
          {{ pageTitle }}
        </RouterLink>
      </h2>
      <p class="dash-battery__hint">Batterie réelle du jour</p>
    </div>

    <div v-if="isLoading" class="dash-battery__loading">Chargement…</div>
    <p v-else-if="loadError" class="dash-battery__error">{{ loadError }}</p>
    <div v-else class="dash-battery__body">
      <BatteryGauge :budget="budget" :spent="spent" size="sm" />
      <p v-if="planOverBudget" class="dash-battery__hint-plan">
        Plan ({{ plannedSpent }}) au-dessus du budget ({{ budget }}).
      </p>
    </div>
  </section>
</template>

<style scoped>
.dash-battery {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 0.35rem 0.15rem;
}

.dash-battery__head {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.dash-battery__title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: #2c3e50;
}

.dash-battery__link {
  color: inherit;
  text-decoration: none;
}

.dash-battery__link:hover {
  text-decoration: underline;
}

.dash-battery__hint {
  margin: 0;
  font-size: 0.85rem;
  color: #6c757d;
}

.dash-battery__body {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.dash-battery__loading,
.dash-battery__error {
  margin: 0;
  font-size: 0.9rem;
  color: #6c757d;
}

.dash-battery__error {
  color: #c45c5c;
}

.dash-battery__hint-plan {
  margin: 0;
  font-size: 0.82rem;
  color: #8a6a40;
  line-height: 1.35;
}

@media (prefers-color-scheme: dark) {
  .dash-battery__title {
    color: #f0e8f8;
  }

  .dash-battery__hint,
  .dash-battery__loading {
    color: #adb5bd;
  }

  .dash-battery__hint-plan {
    color: #d4b56a;
  }
}
</style>
