<script setup>
import { computed, ref } from 'vue'
import {
  COURSES_DEFAULT_ICONE,
  COURSES_DEFAULT_MAGASIN_COULEUR,
  COURSES_MAGASIN_COLORS,
  COURSES_MAGASIN_TYPES,
} from '../../constants/courses/courses.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  magasins: { type: Array, default: () => [] },
  categories: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits([
  'close',
  'add-magasin',
  'edit-magasin',
  'delete-magasin',
  'reorder-magasins',
  'add-categorie',
  'edit-categorie',
  'delete-categorie',
  'reorder-categories',
])

const tab = ref('magasins')

const newMagasin = ref({
  nom: '',
  type: 'physique',
  couleur: COURSES_DEFAULT_MAGASIN_COULEUR,
  url: '',
})
const newCategorie = ref({
  nom: '',
  icone: COURSES_DEFAULT_ICONE,
})

const editingMagasinId = ref(null)
const editingCategorieId = ref(null)
const editMagasinDraft = ref({})
const editCategorieDraft = ref({})

const sortedMagasins = computed(() =>
  [...props.magasins].sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, 'fr')),
)
const sortedCategories = computed(() =>
  [...props.categories].sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, 'fr')),
)

function submitMagasin() {
  const nom = newMagasin.value.nom.trim()
  if (!nom || props.saving) return
  emit('add-magasin', { ...newMagasin.value, nom })
  newMagasin.value = {
    nom: '',
    type: 'physique',
    couleur: COURSES_DEFAULT_MAGASIN_COULEUR,
    url: '',
  }
}

function submitCategorie() {
  const nom = newCategorie.value.nom.trim()
  if (!nom || props.saving) return
  emit('add-categorie', { ...newCategorie.value, nom })
  newCategorie.value = { nom: '', icone: COURSES_DEFAULT_ICONE }
}

function startEditMagasin(m) {
  editingMagasinId.value = m.id
  editMagasinDraft.value = {
    nom: m.nom,
    type: m.type,
    couleur: m.couleur,
    url: m.url || '',
  }
}

function saveEditMagasin() {
  if (!editingMagasinId.value) return
  emit('edit-magasin', editingMagasinId.value, { ...editMagasinDraft.value })
  editingMagasinId.value = null
}

function startEditCategorie(c) {
  editingCategorieId.value = c.id
  editCategorieDraft.value = { nom: c.nom, icone: c.icone }
}

function saveEditCategorie() {
  if (!editingCategorieId.value) return
  emit('edit-categorie', editingCategorieId.value, { ...editCategorieDraft.value })
  editingCategorieId.value = null
}

function moveMagasin(id, dir) {
  const ids = sortedMagasins.value.map((m) => m.id)
  const idx = ids.indexOf(id)
  const swap = idx + dir
  if (idx < 0 || swap < 0 || swap >= ids.length) return
  ;[ids[idx], ids[swap]] = [ids[swap], ids[idx]]
  emit('reorder-magasins', ids)
}

function moveCategorie(id, dir) {
  const ids = sortedCategories.value.map((c) => c.id)
  const idx = ids.indexOf(id)
  const swap = idx + dir
  if (idx < 0 || swap < 0 || swap >= ids.length) return
  ;[ids[idx], ids[swap]] = [ids[swap], ids[idx]]
  emit('reorder-categories', ids)
}

function removeMagasin(id) {
  if (!window.confirm('Supprimer ce magasin ? Les articles liés seront conservés.')) return
  emit('delete-magasin', id)
}

