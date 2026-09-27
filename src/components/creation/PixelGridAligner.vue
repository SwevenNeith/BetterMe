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
  /** URL affichable (blob/http) — obligatoire si image.src a été révoqué après chargement. */
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
    default: 200,
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
const ZOOM_MAX = 8
const stageRef = ref(null)
const overlayCanvasRef = ref(null)
const displaySrc = ref('')

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

function resolveDisplaySrc() {
  if (props.imageUrl) {
    displaySrc.value = props.imageUrl
    return
  }
  // Fallback : redessine l’HTMLImageElement déjà décodé (src blob souvent révoqué)
  try {
    const img = props.image
    const w = img?.naturalWidth || img?.width
    const h = img?.naturalHeight || img?.height
    if (!img || !w || !h) {
      displaySrc.value = ''
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    displaySrc.value = canvas.toDataURL('image/png')
  } catch (err) {
    console.error(err)
    displaySrc.value = props.image?.src || ''
  }
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

function setZoom(level) {
  zoom.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(level * 20) / 20))
  nextTick(paintOverlay)
}

function paintOverlay() {
  const canvas = overlayCanvasRef.value
  if (!canvas || !imageWidth.value || !imageHeight.value) return

  const w = displayWidth.value
  const h = displayHeight.value
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, w, h)
  const { cols: c, rows: r, offsetX: ox, offsetY: oy, cellW, cellH } = metrics.value
  const z = zoom.value

  const drawLine = (x1, y1, x2, y2) => {
    // Contour noir
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)'
    ctx.lineWidth = Math.max(2, z * 0.35)
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    // Trait contrasté
    ctx.strokeStyle = 'rgba(255, 60, 60, 0.75)'
    ctx.lineWidth = Math.max(1, z * 0.2)
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

function onValidate() {
  if (props.disabled) return
  emit('validate', { ...currentAlignment.value })
}

function emitChange() {
  emit('change', { ...currentAlignment.value })
}

watch(
  () => [props.image, props.imageUrl],
  () => {
    resolveDisplaySrc()
    if (props.initialAlignment) applyAlignment(props.initialAlignment)
    else detectAndApply()
    nextTick(paintOverlay)
  },
)

watch(
  () => props.initialAlignment,
  (val) => {
    if (val) {
      applyAlignment(val)
      nextTick(paintOverlay)
    }
  },
)

watch([cols, rows, offsetX, offsetY, zoom], () => {
  emitChange()
  paintOverlay()
})

onMounted(() => {
  resolveDisplaySrc()
  if (props.initialAlignment) applyAlignment(props.initialAlignment)
  else detectAndApply()
  nextTick(paintOverlay)
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

    <div class="pga-zoom">
      <span class="pga-zoom__label">Zoom {{ zoom.toFixed(1) }}×</span>
      <button type="button" class="pga-stepper__btn" :disabled="disabled || zoom <= ZOOM_MIN" @click="setZoom(zoom - 0.25)">
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
        @input="paintOverlay"
      />
      <button type="button" class="pga-stepper__btn" :disabled="disabled || zoom >= ZOOM_MAX" @click="setZoom(zoom + 0.25)">
        +
      </button>
      <button type="button" class="pga-link" :disabled="disabled" @click="detectAndApply">
        Redétecter
      </button>
    </div>

    <p class="pga-hint">
      Ajuste jusqu’à ce que chaque case couvre exactement un carré du dessin
      (~{{ metrics.cellW.toFixed(1) }}×{{ metrics.cellH.toFixed(1) }} px / case).
    </p>

    <div ref="stageRef" class="pga-stage">
      <div class="pga-stage__inner" :style="{ width: displayWidth + 'px', height: displayHeight + 'px' }">
        <img
          class="pga-stage__img"
          :src="displaySrc"
          :width="displayWidth"
          :height="displayHeight"
          alt="Image pixel art à aligner"
          draggable="false"
        />
        <canvas ref="overlayCanvasRef" class="pga-stage__overlay" />
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
  min-width: 4.2rem;
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

.pga-stage__img {
  display: block;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  user-select: none;
  pointer-events: none;
}

.pga-stage__overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
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
  .pga-zoom__label {
    color: #d5b5ea;
  }
  .pga-hint {
    color: #adb5bd;
  }
  .pga-stepper__input {
    background: rgba(35, 30, 48, 0.95);
    color: #f0e8f8;
  }
}
</style>
