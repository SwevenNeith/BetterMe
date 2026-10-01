<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import {
  computeAlignedCellMetrics,
  suggestPixelArtAlignment,
} from '../../utils/creation/samplePixelArtBlocks.js'

const props = defineProps({
  /** HTMLImageElement déjà chargé (pour détection / métriques). */
  image: {
    type: Object,
    required: true,
  },
  /** URL affichable (blob/http) — secours si drawImage échoue. */
  imageUrl: {
    type: String,
    default: '',
  },
  /** Alignement initial (ex. déjà validé / détecté). */
  initialAlignment: {
    type: Object,
    default: null,
  },
  minCells: {
    type: Number,
    default: 1,
  },
  maxCells: {
    type: Number,
    default: 8192,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['validate', 'change'])

const cols = ref(16)
const rows = ref(16)
const offsetX = ref(0)
const offsetY = ref(0)
const zoom = ref(1)

const ZOOM_MIN = 0.5
const ZOOM_MAX = 24
const stageRef = ref(null)
const stageCanvasRef = ref(null)
/** @type {import('vue').Ref<HTMLImageElement|null>} */
const fallbackImg = ref(null)

const imageWidth = computed(() => props.image?.naturalWidth || props.image?.width || 0)
const imageHeight = computed(() => props.image?.naturalHeight || props.image?.height || 0)

const metrics = computed(() =>
  computeAlignedCellMetrics(imageWidth.value, imageHeight.value, {
    cols: cols.value,
    rows: rows.value,
    offsetX: offsetX.value,
    offsetY: offsetY.value,
  }),
)

const currentAlignment = computed(() => ({
  cols: metrics.value.cols,
  rows: metrics.value.rows,
  offsetX: metrics.value.offsetX,
  offsetY: metrics.value.offsetY,
}))

const displayWidth = computed(() => Math.round(imageWidth.value * zoom.value))
const displayHeight = computed(() => Math.round(imageHeight.value * zoom.value))

function clampCells(n) {
  return Math.min(props.maxCells, Math.max(props.minCells, Math.round(n) || props.minCells))
}

function clampOffset(v, max) {
  return Math.max(0, Math.min(Math.max(0, max - 1), Math.round(v) || 0))
}

function applyAlignment(a) {
  if (!a) return
  cols.value = clampCells(a.cols)
  rows.value = clampCells(a.rows)
  offsetX.value = clampOffset(a.offsetX, imageWidth.value)
  offsetY.value = clampOffset(a.offsetY, imageHeight.value)
}

function detectAndApply() {
  if (!props.image || props.disabled) return
  try {
    const detected = suggestPixelArtAlignment(props.image, props.maxCells)
    applyAlignment(detected)
  } catch (err) {
    console.error(err)
  }
}

function bump(field, delta) {
  if (props.disabled) return
  if (field === 'cols') cols.value = clampCells(cols.value + delta)
  else if (field === 'rows') rows.value = clampCells(rows.value + delta)
  else if (field === 'offsetX') offsetX.value = clampOffset(offsetX.value + delta, imageWidth.value)
  else if (field === 'offsetY') offsetY.value = clampOffset(offsetY.value + delta, imageHeight.value)
}

/** Taille cible d’une case en pixels source (met à jour cols/rows). */
function setCellPx(axis, px) {
  if (props.disabled) return
  const size = Math.max(1, Math.round(Number(px)) || 1)
  if (axis === 'x' || axis === 'both') {
    const usable = Math.max(1, imageWidth.value - offsetX.value)
    cols.value = clampCells(Math.max(1, Math.round(usable / size)))
  }
  if (axis === 'y' || axis === 'both') {
    const usable = Math.max(1, imageHeight.value - offsetY.value)
    rows.value = clampCells(Math.max(1, Math.round(usable / size)))
  }
}

function bumpCellPx(axis, delta) {
  if (props.disabled) return
  const current = Math.max(1, Math.round(axis === 'x' ? metrics.value.cellW : metrics.value.cellH))
  setCellPx(axis, current + delta)
}

/** ÷2 = cases plus petites (plus de colonnes/lignes), ×2 = cases plus grandes. */
function scaleCellSize(factor) {
  if (props.disabled) return
  if (factor === 0.5) {
    cols.value = clampCells(cols.value * 2)
    rows.value = clampCells(rows.value * 2)
  } else if (factor === 2) {
    cols.value = clampCells(Math.max(1, Math.round(cols.value / 2)))
    rows.value = clampCells(Math.max(1, Math.round(rows.value / 2)))
  }
}

function setZoom(level) {
  zoom.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(level * 20) / 20))
  nextTick(paintStage)
}

