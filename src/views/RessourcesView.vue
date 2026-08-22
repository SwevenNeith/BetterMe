<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ReadingCollectionCombobox from '../components/ReadingCollectionCombobox.vue'
import ResourcesFilterPopover from '../components/ResourcesFilterPopover.vue'
import { supabase } from '../lib/supabase.js'
import { APP_PAGE_IDS } from '../constants/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import { formDraftKey, useFormDraft } from '../composables/useFormDraft.js'
import { listResourceCategories } from '../services/resourceCategories.js'
import {
  createResourceItem,
  deleteResourceItem,
  listResourceItems,
  updateResourceItem,
} from '../services/resourceItems.js'
import {
  applyResourceDisplayFilters,
  collectResourceFilterOptions,
  emptyResourceForm,
  formToResourcePayload,
  groupResourcesByPrimaryTagAndCategory,
  RESOURCE_SORT_MODES,
  resourceLinkHref,
  resourceToForm,
  sortResourcesAlphabetically,
} from '../utils/resourceForm.js'

const { pageTitle } = usePageDisplayLabel(APP_PAGE_IDS.RESSOURCES, undefined, { setDocumentTitle: true })

const route = useRoute()
const router = useRouter()

const userId = ref(null)
const isLoading = ref(true)
const loadError = ref('')
const formError = ref('')
const isSaving = ref(false)
const isDeletingId = ref(null)
const items = ref([])
const categories = ref([])
const searchQuery = ref('')
const sortMode = ref(RESOURCE_SORT_MODES.GROUPED)
const selectedTags = ref([])
const selectedCategories = ref([])
const filterOpen = ref(false)
const formOpen = ref(false)
const editingItemId = ref(null)
const pendingDeleteItem = ref(null)
const formCardRef = ref(null)
const formNameInputRef = ref(null)

const resourceForm = reactive(emptyResourceForm())

const isEditMode = computed(() => Boolean(editingItemId.value))

const resourceDraftKey = computed(() => {
  if (!userId.value || !formOpen.value) return null
  return formDraftKey('resource-form', userId.value, editingItemId.value || 'new')
})

const { clearDraft: clearResourceDraft, restoreDraft: restoreResourceDraft } = useFormDraft(
  resourceDraftKey,
  {
    enabled: computed(() => Boolean(userId.value) && formOpen.value && !isSaving.value),
    getState: () => ({ ...resourceForm }),
    setState: (state) => {
      if (!state || typeof state !== 'object') return
      Object.assign(resourceForm, emptyResourceForm(), state)
    },
  },
)

const filteredItems = computed(() =>
  applyResourceDisplayFilters(items.value, {
    searchQuery: searchQuery.value,
    selectedTags: selectedTags.value,
    selectedCategories: selectedCategories.value,
  }),
)

const filterOptions = computed(() => collectResourceFilterOptions(items.value, categories.value))

const groupedSections = computed(() =>
  groupResourcesByPrimaryTagAndCategory(filteredItems.value, categories.value),
)

const alphabeticalItems = computed(() => sortResourcesAlphabetically(filteredItems.value))

const browseTag = computed(() => {
  const value = route.query.tag
  return value ? String(value) : ''
})

const browseCategory = computed(() => {
  const value = route.query.category
  return value ? String(value) : ''
})

const browseLevel = computed(() => {
  if (!browseTag.value) return 'tags'
  if (!browseCategory.value) return 'categories'
  return 'resources'
})

const showFlatList = computed(
  () => sortMode.value === RESOURCE_SORT_MODES.ALPHA || Boolean(searchQuery.value.trim()),
)

const activeTagSection = computed(
  () => groupedSections.value.find((section) => section.tag === browseTag.value) ?? null,
)

const activeCategoryGroup = computed(
  () =>
    activeTagSection.value?.categoryGroups.find(
      (group) => group.categoryName === browseCategory.value,
    ) ?? null,
)

const tagBrowseItems = computed(() =>
  groupedSections.value.map((section) => ({
    tag: section.tag,
    categoryCount: section.categoryGroups.length,
    resourceCount: section.categoryGroups.reduce((total, group) => total + group.items.length, 0),
  })),
)

const categoryBrowseItems = computed(() =>
  (activeTagSection.value?.categoryGroups ?? []).map((group) => ({
    categoryName: group.categoryName,
    resourceCount: group.items.length,
  })),
)

const browseResourceItems = computed(() => activeCategoryGroup.value?.items ?? [])

const displayedResourceItems = computed(() => {
  if (showFlatList.value) return alphabeticalItems.value
  if (browseLevel.value === 'resources') return browseResourceItems.value
  return []
})

const showBrowseNavigation = computed(
  () =>
    sortMode.value === RESOURCE_SORT_MODES.GROUPED &&
    !searchQuery.value.trim() &&
    !isLoading.value &&
    items.value.length > 0 &&
    filteredItems.value.length > 0,
)

