<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import { setFilePickerActive, setFileUploadInProgress } from '../composables/useAppTabResume.js'
import { APP_PAGE_IDS } from '../constants/common/appPages.js'
import { supabase } from '../lib/supabase.js'
import {
  deleteCrossStitchPattern,
  downloadCrossStitchSourceFile,
  expandStitchGrid,
  getCrossStitchPattern,
  listCrossStitchPatterns,
  normalizeStitchProgress,
  saveCrossStitchPattern,
  saveStitchProgress,
} from '../services/creation/crossStitchPatterns.js'
import { buildCrossStitchGrid } from '../utils/creation/buildCrossStitchGrid.js'
import { prepareSampledColors } from '../utils/creation/prepareSampledColors.js'
import {
  AIDA_COUNTS,
  DMC_SKEIN_LENGTH_M,
  enrichLegendWithFloss,
  metersPerCross,
  summarizeFlossLegend,
} from '../utils/creation/estimateFloss.js'
import {
  DMC_FLOSS,
} from '../utils/creation/matchDmc.js'
import {
  computeTargetSize,
  loadImageFromFile,
} from '../utils/creation/progressiveResize.js'
import PixelGridAligner from '../components/creation/PixelGridAligner.vue'
import CrossStitchChart from '../components/creation/CrossStitchChart.vue'

usePageDisplayLabel(APP_PAGE_IDS.CREATION, 'Points de Croix', {
  setDocumentTitle: true,
})

const router = useRouter()

const WIDTH_MIN = 20
const WIDTH_MAX = 200
const COLORS_MIN = 8
const COLORS_MAX = 40
const LIVE_DEBOUNCE_MS = 380

const fileInputRef = ref(null)
const sourceImage = ref(null)
/** @type {import('vue').Ref<File|null>} */
const sourceFile = ref(null)
const sourceName = ref('')
const sourcePreviewUrl = ref('')
const targetWidth = ref(80)
const colorCount = ref(16)
/** Image déjà en pixel art → échantillonnage par blocs (mode), sans K-means. */
const isPixelArt = ref(false)
/** Alignement validé (cols, rows, offsetX, offsetY) — conservé tant que l’image ne change pas. */
const pixelArtAlignment = ref(null)
const alignmentValidated = ref(false)
const sourceFingerprint = ref('')

/** Motif courant en BDD (null = nouveau). */
const currentPatternId = ref(null)
const patternTitle = ref('')
const savedSourcePath = ref(null)
/** true si l’image source locale doit être (re)uploadée. */
const sourceDirty = ref(false)

const userId = ref(null)
const savedPatterns = ref([])
const isLoadingLibrary = ref(false)
const isSaving = ref(false)
const saveMessage = ref('')
const libraryError = ref('')

/** @type {import('vue').Ref<'color' | 'symbols' | 'both'>} */
const renderMode = ref('color')
/** @type {import('vue').Ref<'preview' | 'stitching'>} */
const chartViewMode = ref('preview')

/** Brins utilisés pour broder (1–6). */
const strandCount = ref(2)
/** Comptage toile Aida (pts / pouce). */
const aidaCount = ref(14)

/** true si le motif est figé (sauvegardé / ouvert) — sliders & image verrouillés. */
const paramsLocked = ref(false)

/** Zoom d’affichage du diagramme (1 = taille de base). */
const chartZoom = ref(1)
const ZOOM_MIN = 1
const ZOOM_MAX = 5

/** Indices linéaires des cases brodées (faites). */
const stitchDoneIndices = ref([])
const progressSaveError = ref('')
const chartRef = ref(null)

const isProcessing = ref(false)
const processError = ref('')
const processStatus = ref('')

const gridSize = ref({ width: 0, height: 0 })

const stitchGrid = ref(null)
const stitchLegend = ref([])
const dmcCatalogCount = DMC_FLOSS.length

let liveDebounceTimer = null
let progressDebounceTimer = null
let pipelineGeneration = 0
/** Empêche le watch sliders de recalculer pendant un chargement BDD. */
let suppressLivePreview = false

const PROGRESS_DEBOUNCE_MS = 650

const stitchSummary = computed(() => {
  if (!stitchGrid.value?.length) return ''
  const h = stitchGrid.value.length
  const w = stitchGrid.value[0]?.length || 0
  return `${w} × ${h} cases · ${stitchLegend.value.length} symbole${stitchLegend.value.length > 1 ? 's' : ''}`
})

const paramsEditable = computed(() => Boolean(sourceImage.value) && !paramsLocked.value)

const flossLegend = computed(() =>
  enrichLegendWithFloss(stitchLegend.value, {
    aidaCount: aidaCount.value,
    strands: strandCount.value,
  }),
)

const flossTotals = computed(() => summarizeFlossLegend(flossLegend.value))

const lengthPerCrossCm = computed(() =>
  (metersPerCross(aidaCount.value, strandCount.value) * 100).toFixed(2),
)

function formatMeters(m) {
  if (m < 0.01) return `${(m * 100).toFixed(1)} cm`
  if (m < 1) return `${(m * 100).toFixed(0)} cm`
  return `${m.toFixed(2)} m`
}

function formatSkeinsExact(n) {
  if (n < 0.01) return '< 0,01'
  return n.toFixed(2).replace('.', ',')
}

const autoTargetHeight = computed(() => {
  if (!sourceImage.value) return 0
  const { height } = computeTargetSize(
    sourceImage.value.naturalWidth,
    sourceImage.value.naturalHeight,
    targetWidth.value,
  )
  return height
})

const needsPixelArtAlignment = computed(
  () => isPixelArt.value && Boolean(sourceImage.value) && !alignmentValidated.value,
)

const canRunPixelArtPipeline = computed(
  () => !isPixelArt.value || (alignmentValidated.value && pixelArtAlignment.value),
)

const canSave = computed(
  () =>
    Boolean(userId.value) &&
    Boolean(stitchGrid.value?.length) &&
    Boolean(sourceFile.value || savedSourcePath.value) &&
    !isProcessing.value &&
    !isSaving.value,
)

function formatUpdatedAt(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(iso)
  }
}

function revokeUrl(url) {
  if (url && String(url).startsWith('blob:')) URL.revokeObjectURL(url)
}

function clearResults() {
  gridSize.value = { width: 0, height: 0 }
  stitchGrid.value = null
  stitchLegend.value = []
  stitchDoneIndices.value = []
  progressSaveError.value = ''
  chartViewMode.value = 'preview'
  processError.value = ''
  processStatus.value = ''
  chartZoom.value = 1
}

