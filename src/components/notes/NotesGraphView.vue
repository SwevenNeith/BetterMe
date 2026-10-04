<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { buildNotesGraph } from '../../utils/notes/notesGraph.js'
import {
  GRAPH_FOLDER_COLOR_PRESETS,
  createDefaultNotesGraphFilters,
  mergeNotesGraphFilters,
} from '../../constants/notes/notesGraphFilters.js'
import { flattenFolderOptions } from '../../utils/notes/notesTree.js'

const props = defineProps({
  active: { type: Boolean, default: false },
  notes: { type: Array, default: () => [] },
  folders: { type: Array, default: () => [] },
  filters: {
    type: Object,
    default: () => createDefaultNotesGraphFilters(),
  },
  selectedNoteId: { type: String, default: null },
  /** Mode embarqué (dashboard) : pas d’en-tête local, hauteur plus compacte. */
  compact: { type: Boolean, default: false },
  /** Variables CSS du thème coffre (vue globale en dégradé). */
  themeStyle: { type: Object, default: null },
})

const hasVaultTheme = computed(() => Boolean(props.themeStyle && Object.keys(props.themeStyle).length))

const emit = defineEmits(['select-note', 'update:filters'])

const viewportEl = ref(null)
const width = ref(800)
const height = ref(560)
const hoveredId = ref(null)
const simNodes = ref([])
const simEdges = ref([])
const filtersOpen = ref(false)

let rafId = 0
let running = false
let resizeObserver = null

const localFilters = computed(() => mergeNotesGraphFilters(props.filters))

const folderOptions = computed(() =>
  flattenFolderOptions(props.folders).filter((opt) => opt.id != null && opt.id !== ''),
)

const graphMeta = computed(() => {
  const { nodes, edges } = buildNotesGraph(props.notes)
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
  }
})

const nodeById = computed(() => {
  const map = new Map()
  for (const node of simNodes.value) map.set(node.id, node)
  return map
})

const renderedEdges = computed(() =>
  simEdges.value
    .map((edge) => {
      const source = nodeById.value.get(edge.source)
      const target = nodeById.value.get(edge.target)
      if (!source || !target) return null
      return { key: `${edge.source}-${edge.target}`, source, target }
    })
    .filter(Boolean),
)

const activeFilterCount = computed(() => {
  const f = localFilters.value
  let n = 0
  if (f.onlyFolderId) n += 1
  n += f.hiddenFolderIds.length
  n += Object.keys(f.folderColors).length
  return n
})

function measure() {
  const el = viewportEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const minH = props.compact ? 200 : 280
  width.value = Math.max(props.compact ? 240 : 320, Math.floor(rect.width))
  height.value = Math.max(minH, Math.floor(rect.height) || minH)
}

function initSimulation() {
  const { nodes, edges } = buildNotesGraph(props.notes)
  const w = width.value
  const h = height.value
  const cx = w / 2
  const cy = h / 2
  const prev = new Map(simNodes.value.map((node) => [node.id, node]))

  simNodes.value = nodes.map((node, index) => {
    const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2
    const radius = Math.min(w, h) * 0.28
    const existing = prev.get(node.id)
    return {
      id: node.id,
      title: node.title,
      color: node.color || null,
      x: existing?.x ?? cx + Math.cos(angle) * radius + (Math.random() - 0.5) * 24,
      y: existing?.y ?? cy + Math.sin(angle) * radius + (Math.random() - 0.5) * 24,
      vx: existing?.vx ?? 0,
      vy: existing?.vy ?? 0,
    }
  })
  simEdges.value = edges.map((edge) => ({ ...edge }))
}