const browseSectionTitle = computed(() => {
  if (!showBrowseNavigation.value) return ''
  if (browseLevel.value === 'tags') return 'Tags'
  if (browseLevel.value === 'categories') return browseTag.value
  return browseCategory.value
})

const browseSectionHint = computed(() => {
  if (!showBrowseNavigation.value) return ''
  if (browseLevel.value === 'tags') return 'Choisis un tag pour voir ses catégories.'
  if (browseLevel.value === 'categories') return 'Choisis une catégorie pour voir les ressources.'
  return `${browseResourceItems.value.length} ressource${browseResourceItems.value.length > 1 ? 's' : ''}.`
})

const hasActiveDisplayFilters = computed(
  () =>
    sortMode.value !== RESOURCE_SORT_MODES.GROUPED ||
    selectedTags.value.length > 0 ||
    selectedCategories.value.length > 0,
)

const resourcesSubtitle = computed(() => {
  const total = items.value.length
  if (total === 0) return 'Tes infos à garder ou consulter plus tard.'
  const displayed = filteredItems.value.length
  if ((searchQuery.value.trim() || hasActiveDisplayFilters.value) && displayed !== total) {
    return `${displayed} ressource${displayed > 1 ? 's' : ''} sur ${total} affichée${displayed > 1 ? 's' : ''}.`
  }
  return `${total} ressource${total > 1 ? 's' : ''} enregistrée${total > 1 ? 's' : ''}.`
})

function resetDisplayFilters() {
  sortMode.value = RESOURCE_SORT_MODES.GROUPED
  selectedTags.value = []
  selectedCategories.value = []
}

function removeTagFilter(tag) {
  const all = [
    ...(filterOptions.value.hasUntagged ? ['Sans tag'] : []),
    ...filterOptions.value.tags,
  ]
  if (selectedTags.value.length === 0) {
    selectedTags.value = all.filter((value) => value !== tag)
    return
  }
  selectedTags.value = selectedTags.value.filter((value) => value !== tag)
}

function removeCategoryFilter(category) {
  const all = [
    ...(filterOptions.value.hasUncategorized ? ['Sans catégorie'] : []),
    ...filterOptions.value.categories,
  ]
  if (selectedCategories.value.length === 0) {
    selectedCategories.value = all.filter((value) => value !== category)
    return
  }
  selectedCategories.value = selectedCategories.value.filter((value) => value !== category)
}

const activeFilterPills = computed(() => {
  const pills = []
  if (sortMode.value === RESOURCE_SORT_MODES.ALPHA) {
    pills.push({ id: 'sort:alpha', label: 'Ordre alphabétique', kind: 'sort' })
  }
  for (const tag of selectedTags.value) {
    pills.push({ id: `tag:${tag}`, label: tag, kind: 'tag', value: tag })
  }
  for (const category of selectedCategories.value) {
    pills.push({ id: `cat:${category}`, label: category, kind: 'category', value: category })
  }
  return pills
})

function removeFilterPill(pill) {
  if (pill.kind === 'sort') {
    sortMode.value = RESOURCE_SORT_MODES.GROUPED
    return
  }
  if (pill.kind === 'tag') {
    removeTagFilter(pill.value)
    return
  }
  if (pill.kind === 'category') {
    removeCategoryFilter(pill.value)
  }
}

function buildBrowseQuery(overrides = {}) {
  const query = { ...route.query }

  if ('tag' in overrides) {
    if (overrides.tag) query.tag = overrides.tag
    else delete query.tag
  }

  if ('category' in overrides) {
    if (overrides.category) query.category = overrides.category
    else delete query.category
  }

  return query
}

function openBrowseTag(tag) {
  router.push({ name: 'ressources', query: buildBrowseQuery({ tag, category: null }) })
}

function openBrowseCategory(categoryName) {
  router.push({ name: 'ressources', query: buildBrowseQuery({ category: categoryName }) })
}

function goToBrowseTags() {
  router.push({ name: 'ressources', query: buildBrowseQuery({ tag: null, category: null }) })
}

function goToBrowseCategories() {
  router.push({ name: 'ressources', query: buildBrowseQuery({ category: null }) })
}

function formatBrowseCount(count, singular, plural = `${singular}s`) {
  return `${count} ${count > 1 ? plural : singular}`
}

function resetForm() {
  Object.assign(resourceForm, emptyResourceForm())
  editingItemId.value = null
  formError.value = ''
}

async function revealForm() {
  await nextTick()
  formCardRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  requestAnimationFrame(() => {
    formNameInputRef.value?.focus({ preventScroll: true })
  })
}