function setChartZoom(level) {
  chartZoom.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, level))
}

function zoomIn() {
  setChartZoom(chartZoom.value + 1)
}

function zoomOut() {
  setChartZoom(chartZoom.value - 1)
}

function onChartPreviewClick(event) {
  const chart = chartRef.value
  const canvas = chart?.canvasRef
  const scroll = chart?.scrollRef
  if (!canvas || !scroll || !stitchGrid.value?.length) return

  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const px = (event.clientX - rect.left) * scaleX
  const py = (event.clientY - rect.top) * scaleY

  scroll.scrollLeft = Math.max(0, px - scroll.clientWidth / 2)
  scroll.scrollTop = Math.max(0, py - scroll.clientHeight / 2)

  if (chartZoom.value < 2) {
    setChartZoom(2)
    nextTick(() => {
      const c = chartRef.value?.canvasRef
      const s = chartRef.value?.scrollRef
      if (!c || !s) return
      const ratioX = px / canvas.width
      const ratioY = py / canvas.height
      s.scrollLeft = Math.max(0, ratioX * c.width - s.clientWidth / 2)
      s.scrollTop = Math.max(0, ratioY * c.height - s.clientHeight / 2)
    })
  }
}

function cancelProgressDebounce() {
  if (progressDebounceTimer != null) {
    clearTimeout(progressDebounceTimer)
    progressDebounceTimer = null
  }
}

function scheduleProgressSave() {
  cancelProgressDebounce()
  if (!currentPatternId.value || !userId.value) return
  progressDebounceTimer = setTimeout(() => {
    progressDebounceTimer = null
    persistProgressNow()
  }, PROGRESS_DEBOUNCE_MS)
}

async function persistProgressNow() {
  if (!currentPatternId.value || !userId.value) return
  progressSaveError.value = ''
  try {
    await saveStitchProgress(
      supabase,
      userId.value,
      currentPatternId.value,
      stitchDoneIndices.value,
    )
  } catch (err) {
    console.error(err)
    progressSaveError.value = err?.message || 'Sauvegarde de la progression impossible.'
  }
}

function onDoneIndicesUpdate(indices) {
  stitchDoneIndices.value = indices
  scheduleProgressSave()
}

function cancelLiveDebounce() {
  if (liveDebounceTimer != null) {
    clearTimeout(liveDebounceTimer)
    liveDebounceTimer = null
  }
}

function scheduleLivePreview() {
  cancelLiveDebounce()
  if (!sourceImage.value || suppressLivePreview || paramsLocked.value) return
  if (isPixelArt.value && !canRunPixelArtPipeline.value) return
  liveDebounceTimer = setTimeout(() => {
    liveDebounceTimer = null
    runPipeline()
  }, LIVE_DEBOUNCE_MS)
}

function unlockModelParams() {
  if (!paramsLocked.value) return
  const ok = window.confirm(
    'Modifier les paramètres (image / grille / couleurs) régénèrera le motif. Continuer ?',
  )
  if (!ok) return
  paramsLocked.value = false
  saveMessage.value = 'Paramètres déverrouillés — les changements régénèrent le motif.'
}

function lockModelParams() {
  paramsLocked.value = true
}

function fingerprintFor(img, file) {
  return [
    file?.name || '',
    file?.size || 0,
    file?.lastModified || 0,
    img?.naturalWidth || 0,
    img?.naturalHeight || 0,
  ].join('|')
}

function clearPixelArtAlignment() {
  pixelArtAlignment.value = null
  alignmentValidated.value = false
}

function onPixelArtAlignmentValidate(alignment) {
  pixelArtAlignment.value = {
    cols: alignment.cols,
    rows: alignment.rows,
    offsetX: alignment.offsetX,
    offsetY: alignment.offsetY,
  }
  alignmentValidated.value = true
  targetWidth.value = alignment.cols
  saveMessage.value = 'Alignement validé — génération du motif…'
  runPipeline()
}

function reajustPixelArtAlignment() {
  if (paramsLocked.value) return
  alignmentValidated.value = false
}

function onFilePickerOpen() {
  setFilePickerActive(true)
}

function onFilePickerClose() {
  setFilePickerActive(false)
}

function triggerFilePicker() {
  if (paramsLocked.value || isSaving.value) return
  onFilePickerOpen()
  fileInputRef.value?.click()
}

async function onFileChange(event) {
  const file = event.target?.files?.[0]
  event.target.value = ''
  if (!file) {
    onFilePickerClose()
    return
  }
  if (paramsLocked.value) {
    onFilePickerClose()
    return
  }

  cancelLiveDebounce()
  processError.value = ''
  saveMessage.value = ''
  clearResults()
  revokeUrl(sourcePreviewUrl.value)
  sourcePreviewUrl.value = ''
  sourceImage.value = null
  sourceFile.value = file
  sourceName.value = file.name
  currentPatternId.value = null
  savedSourcePath.value = null
  sourceDirty.value = true
  paramsLocked.value = false
  clearPixelArtAlignment()
  if (!patternTitle.value.trim()) {
    patternTitle.value = file.name.replace(/\.[^.]+$/, '') || 'Sans titre'
  }

  try {
    const img = await loadImageFromFile(file)
    sourceImage.value = img
    sourcePreviewUrl.value = URL.createObjectURL(file)
    sourceFingerprint.value = fingerprintFor(img, file)
    if (isPixelArt.value) {
      // Alignement obligatoire avant échantillonnage
      processStatus.value = ''
      saveMessage.value = 'Aligne la grille sur l’image, puis valide.'
    } else {
      await runPipeline()
    }
  } catch (err) {
    processError.value = err?.message || 'Impossible de charger l’image.'
    sourceName.value = ''
    sourceFile.value = null
  } finally {
    onFilePickerClose()
  }
}

