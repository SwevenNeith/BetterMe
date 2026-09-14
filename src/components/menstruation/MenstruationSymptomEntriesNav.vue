<script setup>
defineProps({
  entries: {
    type: Array,
    default: () => [],
  },
  activeEntryId: {
    type: String,
    default: null,
  },
  entryLabel: {
    type: Function,
    required: true,
  },
})

defineEmits(['select', 'new'])
</script>

<template>
  <div class="symptom-entries" role="navigation" aria-label="Saisies du jour">
    <span class="symptom-entries__label">Saisies du jour</span>
    <div class="symptom-entries__row">
      <button
        v-for="entry in entries"
        :key="entry.id"
        type="button"
        class="symptom-entries__chip"
        :class="{ 'symptom-entries__chip--on': activeEntryId === entry.id }"
        :aria-pressed="activeEntryId === entry.id"
        @click="$emit('select', entry.id)"
      >
        {{ entryLabel(entry) }}
      </button>
      <button
        type="button"
        class="symptom-entries__chip symptom-entries__chip--new"
        :class="{ 'symptom-entries__chip--on': !activeEntryId }"
        :aria-pressed="!activeEntryId"
        @click="$emit('new')"
      >
        + Nouvelle saisie
      </button>
    </div>
  </div>
</template>

<style scoped>
.symptom-entries {
  margin-bottom: 1rem;
}

.symptom-entries__label {
  display: block;
  font-size: 0.8rem;
  font-weight: 700;
  color: #8c98a4;
  margin-bottom: 0.45rem;
}

.symptom-entries__row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.symptom-entries__chip {
  padding: 0.4rem 0.75rem;
  border: 1px solid rgba(173, 129, 190, 0.45);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.85);
  color: #5a4a66;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.symptom-entries__chip--new {
  border-style: dashed;
}

.symptom-entries__chip--on {
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  border-color: var(--color-primary-dark);
  color: #fff;
  border-style: solid;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary-dark) 30%, transparent);
}

@media (prefers-color-scheme: dark) {
  .symptom-entries__label {
    color: #adb5bd;
  }

  .symptom-entries__chip {
    background: rgba(40, 32, 52, 0.9);
    border-color: rgba(213, 181, 234, 0.25);
    color: #e8dff0;
  }

  .symptom-entries__chip--on {
    background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
    border-color: var(--color-primary-dark);
    color: #fff;
    box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary-dark) 45%, transparent);
  }
}
</style>