function paintCheckerboard(ctx, w, h, zoomLevel) {
  const tile = Math.max(6, Math.round(10 * zoomLevel))
  for (let y = 0; y < h; y += tile) {
    for (let x = 0; x < w; x += tile) {
      const even = (Math.floor(x / tile) + Math.floor(y / tile)) % 2 === 0
      ctx.fillStyle = even ? '#3a3348' : '#2a2436'
      ctx.fillRect(x, y, tile, tile)
    }
  }
}

function loadFallbackFromUrl() {
  const url = String(props.imageUrl || '').trim()
  if (!url) {
    fallbackImg.value = null
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      fallbackImg.value = img
      resolve(img)
    }
    img.onerror = () => {
      fallbackImg.value = null
      resolve(null)
    }
    img.src = url
  })
}

function drawableSource() {
  const primary = props.image
  const pw = primary?.naturalWidth || primary?.width || 0
  const ph = primary?.naturalHeight || primary?.height || 0
  if (primary && pw > 0 && ph > 0) return primary
  return fallbackImg.value
}

/**
 * Dessine l’image + la grille sur un seul canvas
 * (pas de dépendance à un <img> blob éventuellement cassé).
 */
function paintStage() {
  const canvas = stageCanvasRef.value
  if (!canvas || !imageWidth.value || !imageHeight.value) return

  const w = displayWidth.value
  const h = displayHeight.value
  if (w < 1 || h < 1) return

  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  paintCheckerboard(ctx, w, h, zoom.value)

  ctx.imageSmoothingEnabled = false
  const source = drawableSource()
  if (source) {
    try {
      ctx.drawImage(source, 0, 0, w, h)
    } catch (err) {
      console.error('PixelGridAligner drawImage:', err)
    }
  }

  const { cols: c, rows: r, offsetX: ox, offsetY: oy, cellW, cellH } = metrics.value
  const z = zoom.value
  const cellPx = Math.min(cellW, cellH) * z
  const outerW = cellPx < 8 ? 1 : Math.max(1.5, z * 0.3)
  const innerW = cellPx < 8 ? 0.6 : Math.max(0.8, z * 0.18)

  const drawLine = (x1, y1, x2, y2) => {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'
    ctx.lineWidth = outerW
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255, 80, 80, 0.85)'
    ctx.lineWidth = innerW
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  for (let i = 0; i <= c; i++) {
    const x = (ox + i * cellW) * z
    drawLine(x, oy * z, x, (oy + r * cellH) * z)
  }
  for (let j = 0; j <= r; j++) {
    const y = (oy + j * cellH) * z
    drawLine(ox * z, y, (ox + c * cellW) * z, y)
  }
}

async function refreshStage() {
  if (props.initialAlignment) applyAlignment(props.initialAlignment)
  else detectAndApply()
  await loadFallbackFromUrl()
  await nextTick()
  paintStage()
}

function onValidate() {
  if (props.disabled) return
  emit('validate', { ...currentAlignment.value })
}

function emitChange() {
  emit('change', { ...currentAlignment.value })
}

function onRedetect() {
  detectAndApply()
  nextTick(paintStage)
}

watch(
  () => [props.image, props.imageUrl, imageWidth.value, imageHeight.value],
  () => {
    void refreshStage()
  },
)

watch(
  () => props.initialAlignment,
  (val) => {
    if (val) {
      applyAlignment(val)
      nextTick(paintStage)
    }
  },
)

watch([cols, rows, offsetX, offsetY, zoom], () => {
  emitChange()
  paintStage()
})

onMounted(() => {
  void refreshStage()
})

defineExpose({
  detectAndApply,
  getAlignment: () => ({ ...currentAlignment.value }),
})
</script>

