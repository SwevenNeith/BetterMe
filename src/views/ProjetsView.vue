<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import ColorPickerField from '../components/ColorPickerField.vue'
import EmojiPickerField from '../components/EmojiPickerField.vue'
import { supabase } from '../lib/supabase.js'
import {
  applyAlphabeticalProjectOrder,
  createProject,
  deleteProject,
  fetchProjectsTree,
  isProjectsCustomOrder,
  markProjectsCustomOrder,
  persistProjectOrders,
} from '../services/projects.js'

const userId = ref(null)
const isLoading = ref(true)
const loadError = ref('')

const projects = ref([])
const projectFormOpen = ref(false)
const projectForm = reactive({
  title: '',
  description: '',
  icone: null,
  couleur: '#ad81be',
})

const draggingProjectId = ref(null)

const projectsSubtitle = computed(() => {
  const count = projects.value.length
  if (count === 0) return 'Organise et suis tes projets personnels.'
  return `${count} projet${count > 1 ? 's' : ''} actif${count > 1 ? 's' : ''}.`
})

function doneCount(steps) {
  return (steps ?? []).filter((s) => s.is_done).length
}

function hasDescription(text) {
  return String(text ?? '').trim().length > 0
}

function openProjectForm() {
  projectForm.title = ''
  projectForm.description = ''
  projectForm.icone = null
  projectForm.couleur = '#ad81be'
  projectFormOpen.value = true
}

function closeProjectForm() {
  projectFormOpen.value = false
  projectForm.title = ''
  projectForm.description = ''
  projectForm.icone = null
  projectForm.couleur = '#ad81be'
}

async function loadProjects() {
  if (!userId.value) return

  isLoading.value = true
  loadError.value = ''
  try {
    let list = await fetchProjectsTree(supabase, userId.value)
    if (!isProjectsCustomOrder(userId.value)) {
      list = await applyAlphabeticalProjectOrder(supabase, userId.value, list)
    }
    projects.value = list
  } catch (err) {
    console.error(err)
    loadError.value = err.message || 'Impossible de charger les projets.'
    projects.value = []
  } finally {
    isLoading.value = false
  }
}

async function submitProjectForm() {
  if (!userId.value) return

  const title = projectForm.title.trim()
  if (!title) return

  try {
    const sortOrder = (projects.value.at(-1)?.sort_order ?? 0) + 1
    await createProject(
      supabase,
      userId.value,
      title,
      sortOrder,
      projectForm.description,
      projectForm.icone,
      projectForm.couleur,
    )
    closeProjectForm()
    await loadProjects()
  } catch (err) {
    console.error(err)
    loadError.value = err.message || "Erreur lors de l'ajout du projet."
  }
}

async function removeProject(projectId) {
  if (!userId.value) return
  try {
    await deleteProject(supabase, userId.value, projectId)
    await loadProjects()
  } catch (err) {
    console.error(err)
    loadError.value = err.message || 'Erreur suppression du projet.'
  }
}

function onDragStart(id, event) {
  draggingProjectId.value = id
  try {
    event.dataTransfer?.setData('text/plain', id)
    event.dataTransfer.effectAllowed = 'move'
  } catch {
    /* ignore */
  }
}

function onDragOver(id, event) {
  if (!draggingProjectId.value || draggingProjectId.value === id) return
  event.preventDefault()
  try {
    event.dataTransfer.dropEffect = 'move'
  } catch {
    /* ignore */
  }
}

function onDragEnd() {
  draggingProjectId.value = null
}

function reorderById(list, sourceId, targetId) {
  const from = list.findIndex((item) => item.id === sourceId)
  const to = list.findIndex((item) => item.id === targetId)
  if (from < 0 || to < 0 || from === to) return false
  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved)
  return true
}

async function onProjectDrop(targetId, event) {
  event.preventDefault()
  const source = draggingProjectId.value || event.dataTransfer?.getData('text/plain')
  draggingProjectId.value = null
  if (!source || source === targetId || !userId.value) return

  const changed = reorderById(projects.value, source, targetId)
  if (!changed) return

  try {
    markProjectsCustomOrder(userId.value)
    await persistProjectOrders(supabase, userId.value, projects.value)
  } catch (err) {
    console.error(err)
    loadError.value = err.message || 'Erreur lors du réordonnancement des projets.'
    await loadProjects()
  }
}

