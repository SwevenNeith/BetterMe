<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { APP_PAGE_IDS } from '../constants/common/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import { supabase } from '../lib/supabase.js'
import { resolveSessionUser } from '../utils/auth/sessionUser.js'
import {
  ensureSportProfile,
  sportMissingSchemaMessage,
  updateSportProfile,
} from '../services/sport/sportProfile.js'
import {
  createCustomExercise,
  listSportExercises,
  upsertWgerFavorite,
} from '../services/sport/sportExercises.js'
import {
  createWorkoutTemplate,
  deleteWorkoutTemplate,
  duplicateWorkoutTemplate,
  getWorkoutTemplate,
  listWorkoutTemplates,
} from '../services/sport/sportTemplates.js'
import {
  getSessionDetail,
  listSessions,
  startSession,
} from '../services/sport/sportSessions.js'
import {
  computeSportDashboard,
  getExerciseProgressSeries,
} from '../services/sport/sportStats.js'
import { listWgerEquipment, listWgerMuscles } from '../services/sport/wgerApi.js'
import { toExerciseSnapshot } from '../utils/sport/wgerExercise.js'
import SportDashboardPanel from '../components/sport/SportDashboardPanel.vue'
import SportCatalogPanel from '../components/sport/SportCatalogPanel.vue'
import SportProfilePanel from '../components/sport/SportProfilePanel.vue'
import SportGeneratorPanel from '../components/sport/SportGeneratorPanel.vue'
import SportTemplatesPanel from '../components/sport/SportTemplatesPanel.vue'
import SportHistoryPanel from '../components/sport/SportHistoryPanel.vue'

defineOptions({ name: 'SportView' })

const { pageTitle } = usePageDisplayLabel(APP_PAGE_IDS.SPORT, undefined, {
  setDocumentTitle: true,
})

const route = useRoute()
const router = useRouter()

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'catalog', label: 'Exercices' },
  { id: 'workouts', label: 'Séances' },
  { id: 'generator', label: 'Générateur' },
  { id: 'history', label: 'Historique' },
  { id: 'profile', label: 'Profil' },
]

const userId = ref(null)
const tab = ref('dashboard')
const schemaError = ref('')
const pageError = ref('')

const profile = ref(null)
const stats = ref(null)
const statsLoading = ref(false)
const profileSaving = ref(false)

const muscles = ref([])
const equipment = ref([])
const storedExercises = ref([])
const templates = ref([])
const templatesLoading = ref(false)
const selectedTemplate = ref(null)

const historySessions = ref([])
const historyLoading = ref(false)
const historyDetail = ref(null)
const progressSeries = ref([])

const draftBasket = ref([])

const favoriteWgerIds = computed(() =>
  storedExercises.value
    .filter((e) => e.source === 'wger' && e.is_favorite && e.wger_id)
    .map((e) => Number(e.wger_id)),
)

watch(
  () => route.query.tab,
  (q) => {
    const id = String(q || 'dashboard')
    if (TABS.some((t) => t.id === id)) tab.value = id
  },
  { immediate: true },
)

function setTab(id) {
  tab.value = id
  router.replace({ query: { ...route.query, tab: id } })
}

async function boot() {
  pageError.value = ''
  schemaError.value = ''
  try {
    const user = await resolveSessionUser()
    if (!user) {
      pageError.value = 'Connecte-toi pour utiliser le module Sport.'
      return
    }
    userId.value = user.id
    try {
      profile.value = await ensureSportProfile(supabase, user.id)
    } catch (err) {
      if (err?.code === 'SPORT_SCHEMA_MISSING' || String(err?.message || '').includes('create-sport')) {
        schemaError.value = sportMissingSchemaMessage()
        return
      }
      throw err
    }
    await Promise.all([loadRefs(), loadStoredExercises(), refreshDashboard(), loadTemplates()])
  } catch (err) {
    pageError.value = err?.message || 'Chargement Sport impossible.'
  }
}

async function loadRefs() {
  try {
    const [m, e] = await Promise.all([listWgerMuscles(), listWgerEquipment()])
    muscles.value = m
    equipment.value = e
  } catch (err) {
    console.warn('wger refs:', err)
  }
}

async function loadStoredExercises() {
  if (!userId.value) return
  storedExercises.value = await listSportExercises(supabase, userId.value)
}

