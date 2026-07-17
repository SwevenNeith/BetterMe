<script setup>
import { computed, onUnmounted, reactive, ref, watch } from 'vue'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  /** Chapitre existant → mode édition */
  chapter: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['close', 'submit'])

const form = reactive({
  chapterNumber: '',
  charactersMet: '',
  worldBuilding: '',
  scene: '',
})
const errorMessage = ref('')

const isEdit = computed(() => Boolean(props.chapter?.id))

function fillFromChapter(chapter) {
  form.chapterNumber = String(chapter?.chapter_number ?? '')
  form.charactersMet = String(chapter?.characters_met ?? '')
  form.worldBuilding = String(chapter?.world_building ?? '')
  form.scene = String(chapter?.scene ?? '')
  errorMessage.value = ''
}

function resetForm() {
  form.chapterNumber = ''
  form.charactersMet = ''
  form.worldBuilding = ''
  form.scene = ''
  errorMessage.value = ''
}

function handleClose() {
  if (props.disabled) return
  resetForm()
  emit('close')
}

function onOverlayClick(event) {
  if (event.target === event.currentTarget) handleClose()
}

function onKeydown(event) {
  if (!props.open || props.disabled) return
  if (event.key === 'Escape') handleClose()
}

function submit() {
  const chapterNumber = form.chapterNumber.trim()
  if (!chapterNumber) {
    errorMessage.value = 'Indique le numéro du chapitre.'
    return
  }
  emit('submit', {
    chapterNumber,
    charactersMet: form.charactersMet.trim(),
    worldBuilding: form.worldBuilding.trim(),
    scene: form.scene.trim(),
  })
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      if (props.chapter) fillFromChapter(props.chapter)
      else resetForm()
      document.addEventListener('keydown', onKeydown)
    } else {
      document.removeEventListener('keydown', onKeydown)
    }
  },
)

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="spoil-chapter-modal"
      role="dialog"
      aria-modal="true"
      :aria-label="isEdit ? 'Modifier un chapitre' : 'Ajouter un chapitre'"
      @click="onOverlayClick"
    >
      <form class="spoil-chapter-panel" @click.stop @submit.prevent="submit">
        <header class="spoil-chapter-header">
          <h3 class="spoil-chapter-title">
            {{ isEdit ? 'Modifier le chapitre' : 'Ajouter un chapitre' }}
          </h3>
          <button
            type="button"
            class="spoil-chapter-close"
            title="Fermer"
            aria-label="Fermer"
            :disabled="disabled"
            @click="handleClose"
          >
            ✕
          </button>
        </header>

        <p v-if="errorMessage" class="spoil-chapter-error">{{ errorMessage }}</p>

        <label class="spoil-chapter-field">
          <span class="spoil-chapter-label">Numéro du chapitre</span>
          <input
            v-model="form.chapterNumber"
            type="text"
            class="reading-fiche-input"
            maxlength="40"
            placeholder="Ex: 1, 12, Prologue…"
            required
            autofocus
            :disabled="disabled"
          />
        </label>

        <label class="spoil-chapter-field">
          <span class="spoil-chapter-label">Personnages rencontrés</span>
          <textarea
            v-model="form.charactersMet"
            class="reading-fiche-textarea spoil-chapter-textarea"
            rows="3"
            maxlength="4000"
            placeholder="Qui apparaît dans ce chapitre…"
            :disabled="disabled"
          />
        </label>

        <label class="spoil-chapter-field">
          <span class="spoil-chapter-label">World building</span>
          <textarea
            v-model="form.worldBuilding"
            class="reading-fiche-textarea spoil-chapter-textarea"
            rows="3"
            maxlength="4000"
            placeholder="Lieux, règles, lore…"
            :disabled="disabled"
          />
        </label>

        <label class="spoil-chapter-field">
          <span class="spoil-chapter-label">Scène</span>
          <textarea
            v-model="form.scene"
            class="reading-fiche-textarea spoil-chapter-textarea"
            rows="4"
            maxlength="5000"
            placeholder="Ce qu’il se passe…"
            :disabled="disabled"
          />
        </label>

        <div class="reading-fiche-form-actions">
          <button type="submit" class="reading-fiche-save-btn" :disabled="disabled">
            {{ disabled ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Valider' }}
          </button>
          <button type="button" class="reading-fiche-cancel-btn" :disabled="disabled" @click="handleClose">
            Annuler
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.spoil-chapter-modal {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(20, 24, 32, 0.5);
  backdrop-filter: blur(4px);
  box-sizing: border-box;
}

.spoil-chapter-panel {
  width: min(480px, 100%);
  max-height: min(90vh, 760px);
  overflow: auto;
  padding: 1.15rem 1.25rem 1.35rem;
  border-radius: 16px;
  border: 1px solid rgba(173, 129, 190, 0.45);
  background: linear-gradient(180deg, #fffefb 0%, #faf6ff 100%);
  box-shadow: 0 18px 50px rgba(92, 62, 112, 0.18);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.spoil-chapter-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.spoil-chapter-title {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.35rem;
  color: #3d2f4a;
}

.spoil-chapter-close {
  width: 2rem;
  height: 2rem;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #7a6b86;
  cursor: pointer;
}

.spoil-chapter-close:hover:not(:disabled) {
  background: rgba(173, 129, 190, 0.15);
}

.spoil-chapter-error {
  margin: 0;
  padding: 0.5rem 0.65rem;
  border-radius: 8px;
  background: rgba(220, 53, 69, 0.1);
  color: #b02a37;
  font-size: 0.85rem;
}

.spoil-chapter-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.spoil-chapter-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: #5a4a68;
}

.spoil-chapter-textarea {
  min-height: 4.5rem;
}
</style>