function stepSimulation() {
  const nodes = simNodes.value
  const edges = simEdges.value
  const n = nodes.length
  if (!n) return

  const w = width.value
  const h = height.value
  const cx = w / 2
  const cy = h / 2

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const a = nodes[i]
      const b = nodes[j]
      let dx = a.x - b.x
      let dy = a.y - b.y
      let dist = Math.hypot(dx, dy) || 0.01
      const minDist = 56
      if (dist < 0.01) {
        dx = (Math.random() - 0.5) * 0.5
        dy = (Math.random() - 0.5) * 0.5
        dist = Math.hypot(dx, dy)
      }
      const force = 900 / (dist * dist)
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      a.vx += fx
      a.vy += fy
      b.vx -= fx
      b.vy -= fy
      if (dist < minDist) {
        const push = (minDist - dist) * 0.05
        a.vx += (dx / dist) * push
        a.vy += (dy / dist) * push
        b.vx -= (dx / dist) * push
        b.vy -= (dy / dist) * push
      }
    }
  }

  const byId = new Map(nodes.map((node) => [node.id, node]))
  for (const edge of edges) {
    const a = byId.get(edge.source)
    const b = byId.get(edge.target)
    if (!a || !b) continue
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dist = Math.hypot(dx, dy) || 0.01
    const ideal = 140
    const force = (dist - ideal) * 0.02
    const fx = (dx / dist) * force
    const fy = (dy / dist) * force
    a.vx += fx
    a.vy += fy
    b.vx -= fx
    b.vy -= fy
  }

  for (const node of nodes) {
    node.vx += (cx - node.x) * 0.004
    node.vy += (cy - node.y) * 0.004
    node.vx *= 0.82
    node.vy *= 0.82
    node.x += node.vx
    node.y += node.vy

    const pad = 28
    node.x = Math.min(w - pad, Math.max(pad, node.x))
    node.y = Math.min(h - pad, Math.max(pad, node.y))
  }
}

function loop() {
  if (!running) return
  stepSimulation()
  rafId = requestAnimationFrame(loop)
}

function start() {
  stop()
  measure()
  initSimulation()
  running = true
  rafId = requestAnimationFrame(loop)
}

function stop() {
  running = false
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
}

function onSelect(nodeId) {
  if (!nodeId) return
  emit('select-note', nodeId)
}

function nodeRadius(nodeId) {
  if (nodeId === props.selectedNoteId) return 9
  if (nodeId === hoveredId.value) return 8
  return 6
}

function nodeFill(node) {
  if (node.color) return node.color
  return null
}

function emitFilters(next) {
  emit('update:filters', mergeNotesGraphFilters(next))
}

function isFolderHidden(folderId) {
  return localFilters.value.hiddenFolderIds.includes(folderId)
}

function folderColor(folderId) {
  return localFilters.value.folderColors[folderId] || ''
}

function toggleHideFolder(folderId) {
  const hidden = new Set(localFilters.value.hiddenFolderIds)
  if (hidden.has(folderId)) hidden.delete(folderId)
  else hidden.add(folderId)
  const only =
    localFilters.value.onlyFolderId === folderId ? null : localFilters.value.onlyFolderId
  emitFilters({
    ...localFilters.value,
    hiddenFolderIds: [...hidden],
    onlyFolderId: only,
  })
}

function setOnlyFolder(folderId) {
  const nextOnly = localFilters.value.onlyFolderId === folderId ? null : folderId
  emitFilters({
    ...localFilters.value,
    onlyFolderId: nextOnly,
    // « uniquement » prime sur le masquage de ce dossier
    hiddenFolderIds: nextOnly
      ? localFilters.value.hiddenFolderIds.filter((id) => id !== nextOnly)
      : localFilters.value.hiddenFolderIds,
  })
}

function setFolderColor(folderId, color) {
  const colors = { ...localFilters.value.folderColors }
  if (!color) delete colors[folderId]
  else colors[folderId] = color
  emitFilters({
    ...localFilters.value,
    folderColors: colors,
  })
}

function resetFilters() {
  emitFilters(createDefaultNotesGraphFilters())
}

watch(
  () => props.active,
  async (active) => {
    if (active) {
      await nextTick()
      start()
      if (viewportEl.value && typeof ResizeObserver !== 'undefined') {
        resizeObserver?.disconnect()
        resizeObserver = new ResizeObserver(() => {
          measure()
        })
        resizeObserver.observe(viewportEl.value)
      }
    } else {
      resizeObserver?.disconnect()
      resizeObserver = null
      stop()
      hoveredId.value = null
      filtersOpen.value = false
    }
  },
  { immediate: true },
)

watch(
  () => props.notes,
  () => {
    if (props.active) {
      measure()
      initSimulation()
    }
  },
  { deep: true },
)

