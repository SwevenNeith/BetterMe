<script setup>
import { computed, toRef } from 'vue'
import {
  getPilulePeriodContext,
  PILULE_SYMPTOM_PERIOD,
  PILULE_SYMPTOM_PERIOD_LABELS,
  createEmptySymptomValues,
  getCombinedActiveAndSpmSymptoms,
  PILULE_SYMPTOMS_BY_PERIOD,
} from '../services/menstruationSymptomsPilule.js'
import { TYPE_CYCLE } from '../services/menstruationSymptoms.js'
import { useMenstruationSymptomPersistence } from '../composables/useMenstruationSymptomPersistence.js'
import MenstruationSymptomEntriesNav from './MenstruationSymptomEntriesNav.vue'

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
const dayPeriodKey = computed(() => periodContext.value.period)
const isRulesDay = computed(() => dayPeriodKey.value === PILULE_SYMPTOM_PERIOD.RULES)

const cycleSymptomDefs = computed(() => getCombinedActiveAndSpmSymptoms())
const rulesSymptomDefs = computed(
  () => PILULE_SYMPTOMS_BY_PERIOD[PILULE_SYMPTOM_PERIOD.RULES] ?? [],
)

const cycleContext = computed(() => ({
  ...periodContext.value,
  period: PILULE_SYMPTOM_PERIOD.CYCLE,
}))

const rulesContext = computed(() => ({
  ...periodContext.value,
  period: PILULE_SYMPTOM_PERIOD.RULES,
}))

const cycleLabel = computed(() => PILULE_SYMPTOM_PERIOD_LABELS[PILULE_SYMPTOM_PERIOD.CYCLE] ?? '')
const rulesLabel = computed(() => PILULE_SYMPTOM_PERIOD_LABELS[PILULE_SYMPTOM_PERIOD.RULES] ?? '')

const cycleEmoji = computed(() => '💊')
const rulesEmoji = computed(() => '🔴')

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
  values: cycleValues,
  entries: cycleEntries,
  activeEntryId: cycleActiveEntryId,
  isLoading: cycleIsLoading,
  isSaving: cycleIsSaving,
  saveError: cycleSaveError,
  lastSavedAt: cycleLastSavedAt,
  selectEntry: cycleSelectEntry,
  startNewEntry: cycleStartNewEntry,
  entryLabel: cycleEntryLabel,
  selectScale: cycleSelectScale,
  selectEnum: cycleSelectEnum,
  selectBoolean: cycleSelectBoolean,
} = useMenstruationSymptomPersistence({
  userId: toRef(props, 'userId'),
  typeCycle: TYPE_CYCLE.PILULE,
  context: cycleContext,
  symptomDefs: cycleSymptomDefs,
  createEmptyValues: createEmptySymptomValues,
})

const {
  values: rulesValues,
  entries: rulesEntries,
  activeEntryId: rulesActiveEntryId,
  isLoading: rulesIsLoading,
  isSaving: rulesIsSaving,
  saveError: rulesSaveError,
  lastSavedAt: rulesLastSavedAt,
  selectEntry: rulesSelectEntry,
  startNewEntry: rulesStartNewEntry,
  entryLabel: rulesEntryLabel,
  selectScale: rulesSelectScale,
  selectEnum: rulesSelectEnum,
  selectBoolean: rulesSelectBoolean,
} = useMenstruationSymptomPersistence({
  userId: toRef(props, 'userId'),
  typeCycle: TYPE_CYCLE.PILULE,
  context: rulesContext,
  symptomDefs: rulesSymptomDefs,
  createEmptyValues: createEmptySymptomValues,
})

const hasCycleInteractableData = computed(() => {
  if (cycleEntries.value.length > 0 || cycleActiveEntryId.value) return true
  return Object.values(cycleValues.value).some((v) => v != null && v !== '')
})

const hasRulesInteractableData = computed(() => {
  if (rulesEntries.value.length > 0 || rulesActiveEntryId.value) return true
  return Object.values(rulesValues.value).some((v) => v != null && v !== '')
})

const showCycleLoadingOverlay = computed(
  () => cycleIsLoading.value && !hasCycleInteractableData.value,
)
const showRulesLoadingOverlay = computed(
  () => rulesIsLoading.value && !hasRulesInteractableData.value,
)

const cycleSaveStatusText = computed(() => {
  if (!props.userId) return ''
  if (showCycleLoadingOverlay.value) return 'Chargement…'
  if (cycleIsSaving.value) return 'Enregistrement…'
  if (cycleSaveError.value) return cycleSaveError.value
  if (cycleLastSavedAt.value) return 'Enregistré'
  return ''
})

const rulesSaveStatusText = computed(() => {
  if (!props.userId) return ''
  if (showRulesLoadingOverlay.value) return 'Chargement…'
  if (rulesIsSaving.value) return 'Enregistrement…'
  if (rulesSaveError.value) return rulesSaveError.value
  if (rulesLastSavedAt.value) return 'Enregistré'
  return ''
})