async function runPipeline() {
  if (!sourceImage.value) return
  if (isPixelArt.value && !canRunPixelArtPipeline.value) return

  const generation = ++pipelineGeneration
  isProcessing.value = true
  processError.value = ''

  try {
    processStatus.value = isPixelArt.value
      ? 'Sélection des couleurs + équivalents DMC…'
      : 'Resize + K-means LAB…'
    await new Promise((r) => requestAnimationFrame(r))
    if (generation !== pipelineGeneration) return

    const sampled = prepareSampledColors(sourceImage.value, {
      isPixelArt: isPixelArt.value,
      targetWidth: targetWidth.value,
      colorCount: colorCount.value,
      alignment: isPixelArt.value ? pixelArtAlignment.value : null,
    })

    if (!isPixelArt.value) {
      processStatus.value = 'Matching DMC…'
      await new Promise((r) => requestAnimationFrame(r))
      if (generation !== pipelineGeneration) return
    }

    const stitch = buildCrossStitchGrid(sampled.imageData, {
      // Pixel art : on garde les teintes de l’image ; DMC sert à la légende / fils
      preserveSourceRgb: isPixelArt.value,
    })
    if (generation !== pipelineGeneration) return

    gridSize.value = { width: sampled.width, height: sampled.height }
    stitchGrid.value = stitch.grid
    stitchLegend.value = stitch.legend
    // Nouvelle grille → reset progression locale (sauf si mêmes dims et déjà en cours)
    stitchDoneIndices.value = []
    if (sampled.alignment) {
      pixelArtAlignment.value = sampled.alignment
      targetWidth.value = sampled.alignment.cols
    }

    processStatus.value = ''
    await nextTick()
    if (generation !== pipelineGeneration) return
  } catch (err) {
    if (generation !== pipelineGeneration) return
    console.error(err)
    processError.value = err?.message || 'Échec du traitement.'
    processStatus.value = ''
  } finally {
    if (generation === pipelineGeneration) {
      isProcessing.value = false
    }
  }
}

async function refreshLibrary() {
  if (!userId.value) {
    savedPatterns.value = []
    return
  }
  isLoadingLibrary.value = true
  libraryError.value = ''
  try {
    savedPatterns.value = await listCrossStitchPatterns(supabase, userId.value)
  } catch (err) {
    console.error(err)
    libraryError.value = err?.message || 'Impossible de charger les motifs sauvegardés.'
    savedPatterns.value = []
  } finally {
    isLoadingLibrary.value = false
  }
}

async function saveCurrentPattern() {
  if (!canSave.value) return
  isSaving.value = true
  saveMessage.value = ''
  processError.value = ''
  if (sourceDirty.value) setFileUploadInProgress(true)
  try {
    const meta = {
      sourceNaturalWidth: sourceImage.value?.naturalWidth || null,
      sourceNaturalHeight: sourceImage.value?.naturalHeight || null,
      renderMode: renderMode.value,
      dmcCatalogCount,
      isPixelArt: isPixelArt.value,
      alignment: isPixelArt.value ? pixelArtAlignment.value : null,
      sourceFingerprint: sourceFingerprint.value,
    }
    const colorCountForDb = isPixelArt.value
      ? Math.max(COLORS_MIN, Math.min(COLORS_MAX, stitchLegend.value.length || COLORS_MIN))
      : colorCount.value
    const row = await saveCrossStitchPattern(supabase, userId.value, {
      id: currentPatternId.value,
      title: patternTitle.value,
      sourceFile: sourceDirty.value ? sourceFile.value : null,
      keepSourcePath: savedSourcePath.value,
      keepSourceName: sourceName.value,
      targetWidth: isPixelArt.value
        ? pixelArtAlignment.value?.cols || targetWidth.value
        : targetWidth.value,
      colorCount: colorCountForDb,
      aidaCount: aidaCount.value,
      strandCount: strandCount.value,
      grid: stitchGrid.value,
      palette: stitchLegend.value,
      metadata: meta,
    })
    currentPatternId.value = row.id
    savedSourcePath.value = row.source_storage_path
    patternTitle.value = row.title
    sourceDirty.value = false
    lockModelParams()
    saveMessage.value = 'Motif enregistré — paramètres verrouillés.'
    await refreshLibrary()
    if (stitchDoneIndices.value.length) {
      await persistProgressNow()
    }
  } catch (err) {
    console.error(err)
    processError.value = err?.message || 'Échec de la sauvegarde.'
  } finally {
    isSaving.value = false
    setFileUploadInProgress(false)
  }
}

function startNewPattern() {
  cancelLiveDebounce()
  pipelineGeneration += 1
  clearResults()
  revokeUrl(sourcePreviewUrl.value)
  sourcePreviewUrl.value = ''
  sourceImage.value = null
  sourceFile.value = null
  sourceName.value = ''
  currentPatternId.value = null
  savedSourcePath.value = null
  sourceDirty.value = false
  paramsLocked.value = false
  isPixelArt.value = false
  clearPixelArtAlignment()
  sourceFingerprint.value = ''
  patternTitle.value = ''
  saveMessage.value = ''
  processError.value = ''
}

async function openSavedPattern(patternId) {
  if (!userId.value || !patternId) return
  cancelLiveDebounce()
  suppressLivePreview = true
  isLoadingLibrary.value = true
  libraryError.value = ''
  processError.value = ''
  saveMessage.value = ''
  try {
    const row = await getCrossStitchPattern(supabase, userId.value, patternId)
    if (!row) throw new Error('Motif introuvable.')

    const file = await downloadCrossStitchSourceFile(
      supabase,
      row.source_storage_path,
      row.source_file_name || 'source.png',
    )
    const img = await loadImageFromFile(file)

    clearResults()
    revokeUrl(sourcePreviewUrl.value)

    sourceFile.value = file
    sourceImage.value = img
    sourceName.value = row.source_file_name || file.name
    sourcePreviewUrl.value = URL.createObjectURL(file)
    currentPatternId.value = row.id
    savedSourcePath.value = row.source_storage_path
    patternTitle.value = row.title || ''
    sourceDirty.value = false
    targetWidth.value = row.target_width
    colorCount.value = row.color_count
    aidaCount.value = row.aida_count
    strandCount.value = row.strand_count
    isPixelArt.value = Boolean(row.metadata?.isPixelArt)
    if (row.metadata?.alignment?.cols && row.metadata?.alignment?.rows) {
      pixelArtAlignment.value = {
        cols: row.metadata.alignment.cols,
        rows: row.metadata.alignment.rows,
        offsetX: row.metadata.alignment.offsetX || 0,
        offsetY: row.metadata.alignment.offsetY || 0,
      }
      alignmentValidated.value = true
    } else if (isPixelArt.value) {
      // Anciens motifs : déduire un alignement depuis la grille stockée
      pixelArtAlignment.value = {
        cols: row.grid_width || row.target_width,
        rows: row.grid_height || row.target_width,
        offsetX: 0,
        offsetY: 0,
      }
      alignmentValidated.value = true
    } else {
      clearPixelArtAlignment()
    }
    sourceFingerprint.value = fingerprintFor(img, file)

    const paletteRows = Array.isArray(row.palette) ? row.palette : []
    stitchLegend.value = paletteRows
    stitchGrid.value = expandStitchGrid(row.grid, paletteRows)
    gridSize.value = {
      width: row.grid_width || stitchGrid.value[0]?.length || 0,
      height: row.grid_height || stitchGrid.value.length || 0,
    }
    stitchDoneIndices.value = normalizeStitchProgress(row.stitch_progress)

    if (
      row.metadata?.renderMode === 'symbols' ||
      row.metadata?.renderMode === 'color' ||
      row.metadata?.renderMode === 'both'
    ) {
      renderMode.value = row.metadata.renderMode
    }

    lockModelParams()
    chartViewMode.value = stitchDoneIndices.value.length ? 'stitching' : 'preview'
    await nextTick()
    saveMessage.value = 'Motif chargé — paramètres verrouillés.'
  } catch (err) {
    console.error(err)
    processError.value = err?.message || 'Impossible d’ouvrir le motif.'
  } finally {
    isLoadingLibrary.value = false
    // Laisse passer le tick des watchers avant de réactiver le live preview
    await nextTick()
    cancelLiveDebounce()
    suppressLivePreview = false
  }
}