<template>
  <div class="pga" :class="{ 'pga--disabled': disabled }">
    <div class="pga-toolbar">
      <div class="pga-stepper">
        <span class="pga-stepper__label">Colonnes</span>
        <button type="button" class="pga-stepper__btn" :disabled="disabled" @click="bump('cols', -1)">
          −
        </button>
        <input
          v-model.number="cols"
          type="number"
          class="pga-stepper__input"
          :min="minCells"
          :max="maxCells"
          :disabled="disabled"
        />
        <button type="button" class="pga-stepper__btn" :disabled="disabled" @click="bump('cols', 1)">
          +
        </button>
      </div>

      <div class="pga-stepper">
        <span class="pga-stepper__label">Lignes</span>
        <button type="button" class="pga-stepper__btn" :disabled="disabled" @click="bump('rows', -1)">
          −
        </button>
        <input
          v-model.number="rows"
          type="number"
          class="pga-stepper__input"
          :min="minCells"
          :max="maxCells"
          :disabled="disabled"
        />
        <button type="button" class="pga-stepper__btn" :disabled="disabled" @click="bump('rows', 1)">
          +
        </button>
      </div>

      <div class="pga-stepper">
        <span class="pga-stepper__label">Case X (px)</span>
        <button type="button" class="pga-stepper__btn" :disabled="disabled" @click="bumpCellPx('x', -1)">
          −
        </button>
        <input
          type="number"
          class="pga-stepper__input"
          :value="Math.round(metrics.cellW)"
          min="1"
          :disabled="disabled"
          @change="setCellPx('x', $event.target.value)"
        />
        <button type="button" class="pga-stepper__btn" :disabled="disabled" @click="bumpCellPx('x', 1)">
          +
        </button>
      </div>

      <div class="pga-stepper">
        <span class="pga-stepper__label">Case Y (px)</span>
        <button type="button" class="pga-stepper__btn" :disabled="disabled" @click="bumpCellPx('y', -1)">
          −
        </button>
        <input
          type="number"
          class="pga-stepper__input"
          :value="Math.round(metrics.cellH)"
          min="1"
          :disabled="disabled"
          @change="setCellPx('y', $event.target.value)"
        />
        <button type="button" class="pga-stepper__btn" :disabled="disabled" @click="bumpCellPx('y', 1)">
          +
        </button>
      </div>

      <div class="pga-stepper">
        <span class="pga-stepper__label">Offset X</span>
        <button type="button" class="pga-stepper__btn" :disabled="disabled" @click="bump('offsetX', -1)">
          −
        </button>
        <input
          v-model.number="offsetX"
          type="number"
          class="pga-stepper__input"
          min="0"
          :disabled="disabled"
        />
        <button type="button" class="pga-stepper__btn" :disabled="disabled" @click="bump('offsetX', 1)">
          +
        </button>
      </div>

      <div class="pga-stepper">
        <span class="pga-stepper__label">Offset Y</span>
        <button type="button" class="pga-stepper__btn" :disabled="disabled" @click="bump('offsetY', -1)">
          −
        </button>
        <input
          v-model.number="offsetY"
          type="number"
          class="pga-stepper__input"
          min="0"
          :disabled="disabled"
        />
        <button type="button" class="pga-stepper__btn" :disabled="disabled" @click="bump('offsetY', 1)">
          +
        </button>
      </div>
    </div>

    <div class="pga-quick">
      <span class="pga-quick__label">Taille case</span>
      <button
        type="button"
        class="pga-quick__btn"
        title="Cases deux fois plus petites (si 4 pixels image = 1 case)"
        :disabled="disabled"
        @click="scaleCellSize(0.5)"
      >
        ÷2
      </button>
      <button
        type="button"
        class="pga-quick__btn"
        title="Cases deux fois plus grandes"
        :disabled="disabled"
        @click="scaleCellSize(2)"
      >
        ×2
      </button>
      <button
        type="button"
        class="pga-quick__btn"
        title="1 pixel image = 1 case"
        :disabled="disabled"
        @click="setCellPx('both', 1)"
      >
        1×1 px
      </button>
    </div>

    <div class="pga-zoom">
      <span class="pga-zoom__label">Zoom {{ zoom.toFixed(1) }}×</span>
      <button
        type="button"
        class="pga-stepper__btn"
        :disabled="disabled || zoom <= ZOOM_MIN"
        @click="setZoom(zoom - 0.25)"
      >
        −
      </button>
      <input
        v-model.number="zoom"
        type="range"
        class="pga-zoom__range"
        :min="ZOOM_MIN"
        :max="ZOOM_MAX"
        step="0.25"
        :disabled="disabled"
        @input="paintStage"
      />
      <button
        type="button"
        class="pga-stepper__btn"
        :disabled="disabled || zoom >= ZOOM_MAX"
        @click="setZoom(zoom + 0.25)"
      >
        +
      </button>
      <button type="button" class="pga-link" :disabled="disabled" @click="onRedetect">
        Redétecter
      </button>
    </div>

    <p class="pga-hint">
      Ajuste jusqu’à ce que chaque case couvre exactement un carré du dessin
      (~{{ metrics.cellW.toFixed(1) }}×{{ metrics.cellH.toFixed(1) }} px / case).
      Si plusieurs pixels image tiennent dans une case, utilise
      <strong>÷2</strong> ou descends Case X/Y jusqu’à 1.
    </p>

    <div ref="stageRef" class="pga-stage" role="img" aria-label="Image pixel art à aligner">
      <div class="pga-stage__inner" :style="{ width: displayWidth + 'px', height: displayHeight + 'px' }">
        <canvas ref="stageCanvasRef" class="pga-stage__canvas" />
      </div>
    </div>

    <button type="button" class="pga-validate" :disabled="disabled" @click="onValidate">
      Valider l’alignement
    </button>
  </div>
