<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import ColorPickerField from '../components/ColorPickerField.vue'
import EmojiPickerField from '../components/EmojiPickerField.vue'
import ProjectItemProgress from '../components/ProjectItemProgress.vue'
import {
  DEFAULT_QUANTITE_CIBLE,
  DEFAULT_RESET_PERIODE,
  hasQuantiteTracking,
  normalizeQuantiteCible,
  normalizeResetPeriode,
  PROJECT_RESET_PERIODE_OPTIONS,
} from '../constants/projectProgress.js'
import { supabase } from '../lib/supabase.js'
import {
  addProgressLog,
  fetchProgressLogsForProject,
  getCurrentPeriodCount,
  groupLogsByItemId,
  removeLatestLogInPeriod,
} from '../services/projectProgress.js'
import {
  createStep,
  createSubstep,
  deleteStep,
  deleteSubstep,
  fetchProjectById,
  persistStepOrders,
  persistSubstepOrders,
  updateProjectAppearance,
  updateProjectDescription,
  updateProjectTitle,
  updateStepDescription,
  updateStepDone,
  updateStepProgressSettings,
  updateStepTitle,
  updateSubstepDescription,
  updateSubstepDone,
  updateSubstepProgressSettings,
  updateSubstepTitle,
} from '../services/projects.js'

const resetPeriodeOptions = PROJECT_RESET_PERIODE_OPTIONS

const route = useRoute()

const userId = ref(null)
const isLoading = ref(true)
const loadError = ref('')

const project = ref(null)

const stepFormOpen = ref(false)
const stepForm = reactive({
  title: '',
  description: '',
  quantite_cible: DEFAULT_QUANTITE_CIBLE,
  reset_periode: DEFAULT_RESET_PERIODE,
})

const substepFormStepId = ref(null)
const substepForm = reactive({
  title: '',
  description: '',
  quantite_cible: DEFAULT_QUANTITE_CIBLE,
  reset_periode: DEFAULT_RESET_PERIODE,
})

const progressLogsByItemId = ref(new Map())

const editPanel = ref(null)

const draggingStepKey = ref(null)
const draggingSubstepKey = ref(null)

const projectId = computed(() => route.params.projectId)

const stepsProgress = computed(() => {
  const steps = project.value?.steps ?? []
  return `${doneCount(steps)}/${steps.length}`
})

function hasDescription(text) {
  return String(text ?? '').trim().length > 0
}

function stepKey(stepId) {
  return stepId
}

function substepKey(stepId, substepId) {
  return `${stepId}:${substepId}`
}

function doneCount(items) {
  return (items ?? []).filter((item) => item.is_done).length
}

/** Étapes / sous-étapes terminées en bas, ordre relatif conservé dans chaque groupe. */
function sortDoneLast(items) {
  if (!items?.length) return
  const pending = items.filter((item) => !item.is_done)
  const done = items.filter((item) => item.is_done)
  items.splice(0, items.length, ...pending, ...done)
}

function moveItemDoneLast(list, itemId) {
  const idx = list.findIndex((item) => item.id === itemId)
  if (idx < 0) return false
  const [item] = list.splice(idx, 1)
  list.push(item)
  return true
}

function moveItemPendingEnd(list, itemId) {
  const idx = list.findIndex((item) => item.id === itemId)
  if (idx < 0) return false
  const [item] = list.splice(idx, 1)
  const firstDoneIdx = list.findIndex((entry) => entry.is_done)
  if (firstDoneIdx < 0) list.push(item)
  else list.splice(firstDoneIdx, 0, item)
  return true
}

function normalizeProjectStepOrder(proj) {
  if (!proj?.steps) return
  sortDoneLast(proj.steps)
  for (const step of proj.steps) {
    sortDoneLast(step.substeps)
  }
}

function editPanelTitle(kind) {
  if (kind === 'project') return 'Modifier le projet'
  if (kind === 'step') return "Modifier l'étape"
  return 'Modifier la sous-étape'
}

function openEdit(kind, item) {
  editPanel.value = {
    kind,
    id: item.id,
    title: item.title,
    description: item.description ?? '',
    icone: item.icone ?? null,
    couleur: item.couleur ?? '#ad81be',
    quantite_cible: item.quantite_cible ?? DEFAULT_QUANTITE_CIBLE,
    reset_periode: item.reset_periode ?? DEFAULT_RESET_PERIODE,
  }
}

function closeEdit() {
  editPanel.value = null
}

function openStepForm() {
  stepForm.title = ''
  stepForm.description = ''
  stepForm.quantite_cible = DEFAULT_QUANTITE_CIBLE
  stepForm.reset_periode = DEFAULT_RESET_PERIODE
  stepFormOpen.value = true
  substepFormStepId.value = null
}

function closeStepForm() {
  stepFormOpen.value = false
  stepForm.title = ''
  stepForm.description = ''
  stepForm.quantite_cible = DEFAULT_QUANTITE_CIBLE
  stepForm.reset_periode = DEFAULT_RESET_PERIODE
}

function openSubstepForm(stepId) {
  substepFormStepId.value = stepId
  substepForm.title = ''
  substepForm.description = ''
  substepForm.quantite_cible = DEFAULT_QUANTITE_CIBLE
  substepForm.reset_periode = DEFAULT_RESET_PERIODE
  stepFormOpen.value = false
}