async function removeSavedPattern(patternId) {
  if (!userId.value || !patternId) return
  if (!window.confirm('Supprimer ce motif enregistré ?')) return
  try {
    await deleteCrossStitchPattern(supabase, userId.value, patternId)
    if (currentPatternId.value === patternId) {
      startNewPattern()
    }
    await refreshLibrary()
  } catch (err) {
    console.error(err)
    libraryError.value = err?.message || 'Suppression impossible.'
  }
}

watch([targetWidth, colorCount], () => {
  if (!sourceImage.value) return
  if (isPixelArt.value) return // grille pilotée par l’alignement validé
  scheduleLivePreview()
})

watch(isPixelArt, (enabled) => {
  if (!sourceImage.value || suppressLivePreview || paramsLocked.value) return
  if (enabled) {
    if (alignmentValidated.value && pixelArtAlignment.value) {
      scheduleLivePreview()
    } else {
      clearResults()
      saveMessage.value = 'Aligne la grille sur l’image, puis valide.'
    }
    return
  }
  scheduleLivePreview()
})

onMounted(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  userId.value = user?.id || null
  if (userId.value) {
    await refreshLibrary()
  }
})

onBeforeUnmount(() => {
  cancelLiveDebounce()
  cancelProgressDebounce()
  if (currentPatternId.value && userId.value && stitchDoneIndices.value) {
    persistProgressNow()
  }
  pipelineGeneration += 1
  setFilePickerActive(false)
  setFileUploadInProgress(false)
  revokeUrl(sourcePreviewUrl.value)
})
</script>