onMounted(async () => {
  if (props.active) {
    await nextTick()
    start()
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  stop()
})
</script>

<template>
  <div
    class="notes-graph"
    :class="{
      'notes-graph--compact': compact,
      'notes-graph--themed': hasVaultTheme,
    }"
    :style="themeStyle || undefined"
    aria-label="Vue globale des notes"
  >
    <header v-if="!compact" class="notes-graph__header">
      <div>
        <h2 class="notes-graph__title">Vue globale</h2>
        <p class="notes-graph__meta">
          {{ graphMeta.nodeCount }} note{{ graphMeta.nodeCount > 1 ? 's' : '' }}
          · {{ graphMeta.edgeCount }} lien{{ graphMeta.edgeCount > 1 ? 's' : '' }}
          <template v-if="activeFilterCount">
            · {{ activeFilterCount }} filtre{{ activeFilterCount > 1 ? 's' : '' }}
          </template>
        </p>
      </div>
      <div class="notes-graph__header-actions">
        <button
          type="button"
          class="notes-graph__filters-btn"
          :class="{ 'notes-graph__filters-btn--active': filtersOpen || activeFilterCount }"
          :aria-expanded="filtersOpen"
          @click="filtersOpen = !filtersOpen"
        >
          Filtres
          <span v-if="activeFilterCount" class="notes-graph__filters-badge">{{ activeFilterCount }}</span>
        </button>
      </div>
    </header>

    <div v-if="!compact && filtersOpen" class="notes-graph__filters">
      <p class="notes-graph__filters-intro">
        Masque, isole ou colore les notes d’un dossier (sous-dossiers inclus). Sync multi-appareils.
      </p>
      <div v-if="!folderOptions.length" class="notes-graph__filters-empty">
        Aucun dossier dans ce coffre.
      </div>
      <ul v-else class="notes-graph__filters-list">
        <li v-for="opt in folderOptions" :key="opt.id" class="notes-graph__filters-row">
          <span class="notes-graph__filters-name" :title="opt.label">{{ opt.label }}</span>
          <div class="notes-graph__filters-controls">
            <button
              type="button"
              class="notes-graph__chip"
              :class="{ 'notes-graph__chip--on': localFilters.onlyFolderId === opt.id }"
              title="Voir uniquement ce dossier"
              @click="setOnlyFolder(opt.id)"
            >
              Seul
            </button>
            <button
              type="button"
              class="notes-graph__chip"
              :class="{ 'notes-graph__chip--on': isFolderHidden(opt.id) }"
              title="Masquer ce dossier"
              @click="toggleHideFolder(opt.id)"
            >
              Masquer
            </button>
            <div class="notes-graph__color-swatches" role="group" :aria-label="`Couleur ${opt.label}`">
              <button
                type="button"
                class="notes-graph__color-swatch notes-graph__color-swatch--clear"
                title="Couleur par défaut"
                :class="{ 'notes-graph__color-swatch--active': !folderColor(opt.id) }"
                @click="setFolderColor(opt.id, '')"
              />
              <button
                v-for="color in GRAPH_FOLDER_COLOR_PRESETS"
                :key="`${opt.id}-${color}`"
                type="button"
                class="notes-graph__color-swatch"
                :class="{ 'notes-graph__color-swatch--active': folderColor(opt.id) === color }"
                :style="{ backgroundColor: color }"
                :title="color"
                @click="setFolderColor(opt.id, color)"
              />
            </div>
          </div>
        </li>
      </ul>
      <button
        v-if="activeFilterCount"
        type="button"
        class="notes-graph__filters-reset"
        @click="resetFilters"
      >
        Réinitialiser les filtres
      </button>
    </div>

    <div ref="viewportEl" class="notes-graph__viewport">
      <svg
        class="notes-graph__svg"
        :viewBox="`0 0 ${width} ${height}`"
        :width="width"
        :height="height"
        role="img"
        aria-label="Graphe des notes et hyperliens"
      >
        <line
          v-for="edge in renderedEdges"
          :key="edge.key"
          :x1="edge.source.x"
          :y1="edge.source.y"
          :x2="edge.target.x"
          :y2="edge.target.y"
          class="notes-graph__link"
        />

        <g
          v-for="node in simNodes"
          :key="node.id"
          class="notes-graph__node"
          :class="{
            'notes-graph__node--active': node.id === selectedNoteId,
            'notes-graph__node--hover': node.id === hoveredId,
            'notes-graph__node--custom': Boolean(node.color),
          }"
          @mouseenter="hoveredId = node.id"
          @mouseleave="hoveredId = null"
          @click="onSelect(node.id)"
        >
          <circle :cx="node.x" :cy="node.y" :r="nodeRadius(node.id) + 10" class="notes-graph__hit" />
          <circle
            :cx="node.x"
            :cy="node.y"
            :r="nodeRadius(node.id)"
            class="notes-graph__dot"
            :style="nodeFill(node) ? { fill: nodeFill(node), stroke: nodeFill(node) } : undefined"
          />
          <text
            v-if="node.id === hoveredId || node.id === selectedNoteId || simNodes.length <= 18"
            :x="node.x"
            :y="node.y + nodeRadius(node.id) + 14"
            class="notes-graph__label"
          >
            {{ node.title }}
          </text>
        </g>
      </svg>

      <p v-if="!simNodes.length" class="notes-graph__empty">Aucune note à afficher.</p>
    </div>
  </div>