function closeSubstepForm() {
  substepFormStepId.value = null
  substepForm.title = ''
  substepForm.description = ''
  substepForm.quantite_cible = DEFAULT_QUANTITE_CIBLE
  substepForm.reset_periode = DEFAULT_RESET_PERIODE
}

function getItemLogs(itemId) {
  return progressLogsByItemId.value.get(itemId) ?? []
}

function syncItemDoneState(item, logs) {
  if (!hasQuantiteTracking(item)) return Boolean(item.is_done)
  const count = getCurrentPeriodCount(logs, item.reset_periode)
  return count >= item.quantite_cible
}

async function loadProgressLogs(proj) {
  const stepIds = (proj?.steps ?? []).map((s) => s.id)
  const substepIds = (proj?.steps ?? []).flatMap((s) => s.substeps.map((ss) => ss.id))

  if (stepIds.length === 0 && substepIds.length === 0) {
    progressLogsByItemId.value = new Map()
    return
  }

  try {
    const logs = await fetchProgressLogsForProject(supabase, userId.value, stepIds, substepIds)
    progressLogsByItemId.value = groupLogsByItemId(logs)
  } catch (err) {
    console.warn('Historique de progression indisponible :', err)
    progressLogsByItemId.value = new Map()
  }
}

async function loadProject() {
  if (!userId.value || !projectId.value) return

  isLoading.value = true
  loadError.value = ''
  try {
    const found = await fetchProjectById(supabase, userId.value, projectId.value)
    if (!found) {
      loadError.value = 'Projet introuvable.'
      project.value = null
      return
    }
    project.value = found
    await loadProgressLogs(found)
    for (const step of project.value.steps) {
      if (hasQuantiteTracking(step)) {
        step.is_done = syncItemDoneState(step, getItemLogs(step.id))
      }
      for (const substep of step.substeps) {
        if (hasQuantiteTracking(substep)) {
          substep.is_done = syncItemDoneState(substep, getItemLogs(substep.id))
        }
      }
    }
    normalizeProjectStepOrder(project.value)
  } catch (err) {
    console.error(err)
    loadError.value = err.message || 'Impossible de charger le projet.'
    project.value = null
  } finally {
    isLoading.value = false
  }
}

async function saveEditPanel() {
  if (!userId.value || !project.value || !editPanel.value) return

  const title = editPanel.value.title.trim()
  const description = editPanel.value.description.trim()
  if (!title) return

  const { kind, id, icone, couleur } = editPanel.value

  try {
    if (kind === 'project') {
      await updateProjectTitle(supabase, userId.value, project.value.id, title)
      await updateProjectDescription(supabase, userId.value, project.value.id, description)
      await updateProjectAppearance(supabase, userId.value, project.value.id, icone, couleur)
      project.value.title = title
      project.value.description = description
      project.value.icone = (icone ?? '').trim() || null
      project.value.couleur = (couleur ?? '').trim() || '#ad81be'
    } else if (kind === 'step') {
      await updateStepTitle(supabase, userId.value, id, title)
      await updateStepDescription(supabase, userId.value, id, description)
      await updateStepProgressSettings(
        supabase,
        userId.value,
        id,
        editPanel.value.quantite_cible,
        editPanel.value.reset_periode,
      )
      const step = project.value.steps.find((s) => s.id === id)
      if (step) {
        step.title = title
        step.description = description
        step.quantite_cible = normalizeQuantiteCible(editPanel.value.quantite_cible)
        step.reset_periode = editPanel.value.reset_periode || DEFAULT_RESET_PERIODE
        if (hasQuantiteTracking(step)) {
          step.is_done = syncItemDoneState(step, getItemLogs(step.id))
        }
      }
    } else if (kind === 'substep') {
      await updateSubstepTitle(supabase, userId.value, id, title)
      await updateSubstepDescription(supabase, userId.value, id, description)
      await updateSubstepProgressSettings(
        supabase,
        userId.value,
        id,
        editPanel.value.quantite_cible,
        editPanel.value.reset_periode,
      )
      const substep = project.value.steps.flatMap((s) => s.substeps).find((ss) => ss.id === id)
      if (substep) {
        substep.title = title
        substep.description = description
        substep.quantite_cible = normalizeQuantiteCible(editPanel.value.quantite_cible)
        substep.reset_periode = editPanel.value.reset_periode || DEFAULT_RESET_PERIODE
        if (hasQuantiteTracking(substep)) {
          substep.is_done = syncItemDoneState(substep, getItemLogs(substep.id))
        }
      }
    }
    closeEdit()
  } catch (err) {
    console.error(err)
    loadError.value = err.message || 'Erreur lors de la modification.'
  }
}

async function applyItemDoneReorder(item, list, wasDone) {
  const nowDone = item.is_done
  if (nowDone && !wasDone) moveItemDoneLast(list, item.id)
  else if (!nowDone && wasDone) moveItemPendingEnd(list, item.id)
  await persistStepOrders(supabase, userId.value, project.value.steps)
}

async function toggleStepDone(step) {
  if (!userId.value || !project.value || hasQuantiteTracking(step)) return
  const next = !step.is_done
  step.is_done = next
  if (next) moveItemDoneLast(project.value.steps, step.id)
  else moveItemPendingEnd(project.value.steps, step.id)
  try {
    await updateStepDone(supabase, userId.value, step.id, next)
    await persistStepOrders(supabase, userId.value, project.value.steps)
  } catch (err) {
    step.is_done = !next
    normalizeProjectStepOrder(project.value)
    console.error(err)
    loadError.value = err.message || "Erreur lors de la mise à jour de l'étape."
  }
}

