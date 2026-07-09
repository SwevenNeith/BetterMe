<script setup>
import { ref, watch, onMounted, nextTick } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: 'Ajoutez des détails…',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue'])

const editorRef = ref(null)
const isEmpty = ref(true)

function syncEmptyState() {
  const el = editorRef.value
  if (!el) return
  const text = (el.textContent ?? '').replace(/\u00a0/g, ' ').trim()
  isEmpty.value = text.length === 0
}

function emitContent() {
  const html = editorRef.value?.innerHTML ?? ''
  syncEmptyState()
  emit('update:modelValue', html)
}

function exec(cmd, value = null) {
  if (props.disabled) return
  editorRef.value?.focus()
  document.execCommand(cmd, false, value)
  emitContent()
}

function onInput() {
  emitContent()
}

function onPaste(event) {
  event.preventDefault()
  const text = event.clipboardData?.getData('text/plain') ?? ''
  document.execCommand('insertText', false, text)
  emitContent()
}

function setHtml(html) {
  const el = editorRef.value
  if (!el) return
  el.innerHTML = html || ''
  syncEmptyState()
}

watch(
  () => props.modelValue,
  (value) => {
    const el = editorRef.value
    if (!el) return
    const next = value || ''
    if (el.innerHTML !== next) setHtml(next)
  },
)

onMounted(async () => {
  await nextTick()
  setHtml(props.modelValue)
})
</script>

<template>
  <div class="rich-note" :class="{ 'rich-note--disabled': disabled }">
    <div class="rich-note__toolbar" role="toolbar" aria-label="Mise en forme">
      <button type="button" class="rich-note__tool" title="Gras" :disabled="disabled" @mousedown.prevent @click="exec('bold')">
        <strong>B</strong>
      </button>
      <button type="button" class="rich-note__tool" title="Italique" :disabled="disabled" @mousedown.prevent @click="exec('italic')">
        <em>I</em>
      </button>
      <button type="button" class="rich-note__tool" title="Souligné" :disabled="disabled" @mousedown.prevent @click="exec('underline')">
        <span class="rich-note__underline">U</span>
      </button>
      <button
        type="button"
        class="rich-note__tool rich-note__tool--highlight"
        title="Surligner"
        :disabled="disabled"
        @mousedown.prevent
        @click="exec('hiliteColor', '#fff3a0')"
      >
        <mark>H</mark>
      </button>
      <span class="rich-note__sep" aria-hidden="true" />
      <button type="button" class="rich-note__tool" title="Aligner à gauche" :disabled="disabled" @mousedown.prevent @click="exec('justifyLeft')">
        ≡
      </button>
      <button type="button" class="rich-note__tool" title="Centrer" :disabled="disabled" @mousedown.prevent @click="exec('justifyCenter')">
        ≡
      </button>
      <button type="button" class="rich-note__tool" title="Aligner à droite" :disabled="disabled" @mousedown.prevent @click="exec('justifyRight')">
        ≡
      </button>
    </div>

    <div
      ref="editorRef"
      class="rich-note__editor"
      :class="{ 'rich-note__editor--empty': isEmpty }"
      :contenteditable="!disabled"
      role="textbox"
      aria-multiline="true"
      :data-placeholder="placeholder"
      @input="onInput"
      @paste="onPaste"
    />
  </div>
</template>

<style scoped>
.rich-note {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: 0;
}

.rich-note--disabled {
  opacity: 0.65;
}

.rich-note__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
  padding: 0.35rem;
  border-radius: 10px;
  background: rgba(213, 181, 234, 0.12);
  border: 1px solid rgba(213, 181, 234, 0.25);
}

.rich-note__tool {
  min-width: 2rem;
  height: 2rem;
  padding: 0 0.45rem;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.85);
  color: #2c3e50;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s ease;
}

.rich-note__tool:hover:not(:disabled) {
  background: white;
}

.rich-note__tool:disabled {
  cursor: not-allowed;
}

.rich-note__tool--highlight mark {
  background: #fff3a0;
  padding: 0 0.15rem;
}

.rich-note__underline {
  text-decoration: underline;
}

.rich-note__sep {
  width: 1px;
  height: 1.25rem;
  margin: 0 0.15rem;
  background: rgba(173, 129, 190, 0.35);
}

.rich-note__editor {
  min-height: 7rem;
  max-height: 16rem;
  overflow-y: auto;
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.95);
  font-size: 0.95rem;
  line-height: 1.5;
  color: #2c3e50;
  outline: none;
}

.rich-note__editor:focus {
  border-color: var(--habit-color, #ad81be);
  box-shadow: 0 0 0 2px rgba(173, 129, 190, 0.15);
}

.rich-note__editor--empty::before {
  content: attr(data-placeholder);
  color: #9aa5b1;
  pointer-events: none;
}

.rich-note__editor :deep(mark) {
  background: #fff3a0;
}
</style>