<template>
  <div class="pdc-page">
    <header class="pdc-header">
      <button type="button" class="pdc-back" @click="router.push({ name: 'creation' })">
        ← Création
      </button>
      <h1 class="pdc-title">Points de Croix</h1>
      <p class="pdc-subtitle">
        Aperçu live · DMC CIEDE2000 · grille Aida · sauvegarde Supabase
        (catalogue {{ dmcCatalogCount }} fils).
      </p>
    </header>

    <section class="pdc-card">
      <h2 class="pdc-step-title">Mes motifs</h2>
      <p v-if="!userId" class="pdc-hint">Connecte-toi pour sauvegarder et retrouver tes motifs.</p>
      <p v-else-if="isLoadingLibrary && !savedPatterns.length" class="pdc-hint">Chargement…</p>
      <p v-else-if="libraryError" class="pdc-error" role="alert">{{ libraryError }}</p>
      <p v-else-if="!savedPatterns.length" class="pdc-hint">
        Aucun motif enregistré pour l’instant.
      </p>
      <ul v-else class="pdc-library" aria-label="Motifs sauvegardés">
        <li v-for="item in savedPatterns" :key="item.id" class="pdc-library__item">
          <div class="pdc-library__meta">
            <strong>{{ item.title }}</strong>
            <small>
              {{ item.grid_width }}×{{ item.grid_height }} · {{ item.color_count }} coul. · Aida
              {{ item.aida_count }} · {{ formatUpdatedAt(item.updated_at) }}
            </small>
          </div>
          <div class="pdc-library__actions">
            <button
              type="button"
              class="pdc-btn pdc-btn--secondary pdc-btn--sm"
              :disabled="isLoadingLibrary || isSaving"
              @click="openSavedPattern(item.id)"
            >
              Ouvrir
            </button>
            <button
              type="button"
              class="pdc-btn pdc-btn--danger pdc-btn--sm"
              :disabled="isLoadingLibrary || isSaving"
              @click="removeSavedPattern(item.id)"
            >
              Suppr.
            </button>
          </div>
        </li>
      </ul>
      <button
        v-if="currentPatternId || sourceImage"
        type="button"
        class="pdc-btn pdc-btn--secondary pdc-btn--sm pdc-library__new"
        @click="startNewPattern"
      >
        Nouveau motif
      </button>
    </section>

    <section class="pdc-card">
      <h2 class="pdc-step-title">1. Image &amp; paramètres</h2>

      <div v-if="paramsLocked" class="pdc-lock-banner">
        <p class="pdc-hint pdc-hint--tight">
          Motif verrouillé — image et paramètres de grille protégés contre les changements accidentels.
        </p>
        <button
          type="button"
          class="pdc-btn pdc-btn--secondary pdc-btn--sm"
          @click="unlockModelParams"
        >
          Modifier les paramètres du modèle
        </button>
      </div>

      <div class="pdc-upload">
        <input
          ref="fileInputRef"
          type="file"
          accept="image/*"
          class="pdc-file"
          :disabled="paramsLocked"
          @pointerdown="onFilePickerOpen"
          @click="onFilePickerOpen"
          @change="onFileChange"
          @cancel="onFilePickerClose"
        />
        <button
          type="button"
          class="pdc-btn pdc-btn--secondary"
          :disabled="paramsLocked || isSaving"
          @click="triggerFilePicker"
        >
          Choisir une image
        </button>
        <span v-if="sourceName" class="pdc-filename">{{ sourceName }}</span>
      </div>

      <div v-if="sourceImage" class="pdc-preview-row">
        <figure class="pdc-figure">
          <img :src="sourcePreviewUrl" alt="Image source" class="pdc-preview" />
          <figcaption>
            {{ sourceImage.naturalWidth }} × {{ sourceImage.naturalHeight }} px
          </figcaption>
        </figure>
      </div>

      <label class="pdc-check">
        <input
          v-model="isPixelArt"
          type="checkbox"
          class="pdc-check__input"
          :disabled="!paramsEditable"
        />
        <span class="pdc-check__label">Cette image est déjà en pixel art</span>
      </label>
      <p v-if="isPixelArt" class="pdc-hint pdc-hint--tight">
        Pas de K-means ni de recalcul de palette : chaque case reprend la couleur déjà
        présente au centre du carré, puis on trouve seulement l’équivalent DMC pour la légende.
      </p>

      <template v-if="!isPixelArt">
        <label class="pdc-slider">
          <span class="pdc-slider__label">
            Largeur cible :
            <strong>{{ targetWidth }}</strong> croix
            <template v-if="sourceImage">
              → grille {{ targetWidth }} × {{ autoTargetHeight }}
            </template>
          </span>
          <input
            v-model.number="targetWidth"
            type="range"
            :min="WIDTH_MIN"
            :max="WIDTH_MAX"
            step="1"
            class="pdc-range"
            :disabled="!paramsEditable"
          />
          <span class="pdc-slider__hints">
            <span>{{ WIDTH_MIN }}</span>
            <span>{{ WIDTH_MAX }}</span>
          </span>
        </label>

        <label class="pdc-slider">
          <span class="pdc-slider__label">
            Nombre de couleurs : <strong>{{ colorCount }}</strong>
          </span>
          <input
            v-model.number="colorCount"
            type="range"
            :min="COLORS_MIN"
            :max="COLORS_MAX"
            step="1"
            class="pdc-range"
            :disabled="!paramsEditable"
          />
          <span class="pdc-slider__hints">
            <span>{{ COLORS_MIN }}</span>
            <span>{{ COLORS_MAX }}</span>
          </span>
        </label>
      </template>

      <div v-else-if="sourceImage" class="pdc-align-block">
        <div v-if="alignmentValidated && pixelArtAlignment" class="pdc-align-summary">
          <p class="pdc-live-status pdc-live-status--ok">
            Alignement validé :
            {{ pixelArtAlignment.cols }}×{{ pixelArtAlignment.rows }}
            · offset ({{ pixelArtAlignment.offsetX }}, {{ pixelArtAlignment.offsetY }})
          </p>
          <button
            type="button"
            class="pdc-btn pdc-btn--secondary pdc-btn--sm"
            :disabled="!paramsEditable"
            @click="reajustPixelArtAlignment"
          >
            Réajuster l’alignement
          </button>
        </div>

        <PixelGridAligner
          v-else
          :image="sourceImage"
          :image-url="sourcePreviewUrl"
          :initial-alignment="pixelArtAlignment"
          :min-cells="1"
          :max-cells="WIDTH_MAX"
          :disabled="!paramsEditable"
          @validate="onPixelArtAlignmentValidate"
        />
      </div>

      <p v-if="isProcessing" class="pdc-live-status" aria-live="polite">
        {{ processStatus || 'Mise à jour…' }}
      </p>
      <p v-else-if="sourceImage && stitchGrid" class="pdc-live-status pdc-live-status--ok">
        Aperçu à jour · {{ stitchSummary }}
      </p>
      <p v-else-if="needsPixelArtAlignment" class="pdc-live-status">
        Valide l’alignement pour lancer l’échantillonnage.
      </p>
      <p v-else-if="sourceImage && !paramsLocked" class="pdc-live-status">
        Déplacez un slider pour recalculer (après {{ LIVE_DEBOUNCE_MS }}&nbsp;ms).
      </p>

      <div v-if="stitchGrid" class="pdc-save-box">
        <label class="pdc-floss-field pdc-save-title">
          <span>Titre du motif</span>
          <input
            v-model="patternTitle"
            type="text"
            class="pdc-text-input"
            maxlength="120"
            placeholder="Sans titre"
            :disabled="isSaving"
          />
        </label>
        <button
          type="button"
          class="pdc-btn pdc-btn--primary"
          :disabled="!canSave"
          @click="saveCurrentPattern"
        >
          {{
            isSaving
              ? 'Enregistrement…'
              : currentPatternId
                ? 'Mettre à jour sur Supabase'
                : 'Sauvegarder sur Supabase'
          }}
        </button>
        <p v-if="saveMessage" class="pdc-live-status pdc-live-status--ok">{{ saveMessage }}</p>
        <p v-else-if="!userId" class="pdc-hint pdc-hint--tight">
          Connexion requise pour la persistance.
        </p>
      </div>

      <p v-if="processError" class="pdc-error" role="alert">{{ processError }}</p>
    </section>

    <section v-if="stitchGrid" class="pdc-card pdc-card--chart">
      <div class="pdc-chart-head">
        <h2 class="pdc-step-title">2. Diagramme</h2>
        <div class="pdc-mode-toggle" role="group" aria-label="Mode d’affichage">
          <button
            type="button"
            class="pdc-mode-btn"
            :class="{ 'is-active': renderMode === 'color' }"
            @click="renderMode = 'color'"
          >
            Couleur
          </button>
          <button
            type="button"
            class="pdc-mode-btn"
            :class="{ 'is-active': renderMode === 'symbols' }"
            @click="renderMode = 'symbols'"
          >
            Symboles + Aida
          </button>
          <button
            type="button"
            class="pdc-mode-btn"
            :class="{ 'is-active': renderMode === 'both' }"
            @click="renderMode = 'both'"
          >
            Couleur + Symboles
          </button>
        </div>
      </div>

      <div class="pdc-view-toggle" role="group" aria-label="Mode d’utilisation">
        <button
          type="button"
          class="pdc-mode-btn"
          :class="{ 'is-active': chartViewMode === 'preview' }"
          @click="chartViewMode = 'preview'"
        >
          Prévisualisation
        </button>
        <button
          type="button"
          class="pdc-mode-btn"
          :class="{ 'is-active': chartViewMode === 'stitching' }"
          @click="chartViewMode = 'stitching'"
        >
          Broderie
        </button>
      </div>

      <div class="pdc-zoom-bar">
        <span class="pdc-zoom-bar__label">Zoom {{ chartZoom }}×</span>
        <button
          type="button"
          class="pdc-btn pdc-btn--secondary pdc-btn--sm"
          :disabled="chartZoom <= ZOOM_MIN"
          @click="zoomOut"
        >
          −
        </button>
        <button
          type="button"
          class="pdc-btn pdc-btn--secondary pdc-btn--sm"
          :disabled="chartZoom >= ZOOM_MAX"
          @click="zoomIn"
        >
          +
        </button>
        <button
          type="button"
          class="pdc-btn pdc-btn--secondary pdc-btn--sm"
          :disabled="chartZoom === 1"
          @click="setChartZoom(1)"
        >
          Réinit.
        </button>
        <span class="pdc-zoom-bar__hint">
          <template v-if="chartViewMode === 'stitching'">
            Clique ou glisse pour cocher / décocher
          </template>
          <template v-else>Clique une zone pour centrer / zoomer</template>
        </span>
      </div>

      <p v-if="chartViewMode === 'stitching' && !currentPatternId" class="pdc-hint">
        Progression locale uniquement — sauvegarde le motif pour la conserver sur Supabase.
      </p>
      <p v-else-if="chartViewMode === 'stitching'" class="pdc-hint">
        Mode broderie : les cases faites restent colorées sous un voile clair + marque verte.
        Progression enregistrée automatiquement.
      </p>
      <p v-else class="pdc-hint">
        <template v-if="renderMode === 'color'">
          Cases remplies avec les RGB, grille fine + traits épais toutes les 10 croix.
        </template>
        <template v-else-if="renderMode === 'symbols'">
          Symboles N&amp;B + grille type toile Aida (ligne plus épaisse toutes les 10 cases).
        </template>
        <template v-else>
          Couleurs avec le symbole de chaque fil superposé (encre contrastée).
        </template>
      </p>

      <p v-if="progressSaveError" class="pdc-error" role="alert">{{ progressSaveError }}</p>

      <CrossStitchChart
        ref="chartRef"
        :grid="stitchGrid"
        :render-mode="renderMode"
        :view-mode="chartViewMode"
        :zoom="chartZoom"
        :done-indices="stitchDoneIndices"
        @update:done-indices="onDoneIndicesUpdate"
        @preview-click="onChartPreviewClick"
      />

      <div v-if="flossLegend.length" class="pdc-legend">
        <div class="pdc-legend__head">
          <h3 class="pdc-legend__title">Fils &amp; estimation</h3>
          <div class="pdc-floss-controls">
            <label class="pdc-floss-field">
              <span>Brins</span>
              <select v-model.number="strandCount" class="pdc-select">
                <option v-for="n in 6" :key="`br-${n}`" :value="n">{{ n }}</option>
              </select>
            </label>
            <label class="pdc-floss-field">
              <span>Toile Aida</span>
              <select v-model.number="aidaCount" class="pdc-select">
                <option v-for="c in AIDA_COUNTS" :key="`aida-${c}`" :value="c">
                  {{ c }} pts
                </option>
              </select>
            </label>
          </div>
        </div>

        <p class="pdc-hint pdc-hint--tight">
          Estimation :
          (croix × {{ lengthPerCrossCm }}&nbsp;cm/croix) ÷ {{ DMC_SKEIN_LENGTH_M }}&nbsp;m/écheveau.
          Longueur/croix = 2 diagonales × {{ strandCount }} brin{{ strandCount > 1 ? 's' : '' }}
          sur Aida {{ aidaCount }}.
        </p>

        <div class="pdc-legend-scroll">
          <table class="pdc-legend-table">
            <thead>
              <tr>
                <th scope="col">Symb.</th>
                <th scope="col">Couleur</th>
                <th scope="col">Code</th>
                <th scope="col">Nom</th>
                <th scope="col" class="pdc-num">Croix</th>
                <th scope="col" class="pdc-num">Fil</th>
                <th scope="col" class="pdc-num">Échev.</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in flossLegend" :key="`leg-${item.dmcCode}`">
                <td>
                  <span class="pdc-symbol-badge pdc-symbol-badge--sm">{{
                    item.symbol
                  }}</span>
                </td>
                <td>
                  <span
                    class="pdc-swatch__color pdc-swatch__color--inline"
                    :style="{ background: item.hex }"
                    :title="item.hex"
                  />
                </td>
                <td>
                  <strong>DMC {{ item.dmcCode }}</strong>
                </td>
                <td class="pdc-legend-name">{{ item.dmcName }}</td>
                <td class="pdc-num">{{ item.count.toLocaleString('fr-FR') }}</td>
                <td class="pdc-num" :title="`${item.meters.toFixed(3)} m exact`">
                  {{ formatMeters(item.meters) }}
                </td>
                <td
                  class="pdc-num pdc-skeins"
                  :title="`${formatSkeinsExact(item.skeinsExact)} écheveau(x) exact`"
                >
                  {{ item.skeins }}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colspan="4">Total ({{ flossTotals.colors }} couleurs)</td>
                <td class="pdc-num">
                  {{ flossTotals.stitches.toLocaleString('fr-FR') }}
                </td>
                <td class="pdc-num">{{ formatMeters(flossTotals.meters) }}</td>
                <td class="pdc-num pdc-skeins">{{ flossTotals.skeins }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.pdc-page {
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
  min-width: 0;
  overflow-x: hidden;
}

.pdc-header {
  margin-bottom: 1.25rem;
}

.pdc-back {
  display: inline-block;
  margin-bottom: 0.65rem;
  padding: 0.25rem 0;
  border: none;
  background: transparent;
  color: #6b4f7c;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
}

.pdc-back:hover {
  color: #3d2f4a;
}

.pdc-title {
  margin: 0;
  font-size: 1.85rem;
  font-weight: 800;
  color: #2c3e50;
}

.pdc-subtitle {
  margin: 0.4rem 0 0;
  color: #6c757d;
  font-size: 0.95rem;
  line-height: 1.45;
}

.pdc-card {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  margin-bottom: 1rem;
  padding: 1.25rem 1.1rem;
  border-radius: 16px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
}

.pdc-step-title {
  margin: 0 0 0.85rem;
  font-size: 1.05rem;
  font-weight: 800;
  color: #5a4a68;
}

.pdc-upload {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem;
  margin-bottom: 1rem;
}

.pdc-file {
  display: none;
}

.pdc-filename {
  font-size: 0.85rem;
  font-weight: 650;
  color: #6c757d;
  word-break: break-all;
}

.pdc-btn {
  border: none;
  border-radius: 12px;
  padding: 0.65rem 1.1rem;
  font-weight: 800;
  font-size: 0.9rem;
  cursor: pointer;
  transition:
    transform 0.12s ease,
    filter 0.12s ease,
    opacity 0.12s ease;
}

.pdc-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pdc-btn--secondary {
  background: rgba(213, 181, 234, 0.25);
  color: #5a4a68;
  border: 1px solid rgba(173, 129, 190, 0.35);
}

.pdc-btn--primary {
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: #fff;
  width: 100%;
}

.pdc-btn--danger {
  background: rgba(220, 53, 69, 0.12);
  color: #b02a37;
  border: 1px solid rgba(220, 53, 69, 0.28);
}

.pdc-btn--sm {
  padding: 0.4rem 0.7rem;
  font-size: 0.78rem;
  border-radius: 9px;
  width: auto;
}

.pdc-library {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.pdc-library__item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.55rem;
  padding: 0.55rem 0.65rem;
  border-radius: 10px;
  background: rgba(213, 181, 234, 0.12);
}

.pdc-library__meta {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.pdc-library__meta strong {
  font-size: 0.9rem;
  color: #3d2f4a;
}

.pdc-library__meta small {
  font-size: 0.72rem;
  color: #8c98a4;
  font-weight: 650;
}

.pdc-library__actions {
  display: flex;
  gap: 0.35rem;
}

.pdc-library__new {
  margin-top: 0.75rem;
}

.pdc-save-box {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.pdc-save-title {
  flex-direction: column;
  align-items: stretch;
  gap: 0.3rem;
}

.pdc-text-input {
  width: 100%;
  box-sizing: border-box;
  border-radius: 10px;
  border: 1px solid rgba(173, 129, 190, 0.45);
  background: rgba(255, 255, 255, 0.85);
  color: #3d2f4a;
  font-weight: 650;
  font-size: 0.9rem;
  padding: 0.55rem 0.7rem;
}

.pdc-btn:not(:disabled):hover {
  transform: translateY(-1px);
  filter: brightness(1.03);
}

.pdc-slider {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 1rem;
  min-width: 0;
}

.pdc-check {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  margin-bottom: 0.65rem;
  cursor: pointer;
  user-select: none;
}

.pdc-check__input {
  margin-top: 0.2rem;
  width: 1.05rem;
  height: 1.05rem;
  accent-color: #ad81be;
  flex-shrink: 0;
}

.pdc-check__input:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.pdc-check__label {
  font-size: 0.9rem;
  font-weight: 700;
  color: #5a4a68;
  line-height: 1.35;
}

.pdc-grid-dims {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.pdc-align-block {
  margin-bottom: 1rem;
}

.pdc-align-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  padding: 0.7rem 0.85rem;
  border-radius: 12px;
  border: 1px solid rgba(173, 129, 190, 0.35);
  background: rgba(213, 181, 234, 0.12);
}

.pdc-align-summary .pdc-live-status {
  margin: 0;
}

.pdc-slider__label {
  font-size: 0.88rem;
  font-weight: 650;
  color: #5a4a68;
}

.pdc-range {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  accent-color: #ad81be;
}

.pdc-range:disabled {
  opacity: 0.45;
}

.pdc-slider__hints {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  font-weight: 700;
  color: #8c98a4;
}

.pdc-live-status {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 650;
  color: #8c98a4;
}

.pdc-live-status--ok {
  color: #5a4a68;
}

.pdc-preview-row {
  margin-bottom: 1rem;
}

.pdc-figure {
  margin: 0;
  min-width: 0;
}

.pdc-figure figcaption {
  margin-top: 0.35rem;
  font-size: 0.78rem;
  font-weight: 650;
  color: #8c98a4;
}

.pdc-preview {
  display: block;
  max-width: 100%;
  max-height: 280px;
  width: auto;
  height: auto;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.3);
  object-fit: contain;
  background: #f8f4fc;
}

.pdc-preview--grid {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  max-height: 420px;
  width: min(100%, 420px);
}

.pdc-hint {
  margin: -0.35rem 0 0.75rem;
  font-size: 0.85rem;
  color: #6c757d;
}

.pdc-error {
  margin: 0.75rem 0 0;
  padding: 0.55rem 0.7rem;
  border-radius: 10px;
  background: rgba(220, 53, 69, 0.1);
  border: 1px solid rgba(220, 53, 69, 0.28);
  color: #b02a37;
  font-size: 0.85rem;
  font-weight: 650;
}

.pdc-chart-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  margin-bottom: 0.35rem;
}

.pdc-chart-head .pdc-step-title {
  margin: 0;
}

.pdc-mode-toggle {
  display: inline-flex;
  border-radius: 10px;
  border: 1px solid rgba(173, 129, 190, 0.4);
  overflow: hidden;
  background: rgba(213, 181, 234, 0.12);
}

.pdc-view-toggle {
  display: inline-flex;
  margin: 0.55rem 0 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(173, 129, 190, 0.4);
  overflow: hidden;
  background: rgba(213, 181, 234, 0.12);
}

.pdc-mode-btn {
  border: none;
  background: transparent;
  padding: 0.45rem 0.65rem;
  font-size: 0.75rem;
  font-weight: 750;
  color: #5a4a68;
  cursor: pointer;
  white-space: nowrap;
}

.pdc-mode-btn + .pdc-mode-btn {
  border-left: 1px solid rgba(173, 129, 190, 0.35);
}

.pdc-mode-btn.is-active {
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: #fff;
}

.pdc-chart-scroll {
  max-width: 100%;
  overflow: auto;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: #fff;
  -webkit-overflow-scrolling: touch;
}

.pdc-chart-canvas {
  display: block;
  max-width: none;
  cursor: zoom-in;
}

.pdc-lock-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  margin-bottom: 1rem;
  padding: 0.7rem 0.85rem;
  border-radius: 12px;
  border: 1px solid rgba(173, 129, 190, 0.35);
  background: rgba(213, 181, 234, 0.15);
}