function scaleRange(def) {
  const min = def.min ?? 0
  const max = def.max ?? 5
  const out = []
  for (let i = min; i <= max; i += 1) out.push(i)
  return out
}

function keyForSection(section, key) {
  return `${section}:${key}`
}
</script>

<template>
  <section class="pilule-symptoms" aria-labelledby="pilule-symptoms-title">
    <!-- Cycle (toujours affiché) -->
    <header class="pilule-symptoms__head">
      <h3 id="pilule-symptoms-title" class="pilule-symptoms__title">
        <span class="pilule-symptoms__emoji" aria-hidden="true">{{ cycleEmoji }}</span>
        {{ cycleLabel }}
      </h3>
      <p class="pilule-symptoms__hint">
        Symptômes du {{ formattedDate }}. Tu peux faire plusieurs saisies dans la journée
        (ex. matin et soir).
      </p>
      <p
        v-if="cycleSaveStatusText"
        class="pilule-symptoms__status"
        :class="{ 'pilule-symptoms__status--error': cycleSaveError }"
        role="status"
      >
        {{ cycleSaveStatusText }}
      </p>
    </header>

    <MenstruationSymptomEntriesNav
      v-if="!showCycleLoadingOverlay && canSave"
      :entries="cycleEntries"
      :active-entry-id="cycleActiveEntryId"
      :entry-label="cycleEntryLabel"
      @select="cycleSelectEntry"
      @new="cycleStartNewEntry"
    />

    <div v-if="showCycleLoadingOverlay" class="pilule-symptoms__loading">Chargement des symptômes…</div>

    <div v-else class="pilule-symptoms__list">
      <div v-for="def in cycleSymptomDefs" :key="keyForSection('cycle', def.key)" class="pilule-symptoms__row">
        <span class="pilule-symptoms__label">{{ def.label }}</span>

        <div v-if="def.type === 'scale'" class="pilule-symptoms__scale" role="group" :aria-label="def.label">
          <button
            v-for="n in scaleRange(def)"
            :key="n"
            type="button"
            class="pilule-symptoms__chip"
            :class="{ 'pilule-symptoms__chip--on': cycleValues[def.key] === n }"
            :aria-pressed="cycleValues[def.key] === n"
            :disabled="!canSave"
            @click="cycleSelectScale(def.key, n)"
          >
            {{ n }}
          </button>
        </div>

        <div v-else-if="def.type === 'boolean'" class="pilule-symptoms__bool" role="group" :aria-label="def.label">
          <button
            type="button"
            class="pilule-symptoms__chip pilule-symptoms__chip--wide"
            :class="{ 'pilule-symptoms__chip--on': cycleValues[def.key] === true }"
            :aria-pressed="cycleValues[def.key] === true"
            :disabled="!canSave"
            @click="cycleSelectBoolean(def.key, true)"
          >
            Oui
          </button>
          <button
            type="button"
            class="pilule-symptoms__chip pilule-symptoms__chip--wide"
            :class="{ 'pilule-symptoms__chip--on': cycleValues[def.key] === false }"
            :aria-pressed="cycleValues[def.key] === false"
            :disabled="!canSave"
            @click="cycleSelectBoolean(def.key, false)"
          >
            Non
          </button>
        </div>

        <div v-else-if="def.type === 'enum'" class="pilule-symptoms__enum" role="group" :aria-label="def.label">
          <button
            v-for="opt in def.options"
            :key="opt.value"
            type="button"
            class="pilule-symptoms__chip pilule-symptoms__chip--wide"
            :class="{ 'pilule-symptoms__chip--on': cycleValues[def.key] === opt.value }"
            :aria-pressed="cycleValues[def.key] === opt.value"
            :disabled="!canSave"
            @click="cycleSelectEnum(def.key, opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- Règles (affiché uniquement pendant la période de règles) -->
    <template v-if="isRulesDay">
      <header class="pilule-symptoms__head pilule-symptoms__head--secondary">
        <h3 class="pilule-symptoms__title">
          <span class="pilule-symptoms__emoji" aria-hidden="true">{{ rulesEmoji }}</span>
          {{ rulesLabel }}
        </h3>
        <p
          v-if="rulesSaveStatusText"
          class="pilule-symptoms__status"
          :class="{ 'pilule-symptoms__status--error': rulesSaveError }"
          role="status"
        >
          {{ rulesSaveStatusText }}
        </p>
      </header>

      <MenstruationSymptomEntriesNav
        v-if="!showRulesLoadingOverlay && canSave"
        :entries="rulesEntries"
        :active-entry-id="rulesActiveEntryId"
        :entry-label="rulesEntryLabel"
        @select="rulesSelectEntry"
        @new="rulesStartNewEntry"
      />

      <div v-if="showRulesLoadingOverlay" class="pilule-symptoms__loading">Chargement des symptômes…</div>

      <div v-else class="pilule-symptoms__list">
        <div v-for="def in rulesSymptomDefs" :key="keyForSection('rules', def.key)" class="pilule-symptoms__row">
          <span class="pilule-symptoms__label">{{ def.label }}</span>

          <div v-if="def.type === 'scale'" class="pilule-symptoms__scale" role="group" :aria-label="def.label">
            <button
              v-for="n in scaleRange(def)"
              :key="n"
              type="button"
              class="pilule-symptoms__chip"
              :class="{ 'pilule-symptoms__chip--on': rulesValues[def.key] === n }"
              :aria-pressed="rulesValues[def.key] === n"
              :disabled="!canSave"
              @click="rulesSelectScale(def.key, n)"
            >
              {{ n }}
            </button>
          </div>

          <div v-else-if="def.type === 'boolean'" class="pilule-symptoms__bool" role="group" :aria-label="def.label">
            <button
              type="button"
              class="pilule-symptoms__chip pilule-symptoms__chip--wide"
              :class="{ 'pilule-symptoms__chip--on': rulesValues[def.key] === true }"
              :aria-pressed="rulesValues[def.key] === true"
              :disabled="!canSave"
              @click="rulesSelectBoolean(def.key, true)"
            >
              Oui
            </button>
            <button
              type="button"
              class="pilule-symptoms__chip pilule-symptoms__chip--wide"
              :class="{ 'pilule-symptoms__chip--on': rulesValues[def.key] === false }"
              :aria-pressed="rulesValues[def.key] === false"
              :disabled="!canSave"
              @click="rulesSelectBoolean(def.key, false)"
            >
              Non
            </button>
          </div>

          <div v-else-if="def.type === 'enum'" class="pilule-symptoms__enum" role="group" :aria-label="def.label">
            <button
              v-for="opt in def.options"
              :key="opt.value"
              type="button"
              class="pilule-symptoms__chip pilule-symptoms__chip--wide"
              :class="{ 'pilule-symptoms__chip--on': rulesValues[def.key] === opt.value }"
              :aria-pressed="rulesValues[def.key] === opt.value"
              :disabled="!canSave"
              @click="rulesSelectEnum(def.key, opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
      </div>
    </template>
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

