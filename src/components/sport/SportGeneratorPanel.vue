<script setup>
import { computed, ref } from 'vue'
import { WGER_EQUIPMENT } from '../../constants/sport/wger.js'
import { collectWgerExercisesForGenerator } from '../../services/sport/wgerApi.js'
import {
  estimateWorkoutDurationMin,
  exerciseMatchesEquipment,
  generateWorkoutSelection,
  pickReplacementExercise,
  toExerciseSnapshot,
} from '../../utils/sport/wgerExercise.js'

defineOptions({ name: 'SportGeneratorPanel' })

const props = defineProps({
  profile: { type: Object, default: null },
  muscles: { type: Array, default: () => [] },
  favoriteWgerIds: { type: Array, default: () => [] },
})

const emit = defineEmits(['save-template', 'start'])

const selectedMuscles = ref([])
const place = ref('gym') // gym | home | none
const durationMin = ref(45)
const exerciseCount = ref(6)
const preferFavorites = ref(true)
const loading = ref(false)
const replacingIndex = ref(/** @type {number|null} */ (null))
const error = ref('')
const warning = ref('')
const proposal = ref([])
const proposalName = ref('Séance générée')
/** Pool filtré de la dernière génération (pour remplacements). */
const candidatePool = ref([])
/** Exercices écartés via « Remplacer » (évite de les reproposer tout de suite). */
const rejectedIds = ref(/** @type {number[]} */ ([]))

const allowedEquipment = computed(() => {
  if (place.value === 'none') return [WGER_EQUIPMENT.NONE]
  if (!props.profile) return null
  if (place.value === 'home') {
    const ids = [...(props.profile.home_equipment_ids || [])]
    if (!ids.includes(WGER_EQUIPMENT.NONE)) ids.push(WGER_EQUIPMENT.NONE)
    return ids
  }
  const ids = [...(props.profile.gym_equipment_ids || [])]
  if (!ids.includes(WGER_EQUIPMENT.NONE)) ids.push(WGER_EQUIPMENT.NONE)
  return ids.length ? ids : null
})

function toggleMuscle(id) {
  const n = Number(id)
  const arr = [...selectedMuscles.value]
  const i = arr.indexOf(n)
  if (i >= 0) arr.splice(i, 1)
  else arr.push(n)
  selectedMuscles.value = arr
}

function toProposalItem(ex, previous = null) {
  return {
    ...ex,
    target_sets: previous?.target_sets ?? 3,
    target_reps: previous?.target_reps ?? 10,
    rest_seconds: previous?.rest_seconds ?? 90,
    target_weight: previous?.target_weight ?? null,
    weight_unit: previous?.weight_unit || props.profile?.weight_unit || 'kg',
    snapshot: toExerciseSnapshot(ex),
  }
}

function filterCandidates(collected) {
  let candidates = collected
  const allowed = allowedEquipment.value
  if (allowed) {
    candidates = candidates.filter((ex) => exerciseMatchesEquipment(ex, allowed))
  }
  if (selectedMuscles.value.length) {
    const want = new Set(selectedMuscles.value.map(Number))
    candidates = candidates.filter(
      (ex) =>
        (ex.muscleIds || []).some((m) => want.has(Number(m))) ||
        (ex.secondaryMuscleIds || []).some((m) => want.has(Number(m))),
    )
  }
  return candidates
}