async function openForm() {
  resetForm()
  formOpen.value = true
  await nextTick()
  restoreResourceDraft()
  void revealForm()
}

async function openEditForm(item) {
  if (!item?.id) return
  editingItemId.value = item.id
  Object.assign(resourceForm, resourceToForm(item))
  formError.value = ''
  formOpen.value = true
  await nextTick()
  restoreResourceDraft()
  void revealForm()
}

function closeForm() {
  clearResourceDraft()
  formOpen.value = false
  resetForm()
}

async function loadData() {
  if (!userId.value) return

  isLoading.value = true
  loadError.value = ''
  try {
    const [nextItems, nextCategories] = await Promise.all([
      listResourceItems(supabase, userId.value),
      listResourceCategories(supabase, userId.value),
    ])
    items.value = nextItems
    categories.value = nextCategories
  } catch (err) {
    console.error(err)
    const msg = err.message || ''
    loadError.value = msg.includes('resource_items')
      ? 'Table resource_items introuvable. Exécute scripts/create-resource-items.sql dans Supabase.'
      : msg.includes('resource_categories')
        ? 'Table resource_categories introuvable. Exécute scripts/create-resource-categories.sql dans Supabase.'
        : msg || 'Impossible de charger les ressources.'
    items.value = []
    categories.value = []
  } finally {
    isLoading.value = false
  }
}

async function submitForm() {
  if (!userId.value || isSaving.value) return

  const payload = formToResourcePayload(resourceForm)
  if (!payload.name) {
    formError.value = 'Indique un nom pour la ressource.'
    return
  }

  isSaving.value = true
  formError.value = ''
  try {
    if (isEditMode.value) {
      await updateResourceItem(supabase, userId.value, editingItemId.value, payload)
    } else {
      await createResourceItem(supabase, userId.value, payload)
    }
    clearResourceDraft()
    closeForm()
    await loadData()
  } catch (err) {
    console.error(err)
    formError.value = err.message || 'Impossible d’enregistrer cette ressource.'
  } finally {
    isSaving.value = false
  }
}

function askDeleteItem(item) {
  pendingDeleteItem.value = item
}

function cancelDeleteItem() {
  if (isDeletingId.value) return
  pendingDeleteItem.value = null
}

async function confirmDeleteItem() {
  const item = pendingDeleteItem.value
  if (!userId.value || !item?.id || isDeletingId.value) return

  isDeletingId.value = item.id
  loadError.value = ''
  try {
    await deleteResourceItem(supabase, userId.value, item.id)
    pendingDeleteItem.value = null
    if (editingItemId.value === item.id) {
      closeForm()
    }
    await loadData()
  } catch (err) {
    console.error(err)
    loadError.value = err.message || 'Impossible de supprimer cette ressource.'
  } finally {
    isDeletingId.value = null
  }
}

function onCategoryCommit(name) {
  resourceForm.category = name ?? ''
}

onMounted(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) userId.value = user.id
})

watch(userId, (id) => {
  if (id) loadData()
})

watch(sortMode, (mode) => {
  if (mode === RESOURCE_SORT_MODES.ALPHA && (browseTag.value || browseCategory.value)) {
    goToBrowseTags()
  }
})

watch([browseTag, browseCategory, groupedSections, showFlatList], () => {
  if (showFlatList.value) return
  if (browseTag.value && !activeTagSection.value) {
    goToBrowseTags()
    return
  }
  if (browseCategory.value && !activeCategoryGroup.value) {
    goToBrowseCategories()
  }
})
</script>

