<script setup>
import { computed, toRef } from 'vue'
import {
  getPilulePeriodContext,
  getPiluleSymptomPersistencePeriod,
  getSymptomsForPeriod,
  getOrderedPilulePeriods,
  getAllPiluleSymptomDefs,
  PILULE_SYMPTOM_PERIOD_ACCORDION,
} from '../services/menstruationSymptomsPilule.js'
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

const periodContext = computed(() => getPilulePeriodContext(props.cycles))
const currentPeriod = computed(() => periodContext.value.period)

const symptomDefs = computed(() => getAllPiluleSymptomDefs())

const persistenceContext = computed(() => {
  const period = getPiluleSymptomPersistencePeriod(currentPeriod.value)
  return {
    ...periodContext.value,
    period,
    phase: period,
  }
})

const sections = computed(() => {
  const current = currentPeriod.value
  return getOrderedPilulePeriods(current).map((periodKey) => {
    const meta = PILULE_SYMPTOM_PERIOD_ACCORDION[periodKey] ?? { label: periodKey, emoji: '' }
    return {
      id: periodKey,
      label: meta.label,
      emoji: meta.emoji,
      isCurrent: periodKey === current,
      defs: getSymptomsForPeriod(periodKey),
    }
  })
})

const formattedDate = computed(() => {
  const iso = periodContext.value.iso
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
})

const canSave = computed(() => Boolean(props.userId && periodContext.value.cycle?.id))

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
} = useMenstruationSymptomPersistence({
  userId: toRef(props, 'userId'),
  typeCycle: TYPE_CYCLE.PILULE,
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

function onSelectBoolean({ key, value }) {
  selectBoolean(key, value)
}
</script>

<template>
  <section class="pilule-symptoms" aria-labelledby="pilule-symptoms-title">
    <header class="pilule-symptoms__head">
      <h3 id="pilule-symptoms-title" class="pilule-symptoms__title">Symptômes du jour</h3>
      <p class="pilule-symptoms__hint">
        Saisie du {{ formattedDate }} — une seule fiche modifiable par jour. Ouvre chaque période
        pour renseigner ses symptômes (utile pour repérer tes patterns).
      </p>
      <p
        v-if="saveStatusText"
        class="pilule-symptoms__status"
        :class="{ 'pilule-symptoms__status--error': saveError }"
        role="status"
      >
        {{ saveStatusText }}
      </p>
    </header>

    <div v-if="showLoadingOverlay" class="pilule-symptoms__loading">Chargement des symptômes…</div>

    <MenstruationSymptomSections
      v-else
      :sections="sections"
      :values="values"
      :can-save="canSave"
      @select-scale="onSelectScale"
      @select-enum="onSelectEnum"
      @select-boolean="onSelectBoolean"
    />
  </section>
</template>

<style scoped>
.pilule-symptoms {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(213, 181, 234, 0.35);
}

.pilule-symptoms__head {
  margin-bottom: 1.25rem;
}

.pilule-symptoms__title {
  margin: 0 0 0.35rem;
  font-size: 1.1rem;
  font-weight: 800;
  color: #ad81be;
}

.pilule-symptoms__hint {
  margin: 0;
  font-size: 0.85rem;
  color: #6c757d;
  line-height: 1.45;
}

.pilule-symptoms__status {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: #6c9a7b;
}

.pilule-symptoms__status--error {
  color: #c0392b;
}

.pilule-symptoms__loading {
  font-size: 0.9rem;
  color: #8c98a4;
  font-weight: 600;
}

@media (prefers-color-scheme: dark) {
  .pilule-symptoms {
    border-top-color: rgba(213, 181, 234, 0.2);
  }

  .pilule-symptoms__hint {
    color: #adb5bd;
  }
}
</style>
