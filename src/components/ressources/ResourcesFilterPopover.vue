<script setup>
import { computed } from 'vue'
import {
  RESOURCE_NO_CATEGORY,
  RESOURCE_NO_TAG,
  RESOURCE_SORT_MODES,
} from '../utils/resourceForm.js'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  sortMode: {
    type: String,
    default: RESOURCE_SORT_MODES.GROUPED,
  },
  selectedTags: {
    type: Array,
    default: () => [],
  },
  selectedCategories: {
    type: Array,
    default: () => [],
  },
  availableTags: {
    type: Array,
    default: () => [],
  },
  availableCategories: {
    type: Array,
    default: () => [],
  },
  hasUntagged: {
    type: Boolean,
    default: false,
  },
  hasUncategorized: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([
  'close',
  'update:sortMode',
  'update:selectedTags',
  'update:selectedCategories',
  'reset',
])

const tagOptions = computed(() => {
  const list = [...props.availableTags]
  if (props.hasUntagged) list.unshift(RESOURCE_NO_TAG)
  return list
})

const categoryOptions = computed(() => {
  const list = [...props.availableCategories]
  if (props.hasUncategorized) list.unshift(RESOURCE_NO_CATEGORY)
  return list
})

const allTagsSelected = computed(
  () => tagOptions.value.length > 0 && props.selectedTags.length === 0,
)

const allCategoriesSelected = computed(
  () => categoryOptions.value.length > 0 && props.selectedCategories.length === 0,
)

function closePopover() {
  emit('close')
}

function onOverlayClick() {
  closePopover()
}

function setSortMode(mode) {
  emit('update:sortMode', mode)
}

function isTagSelected(tag) {
  if (props.selectedTags.length === 0) return true
  return props.selectedTags.includes(tag)
}

function isCategorySelected(category) {
  if (props.selectedCategories.length === 0) return true
  return props.selectedCategories.includes(category)
}

function toggleTag(tag) {
  const all = tagOptions.value
  if (props.selectedTags.length === 0) {
    emit(
      'update:selectedTags',
      all.filter((value) => value !== tag),
    )
    return
  }

  if (props.selectedTags.includes(tag)) {
    const next = props.selectedTags.filter((value) => value !== tag)
    emit('update:selectedTags', next.length === all.length ? [] : next)
    return
  }

  const next = [...props.selectedTags, tag]
  emit('update:selectedTags', next.length === all.length ? [] : next)
}

function toggleCategory(category) {
  const all = categoryOptions.value
  if (props.selectedCategories.length === 0) {
    emit(
      'update:selectedCategories',
      all.filter((value) => value !== category),
    )
    return
  }

  if (props.selectedCategories.includes(category)) {
    const next = props.selectedCategories.filter((value) => value !== category)
    emit('update:selectedCategories', next.length === all.length ? [] : next)
    return
  }

  const next = [...props.selectedCategories, category]
  emit('update:selectedCategories', next.length === all.length ? [] : next)
}

function selectAllTags() {
  emit('update:selectedTags', [])
}

function selectAllCategories() {
  emit('update:selectedCategories', [])
}

function resetFilters() {
  emit('reset')
}
</script>