async function toggleSubstepDone(substep) {
  if (!userId.value || !project.value || hasQuantiteTracking(substep)) return
  const step = project.value.steps.find((s) => s.substeps.some((ss) => ss.id === substep.id))
  if (!step) return

  const next = !substep.is_done
  substep.is_done = next
  if (next) moveItemDoneLast(step.substeps, substep.id)
  else moveItemPendingEnd(step.substeps, substep.id)
  try {
    await updateSubstepDone(supabase, userId.value, substep.id, next)
    await persistSubstepOrders(supabase, userId.value, step.substeps)
  } catch (err) {
    substep.is_done = !next
    normalizeProjectStepOrder(project.value)
    console.error(err)
    loadError.value = err.message || 'Erreur lors de la mise à jour de la sous-étape.'
  }
}

async function onStepIncrement(step) {
  if (!userId.value || !project.value || !hasQuantiteTracking(step)) return
  const wasDone = step.is_done
  try {
    const log = await addProgressLog(supabase, userId.value, { stepId: step.id })
    const logs = [...getItemLogs(step.id), log]
    progressLogsByItemId.value.set(step.id, logs)
    step.is_done = syncItemDoneState(step, logs)
    await updateStepDone(supabase, userId.value, step.id, step.is_done)
    if (wasDone !== step.is_done) await applyItemDoneReorder(step, project.value.steps, wasDone)
  } catch (err) {
    console.error(err)
    loadError.value = err.message || "Erreur lors de l'incrémentation."
    await loadProject()
  }
}

async function onStepDecrement(step) {
  if (!userId.value || !project.value || !hasQuantiteTracking(step)) return
  const wasDone = step.is_done
  try {
    const deletedId = await removeLatestLogInPeriod(supabase, userId.value, {
      stepId: step.id,
      resetPeriode: step.reset_periode,
    })
    if (!deletedId) return
    const logs = getItemLogs(step.id).filter((log) => log.id !== deletedId)
    progressLogsByItemId.value.set(step.id, logs)
    step.is_done = syncItemDoneState(step, logs)
    await updateStepDone(supabase, userId.value, step.id, step.is_done)
    if (wasDone !== step.is_done) await applyItemDoneReorder(step, project.value.steps, wasDone)
  } catch (err) {
    console.error(err)
    loadError.value = err.message || 'Erreur lors de la décrémentation.'
    await loadProject()
  }
}

async function onSubstepIncrement(substep) {
  if (!userId.value || !project.value || !hasQuantiteTracking(substep)) return
  const step = project.value.steps.find((s) => s.substeps.some((ss) => ss.id === substep.id))
  if (!step) return

  const wasDone = substep.is_done
  try {
    const log = await addProgressLog(supabase, userId.value, { substepId: substep.id })
    const logs = [...getItemLogs(substep.id), log]
    progressLogsByItemId.value.set(substep.id, logs)
    substep.is_done = syncItemDoneState(substep, logs)
    await updateSubstepDone(supabase, userId.value, substep.id, substep.is_done)
    if (wasDone !== substep.is_done) {
      if (substep.is_done) moveItemDoneLast(step.substeps, substep.id)
      else moveItemPendingEnd(step.substeps, substep.id)
      await persistSubstepOrders(supabase, userId.value, step.substeps)
    }
  } catch (err) {
    console.error(err)
    loadError.value = err.message || "Erreur lors de l'incrémentation."
    await loadProject()
  }
}

async function onSubstepDecrement(substep) {
  if (!userId.value || !project.value || !hasQuantiteTracking(substep)) return
  const step = project.value.steps.find((s) => s.substeps.some((ss) => ss.id === substep.id))
  if (!step) return

  const wasDone = substep.is_done
  try {
    const deletedId = await removeLatestLogInPeriod(supabase, userId.value, {
      substepId: substep.id,
      resetPeriode: substep.reset_periode,
    })
    if (!deletedId) return
    const logs = getItemLogs(substep.id).filter((log) => log.id !== deletedId)
    progressLogsByItemId.value.set(substep.id, logs)
    substep.is_done = syncItemDoneState(substep, logs)
    await updateSubstepDone(supabase, userId.value, substep.id, substep.is_done)
    if (wasDone !== substep.is_done) {
      if (substep.is_done) moveItemDoneLast(step.substeps, substep.id)
      else moveItemPendingEnd(step.substeps, substep.id)
      await persistSubstepOrders(supabase, userId.value, step.substeps)
    }
  } catch (err) {
    console.error(err)
    loadError.value = err.message || 'Erreur lors de la décrémentation.'
    await loadProject()
  }
}

async function submitStepForm() {
  if (!userId.value || !project.value) return

  const title = stepForm.title.trim()
  if (!title) return

  const stepOrder = (project.value.steps?.length ?? 0) + 1

  try {
    await createStep(
      supabase,
      userId.value,
      project.value.id,
      title,
      stepOrder,
      stepForm.description,
      stepForm.quantite_cible,
      stepForm.reset_periode,
    )
    closeStepForm()
    await loadProject()
  } catch (err) {
    console.error(err)
    loadError.value = err.message || "Erreur lors de l'ajout de l'étape."
  }
}

