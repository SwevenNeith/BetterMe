<script setup>
import { computed, toRef } from 'vue'
import {
  getNaturelPhaseContext,
  getSymptomsForPhase,
  createEmptySymptomValues,
  NATUREL_PHASE_LABELS,
  NATUREL_PHASE_EMOJI,
} from '../services/menstruationSymptomsNaturel.js'
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

const phaseContext = computed(() => getNaturelPhaseContext(props.cycles))

const phaseKey = computed(() => phaseContext.value.phase)

const phaseLabel = computed(() => NATUREL_PHASE_LABELS[phaseKey.value] ?? '')

const phaseEmoji = computed(() => NATUREL_PHASE_EMOJI[phaseKey.value] ?? '')

const symptomDefs = computed(() => getSymptomsForPhase(phaseKey.value))

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
  selectSide,
} = useMenstruationSymptomPersistence({
  userId: toRef(props, 'userId'),
  typeCycle: TYPE_CYCLE.NATUREL,
  context: phaseContext,
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

async function onBoolean(def, v) {
  await selectBoolean(def.key, v, { clearSideKey: def.sideKey })
}
</script>

<template>
  <section
    v-if="phaseKey"
    class="nat-symptoms"
    aria-labelledby="nat-symptoms-title"
  >
    <header class="nat-symptoms__head">
      <h3 id="nat-symptoms-title" class="nat-symptoms__title">
        <span class="nat-symptoms__emoji" aria-hidden="true">{{ phaseEmoji }}</span>
        {{ phaseLabel }}
      </h3>
      <p class="nat-symptoms__hint">
        Symptômes du {{ formattedDate }}. Tu peux faire plusieurs saisies dans la journée
        (ex. matin et soir).
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

    <MenstruationSymptomEntriesNav
      v-if="!showLoadingOverlay && canSave"
      :entries="entries"
      :active-entry-id="activeEntryId"
      :entry-label="entryLabel"
      @select="selectEntry"
      @new="startNewEntry"
    />

    <div v-if="showLoadingOverlay" class="nat-symptoms__loading">Chargement des symptômes…</div>

    <div v-else class="nat-symptoms__list">
      <div
        v-for="def in symptomDefs"
        :key="def.key"
        class="nat-symptoms__row"
        :class="{ 'nat-symptoms__row--stacked': def.type === 'boolean_with_side' }"
      >
        <span class="nat-symptoms__label">{{ def.label }}</span>

        <div
          v-if="def.type === 'scale'"
          class="nat-symptoms__scale"
          role="group"
          :aria-label="def.label"
        >
          <button
            v-for="n in scaleRange(def)"
            :key="n"
            type="button"
            class="nat-symptoms__chip"
            :class="{ 'nat-symptoms__chip--on': values[def.key] === n }"
            :aria-pressed="values[def.key] === n"
            :disabled="!canSave"
            @click="selectScale(def.key, n)"
          >
            {{ n }}
          </button>
        </div>

        <div
          v-else-if="def.type === 'boolean'"
          class="nat-symptoms__bool"
          role="group"
          :aria-label="def.label"
        >
          <button
            type="button"
            class="nat-symptoms__chip nat-symptoms__chip--wide"
            :class="{ 'nat-symptoms__chip--on': values[def.key] === true }"
            :aria-pressed="values[def.key] === true"
            :disabled="!canSave"
            @click="selectBoolean(def.key, true)"
          >
            Oui
          </button>
          <button
            type="button"
            class="nat-symptoms__chip nat-symptoms__chip--wide"
            :class="{ 'nat-symptoms__chip--on': values[def.key] === false }"
            :aria-pressed="values[def.key] === false"
            :disabled="!canSave"
            @click="selectBoolean(def.key, false)"
          >
            Non
          </button>
        </div>

        <div v-else-if="def.type === 'boolean_with_side'" class="nat-symptoms__compound">
          <div class="nat-symptoms__bool" role="group" :aria-label="def.label">
            <button
              type="button"
              class="nat-symptoms__chip nat-symptoms__chip--wide"
              :class="{ 'nat-symptoms__chip--on': values[def.key] === true }"
              :aria-pressed="values[def.key] === true"
              :disabled="!canSave"
              @click="onBoolean(def, true)"
            >
              Oui
            </button>
            <button
              type="button"
              class="nat-symptoms__chip nat-symptoms__chip--wide"
              :class="{ 'nat-symptoms__chip--on': values[def.key] === false }"
              :aria-pressed="values[def.key] === false"
              :disabled="!canSave"
              @click="onBoolean(def, false)"
            >
              Non
            </button>
          </div>
          <div
            v-if="values[def.key] === true"
            class="nat-symptoms__side"
            role="group"
            aria-label="Côté de la douleur"
          >
            <span class="nat-symptoms__side-label">Côté</span>
            <div class="nat-symptoms__enum">
              <button
                v-for="opt in def.sideOptions"
                :key="opt.value"
                type="button"
                class="nat-symptoms__chip nat-symptoms__chip--wide"
                :class="{ 'nat-symptoms__chip--on': values[def.sideKey] === opt.value }"
                :aria-pressed="values[def.sideKey] === opt.value"
                :disabled="!canSave"
                @click="selectSide(def.sideKey, opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
        </div>

        <div
          v-else-if="def.type === 'enum'"
          class="nat-symptoms__enum"
          role="group"
          :aria-label="def.label"
        >
          <button
            v-for="opt in def.options"
            :key="String(opt.value)"
            type="button"
            class="nat-symptoms__chip nat-symptoms__chip--wide"
            :class="{ 'nat-symptoms__chip--on': values[def.key] === opt.value }"
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

  <p v-else class="nat-symptoms__empty">
    Impossible de déterminer la phase du jour pour afficher les symptômes.
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
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.nat-symptoms__emoji {
  font-size: 1.15rem;
  line-height: 1;
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

.nat-symptoms__list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.nat-symptoms__row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.nat-symptoms__row--stacked .nat-symptoms__compound {
  width: 100%;
}

.nat-symptoms__label {
  font-size: 0.9rem;
  font-weight: 700;
  color: #2c3e50;
}

.nat-symptoms__scale,
.nat-symptoms__bool,
.nat-symptoms__enum {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.nat-symptoms__compound {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  flex: 1;
}

.nat-symptoms__side {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding-left: 0.25rem;
  border-left: 2px solid rgba(173, 129, 190, 0.35);
}

.nat-symptoms__side-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: #8c98a4;
}

.nat-symptoms__chip {
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

.nat-symptoms__chip:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.nat-symptoms__chip--wide {
  min-width: auto;
  flex: 1 1 auto;
}

.nat-symptoms__chip:hover:not(:disabled) {
  border-color: #ad81be;
  background: rgba(213, 181, 234, 0.2);
}

.nat-symptoms__chip--on {
  background: #ad81be;
  border-color: #ad81be;
  color: #fff;
}

.nat-symptoms__chip--on:hover:not(:disabled) {
  background: #9a6fad;
  border-color: #9a6fad;
}

@media (prefers-color-scheme: dark) {
  .nat-symptoms {
    border-top-color: rgba(213, 181, 234, 0.2);
  }

  .nat-symptoms__hint,
  .nat-symptoms__empty {
    color: #adb5bd;
  }

  .nat-symptoms__label {
    color: #f0e8f8;
  }

  .nat-symptoms__chip {
    background: rgba(40, 32, 52, 0.9);
    border-color: rgba(213, 181, 234, 0.25);
    color: #e8dff0;
  }

  .nat-symptoms__chip:hover:not(:disabled) {
    background: rgba(173, 129, 190, 0.25);
  }
}

@media (min-width: 640px) {
  .nat-symptoms__row:not(.nat-symptoms__row--stacked) {
    flex-direction: row;
    align-items: center;
    gap: 1rem;
  }

  .nat-symptoms__row--stacked {
    flex-direction: row;
    align-items: flex-start;
    gap: 1rem;
  }

  .nat-symptoms__label {
    flex: 0 0 11rem;
  }

  .nat-symptoms__scale,
  .nat-symptoms__bool,
  .nat-symptoms__enum,
  .nat-symptoms__compound {
    flex: 1;
  }
}
</style>
