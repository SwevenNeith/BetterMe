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
import { listFinanceTransactions } from '../../services/finances/financeTransactions.js'
import {
  MONTH_LONG,
  donutArcPath,
  donutSegments,
  formatEuro,
  periodAggregates,
} from '../../utils/finances/financeMath.js'

const props = defineProps({
  userId: {
    type: String,
    default: null,
  },
})

const INCOME_COLORS = ['#8FA2D4', '#A8B8E0', '#6B82C4', '#C5D0EC', '#5A6FB0', '#D8E0F2']
const VARIABLE_COLORS = ['#E8A0C0', '#F0B8D0', '#D489A8', '#F5C4D8', '#C97A9E', '#FADCED']
const FIXED_COLORS = ['#72A098', '#95D1AA', '#5A8A82', '#B0D9C0', '#4D7A72', '#C8E6D4']

const { pageTitle: financesPageTitle } = usePageDisplayLabel(APP_PAGE_IDS.FINANCES)

const pageVisibility = ref(mergePageVisibility(null))
const isLoading = ref(false)
const loadError = ref('')
const transactions = ref([])

const now = new Date()
const selectedYear = now.getFullYear()
const selectedMonth = now.getMonth() + 1

const isFinancesPageVisible = computed(() =>
  isPageVisible(APP_PAGE_IDS.FINANCES, pageVisibility.value),
)

const periodLabel = computed(
  () => `${MONTH_LONG[selectedMonth - 1] || ''} ${selectedYear}`,
)

const periodAgg = computed(() =>
  periodAggregates(transactions.value, selectedYear, selectedMonth, null),
)

const charts = computed(() => [
  {
    key: 'income',
    title: 'Revenus',
    total: periodAgg.value.realizedIncome,
    hasData: periodAgg.value.hasRealizedIncome,
    segments: donutSegments(periodAgg.value.incomeByCat, INCOME_COLORS),
    empty: 'Aucun revenu réalisé',
    theme: 'income',
  },
  {
    key: 'fixed',
    title: 'Dépenses fixes',
    total: periodAgg.value.realizedFixed,
    hasData: periodAgg.value.hasRealizedFixed,
    segments: donutSegments(periodAgg.value.fixedByCat, FIXED_COLORS),
    empty: 'Aucune dépense fixe réalisée',
    theme: 'fixed',
  },
  {
    key: 'variable',
    title: 'Dépenses variables',
    total: periodAgg.value.realizedVariable,
    hasData: periodAgg.value.hasRealizedVariable,
    segments: donutSegments(periodAgg.value.variableByCat, VARIABLE_COLORS),
    empty: 'Aucune dépense variable réalisée',
    theme: 'variable',
  },
])

async function loadPageVisibilityState() {
  if (!props.userId) {
    pageVisibility.value = mergePageVisibility(null)
    return
  }
  try {
    pageVisibility.value = await loadPageVisibility(supabase, props.userId)
  } catch (err) {
    console.error('dashboard finances visibility:', err)
    pageVisibility.value = mergePageVisibility(null)
  }
}

async function loadTransactions() {
  if (!props.userId || !isFinancesPageVisible.value) {
    transactions.value = []
    return
  }
  isLoading.value = true
  loadError.value = ''
  try {
    transactions.value = await listFinanceTransactions(supabase, props.userId)
  } catch (err) {
    console.error('dashboard finances:', err)
    loadError.value = err?.message || 'Impossible de charger les finances.'
    transactions.value = []
  } finally {
    isLoading.value = false
  }
}