async function removeStep(stepId) {
  if (!userId.value) return
  try {
    await deleteStep(supabase, userId.value, stepId)
    if (editPanel.value?.kind === 'step' && editPanel.value.id === stepId) closeEdit()
    if (substepFormStepId.value === stepId) closeSubstepForm()
    await loadProject()
  } catch (err) {
    console.error(err)
    loadError.value = err.message || "Erreur suppression de l'étape."
  }
}

async function submitSubstepForm(stepId) {
  if (!userId.value || !project.value) return

  const title = substepForm.title.trim()
  if (!title) return

  const step = project.value.steps.find((s) => s.id === stepId)
  const substepOrder = (step?.substeps?.length ?? 0) + 1

  try {
    await createSubstep(
      supabase,
      userId.value,
      stepId,
      title,
      substepOrder,
      substepForm.description,
      substepForm.quantite_cible,
      substepForm.reset_periode,
    )
    closeSubstepForm()
    await loadProject()
  } catch (err) {
    console.error(err)
    loadError.value = err.message || "Erreur lors de l'ajout de la sous-étape."
  }
}

async function removeSubstep(substepId) {
  if (!userId.value) return
  try {
    await deleteSubstep(supabase, userId.value, substepId)
    if (editPanel.value?.kind === 'substep' && editPanel.value.id === substepId) closeEdit()
    await loadProject()
  } catch (err) {
    console.error(err)
    loadError.value = err.message || 'Erreur suppression de la sous-étape.'
  }
}

function reorderById(list, sourceId, targetId) {
  const from = list.findIndex((item) => item.id === sourceId)
  const to = list.findIndex((item) => item.id === targetId)
  if (from < 0 || to < 0 || from === to) return false
  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved)
  return true
}

function onStepDragStart(stepId, event) {
  draggingStepKey.value = stepId
  try {
    event.dataTransfer?.setData('text/plain', stepId)
    event.dataTransfer.effectAllowed = 'move'
  } catch {
    /* ignore */
  }
}

function onStepDragOver(stepId, event) {
  if (!draggingStepKey.value || draggingStepKey.value === stepId) return
  event.preventDefault()
  try {
    event.dataTransfer.dropEffect = 'move'
  } catch {
    /* ignore */
  }
}

function onStepDragEnd() {
  draggingStepKey.value = null
}

function onSubstepDragStart(stepId, substepId, event) {
  const key = substepKey(stepId, substepId)
  draggingSubstepKey.value = key
  try {
    event.dataTransfer?.setData('text/plain', key)
    event.dataTransfer.effectAllowed = 'move'
  } catch {
    /* ignore */
  }
}

function onSubstepDragOver(stepId, substepId, event) {
  const key = substepKey(stepId, substepId)
  if (!draggingSubstepKey.value || draggingSubstepKey.value === key) return
  event.preventDefault()
  try {
    event.dataTransfer.dropEffect = 'move'
  } catch {
    /* ignore */
  }
}

function onSubstepDragEnd() {
  draggingSubstepKey.value = null
}

async function onStepDrop(targetStepId, event) {
  event.preventDefault()
  const source = draggingStepKey.value || event.dataTransfer?.getData('text/plain')
  draggingStepKey.value = null
  if (!source || !userId.value || !project.value) return
  if (source === targetStepId) return

  const changed = reorderById(project.value.steps, source, targetStepId)
  if (!changed) return

  try {
    await persistStepOrders(supabase, userId.value, project.value.steps)
  } catch (err) {
    console.error(err)
    loadError.value = err.message || 'Erreur lors du réordonnancement des étapes.'
    await loadProject()
  }
}

async function onSubstepDrop(stepId, targetSubstepId, event) {
  event.preventDefault()
  const sourceKey = draggingSubstepKey.value || event.dataTransfer?.getData('text/plain')
  draggingSubstepKey.value = null
  if (!sourceKey || !userId.value || !project.value) return

  const [sourceStepId, sourceSubstepId] = sourceKey.split(':')
  if (sourceStepId !== stepId || sourceSubstepId === targetSubstepId) return

  const step = project.value.steps.find((s) => s.id === stepId)
  if (!step) return

  const changed = reorderById(step.substeps, sourceSubstepId, targetSubstepId)
  if (!changed) return

  try {
    await persistSubstepOrders(supabase, userId.value, step.substeps)
  } catch (err) {
    console.error(err)
    loadError.value = err.message || 'Erreur lors du réordonnancement des sous-étapes.'
    await loadProject()
  }
}

onMounted(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) userId.value = user.id
})

watch(userId, (id) => {
  if (id) loadProject()
})

watch(projectId, () => {
  if (userId.value) loadProject()
})
</script>

