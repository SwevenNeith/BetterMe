<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { APP_PAGE_IDS } from '../constants/common/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import { supabase } from '../lib/supabase.js'
import { resolveSessionUser } from '../utils/auth/sessionUser.js'
import {
  abandonSession,
  completeSession,
  deleteSessionSet,
  getLastPerformanceForExercise,
  getSessionDetail,
  pauseSession,
  resumeSession,
  updateSessionProgress,
  upsertSessionSet,
} from '../services/sport/sportSessions.js'
import { formatDuration } from '../services/sport/sportStats.js'
import { snapshotDisplayName } from '../utils/sport/wgerExercise.js'

defineOptions({ name: 'SportWorkoutView' })

usePageDisplayLabel(APP_PAGE_IDS.SPORT, 'Entraînement', { setDocumentTitle: true })

const route = useRoute()
const router = useRouter()

const userId = ref(null)
const session = ref(null)
const loading = ref(true)
const error = ref('')
const saving = ref(false)

const activeElapsedMs = ref(0)
const tickStartedAt = ref(null)
const nowMs = ref(Date.now())
let tickTimer = null
let persistTimer = null

const restRemaining = ref(0)
let restTimer = null

const reps = ref(10)
const weight = ref(null)
const difficulty = ref(null)
const setNotes = ref('')

const lastPerf = ref(null)

const currentExercise = computed(() => {
  const list = session.value?.exercises || []
  const idx = Math.min(
    Math.max(0, Number(session.value?.current_exercise_index) || 0),
    Math.max(0, list.length - 1),
  )
  return list[idx] || null
})

const currentSets = computed(() => currentExercise.value?.sets || [])

const snap = computed(() => currentExercise.value?.snapshot || {})

const isPaused = computed(() => session.value?.status === 'paused')
const isFinished = computed(() =>
  ['completed', 'abandoned'].includes(session.value?.status),
)

const displayElapsed = computed(() => {
  let ms = activeElapsedMs.value
  if (!isPaused.value && !isFinished.value && tickStartedAt.value) {
    ms += nowMs.value - tickStartedAt.value
  }
  return Math.round(ms / 1000)
})

function startTick() {
  stopTick()
  if (isPaused.value || isFinished.value) return
  tickStartedAt.value = Date.now()
  nowMs.value = Date.now()
  tickTimer = setInterval(() => {
    nowMs.value = Date.now()
  }, 1000)
}

function stopTick() {
  if (tickStartedAt.value) {
    activeElapsedMs.value += Date.now() - tickStartedAt.value
    tickStartedAt.value = null
  }
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

function schedulePersist() {
  clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    void persistProgress()
  }, 2000)
}

async function persistProgress(extra = {}) {
  if (!userId.value || !session.value || isFinished.value) return
  const ms = displayElapsed.value * 1000
  try {
    await updateSessionProgress(supabase, userId.value, session.value.id, {
      active_elapsed_ms: ms,
      current_exercise_index: session.value.current_exercise_index,
      ...extra,
    })
  } catch (err) {
    console.warn('sport persist:', err)
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const user = await resolveSessionUser()
    if (!user) {
      error.value = 'Connecte-toi pour continuer la séance.'
      return
    }
    userId.value = user.id
    const detail = await getSessionDetail(supabase, user.id, String(route.params.sessionId))
    if (!detail) {
      error.value = 'Séance introuvable.'
      return
    }
    session.value = detail
    activeElapsedMs.value = Number(detail.active_elapsed_ms) || 0
    const ex = detail.exercises?.[detail.current_exercise_index || 0]
    if (ex) {
      reps.value = ex.target_reps ?? 10
      weight.value = ex.target_weight
    }
    startTick()
    await loadLastPerf()
  } catch (err) {
    error.value = err?.message || 'Chargement impossible.'
  } finally {
    loading.value = false
  }
}

async function loadLastPerf() {
  lastPerf.value = null
  const ex = currentExercise.value
  if (!ex || !userId.value) return
  try {
    lastPerf.value = await getLastPerformanceForExercise(supabase, userId.value, {
      wgerId: ex.snapshot?.wger_id,
      name: ex.snapshot?.name,
    })
  } catch {
    lastPerf.value = null
  }
}

