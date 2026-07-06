<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  sections: {
    type: Array,
    default: () => [],
  },
  values: {
    type: Object,
    default: () => ({}),
  },
  canSave: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['select-scale', 'select-enum', 'select-boolean', 'select-side'])

const openSections = ref(new Set())

function sectionsOpenKey(sections) {
  return (sections ?? []).map((section) => `${section.id}:${section.isCurrent ? 1 : 0}`).join('|')
}

watch(
  () => sectionsOpenKey(props.sections),
  () => {
    const sections = props.sections
    const next = new Set()
    for (const section of sections) {
      if (section.isCurrent) next.add(section.id)
    }
    if (!next.size && sections[0]?.id) next.add(sections[0].id)

    const prevKey = [...openSections.value].sort().join(',')
    const nextKey = [...next].sort().join(',')
    if (prevKey === nextKey) return

    openSections.value = next
  },
  { immediate: true },
)

function toggleSection(id) {
  const next = new Set(openSections.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  openSections.value = next
}

function isOpen(id) {
  return openSections.value.has(id)
}

function scaleRange(def) {
  const min = def.min ?? 0
  const max = def.max ?? 5
  const out = []
  for (let i = min; i <= max; i += 1) out.push(i)
  return out
}

function rowKey(sectionId, def) {
  return `${sectionId}:${def.key}`
}

async function onBoolean(def, v) {
  emit('select-boolean', { key: def.key, value: v, clearSideKey: def.sideKey })
}
</script>

<template>
  <div class="m-symptom-sections">
    <div
      v-for="section in sections"
      :key="section.id"
      class="m-symptom-section"
      :class="{ 'm-symptom-section--current': section.isCurrent }"
    >
      <button
        type="button"
        class="m-symptom-section__toggle"
        :aria-expanded="isOpen(section.id)"
        @click="toggleSection(section.id)"
      >
        <span class="m-symptom-section__toggle-main">
          <span v-if="section.emoji" class="m-symptom-section__emoji" aria-hidden="true">{{
            section.emoji
          }}</span>
          <span class="m-symptom-section__label">{{ section.label }}</span>
          <span v-if="section.isCurrent" class="m-symptom-section__badge">En cours</span>
        </span>
        <span class="m-symptom-section__chevron" aria-hidden="true">{{
          isOpen(section.id) ? '▾' : '▸'
        }}</span>
      </button>

      <div v-show="isOpen(section.id)" class="m-symptom-section__panel">
        <div class="m-symptom-section__list">
          <div
            v-for="def in section.defs"
            :key="rowKey(section.id, def)"
            class="m-symptom-section__row"
            :class="{ 'm-symptom-section__row--stacked': def.type === 'boolean_with_side' }"
          >
            <span class="m-symptom-section__field-label">{{ def.label }}</span>

            <div
              v-if="def.type === 'scale'"
              class="m-symptom-section__controls"
              role="group"
              :aria-label="def.label"
            >
              <button
                v-for="n in scaleRange(def)"
                :key="n"
                type="button"
                class="m-symptom-section__chip"
                :class="{ 'm-symptom-section__chip--on': values[def.key] === n }"
                :aria-pressed="values[def.key] === n"
                :disabled="!canSave"
                @click="emit('select-scale', { key: def.key, value: n })"
              >
                {{ n }}
              </button>
            </div>

            <div
              v-else-if="def.type === 'boolean'"
              class="m-symptom-section__controls"
              role="group"
              :aria-label="def.label"
            >
              <button
                type="button"
                class="m-symptom-section__chip m-symptom-section__chip--wide"
                :class="{ 'm-symptom-section__chip--on': values[def.key] === true }"
                :aria-pressed="values[def.key] === true"
                :disabled="!canSave"
                @click="emit('select-boolean', { key: def.key, value: true })"
              >
                Oui
              </button>
              <button
                type="button"
                class="m-symptom-section__chip m-symptom-section__chip--wide"
                :class="{ 'm-symptom-section__chip--on': values[def.key] === false }"
                :aria-pressed="values[def.key] === false"
                :disabled="!canSave"
                @click="emit('select-boolean', { key: def.key, value: false })"
              >
                Non
              </button>
            </div>

            <div v-else-if="def.type === 'boolean_with_side'" class="m-symptom-section__compound">
              <div class="m-symptom-section__controls" role="group" :aria-label="def.label">
                <button
                  type="button"
                  class="m-symptom-section__chip m-symptom-section__chip--wide"
                  :class="{ 'm-symptom-section__chip--on': values[def.key] === true }"
                  :aria-pressed="values[def.key] === true"
                  :disabled="!canSave"
                  @click="onBoolean(def, true)"
                >
                  Oui
                </button>
                <button
                  type="button"
                  class="m-symptom-section__chip m-symptom-section__chip--wide"
                  :class="{ 'm-symptom-section__chip--on': values[def.key] === false }"
                  :aria-pressed="values[def.key] === false"
                  :disabled="!canSave"
                  @click="onBoolean(def, false)"
                >
                  Non
                </button>
              </div>
              <div
                v-if="values[def.key] === true"
                class="m-symptom-section__side"
                role="group"
                aria-label="Côté de la douleur"
              >
                <span class="m-symptom-section__side-label">Côté</span>
                <div class="m-symptom-section__controls">
                  <button
                    v-for="opt in def.sideOptions"
                    :key="opt.value"
                    type="button"
                    class="m-symptom-section__chip m-symptom-section__chip--wide"
                    :class="{ 'm-symptom-section__chip--on': values[def.sideKey] === opt.value }"
                    :aria-pressed="values[def.sideKey] === opt.value"
                    :disabled="!canSave"
                    @click="emit('select-side', { key: def.sideKey, value: opt.value })"
                  >
                    {{ opt.label }}
                  </button>
                </div>
              </div>
            </div>

            <div
              v-else-if="def.type === 'enum'"
              class="m-symptom-section__controls"
              role="group"
              :aria-label="def.label"
            >
              <button
                v-for="opt in def.options"
                :key="String(opt.value)"
                type="button"
                class="m-symptom-section__chip m-symptom-section__chip--wide"
                :class="{ 'm-symptom-section__chip--on': values[def.key] === opt.value }"
                :aria-pressed="values[def.key] === opt.value"
                :disabled="!canSave"
                @click="emit('select-enum', { key: def.key, value: opt.value })"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.m-symptom-sections {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.m-symptom-section {
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.45);
}

.m-symptom-section--current {
  border-color: rgba(173, 129, 190, 0.55);
  box-shadow: 0 2px 10px rgba(173, 129, 190, 0.12);
}

.m-symptom-section__toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 0.85rem;
  border: none;
  background: rgba(213, 181, 234, 0.12);
  cursor: pointer;
  text-align: left;
}