</template>

<style scoped>
.pga {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.pga--disabled {
  opacity: 0.72;
}

.pga-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem 1rem;
}

.pga-stepper {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.pga-stepper__label {
  font-size: 0.75rem;
  font-weight: 750;
  color: #5a4a68;
  min-width: 4.8rem;
}

.pga-quick {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.pga-quick__label {
  font-size: 0.75rem;
  font-weight: 750;
  color: #5a4a68;
  margin-right: 0.2rem;
}

.pga-quick__btn {
  border-radius: 8px;
  border: 1px solid rgba(173, 129, 190, 0.45);
  background: rgba(213, 181, 234, 0.2);
  color: #5a4a68;
  font-weight: 800;
  font-size: 0.78rem;
  padding: 0.35rem 0.65rem;
  cursor: pointer;
}

.pga-quick__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pga-stepper__btn {
  width: 1.85rem;
  height: 1.85rem;
  border-radius: 8px;
  border: 1px solid rgba(173, 129, 190, 0.45);
  background: rgba(213, 181, 234, 0.2);
  color: #5a4a68;
  font-weight: 800;
  cursor: pointer;
}

.pga-stepper__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pga-stepper__input {
  width: 3.4rem;
  text-align: center;
  border-radius: 8px;
  border: 1px solid rgba(173, 129, 190, 0.45);
  padding: 0.3rem 0.2rem;
  font-weight: 700;
  color: #3d2f4a;
  background: rgba(255, 255, 255, 0.9);
}

.pga-zoom {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.pga-zoom__label {
  font-size: 0.78rem;
  font-weight: 800;
  color: #5a4a68;
}

.pga-zoom__range {
  flex: 1;
  min-width: 8rem;
  accent-color: #ad81be;
}

.pga-link {
  border: none;
  background: transparent;
  color: #ad81be;
  font-weight: 750;
  font-size: 0.8rem;
  cursor: pointer;
  text-decoration: underline;
}

.pga-link:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pga-hint {
  margin: 0;
  font-size: 0.82rem;
  color: #6c757d;
  font-weight: 650;
}

.pga-stage {
  max-width: 100%;
  max-height: min(60vh, 520px);
  overflow: auto;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.4);
  background: #1a1520;
  -webkit-overflow-scrolling: touch;
}

.pga-stage__inner {
  position: relative;
  margin: 0;
  line-height: 0;
}

.pga-stage__canvas {
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

.pga-validate {
  border: none;
  border-radius: 12px;
  padding: 0.7rem 1.1rem;
  font-weight: 800;
  font-size: 0.9rem;
  cursor: pointer;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: #fff;
}

.pga-validate:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (prefers-color-scheme: dark) {
  .pga-stepper__label,
  .pga-zoom__label,
  .pga-quick__label {
    color: #d5b5ea;
  }
  .pga-hint {
    color: #adb5bd;
  }
  .pga-stepper__input {
    background: rgba(35, 30, 48, 0.95);
    color: #f0e8f8;
  }
  .pga-quick__btn {
    color: #e8d8f5;
    border-color: rgba(213, 181, 234, 0.35);
    background: rgba(90, 70, 110, 0.35);
  }
}
</style>
