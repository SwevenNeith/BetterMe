<script setup>
import { WORKSPACE_LAYOUTS, layoutFitsPaneCount } from '../constants/workspacePages.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  currentId: { type: String, default: 'split-50' },
  paneCount: { type: Number, default: 0 },
})

const emit = defineEmits(['close', 'select'])

function isDisabled(layout) {
  return !layoutFitsPaneCount(layout, props.paneCount)
}

function onSelect(layout) {
  if (isDisabled(layout)) return
  emit('select', layout.id)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <template v-if="open">
      <div class="workspace-layouts__overlay" @click="emit('close')" />
      <div
        class="workspace-layouts"
        role="dialog"
        aria-modal="true"
        aria-label="Choisir une disposition"
      >
        <header class="workspace-layouts__header">
          <h2 class="workspace-layouts__title">Disposition</h2>
          <button type="button" class="workspace-layouts__close" aria-label="Fermer" @click="emit('close')">
            ✕
          </button>
        </header>
        <p class="workspace-layouts__hint">Comme un écran partagé Windows — clique une grille.</p>

        <div class="workspace-layouts__grid">
          <button
            v-for="layout in WORKSPACE_LAYOUTS"
            :key="layout.id"
            type="button"
            class="workspace-layouts__item"
            :class="{
              'workspace-layouts__item--active': layout.id === currentId,
              'workspace-layouts__item--disabled': isDisabled(layout),
            }"
            :disabled="isDisabled(layout)"
            :title="
              isDisabled(layout)
                ? `Retire des panneaux pour utiliser « ${layout.label} »`
                : layout.label
            "
            @click="onSelect(layout)"
          >
            <span
              class="workspace-layouts__preview"
              :style="{
                gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
                gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
                gridTemplateAreas: layout.areas.map((row) => `'${row.join(' ')}'`).join(' '),
              }"
            >
              <span
                v-for="slot in layout.slots"
                :key="`${layout.id}-${slot}`"
                class="workspace-layouts__cell"
                :style="{ gridArea: String.fromCharCode(96 + slot) }"
              />
            </span>
            <span class="workspace-layouts__label">{{ layout.label }}</span>
          </button>
        </div>
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
.workspace-layouts__overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(44, 36, 52, 0.4);
}

.workspace-layouts {
  position: fixed;
  z-index: 81;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(92vw, 32rem);
  max-height: min(82vh, 36rem);
  overflow: auto;
  padding: 1.1rem;
  border-radius: 16px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 44px rgba(61, 47, 74, 0.18);
}

.workspace-layouts__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.workspace-layouts__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: #6b4f7c;
}

.workspace-layouts__close {
  border: none;
  background: transparent;
  color: #6c757d;
  font-size: 1.1rem;
  cursor: pointer;
}

.workspace-layouts__hint {
  margin: 0.4rem 0 0.9rem;
  font-size: 0.85rem;
  color: #8b7a96;
}

.workspace-layouts__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.7rem;
}

.workspace-layouts__item {
  display: grid;
  gap: 0.45rem;
  padding: 0.65rem 0.55rem 0.55rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.4);
  background: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  color: #6b4f7c;
}

.workspace-layouts__item:hover:not(:disabled) {
  border-color: rgba(173, 129, 190, 0.55);
  background: rgba(213, 181, 234, 0.16);
}

.workspace-layouts__item--active {
  border-color: rgba(173, 129, 190, 0.7);
  background: rgba(173, 129, 190, 0.2);
  box-shadow: 0 0 0 2px rgba(173, 129, 190, 0.18);
}

.workspace-layouts__item--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.workspace-layouts__preview {
  display: grid;
  gap: 3px;
  height: 3.2rem;
  padding: 2px;
}

.workspace-layouts__cell {
  border-radius: 3px;
  background: #ad81be;
  opacity: 0.72;
}

.workspace-layouts__item--active .workspace-layouts__cell {
  opacity: 1;
}

.workspace-layouts__label {
  font-size: 0.72rem;
  font-weight: 800;
  text-align: center;
}

@media (prefers-color-scheme: dark) {
  .workspace-layouts {
    background: rgba(35, 30, 48, 0.98);
    border-color: rgba(213, 181, 234, 0.22);
  }

  .workspace-layouts__title {
    color: #e8dcf5;
  }

  .workspace-layouts__item {
    background: rgba(42, 36, 56, 0.85);
    border-color: rgba(213, 181, 234, 0.28);
    color: #e8dcf5;
  }
}
</style>