.pdc-lock-banner .pdc-hint {
  margin: 0;
  flex: 1;
  min-width: 12rem;
}

.pdc-zoom-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.65rem;
}

.pdc-zoom-bar__label {
  font-size: 0.82rem;
  font-weight: 800;
  color: #5a4a68;
  margin-right: 0.25rem;
}

.pdc-zoom-bar__hint {
  font-size: 0.72rem;
  font-weight: 650;
  color: #8c98a4;
  margin-left: 0.25rem;
}

.pdc-legend {
  margin-top: 1.15rem;
}

.pdc-legend__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.35rem;
}

.pdc-legend__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: #5a4a68;
}

.pdc-floss-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.pdc-floss-field {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: #5a4a68;
}

.pdc-select {
  border-radius: 8px;
  border: 1px solid rgba(173, 129, 190, 0.45);
  background: rgba(255, 255, 255, 0.85);
  color: #3d2f4a;
  font-weight: 700;
  font-size: 0.8rem;
  padding: 0.3rem 0.45rem;
}

.pdc-hint--tight {
  margin-top: 0.15rem;
}

.pdc-legend-scroll {
  max-width: 100%;
  overflow-x: auto;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  -webkit-overflow-scrolling: touch;
}

.pdc-legend-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
  min-width: 34rem;
}

