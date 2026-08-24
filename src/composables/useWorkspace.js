import { computed, ref, watch } from 'vue'
import {
  WORKSPACE_AREA_KEYS,
  WORKSPACE_LAYOUTS,
  WORKSPACE_MAX_PANES,
  getWorkspaceLayout,
  getWorkspaceSplitters,
  layoutFitsPaneCount,
} from '../constants/workspacePages.js'

const STORAGE_KEY = 'betterme-workspace-v2'

/**
 * @typedef {{ id: string, pageId: string, path: string, label: string }} WorkspacePane
 */

function createPaneId() {
  try {
    return `pane-${crypto.randomUUID()}`
  } catch {
    return `pane-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
  }
}

function equalFr(count) {
  if (count <= 0) return []
  return Array.from({ length: count }, () => 1)
}

function normalizeFr(values, expected, fallback) {
  const next = Array.isArray(values) ? values.map((n) => Number(n)).filter((n) => n > 0) : []
  if (next.length === expected && expected > 0) return next
  if (Array.isArray(fallback) && fallback.length === expected) return [...fallback]
  return equalFr(expected)
}

function defaultLayoutIdForCount(count) {
  if (count <= 1) return 'single'
  if (count === 2) return 'split-50'
  if (count === 3) return 'triple-left'
  if (count === 4) return 'quad'
  if (count === 5) return 'five'
  return 'six'
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('betterme-workspace-v1')
    if (!raw) {
      return { panes: [], layoutId: 'split-50', colFr: [1, 1], rowFr: [1] }
    }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      return { panes: [], layoutId: 'split-50', colFr: [1, 1], rowFr: [1] }
    }
    const panes = Array.isArray(parsed.panes)
      ? parsed.panes
          .filter((p) => p && typeof p.id === 'string' && typeof p.path === 'string')
          .slice(0, WORKSPACE_MAX_PANES)
          .map((p) => ({
            id: p.id,
            pageId: String(p.pageId ?? ''),
            path: String(p.path),
            label: String(p.label ?? 'Page'),
          }))
      : []

    let layoutId = typeof parsed.layoutId === 'string' ? parsed.layoutId : defaultLayoutIdForCount(panes.length)
    let layout = getWorkspaceLayout(layoutId)
    if (!layoutFitsPaneCount(layout, panes.length)) {
      layoutId = defaultLayoutIdForCount(panes.length)
      layout = getWorkspaceLayout(layoutId)
    }

    return {
      panes,
      layoutId,
      colFr: normalizeFr(parsed.colFr, layout.cols, layout.defaultColFr),
      rowFr: normalizeFr(parsed.rowFr, layout.rows, layout.defaultRowFr),
    }
  } catch {
    return { panes: [], layoutId: 'split-50', colFr: [1, 1], rowFr: [1] }
  }
}

const initialState = loadState()
const panes = ref(initialState.panes)
const layoutId = ref(initialState.layoutId)
const colFr = ref(initialState.colFr)
const rowFr = ref(initialState.rowFr)

function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        panes: panes.value,
        layoutId: layoutId.value,
        colFr: colFr.value,
        rowFr: rowFr.value,
      }),
    )
  } catch {
    /* ignore */
  }
}

watch([panes, layoutId, colFr, rowFr], persist, { deep: true })

function applyLayoutTracks(layout, resetWeights) {
  if (!layout) {
    colFr.value = []
    rowFr.value = []
    return
  }
  if (resetWeights) {
    colFr.value = [...layout.defaultColFr]
    rowFr.value = [...layout.defaultRowFr]
    return
  }
  colFr.value = normalizeFr(colFr.value, layout.cols, layout.defaultColFr)
  rowFr.value = normalizeFr(rowFr.value, layout.rows, layout.defaultRowFr)
}

export function useWorkspace() {
  const layout = computed(() => getWorkspaceLayout(layoutId.value))
  const paneCount = computed(() => panes.value.length)
  const slotCount = computed(() => layout.value.slots)
  const emptySlotCount = computed(() => Math.max(0, slotCount.value - panes.value.length))
  const canAddPane = computed(
    () => panes.value.length < WORKSPACE_MAX_PANES && panes.value.length < slotCount.value,
  )
  const isEmpty = computed(() => panes.value.length === 0)

  const gridStyle = computed(() => {
    const current = layout.value
    if (!current) return {}
    const areas = current.areas.map((row) => `"${row.join(' ')}"`).join(' ')
    return {
      gridTemplateColumns: colFr.value.map((n) => `${n}fr`).join(' '),
      gridTemplateRows: rowFr.value.map((n) => `${n}fr`).join(' '),
      gridTemplateAreas: areas,
    }
  })

  const splitters = computed(() => getWorkspaceSplitters(layout.value, colFr.value, rowFr.value))

  const emptySlotAreas = computed(() =>
    WORKSPACE_AREA_KEYS.slice(panes.value.length, slotCount.value),
  )

  function areaForIndex(index) {
    return WORKSPACE_AREA_KEYS[index] ?? 'a'
  }

  /**
   * @param {{ pageId: string, path: string, label: string }} page
   */
  function addPane(page) {
    if (!canAddPane.value || !page?.path) return false
    panes.value = [
      ...panes.value,
      {
        id: createPaneId(),
        pageId: page.pageId,
        path: page.path,
        label: page.label || 'Page',
      },
    ]
    return true
  }

  function removePane(paneId) {
    panes.value = panes.value.filter((p) => p.id !== paneId)
    const current = layout.value
    if (current && !layoutFitsPaneCount(current, panes.value.length) && panes.value.length > 0) {
      setLayout(defaultLayoutIdForCount(panes.value.length), true)
    }
  }

  function swapPanes(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return
    const fromIdx = panes.value.findIndex((p) => p.id === fromId)
    const toIdx = panes.value.findIndex((p) => p.id === toId)
    if (fromIdx < 0 || toIdx < 0) return
    const next = [...panes.value]
    ;[next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]]
    panes.value = next
  }

  function updatePanePath(paneId, path) {
    const idx = panes.value.findIndex((p) => p.id === paneId)
    if (idx < 0) return
    const next = [...panes.value]
    next[idx] = { ...next[idx], path }
    panes.value = next
  }

  function setLayout(nextId, resetWeights = true) {
    const next = getWorkspaceLayout(nextId)
    if (!layoutFitsPaneCount(next, panes.value.length)) return false
    layoutId.value = next.id
    applyLayoutTracks(next, resetWeights)
    return true
  }

  /**
   * @param {'col'|'row'} axis
   * @param {number} index
   * @param {number} deltaRatio
   */
  function resizeTrack(axis, index, deltaRatio) {
    const list = axis === 'col' ? [...colFr.value] : [...rowFr.value]
    if (index < 0 || index >= list.length - 1) return
    const min = 0.28
    let a = list[index]
    let b = list[index + 1]
    const total = a + b
    a = Math.max(min, Math.min(total - min, a + deltaRatio * total))
    b = total - a
    list[index] = a
    list[index + 1] = b
    if (axis === 'col') colFr.value = list
    else rowFr.value = list
  }

  return {
    panes,
    layoutId,
    layout,
    layouts: WORKSPACE_LAYOUTS,
    colFr,
    rowFr,
    paneCount,
    slotCount,
    emptySlotCount,
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
    maxPanes: WORKSPACE_MAX_PANES,
  }
}
