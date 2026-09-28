<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  pickCellSize,
  renderCrossStitchCanvas,
} from '../../utils/creation/renderCrossStitchCanvas.js'

const props = defineProps({
  /** Grille 2D de cellules { dmcCode, rgb, symbol } | null */
  grid: {
    type: Array,
    required: true,
  },
  /** Affichage couleur / symboles / both */
  renderMode: {
    type: String,
    default: 'color',
  },
  /**
   * preview = prévisualisation (clic = zoom/centrage via parent)
   * stitching = broderie (clic / drag = cocher cases)
   */
  viewMode: {
    type: String,
    default: 'preview',
    validator: (v) => v === 'preview' || v === 'stitching',
  },
  /** Zoom d’affichage (≥ 1) */
  zoom: {
    type: Number,
    default: 1,
  },
  /** Indices linéaires des cases faites */
  doneIndices: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['update:doneIndices', 'preview-click', 'progress-dirty'])

const canvasRef = ref(null)
const scrollRef = ref(null)

const gridWidth = computed(() => props.grid?.[0]?.length || 0)
const gridHeight = computed(() => props.grid?.length || 0)

const doneSet = computed(() => new Set(props.doneIndices || []))

const totalStitchable = computed(() => {
  let n = 0
  for (const row of props.grid || []) {
    for (const cell of row || []) {
      if (cell) n += 1
    }
  }
  return n
})

const doneCount = computed(() => {
  let n = 0
  const w = gridWidth.value
  for (const idx of doneSet.value) {
    const x = idx % w
    const y = Math.floor(idx / w)
    if (props.grid?.[y]?.[x]) n += 1
  }
  return n
})

const progressPct = computed(() => {
  if (!totalStitchable.value) return 0
  return (doneCount.value / totalStitchable.value) * 100
})

let painting = false
/** @type {boolean|null} */
let paintValue = null
let suppressClick = false

function paint() {
  if (!canvasRef.value || !props.grid?.length) return
  const base = pickCellSize(gridWidth.value, gridHeight.value, 12)
  const cellSize = Math.max(6, Math.round(base * Math.max(1, props.zoom)))
  renderCrossStitchCanvas(canvasRef.value, props.grid, {
    mode: props.renderMode,
    cellSize,
    doneSet: props.viewMode === 'stitching' ? doneSet.value : null,
  })
}

function cellFromEvent(event) {
  const canvas = canvasRef.value
  if (!canvas || !gridWidth.value) return null
  const rect = canvas.getBoundingClientRect()
  const clientX = event.clientX ?? event.touches?.[0]?.clientX
  const clientY = event.clientY ?? event.touches?.[0]?.clientY
  if (clientX == null || clientY == null) return null

  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const px = (clientX - rect.left) * scaleX
  const py = (clientY - rect.top) * scaleY
  const cellSize = canvas.width / gridWidth.value
  const x = Math.floor(px / cellSize)
  const y = Math.floor(py / cellSize)
  if (x < 0 || y < 0 || x >= gridWidth.value || y >= gridHeight.value) return null
  if (!props.grid[y][x]) return null
  return { x, y, idx: y * gridWidth.value + x }
}

function applyCell(idx, value) {
  const next = new Set(doneSet.value)
  const had = next.has(idx)
  if (value && !had) next.add(idx)
  else if (!value && had) next.delete(idx)
  else return false
  emit('update:doneIndices', [...next].sort((a, b) => a - b))
  emit('progress-dirty')
  return true
}

function onPointerDown(event) {
  if (props.viewMode !== 'stitching') return
  const cell = cellFromEvent(event)
  if (!cell) return
  event.preventDefault()
  painting = true
  paintValue = !doneSet.value.has(cell.idx)
  applyCell(cell.idx, paintValue)
  try {
    event.currentTarget?.setPointerCapture?.(event.pointerId)
  } catch {
    /* ignore */
  }
}

function onPointerMove(event) {
  if (props.viewMode !== 'stitching' || !painting || paintValue == null) return
  const cell = cellFromEvent(event)
  if (!cell) return
  if (applyCell(cell.idx, paintValue)) {
    suppressClick = true
  }
}

function onPointerUp(event) {
  if (props.viewMode !== 'stitching') return
  painting = false
  paintValue = null
  try {
    event.currentTarget?.releasePointerCapture?.(event.pointerId)
  } catch {
    /* ignore */
  }
  // Empêche le click synthétique après un drag
  if (suppressClick) {
    setTimeout(() => {
      suppressClick = false
    }, 0)
  }
}

function onClick(event) {
  if (props.viewMode === 'stitching') {
    if (suppressClick) return
    // Pointer déjà géré au down ; ignore click doublon
    return
  }
  emit('preview-click', event)
}

watch(
  () => [props.grid, props.renderMode, props.zoom, props.viewMode, props.doneIndices],
  async () => {
    await nextTick()
    paint()
  },
  { deep: true },
)

watch(
  () => props.viewMode,
  async () => {
    await nextTick()
    paint()
  },
)

onMounted(() => {
  paint()
})

onBeforeUnmount(() => {
  painting = false
})

defineExpose({
  paint,
  scrollRef,
  canvasRef,
  totalStitchable,
  doneCount,
  progressPct,
})
</script>

<template>
  <div class="csc">
    <div
      v-if="viewMode === 'stitching'"
      class="csc-progress"
      aria-live="polite"
    >
      <div class="csc-progress__meta">
        <strong>
          {{ doneCount.toLocaleString('fr-FR') }}
          /
          {{ totalStitchable.toLocaleString('fr-FR') }}
          croix
        </strong>
        <span>{{ progressPct.toFixed(1).replace('.', ',') }}&nbsp;%</span>
      </div>
      <div class="csc-progress__track" role="progressbar" :aria-valuenow="Math.round(progressPct)" aria-valuemin="0" aria-valuemax="100">
        <div class="csc-progress__fill" :style="{ width: Math.min(100, progressPct) + '%' }" />
      </div>
    </div>

    <div
      ref="scrollRef"
      class="csc-scroll"
      :class="{ 'csc-scroll--stitching': viewMode === 'stitching' }"
    >
      <canvas
        ref="canvasRef"
        class="csc-canvas"
        :class="{ 'csc-canvas--stitching': viewMode === 'stitching' }"
        :aria-label="
          viewMode === 'stitching'
            ? 'Grille de broderie — clique ou glisse pour cocher les cases'
            : 'Diagramme du motif'
        "
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @click="onClick"
      />
    </div>
  </div>
</template>

<style scoped>
.csc {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.csc-progress__meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.75rem;
  font-size: 0.88rem;
  font-weight: 700;
  color: #5a4a68;
}

.csc-progress__meta strong {
  font-size: 0.95rem;
  color: #3d2f4a;
}

.csc-progress__track {
  margin-top: 0.35rem;
  height: 0.55rem;
  border-radius: 999px;
  background: rgba(213, 181, 234, 0.35);
  overflow: hidden;
}

.csc-progress__fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #9fd4a8, #5aa86a);
  transition: width 0.12s ease;
}

.csc-scroll {
  max-width: 100%;
  overflow: auto;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: #fff;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-x pan-y;
}

.csc-scroll--stitching {
  touch-action: none;
}

.csc-canvas {
  display: block;
  max-width: none;
  cursor: zoom-in;
}

.csc-canvas--stitching {
  cursor: crosshair;
  touch-action: none;
}

@media (prefers-color-scheme: dark) {
  .csc-progress__meta {
    color: #adb5bd;
  }
  .csc-progress__meta strong {
    color: #f0e8f8;
  }
  .csc-progress__track {
    background: rgba(173, 129, 190, 0.25);
  }
}
</style>
