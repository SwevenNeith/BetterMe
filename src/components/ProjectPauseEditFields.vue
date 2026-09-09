<script setup>
import ReadingCollectionCombobox from './ReadingCollectionCombobox.vue'

defineProps({
  pauseEnabled: {
    type: Boolean,
    default: false,
  },
  pauseFrom: {
    type: String,
    default: '',
  },
  pauseTo: {
    type: String,
    default: '',
  },
  pauseReason: {
    type: String,
    default: '',
  },
  reasons: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits([
  'update:pauseEnabled',
  'update:pauseFrom',
  'update:pauseTo',
  'update:pauseReason',
])
</script>

<template>
  <fieldset class="project-pause-fields">
    <legend class="project-pause-fields__legend">Pause</legend>

    <label class="project-pause-fields__toggle">
      <input
        type="checkbox"
        :checked="pauseEnabled"
        @change="emit('update:pauseEnabled', $event.target.checked)"
      />
      <span>Mettre en pause sur une période</span>
    </label>

    <div v-if="pauseEnabled" class="project-pause-fields__grid">
      <label class="project-form-field">
        <span class="project-form-label">Du</span>
        <input
          type="date"
          class="project-form-input"
          :value="pauseFrom"
          required
          @input="emit('update:pauseFrom', $event.target.value)"
        />
      </label>
      <label class="project-form-field">
        <span class="project-form-label">Au</span>
        <input
          type="date"
          class="project-form-input"
          :value="pauseTo"
          required
          @input="emit('update:pauseTo', $event.target.value)"
        />
      </label>
      <label class="project-form-field project-pause-fields__reason">
        <span class="project-form-label">Motif</span>
        <ReadingCollectionCombobox
          appearance="form"
          :model-value="pauseReason"
          :collections="reasons"
          placeholder="Vacances, Malade…"
          empty-message="Aucun motif"
          toggle-aria-label="Choisir un motif"
          @update:model-value="emit('update:pauseReason', $event)"
        />
        <span class="project-pause-fields__hint">
          Du début à la fin <strong>inclus</strong> (même jour = pause d’une seule journée). Choisis un motif
          ou saisis-en un nouveau (il sera ajouté au menu).
        </span>
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.project-pause-fields {
  margin: 0.35rem 0 0;
  padding: 0.75rem 0.8rem 0.85rem;
  border: 1px solid rgba(213, 181, 234, 0.4);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.55);
}

.project-pause-fields__legend {
  padding: 0 0.25rem;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: #72a098;
}

.project-pause-fields__toggle {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.9rem;
  font-weight: 650;
  color: #2c3e50;
  cursor: pointer;
}

.project-pause-fields__toggle input {
  width: 1.05rem;
  height: 1.05rem;
  accent-color: #ad81be;
}

.project-pause-fields__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem 0.75rem;
  margin-top: 0.75rem;
}

.project-pause-fields__reason {
  grid-column: 1 / -1;
}

.project-pause-fields__hint {
  display: block;
  margin-top: 0.35rem;
  font-size: 0.75rem;
  color: #6c757d;
  line-height: 1.35;
}

@media (max-width: 520px) {
  .project-pause-fields__grid {
    grid-template-columns: 1fr;
  }
}
</style>
