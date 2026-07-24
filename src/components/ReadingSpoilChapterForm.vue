<script setup>
import { computed, reactive, ref, watch } from 'vue'
import RichTextNoteEditor from './RichTextNoteEditor.vue'

const props = defineProps({
  chapter: {
    type: Object,
    default: null,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: 'Ajouter un chapitre',
  },
  submitLabel: {
    type: String,
    default: 'Valider',
  },
})

const emit = defineEmits(['submit', 'cancel'])

const form = reactive({
  chapterNumber: '',
  charactersMet: '',
  worldBuilding: '',
  scene: '',
})
const errorMessage = ref('')
const initialSnapshot = ref(null)

function getSnapshot() {
  return {
    chapterNumber: form.chapterNumber.trim(),
    charactersMet: form.charactersMet.trim(),
    worldBuilding: form.worldBuilding.trim(),
    scene: form.scene.trim(),
  }
}

function captureInitialSnapshot() {
  initialSnapshot.value = getSnapshot()
}

function fillFromChapter(chapter) {
  form.chapterNumber = String(chapter?.chapter_number ?? '')
  form.charactersMet = String(chapter?.characters_met ?? '')
  form.worldBuilding = String(chapter?.world_building ?? '')
  form.scene = String(chapter?.scene ?? '')
  errorMessage.value = ''
  captureInitialSnapshot()
}

function resetForm() {
  form.chapterNumber = ''
  form.charactersMet = ''
  form.worldBuilding = ''
  form.scene = ''
  errorMessage.value = ''
  captureInitialSnapshot()
}

const isDirty = computed(() => {
  if (!initialSnapshot.value) return false
  return JSON.stringify(getSnapshot()) !== JSON.stringify(initialSnapshot.value)
})

function buildPayload() {
  return {
    chapterNumber: form.chapterNumber.trim(),
    charactersMet: form.charactersMet.trim(),
    worldBuilding: form.worldBuilding.trim(),
    scene: form.scene.trim(),
  }
}

function submit() {
  const payload = buildPayload()
  if (!payload.chapterNumber) {
    errorMessage.value = 'Indique le numéro du chapitre.'
    return false
  }

  errorMessage.value = ''
  emit('submit', payload)
  return true
}

watch(
  () => props.chapter,
  (chapter) => {
    if (chapter) fillFromChapter(chapter)
    else resetForm()
  },
  { immediate: true },
)

defineExpose({
  get isDirty() {
    return isDirty.value
  },
  submit,
})
</script>

<template>
  <form class="spoil-chapter-panel" @submit.prevent="submit">
    <header class="spoil-chapter-header">
      <h1 class="spoil-chapter-title">{{ title }}</h1>
      <slot name="header-action" />
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
      <RichTextNoteEditor
        v-model="form.charactersMet"
        class="spoil-rich-note"
        placeholder="Qui apparaît dans ce chapitre…"
        :disabled="disabled"
        auto-grow
        lined
        enable-notes
      />
    </label>

    <label class="spoil-chapter-field">
      <span class="spoil-chapter-label">World building</span>
      <RichTextNoteEditor
        v-model="form.worldBuilding"
        class="spoil-rich-note"
        placeholder="Lieux, règles, lore…"
        :disabled="disabled"
        auto-grow
        lined
        enable-notes
      />
    </label>

    <label class="spoil-chapter-field">
      <span class="spoil-chapter-label">Scène</span>
      <RichTextNoteEditor
        v-model="form.scene"
        class="spoil-rich-note"
        lined
        enable-notes
        placeholder="Ce qu’il se passe…"
        :disabled="disabled"
        auto-grow
      />
    </label>

    <div class="reading-fiche-form-actions">
      <button type="submit" class="reading-fiche-save-btn" :disabled="disabled">
        {{ disabled ? 'Enregistrement…' : submitLabel }}
      </button>
      <button type="button" class="reading-fiche-cancel-btn" :disabled="disabled" @click="emit('cancel')">
        Annuler
      </button>
    </div>
  </form>
</template>

<style scoped>
.spoil-chapter-panel {
  width: 100%;
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

@media (prefers-color-scheme: dark) {
  .spoil-chapter-panel {
    background: linear-gradient(180deg, #2a2438 0%, #1f1a2c 100%);
    border-color: rgba(213, 181, 234, 0.28);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
  }

  .spoil-chapter-title {
    color: #f0e8f8;
  }

  .spoil-chapter-label {
    color: #c5b8d2;
  }

  .spoil-chapter-error {
    background: rgba(220, 53, 69, 0.18);
    color: #ff8a95;
  }
}

</style>

<style>
.reading-fiche-input,
.reading-fiche-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0.42rem 0.55rem;
  border: 1px solid rgba(173, 129, 190, 0.35);
  border-radius: 8px;
  background: #fff;
  font-size: 0.92rem;
  color: #2c2434;
}

.reading-fiche-textarea {
  --lined-h: 1.75rem;
  min-height: calc(var(--lined-h) * 4);
  resize: vertical;
  line-height: var(--lined-h);
  padding: 0 0.55rem;
  background-color: #fff;
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(var(--lined-h) - 1px),
    rgba(173, 129, 190, 0.32) calc(var(--lined-h) - 1px),
    rgba(173, 129, 190, 0.32) var(--lined-h)
  );
  background-size: 100% var(--lined-h);
  background-position: left top;
  background-attachment: local;
}

.reading-fiche-input:focus,
.reading-fiche-textarea:focus {
  outline: 2px solid rgba(173, 129, 190, 0.45);
  outline-offset: 1px;
}

.reading-fiche-form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1rem;
}

.reading-fiche-save-btn,
.reading-fiche-cancel-btn {
  padding: 0.65rem 0.9rem;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
}

.reading-fiche-save-btn {
  border: none;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: #fff;
}

.reading-fiche-cancel-btn {
  border: 1px solid rgba(173, 129, 190, 0.45);
  background: #fff;
  color: #5a4a68;
}

.reading-fiche-save-btn:disabled,
.reading-fiche-cancel-btn:disabled {
  opacity: 0.7;
  cursor: wait;
}

@media (prefers-color-scheme: dark) {
  .reading-fiche-input,
  .reading-fiche-textarea {
    background: rgba(35, 30, 48, 0.95);
    border-color: rgba(173, 129, 190, 0.4);
    color: #f0e8f8;
  }

  .reading-fiche-textarea {
    background-color: rgba(35, 30, 48, 0.95);
    background-image: repeating-linear-gradient(
      to bottom,
      transparent 0,
      transparent calc(var(--lined-h) - 1px),
      rgba(173, 129, 190, 0.28) calc(var(--lined-h) - 1px),
      rgba(173, 129, 190, 0.28) var(--lined-h)
    );
  }

  .reading-fiche-cancel-btn {
    background: rgba(35, 30, 48, 0.9);
    border-color: rgba(173, 129, 190, 0.4);
    color: #e8dcf5;
  }
}
</style>
