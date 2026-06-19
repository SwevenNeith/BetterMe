<script setup>
import { computed, toRef } from 'vue'
import {
  getNaturelPhaseContext,
  getSymptomsForPhase,
  getOrderedNaturelPhases,
  getAllNaturelSymptomDefs,
  NATUREL_PHASE_LABELS,
  NATUREL_PHASE_EMOJI,
} from '../services/menstruationSymptomsNaturel.js'
import { TYPE_CYCLE } from '../services/menstruationSymptoms.js'
import { useMenstruationSymptomPersistence } from '../composables/useMenstruationSymptomPersistence.js'
import MenstruationSymptomSections from './MenstruationSymptomSections.vue'

const props = defineProps({
  cycles: {
    type: Array,
    default: () => [],
  },
  userId: {
    type: String,
    default: null,
  },
})

const phaseContext = computed(() => getNaturelPhaseContext(props.cycles))
const currentPhase = computed(() => phaseContext.value.phase)

const symptomDefs = computed(() => getAllNaturelSymptomDefs())

const persistenceContext = computed(() => ({
  ...phaseContext.value,
  phase: currentPhase.value ?? phaseContext.value.phase ?? 'menstruelle',
}))

const sections = computed(() => {
  const current = currentPhase.value
  return getOrderedNaturelPhases(current).map((phaseKey) => ({
    id: phaseKey,
    label: NATUREL_PHASE_LABELS[phaseKey] ?? phaseKey,
    emoji: NATUREL_PHASE_EMOJI[phaseKey] ?? '',
    isCurrent: phaseKey === current,
    defs: getSymptomsForPhase(phaseKey),
  }))
})

const formattedDate = computed(() => {
  const iso = phaseContext.value.iso
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
})

const canSave = computed(() => Boolean(props.userId && phaseContext.value.cycle?.id))

const {
  values,
  savedToday,
  isLoading,
  isSaving,
  saveError,
  lastSavedAt,
  selectScale,
  selectEnum,
  selectBoolean,
  selectSide,
} = useMenstruationSymptomPersistence({
  userId: toRef(props, 'userId'),
  typeCycle: TYPE_CYCLE.NATUREL,
  context: persistenceContext,
  symptomDefs,
})

const hasValues = computed(() =>
  Object.values(values.value).some((v) => v != null && v !== ''),
)

const showLoadingOverlay = computed(() => isLoading.value && !savedToday.value && !hasValues.value)

const saveStatusText = computed(() => {
  if (!props.userId) return ''
  if (showLoadingOverlay.value) return 'Chargement…'
  if (isSaving.value) return 'Enregistrement…'
  if (saveError.value) return saveError.value
  if (lastSavedAt.value || savedToday.value) return 'Enregistré'
  return ''
})

function onSelectScale({ key, value }) {
  selectScale(key, value)
}

function onSelectEnum({ key, value }) {
  selectEnum(key, value)
}

function onSelectBoolean({ key, value, clearSideKey }) {
  selectBoolean(key, value, { clearSideKey })
}

function onSelectSide({ key, value }) {
  selectSide(key, value)
}
</script>

<template>
  <section
    v-if="phaseContext.cycle"
    class="nat-symptoms"
    aria-labelledby="nat-symptoms-title"
  >
    <header class="nat-symptoms__head">
      <h3 id="nat-symptoms-title" class="nat-symptoms__title">Symptômes du jour</h3>
      <p class="nat-symptoms__hint">
        Saisie du {{ formattedDate }} — une seule fiche modifiable par jour. Ouvre chaque phase
        pour renseigner ses symptômes (utile pour repérer tes patterns).
      </p>
      <p
        v-if="saveStatusText"
        class="nat-symptoms__status"
        :class="{ 'nat-symptoms__status--error': saveError }"
        role="status"
      >
        {{ saveStatusText }}
      </p>
    </header>

    <div v-if="showLoadingOverlay" class="nat-symptoms__loading">Chargement des symptômes…</div>

    <MenstruationSymptomSections
      v-else
      :sections="sections"
      :values="values"
      :can-save="canSave"
      @select-scale="onSelectScale"
      @select-enum="onSelectEnum"
      @select-boolean="onSelectBoolean"
      @select-side="onSelectSide"
    />
  </section>

  <p v-else class="nat-symptoms__empty">
    Impossible de déterminer le cycle du jour pour afficher les symptômes.
  </p>
</template>

<style scoped>
.nat-symptoms {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(213, 181, 234, 0.35);
}

.nat-symptoms__head {
  margin-bottom: 1.25rem;
}

.nat-symptoms__title {
  margin: 0 0 0.35rem;
  font-size: 1.1rem;
  font-weight: 800;
  color: #ad81be;
}

.nat-symptoms__hint,
.nat-symptoms__empty {
  margin: 0;
  font-size: 0.85rem;
  color: #6c757d;
  line-height: 1.45;
}

.nat-symptoms__status {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: #6c9a7b;
}

.nat-symptoms__status--error {
  color: #c0392b;
}

.nat-symptoms__loading {
  font-size: 0.9rem;
  color: #8c98a4;
  font-weight: 600;
}

.nat-symptoms__empty {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(213, 181, 234, 0.35);
}

@media (prefers-color-scheme: dark) {
  .nat-symptoms {
    border-top-color: rgba(213, 181, 234, 0.2);
  }

  .nat-symptoms__hint,
  .nat-symptoms__empty {
    color: #adb5bd;
  }
}
</style>
