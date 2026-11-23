<script setup>
import { computed, ref, watch } from 'vue'
import AppConfirmDialog from '../common/AppConfirmDialog.vue'
import { COURSES_LISTE_STATUTS } from '../../constants/courses/courses.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  listes: { type: Array, default: () => [] },
  selectedListeId: { type: String, default: null },
  articles: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits([
  'close',
  'create',
  'update-liste',
  'close-liste',
  'reporter',
  'select-liste',
  'clear-filter',
  'delete-liste',
])

const draftNom = ref('')
const draftDate = ref('')
const creating = ref(false)
const closePanelForId = ref(null)
const reporterChoice = ref('new')
const reporterTargetId = ref('')
const editingId = ref(null)
const pendingDeleteListe = ref(null)

const openListes = computed(() =>
  props.listes.filter((l) => l.statut === COURSES_LISTE_STATUTS.OUVERTE),
)
const closedListes = computed(() =>
  props.listes.filter((l) => l.statut === COURSES_LISTE_STATUTS.FERMEE),
)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) {
      creating.value = false
      closePanelForId.value = null
      editingId.value = null
      pendingDeleteListe.value = null
    }
  },
)

function formatDate(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function restantsCount(listeId) {
  return props.articles.filter(
    (a) =>
      a.liste_id === listeId &&
      ['a_acheter', 'dans_panier', 'reporte'].includes(a.statut),
  ).length
}

function startCreate() {
  creating.value = true
  draftNom.value = ''
  draftDate.value = new Date().toISOString().slice(0, 10)
}

function submitCreate() {
  const nom = draftNom.value.trim()
  if (!nom || props.saving) return
  emit('create', { nom, date_liste: draftDate.value || undefined })
  creating.value = false
}

function startEdit(liste) {
  editingId.value = liste.id
  draftNom.value = liste.nom
  draftDate.value = liste.date_liste || ''
}

function saveEdit() {
  if (!editingId.value || props.saving) return
  emit('update-liste', editingId.value, {
    nom: draftNom.value.trim() || 'Liste',
    date_liste: draftDate.value || undefined,
  })
  editingId.value = null
}

function openClosePanel(listeId) {
  closePanelForId.value = listeId
  reporterChoice.value = 'new'
  reporterTargetId.value = ''
}

function confirmClose(listeId) {
  const restants = restantsCount(listeId)
  const reporterRestants = restants > 0 && reporterChoice.value !== 'keep'
  let targetListeId = null
  if (reporterRestants && reporterChoice.value === 'existing') {
    targetListeId = reporterTargetId.value || null
    if (!targetListeId) return
  }
  emit('close-liste', {
    listeId,
    reporterRestants,
    targetListeId: reporterChoice.value === 'new' ? null : targetListeId,
  })
  closePanelForId.value = null
}

function onReporter(listeId) {
  const other = openListes.value.filter((l) => l.id !== listeId)
  emit('reporter', {
    listeId,
    targetListeId: other[0]?.id ?? null,
  })
}

function selectListe(id) {
  emit('select-liste', id)
  emit('close')
}

function onDeleteListe(liste) {
  if (!liste?.id || props.saving) return
  pendingDeleteListe.value = liste
}

function confirmDeleteListe() {
  const liste = pendingDeleteListe.value
  pendingDeleteListe.value = null
  if (!liste?.id) return
  emit('delete-liste', liste.id)
}

function cancelDeleteListe() {
  pendingDeleteListe.value = null
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="clm-overlay" @click.self="emit('close')">
      <div class="clm-modal" role="dialog" aria-modal="true" aria-label="Mes listes de courses">
        <header class="clm-header">
          <h2>Mes listes de courses</h2>
          <button type="button" class="clm-close" aria-label="Fermer" @click="emit('close')">✕</button>
        </header>

        <p class="clm-intro">
          Crée une liste quand tu en as besoin, date-la, ferme-la ou reporte les articles non achetés.
          Aucune liste n’est imposée par défaut.
        </p>

        <div class="clm-toolbar">
          <button type="button" class="clm-btn clm-btn--primary" :disabled="saving" @click="startCreate">
            + Nouvelle liste
          </button>
          <button
            v-if="selectedListeId"
            type="button"
            class="clm-btn"
            @click="emit('clear-filter'); emit('close')"
          >
            Voir toutes les courses
          </button>
        </div>

        <form v-if="creating" class="clm-create" @submit.prevent="submitCreate">
          <label>
            <span>Nom</span>
            <input v-model="draftNom" type="text" required placeholder="ex. Courses du week-end" />
          </label>
          <label>
            <span>Date</span>
            <input v-model="draftDate" type="date" />
          </label>
          <div class="clm-create-actions">
            <button type="button" class="clm-btn" @click="creating = false">Annuler</button>
            <button type="submit" class="clm-btn clm-btn--primary" :disabled="saving">Créer</button>
          </div>
        </form>

        <p v-if="!listes.length && !creating" class="clm-empty">
          Pas encore de liste. Crée-en une pour regrouper tes courses à une date donnée.
        </p>

        <section v-if="openListes.length" class="clm-section">
          <h3>Ouvertes</h3>
          <ul class="clm-list">
            <li v-for="liste in openListes" :key="liste.id" class="clm-item">
              <template v-if="editingId === liste.id">
                <input v-model="draftNom" type="text" class="clm-edit-input" />
                <input v-model="draftDate" type="date" class="clm-edit-input" />
                <div class="clm-item-actions">
                  <button type="button" class="clm-btn clm-btn--small" @click="saveEdit">OK</button>
                  <button type="button" class="clm-btn clm-btn--small" @click="editingId = null">Annuler</button>
                </div>
              </template>
              <template v-else>
                <div class="clm-item-main">
                  <p class="clm-item-title">
                    {{ liste.nom }}
                    <span v-if="selectedListeId === liste.id" class="clm-badge">affichée</span>
                  </p>
                  <p class="clm-item-meta">
                    {{ formatDate(liste.date_liste) }}
                    · {{ restantsCount(liste.id) }} à acheter
                  </p>
                </div>
                <div class="clm-item-actions">
                  <button type="button" class="clm-btn clm-btn--small clm-btn--primary" @click="selectListe(liste.id)">
                    Afficher
                  </button>
                  <button type="button" class="clm-btn clm-btn--small" :disabled="saving" @click="startEdit(liste)">
                    Modifier
                  </button>
                  <button
                    v-if="restantsCount(liste.id) > 0"
                    type="button"
                    class="clm-btn clm-btn--small"
                    :disabled="saving"
                    @click="onReporter(liste.id)"
                  >
                    Reporter
                  </button>
                  <button
                    type="button"
                    class="clm-btn clm-btn--small"
                    :disabled="saving"
                    @click="openClosePanel(liste.id)"
                  >
                    Fermer
                  </button>
                </div>

                <div v-if="closePanelForId === liste.id" class="clm-panel">
                  <p v-if="restantsCount(liste.id) > 0">
                    {{ restantsCount(liste.id) }} article(s) encore à acheter
                  </p>
                  <p v-else>Tous les articles sont achetés — tu peux fermer.</p>
                  <template v-if="restantsCount(liste.id) > 0">
                    <label class="clm-radio">
                      <input v-model="reporterChoice" type="radio" value="new" />
                      Reporter vers une nouvelle liste
                    </label>
                    <label v-if="openListes.filter((l) => l.id !== liste.id).length" class="clm-radio">
                      <input v-model="reporterChoice" type="radio" value="existing" />
                      Reporter vers une liste existante
                    </label>
                    <select
                      v-if="reporterChoice === 'existing'"
                      v-model="reporterTargetId"
                      class="clm-select"
                    >
                      <option value="" disabled>Choisir…</option>
                      <option
                        v-for="l in openListes.filter((x) => x.id !== liste.id)"
                        :key="l.id"
                        :value="l.id"
                      >
                        {{ l.nom }} — {{ formatDate(l.date_liste) }}
                      </option>
                    </select>
                    <label class="clm-radio">
                      <input v-model="reporterChoice" type="radio" value="keep" />
                      Fermer sans reporter
                    </label>
                  </template>
                  <div class="clm-item-actions">
                    <button type="button" class="clm-btn clm-btn--small" @click="closePanelForId = null">
                      Annuler
                    </button>
                    <button
                      type="button"
                      class="clm-btn clm-btn--small clm-btn--primary"
                      :disabled="saving"
                      @click="confirmClose(liste.id)"
                    >
                      Confirmer
                    </button>
                  </div>
                </div>
              </template>
            </li>
          </ul>
        </section>

        <section v-if="closedListes.length" class="clm-section">
          <h3>Fermées</h3>
          <ul class="clm-list">
            <li v-for="liste in closedListes" :key="liste.id" class="clm-item clm-item--closed">
              <div class="clm-item-main">
                <p class="clm-item-title">{{ liste.nom }}</p>
                <p class="clm-item-meta">{{ formatDate(liste.date_liste) }} · fermée</p>
              </div>
              <div class="clm-item-actions">
                <button type="button" class="clm-btn clm-btn--small" @click="selectListe(liste.id)">
                  Consulter
                </button>
                <button
                  type="button"
                  class="clm-btn clm-btn--small clm-btn--danger"
                  :disabled="saving"
                  @click="onDeleteListe(liste)"
                >
                  Supprimer
                </button>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </Teleport>

  <AppConfirmDialog
    :open="Boolean(pendingDeleteListe)"
    title="Supprimer la liste ?"
    :message="
      pendingDeleteListe
        ? `Supprimer la liste « ${pendingDeleteListe.nom} » ? Les articles liés resteront disponibles hors liste.`
        : ''
    "
    confirm-label="Supprimer"
    cancel-label="Annuler"
    danger
    @confirm="confirmDeleteListe"
    @cancel="cancelDeleteListe"
  />
</template>

<style scoped>
.clm-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: end center;
  background: rgba(20, 20, 30, 0.45);
}

@media (min-width: 640px) {
  .clm-overlay {
    place-items: center;
    padding: 1rem;
  }
}

.clm-modal {
  width: min(100%, 34rem);
  max-height: min(92vh, 44rem);
  overflow: auto;
  background: var(--color-background);
  border-radius: 18px 18px 0 0;
  border: 1px solid var(--color-border);
  padding-bottom: 1.25rem;
}

@media (min-width: 640px) {
  .clm-modal {
    border-radius: 18px;
  }
}

.clm-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.1rem 0.35rem;
  position: sticky;
  top: 0;
  background: var(--color-background);
  z-index: 1;
}

