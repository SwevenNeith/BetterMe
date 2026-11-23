<script setup>
import { computed, reactive, ref, watch } from 'vue'
import AppConfirmDialog from '../common/AppConfirmDialog.vue'
import {
  COURSES_DUREE_UNITES,
  COURSES_PRIORITES,
  COURSES_STATUT_LABELS,
  COURSES_STATUTS,
} from '../../constants/courses/courses.js'
import ReadingCollectionCombobox from '../lecture/ReadingCollectionCombobox.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  article: { type: Object, default: null },
  magasins: { type: Array, default: () => [] },
  categories: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'save', 'delete'])

const form = reactive(emptyForm())
const duraPanelOpen = ref(false)
const moreOpen = ref(false)
const imagePreviewBroken = ref(false)
const confirmDeleteOpen = ref(false)

const isEdit = computed(() => Boolean(props.article?.id))
const panelOpen = computed(() => form.suivi_durabilite || duraPanelOpen.value)

const magasinNames = computed(() => props.magasins.map((m) => m.nom).filter(Boolean))
const rayonNames = computed(() => props.categories.map((c) => c.nom).filter(Boolean))

function emptyForm() {
  return {
    nom: '',
    marque: '',
    quantite: '',
    unite: '',
    magasin_nom: '',
    categorie_nom: '',
    priorite: '',
    prix: '',
    note: '',
    lien: '',
    lien_image: '',
    statut: COURSES_STATUTS.A_ACHETER,
    suivi_durabilite: false,
    date_dernier_achat: '',
    duree_valeur: '',
    duree_unite: 'mois',
  }
}

function fillFromArticle(article) {
  Object.assign(form, emptyForm())
  moreOpen.value = false
  imagePreviewBroken.value = false
  if (!article) {
    duraPanelOpen.value = false
    return
  }
  form.nom = article.nom || ''
  form.marque = article.marque || ''
  form.quantite = article.quantite ?? ''
  form.unite = article.unite || ''
  form.magasin_nom =
    article.magasin?.nom ||
    props.magasins.find((m) => m.id === article.magasin_id)?.nom ||
    ''
  form.categorie_nom =
    article.categorie?.nom ||
    props.categories.find((c) => c.id === article.categorie_id)?.nom ||
    ''
  form.priorite = article.priorite ?? ''
  form.prix = article.prix ?? article.prix_estime ?? ''
  form.note = article.note || ''
  form.lien = article.lien || ''
  form.lien_image = article.lien_image || ''
  form.statut = article.statut || COURSES_STATUTS.A_ACHETER
  form.suivi_durabilite = Boolean(article.suivi_durabilite)
  form.date_dernier_achat = article.date_dernier_achat || ''
  form.duree_valeur = article.duree_valeur ?? ''
  form.duree_unite = article.duree_unite || 'mois'
  duraPanelOpen.value = Boolean(article.suivi_durabilite)
  moreOpen.value = Boolean(
    article.note || article.priorite || article.suivi_durabilite,
  )
}

watch(
  () => [props.open, props.article],
  ([open]) => {
    if (!open) {
      confirmDeleteOpen.value = false
      return
    }
    fillFromArticle(props.article)
  },
  { immediate: true },
)

function toggleDuraPanel() {
  duraPanelOpen.value = !duraPanelOpen.value
}

function onSuiviChange(event) {
  form.suivi_durabilite = event.target.checked
  if (form.suivi_durabilite) duraPanelOpen.value = true
}

function onSubmit() {
  if (!form.nom.trim() || props.saving) return
  emit('save', {
    id: props.article?.id || null,
    payload: {
      nom: form.nom,
      marque: form.marque || null,
      quantite: form.quantite === '' ? null : Number(form.quantite),
      unite: form.unite || null,
      magasin_nom: form.magasin_nom,
      categorie_nom: form.categorie_nom,
      priorite: form.priorite === '' ? null : Number(form.priorite),
      prix: form.prix === '' ? null : Number(form.prix),
      note: form.note || null,
      lien: form.lien || null,
      lien_image: form.lien_image || null,
      statut: form.statut || COURSES_STATUTS.A_ACHETER,
      suivi_durabilite: form.suivi_durabilite,
      date_dernier_achat: form.suivi_durabilite ? form.date_dernier_achat || null : null,
      duree_valeur: form.suivi_durabilite
        ? form.duree_valeur === ''
          ? null
          : Number(form.duree_valeur)
        : null,
      duree_unite: form.suivi_durabilite ? form.duree_unite || null : null,
    },
  })
}

function onDelete() {
  if (!props.article?.id || props.saving) return
  confirmDeleteOpen.value = true
}