<template>
  <div class="resources-wrapper">
    <header class="resources-header">
      <h1 class="resources-title">{{ pageTitle }}</h1>
      <p class="resources-subtitle">{{ resourcesSubtitle }}</p>
    </header>

    <div class="resources-toolbar">
      <button
        type="button"
        class="resources-add-btn"
        :disabled="formOpen && !isEditMode"
        @click="openForm"
      >
        Ajouter une ressource
      </button>
    </div>

    <form
      v-if="formOpen"
      ref="formCardRef"
      class="resources-form-card"
      @submit.prevent="submitForm"
    >
      <h2 class="resources-form-title">
        {{ isEditMode ? 'Modifier la ressource' : 'Nouvelle ressource' }}
      </h2>

      <div class="resources-form-grid">
        <label class="resources-form-field resources-form-field--full">
          <span>Nom</span>
          <input
            ref="formNameInputRef"
            v-model="resourceForm.name"
            type="text"
            class="resources-form-input"
            maxlength="200"
            required
            autofocus
          />
        </label>

        <div class="resources-form-pair">
          <label class="resources-form-field">
            <span>Catégorie</span>
            <ReadingCollectionCombobox
              v-model="resourceForm.category"
              :collections="categories"
              placeholder="Restaurants, Outils, Idées…"
              empty-message="Aucune catégorie"
              toggle-aria-label="Ouvrir les catégories"
              appearance="form"
              @commit="onCategoryCommit"
            />
          </label>

          <div class="resources-form-field">
            <label class="resources-form-field__control-label" for="resource-tags-input">Tags</label>
            <input
              id="resource-tags-input"
              v-model="resourceForm.tagsInput"
              type="text"
              class="resources-form-input"
              maxlength="500"
              placeholder="italien, vegan, Paris…"
            />
            <span class="resources-form-hint">Sépare les tags par des virgules. Le 1er tag est le tag principal.</span>
          </div>
        </div>

        <label class="resources-form-field">
          <span>Lien (facultatif)</span>
          <input
            v-model="resourceForm.link"
            type="text"
            class="resources-form-input"
            maxlength="500"
            inputmode="url"
            autocomplete="url"
            placeholder="https://… ou example.com"
          />
        </label>

        <label class="resources-form-field">
          <span>Adresse (facultatif)</span>
          <input
            v-model="resourceForm.address"
            type="text"
            class="resources-form-input"
            maxlength="300"
            placeholder="12 rue…, 75000 Paris"
          />
        </label>

        <label class="resources-form-field">
          <span>Marque (facultatif)</span>
          <input
            v-model="resourceForm.brand"
            type="text"
            class="resources-form-input"
            maxlength="120"
            placeholder="Nom de la marque"
          />
        </label>

        <label class="resources-form-field resources-form-field--full">
          <span>Commentaire / avis</span>
          <textarea
            v-model="resourceForm.comments"
            class="resources-form-textarea"
            rows="4"
            maxlength="4000"
            placeholder="Pourquoi tu la gardes, ce que tu en penses…"
          />
        </label>
      </div>

      <p v-if="formError" class="resources-form-error">{{ formError }}</p>

      <div class="resources-form-actions">
        <button type="submit" class="resources-submit-btn" :disabled="isSaving">
          {{ isSaving ? 'Enregistrement…' : isEditMode ? 'Enregistrer' : 'Ajouter' }}
        </button>
        <button type="button" class="resources-cancel-btn" :disabled="isSaving" @click="closeForm">
          Annuler
        </button>
      </div>
    </form>

    <section class="resources-card">
      <div v-if="loadError" class="resources-error">{{ loadError }}</div>
      <div v-if="isLoading" class="resources-loading">Chargement…</div>

      <template v-else>
        <div v-if="items.length > 0" class="resources-list-toolbar">
          <label class="resources-search">
            <span class="resources-search__label">Rechercher</span>
            <input
              v-model="searchQuery"
              type="search"
              class="resources-search__input"
              placeholder="Nom, tag, catégorie, marque…"
              autocomplete="off"
            />
          </label>

          <div class="resources-list-toolbar__filters">
            <button
              type="button"
              class="resources-filter-btn"
              :class="{ 'resources-filter-btn--active': hasActiveDisplayFilters }"
              @click="filterOpen = true"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M3 4h18v2l-7 8v5l-4 1v-6L3 6V4z" />
              </svg>
              Filtres
              <span v-if="activeFilterPills.length > 0" class="resources-filter-btn__count">
                {{ activeFilterPills.length }}
              </span>
            </button>
          </div>
        </div>

        <div v-if="activeFilterPills.length > 0" class="resources-active-filters">
          <button
            v-for="pill in activeFilterPills"
            :key="pill.id"
            type="button"
            class="resources-active-filter-pill"
            @click="filterOpen = true"
          >
            <span>{{ pill.label }}</span>
            <span
              class="resources-active-filter-pill__remove"
              role="button"
              tabindex="0"
              aria-label="Retirer ce filtre"
              @click.stop="removeFilterPill(pill)"
              @keydown.enter.stop.prevent="removeFilterPill(pill)"
              @keydown.space.stop.prevent="removeFilterPill(pill)"
            >
              ✕
            </span>
          </button>
        </div>

        <div v-if="items.length === 0" class="resources-empty">
          Aucune ressource pour le moment. Ajoute ta première fiche ci-dessus.
        </div>
        <div v-else-if="filteredItems.length === 0" class="resources-empty">
          Aucune ressource ne correspond à ta recherche ou à tes filtres.
        </div>

        <div v-else-if="showFlatList" class="resources-list resources-list--flat">
          <article v-for="item in displayedResourceItems" :key="item.id" class="resources-item">
            <div class="resources-item__header">
              <h4 class="resources-item__name">{{ item.name }}</h4>
              <div class="resources-item__actions">
                <button
                  type="button"
                  class="resources-item__action"
                  title="Modifier"
                  aria-label="Modifier"
                  @click="openEditForm(item)"
                >
                  ✎
                </button>
                <button
                  type="button"
                  class="resources-item__action resources-item__action--danger"
                  title="Supprimer"
                  aria-label="Supprimer"
                  @click="askDeleteItem(item)"
                >
                  ✕
                </button>
              </div>
            </div>

            <p v-if="item.category?.trim()" class="resources-item__category">
              {{ item.category }}
            </p>

            <div v-if="item.tags?.length" class="resources-item__tags">
              <span v-for="tag in item.tags" :key="tag" class="resources-tag-pill">{{ tag }}</span>
            </div>

            <dl class="resources-item__meta">
              <div v-if="item.brand" class="resources-item__meta-row">
                <dt>Marque</dt>
                <dd>{{ item.brand }}</dd>
              </div>
              <div v-if="item.address" class="resources-item__meta-row">
                <dt>Adresse</dt>
                <dd>{{ item.address }}</dd>
              </div>
              <div v-if="item.link" class="resources-item__meta-row">
                <dt>Lien</dt>
                <dd>
                  <a
                    :href="resourceLinkHref(item.link)"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="resources-item__link"
                  >
                    {{ item.link }}
                  </a>
                </dd>
              </div>
            </dl>

            <div v-if="item.comments?.trim()" class="resources-item__comments">
              <span class="resources-item__comments-label">Commentaire</span>
              <p>{{ item.comments }}</p>
            </div>
          </article>
        </div>

        <div v-else class="resources-browse">
          <nav
            v-if="browseLevel !== 'tags'"
            class="resources-breadcrumb"
            aria-label="Fil d'Ariane ressources"
          >
            <button type="button" class="resources-breadcrumb__link" @click="goToBrowseTags">
              Tags
            </button>
            <span class="resources-breadcrumb__sep" aria-hidden="true">›</span>
            <button
              v-if="browseLevel === 'resources'"
              type="button"
              class="resources-breadcrumb__link"
              @click="goToBrowseCategories"
            >
              {{ browseTag }}
            </button>
            <span v-else class="resources-breadcrumb__current">{{ browseTag }}</span>
            <template v-if="browseLevel === 'resources'">
              <span class="resources-breadcrumb__sep" aria-hidden="true">›</span>
              <span class="resources-breadcrumb__current">{{ browseCategory }}</span>
            </template>
          </nav>

          <header class="resources-browse-header">
            <h2 class="resources-browse-title">{{ browseSectionTitle }}</h2>
            <p class="resources-browse-hint">{{ browseSectionHint }}</p>
          </header>

          <div v-if="browseLevel === 'tags'" class="resources-browse-grid">
            <button
              v-for="tagItem in tagBrowseItems"
              :key="tagItem.tag"
              type="button"
              class="resources-browse-card"
              @click="openBrowseTag(tagItem.tag)"
            >
              <span class="resources-browse-card__title">{{ tagItem.tag }}</span>
              <span class="resources-browse-card__meta">
                {{ formatBrowseCount(tagItem.categoryCount, 'catégorie', 'catégories') }}
                ·
                {{ formatBrowseCount(tagItem.resourceCount, 'ressource', 'ressources') }}
              </span>
            </button>
          </div>

          <div v-else-if="browseLevel === 'categories'" class="resources-browse-grid">
            <button
              v-for="categoryItem in categoryBrowseItems"
              :key="categoryItem.categoryName"
              type="button"
              class="resources-browse-card"
              @click="openBrowseCategory(categoryItem.categoryName)"
            >
              <span class="resources-browse-card__title">{{ categoryItem.categoryName }}</span>
              <span class="resources-browse-card__meta">
                {{ formatBrowseCount(categoryItem.resourceCount, 'ressource', 'ressources') }}
              </span>
            </button>
          </div>

          <div v-else class="resources-list">
            <article v-for="item in displayedResourceItems" :key="item.id" class="resources-item">
              <div class="resources-item__header">
                <h4 class="resources-item__name">{{ item.name }}</h4>
                <div class="resources-item__actions">
                  <button
                    type="button"
                    class="resources-item__action"
                    title="Modifier"
                    aria-label="Modifier"
                    @click="openEditForm(item)"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    class="resources-item__action resources-item__action--danger"
                    title="Supprimer"
                    aria-label="Supprimer"
                    @click="askDeleteItem(item)"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div v-if="item.tags?.length" class="resources-item__tags">
                <span v-for="tag in item.tags" :key="tag" class="resources-tag-pill">{{ tag }}</span>
              </div>

              <dl class="resources-item__meta">
                <div v-if="item.brand" class="resources-item__meta-row">
                  <dt>Marque</dt>
                  <dd>{{ item.brand }}</dd>
                </div>
                <div v-if="item.address" class="resources-item__meta-row">
                  <dt>Adresse</dt>
                  <dd>{{ item.address }}</dd>
                </div>
                <div v-if="item.link" class="resources-item__meta-row">
                  <dt>Lien</dt>
                  <dd>
                    <a
                      :href="resourceLinkHref(item.link)"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="resources-item__link"
                    >
                      {{ item.link }}
                    </a>
                  </dd>
                </div>
              </dl>

              <div v-if="item.comments?.trim()" class="resources-item__comments">
                <span class="resources-item__comments-label">Commentaire</span>
                <p>{{ item.comments }}</p>
              </div>
            </article>
          </div>
        </div>
      </template>
    </section>

    <ResourcesFilterPopover
      :open="filterOpen"
      :sort-mode="sortMode"
      :selected-tags="selectedTags"
      :selected-categories="selectedCategories"
      :available-tags="filterOptions.tags"
      :available-categories="filterOptions.categories"
      :has-untagged="filterOptions.hasUntagged"
      :has-uncategorized="filterOptions.hasUncategorized"
      @close="filterOpen = false"
      @update:sort-mode="sortMode = $event"
      @update:selected-tags="selectedTags = $event"
      @update:selected-categories="selectedCategories = $event"
      @reset="resetDisplayFilters"
    />

    <div
      v-if="pendingDeleteItem"
      class="resources-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resources-delete-title"
      @click.self="cancelDeleteItem"
    >
      <div class="resources-modal">
        <h2 id="resources-delete-title" class="resources-modal__title">Supprimer cette ressource ?</h2>
        <p class="resources-modal__body">
          « {{ pendingDeleteItem.name }} » sera définitivement supprimée.
        </p>
        <div class="resources-modal__actions">
          <button
            type="button"
            class="resources-submit-btn resources-submit-btn--danger"
            :disabled="Boolean(isDeletingId)"
            @click="confirmDeleteItem"
          >
            {{ isDeletingId ? 'Suppression…' : 'Supprimer' }}
          </button>
          <button
            type="button"
            class="resources-cancel-btn"
            :disabled="Boolean(isDeletingId)"
            @click="cancelDeleteItem"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.resources-wrapper {
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
}