.clm-header h2 {
  margin: 0;
  font-size: 1.15rem;
}

.clm-close {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.clm-intro {
  margin: 0 1.1rem 0.85rem;
  font-size: 0.88rem;
  color: var(--color-text-light);
  line-height: 1.4;
}

.clm-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  padding: 0 1.1rem 0.85rem;
}

.clm-create {
  margin: 0 1.1rem 1rem;
  padding: 0.75rem;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.clm-create label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text-light);
}

.clm-create input,
.clm-edit-input,
.clm-select {
  min-height: 44px;
  padding: 0.5rem 0.7rem;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
  font-size: 1rem;
}

.clm-create-actions,
.clm-item-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.clm-empty {
  margin: 0 1.1rem;
  padding: 1.25rem;
  text-align: center;
  border-radius: 14px;
  border: 1px dashed color-mix(in srgb, var(--color-primary) 45%, var(--color-border));
  color: var(--color-text-light);
  font-size: 0.92rem;
  line-height: 1.45;
}

.clm-section {
  padding: 0 1.1rem 0.75rem;
}

.clm-section h3 {
  margin: 0 0 0.5rem;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-light);
}

.clm-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.clm-item {
  padding: 0.75rem;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 30%, var(--color-border));
  background: color-mix(in srgb, var(--color-background) 92%, var(--color-primary) 8%);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.clm-item--closed {
  opacity: 0.78;
}

.clm-item-title {
  margin: 0;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.clm-item-meta {
  margin: 0.15rem 0 0;
  font-size: 0.82rem;
  color: var(--color-text-light);
}

.clm-badge {
  font-size: 0.68rem;
  font-weight: 800;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 45%, transparent);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.clm-btn {
  min-height: 44px;
  padding: 0 0.85rem;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  font-weight: 700;
  cursor: pointer;
}

.clm-btn--small {
  min-height: 36px;
  font-size: 0.8rem;
  padding: 0 0.65rem;
}

.clm-btn--primary {
  border: none;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  color: #2c3e50;
}

.clm-btn--danger {
  border-color: color-mix(in srgb, #c07878 50%, var(--color-border));
}

.clm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.clm-panel {
  margin-top: 0.25rem;
  padding: 0.65rem;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 0.88rem;
}

.clm-radio {
  display: flex;
  gap: 0.4rem;
  align-items: flex-start;
  font-weight: 500;
}
</style>