onMounted(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) userId.value = user.id
})

watch(userId, (id) => {
  if (id) loadProjects()
})
</script>

<template>
  <div class="projects-wrapper">
    <header class="projects-header">
      <h1 class="projects-title">Projets</h1>
      <p class="projects-subtitle">{{ projectsSubtitle }}</p>
    </header>

    <section class="projects-card">
      <div class="projects-add">
        <button type="button" class="projects-add-btn" @click="openProjectForm">
          Ajouter un projet / objectif
        </button>
      </div>

      <form v-if="projectFormOpen" class="projects-form-card" @submit.prevent="submitProjectForm">
        <h2 class="projects-form-title">Nouveau projet / objectif</h2>
        <label class="projects-form-field">
          <span class="projects-form-label">Nom</span>
          <div class="projects-form-name-row">
            <EmojiPickerField
              v-model="projectForm.icone"
              compact
              label="Choisir une icône"
            />
            <input
              v-model="projectForm.title"
              type="text"
              class="projects-form-input"
              maxlength="120"
              placeholder="Ex: Cardio 3x/semaine, Projet BetterMe…"
              required
              autofocus
            />
            <ColorPickerField v-model="projectForm.couleur" compact />
          </div>
        </label>
        <label class="projects-form-field">
          <span class="projects-form-label">Description <span class="projects-form-optional">(optionnel)</span></span>
          <textarea
            v-model="projectForm.description"
            class="projects-form-textarea"
            rows="3"
            maxlength="1000"
            placeholder="Contexte, objectif, notes…"
          />
        </label>
        <div class="projects-form-actions">
          <button type="submit" class="projects-add-btn">Créer</button>
          <button type="button" class="projects-cancel-btn" @click="closeProjectForm">Annuler</button>
        </div>
      </form>

      <div v-if="loadError" class="projects-error">{{ loadError }}</div>
      <div v-if="isLoading" class="projects-loading">Chargement…</div>

      <div v-else class="projects-list" role="list">
        <div v-if="projects.length === 0" class="projects-empty">Aucun projet pour le moment.</div>

        <article
          v-for="p in projects"
          :key="p.id"
          class="projects-item"
          :class="{ 'projects-item--dragging': draggingProjectId === p.id }"
          :style="{ '--project-color': p.couleur }"
          role="listitem"
          @dragover="onDragOver(p.id, $event)"
          @drop="onProjectDrop(p.id, $event)"
        >
          <div class="projects-item-top">
            <span
              class="projects-drag-handle"
              draggable="true"
              title="Glisser pour réordonner"
              aria-label="Réordonner le projet"
              @dragstart.stop="onDragStart(p.id, $event)"
              @dragend="onDragEnd"
            >⋮⋮</span>

            <span
              class="projects-item-swatch"
              :class="{ 'projects-item-swatch--no-icon': !p.icone }"
              aria-hidden="true"
            >{{ p.icone || '' }}</span>

            <h2 class="projects-item-title">{{ p.title }}</h2>

            <button
              class="projects-item-delete"
              type="button"
              title="Supprimer le projet"
              aria-label="Supprimer le projet"
              @click="removeProject(p.id)"
            >
              ✕
            </button>
          </div>

          <p v-if="hasDescription(p.description)" class="projects-item-description">{{ p.description }}</p>

          <div class="projects-item-footer">
            <span class="projects-item-progress">{{ doneCount(p.steps) }}/{{ p.steps.length }}</span>
            <router-link :to="`/projets/${p.id}`" class="projects-view-btn">
              Voir le projet
            </router-link>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.projects-wrapper {
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
}

.projects-header {
  margin-bottom: 1.5rem;
  text-align: center;
}

.projects-title {
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  margin: 0;
}

.projects-subtitle {
  margin: 0.5rem 0 0;
  color: #6c757d;
  font-size: 1rem;
}

.projects-card {
  width: 100%;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 16px;
  padding: 1.25rem;
}

.projects-add {
  margin-bottom: 1rem;
}