.resources-header {
  margin-bottom: 1rem;
  text-align: center;
}

.resources-title {
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  margin: 0;
}

.resources-subtitle {
  margin: 0.5rem 0 0;
  color: #6c757d;
  font-size: 1rem;
}

.resources-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.resources-add-btn {
  padding: 0.75rem 1rem;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  font-weight: 800;
  font-size: 0.95rem;
  cursor: pointer;
}

.resources-add-btn:hover:not(:disabled) {
  filter: brightness(1.03);
}

.resources-add-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.resources-search {
  flex: 1 1 14rem;
  min-width: 0;
  display: grid;
  gap: 0.35rem;
}

.resources-list-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.resources-list-toolbar__filters {
  flex-shrink: 0;
}

.resources-filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 0.85rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.85);
  color: #6b4f7c;
  font-weight: 800;
  font-size: 0.88rem;
  cursor: pointer;
}

.resources-filter-btn svg {
  width: 1rem;
  height: 1rem;
}

.resources-filter-btn--active {
  border-color: rgba(173, 129, 190, 0.55);
  background: rgba(173, 129, 190, 0.18);
}

.resources-filter-btn__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: rgba(173, 129, 190, 0.35);
  font-size: 0.72rem;
}

.resources-active-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-bottom: 0.85rem;
}