<template>
  <div class="project-detail-wrapper">
    <router-link to="/projets" class="project-detail-back">
      ← Retour aux projets
    </router-link>

    <div v-if="loadError && !project" class="project-detail-error">{{ loadError }}</div>
    <div v-else-if="isLoading" class="project-detail-loading">Chargement…</div>

    <template v-else-if="project">
      <header class="project-detail-header" :style="{ '--project-color': project.couleur }">
        <div class="project-detail-title-row">
          <template v-if="!(editPanel?.kind === 'project')">
            <span
              class="project-detail-swatch"
              :class="{ 'project-detail-swatch--no-icon': !project.icone }"
              aria-hidden="true"
            >{{ project.icone || '' }}</span>
            <h1 class="project-detail-title">{{ project.title }}</h1>
            <button
              type="button"
              class="project-icon-btn"
              title="Modifier le projet"
              aria-label="Modifier le projet"
              @click="openEdit('project', project)"
            >
              ✎
            </button>
          </template>
        </div>

        <p class="project-detail-progress">{{ stepsProgress }} étapes terminées</p>

        <p v-if="!(editPanel?.kind === 'project') && hasDescription(project.description)" class="project-detail-description">
          {{ project.description }}
        </p>
      </header>

      <form
        v-if="editPanel?.kind === 'project'"
        class="project-form-card"
        @submit.prevent="saveEditPanel"
      >
        <h2 class="project-form-title">{{ editPanelTitle('project') }}</h2>
        <label class="project-form-field">
          <span class="project-form-label">Nom</span>
          <div class="project-form-name-row">
            <EmojiPickerField v-model="editPanel.icone" compact label="Choisir une icône" />
            <input v-model="editPanel.title" type="text" class="project-form-input" maxlength="120" required autofocus />
            <ColorPickerField v-model="editPanel.couleur" compact />
          </div>
        </label>
        <label class="project-form-field">
          <span class="project-form-label">Description <span class="project-form-optional">(optionnel)</span></span>
          <textarea v-model="editPanel.description" class="project-form-textarea" rows="3" maxlength="1000" />
        </label>
        <div class="project-form-actions">
          <button type="submit" class="project-action-btn project-action-btn--small">Enregistrer</button>
          <button type="button" class="project-cancel-btn" @click="closeEdit">Annuler</button>
        </div>
      </form>

      <section class="project-detail-card">
        <div v-if="loadError" class="project-detail-error project-detail-error--inline">{{ loadError }}</div>

        <div class="project-detail-actions">
          <button type="button" class="project-action-btn" @click="openStepForm">
            Ajouter une étape
          </button>
        </div>

        <form v-if="stepFormOpen" class="project-form-card" @submit.prevent="submitStepForm">
          <h2 class="project-form-title">Nouvelle étape</h2>
          <label class="project-form-field">
            <span class="project-form-label">Nom</span>
            <input v-model="stepForm.title" type="text" class="project-form-input" maxlength="120" required autofocus />
          </label>
          <label class="project-form-field">
            <span class="project-form-label">Description <span class="project-form-optional">(optionnel)</span></span>
            <textarea v-model="stepForm.description" class="project-form-textarea" rows="2" maxlength="1000" />
          </label>
          <div class="project-form-row">
            <label class="project-form-field">
              <span class="project-form-label">
                Quantité <span class="project-form-optional">(0 = une fois)</span>
              </span>
              <input
                v-model.number="stepForm.quantite_cible"
                type="number"
                class="project-form-input"
                min="0"
                max="999"
                required
              />
            </label>
            <label v-if="stepForm.quantite_cible >= 1" class="project-form-field">
              <span class="project-form-label">Réinitialiser</span>
              <select v-model="stepForm.reset_periode" class="project-form-input">
                <option v-for="opt in resetPeriodeOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </label>
          </div>
          <div class="project-form-actions">
            <button type="submit" class="project-action-btn project-action-btn--small">Créer</button>
            <button type="button" class="project-cancel-btn" @click="closeStepForm">Annuler</button>
          </div>
        </form>

        <div v-if="project.steps.length === 0 && !stepFormOpen" class="project-empty">
          Aucune étape pour ce projet.
        </div>

        <div class="project-steps-list">
          <article
            v-for="s in project.steps"
            :key="s.id"
            class="project-step"
            :class="{
              'project-step--dragging': draggingStepKey === stepKey(s.id),
              'project-step--done': s.is_done,
            }"
            @dragover="onStepDragOver(s.id, $event)"
            @drop="onStepDrop(s.id, $event)"
          >
            <div class="project-step-header">
              <ProjectItemProgress
                :item="s"
                :logs="getItemLogs(s.id)"
                :project-color="project.couleur"
                @toggle="toggleStepDone(s)"
                @increment="onStepIncrement(s)"
                @decrement="onStepDecrement(s)"
              />

              <span
                class="project-drag-handle"
                draggable="true"
                title="Glisser pour réordonner"
                aria-label="Réordonner l'étape"
                @dragstart.stop="onStepDragStart(s.id, $event)"
                @dragend="onStepDragEnd"
              >⋮⋮</span>

              <div class="project-step-main">
                <div v-if="!(editPanel?.kind === 'step' && editPanel.id === s.id)" class="project-step-title-row">
                  <h2 class="project-step-title" :class="{ 'project-step-title--done': s.is_done }">
                    {{ s.title }}
                  </h2>
                  <button
                    type="button"
                    class="project-icon-btn"
                    title="Modifier l'étape"
                    aria-label="Modifier l'étape"
                    @click="openEdit('step', s)"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    class="project-delete-btn"
                    title="Supprimer l'étape"
                    aria-label="Supprimer l'étape"
                    @click="removeStep(s.id)"
                  >
                    ✕
                  </button>
                </div>

                <p v-if="!(editPanel?.kind === 'step' && editPanel.id === s.id) && hasDescription(s.description)" class="project-step-description">
                  {{ s.description }}
                </p>

                <form
                  v-if="editPanel?.kind === 'step' && editPanel.id === s.id"
                  class="project-form-card project-form-card--nested"
                  @submit.prevent="saveEditPanel"
                >
                  <h3 class="project-form-title">{{ editPanelTitle('step') }}</h3>
                  <label class="project-form-field">
                    <span class="project-form-label">Nom</span>
                    <input v-model="editPanel.title" type="text" class="project-form-input" maxlength="120" required autofocus />
                  </label>
                  <label class="project-form-field">
                    <span class="project-form-label">Description <span class="project-form-optional">(optionnel)</span></span>
                    <textarea v-model="editPanel.description" class="project-form-textarea" rows="2" maxlength="1000" />
                  </label>
                  <div class="project-form-row">
                    <label class="project-form-field">
                      <span class="project-form-label">
                        Quantité <span class="project-form-optional">(0 = une fois)</span>
                      </span>
                      <input
                        v-model.number="editPanel.quantite_cible"
                        type="number"
                        class="project-form-input"
                        min="0"
                        max="999"
                        required
                      />
                    </label>
                    <label v-if="editPanel.quantite_cible >= 1" class="project-form-field">
                      <span class="project-form-label">Réinitialiser</span>
                      <select v-model="editPanel.reset_periode" class="project-form-input">
                        <option v-for="opt in resetPeriodeOptions" :key="opt.value" :value="opt.value">
                          {{ opt.label }}
                        </option>
                      </select>
                    </label>
                  </div>
                  <div class="project-form-actions">
                    <button type="submit" class="project-action-btn project-action-btn--small">Enregistrer</button>
                    <button type="button" class="project-cancel-btn" @click="closeEdit">Annuler</button>
                  </div>
                </form>

                <button type="button" class="project-action-btn project-action-btn--ghost" @click="openSubstepForm(s.id)">
                  Ajouter une sous-étape
                </button>

                <form
                  v-if="substepFormStepId === s.id"
                  class="project-form-card project-form-card--nested"
                  @submit.prevent="submitSubstepForm(s.id)"
                >
                  <h3 class="project-form-title">Nouvelle sous-étape</h3>
                  <label class="project-form-field">
                    <span class="project-form-label">Nom</span>
                    <input v-model="substepForm.title" type="text" class="project-form-input" maxlength="120" required autofocus />
                  </label>
                  <label class="project-form-field">
                    <span class="project-form-label">Description <span class="project-form-optional">(optionnel)</span></span>
                    <textarea v-model="substepForm.description" class="project-form-textarea" rows="2" maxlength="1000" />
                  </label>
                  <div class="project-form-row">
                    <label class="project-form-field">
                      <span class="project-form-label">
                        Quantité <span class="project-form-optional">(0 = une fois)</span>
                      </span>
                      <input
                        v-model.number="substepForm.quantite_cible"
                        type="number"
                        class="project-form-input"
                        min="0"
                        max="999"
                        required
                      />
                    </label>
                    <label v-if="substepForm.quantite_cible >= 1" class="project-form-field">
                      <span class="project-form-label">Réinitialiser</span>
                      <select v-model="substepForm.reset_periode" class="project-form-input">
                        <option v-for="opt in resetPeriodeOptions" :key="opt.value" :value="opt.value">
                          {{ opt.label }}
                        </option>
                      </select>
                    </label>
                  </div>
                  <div class="project-form-actions">
                    <button type="submit" class="project-action-btn project-action-btn--small">Créer</button>
                    <button type="button" class="project-cancel-btn" @click="closeSubstepForm">Annuler</button>
                  </div>
                </form>

                <details class="project-substeps-details">
                  <summary class="project-substeps-summary">
                    Sous-étapes ({{ doneCount(s.substeps) }}/{{ s.substeps.length }})
                  </summary>

                  <ul v-if="s.substeps.length > 0" class="project-substeps-list">
                    <li
                      v-for="ss in s.substeps"
                      :key="ss.id"
                      class="project-substep-item"
                      :class="{
                        'project-substep-item--dragging': draggingSubstepKey === substepKey(s.id, ss.id),
                        'project-substep-item--done': ss.is_done,
                      }"
                      @dragover="onSubstepDragOver(s.id, ss.id, $event)"
                      @drop="onSubstepDrop(s.id, ss.id, $event)"
                    >
                      <div v-if="!(editPanel?.kind === 'substep' && editPanel.id === ss.id)" class="project-substep-row">
                        <ProjectItemProgress
                          :item="ss"
                          :logs="getItemLogs(ss.id)"
                          :project-color="project.couleur"
                          compact
                          @toggle="toggleSubstepDone(ss)"
                          @increment="onSubstepIncrement(ss)"
                          @decrement="onSubstepDecrement(ss)"
                        />

                        <span
                          class="project-drag-handle project-drag-handle--small"
                          draggable="true"
                          title="Glisser pour réordonner"
                          aria-label="Réordonner la sous-étape"
                          @dragstart.stop="onSubstepDragStart(s.id, ss.id, $event)"
                          @dragend="onSubstepDragEnd"
                        >⋮⋮</span>

                        <span class="project-substep-title" :class="{ 'project-substep-title--done': ss.is_done }">
                          {{ ss.title }}
                        </span>
                        <button
                          type="button"
                          class="project-icon-btn project-icon-btn--small"
                          title="Modifier la sous-étape"
                          aria-label="Modifier la sous-étape"
                          @click="openEdit('substep', ss)"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          class="project-delete-btn project-delete-btn--small"
                          title="Supprimer la sous-étape"
                          aria-label="Supprimer la sous-étape"
                          @click="removeSubstep(ss.id)"
                        >
                          ✕
                        </button>
                      </div>

                      <p v-if="!(editPanel?.kind === 'substep' && editPanel.id === ss.id) && hasDescription(ss.description)" class="project-substep-description">
                        {{ ss.description }}
                      </p>

                      <form
                        v-if="editPanel?.kind === 'substep' && editPanel.id === ss.id"
                        class="project-form-card project-form-card--nested"
                        @submit.prevent="saveEditPanel"
                      >
                        <h3 class="project-form-title">{{ editPanelTitle('substep') }}</h3>
                        <label class="project-form-field">
                          <span class="project-form-label">Nom</span>
                          <input v-model="editPanel.title" type="text" class="project-form-input" maxlength="120" required autofocus />
                        </label>
                        <label class="project-form-field">
                          <span class="project-form-label">Description <span class="project-form-optional">(optionnel)</span></span>
                          <textarea v-model="editPanel.description" class="project-form-textarea" rows="2" maxlength="1000" />
                        </label>
                        <div class="project-form-row">
                          <label class="project-form-field">
                            <span class="project-form-label">
                              Quantité <span class="project-form-optional">(0 = une fois)</span>
                            </span>
                            <input
                              v-model.number="editPanel.quantite_cible"
                              type="number"
                              class="project-form-input"
                              min="0"
                              max="999"
                              required
                            />
                          </label>
                          <label v-if="editPanel.quantite_cible >= 1" class="project-form-field">
                            <span class="project-form-label">Réinitialiser</span>
                            <select v-model="editPanel.reset_periode" class="project-form-input">
                              <option v-for="opt in resetPeriodeOptions" :key="opt.value" :value="opt.value">
                                {{ opt.label }}
                              </option>
                            </select>
                          </label>
                        </div>
                        <div class="project-form-actions">
                          <button type="submit" class="project-action-btn project-action-btn--small">Enregistrer</button>
                          <button type="button" class="project-cancel-btn" @click="closeEdit">Annuler</button>
                        </div>
                      </form>
                    </li>
                  </ul>
                  <p v-else class="project-empty-small">Aucune sous-étape.</p>
                </details>
              </div>
            </div>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.project-detail-wrapper {
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
}