function removeCategorie(id) {
  if (!window.confirm('Supprimer ce rayon ? Les articles liés seront conservés.')) return
  emit('delete-categorie', id)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="cm-overlay" @click.self="emit('close')">
      <div class="cm-modal" role="dialog" aria-modal="true" aria-label="Magasins et rayons">
        <header class="cm-header">
          <h2>Magasins & rayons</h2>
          <button type="button" class="cm-close" aria-label="Fermer" @click="emit('close')">✕</button>
        </header>

        <div class="cm-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            class="cm-tab"
            :class="{ 'is-active': tab === 'magasins' }"
            :aria-selected="tab === 'magasins'"
            @click="tab = 'magasins'"
          >
            Magasins
          </button>
          <button
            type="button"
            role="tab"
            class="cm-tab"
            :class="{ 'is-active': tab === 'categories' }"
            :aria-selected="tab === 'categories'"
            @click="tab = 'categories'"
          >
            Rayons
          </button>
        </div>

        <div v-show="tab === 'magasins'" class="cm-body">
          <form class="cm-create" @submit.prevent="submitMagasin">
            <input v-model="newMagasin.nom" type="text" placeholder="Nouveau magasin" required />
            <select v-model="newMagasin.type">
              <option v-for="t in COURSES_MAGASIN_TYPES" :key="t.id" :value="t.id">{{ t.label }}</option>
            </select>
            <div class="cm-colors" role="group" aria-label="Couleur">
              <button
                v-for="color in COURSES_MAGASIN_COLORS"
                :key="color"
                type="button"
                class="cm-color"
                :class="{ 'is-active': newMagasin.couleur === color }"
                :style="{ background: color }"
                :aria-label="`Couleur ${color}`"
                @click="newMagasin.couleur = color"
              />
            </div>
            <button type="submit" class="cm-add" :disabled="saving">Ajouter</button>
          </form>

          <ul class="cm-list">
            <li v-for="m in sortedMagasins" :key="m.id" class="cm-item">
              <template v-if="editingMagasinId === m.id">
                <input v-model="editMagasinDraft.nom" type="text" class="cm-edit-input" />
                <select v-model="editMagasinDraft.type">
                  <option v-for="t in COURSES_MAGASIN_TYPES" :key="t.id" :value="t.id">{{ t.label }}</option>
                </select>
                <div class="cm-colors">
                  <button
                    v-for="color in COURSES_MAGASIN_COLORS"
                    :key="color"
                    type="button"
                    class="cm-color"
                    :class="{ 'is-active': editMagasinDraft.couleur === color }"
                    :style="{ background: color }"
                    @click="editMagasinDraft.couleur = color"
                  />
                </div>
                <div class="cm-item-actions">
                  <button type="button" @click="saveEditMagasin">OK</button>
                  <button type="button" @click="editingMagasinId = null">Annuler</button>
                </div>
              </template>
              <template v-else>
                <span class="cm-dot" :style="{ background: m.couleur }" aria-hidden="true" />
                <span class="cm-name">{{ m.nom }}</span>
                <span class="cm-meta">{{ COURSES_MAGASIN_TYPES.find((t) => t.id === m.type)?.label }}</span>
                <div class="cm-item-actions">
                  <button type="button" :disabled="saving" aria-label="Monter" @click="moveMagasin(m.id, -1)">↑</button>
                  <button type="button" :disabled="saving" aria-label="Descendre" @click="moveMagasin(m.id, 1)">↓</button>
                  <button type="button" :disabled="saving" @click="startEditMagasin(m)">Renommer</button>
                  <button type="button" :disabled="saving" @click="removeMagasin(m.id)">Suppr.</button>
                </div>
              </template>
            </li>
          </ul>
        </div>

        <div v-show="tab === 'categories'" class="cm-body">
          <form class="cm-create cm-create--cat" @submit.prevent="submitCategorie">
            <input v-model="newCategorie.icone" type="text" class="cm-icone" maxlength="8" aria-label="Icône" />
            <input v-model="newCategorie.nom" type="text" placeholder="Nouveau rayon" required />
            <button type="submit" class="cm-add" :disabled="saving">Ajouter</button>
          </form>

          <ul class="cm-list">
            <li v-for="c in sortedCategories" :key="c.id" class="cm-item">
              <template v-if="editingCategorieId === c.id">
                <input v-model="editCategorieDraft.icone" type="text" class="cm-icone" maxlength="8" />
                <input v-model="editCategorieDraft.nom" type="text" class="cm-edit-input" />
                <div class="cm-item-actions">
                  <button type="button" @click="saveEditCategorie">OK</button>
                  <button type="button" @click="editingCategorieId = null">Annuler</button>
                </div>
              </template>
              <template v-else>
                <span class="cm-name">{{ c.icone }} {{ c.nom }}</span>
                <div class="cm-item-actions">
                  <button type="button" :disabled="saving" aria-label="Monter" @click="moveCategorie(c.id, -1)">↑</button>
                  <button type="button" :disabled="saving" aria-label="Descendre" @click="moveCategorie(c.id, 1)">↓</button>
                  <button type="button" :disabled="saving" @click="startEditCategorie(c)">Renommer</button>
                  <button type="button" :disabled="saving" @click="removeCategorie(c.id)">Suppr.</button>
                </div>
              </template>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cm-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: end center;
  background: rgba(20, 20, 30, 0.45);
}

@media (min-width: 640px) {
  .cm-overlay {
    place-items: center;
    padding: 1rem;
  }
}

.cm-modal {
  width: min(100%, 34rem);
  max-height: min(92vh, 42rem);
  overflow: auto;
  background: var(--color-background);
  border-radius: 18px 18px 0 0;
  border: 1px solid var(--color-border);
}

@media (min-width: 640px) {
  .cm-modal {
    border-radius: 18px;
  }
}

.cm-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.1rem 0.5rem;
  position: sticky;
  top: 0;
  background: var(--color-background);
  z-index: 1;
}

.cm-header h2 {
  margin: 0;
  font-size: 1.1rem;
}

.cm-close {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.cm-tabs {
  display: flex;
  gap: 0.35rem;
  padding: 0 1.1rem;
}

.cm-tab {
  flex: 1;
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-light);
  font-weight: 700;
  cursor: pointer;
}

.cm-tab.is-active {
  background: color-mix(in srgb, var(--color-primary) 40%, transparent);
  color: var(--color-text);
  border-color: color-mix(in srgb, var(--color-primary-dark) 40%, var(--color-border));
}

.cm-body {
  padding: 1rem 1.1rem 1.25rem;
}

.cm-create {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.cm-create--cat {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
}

.cm-create input,
.cm-create select,
.cm-edit-input {
  min-height: 44px;
  padding: 0.5rem 0.7rem;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
  font-size: 1rem;
}

.cm-icone {
  width: 3.5rem;
  text-align: center;
}

.cm-colors {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.cm-color {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
}

.cm-color.is-active {
  border-color: var(--color-text);
}

.cm-add {
  min-height: 44px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  color: #2c3e50;
  font-weight: 800;
  cursor: pointer;
}

.cm-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.cm-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem 0.6rem;
  padding: 0.65rem 0.7rem;
  border-radius: 12px;
  border: 1px solid var(--color-border);
}

.cm-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.cm-name {
  font-weight: 700;
  flex: 1;
  min-width: 6rem;
}

.cm-meta {
  font-size: 0.78rem;
  color: var(--color-text-light);
}

.cm-item-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  width: 100%;
}

.cm-item-actions button {
  min-height: 36px;
  padding: 0 0.55rem;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
}
</style>