.projects-add-btn {
  padding: 0.75rem 1rem;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  font-weight: 800;
  font-size: 0.95rem;
  cursor: pointer;
  transition: transform 0.15s ease, filter 0.15s ease;
}

.projects-add-btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.03);
}

.projects-form-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding: 1rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.75);
}

.projects-form-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: #ad81be;
}

.projects-form-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.projects-form-name-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.projects-form-name-row .projects-form-input {
  flex: 1;
  min-width: 0;
}

.projects-form-label {
  font-size: 0.78rem;
  font-weight: 800;
  color: #95a5a6;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.projects-form-optional {
  font-weight: 700;
  text-transform: none;
  letter-spacing: 0;
  color: #b0b8bf;
}

.projects-form-input,
.projects-form-textarea {
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

.projects-form-textarea {
  resize: vertical;
  min-height: 4.5rem;
  line-height: 1.4;
}

.projects-form-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.projects-cancel-btn {
  padding: 0.75rem 1rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.45);
  background: transparent;
  color: #ad81be;
  font-weight: 800;
  font-size: 0.95rem;
  cursor: pointer;
}

.projects-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.projects-empty {
  text-align: center;
  color: #6c757d;
  font-weight: 600;
  padding: 0.75rem 0;
}

.projects-item {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  border-radius: 12px;
  padding: 0.85rem 1rem;
  border: 1px solid color-mix(in srgb, var(--project-color, #ad81be) 35%, transparent);
  background: color-mix(in srgb, var(--project-color, #ad81be) 8%, rgba(255, 255, 255, 0.55));
  transition: opacity 0.15s ease;
}

.projects-item--dragging {
  opacity: 0.55;
}

.projects-item-top {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
}

.projects-drag-handle {
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

.projects-drag-handle:active {
  cursor: grabbing;
}

.projects-item-swatch {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 8px;
  background-color: var(--project-color, #ad81be);
  color: white;
  font-size: 1.1rem;
  line-height: 1;
}

.projects-item-swatch--no-icon {
  background-color: color-mix(in srgb, var(--project-color, #ad81be) 25%, transparent);
}

.projects-item-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: #2c3e50;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.projects-item-description {
  margin: 0;
  color: #5d6d7e;
  font-size: 0.92rem;
  line-height: 1.45;
  white-space: pre-wrap;
}

.projects-item-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-top: 0.15rem;
}

.projects-item-progress {
  font-weight: 900;
  font-size: 1rem;
  color: var(--project-color, #ad81be);
  letter-spacing: 0.02em;
}

.projects-view-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.55rem 0.95rem;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  font-weight: 800;
  font-size: 0.9rem;
  text-decoration: none;
  cursor: pointer;
  transition: transform 0.15s ease, filter 0.15s ease;
}

.projects-view-btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.03);
}

.projects-item-delete {
  flex-shrink: 0;
  background: transparent;
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 10px;
  padding: 0.25rem 0.5rem;
  color: #ad81be;
  cursor: pointer;
  font-weight: 900;
  opacity: 0.7;
}

.projects-item-delete:hover {
  opacity: 1;
}

.projects-error {
  margin: 0 0 0.75rem;
  color: #c0392b;
  font-weight: 700;
}

.projects-loading {
  text-align: center;
  color: #6c757d;
  font-weight: 700;
  padding: 0.75rem 0;
}

@media (prefers-color-scheme: dark) {
  .projects-title {
    color: #f0e8f8;
  }

  .projects-subtitle,
  .projects-empty {
    color: #adb5bd;
  }

  .projects-card,
  .projects-form-card {
    background: rgba(30, 25, 40, 0.65);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .projects-form-input,
  .projects-form-textarea {
    background: rgba(0, 0, 0, 0.25);
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.25);
  }

  .projects-item {
    background: color-mix(in srgb, var(--project-color, #ad81be) 12%, rgba(30, 25, 40, 0.4));
    border-color: color-mix(in srgb, var(--project-color, #ad81be) 30%, transparent);
  }

  .projects-item-title {
    color: #f0e8f8;
  }

  .projects-item-description {
    color: #c5c9d0;
  }

  .projects-item-delete {
    border-color: rgba(213, 181, 234, 0.2);
  }
}
</style>