.pilule-symptoms__head--secondary {
  margin-top: 1.5rem;
}

.pilule-symptoms__title {
  margin: 0 0 0.35rem;
  font-size: 1.1rem;
  font-weight: 800;
  color: #ad81be;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.pilule-symptoms__emoji {
  font-size: 1.15rem;
  line-height: 1;
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

.pilule-symptoms__list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.pilule-symptoms__row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.pilule-symptoms__label {
  font-size: 0.9rem;
  font-weight: 700;
  color: #2c3e50;
}

.pilule-symptoms__scale,
.pilule-symptoms__bool,
.pilule-symptoms__enum {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.pilule-symptoms__chip {
  min-width: 2.25rem;
  padding: 0.45rem 0.65rem;
  border: 1px solid rgba(173, 129, 190, 0.45);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.85);
  color: #5a4a66;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}

.pilule-symptoms__chip:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.pilule-symptoms__chip--wide {
  min-width: auto;
  flex: 1 1 auto;
}

.pilule-symptoms__chip:hover:not(:disabled) {
  border-color: #ad81be;
  background: rgba(213, 181, 234, 0.2);
}

.pilule-symptoms__chip--on {
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  border-color: var(--color-primary-dark);
  color: #fff;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary-dark) 30%, transparent);
}

.pilule-symptoms__chip--on:hover:not(:disabled) {
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  border-color: var(--color-primary-dark);
  color: #fff;
}

@media (prefers-color-scheme: dark) {
  .pilule-symptoms {
    border-top-color: rgba(213, 181, 234, 0.2);
  }

  .pilule-symptoms__hint {
    color: #adb5bd;
  }

  .pilule-symptoms__label {
    color: #f0e8f8;
  }

  .pilule-symptoms__chip {
    background: rgba(40, 32, 52, 0.9);
    border-color: rgba(213, 181, 234, 0.25);
    color: #e8dff0;
  }

  .pilule-symptoms__chip:hover:not(:disabled) {
    background: rgba(173, 129, 190, 0.25);
  }

  .pilule-symptoms__chip--on,
  .pilule-symptoms__chip--on:hover:not(:disabled) {
    background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
    border-color: var(--color-primary-dark);
    color: #fff;
    box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary-dark) 45%, transparent);
  }
}

@media (min-width: 640px) {
  .pilule-symptoms__row {
    flex-direction: row;
    align-items: center;
    gap: 1rem;
  }

  .pilule-symptoms__label {
    flex: 0 0 11rem;
  }

  .pilule-symptoms__scale,
  .pilule-symptoms__bool,
  .pilule-symptoms__enum {
    flex: 1;
  }
}
</style>