.pdc-legend-table th,
.pdc-legend-table td {
  padding: 0.45rem 0.55rem;
  text-align: left;
  border-bottom: 1px solid rgba(213, 181, 234, 0.28);
  vertical-align: middle;
}

.pdc-legend-table th {
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: #8c98a4;
  background: rgba(213, 181, 234, 0.12);
}

.pdc-legend-table .pdc-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.pdc-legend-table .pdc-skeins {
  font-weight: 800;
  color: #5a4a68;
}

.pdc-legend-name {
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #5a4a68;
  font-weight: 650;
}

.pdc-legend-table tfoot td {
  font-weight: 800;
  background: rgba(213, 181, 234, 0.1);
  border-bottom: none;
  color: #3d2f4a;
}

.pdc-swatch__color--inline {
  display: inline-block;
  vertical-align: middle;
}

.pdc-symbol-badge--sm {
  width: 1.55rem;
  height: 1.55rem;
  font-size: 0.82rem;
}

.pdc-results {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.pdc-details {
  padding-top: 0.85rem;
  padding-bottom: 0.85rem;
}

.pdc-details__summary {
  cursor: pointer;
  font-weight: 800;
  color: #5a4a68;
  font-size: 0.95rem;
  list-style: none;
}

.pdc-details__summary::-webkit-details-marker {
  display: none;
}

.pdc-details__summary::before {
  content: '▸ ';
}

.pdc-details[open] .pdc-details__summary::before {
  content: '▾ ';
}

.pdc-details__block {
  margin-top: 1rem;
}

.pdc-palette {
  list-style: none;
  margin: 1rem 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
  gap: 0.55rem;
}

.pdc-palette--dmc {
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr));
}

