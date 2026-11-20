<script setup>
import { computed, reactive, ref, watch } from 'vue'
import {
  COURSES_DEFAULT_ICONE,
  COURSES_DUREE_UNITES,
  COURSES_PRIORITES,
  COURSES_STATUT_LABELS,
  COURSES_STATUTS,
} from '../../constants/courses/courses.js'

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

const isEdit = computed(() => Boolean(props.article?.id))
const panelOpen = computed(() => form.suivi_durabilite || duraPanelOpen.value)

function emptyForm() {
  return {
    nom: '',
    quantite: 1,
    unite: '',
    magasin_id: '',
    categorie_id: '',
    priorite: '',
    prix_estime: '',
    note: '',
    lien: '',
    icone: COURSES_DEFAULT_ICONE,
    statut: COURSES_STATUTS.A_ACHETER,
    suivi_durabilite: false,
    date_dernier_achat: '',
    duree_valeur: '',
    duree_unite: 'mois',
  }
}

function fillFromArticle(article) {
  Object.assign(form, emptyForm())
  if (!article) {
    duraPanelOpen.value = false
    return
  }
  form.nom = article.nom || ''
  form.quantite = article.quantite ?? 1
  form.unite = article.unite || ''
  form.magasin_id = article.magasin_id || ''
  form.categorie_id = article.categorie_id || ''
  form.priorite = article.priorite ?? ''
  form.prix_estime = article.prix_estime ?? ''
  form.note = article.note || ''
  form.lien = article.lien || ''
  form.icone = article.icone || COURSES_DEFAULT_ICONE
  form.statut = article.statut || COURSES_STATUTS.A_ACHETER
  form.suivi_durabilite = Boolean(article.suivi_durabilite)
  form.date_dernier_achat = article.date_dernier_achat || ''
  form.duree_valeur = article.duree_valeur ?? ''
  form.duree_unite = article.duree_unite || 'mois'
  duraPanelOpen.value = Boolean(article.suivi_durabilite)
}

watch(
  () => [props.open, props.article],
  ([open]) => {
    if (open) fillFromArticle(props.article)
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
      quantite: form.quantite,
      unite: form.unite || null,
      magasin_id: form.magasin_id || null,
      categorie_id: form.categorie_id || null,
      priorite: form.priorite === '' ? null : Number(form.priorite),
      prix_estime: form.prix_estime === '' ? null : Number(form.prix_estime),
      note: form.note || null,
      lien: form.lien || null,
      icone: form.icone || COURSES_DEFAULT_ICONE,
      statut: form.statut,
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
  if (!window.confirm('Supprimer cet article ?')) return
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

          <div class="caf-row">
            <label class="caf-field">
              <span>Quantité</span>
              <input v-model.number="form.quantite" type="number" min="0.001" step="any" />
            </label>
            <label class="caf-field">
              <span>Unité</span>
              <input v-model="form.unite" type="text" placeholder="ex. L, kg, pcs" />
            </label>
            <label class="caf-field caf-field--icone">
              <span>Icône</span>
              <input v-model="form.icone" type="text" maxlength="8" />
            </label>
          </div>

          <label class="caf-field">
            <span>Magasin</span>
            <select v-model="form.magasin_id">
              <option value="">N’importe où</option>
              <option v-for="m in magasins" :key="m.id" :value="m.id">{{ m.nom }}</option>
            </select>
          </label>

          <label class="caf-field">
            <span>Rayon</span>
            <select v-model="form.categorie_id">
              <option value="">Sans rayon</option>
              <option v-for="c in categories" :key="c.id" :value="c.id">
                {{ c.icone }} {{ c.nom }}
              </option>
            </select>
          </label>

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
              <span>Prix estimé</span>
              <input v-model="form.prix_estime" type="number" min="0" step="0.01" />
            </label>
          </div>

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

          <label class="caf-field">
            <span>Note</span>
            <textarea v-model="form.note" rows="2" />
          </label>

          <label class="caf-field">
            <span>Lien</span>
            <input v-model="form.lien" type="url" placeholder="https://…" />
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
                <p class="caf-hint">
                  Pas de date d’échéance d’achat : seulement une estimation de renouvellement.
                </p>
              </template>
            </div>
          </section>

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
  max-height: min(94vh, 40rem);
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

.caf-field--icone {
  max-width: 5.5rem;
}

.caf-row {
  display: flex;
  gap: 0.55rem;
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

.caf-hint {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--color-text-light);
  line-height: 1.35;
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
