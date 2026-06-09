<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: '#ad81be',
  },
})

const emit = defineEmits(['update:modelValue'])

const DEFAULT_COLOR = '#ad81be'

function normalizeHex(value) {
  const raw = String(value || '').trim()
  if (!raw) return DEFAULT_COLOR
  const withHash = raw.startsWith('#') ? raw : `#${raw}`
  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) {
    return withHash.toLowerCase()
  }
  if (/^#[0-9a-fA-F]{3}$/.test(withHash)) {
    const h = withHash.slice(1)
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase()
  }
  return null
}

const colorValue = computed({
  get() {
    return normalizeHex(props.modelValue) ?? DEFAULT_COLOR
  },
  set(value) {
    const next = normalizeHex(value)
    if (next) emit('update:modelValue', next)
  },
})

const hexInput = computed({
  get() {
    return colorValue.value
  },
  set(value) {
    const next = normalizeHex(value)
    if (next) emit('update:modelValue', next)
  },
})

function onHexInput(event) {
  hexInput.value = event.target.value
}
</script>

<template>
  <div class="color-picker-field">
    <div class="color-picker-field__wheel-wrap">
      <label class="color-picker-field__wheel-label">
        <span class="color-picker-field__swatch" :style="{ backgroundColor: colorValue }" aria-hidden="true" />
        <input
          v-model="colorValue"
          type="color"
          class="color-picker-field__wheel"
          aria-label="Roue des couleurs"
        />
        <span class="color-picker-field__wheel-text">Ouvrir la roue des couleurs</span>
      </label>
    </div>

    <label class="color-picker-field__hex">
      <span class="color-picker-field__hex-label">Code couleur</span>
      <input
        :value="hexInput"
        type="text"
        class="color-picker-field__hex-input"
        maxlength="7"
        spellcheck="false"
        autocomplete="off"
        placeholder="#ad81be"
        @input="onHexInput"
      />
    </label>
  </div>
</template>

<style scoped>
.color-picker-field {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.color-picker-field__wheel-wrap {
  display: flex;
  justify-content: center;
}

.color-picker-field__wheel-label {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.55rem;
  cursor: pointer;
}

.color-picker-field__swatch {
  width: 4.5rem;
  height: 4.5rem;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.85);
  box-shadow:
    0 0 0 1px rgba(173, 129, 190, 0.35),
    0 6px 18px rgba(44, 62, 80, 0.12);
  pointer-events: none;
}

.color-picker-field__wheel {
  position: absolute;
  top: 0;
  left: 50%;
  width: 4.5rem;
  height: 4.5rem;
  transform: translateX(-50%);
  border: none;
  border-radius: 50%;
  padding: 0;
  cursor: pointer;
  opacity: 0;
}

.color-picker-field__wheel-text {
  font-size: 0.82rem;
  font-weight: 600;
  color: #ad81be;
}

.color-picker-field__hex {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.color-picker-field__hex-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #ad81be;
}

.color-picker-field__hex-input {
  padding: 0.55rem 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  font-size: 0.95rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: rgba(255, 255, 255, 0.9);
  color: #2c3e50;
}

@media (prefers-color-scheme: dark) {
  .color-picker-field__swatch {
    border-color: rgba(40, 32, 52, 0.9);
    box-shadow:
      0 0 0 1px rgba(213, 181, 234, 0.25),
      0 6px 18px rgba(0, 0, 0, 0.35);
  }

  .color-picker-field__hex-input {
    background: rgba(30, 25, 40, 0.9);
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.2);
  }
}
</style>