.resources-active-filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.55rem;
  border-radius: 999px;
  border: 1px solid rgba(173, 129, 190, 0.45);
  background: rgba(173, 129, 190, 0.14);
  color: #6b4f7c;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.resources-active-filter-pill__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 999px;
  font-size: 0.72rem;
  line-height: 1;
}

.resources-active-filter-pill__remove:hover {
  background: rgba(173, 129, 190, 0.25);
}

.resources-search__label {
  font-size: 0.82rem;
  font-weight: 800;
  color: #6c757d;
}

.resources-search__input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.6rem 0.75rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.85);
  color: #2c3e50;
  font: inherit;
  font-weight: 600;
}

.resources-form-card {
  margin-bottom: 1.25rem;
  padding: 1.25rem;
  border-radius: 16px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(12px);
}

.resources-form-title {
  margin: 0 0 1rem;
  font-size: 1.15rem;
  font-weight: 800;
  color: #6b4f7c;
}

.resources-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}

.resources-form-field {
  display: grid;
  gap: 0.35rem;
  min-width: 0;
}

.resources-form-field--full {
  grid-column: 1 / -1;
}

.resources-form-pair {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
  align-items: start;
}

.resources-form-field__control-label {
  font-size: 0.82rem;
  font-weight: 800;
  color: #6c757d;
}

.resources-form-field > span:first-child {
  font-size: 0.82rem;
  font-weight: 800;
  color: #6c757d;
}

