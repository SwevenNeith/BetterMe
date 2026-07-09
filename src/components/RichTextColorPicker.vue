<script setup>
import { ref, watch } from 'vue'
import ColorPickerField from './ColorPickerField.vue'
import {
  DEFAULT_TEXT_COLOR,
  TEXT_COLOR_PRESETS,
  loadRecentTextColors,
  normalizeHex,
} from '../utils/richNoteTextColors.js'

const props = defineProps({
  currentColor: {
    type: String,
    default: DEFAULT_TEXT_COLOR,
  },
})

const emit = defineEmits(['select', 'close'])

const wheelColor = ref(DEFAULT_TEXT_COLOR)
const recentColors = ref(loadRecentTextColors())

function refreshRecent() {
  recentColors.value = loadRecentTextColors()
}

function pick(color) {
  const hex = normalizeHex(color)
  if (!hex) return
  emit('select', hex)
}

function onWheelUpdate(value) {
  wheelColor.value = normalizeHex(value) ?? DEFAULT_TEXT_COLOR
}

function applyWheelColor() {
  pick(wheelColor.value)
}

watch(
  () => props.currentColor,
  (value) => {
    wheelColor.value = normalizeHex(value) ?? DEFAULT_TEXT_COLOR
    refreshRecent()
  },
  { immediate: true },
)
</script>

<template>
  <div class="rich-color-picker" role="dialog" aria-label="Couleur du texte">
    <div class="rich-color-picker__section">
      <p class="rich-color-picker__label">Couleurs par défaut</p>
      <div class="rich-color-picker__grid">
        <button
          v-for="color in TEXT_COLOR_PRESETS"
          :key="color"
          type="button"
          class="rich-color-picker__swatch"
          :class="{ 'rich-color-picker__swatch--active': color === currentColor }"
          :style="{ backgroundColor: color }"
          :title="color === DEFAULT_TEXT_COLOR ? 'Couleur par défaut' : color"
          :aria-label="`Appliquer ${color}`"
          @mousedown.prevent
          @click="pick(color)"
        />
      </div>
    </div>

    <div v-if="recentColors.length > 0" class="rich-color-picker__section">
      <p class="rich-color-picker__label">Récentes</p>
      <div class="rich-color-picker__grid">
        <button
          v-for="color in recentColors"
          :key="`recent-${color}`"
          type="button"
          class="rich-color-picker__swatch"
          :class="{ 'rich-color-picker__swatch--active': color === currentColor }"
          :style="{ backgroundColor: color }"
          :title="color"
          :aria-label="`Appliquer ${color}`"
          @mousedown.prevent
          @click="pick(color)"
        />
      </div>
    </div>

    <div class="rich-color-picker__section">
      <p class="rich-color-picker__label">Roue des couleurs</p>
      <ColorPickerField :model-value="wheelColor" compact @update:model-value="onWheelUpdate" />
      <button type="button" class="rich-color-picker__apply" @mousedown.prevent @click="applyWheelColor">
        Appliquer
      </button>
    </div>

    <button type="button" class="rich-color-picker__close" @mousedown.prevent @click="emit('close')">
      Fermer
    </button>
  </div>
</template>

<style scoped>
.rich-color-picker {
  position: absolute;
  top: calc(100% + 0.35rem);
  left: 0;
  z-index: 20;
  width: min(16.5rem, 88vw);
  padding: 0.75rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: white;
  box-shadow: 0 10px 28px rgba(20, 30, 40, 0.16);
}

.rich-color-picker__section + .rich-color-picker__section {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(213, 181, 234, 0.2);
}

.rich-color-picker__label {
  margin: 0 0 0.45rem;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6c757d;
}

.rich-color-picker__grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.4rem;
}

.rich-color-picker__swatch {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  border: 2px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 0 1px rgba(173, 129, 190, 0.35);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.rich-color-picker__swatch:hover {
  transform: translateY(-1px);
}

.rich-color-picker__swatch--active {
  box-shadow:
    0 0 0 2px var(--habit-color, #ad81be),
    0 0 0 4px rgba(173, 129, 190, 0.2);
}

.rich-color-picker__apply {
  margin-top: 0.55rem;
  width: 100%;
  padding: 0.45rem 0.65rem;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}

.rich-color-picker__close {
  margin-top: 0.65rem;
  width: 100%;
  padding: 0.4rem 0.65rem;
  border: none;
  border-radius: 8px;
  background: rgba(213, 181, 234, 0.18);
  color: #5c6b7a;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}

@media (prefers-color-scheme: dark) {
  .rich-color-picker {
    background: #1e2832;
    border-color: rgba(213, 181, 234, 0.2);
  }

  .rich-color-picker__label {
    color: #adb5bd;
  }

  .rich-color-picker__close {
    color: #ced4da;
  }
}
</style>
