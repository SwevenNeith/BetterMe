<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { supabase } from '../lib/supabase.js'
import { APP_PAGE_IDS } from '../constants/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import {
  isPageVisible,
  loadPageVisibility,
  mergePageVisibility,
  PAGE_VISIBILITY_UPDATED_EVENT,
} from '../services/pageVisibility.js'
import { syncProjectsListDoneStates } from '../services/projectDoneSync.js'
import {
  applyAlphabeticalProjectOrder,
  fetchProjectsTree,
  isProjectsCustomOrder,
} from '../services/projects.js'

const PROJECTS_PER_PAGE = 3

const props = defineProps({
  userId: {
    type: String,
    default: null,
  },
})

const { pageTitle: projectsPageTitle } = usePageDisplayLabel(APP_PAGE_IDS.PROJETS)

const pageVisibility = ref(mergePageVisibility(null))
const isLoading = ref(false)
const loadError = ref('')
const projects = ref([])
const currentPage = ref(0)

const isProjectsPageVisible = computed(() =>
  isPageVisible(APP_PAGE_IDS.PROJETS, pageVisibility.value),
)

function doneStepCount(steps) {
  return (steps ?? []).filter((step) => step.is_done).length
}

function isActiveProject(project) {
  const steps = project.steps ?? []
  if (steps.length === 0) return true
  return doneStepCount(steps) < steps.length
}

const activeProjects = computed(() => projects.value.filter(isActiveProject))

const totalPages = computed(() =>
  Math.max(1, Math.ceil(activeProjects.value.length / PROJECTS_PER_PAGE)),
)

const paginatedProjects = computed(() => {
  const start = currentPage.value * PROJECTS_PER_PAGE
  return activeProjects.value.slice(start, start + PROJECTS_PER_PAGE)
})

const showPagination = computed(() => activeProjects.value.length > PROJECTS_PER_PAGE)

watch(activeProjects, () => {
  if (currentPage.value > totalPages.value - 1) {
    currentPage.value = Math.max(0, totalPages.value - 1)
  }
})

function goToPage(index) {
  currentPage.value = Math.min(Math.max(index, 0), totalPages.value - 1)
}

async function loadPageVisibilityState() {
  if (!props.userId) {
    pageVisibility.value = mergePageVisibility(null)
    return
  }
  try {
    pageVisibility.value = await loadPageVisibility(supabase, props.userId)
  } catch (err) {
    console.error('dashboard projects visibility:', err)
    pageVisibility.value = mergePageVisibility(null)
  }
}

async function loadProjects() {
  if (!props.userId || !isProjectsPageVisible.value) {
    projects.value = []
    return
  }

  isLoading.value = true
  loadError.value = ''
  try {
    let list = await fetchProjectsTree(supabase, props.userId)
    if (!isProjectsCustomOrder(props.userId)) {
      list = await applyAlphabeticalProjectOrder(supabase, props.userId, list)
    }
    await syncProjectsListDoneStates(supabase, props.userId, list)
    projects.value = list
  } catch (err) {
    console.error('dashboard projects:', err)
    loadError.value = err.message || 'Impossible de charger les projets.'
    projects.value = []
  } finally {
    isLoading.value = false
  }
}

async function reload() {
  await loadPageVisibilityState()
  await loadProjects()
}