function confirmDelete() {
  confirmDeleteOpen.value = false
  if (!props.article?.id) return
  emit('delete', props.article.id)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="caf-overlay" @click.self="emit('close')">
      <div
        class="caf-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="isEdit ? 'Modifier l’article' : 'Nouvel article'"
      >
        <header class="caf-header">
          <h2>{{ isEdit ? 'Modifier l’article' : 'Nouvel article' }}</h2>
          <button type="button" class="caf-close" aria-label="Fermer" @click="emit('close')">✕</button>
        </header>

        <form class="caf-form" @submit.prevent="onSubmit">
          <label class="caf-field">
            <span>Nom</span>
            <input v-model="form.nom" type="text" required maxlength="200" />
          </label>

          <label class="caf-field">
            <span>Marque <em>(facultatif)</em></span>
            <input v-model="form.marque" type="text" maxlength="120" />
          </label>

          <div class="caf-row">
            <label class="caf-field">
              <span>Quantité <em>(facultatif)</em></span>
              <input v-model="form.quantite" type="number" min="0.001" step="any" />
            </label>
            <label class="caf-field">
              <span>Unité <em>(facultatif)</em></span>
              <input v-model="form.unite" type="text" placeholder="ex. L, kg" />
            </label>
            <label class="caf-field">
              <span>Prix <em>(facultatif)</em></span>
              <input v-model="form.prix" type="number" min="0" step="0.01" />
            </label>
          </div>

          <label class="caf-field">
            <span>Lien image <em>(facultatif)</em></span>
            <input
              v-model="form.lien_image"
              type="url"
              placeholder="https://…/photo.jpg"
              @input="imagePreviewBroken = false"
            />
          </label>
          <p v-if="form.lien_image.trim()" class="caf-preview-wrap">
            <img
              v-show="!imagePreviewBroken"
              class="caf-preview"
              :src="form.lien_image.trim()"
              alt=""
              loading="lazy"
              @error="imagePreviewBroken = true"
              @load="imagePreviewBroken = false"
            />
            <span class="caf-hint-inline">
              {{
                imagePreviewBroken
                  ? 'Image inaccessible — vérifie l’URL.'
                  : 'Aperçu de l’image sur la carte.'
              }}
            </span>
          </p>

          <label class="caf-field">
            <span>Lien vers l’article <em>(facultatif)</em></span>
            <input v-model="form.lien" type="url" placeholder="https://…" />
          </label>

          <div class="caf-field">
            <span>Magasin <em>(tape un nom — créé si nouveau)</em></span>
            <ReadingCollectionCombobox
              v-model="form.magasin_nom"
              :collections="magasinNames"
              appearance="form"
              placeholder="ex. Carrefour, Amazon…"
              empty-message="Aucun magasin"
              toggle-aria-label="Magasins existants"
              :disabled="saving"
            />
          </div>

          <div class="caf-field">
            <span>Rayon <em>(tape un nom — créé si nouveau)</em></span>
            <ReadingCollectionCombobox
              v-model="form.categorie_nom"
              :collections="rayonNames"
              appearance="form"
              placeholder="ex. Fruits, Hygiène…"
              empty-message="Aucun rayon"
              toggle-aria-label="Rayons existants"
              :disabled="saving"
            />
          </div>

          <p class="caf-hint-inline">
            Après enregistrement, tu pourras l’ajouter à une liste de courses depuis la fiche article.
            Pour personnaliser un magasin ou un rayon, clique sur son bandeau dans la vitrine.
          </p>

          <button
            type="button"
            class="caf-more-toggle"
            :aria-expanded="moreOpen"
            @click="moreOpen = !moreOpen"
          >
            <span>Options avancées</span>
            <span aria-hidden="true">{{ moreOpen ? '▾' : '▸' }}</span>
          </button>

          <template v-if="moreOpen">
            <div class="caf-row">
              <label class="caf-field">
                <span>Priorité</span>
                <select v-model="form.priorite">
                  <option value="">Aucune</option>
                  <option v-for="p in COURSES_PRIORITES" :key="p.id" :value="p.id">
                    {{ p.label }} ({{ p.marker }})
                  </option>
                </select>
              </label>
              <label class="caf-field">
                <span>Statut</span>
                <select v-model="form.statut">
                  <option
                    v-for="(label, key) in COURSES_STATUT_LABELS"
                    :key="key"
                    :value="key"
                  >{{ label }}</option>
                </select>
              </label>
            </div>

            <label class="caf-field">
              <span>Note</span>
              <textarea v-model="form.note" rows="2" />
            </label>

            <section class="caf-dura">
              <button
                type="button"
                class="caf-dura-toggle"
                :aria-expanded="panelOpen"
                @click="toggleDuraPanel"
              >
                <span>Suivre la durée de vie</span>
                <span aria-hidden="true">{{ panelOpen ? '▾' : '▸' }}</span>
              </button>
              <div v-show="panelOpen" class="caf-dura-body">
                <label class="caf-switch">
                  <input
                    type="checkbox"
                    :checked="form.suivi_durabilite"
                    @change="onSuiviChange"
                  />
                  <span>Activer le suivi (facultatif)</span>
                </label>
                <template v-if="form.suivi_durabilite">
                  <label class="caf-field">
                    <span>Date du dernier achat</span>
                    <input v-model="form.date_dernier_achat" type="date" />
                  </label>
                  <div class="caf-row">
                    <label class="caf-field">
                      <span>Durée prévue</span>
                      <input v-model="form.duree_valeur" type="number" min="1" step="1" />
                    </label>
                    <label class="caf-field">
                      <span>Unité</span>
                      <select v-model="form.duree_unite">
                        <option
                          v-for="u in COURSES_DUREE_UNITES"
                          :key="u.id"
                          :value="u.id"
                        >{{ u.label }}</option>
                      </select>
                    </label>
                  </div>
                </template>
              </div>
            </section>
          </template>

          <div class="caf-actions">
            <button
              v-if="isEdit"
              type="button"
              class="caf-delete"
              :disabled="saving"
              @click="onDelete"
            >
              Supprimer
            </button>
            <button type="button" class="caf-cancel" :disabled="saving" @click="emit('close')">
              Annuler
            </button>
            <button type="submit" class="caf-save" :disabled="saving || !form.nom.trim()">
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>

  <AppConfirmDialog
    :open="confirmDeleteOpen"
    title="Supprimer l’article ?"
    message="Cette action est définitive."
    confirm-label="Supprimer"
    cancel-label="Annuler"
    danger
    @confirm="confirmDelete"
    @cancel="confirmDeleteOpen = false"
  />
</template>

<style scoped>
.caf-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: end center;
  padding: 0;
  background: rgba(20, 20, 30, 0.45);
}