.project-detail-back {
  display: inline-flex;
  margin-bottom: 1rem;
  color: #ad81be;
  font-weight: 800;
  text-decoration: none;
}

.project-detail-back:hover {
  text-decoration: underline;
}

.project-detail-header {
  margin-bottom: 1rem;
  text-align: center;
}

.project-detail-title-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.project-detail-title {
  margin: 0;
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
}

.project-detail-progress {
  margin: 0.4rem 0 0.5rem;
  color: var(--project-color, #ad81be);
  font-weight: 800;
}

.project-detail-swatch {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 10px;
  background-color: var(--project-color, #ad81be);
  color: white;
  font-size: 1.35rem;
  line-height: 1;
}

.project-detail-swatch--no-icon {
  background-color: color-mix(in srgb, var(--project-color, #ad81be) 25%, transparent);
}

.project-form-name-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.project-form-name-row .project-form-input {
  flex: 1;
  min-width: 0;
}

.project-form-optional {
  font-weight: 700;
  text-transform: none;
  letter-spacing: 0;
  color: #b0b8bf;
}

.project-detail-description {
  margin: 0 auto;
  max-width: 42rem;
  color: #5d6d7e;
  font-size: 0.95rem;
  line-height: 1.5;
  white-space: pre-wrap;
  text-align: center;
}

.project-detail-card {
  width: 100%;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 16px;
  padding: 1.25rem;
}

.project-detail-actions {
  margin-bottom: 0.75rem;
}

.project-form-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding: 1rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.75);
}

.project-form-card--nested {
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
}

.project-form-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 800;
  color: #ad81be;
}

.project-form-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.project-form-label {
  font-size: 0.78rem;
  font-weight: 800;
  color: #95a5a6;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.project-form-optional {
  font-weight: 700;
  text-transform: none;
  letter-spacing: 0;
  color: #b0b8bf;
}

.project-form-input,
.project-form-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0.65rem 0.8rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.4);
  background: white;
  color: #2c3e50;
  font-size: 0.95rem;
  font-family: inherit;
}