watch(
  () => props.userId,
  () => {
    currentPage.value = 0
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
    v-if="isProjectsPageVisible"
    class="dashboard-projects"
    aria-labelledby="dashboard-projects-title"
  >
    <h2 id="dashboard-projects-title" class="dashboard-projects__title">{{ projectsPageTitle }}</h2>

    <div v-if="isLoading" class="dashboard-projects__state">
      <span class="spinner" aria-hidden="true"></span>
      Chargement des projets…
    </div>

    <p v-else-if="loadError" class="dashboard-projects__error">{{ loadError }}</p>

    <p
      v-else-if="activeProjects.length === 0"
      class="dashboard-projects__state dashboard-projects__state--empty"
    >
      Aucun projet actif pour le moment.
    </p>

    <template v-else>
      <ul class="dashboard-projects__list">
        <li
          v-for="project in paginatedProjects"
          :key="project.id"
          class="dashboard-projects__item"
          :style="{ '--project-color': project.couleur }"
        >
          <div class="dashboard-projects__item-top">
            <span
              class="dashboard-projects__swatch"
              :class="{ 'dashboard-projects__swatch--no-icon': !project.icone }"
              aria-hidden="true"
            >
              {{ project.icone || '' }}
            </span>
            <h3 class="dashboard-projects__item-title">{{ project.title }}</h3>
          </div>

          <div class="dashboard-projects__item-footer">
            <span class="dashboard-projects__progress">
              {{ doneStepCount(project.steps) }}/{{ project.steps.length }}
            </span>
            <RouterLink
              :to="{ name: 'projet-detail', params: { projectId: project.id } }"
              class="dashboard-projects__view-btn"
            >
              Voir
            </RouterLink>
          </div>
        </li>
      </ul>

      <nav
        v-if="showPagination"
        class="dashboard-projects__pagination"
        aria-label="Pagination des projets"
      >
        <button
          type="button"
          class="dashboard-projects__page-btn"
          :disabled="currentPage === 0"
          aria-label="Page précédente"
          @click="goToPage(currentPage - 1)"
        >
          ‹
        </button>
        <span class="dashboard-projects__page-label">
          {{ currentPage + 1 }} / {{ totalPages }}
        </span>
        <button
          type="button"
          class="dashboard-projects__page-btn"
          :disabled="currentPage >= totalPages - 1"
          aria-label="Page suivante"
          @click="goToPage(currentPage + 1)"
        >
          ›
        </button>
      </nav>
    </template>
  </section>
</template>

<style scoped>
.dashboard-projects {
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

.dashboard-projects__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: #ad81be;
  text-align: center;
}

.dashboard-projects__state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: #6c757d;
  font-weight: 700;
  font-size: 0.9rem;
  text-align: center;
}

.dashboard-projects__state--empty {
  padding: 0.35rem 0;
}

.dashboard-projects__error {
  margin: 0;
  color: #c0392b;
  font-weight: 700;
  font-size: 0.88rem;
  text-align: center;
}

.dashboard-projects__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.dashboard-projects__item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 0.85rem;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--project-color, #ad81be) 35%, transparent);
  background: color-mix(in srgb, var(--project-color, #ad81be) 8%, rgba(255, 255, 255, 0.55));
}

.dashboard-projects__item-top {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.dashboard-projects__swatch {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 8px;
  font-size: 1rem;
  line-height: 1;
  background-color: var(--project-color, #ad81be);
  color: white;
}

.dashboard-projects__swatch--no-icon {
  font-size: 0;
}

.dashboard-projects__item-title {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: 0.95rem;
  font-weight: 800;
  color: #2c3e50;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-projects__item-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.dashboard-projects__progress {
  font-weight: 900;
  font-size: 0.95rem;
  color: var(--project-color, #ad81be);
  letter-spacing: 0.02em;
}

.dashboard-projects__view-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.45rem 0.85rem;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  font-weight: 800;
  font-size: 0.85rem;
  text-decoration: none;
  cursor: pointer;
  transition: transform 0.15s ease, filter 0.15s ease;
}

.dashboard-projects__view-btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.03);
}

.dashboard-projects__pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 0.15rem;
}

.dashboard-projects__page-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.45);
  background: rgba(255, 255, 255, 0.85);
  color: #ad81be;
  font-size: 1.1rem;
  font-weight: 800;
  cursor: pointer;
  transition: background 0.15s ease, opacity 0.15s ease;
}

.dashboard-projects__page-btn:hover:not(:disabled) {
  background: rgba(213, 181, 234, 0.2);
}

.dashboard-projects__page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.dashboard-projects__page-label {
  font-size: 0.85rem;
  font-weight: 800;
  color: #6c757d;
  min-width: 3.5rem;
  text-align: center;
}

.spinner {
  display: inline-block;
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(173, 129, 190, 0.25);
  border-top-color: #ad81be;
  border-radius: 50%;
  animation: dashboard-projects-spin 0.8s linear infinite;
}

@keyframes dashboard-projects-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-color-scheme: dark) {
  .dashboard-projects {
    background: rgba(30, 25, 40, 0.65);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .dashboard-projects__item {
    background: color-mix(in srgb, var(--project-color, #ad81be) 12%, rgba(30, 25, 40, 0.55));
  }

  .dashboard-projects__item-title {
    color: #f0e8f8;
  }

  .dashboard-projects__page-btn {
    background: rgba(30, 25, 40, 0.85);
    border-color: rgba(213, 181, 234, 0.25);
    color: #d5b5ea;
  }

  .dashboard-projects__state,
  .dashboard-projects__page-label {
    color: #adb5bd;
  }
}
</style>