.resources-form-input,
.resources-form-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0.6rem 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.9);
  color: #2c3e50;
  font: inherit;
}

.resources-form-textarea {
  resize: vertical;
  min-height: 5.5rem;
}

.resources-form-hint {
  font-size: 0.78rem;
  color: #8b7a96;
}

.resources-form-error {
  margin: 0.75rem 0 0;
  color: #b02a37;
  font-size: 0.9rem;
}

.resources-form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 1rem;
}

.resources-submit-btn,
.resources-cancel-btn {
  padding: 0.65rem 1rem;
  border-radius: 10px;
  font-weight: 800;
  cursor: pointer;
  border: none;
}

.resources-submit-btn {
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
}

.resources-submit-btn--danger {
  background: linear-gradient(135deg, #f08090, #dc3545);
}

.resources-cancel-btn {
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(213, 181, 234, 0.35);
  color: #6b4f7c;
}

.resources-card {
  width: 100%;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 16px;
  padding: 1.25rem;
}

.resources-loading,
.resources-empty {
  padding: 1rem 0;
  text-align: center;
  color: #6c757d;
}

.resources-error {
  margin-bottom: 0.75rem;
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  background: rgba(220, 53, 69, 0.1);
  color: #b02a37;
  font-size: 0.9rem;
}

.resources-sections {
  display: grid;
  gap: 1.5rem;
}

.resources-browse {
  display: grid;
  gap: 1rem;
}

.resources-breadcrumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.88rem;
}

.resources-breadcrumb__link {
  border: none;
  background: transparent;
  padding: 0;
  color: #7a4f8f;
  font-weight: 800;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 0.12em;
}

.resources-breadcrumb__link:hover {
  color: #5f3a72;
}

.resources-breadcrumb__sep {
  color: #8b7a96;
}

.resources-breadcrumb__current {
  color: #6b4f7c;
  font-weight: 800;
}

.resources-browse-header {
  display: grid;
  gap: 0.25rem;
}

.resources-browse-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: #6b4f7c;
}

.resources-browse-hint {
  margin: 0;
  font-size: 0.88rem;
  color: #6c757d;
}

.resources-browse-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
  gap: 0.75rem;
}

.resources-browse-card {
  display: grid;
  gap: 0.35rem;
  width: 100%;
  padding: 0.9rem 1rem;
  border-radius: 14px;
  border: 1px solid rgba(173, 129, 190, 0.28);
  background: linear-gradient(145deg, rgba(213, 181, 234, 0.16), rgba(173, 129, 190, 0.08));
  text-align: left;
  cursor: pointer;
  transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
}

.resources-browse-card:hover {
  transform: translateY(-1px);
  border-color: rgba(173, 129, 190, 0.45);
  box-shadow: 0 8px 20px rgba(61, 47, 74, 0.08);
}

.resources-browse-card__title {
  font-size: 1rem;
  font-weight: 800;
  color: #6b4f7c;
}

.resources-browse-card__meta {
  font-size: 0.82rem;
  color: #8b7a96;
}

.resources-tag-section {
  padding: 0.85rem 0.85rem 1rem;
  border-radius: 14px;
  background: linear-gradient(145deg, rgba(213, 181, 234, 0.16), rgba(173, 129, 190, 0.08));
  border: 1px solid rgba(173, 129, 190, 0.22);
}

.resources-tag-title {
  margin: 0 0 0.85rem;
  font-size: 1.05rem;
  font-weight: 800;
  color: #6b4f7c;
}

.resources-category-group + .resources-category-group {
  margin-top: 1rem;
}

.resources-category-title {
  margin: 0 0 0.55rem;
  font-size: 0.88rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: #8b7a96;
  text-transform: uppercase;
}

.resources-list {
  display: grid;
  gap: 0.65rem;
}

.resources-list--flat {
  margin-top: 0;
}

.resources-item {
  padding: 0.85rem 0.9rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(213, 181, 234, 0.25);
}

.resources-item__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.resources-item__name {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: #2c3e50;
}

.resources-item__category {
  margin: 0.35rem 0 0;
  font-size: 0.82rem;
  font-weight: 700;
  color: #8b7a96;
}

.resources-item__actions {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

.resources-item__action {
  width: 1.85rem;
  height: 1.85rem;
  border: none;
  border-radius: 8px;
  background: rgba(213, 181, 234, 0.2);
  color: #6b4f7c;
  cursor: pointer;
  font-size: 0.95rem;
}

.resources-item__action--danger {
  color: #b02a37;
}

.resources-item__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.55rem;
}

.resources-tag-pill {
  display: inline-flex;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: rgba(173, 129, 190, 0.18);
  color: #6b4f7c;
  font-size: 0.75rem;
  font-weight: 700;
}