.project-form-textarea {
  resize: vertical;
  min-height: 3.5rem;
  line-height: 1.4;
}

.project-form-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.project-form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
}

@media (max-width: 520px) {
  .project-form-row {
    grid-template-columns: 1fr;
  }
}

.project-action-btn {
  padding: 0.65rem 1rem;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  font-weight: 800;
  font-size: 0.92rem;
  cursor: pointer;
  transition: transform 0.15s ease, filter 0.15s ease;
}

.project-action-btn--small {
  padding: 0.5rem 0.85rem;
  font-size: 0.85rem;
}

.project-action-btn--ghost {
  background: transparent;
  border: 1px solid rgba(213, 181, 234, 0.45);
  color: #ad81be;
  margin-top: 0.35rem;
}

.project-action-btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.03);
}

.project-cancel-btn {
  padding: 0.5rem 0.85rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.45);
  background: transparent;
  color: #ad81be;
  font-weight: 800;
  font-size: 0.85rem;
  cursor: pointer;
}

.project-steps-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.project-step {
  border: 1px solid rgba(213, 181, 234, 0.25);
  border-radius: 12px;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.55);
}

.project-step--done {
  background: rgba(39, 174, 96, 0.05);
}

.project-step--dragging,
.project-substep-item--dragging {
  opacity: 0.55;
}

