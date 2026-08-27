<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { supabase } from '../lib/supabase.js'
import { APP_MAIN_PAGES, APP_PAGE_IDS } from '../constants/appPages.js'
import { DASHBOARD_WIDGETS, DASHBOARD_WIDGET_IDS } from '../constants/dashboardWidgets.js'
import {
  createDefaultPageVisibility,
  savePageVisibility,
  getPageDisplayLabel,
} from '../services/pageVisibility.js'
import {
  createDefaultDashboardVisibility,
  saveDashboardVisibility,
} from '../services/dashboardVisibility.js'
import { markVisibilityOnboardingCompleted } from '../services/visibilityOnboarding.js'

const DASHBOARD_WIDGET_PAGE_IDS = {
  [DASHBOARD_WIDGET_IDS.TODO]: APP_PAGE_IDS.TODO,
  [DASHBOARD_WIDGET_IDS.TIMETABLE]: APP_PAGE_IDS.TIMETABLE,
  [DASHBOARD_WIDGET_IDS.HABITS]: APP_PAGE_IDS.HABIT,
  [DASHBOARD_WIDGET_IDS.MENSTRUATION]: APP_PAGE_IDS.MENSTRUATION,
  [DASHBOARD_WIDGET_IDS.PROJECTS]: APP_PAGE_IDS.PROJETS,
  [DASHBOARD_WIDGET_IDS.DICTIONARY_WORD]: APP_PAGE_IDS.DICTIONNAIRE,
  [DASHBOARD_WIDGET_IDS.READING_IN_PROGRESS]: APP_PAGE_IDS.LECTURE,
}

const props = defineProps({
  userId: {
    type: String,
    required: true,
  },
})

const emit = defineEmits(['completed'])

const pageVisibility = ref(createDefaultPageVisibility())
const dashboardVisibility = ref(createDefaultDashboardVisibility())
const isSaving = ref(false)
const saveError = ref('')

const pagesForList = computed(() =>
  APP_MAIN_PAGES.filter((page) => page.id !== APP_PAGE_IDS.DASHBOARD).map((page) => ({
    ...page,
    visible: pageVisibility.value[page.id]?.visible !== false,
    displayLabel: getPageDisplayLabel(page.id, pageVisibility.value, page.defaultLabel),
  })),
)

const dashboardWidgetsForList = computed(() =>
  DASHBOARD_WIDGETS.map((widget) => {
    const pageId = DASHBOARD_WIDGET_PAGE_IDS[widget.id]
    return {
      ...widget,
      visible: dashboardVisibility.value[widget.id]?.visible !== false,
      displayLabel: pageId
        ? getPageDisplayLabel(pageId, pageVisibility.value, widget.defaultLabel)
        : widget.defaultLabel,
    }
  }),
)

function onTogglePage(pageId, visible) {
  pageVisibility.value = {
    ...pageVisibility.value,
    [pageId]: {
      ...pageVisibility.value[pageId],
      visible,
    },
  }
}

function onToggleDashboard(widgetId, visible) {
  dashboardVisibility.value = {
    ...dashboardVisibility.value,
    [widgetId]: {
      ...dashboardVisibility.value[widgetId],
      visible,
    },
  }
}

async function onValidate() {
  if (!props.userId || isSaving.value) return

  isSaving.value = true
  saveError.value = ''
  try {
    pageVisibility.value = {
      ...pageVisibility.value,
      [APP_PAGE_IDS.DASHBOARD]: {
        ...pageVisibility.value[APP_PAGE_IDS.DASHBOARD],
        visible: true,
      },
    }
    await savePageVisibility(supabase, props.userId, pageVisibility.value)
    await saveDashboardVisibility(supabase, props.userId, dashboardVisibility.value)
    await markVisibilityOnboardingCompleted(supabase, props.userId)
    emit('completed')
  } catch (err) {
    console.error(err)
    saveError.value = err.message || 'Impossible d’enregistrer tes préférences.'
  } finally {
    isSaving.value = false
  }
}

onMounted(() => {
  pageVisibility.value = createDefaultPageVisibility()
  dashboardVisibility.value = createDefaultDashboardVisibility()
  document.documentElement.classList.add('visibility-onboarding-open')
  document.body.classList.add('visibility-onboarding-open')
})

onUnmounted(() => {
  document.documentElement.classList.remove('visibility-onboarding-open')
  document.body.classList.remove('visibility-onboarding-open')
})
</script>

