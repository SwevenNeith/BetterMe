<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { supabase } from '../lib/supabase.js'
import { APP_PAGE_IDS } from '../constants/appPages.js'
import { dictionaryWordTypeAbbr } from '../constants/dictionaryWordTypes.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import {
  isPageVisible,
  loadPageVisibility,
  mergePageVisibility,
  PAGE_VISIBILITY_UPDATED_EVENT,
} from '../services/pageVisibility.js'
import { listDictionaryEntries } from '../services/dictionaryEntries.js'
import { pickWordOfTheDay } from '../utils/dashboardWordOfTheDay.js'

const props = defineProps({
  userId: {
    type: String,
    default: null,
  },
})

const { pageTitle: dictionaryPageTitle } = usePageDisplayLabel(APP_PAGE_IDS.DICTIONNAIRE)

const pageVisibility = ref(mergePageVisibility(null))
const isLoading = ref(false)
const loadError = ref('')
const entry = ref(null)

const isDictionaryPageVisible = computed(() =>
  isPageVisible(APP_PAGE_IDS.DICTIONNAIRE, pageVisibility.value),
)

async function loadPageVisibilityState() {
  if (!props.userId) {
    pageVisibility.value = mergePageVisibility(null)
    return
  }
  try {
    pageVisibility.value = await loadPageVisibility(supabase, props.userId)
  } catch (err) {
    console.error('dashboard word visibility:', err)
    pageVisibility.value = mergePageVisibility(null)
  }
}

async function loadWord() {
  if (!props.userId || !isDictionaryPageVisible.value) {
    entry.value = null
    return
  }

  isLoading.value = true
  loadError.value = ''
  try {
    const entries = await listDictionaryEntries(supabase, props.userId)
    entry.value = pickWordOfTheDay(entries, props.userId)
  } catch (err) {
    console.error('dashboard word of the day:', err)
    loadError.value = err.message || 'Impossible de charger le mot du jour.'
    entry.value = null
  } finally {
    isLoading.value = false
  }
}

async function reload() {
  await loadPageVisibilityState()
  await loadWord()
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
    v-if="isDictionaryPageVisible"
    class="dashboard-wotd"
    aria-labelledby="dashboard-wotd-title"
  >
    <div class="dashboard-wotd__header">
      <h2 id="dashboard-wotd-title" class="dashboard-wotd__title">Mot du jour</h2>
      <RouterLink :to="{ name: 'dictionnaire' }" class="dashboard-wotd__link">
        {{ dictionaryPageTitle }}
      </RouterLink>
    </div>

    <div v-if="isLoading" class="dashboard-wotd__state">
      <span class="spinner" aria-hidden="true"></span>
      Chargement…
    </div>

    <p v-else-if="loadError" class="dashboard-wotd__error">{{ loadError }}</p>

    <p
      v-else-if="!entry"
      class="dashboard-wotd__state dashboard-wotd__state--empty"
    >
      Aucun mot dans ton répertoire pour l’instant.
    </p>

    <div v-else class="dashboard-wotd__card">
      <p class="dashboard-wotd__word">
        {{ entry.word }}
        <span
          v-if="dictionaryWordTypeAbbr(entry.word_type)"
          class="dashboard-wotd__type"
        >
          {{ dictionaryWordTypeAbbr(entry.word_type) }}
        </span>
      </p>
      <p class="dashboard-wotd__definition">{{ entry.definition }}</p>
    </div>
  </section>
</template>

<style scoped>
.dashboard-wotd {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
  padding: 1rem 1.1rem;
  border-radius: 16px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-sizing: border-box;
}

.dashboard-wotd__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.dashboard-wotd__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: #ad81be;
}

.dashboard-wotd__link {
  font-size: 0.78rem;
  font-weight: 700;
  color: #8c6a9e;
  text-decoration: none;
  white-space: nowrap;
}

.dashboard-wotd__link:hover {
  text-decoration: underline;
}

.dashboard-wotd__state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: #6c757d;
  font-weight: 700;
  font-size: 0.9rem;
  text-align: center;
}

.dashboard-wotd__state--empty {
  padding: 0.35rem 0;
}

.dashboard-wotd__error {
  margin: 0;
  color: #c0392b;
  font-weight: 700;
  font-size: 0.88rem;
  text-align: center;
}

.dashboard-wotd__card {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.dashboard-wotd__word {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 800;
  color: #2c3e50;
  line-height: 1.3;
}

.dashboard-wotd__type {
  margin-left: 0.35rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: #ad81be;
  font-style: italic;
}

.dashboard-wotd__definition {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.45;
  color: #5a6570;
  font-weight: 600;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(213, 181, 234, 0.35);
  border-top-color: #ad81be;
  border-radius: 50%;
  animation: dash-wotd-spin 1s linear infinite;
}

@keyframes dash-wotd-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-color-scheme: dark) {
  .dashboard-wotd {
    background: rgba(25, 20, 35, 0.65);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .dashboard-wotd__word {
    color: #f0e8f8;
  }

  .dashboard-wotd__definition {
    color: #c5b8d4;
  }

  .dashboard-wotd__state {
    color: #adb5bd;
  }
}
</style>
