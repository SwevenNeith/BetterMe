<script setup>
import { computed, ref, watch } from 'vue'
import { COURSES_LISTE_STATUTS } from '../../constants/courses/courses.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  listes: { type: Array, default: () => [] },
  article: { type: Object, default: null },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'select', 'create-and-select'])

const mode = ref('pick') // pick | create
const draftNom = ref('')
const draftDate = ref('')

const openListes = computed(() =>
  props.listes.filter((l) => l.statut === COURSES_LISTE_STATUTS.OUVERTE),
)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    mode.value = openListes.value.length ? 'pick' : 'create'
    draftNom.value = ''
    draftDate.value = new Date().toISOString().slice(0, 10)
  },
)

function formatDate(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function selectListe(id) {
  if (!id || props.saving) return
  emit('select', id)
}

function submitCreate() {
  const nom = draftNom.value.trim()
  if (!nom || props.saving) return
  emit('create-and-select', {
    nom,
    date_liste: draftDate.value || undefined,
  })
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="cpl-overlay" @click.self="emit('close')">
      <div
        class="cpl-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Choisir une liste de courses"
      >
        <header class="cpl-header">
          <h2>Ajouter à une liste</h2>
          <button type="button" class="cpl-close" aria-label="Fermer" @click="emit('close')">✕</button>
        </header>

        <p v-if="article" class="cpl-intro">
          Article : <strong>{{ article.nom }}</strong>
        </p>

        <div class="cpl-tabs">
          <button
            type="button"
            class="cpl-tab"
            :class="{ 'is-active': mode === 'pick' }"
            @click="mode = 'pick'"
          >
            Liste existante
          </button>
          <button
            type="button"
            class="cpl-tab"
            :class="{ 'is-active': mode === 'create' }"
            @click="mode = 'create'"
          >
            Nouvelle liste
          </button>
        </div>

        <div v-if="mode === 'pick'" class="cpl-body">
          <p v-if="!openListes.length" class="cpl-empty">
            Aucune liste ouverte. Crée-en une nouvelle.
          </p>
          <ul v-else class="cpl-list">
            <li v-for="liste in openListes" :key="liste.id">
              <button
                type="button"
                class="cpl-option"
                :class="{ 'is-current': article?.liste_id === liste.id }"
                :disabled="saving"
                @click="selectListe(liste.id)"
              >
                <span class="cpl-option-title">{{ liste.nom }}</span>
                <span class="cpl-option-meta">{{ formatDate(liste.date_liste) }}</span>
              </button>
            </li>
          </ul>
        </div>

        <form v-else class="cpl-create" @submit.prevent="submitCreate">
          <label>
            <span>Nom de la liste</span>
            <input
              v-model="draftNom"
              type="text"
              required
              placeholder="ex. Courses du week-end"
              maxlength="120"
            />
          </label>
          <label>
            <span>Date <em>(facultatif)</em></span>
            <input v-model="draftDate" type="date" />
          </label>
          <div class="cpl-create-actions">
            <button type="button" class="cpl-btn" @click="emit('close')">Annuler</button>
            <button
              type="submit"
              class="cpl-btn cpl-btn--primary"
              :disabled="saving || !draftNom.trim()"
            >
              Créer et y ajouter
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cpl-overlay {
  position: fixed;
  inset: 0;
  z-index: 95;
  display: grid;
  place-items: end center;
  background: rgba(20, 20, 30, 0.45);
}

@media (min-width: 640px) {
  .cpl-overlay {
    place-items: center;
    padding: 1rem;
  }
}

.cpl-modal {
  width: min(100%, 28rem);
  max-height: min(92vh, 36rem);
  overflow: auto;
  background: var(--color-background);
  border-radius: 18px 18px 0 0;
  border: 1px solid var(--color-border);
}

@media (min-width: 640px) {
  .cpl-modal {
    border-radius: 18px;
  }
}

.cpl-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.1rem 0.35rem;
}

.cpl-header h2 {
  margin: 0;
  font-size: 1.1rem;
}

.cpl-close {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.cpl-intro {
  margin: 0 1.1rem 0.75rem;
  font-size: 0.9rem;
  color: var(--color-text-light);
}

.cpl-tabs {
  display: flex;
  gap: 0.35rem;
  padding: 0 1.1rem 0.75rem;
}

.cpl-tab {
  flex: 1;
  min-height: 40px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-light);
  font-weight: 700;
  cursor: pointer;
}

.cpl-tab.is-active {
  background: color-mix(in srgb, var(--color-primary) 40%, transparent);
  color: var(--color-text);
  border-color: color-mix(in srgb, var(--color-primary-dark) 35%, var(--color-border));
}

.cpl-body {
  padding: 0 1.1rem 1.15rem;
}

.cpl-empty {
  margin: 0;
  padding: 1rem;
  text-align: center;
  border-radius: 12px;
  border: 1px dashed var(--color-border);
  color: var(--color-text-light);
  font-size: 0.9rem;
}

.cpl-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.cpl-option {
  width: 100%;
  min-height: 52px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.7rem 0.85rem;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-background) 90%, var(--color-primary) 10%);
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
}

.cpl-option.is-current {
  border-color: color-mix(in srgb, var(--color-primary-dark) 45%, var(--color-border));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 30%, transparent);
}

.cpl-option-title {
  font-weight: 750;
}

.cpl-option-meta {
  font-size: 0.8rem;
  color: var(--color-text-light);
}

.cpl-create {
  padding: 0 1.1rem 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.cpl-create label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text-light);
}

.cpl-create em {
  font-style: normal;
  font-weight: 500;
  opacity: 0.75;
}

.cpl-create input {
  min-height: 44px;
  padding: 0.5rem 0.7rem;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
  font-size: 1rem;
}

.cpl-create-actions {
  display: flex;
  gap: 0.45rem;
}

.cpl-btn {
  flex: 1;
  min-height: 48px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  font-weight: 750;
  cursor: pointer;
}

.cpl-btn--primary {
  border: none;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  color: #2c3e50;
}

.cpl-btn:disabled,
.cpl-option:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
