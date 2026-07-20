<script setup>
import { computed, ref } from 'vue'
import {
  READING_FILTER_FIELDS,
  createReadingBookFilter,
  formatReadingFilterLabel,
  getOperatorMeta,
  getOperatorsForField,
  resetFilterForFieldChange,
  resetFilterForOperatorChange,
} from '../utils/readingBookFilters.js'

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
})

const emit = defineEmits(['update:filters', 'close'])

const addFieldMenuOpen = ref(false)

const fieldOptions = computed(() => Object.values(READING_FILTER_FIELDS))

function updateFilters(next) {
  emit('update:filters', next)
}

function closePopover() {
  addFieldMenuOpen.value = false
  emit('close')
}

function onOverlayClick() {
  closePopover()
}

function addFilter(field) {
  const next = [...props.filters, createReadingBookFilter(field, props.collections)]
  updateFilters(next)
  addFieldMenuOpen.value = false
}

function removeFilter(filterId) {
  updateFilters(props.filters.filter((filter) => filter.id !== filterId))
}

function onFieldChange(filter) {
  resetFilterForFieldChange(filter, props.collections)
  updateFilters([...props.filters])
}

function onOperatorChange(filter) {
  const operator = getOperatorMeta(filter.field, filter.operator)
  if (operator) resetFilterForOperatorChange(filter, operator, props.collections)
  updateFilters([...props.filters])
}

function onValueChange() {
  updateFilters([...props.filters])
}

function operatorNeedsValue(filter) {
  const operator = getOperatorMeta(filter.field, filter.operator)
  return Boolean(operator?.needsValue)
}

function operatorNeedsSelect(filter) {
  return getOperatorMeta(filter.field, filter.operator)?.needsValue === 'select'
}

function operatorNeedsText(filter) {
  return getOperatorMeta(filter.field, filter.operator)?.needsValue === 'text'
}

function operatorNeedsRange(filter) {
  return getOperatorMeta(filter.field, filter.operator)?.needsValue === 'range'
}

function toggleAddFieldMenu() {
  addFieldMenuOpen.value = !addFieldMenuOpen.value
}
</script>

<template>
  <Teleport to="body">
    <template v-if="open">
      <div class="reading-books-filter__overlay" @click="onOverlayClick" />

      <div class="reading-books-filter__popover" role="dialog" aria-modal="true" aria-label="Filtres">
        <header class="reading-books-filter__header">
          <h4 class="reading-books-filter__title">Filtres</h4>
          <button type="button" class="reading-books-filter__close" aria-label="Fermer" @click="closePopover">
            ✕
          </button>
        </header>

        <div v-if="filters.length === 0" class="reading-books-filter__empty">
          Aucun filtre actif.
        </div>

        <ul v-else class="reading-books-filter__rules">
          <li v-for="filter in filters" :key="filter.id" class="reading-books-filter__rule">
            <select
              v-model="filter.field"
              class="reading-books-filter__select reading-books-filter__select--field"
              @change="onFieldChange(filter)"
            >
              <option v-for="field in fieldOptions" :key="field.id" :value="field.id">
                {{ field.label }}
              </option>
            </select>

            <select
              v-model="filter.operator"
              class="reading-books-filter__select reading-books-filter__select--operator"
              @change="onOperatorChange(filter)"
            >
              <option
                v-for="operator in getOperatorsForField(filter.field)"
                :key="operator.id"
                :value="operator.id"
              >
                {{ operator.label }}
              </option>
            </select>

            <select
              v-if="operatorNeedsSelect(filter)"
              v-model="filter.value"
              class="reading-books-filter__select reading-books-filter__select--value"
              @change="onValueChange"
            >
              <option v-for="collection in collections" :key="collection.id ?? collection.name" :value="collection.name">
                {{ collection.name }}
              </option>
            </select>

            <div v-else-if="operatorNeedsRange(filter)" class="reading-books-filter__range">
              <input
                v-model="filter.value"
                type="number"
                min="0"
                class="reading-books-filter__input reading-books-filter__input--range"
                placeholder="Min"
                @input="onValueChange"
              />
              <span class="reading-books-filter__range-sep">et</span>
              <input
                v-model="filter.valueTo"
                type="number"
                min="0"
                class="reading-books-filter__input reading-books-filter__input--range"
                placeholder="Max"
                @input="onValueChange"
              />
            </div>

            <input
              v-else-if="operatorNeedsText(filter)"
              v-model="filter.value"
              type="text"
              class="reading-books-filter__input reading-books-filter__select--value"
              :placeholder="filter.field === 'keyword' ? 'Mot-clé…' : 'Texte…'"
              @input="onValueChange"
            />

            <span v-else class="reading-books-filter__value-placeholder" aria-hidden="true" />

            <button
              type="button"
              class="reading-books-filter__remove"
              :aria-label="`Retirer le filtre ${formatReadingFilterLabel(filter)}`"
              @click="removeFilter(filter.id)"
            >
              ✕
            </button>
          </li>
        </ul>

        <div class="reading-books-filter__footer">
          <div class="reading-books-filter__add-wrap">
            <button type="button" class="reading-books-filter__add-btn" @click="toggleAddFieldMenu">
              + Ajouter un filtre
            </button>

            <div v-if="addFieldMenuOpen" class="reading-books-filter__add-menu">
              <button
                v-for="field in fieldOptions"
                :key="field.id"
                type="button"
                class="reading-books-filter__add-option"
                @click="addFilter(field.id)"
              >
                {{ field.label }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
.reading-books-filter__overlay {
  position: fixed;
  inset: 0;
  z-index: 1250;
}

.reading-books-filter__popover {
  position: fixed;
  z-index: 1251;
  top: max(5.5rem, 18vh);
  right: max(1rem, calc((100vw - 72rem) / 2 + 1rem));
  width: min(94vw, 36rem);
  overflow: visible;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.28);
  background: white;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.16);
  padding: 0.55rem 0.65rem 0.6rem;
  font-size: 0.75rem;
}

