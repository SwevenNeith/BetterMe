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

const wheelOpen = ref(false)
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
  <div class="rcp" role="dialog" aria-label="Couleur du texte">
    <div class="rcp__grid">
      <button
        v-for="color in TEXT_COLOR_PRESETS"
        :key="color"
        type="button"
        class="rcp__swatch"
        :class="{
          'rcp__swatch--active': color === currentColor,
          'rcp__swatch--white': color === '#ffffff',
        }"
        :style="{ backgroundColor: color }"
        :title="color === DEFAULT_TEXT_COLOR ? 'Par défaut' : color"
        :aria-label="`Appliquer ${color}`"
        @mousedown.prevent
        @click="pick(color)"
      />
    </div>

    <div v-if="recentColors.length > 0" class="rcp__recent">
      <button
        v-for="color in recentColors"
        :key="`r-${color}`"
        type="button"
        class="rcp__swatch"
        :class="{ 'rcp__swatch--active': color === currentColor }"
        :style="{ backgroundColor: color }"
        :title="color"
        :aria-label="`Appliquer ${color}`"
        @mousedown.prevent
        @click="pick(color)"
      />
    </div>

    <div class="rcp__footer">
      <button
        type="button"
        class="rcp__more"
        @mousedown.prevent
        @click="wheelOpen = !wheelOpen"
      >
        {{ wheelOpen ? '▴ Moins' : '▾ Plus…' }}
      </button>
      <button type="button" class="rcp__close" @mousedown.prevent @click="emit('close')">✕</button>
    </div>

    <div v-if="wheelOpen" class="rcp__wheel-section">
      <ColorPickerField :model-value="wheelColor" compact @update:model-value="onWheelUpdate" />
      <button type="button" class="rcp__apply" @mousedown.prevent @click="applyWheelColor">
        Appliquer
      </button>
    </div>
  </div>
</template>

<style scoped>
.rcp {
  position: absolute;
  top: calc(100% + 0.3rem);
  left: 0;
  z-index: 20;
  padding: 0.4rem;
  border-radius: 8px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: white;
  box-shadow: 0 6px 20px rgba(20, 30, 40, 0.14);
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.rcp__grid {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 2px;
}

.rcp__swatch {
  width: 1.1rem;
  height: 1.1rem;
  padding: 0;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 2px;
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}

.rcp__swatch:hover {
  transform: scale(1.25);
  z-index: 1;
  box-shadow: 0 0 0 1.5px rgba(0, 0, 0, 0.3);
}

.rcp__swatch--active {
  box-shadow: 0 0 0 2px var(--habit-color, #ad81be);
  border-color: var(--habit-color, #ad81be);
}

.rcp__swatch--white {
  border-color: rgba(0, 0, 0, 0.18);
}

.rcp__recent {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding-top: 0.25rem;
  border-top: 1px solid rgba(213, 181, 234, 0.2);
}

.rcp__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.25rem;
}

.rcp__more {
  padding: 0.15rem 0.3rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #8b7a96;
  font-size: 0.65rem;
  font-weight: 700;
  cursor: pointer;
}

.rcp__more:hover {
  color: #5a4a68;
  background: rgba(213, 181, 234, 0.15);
}

.rcp__close {
  width: 1.3rem;
  height: 1.3rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #8b7a96;
  font-size: 0.7rem;
  cursor: pointer;
}

.rcp__close:hover {
  background: rgba(213, 181, 234, 0.18);
  color: #5a4a68;
}

.rcp__wheel-section {
  padding-top: 0.3rem;
  border-top: 1px solid rgba(213, 181, 234, 0.2);
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.rcp__apply {
  width: 100%;
  padding: 0.25rem 0.4rem;
  border: none;
  border-radius: 6px;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  font-size: 0.68rem;
  font-weight: 700;
  cursor: pointer;
}

@media (prefers-color-scheme: dark) {
  .rcp {
    background: #1e2832;
    border-color: rgba(213, 181, 234, 0.2);
  }

  .rcp__more,
  .rcp__close {
    color: #adb5bd;
  }
}
</style>
