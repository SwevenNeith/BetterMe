<script setup>
import { computed, ref } from 'vue'
import {
  createTelevisionMediaFilter,
  formatTelevisionFilterLabel,
  getTelevisionFilterFieldOptions,
  getTelevisionOperatorMeta,
  getTelevisionOperatorsForField,
  resetTelevisionFilterForFieldChange,
  resetTelevisionFilterForOperatorChange,
} from '../../utils/television/televisionMediaFilters.js'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  filters: {
    type: Array,
    default: () => [],
  },
  collections: {
    type: Array,
    default: () => [],
  },
  /** @type {'library'|'catalog'} */
  context: {
    type: String,
    default: 'library',
  },
})

const emit = defineEmits(['update:filters', 'close'])

const addFieldMenuOpen = ref(false)

const fieldOptions = computed(() => getTelevisionFilterFieldOptions(props.context))

function updateFilters(next) {
  emit('update:filters', next)
}

function closePopover() {
  addFieldMenuOpen.value = false
  emit('close')
}

function addFilter(field) {
  const next = [...props.filters, createTelevisionMediaFilter(field, props.collections)]
  updateFilters(next)
  addFieldMenuOpen.value = false
}

function removeFilter(filterId) {
  updateFilters(props.filters.filter((filter) => filter.id !== filterId))
}

function onFieldChange(filter) {
  resetTelevisionFilterForFieldChange(filter, props.collections)
  updateFilters([...props.filters])
}

function onOperatorChange(filter) {
  const operator = getTelevisionOperatorMeta(filter.field, filter.operator)
  if (operator) resetTelevisionFilterForOperatorChange(filter, operator, props.collections)
  updateFilters([...props.filters])
}

function onValueChange() {
  updateFilters([...props.filters])
}

function operatorNeedsValue(filter) {
  return Boolean(getTelevisionOperatorMeta(filter.field, filter.operator)?.needsValue)
}

function operatorNeedsSelect(filter) {
  return getTelevisionOperatorMeta(filter.field, filter.operator)?.needsValue === 'select'
}

function operatorNeedsText(filter) {
  return getTelevisionOperatorMeta(filter.field, filter.operator)?.needsValue === 'text'
}

function operatorNeedsRange(filter) {
  return getTelevisionOperatorMeta(filter.field, filter.operator)?.needsValue === 'range'
}

function operatorNeedsNumber(filter) {
  return getTelevisionOperatorMeta(filter.field, filter.operator)?.needsValue === 'number'
}

function rangeMinForField(field) {
  return field === 'year' ? 1900 : 0
}

function rangeMaxForField(field) {
  return field === 'rating' ? 10 : undefined
}

function rangeStepForField(field) {
  return field === 'rating' ? 0.5 : 1
}

function toggleAddFieldMenu() {
  addFieldMenuOpen.value = !addFieldMenuOpen.value
}
</script>

<template>
  <div v-if="open" class="tv-media-filter" role="dialog" aria-label="Filtres">
    <header class="tv-media-filter__header">
      <h4 class="tv-media-filter__title">Filtres</h4>
      <button type="button" class="tv-media-filter__close" aria-label="Fermer" @click="closePopover">
        ✕
      </button>
    </header>

    <div v-if="filters.length === 0" class="tv-media-filter__empty">Aucun filtre actif.</div>

    <ul v-else class="tv-media-filter__rules">
      <li v-for="filter in filters" :key="filter.id" class="tv-media-filter__rule">
        <select
          v-model="filter.field"
          class="tv-media-filter__select tv-media-filter__select--field"
          @change="onFieldChange(filter)"
        >
          <option v-for="field in fieldOptions" :key="field.id" :value="field.id">
            {{ field.label }}
          </option>
        </select>

        <select
          v-model="filter.operator"
          class="tv-media-filter__select tv-media-filter__select--operator"
          @change="onOperatorChange(filter)"
        >
          <option
            v-for="operator in getTelevisionOperatorsForField(filter.field)"
            :key="operator.id"
            :value="operator.id"
          >
            {{ operator.label }}
          </option>
        </select>

        <select
          v-if="operatorNeedsSelect(filter)"
          v-model="filter.value"
          class="tv-media-filter__select tv-media-filter__select--value"
          @change="onValueChange"
        >
          <option
            v-for="collection in collections"
            :key="collection.id ?? collection.name"
            :value="collection.name"
          >
            {{ collection.name }}
          </option>
        </select>

        <div v-else-if="operatorNeedsRange(filter)" class="tv-media-filter__range">
          <input
            v-model="filter.value"
            type="number"
            :min="rangeMinForField(filter.field)"
            :max="rangeMaxForField(filter.field)"
            :step="rangeStepForField(filter.field)"
            class="tv-media-filter__input tv-media-filter__input--range"
            placeholder="Min"
            @input="onValueChange"
          />
          <span class="tv-media-filter__range-sep">et</span>
          <input
            v-model="filter.valueTo"
            type="number"
            :min="rangeMinForField(filter.field)"
            :max="rangeMaxForField(filter.field)"
            :step="rangeStepForField(filter.field)"
            class="tv-media-filter__input tv-media-filter__input--range"
            placeholder="Max"
            @input="onValueChange"
          />
        </div>

        <input
          v-else-if="operatorNeedsNumber(filter)"
          v-model="filter.value"
          type="number"
          :min="rangeMinForField(filter.field)"
          class="tv-media-filter__input tv-media-filter__select--value"
          placeholder="Année…"
          @input="onValueChange"
        />

        <input
          v-else-if="operatorNeedsText(filter)"
          v-model="filter.value"
          type="text"
          class="tv-media-filter__input tv-media-filter__select--value"
          placeholder="Texte…"
          @input="onValueChange"
        />

        <span v-else-if="!operatorNeedsValue(filter)" class="tv-media-filter__value-placeholder" />

        <button
          type="button"
          class="tv-media-filter__remove"
          :aria-label="`Retirer le filtre ${formatTelevisionFilterLabel(filter)}`"
          @click="removeFilter(filter.id)"
        >
          ✕
        </button>
      </li>
    </ul>

    <div class="tv-media-filter__footer">
      <div class="tv-media-filter__add-wrap">
        <button type="button" class="tv-media-filter__add-btn" @click="toggleAddFieldMenu">
          + Ajouter un filtre
        </button>

        <div v-if="addFieldMenuOpen" class="tv-media-filter__add-menu">
          <button
            v-for="field in fieldOptions"
            :key="field.id"
            type="button"
            class="tv-media-filter__add-option"
            @click="addFilter(field.id)"
          >
            {{ field.label }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tv-media-filter {
  width: 100%;
  margin: 0.65rem 0 0.85rem;
  overflow: visible;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 8px 24px rgba(173, 129, 190, 0.12);
  padding: 0.65rem 0.75rem 0.7rem;
  font-size: 0.75rem;
  box-sizing: border-box;
}

.tv-media-filter__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.45rem;
}

