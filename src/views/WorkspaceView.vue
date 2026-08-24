<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import WorkspaceLayoutPicker from '../components/WorkspaceLayoutPicker.vue'
import WorkspacePagePicker from '../components/WorkspacePagePicker.vue'
import WorkspacePane from '../components/WorkspacePane.vue'
import { useWorkspace } from '../composables/useWorkspace.js'

const DESKTOP_MQ = '(min-width: 769px)'

const router = useRouter()

const {
  panes,
  layoutId,
  layout,
  canAddPane,
  isEmpty,
  gridStyle,
  splitters,
  emptySlotAreas,
  areaForIndex,
  addPane,
  removePane,
  swapPanes,
  updatePanePath,
  setLayout,
  resizeTrack,
  maxPanes,
} = useWorkspace()

const pickerOpen = ref(false)
const layoutOpen = ref(false)
const gridRef = ref(null)
const draggingPaneId = ref(null)
const activeSplitterId = ref(null)

const subtitle = computed(() => {
  if (isEmpty.value) return 'Choisis une disposition, puis ajoute tes pages.'
  return `${panes.value.length} / ${layout.value.slots} panneaux · ${layout.value.label}`
})

function ensureDesktop() {
  if (!window.matchMedia(DESKTOP_MQ).matches) {
    router.replace('/dashboard')
  }
}

function onMediaChange(event) {
  if (!event.matches) router.replace('/dashboard')
}

onMounted(() => {
  ensureDesktop()
  document.title = 'Plan de travail — BetterMe'
  window.matchMedia(DESKTOP_MQ).addEventListener('change', onMediaChange)
})

onUnmounted(() => {
  window.matchMedia(DESKTOP_MQ).removeEventListener('change', onMediaChange)
})

function openPicker() {
  if (!canAddPane.value) {
    layoutOpen.value = true
    return
  }
  pickerOpen.value = true
}

function onPickPage(page) {
  addPane(page)
}

function onPaneDrop({ fromId, toId }) {
  swapPanes(fromId, toId)
  draggingPaneId.value = null
}

function onPathChange({ paneId, path }) {
  updatePanePath(paneId, path)
}

function onSelectLayout(id) {
  setLayout(id, true)
}

/** @type {null | { axis: 'col'|'row', index: number, startPos: number, size: number, id: string }} */
let resizeSession = null

function beginResize(splitter, event) {
  event.preventDefault()
  event.stopPropagation()
  const grid = gridRef.value
  if (!grid) return
  const rect = grid.getBoundingClientRect()
  resizeSession = {
    axis: splitter.axis,
    index: splitter.index,
    id: splitter.id,
    startPos: splitter.axis === 'col' ? event.clientX : event.clientY,
    size: splitter.axis === 'col' ? rect.width : rect.height,
  }
  activeSplitterId.value = splitter.id
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', endResize)
  window.addEventListener('pointercancel', endResize)
}

function onResizeMove(event) {
  if (!resizeSession) return
  const current = resizeSession.axis === 'col' ? event.clientX : event.clientY
  const deltaPx = current - resizeSession.startPos
  const deltaRatio = deltaPx / Math.max(1, resizeSession.size)
  resizeSession.startPos = current
  resizeTrack(resizeSession.axis, resizeSession.index, deltaRatio)
}

function endResize() {
  resizeSession = null
  activeSplitterId.value = null
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', endResize)
  window.removeEventListener('pointercancel', endResize)
}
</script>

<template>
  <div class="workspace-page">
    <header class="workspace-page__header">
      <div class="workspace-page__heading">
        <h1 class="workspace-page__title">Plan de travail</h1>
        <p class="workspace-page__subtitle">{{ subtitle }}</p>
      </div>
      <div class="workspace-page__actions">
        <button
          type="button"
          class="workspace-page__layout-btn"
          title="Choisir une disposition"
          aria-label="Choisir une disposition"
          @click="layoutOpen = true"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <rect x="3" y="3" width="8" height="18" rx="1" />
            <rect x="13" y="3" width="8" height="8" rx="1" />
            <rect x="13" y="13" width="8" height="8" rx="1" />
          </svg>
        </button>
        <button
          type="button"
          class="workspace-page__add"
          :title="
            canAddPane
              ? 'Ajouter une page'
              : panes.length >= maxPanes
                ? `Maximum ${maxPanes} panneaux`
                : 'Choisis une disposition plus grande pour ajouter une page'
          "
          aria-label="Ajouter une page"
          @click="openPicker"
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
    </header>

    <div v-if="isEmpty" class="workspace-page__empty">
      <p>Ton plan de travail est vide.</p>
      <div class="workspace-page__empty-actions">
        <button type="button" class="workspace-page__empty-btn workspace-page__empty-btn--ghost" @click="layoutOpen = true">
          Choisir une disposition
        </button>
        <button type="button" class="workspace-page__empty-btn" @click="openPicker">
          Ajouter une première page
        </button>
      </div>
    </div>

    <div v-else ref="gridRef" class="workspace-page__grid" :style="gridStyle">
      <WorkspacePane
        v-for="(pane, index) in panes"
        :key="pane.id"
        :pane="pane"
        :area="areaForIndex(index)"
        :class="{ 'workspace-pane--dragging': draggingPaneId === pane.id }"
        @close="removePane"
        @drag-start="draggingPaneId = $event"
        @drop="onPaneDrop"
        @path-change="onPathChange"
      />

      <button
        v-for="area in emptySlotAreas"
        :key="`empty-${area}`"
        type="button"
        class="workspace-slot"
        :style="{ gridArea: area }"
        @click="openPicker"
      >
        <span class="workspace-slot__plus">+</span>
        <span class="workspace-slot__label">Ajouter une page</span>
      </button>

      <div
        v-for="splitter in splitters"
        :key="splitter.id"
        class="workspace-splitter"
        :class="{
          'workspace-splitter--col': splitter.axis === 'col',
          'workspace-splitter--row': splitter.axis === 'row',
          'workspace-splitter--active': activeSplitterId === splitter.id,
        }"
        :style="splitter.style"
        @pointerdown="beginResize(splitter, $event)"
      />
    </div>

    <WorkspacePagePicker :open="pickerOpen" @close="pickerOpen = false" @select="onPickPage" />
    <WorkspaceLayoutPicker
      :open="layoutOpen"
      :current-id="layoutId"
      :pane-count="panes.length"
      @close="layoutOpen = false"
      @select="onSelectLayout"
    />
  </div>
