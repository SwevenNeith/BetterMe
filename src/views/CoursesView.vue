<script setup>
import { onMounted, ref } from 'vue'
import { APP_PAGE_IDS } from '../constants/common/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import { useCourses } from '../composables/useCourses.js'
import { resolveSessionUser } from '../utils/auth/sessionUser.js'
import CoursesQuickAdd from '../components/courses/CoursesQuickAdd.vue'
import CoursesListsModal from '../components/courses/CoursesListsModal.vue'
import CoursesVitrineView from '../components/courses/CoursesVitrineView.vue'
import AppConfirmDialog from '../components/common/AppConfirmDialog.vue'
import CoursesArticleFormModal from '../components/courses/CoursesArticleFormModal.vue'
import CoursesArticleDetailModal from '../components/courses/CoursesArticleDetailModal.vue'
import CoursesPickListModal from '../components/courses/CoursesPickListModal.vue'
import CoursesGroupEditModal from '../components/courses/CoursesGroupEditModal.vue'

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
  listes,
  articles,
  groupBy,
  selectedListeId,
  selectedListe,
  renewThresholdDays,
  renewSectionOpen,
  renewArticles,
  vitrineGroups,
  load,
  quickAdd,
  autocompleteSuggestions,
  addArticle,
  editArticle,
  removeArticle,
  addArticleToListe,
  markPurchased,
  enrichArticle,
  racheter,
  copyExportText,
  editMagasin,
  removeMagasin,
  editCategorie,
  removeCategorie,
  addListe,
  editListe,
  removeListe,
  closeListeById,
  reporterRestantsVers,
  clearListeFilter,
} = courses

const suggestions = ref([])
const formOpen = ref(false)
const formArticle = ref(null)
const detailOpen = ref(false)
const detailArticle = ref(null)
const pickListOpen = ref(false)
const pickListArticle = ref(null)
const listsOpen = ref(false)
const exportFlash = ref('')
const toast = ref('')
const groupEditOpen = ref(false)
const groupEditKind = ref('magasin')
const groupEditEntity = ref(null)
const confirmState = ref(null)

function showDetail(article) {
  if (!article) return
  detailArticle.value = enrichArticle(article)
  detailOpen.value = true
}

function refreshDetail(articleId) {
  const fresh = articles.value.find((a) => a.id === articleId)
  if (fresh) detailArticle.value = enrichArticle(fresh)
}

onMounted(async () => {
  const user = await resolveSessionUser()
  if (user?.id) await load(user.id)
})

function onQuickQuery(q) {
  suggestions.value = autocompleteSuggestions(q)
}

async function onQuickSubmit(nom) {
  const row = await quickAdd(nom)
  suggestions.value = []
  if (row) showDetail(row)
}

async function onQuickPick(item) {
  const row = await quickAdd(item.nom)
  suggestions.value = []
  if (row) showDetail(row)
}

function openNewArticle() {
  formArticle.value = null
  formOpen.value = true
}

function openArticle(article) {
  showDetail(article)
}

function openEditFromDetail(article) {
  formArticle.value = article
  detailOpen.value = false
  formOpen.value = true
}

async function onSaveArticle({ id, payload }) {
  let row
  if (id) {
    row = await editArticle(id, payload)
  } else {
    row = await addArticle({ ...payload, liste_id: null })
  }
  formOpen.value = false
  formArticle.value = null
  if (row) showDetail(row)
}

async function onDeleteArticle(id) {
  await removeArticle(id)
  formOpen.value = false
  formArticle.value = null
  detailOpen.value = false
  detailArticle.value = null
}

function openPickList(article) {
  pickListArticle.value = article
  pickListOpen.value = true
}

async function onPickListSelect(listeId) {
  const article = pickListArticle.value
  if (!article?.id) return
  await addArticleToListe(article.id, listeId)
  pickListOpen.value = false
  pickListArticle.value = null
  refreshDetail(article.id)
  showToast('Article ajouté à la liste.')
}

async function onPickListCreate(input) {
  const liste = await addListe(input)
  const article = pickListArticle.value
  if (liste?.id && article?.id) {
    await addArticleToListe(article.id, liste.id)
    refreshDetail(article.id)
    showToast('Liste créée et article ajouté.')
  }
  pickListOpen.value = false
  pickListArticle.value = null
}

async function doMarkPurchased(article, updateDurabilite) {
  if (!article?.id) return
  await markPurchased(article.id, { updateDurabilite })
  refreshDetail(article.id)
  showToast('Achat enregistré.')
}

function onMarkPurchased(article) {
  if (!article?.id) return
  if (!article.suivi_durabilite) {
    doMarkPurchased(article, false)
    return
  }
  confirmState.value = {
    type: 'durability',
    article,
    title: 'Mettre à jour le suivi ?',
    message: 'Mettre à jour la date du dernier achat pour le suivi de durée de vie ?',
    confirmLabel: 'Oui, mettre à jour',
    cancelLabel: 'Non, sans mise à jour',
    danger: false,
  }
}

function onDeleteFromDetail(article) {
  if (!article?.id) return
  confirmState.value = {
    type: 'delete-article',
    article,
    title: 'Supprimer l’article ?',
    message: 'Cette action est définitive.',
    confirmLabel: 'Supprimer',
    cancelLabel: 'Annuler',
    danger: true,
  }
}