.pdc-swatch {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  padding: 0.35rem;
  border-radius: 10px;
  background: rgba(213, 181, 234, 0.12);
}

.pdc-swatch--dmc {
  align-items: flex-start;
}

.pdc-swatch__color {
  flex-shrink: 0;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.12);
}

.pdc-swatch__meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-size: 0.72rem;
  line-height: 1.25;
  gap: 0.1rem;
}

.pdc-swatch__meta strong {
  font-size: 0.8rem;
  color: #3d2f4a;
}

.pdc-swatch__name {
  color: #5a4a68;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pdc-swatch__meta small {
  color: #8c98a4;
}

.pdc-hint a {
  color: #ad81be;
  font-weight: 700;
}

.pdc-symbol-badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.85rem;
  height: 1.85rem;
  border-radius: 6px;
  border: 1px solid rgba(44, 62, 80, 0.25);
  background: #fff;
  color: #111;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 0.95rem;
  font-weight: 800;
  line-height: 1;
}

@media (prefers-color-scheme: dark) {
  .pdc-title {
    color: #f0e8f8;
  }
  .pdc-subtitle,
  .pdc-hint,
  .pdc-filename,
  .pdc-slider__hints,
  .pdc-figure figcaption,
  .pdc-live-status {
    color: #adb5bd;
  }
  .pdc-zoom-bar__label {
    color: #d5b5ea;
  }
  .pdc-zoom-bar__hint {
    color: #adb5bd;
  }
  .pdc-lock-banner {
    background: rgba(173, 129, 190, 0.15);
    border-color: rgba(213, 181, 234, 0.25);
  }
  .pdc-live-status--ok,
  .pdc-step-title,
  .pdc-slider__label,
  .pdc-check__label,
  .pdc-back,
  .pdc-details__summary,
  .pdc-legend__title,
  .pdc-floss-field,
  .pdc-legend-table .pdc-skeins {
    color: #d5b5ea;
  }
  .pdc-select {
    background: rgba(35, 30, 48, 0.9);
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.35);
  }
  .pdc-legend-table th {
    background: rgba(173, 129, 190, 0.15);
    color: #adb5bd;
  }
  .pdc-legend-table tfoot td {
    background: rgba(173, 129, 190, 0.12);
    color: #f0e8f8;
  }
  .pdc-legend-name {
    color: #d5b5ea;
  }
  .pdc-card {
    background: rgba(35, 30, 48, 0.75);
    border-color: rgba(213, 181, 234, 0.2);
  }
  .pdc-btn--secondary {
    background: rgba(173, 129, 190, 0.2);
    color: #e8dcf5;
  }
  .pdc-btn--danger {
    background: rgba(220, 53, 69, 0.2);
    color: #ff8a95;
  }
  .pdc-library__meta strong {
    color: #f0e8f8;
  }
  .pdc-text-input {
    background: rgba(35, 30, 48, 0.9);
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.35);
  }
  .pdc-preview {
    background: #2a2235;
  }
  .pdc-mode-toggle {
    background: rgba(173, 129, 190, 0.15);
  }
  .pdc-mode-btn {
    color: #e8dcf5;
  }
  .pdc-swatch__meta strong {
    color: #f0e8f8;
  }
  .pdc-swatch__name {
    color: #d5b5ea;
  }
  .pdc-symbol-badge {
    background: #1c1825;
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.35);
  }
  .pdc-chart-scroll {
    background: #fff;
  }
  .pdc-error {
    background: rgba(220, 53, 69, 0.18);
    color: #ff8a95;
  }
}
</style>