async function refreshDashboard() {
  if (!userId.value || !profile.value) return
  statsLoading.value = true
  try {
    stats.value = await computeSportDashboard(supabase, userId.value, profile.value)
  } catch (err) {
    pageError.value = err?.message || 'Stats indisponibles.'
  } finally {
    statsLoading.value = false
  }
}

async function loadTemplates() {
  if (!userId.value) return
  templatesLoading.value = true
  try {
    templates.value = await listWorkoutTemplates(supabase, userId.value)
  } catch (err) {
    pageError.value = err?.message || 'Séances indisponibles.'
  } finally {
    templatesLoading.value = false
  }
}

async function saveProfile(patch) {
  if (!userId.value) return
  profileSaving.value = true
  pageError.value = ''
  try {
    profile.value = await updateSportProfile(supabase, userId.value, patch)
    await refreshDashboard()
  } catch (err) {
    pageError.value = err?.message || 'Enregistrement profil impossible.'
  } finally {
    profileSaving.value = false
  }
}

async function onCreateCustom(payload) {
  if (!userId.value) return
  try {
    await createCustomExercise(supabase, userId.value, payload)
    await loadStoredExercises()
    pageError.value = ''
  } catch (err) {
    pageError.value = err?.message || 'Création d’exercice impossible.'
  }
}

async function onFavorite(ex) {
  if (!userId.value) return
  try {
    if (ex.source === 'custom' && ex.dbId) {
      /* toggle via list — handled separately if needed */
      return
    }
    const isFav = !favoriteWgerIds.value.includes(Number(ex.id))
    await upsertWgerFavorite(supabase, userId.value, ex, isFav)
    await loadStoredExercises()
  } catch (err) {
    pageError.value = err?.message || 'Favori impossible.'
  }
}

function addToBasket(ex) {
  const snap = toExerciseSnapshot(ex)
  draftBasket.value = [
    ...draftBasket.value,
    {
      snapshot: snap,
      target_sets: 3,
      target_reps: 10,
      rest_seconds: 90,
      weight_unit: profile.value?.weight_unit || 'kg',
    },
  ]
  pageError.value = ''
  window.alert(`« ${snap.name} » ajouté au panier de séance (${draftBasket.value.length}). Va dans Séances pour enregistrer.`)
}

async function saveBasketAsTemplate() {
  if (!userId.value || !draftBasket.value.length) return
  try {
    const name = window.prompt('Nom de la séance', 'Ma séance') || 'Ma séance'
    await createWorkoutTemplate(supabase, userId.value, {
      name,
      exercises: draftBasket.value,
    })
    draftBasket.value = []
    await loadTemplates()
    setTab('workouts')
  } catch (err) {
    pageError.value = err?.message || 'Création de séance impossible.'
  }
}

async function onSaveGenerated(payload) {
  if (!userId.value) return
  try {
    await createWorkoutTemplate(supabase, userId.value, payload)
    await loadTemplates()
    setTab('workouts')
  } catch (err) {
    pageError.value = err?.message || 'Enregistrement impossible.'
  }
}

async function startFromPayload(payload) {
  if (!userId.value) return
  try {
    let exercises = payload.exercises
    if (payload.templateId || typeof payload === 'string') {
      const id = payload.templateId || payload
      const full = await getWorkoutTemplate(supabase, userId.value, id)
      if (!full) throw new Error('Modèle introuvable.')
      exercises = full.exercises
      payload = { name: full.name, template_id: full.id, exercises }
    }
    if (!exercises?.length) {
      pageError.value = 'Ajoute au moins un exercice avant de démarrer.'
      return
    }
    const session = await startSession(supabase, userId.value, {
      name: payload.name,
      template_id: payload.template_id || null,
      exercises,
    })
    await router.push(`/sport/seance/${session.id}`)
  } catch (err) {
    if (err?.code === 'SPORT_SESSION_ACTIVE' && err.sessionId) {
      if (window.confirm('Une séance est déjà en cours. La reprendre ?')) {
        await router.push(`/sport/seance/${err.sessionId}`)
      }
      return
    }
    pageError.value = err?.message || 'Démarrage impossible.'
  }
}

async function startTemplate(id) {
  await startFromPayload({ templateId: id })
}

async function createTemplate(payload) {
  if (!userId.value) return
  try {
    const created = await createWorkoutTemplate(supabase, userId.value, payload)
    await loadTemplates()
    selectedTemplate.value = created
  } catch (err) {
    pageError.value = err?.message || 'Création impossible.'
  }
}