<template>
  <Teleport to="body">
    <template v-if="open">
      <div class="resources-filter__overlay" @click="onOverlayClick" />

      <div class="resources-filter__popover" role="dialog" aria-modal="true" aria-label="Filtres ressources">
        <header class="resources-filter__header">
          <h4 class="resources-filter__title">Affichage</h4>
          <button type="button" class="resources-filter__close" aria-label="Fermer" @click="closePopover">
            ✕
          </button>
        </header>

        <section class="resources-filter__section">
          <span class="resources-filter__section-label">Tri</span>
          <div class="resources-filter__sort-options">
            <label class="resources-filter__radio">
              <input
                type="radio"
                name="resource-sort"
                :checked="sortMode === RESOURCE_SORT_MODES.GROUPED"
                @change="setSortMode(RESOURCE_SORT_MODES.GROUPED)"
              />
              <span>Navigation par tag, puis catégorie</span>
            </label>
            <label class="resources-filter__radio">
              <input
                type="radio"
                name="resource-sort"
                :checked="sortMode === RESOURCE_SORT_MODES.ALPHA"
                @change="setSortMode(RESOURCE_SORT_MODES.ALPHA)"
              />
              <span>Ordre alphabétique (nom)</span>
            </label>
          </div>
        </section>

        <section class="resources-filter__section">
          <div class="resources-filter__section-head">
            <span class="resources-filter__section-label">Tags principaux</span>
            <button type="button" class="resources-filter__link-btn" @click="selectAllTags">Tous</button>
          </div>
          <div v-if="tagOptions.length === 0" class="resources-filter__empty">Aucun tag pour le moment.</div>
          <div v-else class="resources-filter__chips">
            <button
              v-for="tag in tagOptions"
              :key="tag"
              type="button"
              class="resources-filter__chip"
              :class="{ 'resources-filter__chip--active': isTagSelected(tag) }"
              @click="toggleTag(tag)"
            >
              {{ tag }}
            </button>
          </div>
          <p v-if="!allTagsSelected" class="resources-filter__hint">
            Seuls les tags sélectionnés sont affichés.
          </p>
        </section>

        <section class="resources-filter__section">
          <div class="resources-filter__section-head">
            <span class="resources-filter__section-label">Catégories</span>
            <button type="button" class="resources-filter__link-btn" @click="selectAllCategories">
              Toutes
            </button>
          </div>
          <div v-if="categoryOptions.length === 0" class="resources-filter__empty">
            Aucune catégorie pour le moment.
          </div>
          <div v-else class="resources-filter__chips">
            <button
              v-for="category in categoryOptions"
              :key="category"
              type="button"
              class="resources-filter__chip"
              :class="{ 'resources-filter__chip--active': isCategorySelected(category) }"
              @click="toggleCategory(category)"
            >
              {{ category }}
            </button>
          </div>
          <p v-if="!allCategoriesSelected" class="resources-filter__hint">
            Seules les catégories sélectionnées sont affichées.
          </p>
        </section>

        <footer class="resources-filter__footer">
          <button type="button" class="resources-filter__reset-btn" @click="resetFilters">
            Réinitialiser les filtres
          </button>
        </footer>
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
.resources-filter__overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(44, 36, 52, 0.35);
}

.resources-filter__popover {
  position: fixed;
  z-index: 41;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(92vw, 26rem);
  max-height: min(85vh, 34rem);
  overflow: auto;
  padding: 1rem;
  border-radius: 16px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 16px 40px rgba(61, 47, 74, 0.18);
}

.resources-filter__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.resources-filter__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: #6b4f7c;
}

.resources-filter__close {
  border: none;
  background: transparent;
  color: #6c757d;
  font-size: 1.1rem;
  cursor: pointer;
}

.resources-filter__section + .resources-filter__section {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(213, 181, 234, 0.25);
}

.resources-filter__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.resources-filter__section-label {
  display: block;
  font-size: 0.82rem;
  font-weight: 800;
  color: #6c757d;
}

.resources-filter__sort-options {
  display: grid;
  gap: 0.45rem;
  margin-top: 0.45rem;
}

.resources-filter__radio {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: #2c3e50;
  cursor: pointer;
}

.resources-filter__radio input {
  margin-top: 0.15rem;
}

.resources-filter__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.resources-filter__chip {
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  border: 1px solid rgba(213, 181, 234, 0.45);
  background: rgba(255, 255, 255, 0.85);
  color: #6b4f7c;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}

.resources-filter__chip--active {
  background: rgba(173, 129, 190, 0.28);
  border-color: rgba(173, 129, 190, 0.55);
}

.resources-filter__link-btn {
  border: none;
  background: transparent;
  color: #ad81be;
  font-size: 0.78rem;
  font-weight: 800;
  cursor: pointer;
}

.resources-filter__empty,
.resources-filter__hint {
  margin: 0;
  font-size: 0.82rem;
  color: #8b7a96;
}

.resources-filter__hint {
  margin-top: 0.45rem;
}

.resources-filter__footer {
  margin-top: 1rem;
  padding-top: 0.85rem;
  border-top: 1px solid rgba(213, 181, 234, 0.25);
}

.resources-filter__reset-btn {
  width: 100%;
  padding: 0.55rem 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.85);
  color: #6b4f7c;
  font-weight: 800;
  cursor: pointer;
}

@media (prefers-color-scheme: dark) {
  .resources-filter__popover {
    background: rgba(35, 30, 48, 0.98);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .resources-filter__title {
    color: #e8dcf5;
  }

  .resources-filter__radio {
    color: #f0e8f8;
  }

  .resources-filter__chip {
    background: rgba(42, 36, 56, 0.85);
    border-color: rgba(213, 181, 234, 0.28);
    color: #e8dcf5;
  }

  .resources-filter__chip--active {
    background: rgba(173, 129, 190, 0.32);
  }

  .resources-filter__reset-btn {
    background: rgba(42, 36, 56, 0.85);
    border-color: rgba(213, 181, 234, 0.28);
    color: #e8dcf5;
  }
}
</style>