async function onConfirmDialog() {
  const state = confirmState.value
  confirmState.value = null
  if (!state) return
  if (state.type === 'delete-article') {
    await removeArticle(state.article.id)
    detailOpen.value = false
    detailArticle.value = null
    showToast('Article supprimé.')
    return
  }
  if (state.type === 'durability') {
    await doMarkPurchased(state.article, true)
  }
}

function onCancelConfirmDialog() {
  const state = confirmState.value
  confirmState.value = null
  if (state?.type === 'durability') {
    doMarkPurchased(state.article, false)
  }
}

async function onDeleteListe(id) {
  await removeListe(id)
  showToast('Liste supprimée.')
}

async function onRacheter(article) {
  await racheter(article.id)
  showToast('Article remis dans « à acheter ».')
}

async function onExport() {
  try {
    await copyExportText()
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

async function onCloseListe({ listeId, reporterRestants, targetListeId }) {
  await closeListeById(listeId, { reporterRestants, targetListeId })
  showToast(
    reporterRestants
      ? 'Liste fermée — articles non achetés reportés.'
      : 'Liste fermée.',
  )
}

async function onReporter({ listeId, targetListeId }) {
  await reporterRestantsVers(listeId, targetListeId)
  showToast('Articles reportés vers une autre liste.')
}

function onEditGroup({ kind, entity }) {
  groupEditKind.value = kind
  groupEditEntity.value = entity
  groupEditOpen.value = true
}

async function onSaveGroup({ kind, id, payload }) {
  if (kind === 'magasin') await editMagasin(id, payload)
  else await editCategorie(id, payload)
  groupEditOpen.value = false
  groupEditEntity.value = null
  showToast(kind === 'magasin' ? 'Magasin mis à jour.' : 'Rayon mis à jour.')
}

async function onDeleteGroup({ kind, id }) {
  if (kind === 'magasin') await removeMagasin(id)
  else await removeCategorie(id)
  groupEditOpen.value = false
  groupEditEntity.value = null
  showToast(kind === 'magasin' ? 'Magasin supprimé.' : 'Rayon supprimé.')
}
</script>

<template>
  <div class="courses-page">
    <header class="courses-page__header">
      <h1 class="courses-page__title">{{ pageTitle }}</h1>
      <p class="courses-page__subtitle">
        Ta vitrine d’articles — crée une liste quand tu en as besoin.
      </p>
    </header>

    <div class="courses-page__header-actions">
      <button type="button" class="courses-page__ghost" @click="listsOpen = true">
        Mes listes de courses
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

    <div v-if="selectedListe" class="courses-page__filter" role="status">
      <span>
        Filtre : <strong>{{ selectedListe.nom }}</strong>
        <template v-if="selectedListe.date_liste">
          ({{ selectedListe.date_liste.slice(8, 10) }}/{{ selectedListe.date_liste.slice(5, 7) }}/{{ selectedListe.date_liste.slice(0, 4) }})
        </template>
      </span>
      <button type="button" class="courses-page__filter-clear" @click="clearListeFilter">
        Voir tout
      </button>
    </div>

    <CoursesQuickAdd
      :suggestions="suggestions"
      :disabled="saving"
      @query="onQuickQuery"
      @submit="onQuickSubmit"
      @pick="onQuickPick"
    />

    <CoursesVitrineView
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
      @edit-group="onEditGroup"
    />

    <CoursesArticleDetailModal
      :open="detailOpen"
      :article="detailArticle"
      :saving="saving"
      @close="detailOpen = false"
      @edit="openEditFromDetail"
      @add-to-list="openPickList"
      @mark-purchased="onMarkPurchased"
      @delete="onDeleteFromDetail"
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

    <CoursesPickListModal
      :open="pickListOpen"
      :listes="listes"
      :article="pickListArticle"
      :saving="saving"
      @close="pickListOpen = false"
      @select="onPickListSelect"
      @create-and-select="onPickListCreate"
    />

    <CoursesListsModal
      :open="listsOpen"
      :listes="listes"
      :selected-liste-id="selectedListeId"
      :articles="articles"
      :saving="saving"
      @close="listsOpen = false"
      @create="addListe"
      @update-liste="editListe"
      @close-liste="onCloseListe"
      @reporter="onReporter"
      @select-liste="selectedListeId = $event"
      @clear-filter="clearListeFilter"
      @delete-liste="onDeleteListe"
    />

    <CoursesGroupEditModal
      :open="groupEditOpen"
      :kind="groupEditKind"
      :entity="groupEditEntity"
      :saving="saving"
      @close="groupEditOpen = false"
      @save="onSaveGroup"
      @delete="onDeleteGroup"
    />

    <AppConfirmDialog
      :open="Boolean(confirmState)"
      :title="confirmState?.title || 'Confirmation'"
      :message="confirmState?.message || ''"
      :confirm-label="confirmState?.confirmLabel || 'Confirmer'"
      :cancel-label="confirmState?.cancelLabel || 'Annuler'"
      :danger="Boolean(confirmState?.danger)"
      @confirm="onConfirmDialog"
      @cancel="onCancelConfirmDialog"
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
  margin-bottom: 1rem;
}

.courses-page__filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  margin: 0 0 1rem;
  padding: 0.65rem 0.9rem;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 16%, transparent);
  font-size: 0.9rem;
  color: var(--color-text);
}

.courses-page__filter-clear {
  min-height: 36px;
  padding: 0 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
  font-weight: 700;
  cursor: pointer;
}

.courses-page__ghost,
.courses-page__primary {
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