async function generate() {
  loading.value = true
  error.value = ''
  warning.value = ''
  rejectedIds.value = []
  try {
    const muscleFilter = selectedMuscles.value[0] || null
    const collected = await collectWgerExercisesForGenerator(
      { muscleId: muscleFilter, pageSize: 40 },
      { maxPages: 3 },
    )
    const candidates = filterCandidates(collected)
    candidatePool.value = candidates

    const result = generateWorkoutSelection(candidates, {
      muscleIds: selectedMuscles.value,
      count: Number(exerciseCount.value) || 6,
      favoriteWgerIds: props.favoriteWgerIds || [],
      preferFavorites: preferFavorites.value,
    })

    proposal.value = result.exercises.map((ex) => toProposalItem(ex))

    if (!proposal.value.length) {
      error.value =
        'Aucun exercice compatible. Élargis les muscles, le lieu, ou renseigne ton matériel dans le profil.'
    } else if (result.incomplete || result.totalCandidates < exerciseCount.value) {
      warning.value =
        'Tous les critères n’ont pas pu être satisfaits avec les données Wger disponibles. Voici la meilleure sélection.'
    }

    const est = estimateWorkoutDurationMin(proposal.value)
    if (durationMin.value && Math.abs(est - durationMin.value) > 15) {
      warning.value = [
        warning.value,
        `Durée estimée ~${est} min (cible ${durationMin.value} min) — ajuste le nombre d’exercices ou les repos.`,
      ]
        .filter(Boolean)
        .join(' ')
    }
  } catch (err) {
    error.value = err?.message || 'Génération impossible (Wger ?).'
    proposal.value = []
    candidatePool.value = []
  } finally {
    loading.value = false
  }
}

function removeAt(index) {
  const removed = proposal.value[index]
  if (removed?.id) {
    rejectedIds.value = [...rejectedIds.value, Number(removed.id)]
  }
  proposal.value = proposal.value.filter((_, i) => i !== index)
}

function replaceAt(index) {
  const current = proposal.value[index]
  if (!current) return
  warning.value = ''
  replacingIndex.value = index

  const others = proposal.value.filter((_, i) => i !== index)
  const replacement = pickReplacementExercise(candidatePool.value, {
    replaceExercise: current,
    currentExercises: others,
    excludeIds: [...rejectedIds.value, Number(current.id)],
    muscleIds: selectedMuscles.value,
    favoriteWgerIds: props.favoriteWgerIds || [],
    preferFavorites: preferFavorites.value,
  })

  if (!replacement) {
    warning.value =
      'Pas d’autre exercice compatible dans le catalogue chargé. Élargis les critères ou relance une génération.'
    replacingIndex.value = null
    return
  }

  rejectedIds.value = [...rejectedIds.value, Number(current.id)]
  const next = [...proposal.value]
  next[index] = toProposalItem(replacement, current)
  proposal.value = next
  replacingIndex.value = null
}

function move(index, dir) {
  const next = index + dir
  if (next < 0 || next >= proposal.value.length) return
  const arr = [...proposal.value]
  const tmp = arr[index]
  arr[index] = arr[next]
  arr[next] = tmp
  proposal.value = arr
}

function asTemplatePayload() {
  return {
    name: proposalName.value.trim() || 'Séance générée',
    description: 'Générée localement à partir du catalogue Wger (non médical).',
    muscle_focus: selectedMuscles.value,
    exercises: proposal.value.map((ex, i) => ({
      sort_order: i,
      target_sets: ex.target_sets,
      target_reps: ex.target_reps,
      target_weight: ex.target_weight,
      weight_unit: ex.weight_unit,
      rest_seconds: ex.rest_seconds,
      snapshot: ex.snapshot || toExerciseSnapshot(ex),
    })),
  }
}
</script>