.m-symptom-section--current .m-symptom-section__toggle {
  background: rgba(213, 181, 234, 0.22);
}

.m-symptom-section__toggle-main {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}

.m-symptom-section__emoji {
  font-size: 1.05rem;
  line-height: 1;
}

.m-symptom-section__label {
  font-size: 0.92rem;
  font-weight: 800;
  color: #ad81be;
}

.m-symptom-section__badge {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #fff;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
}

.m-symptom-section__chevron {
  color: #ad81be;
  font-size: 0.95rem;
  flex-shrink: 0;
}

.m-symptom-section__panel {
  padding: 0.85rem;
}

.m-symptom-section__list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.m-symptom-section__row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.m-symptom-section__field-label {
  font-size: 0.9rem;
  font-weight: 700;
  color: #2c3e50;
}

.m-symptom-section__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.m-symptom-section__compound {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  width: 100%;
}

.m-symptom-section__side {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding-left: 0.25rem;
  border-left: 2px solid rgba(173, 129, 190, 0.35);
}

.m-symptom-section__side-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: #8c98a4;
}

.m-symptom-section__chip {
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

.m-symptom-section__chip:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.m-symptom-section__chip--wide {
  min-width: auto;
  flex: 1 1 auto;
}

.m-symptom-section__chip:hover:not(:disabled) {
  border-color: #ad81be;
  background: rgba(213, 181, 234, 0.2);
}

.m-symptom-section__chip--on {
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  border-color: var(--color-primary-dark);
  color: #fff;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary-dark) 30%, transparent);
}

@media (min-width: 640px) {
  .m-symptom-section__row:not(.m-symptom-section__row--stacked) {
    flex-direction: row;
    align-items: center;
    gap: 1rem;
  }

  .m-symptom-section__row--stacked {
    flex-direction: row;
    align-items: flex-start;
    gap: 1rem;
  }

  .m-symptom-section__field-label {
    flex: 0 0 11rem;
  }

  .m-symptom-section__controls,
  .m-symptom-section__compound {
    flex: 1;
  }
}

@media (prefers-color-scheme: dark) {
  .m-symptom-section {
    background: rgba(0, 0, 0, 0.18);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .m-symptom-section--current {
    border-color: rgba(213, 181, 234, 0.45);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  }

  .m-symptom-section__toggle {
    background: rgba(213, 181, 234, 0.1);
  }

  .m-symptom-section--current .m-symptom-section__toggle {
    background: rgba(213, 181, 234, 0.18);
  }

  .m-symptom-section__label,
  .m-symptom-section__chevron {
    color: #d5b5ea;
  }

  .m-symptom-section__field-label {
    color: #f0e8f8;
  }

  .m-symptom-section__side-label {
    color: #adb5bd;
  }

  .m-symptom-section__side {
    border-left-color: rgba(213, 181, 234, 0.35);
  }

  .m-symptom-section__chip:not(.m-symptom-section__chip--on) {
    background: rgba(40, 32, 52, 0.95);
    border-color: rgba(213, 181, 234, 0.38);
    color: #f0e8f8;
  }

  .m-symptom-section__chip:hover:not(:disabled):not(.m-symptom-section__chip--on) {
    background: rgba(213, 181, 234, 0.22);
    border-color: rgba(213, 181, 234, 0.5);
  }

  .m-symptom-section__chip--on {
    color: #fff;
  }
}
</style>
