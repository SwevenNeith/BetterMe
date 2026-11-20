<script setup>
import { computed, onMounted, ref } from 'vue'
import { APP_PAGE_IDS } from '../constants/common/appPages.js'
import { COURSES_VIEW_MODE } from '../constants/courses/courses.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import { useCourses } from '../composables/useCourses.js'
import { resolveSessionUser } from '../utils/auth/sessionUser.js'
import CoursesQuickAdd from '../components/courses/CoursesQuickAdd.vue'
import CoursesVitrineView from '../components/courses/CoursesVitrineView.vue'
import CoursesMagasinMode from '../components/courses/CoursesMagasinMode.vue'
import CoursesArticleFormModal from '../components/courses/CoursesArticleFormModal.vue'
import CoursesManageModal from '../components/courses/CoursesManageModal.vue'

defineOptions({ name: 'CoursesView' })

const { pageTitle } = usePageDisplayLabel(APP_PAGE_IDS.COURSES, undefined, {
  setDocumentTitle: true,
})

const courses = useCourses()
const {
  loading,
  saving,
  error,
  fromCache,
  magasins,
  categories,
  viewMode,
  groupBy,
  selectedMagasinId,
  renewThresholdDays,
  renewSectionOpen,
  renewArticles,
  vitrineGroups,
  magasinModeGroups,
  magasinModeChecked,
  magasinModeProgress,
  load,
  quickAdd,
  autocompleteSuggestions,
  addArticle,
  editArticle,
  removeArticle,
  racheter,
  setArticleStatut,
  finishShopping,
  pendingFinishArticles,
  canFinishShopping,
  clearBoughtBag,
  copyExportText,
  addMagasin,
  editMagasin,
  removeMagasin,
  reorderMagasins,
  addCategorie,
  editCategorie,
  removeCategorie,
  reorderCategories,
} = courses

const suggestions = ref([])
const formOpen = ref(false)
const formArticle = ref(null)
const manageOpen = ref(false)
const bagOpen = ref(false)
const exportFlash = ref('')
const toast = ref('')

const isVitrine = computed(() => viewMode.value === COURSES_VIEW_MODE.VITRINE)

onMounted(async () => {
  const user = await resolveSessionUser()
  if (user?.id) await load(user.id)
})

function onQuickQuery(q) {
  suggestions.value = autocompleteSuggestions(q)
}

async function onQuickSubmit(nom) {
  await quickAdd(nom)
  suggestions.value = []
}

async function onQuickPick(item) {
  await quickAdd(item.nom)
  suggestions.value = []
}

function openNewArticle() {
  formArticle.value = null
  formOpen.value = true
}

function openArticle(article) {
  formArticle.value = article
  formOpen.value = true
}

async function onSaveArticle({ id, payload }) {
  if (id) await editArticle(id, payload)
  else await addArticle(payload)
  formOpen.value = false
  formArticle.value = null
}

async function onDeleteArticle(id) {
  await removeArticle(id)
  formOpen.value = false
  formArticle.value = null
}

async function onRacheter(article) {
  await racheter(article.id)
  showToast('Article remis dans « à acheter ».')
}

async function onToggleShop(article, statut) {
  await setArticleStatut(article.id, statut)
}

async function onFinish({ updateDurabilite }) {
  await finishShopping({ updateDurabilite })
  bagOpen.value = true
  showToast('Courses enregistrées dans l’historique.')
}

async function onClearBag() {
  await clearBoughtBag(selectedMagasinId.value)
  showToast('Sac vidé (suivi de durée de vie conservé).')
}

async function onExport() {
  try {
    await copyExportText({
      magasinId:
        viewMode.value === COURSES_VIEW_MODE.MAGASIN ? selectedMagasinId.value : null,
    })
    exportFlash.value = 'Liste copiée'
    window.setTimeout(() => {
      exportFlash.value = ''
    }, 2000)
  } catch (err) {
    console.error(err)
    showToast('Impossible de copier la liste.')
  }
}

function showToast(message) {
  toast.value = message
  window.setTimeout(() => {
    if (toast.value === message) toast.value = ''
  }, 2800)
}
</script>