.reading-books-filter__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.45rem;
}

.reading-books-filter__title {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 900;
  color: #2c3e50;
}

.reading-books-filter__close {
  border: none;
  background: transparent;
  color: #6c757d;
  font-size: 0.85rem;
  cursor: pointer;
  line-height: 1;
  padding: 0.1rem;
}

.reading-books-filter__empty {
  margin: 0 0 0.45rem;
  font-size: 0.72rem;
  font-weight: 700;
  color: #6c757d;
}

.reading-books-filter__rules {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}

.reading-books-filter__rule {
  display: grid;
  grid-template-columns: minmax(5.5rem, 0.85fr) minmax(5.5rem, 0.9fr) minmax(6rem, 1fr) auto;
  gap: 0.3rem;
  align-items: center;
}

.reading-books-filter__select,
.reading-books-filter__input {
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

.reading-books-filter__select:focus,
.reading-books-filter__input:focus {
  outline: 2px solid rgba(173, 129, 190, 0.42);
  outline-offset: 1px;
}

.reading-books-filter__value-placeholder {
  display: block;
  min-height: 1.45rem;
}

.reading-books-filter__range {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
}

.reading-books-filter__input--range {
  flex: 1 1 0;
  min-width: 0;
}

.reading-books-filter__range-sep {
  flex-shrink: 0;
  font-size: 0.68rem;
  font-weight: 800;
  color: #6c757d;
}

.reading-books-filter__remove {
  border: none;
  background: transparent;
  color: #6c757d;
  font-size: 0.78rem;
  cursor: pointer;
  line-height: 1;
  padding: 0.15rem;
}

.reading-books-filter__remove:hover {
  color: #b02a37;
}

.reading-books-filter__footer {
  margin-top: 0.5rem;
  padding-top: 0.45rem;
  border-top: 1px solid rgba(213, 181, 234, 0.2);
}

.reading-books-filter__add-wrap {
  position: relative;
  display: inline-block;
}

.reading-books-filter__add-btn {
  border: none;
  background: transparent;
  color: #ad81be;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 800;
  cursor: pointer;
  padding: 0.1rem 0;
}

.reading-books-filter__add-btn:hover {
  color: #6b4f7c;
}

.reading-books-filter__add-menu {
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

.reading-books-filter__add-option {
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

.reading-books-filter__add-option:hover {
  background: color-mix(in srgb, #ad81be 12%, white);
}

@media (max-width: 720px) {
  .reading-books-filter__popover {
    left: 50%;
    right: auto;
    transform: translateX(-50%);
    width: min(92vw, 34rem);
  }

  .reading-books-filter__rule {
    grid-template-columns: 1fr 1fr auto;
    grid-template-areas:
      'field field remove'
      'operator operator operator'
      'value value value';
  }

  .reading-books-filter__select--field {
    grid-area: field;
  }

  .reading-books-filter__select--operator {
    grid-area: operator;
  }

  .reading-books-filter__select--value,
  .reading-books-filter__input,
  .reading-books-filter__range,
  .reading-books-filter__value-placeholder {
    grid-area: value;
  }

  .reading-books-filter__remove {
    grid-area: remove;
    justify-self: end;
  }
}
</style>