<template>
  <div
    class="onboarding-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="onboarding-title"
  >
    <div class="onboarding-card">
      <header class="onboarding-header">
        <h1 id="onboarding-title" class="onboarding-title">Bienvenue sur BetterMe</h1>
        <p class="onboarding-subtitle">
          Choisis les pages que tu veux voir dans l’app, et les blocs à afficher sur ton Dashboard.
          Le Dashboard reste toujours accessible — tu pourras affiner tout ça dans Réglages → Visibilité.
        </p>
      </header>

      <div class="onboarding-body">
        <section class="onboarding-section" aria-labelledby="onboarding-pages-title">
          <h2 id="onboarding-pages-title" class="onboarding-section__title">Pages</h2>
          <p class="onboarding-section__desc">
            Affiche ou masque les pages dans le menu (le Dashboard reste toujours visible).
          </p>
          <ul class="onboarding-list" aria-label="Pages de l’application">
            <li v-for="page in pagesForList" :key="page.id" class="onboarding-row">
              <label class="onboarding-check">
                <input
                  type="checkbox"
                  class="onboarding-check__input"
                  :checked="page.visible"
                  :disabled="isSaving"
                  :aria-label="`${page.visible ? 'Masquer' : 'Afficher'} ${page.displayLabel}`"
                  @change="onTogglePage(page.id, $event.target.checked)"
                />
                <span class="onboarding-check__label">{{ page.displayLabel }}</span>
              </label>
            </li>
          </ul>
        </section>

        <section class="onboarding-section" aria-labelledby="onboarding-dashboard-title">
          <h2 id="onboarding-dashboard-title" class="onboarding-section__title">Dashboard</h2>
          <p class="onboarding-section__desc">
            Affiche ou masque chaque bloc du tableau de bord.
          </p>
          <ul class="onboarding-list" aria-label="Blocs du Dashboard">
            <li v-for="widget in dashboardWidgetsForList" :key="widget.id" class="onboarding-row">
              <label class="onboarding-check">
                <input
                  type="checkbox"
                  class="onboarding-check__input"
                  :checked="widget.visible"
                  :disabled="isSaving"
                  :aria-label="`${widget.visible ? 'Masquer' : 'Afficher'} ${widget.displayLabel}`"
                  @change="onToggleDashboard(widget.id, $event.target.checked)"
                />
                <span class="onboarding-check__label">{{ widget.displayLabel }}</span>
              </label>
            </li>
          </ul>
        </section>
      </div>

      <footer class="onboarding-footer">
        <p v-if="saveError" class="onboarding-error" role="alert">{{ saveError }}</p>
        <button
          type="button"
          class="btn btn--primary onboarding-submit"
          :disabled="isSaving"
          @click="onValidate"
        >
          {{ isSaving ? 'Enregistrement…' : 'Valider' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.onboarding-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(45, 35, 60, 0.55);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

.onboarding-card {
  width: min(560px, 100%);
  max-height: min(92vh, 820px);
  display: flex;
  flex-direction: column;
  background: #faf7fd;
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 20px;
  box-shadow: 0 20px 48px rgba(80, 50, 110, 0.22);
  overflow: hidden;
}

.onboarding-header {
  padding: 1.5rem 1.5rem 1rem;
  border-bottom: 1px solid rgba(213, 181, 234, 0.25);
  flex-shrink: 0;
}

.onboarding-title {
  margin: 0 0 0.5rem;
  font-size: 1.35rem;
  font-weight: 700;
  color: #4a3a5c;
  letter-spacing: -0.02em;
}

.onboarding-subtitle {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.5;
  color: #7a6b8a;
}

.onboarding-body {
  padding: 1rem 1.5rem;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.onboarding-section + .onboarding-section {
  margin-top: 1.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid rgba(213, 181, 234, 0.2);
}

.onboarding-section__title {
  margin: 0 0 0.35rem;
  font-size: 1.05rem;
  font-weight: 700;
  color: #5d4a6e;
}

.onboarding-section__desc {
  margin: 0 0 0.85rem;
  font-size: 0.85rem;
  color: #8c98a4;
  line-height: 1.4;
}

.onboarding-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.onboarding-row {
  margin: 0;
}

.onboarding-check {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.85rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid rgba(213, 181, 234, 0.28);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.onboarding-check:hover {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(173, 129, 190, 0.45);
}

.onboarding-check__input {
  width: 1.1rem;
  height: 1.1rem;
  accent-color: #9b6fb8;
  flex-shrink: 0;
  cursor: pointer;
}

.onboarding-check__label {
  font-size: 0.95rem;
  font-weight: 500;
  color: #4a3a5c;
}

.onboarding-footer {
  padding: 1rem 1.5rem 1.5rem;
  border-top: 1px solid rgba(213, 181, 234, 0.25);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.75rem;
  flex-shrink: 0;
}

.onboarding-error {
  margin: 0;
  font-size: 0.85rem;
  color: #c0392b;
  line-height: 1.4;
}

.onboarding-submit {
  width: 100%;
  justify-content: center;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.75rem 1.25rem;
  border-radius: 12px;
  border: none;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.1s ease;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn--primary {
  background: linear-gradient(135deg, #b88cd0, #9b6fb8);
  color: #fff;
  box-shadow: 0 4px 14px rgba(155, 111, 184, 0.35);
}

.btn--primary:not(:disabled):hover {
  opacity: 0.95;
}

@media (max-width: 480px) {
  .onboarding-overlay {
    padding: 0;
    align-items: stretch;
  }

  .onboarding-card {
    width: 100%;
    max-height: 100%;
    border-radius: 0;
    min-height: 100%;
  }
}
</style>