</template>

<style scoped>
.notes-graph {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
  background: #faf7fd;
}

.notes-graph--compact {
  background: transparent;
}

.notes-graph--themed {
  background: var(--notes-vault-main-bg, #faf7fd);
}

.notes-graph--themed.notes-graph--compact {
  background: transparent;
}

.notes-graph--themed .notes-graph__header {
  border-bottom-color: var(--notes-vault-border, #e6ddf2);
  background: var(--notes-vault-graph-header-bg, #f3ebf9);
}

.notes-graph--themed .notes-graph__title {
  color: var(--notes-vault-text, #3b2a4a);
}

.notes-graph--themed .notes-graph__meta {
  color: var(--notes-vault-text-muted, #6d5a7e);
}

.notes-graph--themed .notes-graph__viewport {
  background: var(--notes-vault-graph-bg);
}

.notes-graph--themed .notes-graph__link {
  stroke: var(--notes-vault-graph-link, #ad81be);
  stroke-opacity: 0.55;
}

.notes-graph--themed .notes-graph__dot {
  fill: var(--notes-vault-graph-node, #9b6fb3);
  stroke: var(--notes-vault-graph-node-stroke, #7a528f);
}

.notes-graph--themed .notes-graph__node--hover:not(.notes-graph__node--custom) .notes-graph__dot,
.notes-graph--themed .notes-graph__node--active:not(.notes-graph__node--custom) .notes-graph__dot {
  fill: var(--notes-vault-graph-node-active, #ad81be);
  stroke: var(--notes-vault-graph-node-active-stroke, #6d4a82);
}

.notes-graph--themed .notes-graph__label {
  fill: var(--notes-vault-text, #3b2a4a);
}

.notes-graph--themed .notes-graph__empty {
  color: var(--notes-vault-text-muted, #6d5a7e);
}

.notes-graph__header {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.7rem 1rem 0.55rem;
  border-bottom: 1px solid #e6ddf2;
  background: #f3ebf9;
}

.notes-graph__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #3b2a4a;
}

.notes-graph__meta {
  margin: 0.2rem 0 0;
  font-size: 0.82rem;
  color: #6d5a7e;
}

.notes-graph__header-actions {
  flex-shrink: 0;
}

.notes-graph__filters-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: 1px solid #d5b5ea;
  background: #fff;
  color: #5b3d7a;
  border-radius: 8px;
  padding: 0.35rem 0.7rem;
  font: inherit;
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
}

.notes-graph__filters-btn:hover,
.notes-graph__filters-btn--active {
  background: #f3ebf9;
  border-color: #ad81be;
}

.notes-graph__filters-badge {
  display: inline-grid;
  place-content: center;
  min-width: 1.15rem;
  height: 1.15rem;
  padding: 0 0.25rem;
  border-radius: 999px;
  background: #ad81be;
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
}

.notes-graph__filters {
  flex-shrink: 0;
  max-height: min(42vh, 320px);
  overflow: auto;
  padding: 0.65rem 1rem 0.75rem;
  border-bottom: 1px solid #e6ddf2;
  background: #faf7fd;
}

.notes-graph__filters-intro {
  margin: 0 0 0.55rem;
  font-size: 0.78rem;
  color: #6d5a7e;
  line-height: 1.35;
}

.notes-graph__filters-empty {
  margin: 0;
  font-size: 0.85rem;
  color: #6d5a7e;
}

.notes-graph__filters-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}

.notes-graph__filters-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.5rem 0.75rem;
  align-items: center;
  padding: 0.35rem 0.4rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.7);
}

.notes-graph__filters-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.84rem;
  color: #3b2a4a;
}

.notes-graph__filters-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  justify-content: flex-end;
}

.notes-graph__chip {
  border: 1px solid #d8cce4;
  background: #fff;
  color: #5c4a6e;
  border-radius: 999px;
  padding: 0.18rem 0.55rem;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
}

.notes-graph__chip:hover,
.notes-graph__chip--on {
  border-color: #ad81be;
  background: #f0e6f7;
  color: #5b3d7a;
}

.notes-graph__color-swatches {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.18rem;
  max-width: 11rem;
}

.notes-graph__color-swatch {
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  padding: 0;
  cursor: pointer;
}

.notes-graph__color-swatch--clear {
  background:
    linear-gradient(135deg, transparent 46%, #c44 46% 54%, transparent 54%),
    #fff;
}

.notes-graph__color-swatch--active {
  outline: 2px solid #5b3d7a;
  outline-offset: 1px;
}

.notes-graph__filters-reset {
  margin-top: 0.55rem;
  border: none;
  background: transparent;
  color: #8e6aa8;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0.2rem 0;
}

.notes-graph__filters-reset:hover {
  color: #5b3d7a;
  text-decoration: underline;
}

.notes-graph__viewport {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background:
    radial-gradient(ellipse 80% 70% at 50% 40%, rgba(213, 181, 234, 0.45) 0%, transparent 60%),
    radial-gradient(ellipse 70% 65% at 70% 75%, rgba(149, 209, 170, 0.35) 0%, transparent 55%),
    linear-gradient(160deg, #f7f2fb 0%, #eef6f1 55%, #f3ebf9 100%);
}

.notes-graph__svg {
  display: block;
  width: 100%;
  height: 100%;
}

.notes-graph__link {
  stroke: #ad81be;
  stroke-width: 1.25;
  stroke-opacity: 0.55;
}

.notes-graph__node {
  cursor: pointer;
}

.notes-graph__hit {
  fill: transparent;
}

.notes-graph__dot {
  fill: #9b6fb3;
  stroke: #7a528f;
  stroke-width: 1.5;
}

.notes-graph__node--hover:not(.notes-graph__node--custom) .notes-graph__dot,
.notes-graph__node--active:not(.notes-graph__node--custom) .notes-graph__dot {
  fill: #ad81be;
  stroke: #6d4a82;
}

.notes-graph__node--custom.notes-graph__node--hover .notes-graph__dot,
.notes-graph__node--custom.notes-graph__node--active .notes-graph__dot {
  filter: brightness(1.08);
}

.notes-graph__label {
  fill: #3b2a4a;
  font-size: 11px;
  text-anchor: middle;
  pointer-events: none;
  paint-order: stroke;
  stroke: rgba(255, 255, 255, 0.75);
  stroke-width: 3px;
}

.notes-graph__empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  margin: 0;
  color: #6d5a7e;
  font-size: 0.95rem;
}

@media (max-width: 720px) {
  .notes-graph__filters-row {
    grid-template-columns: 1fr;
  }

  .notes-graph__filters-controls {
    justify-content: flex-start;
  }
}

@media (prefers-color-scheme: dark) {
  .notes-graph {
    background: #1a1524;
  }

  .notes-graph--compact {
    background: transparent;
  }

  .notes-graph__header {
    border-bottom-color: rgba(213, 181, 234, 0.15);
    background: #241c30;
  }

  .notes-graph__title {
    color: #f0e8f8;
  }

  .notes-graph__meta {
    color: #a895bc;
  }

  .notes-graph__filters-btn {
    background: #2a2433;
    border-color: rgba(213, 181, 234, 0.35);
    color: #e8d4f8;
  }

  .notes-graph__filters-btn:hover,
  .notes-graph__filters-btn--active {
    background: #322a3e;
  }

  .notes-graph__filters {
    border-bottom-color: rgba(213, 181, 234, 0.15);
    background: #1e1828;
  }

  .notes-graph__filters-intro,
  .notes-graph__filters-empty {
    color: #a895bc;
  }

  .notes-graph__filters-row {
    background: rgba(42, 36, 51, 0.85);
  }

  .notes-graph__filters-name {
    color: #f0e8f8;
  }

  .notes-graph__chip {
    background: #2a2433;
    border-color: rgba(213, 181, 234, 0.28);
    color: #d5c4e8;
  }

  .notes-graph__chip:hover,
  .notes-graph__chip--on {
    background: rgba(173, 129, 190, 0.28);
    border-color: #ad81be;
    color: #f0e8f8;
  }

  .notes-graph__viewport {
    background: radial-gradient(ellipse 70% 70% at 50% 45%, #2a2438 0%, #16121f 100%);
  }

  .notes-graph__link {
    stroke: #6d5a88;
    stroke-opacity: 0.85;
  }

  .notes-graph__dot {
    fill: #d5b5ea;
    stroke: #c5a0dc;
  }

  .notes-graph__node--hover:not(.notes-graph__node--custom) .notes-graph__dot,
  .notes-graph__node--active:not(.notes-graph__node--custom) .notes-graph__dot {
    fill: #e8d4f8;
    stroke: #d5b5ea;
  }

  .notes-graph__label {
    fill: #efe8f7;
    stroke: rgba(22, 18, 31, 0.85);
  }

  .notes-graph__empty {
    color: #a895bc;
  }
}
</style>