.tv-media-filter__title {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 900;
  color: #2c3e50;
}

.tv-media-filter__close {
  border: none;
  background: transparent;
  color: #6c757d;
  font-size: 0.85rem;
  cursor: pointer;
  line-height: 1;
  padding: 0.1rem;
}

.tv-media-filter__empty {
  margin: 0 0 0.45rem;
  font-size: 0.72rem;
  font-weight: 700;
  color: #6c757d;
}

.tv-media-filter__rules {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}

.tv-media-filter__rule {
  display: grid;
  grid-template-columns: minmax(5.5rem, 0.85fr) minmax(5.5rem, 0.9fr) minmax(6rem, 1fr) auto;
  gap: 0.3rem;
  align-items: center;
}

.tv-media-filter__select,
.tv-media-filter__input {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 0.28rem 0.38rem;
  border-radius: 8px;
  border: 1px solid rgba(213, 181, 234, 0.32);
  background: rgba(255, 255, 255, 0.95);
  color: #2c3e50;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1.25;
}

.tv-media-filter__value-placeholder {
  display: block;
  min-height: 1.45rem;
}

.tv-media-filter__range {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
}

.tv-media-filter__input--range {
  flex: 1 1 0;
  min-width: 0;
}

.tv-media-filter__range-sep {
  flex-shrink: 0;
  font-size: 0.68rem;
  font-weight: 800;
  color: #6c757d;
}

.tv-media-filter__remove {
  border: none;
  background: transparent;
  color: #6c757d;
  font-size: 0.78rem;
  cursor: pointer;
  line-height: 1;
  padding: 0.15rem;
}

.tv-media-filter__footer {
  margin-top: 0.5rem;
  padding-top: 0.45rem;
  border-top: 1px solid rgba(213, 181, 234, 0.2);
}

.tv-media-filter__add-wrap {
  position: relative;
  display: inline-block;
}

.tv-media-filter__add-btn {
  border: none;
  background: transparent;
  color: #ad81be;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 800;
  cursor: pointer;
  padding: 0.1rem 0;
}

.tv-media-filter__add-menu {
  position: absolute;
  left: 0;
  top: calc(100% + 0.25rem);
  z-index: 2;
  min-width: 12rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.28);
  background: white;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.12);
  padding: 0.25rem;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.1rem;
}

.tv-media-filter__add-option {
  border: none;
  background: transparent;
  text-align: left;
  padding: 0.32rem 0.45rem;
  border-radius: 6px;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  color: #2c3e50;
  cursor: pointer;
}

.tv-media-filter__add-option:hover {
  background: color-mix(in srgb, #ad81be 12%, white);
}

@media (max-width: 720px) {
  .tv-media-filter__rule {
    grid-template-columns: 1fr 1fr auto;
  }
}

@media (prefers-color-scheme: dark) {
  .tv-media-filter {
    background: rgba(35, 30, 48, 0.92);
    border-color: rgba(213, 181, 234, 0.28);
  }

  .tv-media-filter__title,
  .tv-media-filter__add-option {
    color: #f0e8f8;
  }

  .tv-media-filter__close,
  .tv-media-filter__empty,
  .tv-media-filter__range-sep,
  .tv-media-filter__remove {
    color: #adb5bd;
  }

  .tv-media-filter__select,
  .tv-media-filter__input {
    background: rgba(35, 30, 48, 0.95);
    border-color: rgba(213, 181, 234, 0.32);
    color: #f0e8f8;
  }

  .tv-media-filter__add-menu {
    background: #2a2438;
  }
}
</style>
