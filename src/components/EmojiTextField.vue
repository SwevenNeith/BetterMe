<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import 'emoji-picker-element'
import fr from 'emoji-picker-element/i18n/fr.js'

const FRENCH_EMOJI_DATA =
  'https://cdn.jsdelivr.net/npm/emoji-picker-element-data@^1/fr/emojibase/data.json'

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  maxlength: {
    type: Number,
    default: undefined,
  },
  placeholder: {
    type: String,
    default: '',
  },
  required: {
    type: Boolean,
    default: false,
  },
  id: {
    type: String,
    default: undefined,
  },
})

const emit = defineEmits(['update:modelValue'])

const inputRef = ref(null)
const rootRef = ref(null)
const pickerRef = ref(null)
const showPicker = ref(false)

function onInput(event) {
  emit('update:modelValue', event.target.value)
}

function togglePicker() {
  showPicker.value = !showPicker.value
}

function insertEmoji(emoji) {
  const input = inputRef.value
  const start = input?.selectionStart ?? props.modelValue.length
  const end = input?.selectionEnd ?? start
  const next = props.modelValue.slice(0, start) + emoji + props.modelValue.slice(end)

  if (props.maxlength != null && next.length > props.maxlength) {
    return
  }

  emit('update:modelValue', next)
  showPicker.value = false

  requestAnimationFrame(() => {
    if (!input) return
    const pos = start + emoji.length
    input.focus()
    input.setSelectionRange(pos, pos)
  })
}

function onEmojiClick(event) {
  insertEmoji(event.detail.unicode)
}

function configurePicker() {
  const picker = pickerRef.value
  if (!picker) return
  picker.i18n = fr
}

watch(showPicker, async (open) => {
  if (!open) return
  await nextTick()
  configurePicker()
})

function onDocumentClick(event) {
  if (!showPicker.value) return
  if (rootRef.value?.contains(event.target)) return
  showPicker.value = false
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onUnmounted(() => document.removeEventListener('click', onDocumentClick))
</script>

<template>
  <div ref="rootRef" class="emoji-text-field">
    <input
      ref="inputRef"
      :id="id"
      :value="modelValue"
      type="text"
      class="emoji-text-field__input"
      :maxlength="maxlength"
      :placeholder="placeholder"
      :required="required"
      @input="onInput"
    />
    <button
      type="button"
      class="emoji-text-field__btn"
      aria-label="Ajouter un emoji"
      :aria-expanded="showPicker"
      @click.stop="togglePicker"
    >
      <span aria-hidden="true">😀</span>
    </button>
    <div
      v-if="showPicker"
      class="emoji-text-field__picker"
      role="dialog"
      aria-label="Choisir un emoji"
      @click.stop
    >
      <emoji-picker
        ref="pickerRef"
        class="emoji-text-field__picker-el"
        locale="fr"
        :data-source="FRENCH_EMOJI_DATA"
        @emoji-click="onEmojiClick"
      />
    </div>
  </div>
</template>

<style scoped>
.emoji-text-field {
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 0.45rem;
}

.emoji-text-field__input {
  flex: 1;
  min-width: 0;
  padding: 0.55rem 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  font-size: 0.95rem;
  background: rgba(255, 255, 255, 0.9);
  color: #2c3e50;
}

.emoji-text-field__btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.65rem;
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 10px;
  background: rgba(213, 181, 234, 0.15);
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
}

.emoji-text-field__btn:hover {
  background: rgba(213, 181, 234, 0.28);
  transform: translateY(-1px);
}

.emoji-text-field__picker {
  position: absolute;
  z-index: 20;
  top: calc(100% + 0.35rem);
  right: 0;
  width: min(352px, calc(100vw - 2rem));
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(213, 181, 234, 0.35);
  box-shadow: 0 8px 24px rgba(44, 62, 80, 0.12);
}

.emoji-text-field__picker-el {
  width: 100%;
  --border-radius: 12px;
  --outline-color: #ad81be;
  --button-active-background: rgba(213, 181, 234, 0.35);
  --input-border-color: rgba(213, 181, 234, 0.35);
  --input-border-size: 1px;
  --input-font-color: #2c3e50;
  --input-placeholder-color: #9b7aab;
}

@media (prefers-color-scheme: dark) {
  .emoji-text-field__input {
    background: rgba(30, 25, 40, 0.9);
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.2);
  }

  .emoji-text-field__btn {
    background: rgba(173, 129, 190, 0.18);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .emoji-text-field__btn:hover {
    background: rgba(173, 129, 190, 0.3);
  }

  .emoji-text-field__picker {
    border-color: rgba(213, 181, 234, 0.2);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  }

  .emoji-text-field__picker-el {
    --input-font-color: #f0e8f8;
    --input-placeholder-color: #b8a0c8;
  }
}
</style>