async function editTemplate(id) {
  if (!userId.value) return
  selectedTemplate.value = await getWorkoutTemplate(supabase, userId.value, id)
}

async function duplicateTemplate(id) {
  if (!userId.value) return
  try {
    await duplicateWorkoutTemplate(supabase, userId.value, id)
    await loadTemplates()
  } catch (err) {
    pageError.value = err?.message || 'Duplication impossible.'
  }
}

async function removeTemplate(id) {
  if (!userId.value) return
  try {
    await deleteWorkoutTemplate(supabase, userId.value, id)
    if (selectedTemplate.value?.id === id) selectedTemplate.value = null
    await loadTemplates()
  } catch (err) {
    pageError.value = err?.message || 'Suppression impossible.'
  }
}

async function loadHistory(filter = { period: 'all', status: 'completed' }) {
  if (!userId.value) return
  historyLoading.value = true
  try {
    const opts = { limit: 40 }
    if (filter.status && filter.status !== 'all') opts.status = filter.status
    if (filter.period === 'week') {
      const d = new Date()
      d.setDate(d.getDate() - 7)
      opts.from = d.toISOString()
    } else if (filter.period === 'month') {
      const d = new Date()
      d.setDate(d.getDate() - 30)
      opts.from = d.toISOString()
    }
    historySessions.value = await listSessions(supabase, userId.value, opts)
  } catch (err) {
    pageError.value = err?.message || 'Historique indisponible.'
  } finally {
    historyLoading.value = false
  }
}

async function selectHistory(id) {
  if (!userId.value) return
  historyDetail.value = await getSessionDetail(supabase, userId.value, id)
  const first = historyDetail.value?.exercises?.[0]
  if (first) {
    progressSeries.value = await getExerciseProgressSeries(supabase, userId.value, {
      wgerId: first.snapshot?.wger_id,
      name: first.snapshot?.name,
    })
  } else {
    progressSeries.value = []
  }
}

async function copySessionToTemplate(id) {
  if (!userId.value) return
  try {
    const detail = await getSessionDetail(supabase, userId.value, id)
    if (!detail) return
    await createWorkoutTemplate(supabase, userId.value, {
      name: `${detail.name} (copie)`,
      exercises: (detail.exercises || []).map((ex, i) => ({
        sort_order: i,
        exercise_id: ex.exercise_id,
        target_sets: ex.target_sets,
        target_reps: ex.target_reps,
        target_weight: ex.target_weight,
        weight_unit: ex.weight_unit,
        rest_seconds: ex.rest_seconds,
        snapshot: ex.snapshot,
      })),
    })
    await loadTemplates()
    setTab('workouts')
  } catch (err) {
    pageError.value = err?.message || 'Copie impossible.'
  }
}

watch(tab, (id) => {
  if (id === 'history') void loadHistory()
  if (id === 'workouts') void loadTemplates()
  if (id === 'dashboard') void refreshDashboard()
})

onMounted(() => {
  void boot()
})
</script>