watch(
  () => session.value?.current_exercise_index,
  () => {
    const ex = currentExercise.value
    if (ex) {
      reps.value = ex.target_reps ?? 10
      weight.value = ex.target_weight
    }
    void loadLastPerf()
  },
)

async function onPause() {
  stopTick()
  saving.value = true
  try {
    await pauseSession(supabase, userId.value, session.value.id, activeElapsedMs.value)
    session.value = { ...session.value, status: 'paused' }
  } catch (err) {
    error.value = err?.message || 'Pause impossible.'
    startTick()
  } finally {
    saving.value = false
  }
}

async function onResume() {
  saving.value = true
  try {
    await resumeSession(supabase, userId.value, session.value.id)
    session.value = { ...session.value, status: 'in_progress', paused_at: null }
    startTick()
  } catch (err) {
    error.value = err?.message || 'Reprise impossible.'
  } finally {
    saving.value = false
  }
}

async function validateSet() {
  if (!currentExercise.value || saving.value || isFinished.value) return
  saving.value = true
  error.value = ''
  try {
    const setNumber = (currentSets.value?.length || 0) + 1
    const saved = await upsertSessionSet(supabase, userId.value, {
      session_id: session.value.id,
      session_exercise_id: currentExercise.value.id,
      set_number: setNumber,
      reps: reps.value,
      weight: weight.value,
      weight_unit: currentExercise.value.weight_unit || 'kg',
      difficulty: difficulty.value,
      notes: setNotes.value.trim() || null,
    })
    const exercises = session.value.exercises.map((ex) => {
      if (ex.id !== currentExercise.value.id) return ex
      return { ...ex, sets: [...(ex.sets || []), saved] }
    })
    session.value = { ...session.value, exercises }
    setNotes.value = ''
    difficulty.value = null
    await persistProgress()
    const target = Number(currentExercise.value.target_sets) || 3
    if (setNumber >= target) {
      startRest(Number(currentExercise.value.rest_seconds) || 90)
    } else {
      startRest(Number(currentExercise.value.rest_seconds) || 90)
    }
  } catch (err) {
    error.value = err?.message || 'Enregistrement de série impossible.'
  } finally {
    saving.value = false
  }
}

function startRest(seconds) {
  clearInterval(restTimer)
  restRemaining.value = Math.max(0, Number(seconds) || 0)
  if (!restRemaining.value) return
  restTimer = setInterval(() => {
    restRemaining.value -= 1
    if (restRemaining.value <= 0) {
      clearInterval(restTimer)
      restTimer = null
      restRemaining.value = 0
    }
  }, 1000)
}

async function removeLastSet() {
  const sets = currentSets.value
  if (!sets.length) return
  const last = sets[sets.length - 1]
  if (!window.confirm('Supprimer la dernière série ?')) return
  saving.value = true
  try {
    await deleteSessionSet(supabase, userId.value, last.id)
    const exercises = session.value.exercises.map((ex) => {
      if (ex.id !== currentExercise.value.id) return ex
      return { ...ex, sets: ex.sets.filter((s) => s.id !== last.id) }
    })
    session.value = { ...session.value, exercises }
  } catch (err) {
    error.value = err?.message || 'Suppression impossible.'
  } finally {
    saving.value = false
  }
}

async function goExercise(delta) {
  const list = session.value?.exercises || []
  if (!list.length) return
  const next = Math.min(list.length - 1, Math.max(0, (session.value.current_exercise_index || 0) + delta))
  session.value = { ...session.value, current_exercise_index: next }
  schedulePersist()
  await persistProgress({ current_exercise_index: next })
}

async function finish(kind) {
  stopTick()
  clearInterval(restTimer)
  const notes =
    kind === 'complete'
      ? window.prompt('Notes de fin (optionnel) :', session.value?.notes || '') 
      : null
  saving.value = true
  try {
    if (kind === 'complete') {
      await completeSession(supabase, userId.value, session.value.id, {
        activeElapsedMs: activeElapsedMs.value,
        notes: notes == null ? session.value.notes : notes,
      })
    } else {
      if (!window.confirm('Abandonner cette séance ? La progression déjà enregistrée est conservée.')) {
        startTick()
        return
      }
      await abandonSession(supabase, userId.value, session.value.id, {
        activeElapsedMs: activeElapsedMs.value,
      })
    }
    await router.push({ path: '/sport', query: { tab: 'history' } })
  } catch (err) {
    error.value = err?.message || 'Fin de séance impossible.'
    startTick()
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void load()
})

