<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { buildNotesGraph } from '../utils/notesGraph.js'

const props = defineProps({
  active: { type: Boolean, default: false },
  notes: { type: Array, default: () => [] },
  selectedNoteId: { type: String, default: null },
})

const emit = defineEmits(['select-note'])

const viewportEl = ref(null)
const width = ref(800)
const height = ref(560)
const hoveredId = ref(null)
const simNodes = ref([])
const simEdges = ref([])

let rafId = 0
let running = false
let resizeObserver = null

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

function measure() {
  const el = viewportEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  width.value = Math.max(320, Math.floor(rect.width))
  height.value = Math.max(280, Math.floor(rect.height))
}

function initSimulation() {
  const { nodes, edges } = buildNotesGraph(props.notes)
  const w = width.value
  const h = height.value
  const cx = w / 2
  const cy = h / 2

  simNodes.value = nodes.map((node, index) => {
    const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2
    const radius = Math.min(w, h) * 0.28
    return {
      id: node.id,
      title: node.title,
      x: cx + Math.cos(angle) * radius + (Math.random() - 0.5) * 24,
      y: cy + Math.sin(angle) * radius + (Math.random() - 0.5) * 24,
      vx: 0,
      vy: 0,
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
  <div class="notes-graph" aria-label="Vue globale des notes">
    <header class="notes-graph__header">
      <div>
        <h2 class="notes-graph__title">Vue globale</h2>
        <p class="notes-graph__meta">
          {{ graphMeta.nodeCount }} note{{ graphMeta.nodeCount > 1 ? 's' : '' }}
          · {{ graphMeta.edgeCount }} lien{{ graphMeta.edgeCount > 1 ? 's' : '' }}
        </p>
      </div>
    </header>

    <div ref="viewportEl" class="notes-graph__viewport">
      <svg
        class="notes-graph__svg"
        :viewBox="`0 0 ${width} ${height}`"
        :width="width"
        :height="height"
        role="img"
        aria-label="Graphe des notes et hyperliens"
      >
        <defs>
          <radialGradient id="notes-graph-bg" cx="50%" cy="45%" r="70%">
            <stop offset="0%" stop-color="#2a2438" />
            <stop offset="100%" stop-color="#16121f" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" :width="width" :height="height" fill="url(#notes-graph-bg)" />

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
          }"
          @mouseenter="hoveredId = node.id"
          @mouseleave="hoveredId = null"
          @click="onSelect(node.id)"
        >
          <circle :cx="node.x" :cy="node.y" :r="nodeRadius(node.id) + 10" class="notes-graph__hit" />
          <circle :cx="node.x" :cy="node.y" :r="nodeRadius(node.id)" class="notes-graph__dot" />
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

.notes-graph__header {
  flex-shrink: 0;
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

.notes-graph__viewport {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #16121f;
}

.notes-graph__svg {
  display: block;
  width: 100%;
  height: 100%;
}

.notes-graph__link {
  stroke: #6d5a88;
  stroke-width: 1.25;
  stroke-opacity: 0.85;
}

.notes-graph__node {
  cursor: pointer;
}

.notes-graph__hit {
  fill: transparent;
}

.notes-graph__dot {
  fill: #95d1aa;
  stroke: #72a098;
  stroke-width: 1.5;
}

.notes-graph__node--hover .notes-graph__dot,
.notes-graph__node--active .notes-graph__dot {
  fill: #d5b5ea;
  stroke: #c5a0dc;
}

.notes-graph__label {
  fill: #efe8f7;
  font-size: 11px;
  text-anchor: middle;
  pointer-events: none;
  paint-order: stroke;
  stroke: rgba(22, 18, 31, 0.85);
  stroke-width: 3px;
}

.notes-graph__empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  margin: 0;
  color: #a895bc;
  font-size: 0.95rem;
}
</style>
