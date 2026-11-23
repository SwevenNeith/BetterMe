<script setup>
import { reactive, ref, watch } from 'vue'
import AppConfirmDialog from '../common/AppConfirmDialog.vue'
import ColorPickerField from '../common/ColorPickerField.vue'
import EmojiPickerField from '../common/EmojiPickerField.vue'
import {
  COURSES_DEFAULT_CATEGORIE_COULEUR,
  COURSES_DEFAULT_ICONE,
  COURSES_DEFAULT_MAGASIN_COULEUR,
  COURSES_MAGASIN_TYPES,
} from '../../constants/courses/courses.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** 'magasin' | 'categorie' */
  kind: { type: String, default: 'magasin' },
  entity: { type: Object, default: null },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'save', 'delete'])

const confirmDeleteOpen = ref(false)

const draft = reactive({
  nom: '',
  type: 'physique',
  couleur: COURSES_DEFAULT_MAGASIN_COULEUR,
  url: '',
  icone: COURSES_DEFAULT_ICONE,
})

watch(
  () => [props.open, props.entity, props.kind],
  ([open]) => {
    if (!open) {
      confirmDeleteOpen.value = false
      return
    }
    if (!props.entity) return
    draft.nom = props.entity.nom || ''
    if (props.kind === 'magasin') {
      draft.type = props.entity.type || 'physique'
      draft.couleur = props.entity.couleur || COURSES_DEFAULT_MAGASIN_COULEUR
      draft.url = props.entity.url || ''
    } else {
      draft.icone = props.entity.icone || COURSES_DEFAULT_ICONE
      draft.couleur = props.entity.couleur || COURSES_DEFAULT_CATEGORIE_COULEUR
    }
  },
  { immediate: true },
)

function onSave() {
  const nom = draft.nom.trim()
  if (!nom || !props.entity?.id || props.saving) return
  if (props.kind === 'magasin') {
    emit('save', {
      kind: 'magasin',
      id: props.entity.id,
      payload: {
        nom,
        type: draft.type,
        couleur: draft.couleur,
        url: draft.url.trim() || null,
      },
    })
  } else {
    emit('save', {
      kind: 'categorie',
      id: props.entity.id,
      payload: {
        nom,
        icone: (draft.icone || '').trim() || COURSES_DEFAULT_ICONE,
        couleur: draft.couleur || COURSES_DEFAULT_CATEGORIE_COULEUR,
      },
    })
  }
}

function onDelete() {
  if (!props.entity?.id || props.saving) return
  confirmDeleteOpen.value = true
}

function confirmDelete() {
  confirmDeleteOpen.value = false
  if (!props.entity?.id) return
  emit('delete', { kind: props.kind, id: props.entity.id })
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open && entity" class="cge-overlay" @click.self="emit('close')">
      <div
        class="cge-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="kind === 'magasin' ? 'Personnaliser le magasin' : 'Personnaliser le rayon'"
      >
        <header class="cge-header">
          <h2>{{ kind === 'magasin' ? 'Magasin' : 'Rayon' }}</h2>
          <button type="button" class="cge-close" aria-label="Fermer" @click="emit('close')">✕</button>
        </header>

        <form class="cge-form" @submit.prevent="onSave">
          <label class="cge-field">
            <span>Nom</span>
            <input v-model="draft.nom" type="text" required maxlength="120" />
          </label>

          <template v-if="kind === 'magasin'">
            <label class="cge-field">
              <span>Type</span>
              <select v-model="draft.type">
                <option v-for="t in COURSES_MAGASIN_TYPES" :key="t.id" :value="t.id">
                  {{ t.label }}
                </option>
              </select>
            </label>

            <div class="cge-field">
              <span>Couleur d’enseigne</span>
              <ColorPickerField v-model="draft.couleur" />
            </div>

            <label class="cge-field">
              <span>Lien <em>(facultatif)</em></span>
              <input v-model="draft.url" type="url" placeholder="https://…" />
            </label>
          </template>

          <template v-else>
            <div class="cge-field">
              <span>Icône</span>
              <EmojiPickerField
                v-model="draft.icone"
                compact
                teleport
                :clearable="false"
                label="Choisir un emoji"
              />
            </div>

            <div class="cge-field">
              <span>Couleur</span>
              <ColorPickerField v-model="draft.couleur" />
            </div>
          </template>

          <div class="cge-actions">
            <button type="button" class="cge-delete" :disabled="saving" @click="onDelete">
              Supprimer
            </button>
            <button type="button" class="cge-cancel" :disabled="saving" @click="emit('close')">
              Annuler
            </button>
            <button type="submit" class="cge-save" :disabled="saving || !draft.nom.trim()">
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>

  <AppConfirmDialog
    :open="confirmDeleteOpen"
    :title="kind === 'magasin' ? 'Supprimer le magasin ?' : 'Supprimer le rayon ?'"
    message="Les articles liés seront conservés."
    confirm-label="Supprimer"
    cancel-label="Annuler"
    danger
    @confirm="confirmDelete"
    @cancel="confirmDeleteOpen = false"
  />
</template>

<style scoped>
.cge-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: end center;
  background: rgba(20, 20, 30, 0.45);
}

@media (min-width: 640px) {
  .cge-overlay {
    place-items: center;
    padding: 1rem;
  }
}

.cge-modal {
  width: min(100%, 28rem);
  max-height: min(92vh, 36rem);
  overflow: auto;
  background: var(--color-background);
  border-radius: 18px 18px 0 0;
  border: 1px solid var(--color-border);
}

@media (min-width: 640px) {
  .cge-modal {
    border-radius: 18px;
  }
}

.cge-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.1rem 0.4rem;
  position: sticky;
  top: 0;
  background: var(--color-background);
  z-index: 1;
}

.cge-header h2 {
  margin: 0;
  font-size: 1.1rem;
}

.cge-close {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.cge-form {
  padding: 0.5rem 1.1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.cge-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-text-light);
}

.cge-field em {
  font-style: normal;
  font-weight: 500;
  opacity: 0.75;
}

.cge-field input,
.cge-field select {
  min-height: 44px;
  padding: 0.55rem 0.7rem;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
  font-size: 1rem;
  font-weight: 500;
}

.cge-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.25rem;
}

.cge-save,
.cge-cancel,
.cge-delete {
  min-height: 48px;
  padding: 0 1rem;
  border-radius: 12px;
  font-weight: 800;
  cursor: pointer;
}

.cge-save {
  margin-left: auto;
  border: none;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  color: #2c3e50;
}

.cge-cancel {
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
}

.cge-delete {
  border: 1px solid color-mix(in srgb, #c07878 50%, var(--color-border));
  background: transparent;
  color: var(--color-text);
}

.cge-save:disabled,
.cge-cancel:disabled,
.cge-delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