onUnmounted(() => {
  stopTick()
  clearInterval(restTimer)
  clearTimeout(persistTimer)
  void persistProgress()
})
</script>

<template>
  <div class="swv">
    <header class="swv__header">
      <p class="swv__eyebrow">
        <RouterLink to="/sport" class="swv__back">← Sport</RouterLink>
      </p>
      <h1 class="swv__title">{{ session?.name || 'Entraînement' }}</h1>
      <p class="swv__timer">{{ formatDuration(displayElapsed) }}</p>
    </header>

    <p v-if="error" class="swv__error" role="alert">{{ error }}</p>
    <p v-else-if="loading" class="swv__muted">Chargement de la séance…</p>

    <template v-else-if="session && currentExercise">
      <div class="swv__progress">
        Exercice {{ (session.current_exercise_index || 0) + 1 }} /
        {{ session.exercises.length }}
        · séries {{ currentSets.length }}/{{ currentExercise.target_sets }}
      </div>

      <article class="swv-card">
        <img
          v-if="snap.image_url"
          :src="snap.image_url"
          :alt="snapshotDisplayName(snap)"
          class="swv-card__img"
        />
        <h2 class="swv-card__name">{{ snapshotDisplayName(snap) }}</h2>
        <p class="swv__muted">
          Cible {{ currentExercise.target_sets }}×{{ currentExercise.target_reps ?? '?' }}
          <template v-if="currentExercise.target_weight != null">
            · {{ currentExercise.target_weight }}{{ currentExercise.weight_unit }}
          </template>
          · repos {{ currentExercise.rest_seconds }}s
        </p>
        <p v-if="snap.description" class="swv-card__desc">{{ snap.description }}</p>

        <div v-if="lastPerf?.sets?.length" class="swv-last">
          <p class="swv-last__title">Dernière fois</p>
          <p class="swv__muted">
            <template v-for="(s, i) in lastPerf.sets.slice(0, 4)" :key="s.id">
              {{ i ? ' · ' : '' }}{{ s.reps ?? '?' }}×{{ s.weight ?? '?' }}{{ s.weight_unit }}
            </template>
          </p>
        </div>
      </article>

      <div v-if="restRemaining > 0" class="swv-rest" aria-live="polite">
        Repos · {{ restRemaining }}s
        <button type="button" class="swv-btn" @click="restRemaining = 0">Passer</button>
      </div>

      <form v-if="!isFinished" class="swv-form" @submit.prevent="validateSet">
        <label>
          Reps
          <input v-model.number="reps" type="number" min="0" class="swv-input" />
        </label>
        <label>
          Charge
          <input v-model.number="weight" type="number" min="0" step="0.5" class="swv-input" />
        </label>
        <label>
          Difficulté (1-5)
          <input v-model.number="difficulty" type="number" min="1" max="5" class="swv-input" />
        </label>
        <label class="swv-form__notes">
          Note
          <input v-model="setNotes" type="text" class="swv-input" />
        </label>
        <button type="submit" class="swv-btn swv-btn--primary" :disabled="saving || isPaused">
          Valider la série
        </button>
      </form>

      <ul v-if="currentSets.length" class="swv-sets">
        <li v-for="s in currentSets" :key="s.id">
          S{{ s.set_number }} · {{ s.reps ?? '—' }} reps
          <template v-if="s.weight != null"> · {{ s.weight }}{{ s.weight_unit }}</template>
        </li>
      </ul>
      <button
        v-if="currentSets.length && !isFinished"
        type="button"
        class="swv-btn"
        @click="removeLastSet"
      >
        Supprimer dernière série
      </button>

      <div class="swv__nav">
        <button type="button" class="swv-btn" :disabled="!session.current_exercise_index" @click="goExercise(-1)">
          ← Précédent
        </button>
        <button
          type="button"
          class="swv-btn"
          :disabled="session.current_exercise_index >= session.exercises.length - 1"
          @click="goExercise(1)"
        >
          Suivant →
        </button>
      </div>

      <div class="swv__footer">
        <button
          v-if="!isPaused && !isFinished"
          type="button"
          class="swv-btn"
          :disabled="saving"
          @click="onPause"
        >
          Pause
        </button>
        <button
          v-else-if="isPaused"
          type="button"
          class="swv-btn swv-btn--primary"
          :disabled="saving"
          @click="onResume"
        >
          Reprendre
        </button>
        <button type="button" class="swv-btn swv-btn--primary" :disabled="saving || isFinished" @click="finish('complete')">
          Terminer
        </button>
        <button type="button" class="swv-btn swv-btn--danger" :disabled="saving || isFinished" @click="finish('abandon')">
          Abandonner
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.swv {
  flex: 1;
  width: 100%;
  padding: 1.25rem 1.1rem 3rem;
  box-sizing: border-box;
}
.swv__header {
  text-align: center;
  margin-bottom: 1rem;
}
.swv__eyebrow {
  margin: 0 0 0.35rem;
  text-align: left;
}
.swv__back {
  color: #8e6aa8;
  text-decoration: none;
  font-weight: 650;
  font-size: 0.88rem;
}
.swv__title {
  margin: 0;
  font-size: 1.55rem;
  font-weight: 800;
  color: #2c3e50;
}
.swv__timer {
  margin: 0.35rem 0 0;
  font-size: 1.25rem;
  font-weight: 800;
  color: #5e4a6c;
  font-variant-numeric: tabular-nums;
}
.swv__progress {
  font-weight: 750;
  color: #6d5a7e;
  margin-bottom: 0.75rem;
  text-align: center;
}
.swv-card {
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 16px;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.55);
  margin-bottom: 0.85rem;
}
.swv-card__img {
  width: 100%;
  max-height: 200px;
  object-fit: contain;
  border-radius: 12px;
  margin-bottom: 0.65rem;
  background: rgba(173, 129, 190, 0.08);
}
.swv-card__name {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 800;
}
.swv-card__desc {
  margin: 0.5rem 0 0;
  font-size: 0.9rem;
  line-height: 1.45;
  color: #5a4a66;
}
.swv-last {
  margin-top: 0.75rem;
  padding-top: 0.65rem;
  border-top: 1px solid rgba(213, 181, 234, 0.3);
}
.swv-last__title {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
  color: #7a6a88;
}
.swv-rest {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: 12px;
  background: rgba(143, 162, 212, 0.22);
  font-weight: 800;
  margin-bottom: 0.75rem;
}
.swv-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
  margin-bottom: 0.75rem;
}
.swv-form label {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: #6d5a7e;
}
.swv-form__notes {
  grid-column: 1 / -1;
}
.swv-form .swv-btn {
  grid-column: 1 / -1;
}
.swv-input {
  border: 1px solid rgba(213, 181, 234, 0.4);
  border-radius: 10px;
  padding: 0.65rem 0.7rem;
  font: inherit;
  font-size: 1.05rem;
  font-weight: 700;
}
.swv-sets {
  list-style: none;
  margin: 0 0 0.65rem;
  padding: 0;
  display: grid;
  gap: 0.25rem;
  font-weight: 650;
}
.swv__nav,
.swv__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.75rem;
}
.swv-btn {
  border: 1px solid rgba(213, 181, 234, 0.45);
  background: rgba(255, 255, 255, 0.75);
  border-radius: 12px;
  padding: 0.7rem 0.9rem;
  font: inherit;
  font-weight: 750;
  cursor: pointer;
  min-height: 2.75rem;
}
.swv-btn--primary {
  background: rgba(173, 129, 190, 0.32);
  border-color: rgba(173, 129, 190, 0.55);
}
.swv-btn--danger {
  color: #c0392b;
}
.swv__muted {
  color: #6d5a7e;
  font-size: 0.9rem;
}
.swv__error {
  margin: 0 0 0.75rem;
  padding: 0.65rem 0.8rem;
  border-radius: 10px;
  background: rgba(192, 57, 43, 0.1);
  color: #c0392b;
  font-weight: 650;
}
@media (prefers-color-scheme: dark) {
  .swv__title,
  .swv-card__name {
    color: #f0e8f8;
  }
  .swv-card,
  .swv-input,
  .swv-btn {
    background: #2a2438;
    color: #f0e8f8;
  }
}
</style>
