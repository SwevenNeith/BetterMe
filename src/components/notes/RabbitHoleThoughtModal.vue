<script setup>
import { nextTick, ref, watch } from 'vue'
import { supabase } from '../../lib/supabase.js'
import { appendThoughtToRabbitHole } from '../../services/notes/rabbitHole.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  userId: { type: String, default: '' },
  selectedText: { type: String, default: '' },
})

const emit = defineEmits(['close', 'saved'])

const thoughtInputRef = ref(null)
const thought = ref('')
const formError = ref('')
const isSaving = ref(false)

async function focusThoughtInput() {
  await nextTick()
  thoughtInputRef.value?.focus()
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    thought.value = ''
    formError.value = ''
    isSaving.value = false
    await focusThoughtInput()
  },
)

function handleClose() {
  if (isSaving.value) return
  emit('close')
}

async function submitForm() {
  if (!props.userId || isSaving.value) return
  const trimmed = thought.value.trim()
  if (!trimmed) {
    formError.value = 'Formule ta pensée avant de valider.'
    return
  }

  isSaving.value = true
  formError.value = ''
  try {
    const note = await appendThoughtToRabbitHole(supabase, props.userId, trimmed)
    emit('saved', note)
    emit('close')
  } catch (err) {
    formError.value = err?.message || 'Impossible d’ajouter cette pensée.'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="rabbit-hole-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rabbit-hole-modal-title"
      @click.self="handleClose"
    >
      <form class="rabbit-hole-modal__card" @submit.prevent="submitForm">
        <header class="rabbit-hole-modal__head">
          <h2 id="rabbit-hole-modal-title" class="rabbit-hole-modal__title">
            Ajouter au Rabbit Hole
          </h2>
          <button
            type="button"
            class="rabbit-hole-modal__close"
            aria-label="Fermer"
            @click="handleClose"
          >
            ×
          </button>
        </header>

        <p v-if="selectedText" class="rabbit-hole-modal__context">
          <span class="rabbit-hole-modal__context-label">Sélection</span>
          <span class="rabbit-hole-modal__context-text">{{ selectedText }}</span>
        </p>

        <label class="rabbit-hole-modal__field">
          <span>Ta pensée</span>
          <textarea
            ref="thoughtInputRef"
            v-model="thought"
            class="rabbit-hole-modal__textarea"
            rows="4"
            maxlength="2000"
            required
            placeholder="Formule en une phrase ce que tu retiens…"
          />
        </label>

        <p v-if="formError" class="rabbit-hole-modal__error">{{ formError }}</p>

        <div class="rabbit-hole-modal__actions">
          <button type="button" class="rabbit-hole-modal__btn" :disabled="isSaving" @click="handleClose">
            Annuler
          </button>
          <button
            type="submit"
            class="rabbit-hole-modal__btn rabbit-hole-modal__btn--primary"
            :disabled="isSaving"
          >
            {{ isSaving ? 'Ajout…' : 'Ajouter' }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.rabbit-hole-modal {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(24, 16, 36, 0.45);
}

.rabbit-hole-modal__card {
  width: min(100%, 440px);
  max-height: calc(100vh - 2rem);
  overflow: auto;
  padding: 1.25rem 1.35rem 1.35rem;
  border-radius: 16px;
  background: #fff;
  border: 1px solid #e6ddf2;
  box-shadow: 0 18px 48px rgba(58, 34, 86, 0.18);
}

.rabbit-hole-modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.rabbit-hole-modal__title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 650;
  color: #2a1f38;
}

.rabbit-hole-modal__close {
  border: none;
  background: transparent;
  font-size: 1.4rem;
  line-height: 1;
  color: #6b5f7a;
  cursor: pointer;
  padding: 0.15rem 0.35rem;
}

.rabbit-hole-modal__context {
  margin: 0 0 1rem;
  padding: 0.7rem 0.8rem;
  border-radius: 10px;
  background: #f7f3fb;
  border: 1px solid #ebe3f4;
}

.rabbit-hole-modal__context-label {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.72rem;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #7a6b8c;
}

.rabbit-hole-modal__context-text {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
  font-size: 0.9rem;
  line-height: 1.4;
  color: #3d334c;
}

.rabbit-hole-modal__field {
  display: grid;
  gap: 0.4rem;
  margin-bottom: 0.85rem;
  font-size: 0.88rem;
  font-weight: 600;
  color: #4a3d5c;
}

.rabbit-hole-modal__textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  border: 1px solid #d9cfe6;
  font: inherit;
  font-weight: 400;
  color: #2a1f38;
  resize: vertical;
  min-height: 6rem;
}

.rabbit-hole-modal__textarea:focus {
  outline: 2px solid #c4a8e8;
  outline-offset: 1px;
}

.rabbit-hole-modal__error {
  margin: 0 0 0.85rem;
  color: #b42318;
  font-size: 0.88rem;
}

.rabbit-hole-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.55rem;
}

.rabbit-hole-modal__btn {
  border: 1px solid #d9cfe6;
  background: #fff;
  color: #4a3d5c;
  border-radius: 10px;
  padding: 0.5rem 0.9rem;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.rabbit-hole-modal__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.rabbit-hole-modal__btn--primary {
  border-color: #6b3fa0;
  background: #6b3fa0;
  color: #fff;
}
</style>