<template>
  <div class="courses-page">
    <header class="courses-page__header">
      <h1 class="courses-page__title">{{ pageTitle }}</h1>
      <p class="courses-page__subtitle">
        Ta liste en vitrine, regroupée par magasin — sans photos, juste des icônes.
      </p>
    </header>

    <div class="courses-page__header-actions">
      <button type="button" class="courses-page__ghost" @click="manageOpen = true">
        Magasins & rayons
      </button>
      <button type="button" class="courses-page__ghost" @click="onExport">
        {{ exportFlash || 'Exporter' }}
      </button>
      <button type="button" class="courses-page__primary" @click="openNewArticle">
        + Article
      </button>
    </div>

    <p v-if="fromCache && loading" class="courses-page__cache" role="status">
      Affichage de la dernière liste en cache…
    </p>
    <p v-if="error" class="courses-page__error" role="alert">{{ error }}</p>
    <p v-if="toast" class="courses-page__toast" role="status">{{ toast }}</p>

    <CoursesQuickAdd
      :suggestions="suggestions"
      :disabled="saving"
      @query="onQuickQuery"
      @submit="onQuickSubmit"
      @pick="onQuickPick"
    />

    <div class="courses-page__modes" role="group" aria-label="Mode d’affichage">
      <button
        type="button"
        class="courses-page__mode"
        :class="{ 'is-active': isVitrine }"
        :aria-pressed="isVitrine"
        @click="viewMode = COURSES_VIEW_MODE.VITRINE"
      >
        Vitrine
      </button>
      <button
        type="button"
        class="courses-page__mode"
        :class="{ 'is-active': !isVitrine }"
        :aria-pressed="!isVitrine"
        @click="viewMode = COURSES_VIEW_MODE.MAGASIN"
      >
        Mode magasin
      </button>
    </div>

    <CoursesVitrineView
      v-if="isVitrine"
      :groups="vitrineGroups"
      :renew-articles="renewArticles"
      :renew-open="renewSectionOpen"
      :renew-threshold-days="renewThresholdDays"
      :group-by="groupBy"
      :loading="loading && !vitrineGroups.length"
      @update:group-by="groupBy = $event"
      @update:renew-open="renewSectionOpen = $event"
      @update:renew-threshold-days="renewThresholdDays = $event"
      @open-article="openArticle"
      @racheter="onRacheter"
    />

    <CoursesMagasinMode
      v-else
      :magasins="magasins"
      :selected-magasin-id="selectedMagasinId"
      :groups="magasinModeGroups"
      :checked-articles="magasinModeChecked"
      :progress="magasinModeProgress"
      :can-finish="canFinishShopping"
      :pending-finish-articles="pendingFinishArticles"
      :bag-open="bagOpen"
      :saving="saving"
      @update:selected-magasin-id="selectedMagasinId = $event"
      @update:bag-open="bagOpen = $event"
      @toggle="onToggleShop"
      @finish="onFinish"
      @clear-bag="onClearBag"
      @open-article="openArticle"
    />

    <CoursesArticleFormModal
      :open="formOpen"
      :article="formArticle"
      :magasins="magasins"
      :categories="categories"
      :saving="saving"
      @close="formOpen = false"
      @save="onSaveArticle"
      @delete="onDeleteArticle"
    />

    <CoursesManageModal
      :open="manageOpen"
      :magasins="magasins"
      :categories="categories"
      :saving="saving"
      @close="manageOpen = false"
      @add-magasin="addMagasin"
      @edit-magasin="editMagasin"
      @delete-magasin="removeMagasin"
      @reorder-magasins="reorderMagasins"
      @add-categorie="addCategorie"
      @edit-categorie="editCategorie"
      @delete-categorie="removeCategorie"
      @reorder-categories="reorderCategories"
    />
  </div>
</template>

<style scoped>
.courses-page {
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
}

.courses-page__header {
  margin-bottom: 1.25rem;
  text-align: center;
}

.courses-page__title {
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  margin: 0;
}

.courses-page__subtitle {
  margin: 0.5rem 0 0;
  color: #6c757d;
  font-size: 1rem;
}

.courses-page__header-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.courses-page__ghost,
.courses-page__primary,
.courses-page__mode {
  min-height: 44px;
  padding: 0 0.9rem;
  border-radius: 12px;
  font-weight: 750;
  cursor: pointer;
}

.courses-page__ghost {
  border: 1px solid color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
  background: color-mix(in srgb, var(--color-background) 88%, var(--color-primary) 12%);
  color: var(--color-text);
}

.courses-page__primary {
  border: none;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  color: #2c3e50;
}

.courses-page__modes {
  display: flex;
  width: fit-content;
  max-width: 100%;
  margin: 0 auto 1.1rem;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  overflow: hidden;
  background: var(--color-background);
}

.courses-page__mode {
  border: none;
  background: transparent;
  color: var(--color-text-light);
  border-radius: 0;
}

.courses-page__mode.is-active {
  background: color-mix(in srgb, var(--color-primary) 45%, transparent);
  color: var(--color-text);
}

.courses-page__cache,
.courses-page__toast {
  margin: 0 0 0.75rem;
  padding: 0.65rem 0.85rem;
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-secondary) 22%, transparent);
  color: var(--color-text);
  font-size: 0.88rem;
}

.courses-page__error {
  margin: 0 0 0.75rem;
  padding: 0.65rem 0.85rem;
  border-radius: 10px;
  background: color-mix(in srgb, #e8b4b4 35%, transparent);
  color: var(--color-text);
  font-size: 0.88rem;
}

@media (prefers-color-scheme: dark) {
  .courses-page__title {
    color: #f0e8f8;
  }

  .courses-page__subtitle {
    color: #adb5bd;
  }
}
</style>