<template>
  <section class="sgp" aria-label="Générateur de séances">
    <p class="sgp__disclaimer">
      Proposition déterministe basée sur le catalogue public Wger — pas un programme médicalement
      validé. Les muscles / équipements dépendent de la qualité des données Wger.
    </p>

    <div class="sgp__controls">
      <fieldset class="sgp-set">
        <legend>Muscles</legend>
        <div class="sgp-chips">
          <button
            v-for="m in muscles"
            :key="m.id"
            type="button"
            class="sgp-chip"
            :class="{ 'sgp-chip--on': selectedMuscles.includes(m.id) }"
            @click="toggleMuscle(m.id)"
          >
            {{ m.name }}
          </button>
        </div>
      </fieldset>

      <div class="sgp__row">
        <label class="sgp-field">
          Lieu
          <select v-model="place" class="sgp-input">
            <option value="gym">Salle (matériel profil)</option>
            <option value="home">Maison (matériel profil)</option>
            <option value="none">Sans matériel</option>
          </select>
        </label>
        <label class="sgp-field">
          Durée cible (min)
          <input v-model.number="durationMin" type="number" min="10" max="180" class="sgp-input" />
        </label>
        <label class="sgp-field">
          Nb exercices
          <input v-model.number="exerciseCount" type="number" min="2" max="15" class="sgp-input" />
        </label>
      </div>

      <label class="sgp-check">
        <input v-model="preferFavorites" type="checkbox" />
        Prioriser mes favoris
      </label>

      <button type="button" class="sgp-btn sgp-btn--primary" :disabled="loading" @click="generate">
        {{ loading ? 'Génération…' : 'Proposer une séance' }}
      </button>
    </div>

    <p v-if="error" class="sgp__error" role="alert">{{ error }}</p>
    <p v-if="warning" class="sgp__warn">{{ warning }}</p>

    <div v-if="proposal.length" class="sgp__result">
      <label class="sgp-field">
        Nom de la séance
        <input v-model="proposalName" class="sgp-input" />
      </label>
      <ul class="sgp__list">
        <li v-for="(ex, index) in proposal" :key="`${ex.id}-${index}`" class="sgp-item">
          <div class="sgp-item__media" aria-hidden="true">
            <img
              v-if="ex.imageUrl || ex.snapshot?.image_url"
              :src="ex.imageUrl || ex.snapshot?.image_url"
              alt=""
              class="sgp-item__img"
              loading="lazy"
            />
            <div v-else class="sgp-item__placeholder">{{ (ex.name || '?').slice(0, 1) }}</div>
          </div>
          <div class="sgp-item__body">
            <div class="sgp-item__main">
              <strong>{{ ex.name }}</strong>
              <span class="sgp__muted">{{ ex.categoryName || '' }}</span>
            </div>
            <div class="sgp-item__targets">
              <label>
                Séries
                <input v-model.number="ex.target_sets" type="number" min="1" max="20" class="sgp-input sgp-input--sm" />
              </label>
              <label>
                Reps
                <input v-model.number="ex.target_reps" type="number" min="1" max="100" class="sgp-input sgp-input--sm" />
              </label>
              <label>
                Repos (s)
                <input v-model.number="ex.rest_seconds" type="number" min="0" max="600" class="sgp-input sgp-input--sm" />
              </label>
            </div>
            <div class="sgp-item__actions">
              <button type="button" class="sgp-btn" :disabled="index === 0" @click="move(index, -1)">↑</button>
              <button type="button" class="sgp-btn" :disabled="index === proposal.length - 1" @click="move(index, 1)">↓</button>
              <button
                type="button"
                class="sgp-btn"
                :disabled="loading || replacingIndex === index || !candidatePool.length"
                title="Proposer un autre exercice compatible"
                @click="replaceAt(index)"
              >
                {{ replacingIndex === index ? '…' : 'Remplacer' }}
              </button>
              <button type="button" class="sgp-btn" @click="removeAt(index)">Retirer</button>
            </div>
          </div>
        </li>
      </ul>
      <div class="sgp__actions">
        <button type="button" class="sgp-btn sgp-btn--primary" @click="emit('save-template', asTemplatePayload())">
          Enregistrer comme modèle
        </button>
        <button type="button" class="sgp-btn sgp-btn--primary" @click="emit('start', asTemplatePayload())">
          Démarrer
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sgp__disclaimer,
.sgp__muted {
  margin: 0 0 0.85rem;
  color: #6d5a7e;
  font-size: 0.88rem;
  line-height: 1.45;
}
.sgp-set {
  border: 1px solid rgba(213, 181, 234, 0.3);
  border-radius: 12px;
  padding: 0.7rem;
  margin: 0 0 0.75rem;
}
.sgp-set legend {
  font-weight: 800;
  font-size: 0.85rem;
  padding: 0 0.3rem;
}
.sgp-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.sgp-chip {
  border: 1px solid rgba(213, 181, 234, 0.4);
  background: rgba(255, 255, 255, 0.65);
  border-radius: 999px;
  padding: 0.28rem 0.6rem;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 650;
  cursor: pointer;
}
.sgp-chip--on {
  background: rgba(173, 129, 190, 0.28);
}
.sgp__row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.55rem;
}
.sgp-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: #6d5a7e;
  margin-bottom: 0.55rem;
}
.sgp-input {
  border: 1px solid rgba(213, 181, 234, 0.4);
  border-radius: 10px;
  padding: 0.45rem 0.6rem;
  font: inherit;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.85);
}
.sgp-input--sm {
  width: 4.5rem;
}
.sgp-check {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  margin-bottom: 0.75rem;
  font-weight: 650;
  font-size: 0.88rem;
}
.sgp-btn {
  border: 1px solid rgba(213, 181, 234, 0.45);
  background: rgba(255, 255, 255, 0.7);
  border-radius: 10px;
  padding: 0.45rem 0.75rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.sgp-btn--primary {
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  border-color: transparent;
  color: #fff;
}
.sgp__error {
  color: #c0392b;
  font-weight: 650;
}
.sgp__warn {
  color: #8a6d3b;
  font-weight: 650;
  margin: 0.5rem 0;
}
.sgp__list {
  list-style: none;
  margin: 0.75rem 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}
.sgp-item {
  border: 1px solid rgba(213, 181, 234, 0.3);
  border-radius: 12px;
  padding: 0.7rem;
  background: rgba(255, 255, 255, 0.5);
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 0.65rem;
  align-items: start;
}
.sgp-item__media {
  width: 64px;
  height: 64px;
  border-radius: 10px;
  overflow: hidden;
  background: rgba(173, 129, 190, 0.12);
  flex-shrink: 0;
}
.sgp-item__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.sgp-item__placeholder {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  font-size: 1.25rem;
  font-weight: 800;
  color: #8e6aa8;
}
.sgp-item__body {
  display: grid;
  gap: 0.45rem;
  min-width: 0;
}
.sgp-item__main {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.sgp-item__targets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.sgp-item__targets label {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-size: 0.72rem;
  font-weight: 700;
  color: #6d5a7e;
}
.sgp-item__actions,
.sgp__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
@media (max-width: 640px) {
  .sgp__row {
    grid-template-columns: 1fr;
  }
  .sgp-item {
    grid-template-columns: 52px minmax(0, 1fr);
    gap: 0.55rem;
  }
  .sgp-item__media {
    width: 52px;
    height: 52px;
  }
  .sgp-chip {
    min-height: 2.35rem;
  }
  .sgp-btn {
    min-height: 2.5rem;
  }
  .sgp__actions {
    flex-direction: column;
  }
  .sgp__actions .sgp-btn {
    width: 100%;
  }
}
@media (prefers-color-scheme: dark) {
  .sgp__disclaimer,
  .sgp__muted,
  .sgp-field,
  .sgp-item__targets label {
    color: #c9b8d8;
  }
  .sgp-set {
    border-color: rgba(213, 181, 234, 0.22);
  }
  .sgp-set legend {
    color: #f0e8f8;
  }
  .sgp-input,
  .sgp-chip,
  .sgp-item {
    background: #2a2438;
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.25);
  }
  .sgp-btn:not(.sgp-btn--primary) {
    background: #2a2438;
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.25);
  }
  .sgp-chip--on {
    background: rgba(173, 129, 190, 0.35);
  }
}
</style>