</template>

<style scoped>
.workspace-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: calc(100vh - 0px);
  max-height: 100vh;
  overflow: hidden;
  padding: 1rem 1.1rem 1.1rem;
  box-sizing: border-box;
}

.workspace-page__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.85rem;
  flex-shrink: 0;
}

.workspace-page__title {
  margin: 0;
  font-size: 1.55rem;
  font-weight: 800;
  color: #2c3e50;
}

.workspace-page__subtitle {
  margin: 0.3rem 0 0;
  color: #6c757d;
  font-size: 0.92rem;
}

.workspace-page__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.workspace-page__layout-btn {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.4);
  background: rgba(255, 255, 255, 0.8);
  color: #6b4f7c;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.workspace-page__layout-btn svg {
  width: 1.15rem;
  height: 1.15rem;
}

.workspace-page__layout-btn:hover {
  background: rgba(213, 181, 234, 0.22);
}

.workspace-page__add {
  width: 2.5rem;
  height: 2.5rem;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  font-size: 1.55rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(173, 129, 190, 0.28);
}

.workspace-page__add:hover {
  filter: brightness(1.04);
}

.workspace-page__empty {
  flex: 1;
  display: grid;
  place-content: center;
  gap: 0.85rem;
  text-align: center;
  color: #6c757d;
  border-radius: 16px;
  border: 1px dashed rgba(173, 129, 190, 0.4);
  background: rgba(255, 255, 255, 0.45);
}

.workspace-page__empty-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.55rem;
}

.workspace-page__empty-btn {
  justify-self: center;
  padding: 0.65rem 1rem;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  font-weight: 800;
  cursor: pointer;
}

.workspace-page__empty-btn--ghost {
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(213, 181, 234, 0.4);
  color: #6b4f7c;
  box-shadow: none;
}

.workspace-page__grid {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 0.55rem;
}

.workspace-slot {
  display: grid;
  place-content: center;
  gap: 0.25rem;
  min-width: 0;
  min-height: 0;
  border-radius: 14px;
  border: 1px dashed rgba(173, 129, 190, 0.45);
  background: rgba(255, 255, 255, 0.35);
  color: #8b7a96;
  cursor: pointer;
}

.workspace-slot:hover {
  border-color: rgba(173, 129, 190, 0.7);
  background: rgba(213, 181, 234, 0.16);
  color: #6b4f7c;
}

.workspace-slot__plus {
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1;
}

.workspace-slot__label {
  font-size: 0.78rem;
  font-weight: 700;
}

.workspace-splitter {
  position: absolute;
  z-index: 6;
}

.workspace-splitter--col {
  width: 10px;
  transform: translateX(-50%);
  cursor: col-resize;
}

.workspace-splitter--row {
  height: 10px;
  transform: translateY(-50%);
  cursor: row-resize;
}

.workspace-splitter::after {
  content: '';
  position: absolute;
  border-radius: 999px;
  background: rgba(173, 129, 190, 0.85);
  opacity: 0;
  transition: opacity 0.12s ease;
  pointer-events: none;
}

.workspace-splitter--col::after {
  top: 8%;
  bottom: 8%;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
}

.workspace-splitter--row::after {
  left: 8%;
  right: 8%;
  top: 50%;
  height: 2px;
  transform: translateY(-50%);
}

.workspace-splitter:hover::after,
.workspace-splitter--active::after {
  opacity: 1;
}

@media (prefers-color-scheme: dark) {
  .workspace-page__title {
    color: #f0e8f8;
  }

  .workspace-page__subtitle,
  .workspace-page__empty {
    color: #adb5bd;
  }

  .workspace-page__empty {
    background: rgba(35, 30, 48, 0.45);
    border-color: rgba(213, 181, 234, 0.28);
  }

  .workspace-page__layout-btn,
  .workspace-page__empty-btn--ghost {
    background: rgba(42, 36, 56, 0.85);
    border-color: rgba(213, 181, 234, 0.28);
    color: #e8dcf5;
  }

  .workspace-slot {
    background: rgba(35, 30, 48, 0.35);
    border-color: rgba(213, 181, 234, 0.28);
    color: #c5b8d2;
  }
}
</style>