.project-step-header {
  display: flex;
  align-items: stretch;
  gap: 0.45rem;
}

.project-step-main {
  flex: 1;
  min-width: 0;
}

.project-step-title-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.project-step-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: #2c3e50;
}

.project-step-title--done,
.project-substep-title--done {
  color: #7f8c8d;
}

.project-step-description,
.project-substep-description {
  margin: 0.4rem 0 0;
  color: #5d6d7e;
  font-size: 0.88rem;
  line-height: 1.45;
  white-space: pre-wrap;
}

.project-substep-description {
  margin-left: 1.85rem;
  font-size: 0.82rem;
}

.project-substep-title {
  flex: 1;
  min-width: 0;
  font-weight: 700;
  color: #2c3e50;
}

.project-substeps-details {
  margin-top: 0.75rem;
  border-top: 1px solid rgba(213, 181, 234, 0.2);
  padding-top: 0.65rem;
}

.project-substeps-summary {
  cursor: pointer;
  font-weight: 800;
  color: #ad81be;
  list-style: none;
  user-select: none;
}

.project-substeps-summary::-webkit-details-marker {
  display: none;
}

.project-substeps-list {
  margin: 0.65rem 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.project-substep-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.35rem 0.25rem;
  border-radius: 8px;
}

.project-substep-item--done {
  background: rgba(39, 174, 96, 0.06);
}

.project-substep-row {
  display: flex;
  align-items: stretch;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.project-drag-handle {
  flex-shrink: 0;
  cursor: grab;
  color: #ad81be;
  font-weight: 900;
  font-size: 0.85rem;
  line-height: 1;
  padding: 0.2rem 0.15rem;
  user-select: none;
  touch-action: none;
}

.project-drag-handle:active {
  cursor: grabbing;
}

.project-drag-handle--small {
  font-size: 0.75rem;
}

.project-todo {
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.project-todo--small .project-todo-box {
  width: 1rem;
  height: 1rem;
}

.project-todo-input {
  position: absolute;
  opacity: 0;
  width: 1.15rem;
  height: 1.15rem;
  margin: 0;
  cursor: pointer;
}

.project-todo-box {
  display: block;
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 4px;
  border: 2px solid rgba(173, 129, 190, 0.65);
  background: white;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.project-todo-input:checked + .project-todo-box {
  background: linear-gradient(135deg, #2ecc71, #27ae60);
  border-color: #27ae60;
  box-shadow: inset 0 0 0 2px white;
}

.project-icon-btn {
  flex-shrink: 0;
  background: transparent;
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 8px;
  padding: 0.2rem 0.45rem;
  color: #ad81be;
  cursor: pointer;
  font-weight: 900;
  font-size: 0.85rem;
  line-height: 1.2;
}

.project-icon-btn--small {
  font-size: 0.75rem;
  padding: 0.15rem 0.35rem;
}

.project-delete-btn {
  flex-shrink: 0;
  background: transparent;
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 10px;
  padding: 0.2rem 0.45rem;
  color: #ad81be;
  cursor: pointer;
  font-weight: 900;
  opacity: 0.7;
}

.project-delete-btn--small {
  font-size: 0.8rem;
}

.project-delete-btn:hover {
  opacity: 1;
}

.project-detail-error {
  color: #c0392b;
  font-weight: 700;
  margin-bottom: 0.75rem;
}

.project-detail-error--inline {
  margin-bottom: 0.75rem;
}

.project-detail-loading,
.project-empty,
.project-empty-small {
  text-align: center;
  color: #6c757d;
  font-weight: 700;
  padding: 0.75rem 0;
}

.project-empty-small {
  padding: 0.35rem 0;
  font-size: 0.9rem;
}

@media (prefers-color-scheme: dark) {
  .project-detail-title,
  .project-step-title,
  .project-substep-title {
    color: #f0e8f8;
  }

  .project-detail-card,
  .project-step,
  .project-form-card {
    background: rgba(30, 25, 40, 0.65);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .project-form-input,
  .project-form-textarea {
    background: rgba(0, 0, 0, 0.25);
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.25);
  }

  .project-detail-description,
  .project-step-description,
  .project-substep-description {
    color: #c5c9d0;
  }

  .project-step-title--done,
  .project-substep-title--done {
    color: #8b949e;
  }

  .project-step--done,
  .project-substep-item--done {
    background: rgba(39, 174, 96, 0.1);
  }

  .project-todo-box {
    background: rgba(0, 0, 0, 0.25);
    border-color: rgba(213, 181, 234, 0.45);
  }

  .project-detail-loading,
  .project-empty,
  .project-empty-small {
    color: #adb5bd;
  }
}
</style>
