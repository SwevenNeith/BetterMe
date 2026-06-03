<script setup>
import { computed, toRef } from 'vue'
import {
  getPilulePeriodContext,
  getSymptomsForPeriod,
  createEmptySymptomValues,
  PILULE_SYMPTOM_PERIOD_LABELS,
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

const periodKey = computed(() => periodContext.value.period)

const periodLabel = computed(() => PILULE_SYMPTOM_PERIOD_LABELS[periodKey.value] ?? '')

const periodEmoji = computed(() => {
  if (periodKey.value === 'regles') return '🔴'
  if (periodKey.value === 'spm') return '⚠️'
  return '💊'
})

const symptomDefs = computed(() => getSymptomsForPeriod(periodKey.value))

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
  entries,
  activeEntryId,
  isLoading,
  isSaving,
  saveError,
  lastSavedAt,
  selectEntry,
  startNewEntry,
  entryLabel,
  selectScale,
  selectEnum,
  selectBoolean,
} = useMenstruationSymptomPersistence({
  userId: toRef(props, 'userId'),
  typeCycle: TYPE_CYCLE.PILULE,
  context: periodContext,
  symptomDefs,
  createEmptyValues: createEmptySymptomValues,
})

const hasInteractableData = computed(() => {
  if (entries.value.length > 0 || activeEntryId.value) return true
  return Object.values(values.value).some((v) => v != null && v !== '')
})

const showLoadingOverlay = computed(() => isLoading.value && !hasInteractableData.value)

const saveStatusText = computed(() => {
  if (!props.userId) return ''
  if (showLoadingOverlay.value) return 'Chargement…'
  if (isSaving.value) return 'Enregistrement…'
  if (saveError.value) return saveError.value
  if (lastSavedAt.value) return 'Enregistré'
  return ''
})

function scaleRange(def) {
  const min = def.min ?? 0
  const max = def.max ?? 5
  const out = []
  for (let i = min; i <= max; i += 1) out.push(i)
  return out
}
</script>

<template>
  <section class="pilule-symptoms" aria-labelledby="pilule-symptoms-title">
    <header class="pilule-symptoms__head">
      <h3 id="pilule-symptoms-title" class="pilule-symptoms__title">
        <span class="pilule-symptoms__emoji" aria-hidden="true">{{ periodEmoji }}</span>
        {{ periodLabel }}
      </h3>
      <p class="pilule-symptoms__hint">
        Symptômes du {{ formattedDate }}. Tu peux faire plusieurs saisies dans la journée
        (ex. matin et soir).
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

    <MenstruationSymptomEntriesNav
      v-if="!showLoadingOverlay && canSave"
      :entries="entries"
      :active-entry-id="activeEntryId"
      :entry-label="entryLabel"
      @select="selectEntry"
      @new="startNewEntry"
    />

    <div v-if="showLoadingOverlay" class="pilule-symptoms__loading">Chargement des symptômes…</div>

    <div v-else class="pilule-symptoms__list">
      <div
        v-for="def in symptomDefs"
        :key="def.key"
        class="pilule-symptoms__row"
      >
        <span class="pilule-symptoms__label">{{ def.label }}</span>

        <div
          v-if="def.type === 'scale'"
          class="pilule-symptoms__scale"
          role="group"
          :aria-label="def.label"
        >
          <button
            v-for="n in scaleRange(def)"
            :key="n"
            type="button"
            class="pilule-symptoms__chip"
            :class="{ 'pilule-symptoms__chip--on': values[def.key] === n }"
            :aria-pressed="values[def.key] === n"
            :disabled="!canSave"
            @click="selectScale(def.key, n)"
          >
            {{ n }}
          </button>
        </div>

        <div
          v-else-if="def.type === 'boolean'"
          class="pilule-symptoms__bool"
          role="group"
          :aria-label="def.label"
        >
          <button
            type="button"
            class="pilule-symptoms__chip pilule-symptoms__chip--wide"
            :class="{ 'pilule-symptoms__chip--on': values[def.key] === true }"
            :aria-pressed="values[def.key] === true"
            :disabled="!canSave"
            @click="selectBoolean(def.key, true)"
          >
            Oui
          </button>
          <button
            type="button"
            class="pilule-symptoms__chip pilule-symptoms__chip--wide"
            :class="{ 'pilule-symptoms__chip--on': values[def.key] === false }"
            :aria-pressed="values[def.key] === false"
            :disabled="!canSave"
            @click="selectBoolean(def.key, false)"
          >
            Non
          </button>
        </div>

        <div
          v-else-if="def.type === 'enum'"
          class="pilule-symptoms__enum"
          role="group"
          :aria-label="def.label"
        >
          <button
            v-for="opt in def.options"
            :key="opt.value"
            type="button"
            class="pilule-symptoms__chip pilule-symptoms__chip--wide"
            :class="{ 'pilule-symptoms__chip--on': values[def.key] === opt.value }"
            :aria-pressed="values[def.key] === opt.value"
            :disabled="!canSave"
            @click="selectEnum(def.key, opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
    </div>
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
  background: #ad81be;
  border-color: #ad81be;
  color: #fff;
}

.pilule-symptoms__chip--on:hover:not(:disabled) {
  background: #9a6fad;
  border-color: #9a6fad;
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