.resources-item__meta {
  margin: 0.55rem 0 0;
  display: grid;
  gap: 0.35rem;
}

.resources-item__meta-row {
  display: grid;
  grid-template-columns: 5.5rem 1fr;
  gap: 0.5rem;
  font-size: 0.88rem;
}

.resources-item__meta-row dt {
  margin: 0;
  font-weight: 800;
  color: #6c757d;
}

.resources-item__meta-row dd {
  margin: 0;
  color: #2c3e50;
}

.resources-item__link {
  color: #7a4f8f;
  text-decoration: underline;
  text-underline-offset: 0.12em;
  word-break: break-all;
}

.resources-item__link:hover {
  color: #5f3a72;
}

.resources-item__comments {
  margin-top: 0.65rem;
  padding-top: 0.65rem;
  border-top: 1px dashed rgba(173, 129, 190, 0.35);
}

.resources-item__comments-label {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.78rem;
  font-weight: 800;
  color: #8b7a96;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.resources-item__comments p {
  margin: 0;
  white-space: pre-wrap;
  color: #2c3e50;
  font-size: 0.92rem;
  line-height: 1.45;
}

.resources-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(44, 36, 52, 0.45);
}

.resources-modal {
  width: min(100%, 24rem);
  padding: 1.25rem;
  border-radius: 16px;
  background: #fff;
  border: 1px solid rgba(213, 181, 234, 0.35);
}

.resources-modal__title {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
  font-weight: 800;
  color: #2c3e50;
}

.resources-modal__body {
  margin: 0 0 1rem;
  color: #6c757d;
}

.resources-modal__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}

@media (max-width: 720px) {
  .resources-form-grid {
    grid-template-columns: 1fr;
  }

  .resources-form-pair {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .resources-item__meta-row {
    grid-template-columns: 1fr;
    gap: 0.15rem;
  }
}

@media (prefers-color-scheme: dark) {
  .resources-title {
    color: #f0e8f8;
  }

  .resources-subtitle,
  .resources-loading,
  .resources-empty,
  .resources-search__label,
  .resources-form-field > span:first-child,
  .resources-form-field__control-label {
    color: #adb5bd;
  }

  .resources-form-card,
  .resources-card,
  .resources-modal {
    background: rgba(35, 30, 48, 0.75);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .resources-form-title,
  .resources-tag-title,
  .resources-browse-title,
  .resources-breadcrumb__current {
    color: #e8dcf5;
  }

  .resources-breadcrumb__link {
    color: #d5b5ea;
  }

  .resources-breadcrumb__link:hover {
    color: #f0e8f8;
  }

  .resources-browse-hint,
  .resources-breadcrumb__sep,
  .resources-browse-card__meta {
    color: #c5b8d2;
  }

  .resources-browse-card {
    background: linear-gradient(145deg, rgba(173, 129, 190, 0.18), rgba(61, 47, 74, 0.55));
    border-color: rgba(213, 181, 234, 0.22);
  }

  .resources-browse-card__title {
    color: #e8dcf5;
  }

  .resources-browse-card:hover {
    border-color: rgba(213, 181, 234, 0.35);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
  }

  .resources-form-input,
  .resources-form-textarea,
  .resources-search__input,
  .resources-cancel-btn,
  .resources-filter-btn {
    background: rgba(35, 30, 48, 0.9);
    border-color: rgba(213, 181, 234, 0.28);
    color: #f0e8f8;
  }

  .resources-filter-btn--active {
    background: rgba(173, 129, 190, 0.24);
  }

  .resources-active-filter-pill {
    background: rgba(173, 129, 190, 0.22);
    border-color: rgba(213, 181, 234, 0.35);
    color: #e8dcf5;
  }

  .resources-active-filter-pill__remove:hover {
    background: rgba(173, 129, 190, 0.35);
  }

  .resources-tag-section {
    background: linear-gradient(145deg, rgba(173, 129, 190, 0.18), rgba(61, 47, 74, 0.55));
    border-color: rgba(213, 181, 234, 0.22);
  }

  .resources-item {
    background: rgba(42, 36, 56, 0.85);
    border-color: rgba(213, 181, 234, 0.18);
  }

  .resources-item__name,
  .resources-item__meta-row dd,
  .resources-item__comments p,
  .resources-modal__title {
    color: #f0e8f8;
  }

  .resources-category-title,
  .resources-item__comments-label,
  .resources-item__category,
  .resources-form-hint {
    color: #c5b8d2;
  }

  .resources-tag-pill {
    background: rgba(173, 129, 190, 0.28);
    color: #e8dcf5;
  }

  .resources-item__link {
    color: #d5b5ea;
  }

  .resources-error {
    background: rgba(220, 53, 69, 0.18);
    color: #ff8a95;
  }
}
</style>
