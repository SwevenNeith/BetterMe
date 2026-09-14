<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import {
  configureEmojiPickerElement,
  FRENCH_EMOJI_DATA,
  loadEmojiPickerElement,
} from '../composables/useEmojiPickerElement.js'

const props = defineProps({
  modelValue: {
    type: [String, null],
    default: null,
  },
  label: {
    type: String,
    default: 'Choisir une icône',
  },
  clearable: {
    type: Boolean,
    default: true,
  },
  compact: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue'])

const rootRef = ref(null)
const pickerRef = ref(null)
const showPicker = ref(false)
const pickerReady = ref(false)
const isLoadingPicker = ref(false)

async function togglePicker() {
  if (!showPicker.value) {
    isLoadingPicker.value = true
    try {
      await loadEmojiPickerElement()
      pickerReady.value = true
    } finally {
      isLoadingPicker.value = false
    }
  }
  showPicker.value = !showPicker.value
}

function onEmojiClick(event) {
  emit('update:modelValue', event.detail.unicode)
  showPicker.value = false
}

function clearIcon(event) {
  event.stopPropagation()
  emit('update:modelValue', null)
  showPicker.value = false
}

watch(showPicker, async (open) => {
  if (!open) return
  await nextTick()
  configureEmojiPickerElement(pickerRef.value)
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
  <div ref="rootRef" class="emoji-picker-field" :class="{ 'emoji-picker-field--compact': compact }">
    <div class="emoji-picker-field__row">
      <button
        type="button"
        class="emoji-picker-field__trigger"
        :aria-expanded="showPicker"
        :aria-label="label"
        :disabled="isLoadingPicker"
        @click.stop="togglePicker"
      >
        <span
          class="emoji-picker-field__preview"
          :class="{ 'emoji-picker-field__preview--empty': !modelValue }"
          aria-hidden="true"
        >
          <template v-if="isLoadingPicker">…</template>
          <template v-else-if="modelValue">{{ modelValue }}</template>
          <template v-else>—</template>
        </span>
        <span v-if="!compact" class="emoji-picker-field__label">{{ label }}</span>
      </button>
      <button
        v-if="clearable && modelValue && !compact"
        type="button"
        class="emoji-picker-field__clear"
        @click="clearIcon"
      >
        Retirer
      </button>
    </div>

    <div
      v-if="showPicker"
      class="emoji-picker-field__panel"
      role="dialog"
      aria-label="Choisir un emoji"
      @click.stop
    >
      <p v-if="!pickerReady" class="emoji-picker-field__loading">Chargement des emojis…</p>
      <emoji-picker
        v-else
        ref="pickerRef"
        class="emoji-picker-field__picker"
        locale="fr"
        :data-source="FRENCH_EMOJI_DATA"
        @emoji-click="onEmojiClick"
      />
    </div>
  </div>
</template>

<style scoped>
.emoji-picker-field {
  position: relative;
}

.emoji-picker-field--compact .emoji-picker-field__trigger {
  flex: 0 0 auto;
  padding: 0.35rem;
  justify-content: center;
}

.emoji-picker-field--compact .emoji-picker-field__preview {
  width: 2.35rem;
  height: 2.35rem;
  font-size: 1.2rem;
}

.emoji-picker-field--compact .emoji-picker-field__panel {
  left: 0;
  right: auto;
}

.emoji-picker-field__row {
  display: flex;
  align-items: stretch;
  gap: 0.5rem;
}

.emoji-picker-field__trigger {
  flex: 1;
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
  padding: 0.55rem 0.85rem;
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    transform 0.2s ease;
}

.emoji-picker-field__trigger:hover:not(:disabled) {
  border-color: #ad81be;
  background: rgba(213, 181, 234, 0.12);
  transform: translateY(-1px);
}

.emoji-picker-field__trigger:disabled {
  opacity: 0.65;
  cursor: wait;
}

.emoji-picker-field__preview {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 10px;
  background: rgba(213, 181, 234, 0.18);
  font-size: 1.45rem;
  line-height: 1;
  flex-shrink: 0;
}

.emoji-picker-field__preview--empty {
  font-size: 1.1rem;
  font-weight: 700;
  color: #9b7aab;
}

.emoji-picker-field__clear {
  flex-shrink: 0;
  align-self: center;
  padding: 0.45rem 0.75rem;
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 10px;
  background: transparent;
  color: #ad81be;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s ease;
}

.emoji-picker-field__clear:hover {
  background: rgba(213, 181, 234, 0.15);
}

.emoji-picker-field__label {
  font-size: 0.9rem;
  font-weight: 600;
  color: #5a4a66;
  text-align: left;
}

.emoji-picker-field__panel {
  position: absolute;
  z-index: 30;
  top: calc(100% + 0.35rem);
  left: 0;
  right: 0;
  width: min(352px, calc(100vw - 2rem));
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(213, 181, 234, 0.35);
  box-shadow: 0 8px 24px rgba(44, 62, 80, 0.12);
}

.emoji-picker-field__loading {
  margin: 0;
  padding: 1.25rem 0.75rem;
  text-align: center;
  font-size: 0.85rem;
  font-weight: 600;
  color: #7f8c8d;
  background: rgba(255, 255, 255, 0.98);
}

.emoji-picker-field__picker {
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
  .emoji-picker-field__trigger {
    background: rgba(30, 25, 40, 0.9);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .emoji-picker-field__trigger:hover:not(:disabled) {
    background: rgba(173, 129, 190, 0.18);
  }

  .emoji-picker-field__preview {
    background: rgba(173, 129, 190, 0.22);
  }

  .emoji-picker-field__label {
    color: #e8dff0;
  }

  .emoji-picker-field__preview--empty {
    color: #b8a0c8;
  }

  .emoji-picker-field__clear {
    border-color: rgba(213, 181, 234, 0.2);
    color: #d5b5ea;
  }

  .emoji-picker-field__loading {
    background: rgba(30, 25, 40, 0.98);
    color: #adb5bd;
  }

  .emoji-picker-field__panel {
    border-color: rgba(213, 181, 234, 0.2);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  }

  .emoji-picker-field__picker {
    --input-font-color: #f0e8f8;
    --input-placeholder-color: #b8a0c8;
  }
}
</style>