async function reload() {
  await loadPageVisibilityState()
  await loadTransactions()
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
  <section
    v-if="isFinancesPageVisible"
    class="dashboard-finances"
    aria-labelledby="dashboard-finances-title"
  >
    <div class="dashboard-finances__head">
      <div>
        <h2 id="dashboard-finances-title" class="dashboard-finances__title">
          {{ financesPageTitle }}
        </h2>
        <p class="dashboard-finances__hint">
          Compte courant · réalisés · {{ periodLabel }}
        </p>
      </div>
      <RouterLink :to="{ name: 'finances' }" class="dashboard-finances__link">
        Voir tout
      </RouterLink>
    </div>

    <div v-if="isLoading" class="dashboard-finances__state">
      <span class="spinner" aria-hidden="true"></span>
      Chargement des finances…
    </div>

    <p v-else-if="loadError" class="dashboard-finances__error">{{ loadError }}</p>

    <div v-else class="dashboard-finances__grid">
      <article
        v-for="chart in charts"
        :key="chart.key"
        class="dashboard-finances__card"
        :class="`theme-${chart.theme}`"
      >
        <h3 class="dashboard-finances__card-title">{{ chart.title }}</h3>
        <p class="dashboard-finances__card-total">{{ formatEuro(chart.total) }}</p>
        <div v-if="chart.hasData" class="dashboard-finances__donut-wrap">
          <svg
            viewBox="0 0 100 100"
            class="dashboard-finances__donut"
            :aria-label="`${chart.title} : ${formatEuro(chart.total)}`"
          >
            <circle
              cx="50"
              cy="50"
              r="32"
              fill="none"
              class="dashboard-finances__donut-track"
              stroke-width="16"
            />
            <path
              v-for="(seg, i) in chart.segments"
              :key="chart.key + '-' + i"
              :d="donutArcPath(seg.startAngle, seg.endAngle)"
              :fill="seg.color"
            />
          </svg>
        </div>
        <p v-else class="dashboard-finances__empty">{{ chart.empty }}</p>
        <ul v-if="chart.hasData && chart.segments.length" class="dashboard-finances__legend">
          <li v-for="seg in chart.segments.slice(0, 3)" :key="chart.key + '-l-' + seg.name">
            <span class="dashboard-finances__swatch" :style="{ background: seg.color }" />
            <span class="dashboard-finances__legend-name">{{ seg.name }}</span>
            <span class="dashboard-finances__legend-pct">{{ seg.pct }} %</span>
          </li>
        </ul>
      </article>
    </div>
  </section>
</template>

<style scoped>
.dashboard-finances {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  width: 100%;
  min-width: 0;
  padding: 1rem 1.05rem 1.1rem;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  border: 1px solid color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
  box-sizing: border-box;
}

.dashboard-finances__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
}

.dashboard-finances__title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--color-text);
}

.dashboard-finances__hint {
  margin: 0.25rem 0 0;
  font-size: 0.82rem;
  color: var(--color-text-light);
}

.dashboard-finances__link {
  flex-shrink: 0;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--color-primary-dark);
  text-decoration: none;
}

.dashboard-finances__link:hover {
  text-decoration: underline;
}

.dashboard-finances__state,
.dashboard-finances__error,
.dashboard-finances__empty {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text-light);
}

.dashboard-finances__error {
  color: #b42318;
}

.dashboard-finances__state {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid color-mix(in srgb, var(--color-primary-dark) 25%, transparent);
  border-top-color: var(--color-primary-dark);
  border-radius: 50%;
  animation: dash-fin-spin 1s linear infinite;
}

@keyframes dash-fin-spin {
  to {
    transform: rotate(360deg);
  }
}

.dashboard-finances__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.65rem;
}

.dashboard-finances__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
  padding: 0.7rem 0.55rem 0.75rem;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-primary) 8%, rgba(255, 255, 255, 0.7));
  border: 1px solid color-mix(in srgb, var(--color-primary) 22%, transparent);
}

.dashboard-finances__card.theme-income {
  border-color: color-mix(in srgb, var(--color-secondary) 40%, transparent);
}

.dashboard-finances__card.theme-fixed {
  border-color: color-mix(in srgb, var(--color-tertiary) 40%, transparent);
}

.dashboard-finances__card.theme-variable {
  border-color: color-mix(in srgb, #e8a0c0 45%, transparent);
}

.dashboard-finances__card-title {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  text-align: center;
  color: var(--color-text-light);
}

.dashboard-finances__card-total {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--color-text);
  text-align: center;
}

.dashboard-finances__donut-wrap {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-top: 0.15rem;
}

.dashboard-finances__donut {
  width: 92px;
  height: 92px;
}

.dashboard-finances__donut-track {
  stroke: color-mix(in srgb, var(--color-secondary) 18%, transparent);
}

.dashboard-finances__legend {
  list-style: none;
  margin: 0.25rem 0 0;
  padding: 0;
  width: 100%;
  display: grid;
  gap: 0.2rem;
}

.dashboard-finances__legend li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.3rem;
  align-items: center;
  font-size: 0.68rem;
  font-weight: 650;
  color: var(--color-text);
}

.dashboard-finances__swatch {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 2px;
  flex-shrink: 0;
}

.dashboard-finances__legend-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-finances__legend-pct {
  color: var(--color-text-light);
  white-space: nowrap;
}

@media (max-width: 700px) {
  .dashboard-finances__grid {
    grid-template-columns: 1fr;
  }

  .dashboard-finances__donut {
    width: 110px;
    height: 110px;
  }

  .dashboard-finances__legend {
    max-width: 16rem;
  }
}

@media (prefers-color-scheme: dark) {
  .dashboard-finances {
    background: color-mix(in srgb, var(--color-background) 88%, var(--color-primary));
    border-color: color-mix(in srgb, var(--color-primary) 32%, transparent);
  }

  .dashboard-finances__card {
    background: color-mix(in srgb, var(--color-background) 80%, var(--color-primary));
  }

  .dashboard-finances__link {
    color: var(--color-primary);
  }
}
</style>