<template>
  <div class="sport-wrapper">
    <header class="sport-header">
      <h1 class="sport-title">{{ pageTitle }}</h1>
      <p class="sport-subtitle">
        Catalogue Wger, séances personnalisées, entraînement et suivi de progression.
      </p>
    </header>

    <p v-if="schemaError" class="sport-alert" role="alert">{{ schemaError }}</p>
    <p v-else-if="pageError" class="sport-alert" role="alert">{{ pageError }}</p>

    <template v-if="!schemaError && userId">
      <div class="sport-tabs-wrap">
        <div class="sport-tabs" role="tablist" aria-label="Sections Sport">
          <button
            v-for="t in TABS"
            :key="t.id"
            type="button"
            role="tab"
            class="sport-tab"
            :class="{ 'sport-tab--active': tab === t.id }"
            :aria-selected="tab === t.id"
            @click="setTab(t.id)"
          >
            {{ t.label }}
          </button>
        </div>
      </div>

      <div v-if="draftBasket.length" class="sport-basket">
        Panier : {{ draftBasket.length }} exercice(s)
        <button type="button" class="sport-mini-btn" @click="saveBasketAsTemplate">
          Enregistrer comme séance
        </button>
        <button type="button" class="sport-mini-btn" @click="draftBasket = []">Vider</button>
      </div>

      <section class="sport-card">
        <SportDashboardPanel
          v-if="tab === 'dashboard'"
          :stats="stats"
          :loading="statsLoading"
          @new-session="setTab('workouts')"
          @resume="(s) => router.push(`/sport/seance/${s.id}`)"
        />

        <SportCatalogPanel
          v-else-if="tab === 'catalog'"
          :favorite-wger-ids="favoriteWgerIds"
          :custom-exercises="storedExercises"
          @favorite="onFavorite"
          @add="addToBasket"
          @create-custom="onCreateCustom"
        />

        <SportTemplatesPanel
          v-else-if="tab === 'workouts'"
          :templates="templates"
          :selected-template="selectedTemplate"
          :loading="templatesLoading"
          @refresh="loadTemplates"
          @create="createTemplate"
          @start="startTemplate"
          @duplicate="duplicateTemplate"
          @delete="removeTemplate"
          @edit="editTemplate"
        />

        <SportGeneratorPanel
          v-else-if="tab === 'generator'"
          :profile="profile"
          :muscles="muscles"
          :favorite-wger-ids="favoriteWgerIds"
          @save-template="onSaveGenerated"
          @start="startFromPayload"
        />

        <SportHistoryPanel
          v-else-if="tab === 'history'"
          :sessions="historySessions"
          :detail="historyDetail"
          :progress-series="progressSeries"
          :loading="historyLoading"
          @filter="loadHistory"
          @select="selectHistory"
          @copy="copySessionToTemplate"
        />

        <SportProfilePanel
          v-else-if="tab === 'profile'"
          :profile="profile"
          :muscles="muscles"
          :equipment="equipment"
          :saving="profileSaving"
          @save="saveProfile"
        />
      </section>
    </template>
  </div>
</template>

<style scoped>
.sport-wrapper {
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
  min-width: 0;
}

.sport-header {
  margin-bottom: 1rem;
  text-align: center;
}

.sport-title {
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  margin: 0;
}

.sport-subtitle {
  margin: 0.5rem auto 0;
  color: #6c757d;
  font-size: 1rem;
  max-width: 42rem;
  line-height: 1.45;
}

.sport-alert {
  margin: 0 0 1rem;
  padding: 0.7rem 0.85rem;
  border-radius: 10px;
  background: rgba(192, 57, 43, 0.1);
  color: #c0392b;
  font-weight: 650;
}

.sport-tabs-wrap {
  display: flex;
  justify-content: center;
  margin-bottom: 1rem;
}

.sport-tabs {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.25rem;
  border-radius: 999px;
  background: rgba(213, 181, 234, 0.22);
  border: 1px solid rgba(173, 129, 190, 0.28);
  max-width: 100%;
}

.sport-tab {
  border: none;
  border-radius: 999px;
  padding: 0.45rem 0.95rem;
  background: transparent;
  color: #6b4f7c;
  font: inherit;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.sport-tab:hover {
  background: rgba(255, 255, 255, 0.55);
}

.sport-tab--active {
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: #fff;
}

.sport-card {
  width: 100%;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 16px;
  padding: 1.25rem;
  box-sizing: border-box;
}

.sport-basket {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.85rem;
  padding: 0.55rem 0.85rem;
  border-radius: 12px;
  border: 1px solid rgba(143, 162, 212, 0.35);
  background: rgba(143, 162, 212, 0.16);
  font-weight: 700;
  font-size: 0.88rem;
  color: #3b2a4a;
}

.sport-mini-btn {
  border: 1px solid rgba(173, 129, 190, 0.35);
  background: rgba(255, 255, 255, 0.75);
  border-radius: 999px;
  padding: 0.3rem 0.7rem;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  color: #6b4f7c;
}

@media (prefers-color-scheme: dark) {
  .sport-title {
    color: #f0e8f8;
  }
  .sport-subtitle {
    color: #adb5bd;
  }
  .sport-tabs {
    background: rgba(173, 129, 190, 0.18);
    border-color: rgba(213, 181, 234, 0.22);
  }
  .sport-tab {
    color: #e9d5f5;
  }
  .sport-tab:hover {
    background: rgba(255, 255, 255, 0.08);
  }
  .sport-card {
    background: rgba(35, 30, 48, 0.75);
    border-color: rgba(213, 181, 234, 0.2);
  }
  .sport-mini-btn {
    background: #2a2438;
    color: #f0e8f8;
  }
  .sport-basket {
    color: #f0e8f8;
  }
}
</style>