@media (min-width: 640px) {
  .caf-overlay {
    place-items: center;
    padding: 1rem;
  }
}

.caf-modal {
  width: min(100%, 32rem);
  max-height: min(94vh, 42rem);
  overflow: auto;
  background: var(--color-background);
  border-radius: 18px 18px 0 0;
  border: 1px solid var(--color-border);
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.18);
}

@media (min-width: 640px) {
  .caf-modal {
    border-radius: 18px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.2);
  }
}

.caf-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.1rem 0.5rem;
  position: sticky;
  top: 0;
  background: var(--color-background);
  z-index: 1;
}

.caf-header h2 {
  margin: 0;
  font-size: 1.1rem;
}

.caf-close {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  font-size: 1.1rem;
}

.caf-form {
  padding: 0.5rem 1.1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.caf-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-text-light);
  flex: 1;
  min-width: 0;
}

.caf-field em {
  font-style: normal;
  font-weight: 500;
  opacity: 0.75;
}

.caf-field input,
.caf-field select,
.caf-field textarea {
  min-height: 44px;
  padding: 0.55rem 0.7rem;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
  font-size: 1rem;
  font-weight: 500;
}

.caf-field textarea {
  min-height: 4rem;
  resize: vertical;
}

.caf-row {
  display: flex;
  gap: 0.55rem;
  flex-wrap: wrap;
  align-items: flex-end;
}

.caf-preview-wrap {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0;
}

.caf-preview {
  width: 52px;
  height: 52px;
  object-fit: cover;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
}

.caf-hint-inline {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--color-text-light);
  line-height: 1.4;
}

.caf-more-toggle {
  width: 100%;
  min-height: 44px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.55rem 0.75rem;
  border-radius: 10px;
  border: 1px dashed var(--color-border);
  background: transparent;
  color: var(--color-text-light);
  font-weight: 700;
  cursor: pointer;
}

.caf-dura {
  border-radius: 12px;
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.caf-dura-toggle {
  width: 100%;
  min-height: 48px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.65rem 0.85rem;
  border: none;
  background: color-mix(in srgb, var(--color-secondary) 12%, transparent);
  color: var(--color-text);
  font-weight: 700;
  cursor: pointer;
}

.caf-dura-body {
  padding: 0.75rem 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.caf-switch {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--color-text);
}

.caf-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.35rem;
}

.caf-save,
.caf-cancel,
.caf-delete {
  min-height: 48px;
  padding: 0 1rem;
  border-radius: 12px;
  font-weight: 800;
  cursor: pointer;
}

.caf-save {
  margin-left: auto;
  border: none;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  color: #2c3e50;
}

.caf-cancel {
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
}

.caf-delete {
  border: 1px solid color-mix(in srgb, #c07878 50%, var(--color-border));
  background: transparent;
  color: var(--color-text);
}

.caf-save:disabled,
.caf-cancel:disabled,
.caf-delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
