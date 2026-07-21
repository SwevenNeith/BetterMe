<!-- eslint-disable vue/multi-word-component-names -->
<script setup>
import { nextTick, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '../lib/supabase.js'
import { APP_PAGE_IDS } from '../constants/appPages.js'
import {
  loadPageVisibility,
  getPageDisplayLabel,
  isPageVisible,
  PAGE_VISIBILITY_UPDATED_EVENT,
  mergePageVisibility,
} from '../services/pageVisibility.js'

const router = useRouter()
const route = useRoute()

const baseUrl = import.meta.env.BASE_URL || '/'

const userName = ref('')
const userId = ref(null)
const isOpen = ref(false)
const exercicesExpanded = ref(false)

onMounted(async () => {
  window.addEventListener(PAGE_VISIBILITY_UPDATED_EVENT, onPageVisibilityUpdated)
  window.addEventListener('pointerdown', onGlobalPointerDown, true)
  window.addEventListener('keydown', onGlobalKeyDown)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    userName.value = user.user_metadata?.nom ?? user.email
    userId.value = user.id
  }
})

const navLinksTop = [
  {
    name: 'Dashboard',
    path: '/dashboard',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-svg-icon"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg>`,
  },
  {
    name: 'Emploi du temps',
    path: '/timetable',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-svg-icon"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,
  },
]

const projetsLink = {
  name: 'Projets',
  path: '/projets',
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-svg-icon"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
}

const lectureLink = {
  name: 'Lecture',
  path: '/lecture',
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-svg-icon"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`,
}

const journalLink = {
  name: 'Journaling',
  path: '/journal',
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-svg-icon"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path><path d="M8 7h8"></path><path d="M8 11h8"></path><path d="M8 15h5"></path></svg>`,
}

const habitTrackerLink = {
  name: 'Habit Tracker',
  path: '/habit-tracker',
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-svg-icon"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
}

const todoLink = {
  name: 'TODO',
  path: '/todo',
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-svg-icon"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`,
}

const menstruationLink = {
  name: 'Menstruation',
  path: '/menstruation',
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-svg-icon"><path d="M12 22a7 7 0 0 0 7-7c0-5-7-13-7-13S5 10 5 15a7 7 0 0 0 7 7z"></path></svg>`,
}

const exercicesGroup = {
  name: 'Exercices',
  path: '/exercices',
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-svg-icon"><path d="M6.5 6a2.5 2.5 0 0 0 0 5H8"></path><path d="M17.5 13a2.5 2.5 0 0 0 0-5H16"></path><line x1="8" y1="8.5" x2="16" y2="15.5"></line><line x1="16" y1="8.5" x2="8" y2="15.5"></line></svg>`,
  children: [
    {
      name: 'Humeurs',
      path: '/mood',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-svg-icon"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>`,
    },
  ],
}

const settingsLink = {
  name: 'Réglages',
  path: '/settings',
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-svg-icon"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
}

const isActive = (path) => {
  if (path === '/projets') return route.path === path || route.path.startsWith('/projets/')
  if (path === '/lecture') return route.path === path || route.path.startsWith('/lecture/')
  if (path === '/journal') return route.path === path || route.path.startsWith('/journal/')
  return route.path === path
}

const SIDEBAR_ITEM_IDS = APP_PAGE_IDS

const pageVisibility = ref(mergePageVisibility(null))

async function loadNavPageVisibility() {
  if (!userId.value) {
    pageVisibility.value = mergePageVisibility(null)
    return
  }
  try {
    pageVisibility.value = await loadPageVisibility(supabase, userId.value)
  } catch (err) {
    console.error('page visibility:', err)
    pageVisibility.value = mergePageVisibility(null)
  }
}

function isPageVisibleInNav(id) {
  return isPageVisible(id, pageVisibility.value)
}

function getNavDisplayName(id) {
  const link = sidebarLinkForId(id)
  if (!link) return ''
  return getPageDisplayLabel(id, pageVisibility.value, link.name)
}

function getExercicesNavDisplayName() {
  return getPageDisplayLabel(
    SIDEBAR_ITEM_IDS.EXERCICES_GROUP,
    pageVisibility.value,
    exercicesGroup.name,
  )
}

// --- Sidebar tree persistence (Supabase positions) ---
const POSITIONS_TABLE = 'positions'
const SIDEBAR_SCOPE = 'Sidebar'
const EXERCICES_SCOPE = 'Sidebar:Exercices'

// Position par défaut : Habit Tracker avant Projets
const defaultSidebarOrder = [
  SIDEBAR_ITEM_IDS.DASHBOARD,
  SIDEBAR_ITEM_IDS.TIMETABLE,
  SIDEBAR_ITEM_IDS.TODO,
  SIDEBAR_ITEM_IDS.HABIT,
  SIDEBAR_ITEM_IDS.PROJETS,
  SIDEBAR_ITEM_IDS.LECTURE,
  SIDEBAR_ITEM_IDS.JOURNAL,
  SIDEBAR_ITEM_IDS.MENSTRUATION,
  SIDEBAR_ITEM_IDS.EXERCICES_GROUP,
]

const sidebarItemsById = {
  [SIDEBAR_ITEM_IDS.DASHBOARD]: navLinksTop[0],
  [SIDEBAR_ITEM_IDS.TIMETABLE]: navLinksTop[1],
  [SIDEBAR_ITEM_IDS.TODO]: todoLink,
  [SIDEBAR_ITEM_IDS.PROJETS]: projetsLink,
  [SIDEBAR_ITEM_IDS.LECTURE]: lectureLink,
  [SIDEBAR_ITEM_IDS.JOURNAL]: journalLink,
  [SIDEBAR_ITEM_IDS.HABIT]: habitTrackerLink,
  [SIDEBAR_ITEM_IDS.MENSTRUATION]: menstruationLink,
  [SIDEBAR_ITEM_IDS.EXERCICES_GROUP]: exercicesGroup,
}

const FOLDER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-svg-icon"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`

/** @type {import('vue').Ref<Array<{type:'link',id:string}|{type:'folder',id:string,name:string,children:Array<{type:'link',id:string}>}>>} */
const sidebarTree = ref(defaultSidebarOrder.map((id) => ({ type: 'link', id })))
const expandedFolderIds = ref([])
const draggingSidebar = ref(null) // { path: number[] }
const renamingFolderId = ref(null)
const renameDraft = ref('')
/** @type {import('vue').Ref<null | { folderId: string, name: string, x: number, y: number }>} */
const folderContextMenu = ref(null)

// --- Exercices tree (folders + reorder) ---
// Node formats:
// - link:   { type: 'link', id: 'mood' }
// - folder: { type: 'folder', id: 'folder-xxx', name: '...', children: Node[] }
const EXERCICES_ITEM_IDS = {
  MOOD: 'mood',
}

const exercicesItemsById = {
  [EXERCICES_ITEM_IDS.MOOD]: exercicesGroup.children[0],
}

const defaultExercicesTree = [{ type: 'link', id: EXERCICES_ITEM_IDS.MOOD }]
const exercicesTree = ref(JSON.parse(JSON.stringify(defaultExercicesTree)))
const draggingExercices = ref(null) // { path: number[] }

function deepClone(value) {
  return JSON.parse(JSON.stringify(value))
}

function isFolderNode(node) {
  return node && node.type === 'folder' && Array.isArray(node.children)
}

function isLinkNode(node) {
  return node && node.type === 'link' && typeof node.id === 'string'
}

function getListAtPath(tree, parentPath) {
  let list = tree
  for (const idx of parentPath) {
    const node = list[idx]
    if (!isFolderNode(node)) return null
    list = node.children
  }
  return list
}

function getNodeAtPath(tree, path) {
  if (!Array.isArray(path) || path.length === 0) return null
  const parent = getListAtPath(tree, path.slice(0, -1))
  if (!parent) return null
  return parent[path[path.length - 1]] ?? null
}

function removeNodeAtPath(tree, path) {
  const parent = getListAtPath(tree, path.slice(0, -1))
  if (!parent) return null
  const idx = path[path.length - 1]
  if (idx < 0 || idx >= parent.length) return null
  const [removed] = parent.splice(idx, 1)
  return removed ?? null
}

function insertNodeAtPath(tree, parentPath, index, node) {
  const parent = getListAtPath(tree, parentPath)
  if (!parent) return false
  const safeIndex = Math.max(0, Math.min(parent.length, index))
  parent.splice(safeIndex, 0, node)
  return true
}

function flattenLinkIds(nodes) {
  const out = []
  const visit = (list) => {
    for (const n of list) {
      if (isLinkNode(n)) out.push(n.id)
      else if (isFolderNode(n)) visit(n.children)
    }
  }
  visit(nodes)
  return out
}

function pathsEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

function isFolderExpanded(folderId) {
  return expandedFolderIds.value.includes(folderId)
}

function toggleFolderExpanded(folderId) {
  const next = new Set(expandedFolderIds.value)
  if (next.has(folderId)) next.delete(folderId)
  else next.add(folderId)
  expandedFolderIds.value = [...next]
}

function createFolderId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `folder-${crypto.randomUUID()}`
  }
  return `folder-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
}

/**
 * Accepte l’ancien format (string[]) et le nouveau (tree nodes).
 * Une page ne peut apparaître qu’une seule fois (hors dossiers imbriqués : 1 niveau max).
 */
function normalizeSidebarTree(raw) {
  const knownLinks = new Set(Object.keys(sidebarItemsById))
  const safe = Array.isArray(raw) ? deepClone(raw) : []
  const seen = new Set()
  const result = []

  // Ancien format : ["dashboard", "todo", ...]
  const looksLegacy = safe.length > 0 && safe.every((item) => typeof item === 'string')
  const source = looksLegacy
    ? safe.map((id) => ({ type: 'link', id }))
    : safe

  for (const node of source) {
    if (isLinkNode(node) && knownLinks.has(node.id) && !seen.has(node.id)) {
      seen.add(node.id)
      result.push({ type: 'link', id: node.id })
      continue
    }
    if (isFolderNode(node)) {
      const children = []
      for (const child of node.children) {
        if (isLinkNode(child) && knownLinks.has(child.id) && !seen.has(child.id)) {
          seen.add(child.id)
          children.push({ type: 'link', id: child.id })
        }
      }
      result.push({
        type: 'folder',
        id: typeof node.id === 'string' ? node.id : createFolderId(),
        name: typeof node.name === 'string' && node.name.trim() ? node.name.trim() : 'Nouveau dossier',
        children,
      })
    }
  }

  for (const id of defaultSidebarOrder) {
    if (!seen.has(id)) {
      seen.add(id)
      result.push({ type: 'link', id })
    }
  }

  return result
}

function normalizeExercicesTree(raw) {
  const knownLinks = new Set(Object.keys(exercicesItemsById))
  const safe = Array.isArray(raw) ? deepClone(raw) : []

  const seen = new Set()
  const normalizeList = (list) => {
    const result = []
    for (const node of list) {
      if (isLinkNode(node) && knownLinks.has(node.id) && !seen.has(node.id)) {
        seen.add(node.id)
        result.push({ type: 'link', id: node.id })
        continue
      }
      if (isFolderNode(node)) {
        const children = normalizeList(node.children)
        result.push({
          type: 'folder',
          id: typeof node.id === 'string' ? node.id : `folder-${Math.random().toString(16).slice(2)}`,
          name: typeof node.name === 'string' ? node.name : 'Dossier',
          children,
        })
      }
    }
    return result
  }

  const normalized = normalizeList(safe)

  // Append any new exercices pages at the end (root) and persist.
  for (const id of Object.keys(exercicesItemsById)) {
    if (!seen.has(id)) normalized.push({ type: 'link', id })
  }

  return normalized
}

async function fetchPosition(scope) {
  if (!userId.value) return { data: null, error: null }
  return supabase
    .from(POSITIONS_TABLE)
    .select('scope, order')
    .eq('user_id', userId.value)
    .eq('scope', scope)
    .maybeSingle()
}

async function upsertPosition(scope, orderValue) {
  if (!userId.value) return
  const { error } = await supabase
    .from(POSITIONS_TABLE)
    .upsert(
      {
        user_id: userId.value,
        scope,
        order: orderValue,
      },
      { onConflict: 'user_id,scope' },
    )
  if (error) console.error(error)
}

async function ensureExercicesPositionRow() {
  const { data, error } = await fetchPosition(EXERCICES_SCOPE)
  if (error) {
    console.error(error)
    return
  }
  const normalized = normalizeExercicesTree(data?.order)
  exercicesTree.value = normalized
  if (!data || JSON.stringify(normalized) !== JSON.stringify(data.order ?? [])) {
    await upsertPosition(EXERCICES_SCOPE, normalized)
  }
}

async function ensureSidebarPositionRow() {
  if (!userId.value) return

  const { data, error } = await fetchPosition(SIDEBAR_SCOPE)

  if (error) {
    console.error(error)
    return
  }

  const normalized = normalizeSidebarTree(data?.order)
  sidebarTree.value = normalized

  // Si la ligne n'existe pas ou si elle est incomplète (nouvelle page / nouveau format), on upsert.
  if (!data || JSON.stringify(normalized) !== JSON.stringify(data.order ?? [])) {
    await upsertPosition(SIDEBAR_SCOPE, normalized)
  }
}

async function persistSidebarTree() {
  if (!userId.value) return
  const normalized = normalizeSidebarTree(sidebarTree.value)
  sidebarTree.value = normalized
  await upsertPosition(SIDEBAR_SCOPE, normalized)
}

watch(
  userId,
  (id) => {
    if (!id) return
    void ensureSidebarPositionRow()
    void ensureExercicesPositionRow()
    void loadNavPageVisibility()
  },
  { immediate: true },
)

function onPageVisibilityUpdated() {
  void loadNavPageVisibility()
}

function onGlobalPointerDown(event) {
  if (!folderContextMenu.value) return
  const target = event.target
  if (target instanceof Element && target.closest('.sidebar-folder-context')) return
  closeFolderContextMenu()
}

function onGlobalKeyDown(event) {
  if (event.key === 'Escape') closeFolderContextMenu()
}

onUnmounted(() => {
  window.removeEventListener(PAGE_VISIBILITY_UPDATED_EVENT, onPageVisibilityUpdated)
  window.removeEventListener('pointerdown', onGlobalPointerDown, true)
  window.removeEventListener('keydown', onGlobalKeyDown)
})

function sidebarLinkForId(id) {
  return sidebarItemsById[id] ?? null
}

function encodePath(path) {
  return Array.isArray(path) ? path.join('.') : ''
}

function decodePath(value) {
  if (!value) return null
  const parts = String(value)
    .split('.')
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0)
  return parts.length ? parts : null
}

function onSidebarDragStart(path, event) {
  draggingSidebar.value = { path }
  try {
    event.dataTransfer?.setData('text/plain', encodePath(path))
    event.dataTransfer?.setDragImage?.(event.currentTarget, 16, 16)
    event.dataTransfer.effectAllowed = 'move'
  } catch {
    // noop
  }
}

function onSidebarFolderHeaderDragStart(path, event) {
  if (
    event.target?.closest?.(
      '.nav-sidebar-folder__rename, .nav-sidebar-folder__actions',
    )
  ) {
    event.preventDefault()
    return
  }
  closeFolderContextMenu()
  onSidebarDragStart(path, event)
}

function onSidebarDragOver(event) {
  if (!draggingSidebar.value) return
  event.preventDefault()
  try {
    event.dataTransfer.dropEffect = 'move'
  } catch {
    // noop
  }
}

function onSidebarDragEnd() {
  draggingSidebar.value = null
}

/**
 * Drop sur un nœud cible :
 * - dossier → ajoute la page dedans
 * - page / dossier → réordonne avant la cible (même niveau)
 */
async function onSidebarDropOnNode(targetPath, event) {
  event.preventDefault()
  event.stopPropagation()
  const sourcePath =
    draggingSidebar.value?.path ?? decodePath(event.dataTransfer?.getData('text/plain'))
  if (!sourcePath || pathsEqual(sourcePath, targetPath)) {
    draggingSidebar.value = null
    return
  }

  const tree = deepClone(sidebarTree.value)
  const sourceNode = getNodeAtPath(tree, sourcePath)
  const targetNode = getNodeAtPath(tree, targetPath)
  if (!sourceNode || !targetNode) {
    draggingSidebar.value = null
    return
  }

  // Page déposée sur un dossier → entre dans le dossier
  if (isFolderNode(targetNode) && isLinkNode(sourceNode)) {
    const folderId = targetNode.id
    removeNodeAtPath(tree, sourcePath)
    const folder = tree.find((n) => isFolderNode(n) && n.id === folderId)
    if (!folder) {
      tree.push(sourceNode)
    } else {
      folder.children.push(sourceNode)
      if (!isFolderExpanded(folderId)) {
        expandedFolderIds.value = [...expandedFolderIds.value, folderId]
      }
    }
    sidebarTree.value = tree
    draggingSidebar.value = null
    await persistSidebarTree()
    return
  }

  // Pas de dossier imbriqué
  if (isFolderNode(sourceNode) && targetPath.length > 1) {
    draggingSidebar.value = null
    return
  }

  const destParentPath = targetPath.slice(0, -1)
  let destIndex = targetPath[targetPath.length - 1]
  const sameParent =
    sourcePath.length === targetPath.length &&
    sourcePath.slice(0, -1).every((v, i) => v === targetPath[i])
  if (sameParent && sourcePath[sourcePath.length - 1] < destIndex) {
    destIndex -= 1
  }

  removeNodeAtPath(tree, sourcePath)
  insertNodeAtPath(tree, destParentPath, Math.max(0, destIndex), sourceNode)
  sidebarTree.value = tree
  draggingSidebar.value = null
  await persistSidebarTree()
}

async function onSidebarDropOnRoot(event) {
  event.preventDefault()
  const sourcePath =
    draggingSidebar.value?.path ?? decodePath(event.dataTransfer?.getData('text/plain'))
  if (!sourcePath) {
    draggingSidebar.value = null
    return
  }
  // Déjà à la racine : ne rien faire si drop « vide »
  if (sourcePath.length === 1) {
    draggingSidebar.value = null
    return
  }
  const tree = deepClone(sidebarTree.value)
  const sourceNode = removeNodeAtPath(tree, sourcePath)
  if (!sourceNode) {
    draggingSidebar.value = null
    return
  }
  tree.push(sourceNode)
  sidebarTree.value = tree
  draggingSidebar.value = null
  await persistSidebarTree()
}

async function createSidebarFolder() {
  const id = createFolderId()
  const name = 'Nouveau dossier'
  sidebarTree.value = [
    ...sidebarTree.value,
    { type: 'folder', id, name, children: [] },
  ]
  expandedFolderIds.value = [...expandedFolderIds.value, id]
  renamingFolderId.value = id
  renameDraft.value = name
  await persistSidebarTree()
  await nextTick()
  const input = document.querySelector('.nav-sidebar-folder__rename')
  if (input instanceof HTMLInputElement) {
    input.focus()
    input.select()
  }
}

function startRenameFolder(folderId, currentName) {
  closeFolderContextMenu()
  renamingFolderId.value = folderId
  renameDraft.value = currentName || 'Nouveau dossier'
  void nextTick(() => {
    const input = document.querySelector('.nav-sidebar-folder__rename')
    if (input instanceof HTMLInputElement) {
      input.focus()
      input.select()
    }
  })
}

async function commitRenameFolder() {
  const folderId = renamingFolderId.value
  if (!folderId) return
  const name = String(renameDraft.value || '').trim() || 'Nouveau dossier'
  const tree = deepClone(sidebarTree.value)
  const folder = tree.find((n) => isFolderNode(n) && n.id === folderId)
  if (folder) {
    folder.name = name
    sidebarTree.value = tree
    await persistSidebarTree()
  }
  renamingFolderId.value = null
  renameDraft.value = ''
}

function cancelRenameFolder() {
  renamingFolderId.value = null
  renameDraft.value = ''
}

function closeFolderContextMenu() {
  folderContextMenu.value = null
}

function openFolderContextMenu(event, folderId, name) {
  event.preventDefault()
  event.stopPropagation()
  folderContextMenu.value = {
    folderId,
    name: name || 'Nouveau dossier',
    x: event.clientX,
    y: event.clientY,
  }
}

/** Ouverture du menu via le bouton ⋮ (mobile / tactile). */
function openFolderActionsFromButton(event, folderId, name) {
  event.preventDefault()
  event.stopPropagation()
  const rect = event.currentTarget?.getBoundingClientRect?.()
  const x = rect ? Math.min(rect.left, window.innerWidth - 180) : event.clientX
  const y = rect ? rect.bottom + 6 : event.clientY
  folderContextMenu.value = {
    folderId,
    name: name || 'Nouveau dossier',
    x: Math.max(8, x),
    y: Math.max(8, y),
  }
}

function onFolderContextRename() {
  const menu = folderContextMenu.value
  if (!menu) return
  startRenameFolder(menu.folderId, menu.name)
}

async function onFolderContextDelete() {
  const menu = folderContextMenu.value
  if (!menu) return
  const folderId = menu.folderId
  closeFolderContextMenu()
  await deleteSidebarFolder(folderId)
}

async function deleteSidebarFolder(folderId) {
  const tree = deepClone(sidebarTree.value)
  const idx = tree.findIndex((n) => isFolderNode(n) && n.id === folderId)
  if (idx < 0) return
  const folder = tree[idx]
  const children = Array.isArray(folder.children) ? folder.children : []
  tree.splice(idx, 1, ...children)
  sidebarTree.value = tree
  expandedFolderIds.value = expandedFolderIds.value.filter((id) => id !== folderId)
  if (renamingFolderId.value === folderId) cancelRenameFolder()
  closeFolderContextMenu()
  await persistSidebarTree()
}

function isGroupId(id) {
  return id === SIDEBAR_ITEM_IDS.EXERCICES_GROUP
}

function getItemPath(id) {
  const item = sidebarLinkForId(id)
  return item?.path ?? null
}

function onItemClick(id) {
  const path = getItemPath(id)
  if (path) navigate(path)
}

function isInExercicesSection(path) {
  if (path === exercicesGroup.path) return true
  const ids = flattenLinkIds(exercicesTree.value)
  return ids.some((id) => exercicesLinkForId(id)?.path === path)
}

function exercicesLinkForId(id) {
  return exercicesItemsById[id] ?? null
}

function onExercicesDragStart(path, event) {
  draggingExercices.value = { path }
  try {
    event.dataTransfer?.setData('text/plain', encodePath(path))
    event.dataTransfer.effectAllowed = 'move'
  } catch {
    // noop
  }
}

function onExercicesDragOver(event) {
  if (!draggingExercices.value) return
  event.preventDefault()
  try {
    event.dataTransfer.dropEffect = 'move'
  } catch {
    // noop
  }
}

async function onExercicesDropOnNode(targetPath, event) {
  event.preventDefault()
  const sourcePath =
    draggingExercices.value?.path ?? decodePath(event.dataTransfer?.getData('text/plain'))
  if (!sourcePath) {
    draggingExercices.value = null
    return
  }

  const tree = deepClone(exercicesTree.value)
  const sourceNode = removeNodeAtPath(tree, sourcePath)
  if (!sourceNode) {
    draggingExercices.value = null
    return
  }

  const targetNode = getNodeAtPath(tree, targetPath)
  if (isFolderNode(targetNode)) {
    // Drop into folder (append)
    targetNode.children.push(sourceNode)
  } else {
    // Drop before target within same parent list
    const parentPath = targetPath.slice(0, -1)
    const idx = targetPath[targetPath.length - 1]
    insertNodeAtPath(tree, parentPath, idx, sourceNode)
  }

  exercicesTree.value = tree
  draggingExercices.value = null
  await upsertPosition(EXERCICES_SCOPE, tree)
}

async function onExercicesDropOnRoot(event) {
  event.preventDefault()
  const sourcePath =
    draggingExercices.value?.path ?? decodePath(event.dataTransfer?.getData('text/plain'))
  if (!sourcePath) {
    draggingExercices.value = null
    return
  }
  const tree = deepClone(exercicesTree.value)
  const sourceNode = removeNodeAtPath(tree, sourcePath)
  if (!sourceNode) {
    draggingExercices.value = null
    return
  }
  tree.push(sourceNode)
  exercicesTree.value = tree
  draggingExercices.value = null
  await upsertPosition(EXERCICES_SCOPE, tree)
}

function onExercicesDragEnd() {
  draggingExercices.value = null
}

watch(
  () => route.path,
  (path) => {
    exercicesExpanded.value = isInExercicesSection(path)
    // Ouvre le dossier contenant la page active (sans changer de page)
    for (const node of sidebarTree.value) {
      if (!isFolderNode(node)) continue
      const hasActive = node.children.some((child) => {
        if (!isLinkNode(child)) return false
        const itemPath = getItemPath(child.id)
        if (!itemPath) return false
        if (child.id === SIDEBAR_ITEM_IDS.EXERCICES_GROUP) {
          return isInExercicesSection(path)
        }
        return isActive(itemPath)
      })
      if (hasActive && !isFolderExpanded(node.id)) {
        expandedFolderIds.value = [...expandedFolderIds.value, node.id]
      }
    }
  },
  { immediate: true },
)

const toggleExercicesChevron = () => {
  exercicesExpanded.value = !exercicesExpanded.value
}

const goToExercices = () => {
  navigate(exercicesGroup.path)
}

const navigate = (path) => {
  router.push(path)
  isOpen.value = false
}

const handleLogout = async () => {
  await supabase.auth.signOut()
  router.push('/')
}

const toggleSidebar = () => {
  isOpen.value = !isOpen.value
}
</script>

<template>
  <!-- Hamburger button (mobile only) -->
  <button
    class="hamburger"
    @click="toggleSidebar"
    :class="{ 'is-open': isOpen }"
    aria-label="Ouvrir le menu"
  >
    <span></span>
    <span></span>
    <span></span>
  </button>

  <!-- Overlay (mobile) -->
  <div class="sidebar-overlay" :class="{ visible: isOpen }" @click="isOpen = false"></div>

  <!-- Sidebar -->
  <aside class="sidebar" :class="{ 'sidebar--open': isOpen }">
    <!-- Brand -->
    <div class="sidebar-brand">
      <div class="brand-logo-wrapper">
        <img :src="baseUrl + 'icon-512.png'" alt="BetterMe" class="brand-logo" />
      </div>
      <div class="brand-text">
        <span class="brand-name">BetterMe</span>
        <span class="brand-user">{{ userName }}</span>
      </div>
    </div>

    <div class="sidebar-divider"></div>

    <div class="sidebar-toolbar">
      <button
        type="button"
        class="sidebar-folder-create"
        title="Créer un dossier"
        aria-label="Créer un dossier"
        @click="createSidebarFolder"
      >
        <span class="nav-icon" v-html="FOLDER_ICON" aria-hidden="true"></span>
        <span class="sidebar-folder-create__plus" aria-hidden="true">+</span>
      </button>
    </div>

    <!-- Navigation -->
    <nav
      class="sidebar-nav"
      @dragover="onSidebarDragOver"
      @drop="onSidebarDropOnRoot"
      @dragend="onSidebarDragEnd"
    >
      <template v-for="(node, idx) in sidebarTree" :key="`${node.type}-${node.id}`">
        <!-- Dossier racine -->
        <div
          v-if="node.type === 'folder'"
          class="nav-sidebar-folder"
          :class="{
            'nav-sidebar-folder--open': isFolderExpanded(node.id),
            'nav-link--dragging':
              draggingSidebar &&
              draggingSidebar.path.length === 1 &&
              draggingSidebar.path[0] === idx,
          }"
          @dragover="onSidebarDragOver"
          @drop="onSidebarDropOnNode([idx], $event)"
        >
          <div
            class="nav-sidebar-folder__header"
            draggable="true"
            @dragstart="onSidebarFolderHeaderDragStart([idx], $event)"
            @dragend="onSidebarDragEnd"
            @contextmenu="openFolderContextMenu($event, node.id, node.name)"
          >
            <button
              type="button"
              class="nav-sidebar-folder__toggle"
              :aria-expanded="isFolderExpanded(node.id)"
              :aria-controls="`sidebar-folder-${node.id}`"
              @click="toggleFolderExpanded(node.id)"
            >
              <span class="nav-icon" v-html="FOLDER_ICON"></span>
              <input
                v-if="renamingFolderId === node.id"
                v-model="renameDraft"
                class="nav-sidebar-folder__rename"
                type="text"
                maxlength="40"
                aria-label="Nom du dossier"
                @click.stop
                @keydown.enter.prevent="commitRenameFolder"
                @keydown.escape.prevent="cancelRenameFolder"
                @blur="commitRenameFolder"
              />
              <span v-else class="nav-label">{{ node.name }}</span>
              <span
                class="nav-chevron"
                :class="{ 'nav-chevron--open': isFolderExpanded(node.id) }"
                aria-hidden="true"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </span>
            </button>
            <button
              type="button"
              class="nav-sidebar-folder__actions"
              title="Options du dossier"
              aria-label="Options du dossier"
              @click.stop="openFolderActionsFromButton($event, node.id, node.name)"
              @pointerdown.stop
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <circle cx="12" cy="5" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="12" cy="19" r="1.6" />
              </svg>
            </button>
          </div>

          <div
            :id="`sidebar-folder-${node.id}`"
            class="nav-group__children"
            :class="{ 'nav-group__children--open': isFolderExpanded(node.id) }"
          >
            <div class="nav-group__children-inner">
              <template
                v-for="(child, cIdx) in node.children"
                :key="`${child.type}-${child.id}`"
              >
                <div
                  v-if="isGroupId(child.id) && isPageVisibleInNav(child.id)"
                  class="nav-group nav-group--draggable"
                  :class="{
                    'nav-link--dragging':
                      draggingSidebar &&
                      pathsEqual(draggingSidebar.path, [idx, cIdx]),
                  }"
                  draggable="true"
                  @dragstart="onSidebarDragStart([idx, cIdx], $event)"
                  @dragover="onSidebarDragOver"
                  @drop="onSidebarDropOnNode([idx, cIdx], $event)"
                  @dragend="onSidebarDragEnd"
                >
                  <div
                    class="nav-group__header"
                    :class="{
                      'nav-group__header--active': isActive(exercicesGroup.path),
                      'nav-group__header--open': exercicesExpanded,
                    }"
                  >
                    <button
                      type="button"
                      class="nav-group__main"
                      :class="{ 'nav-group__main--active': isActive(exercicesGroup.path) }"
                      @click="goToExercices"
                    >
                      <span class="nav-icon" v-html="exercicesGroup.icon"></span>
                      <span class="nav-label">{{ getExercicesNavDisplayName() }}</span>
                      <span class="nav-indicator" v-if="isActive(exercicesGroup.path)"></span>
                    </button>
                    <button
                      type="button"
                      class="nav-chevron-btn"
                      :class="{ 'nav-chevron-btn--open': exercicesExpanded }"
                      :aria-expanded="exercicesExpanded"
                      aria-controls="exercices-submenu-nested"
                      aria-label="Ouvrir ou fermer le sous-menu Exercices"
                      @click.stop="toggleExercicesChevron"
                    >
                      <span class="nav-chevron" :class="{ 'nav-chevron--open': exercicesExpanded }">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </span>
                    </button>
                  </div>
                  <div
                    id="exercices-submenu-nested"
                    class="nav-group__children"
                    :class="{ 'nav-group__children--open': exercicesExpanded }"
                  >
                    <div
                      class="nav-group__children-inner"
                      @dragover="onExercicesDragOver"
                      @drop="onExercicesDropOnRoot"
                      @dragend="onExercicesDragEnd"
                    >
                      <template
                        v-for="(exNode, exIdx) in exercicesTree"
                        :key="`${exNode.type}-${exNode.id}-${exIdx}`"
                      >
                        <div
                          v-if="exNode.type === 'folder'"
                          class="nav-folder"
                          draggable="true"
                          @dragstart="onExercicesDragStart([exIdx], $event)"
                          @dragover="onExercicesDragOver"
                          @drop="onExercicesDropOnNode([exIdx], $event)"
                          @dragend="onExercicesDragEnd"
                        >
                          <div class="nav-folder__header">
                            <span class="nav-folder__name">{{ exNode.name }}</span>
                          </div>
                          <div class="nav-folder__children">
                            <button
                              v-for="(exChild, exCIdx) in exNode.children"
                              :key="`${exChild.type}-${exChild.id}-${exCIdx}`"
                              type="button"
                              class="nav-link nav-link--child"
                              :class="{
                                'nav-link--active': isActive(exercicesLinkForId(exChild.id)?.path),
                              }"
                              draggable="true"
                              @dragstart="onExercicesDragStart([exIdx, exCIdx], $event)"
                              @dragover="onExercicesDragOver"
                              @drop="onExercicesDropOnNode([exIdx, exCIdx], $event)"
                              @dragend="onExercicesDragEnd"
                              @click="navigate(exercicesLinkForId(exChild.id)?.path)"
                            >
                              <span
                                class="nav-icon"
                                v-html="exercicesLinkForId(exChild.id)?.icon"
                              ></span>
                              <span class="nav-label">{{
                                exercicesLinkForId(exChild.id)?.name
                              }}</span>
                              <span
                                class="nav-indicator"
                                v-if="isActive(exercicesLinkForId(exChild.id)?.path)"
                              ></span>
                            </button>
                          </div>
                        </div>
                        <button
                          v-else
                          type="button"
                          class="nav-link nav-link--child"
                          :class="{
                            'nav-link--active': isActive(exercicesLinkForId(exNode.id)?.path),
                          }"
                          draggable="true"
                          @dragstart="onExercicesDragStart([exIdx], $event)"
                          @dragover="onExercicesDragOver"
                          @drop="onExercicesDropOnNode([exIdx], $event)"
                          @dragend="onExercicesDragEnd"
                          @click="navigate(exercicesLinkForId(exNode.id)?.path)"
                        >
                          <span class="nav-icon" v-html="exercicesLinkForId(exNode.id)?.icon"></span>
                          <span class="nav-label">{{ exercicesLinkForId(exNode.id)?.name }}</span>
                          <span
                            class="nav-indicator"
                            v-if="isActive(exercicesLinkForId(exNode.id)?.path)"
                          ></span>
                        </button>
                      </template>
                    </div>
                  </div>
                </div>

                <button
                  v-else-if="isPageVisibleInNav(child.id)"
                  type="button"
                  class="nav-link nav-link--child nav-link--draggable"
                  :class="{
                    'nav-link--active': isActive(getItemPath(child.id)),
                    'nav-link--dragging':
                      draggingSidebar && pathsEqual(draggingSidebar.path, [idx, cIdx]),
                  }"
                  draggable="true"
                  @dragstart="onSidebarDragStart([idx, cIdx], $event)"
                  @dragover="onSidebarDragOver"
                  @drop="onSidebarDropOnNode([idx, cIdx], $event)"
                  @dragend="onSidebarDragEnd"
                  @click="onItemClick(child.id)"
                >
                  <span class="nav-icon" v-html="sidebarLinkForId(child.id)?.icon"></span>
                  <span class="nav-label">{{ getNavDisplayName(child.id) }}</span>
                  <span class="nav-indicator" v-if="isActive(getItemPath(child.id))"></span>
                </button>
              </template>
            </div>
          </div>
        </div>

        <!-- Groupe Exercices à la racine -->
        <div
          v-else-if="isGroupId(node.id) && isPageVisibleInNav(node.id)"
          class="nav-group nav-group--draggable"
          :class="{
            'nav-link--dragging':
              draggingSidebar && draggingSidebar.path.length === 1 && draggingSidebar.path[0] === idx,
          }"
          draggable="true"
          @dragstart="onSidebarDragStart([idx], $event)"
          @dragover="onSidebarDragOver"
          @drop="onSidebarDropOnNode([idx], $event)"
          @dragend="onSidebarDragEnd"
        >
          <div
            class="nav-group__header"
            :class="{
              'nav-group__header--active': isActive(exercicesGroup.path),
              'nav-group__header--open': exercicesExpanded,
            }"
          >
            <button
              type="button"
              class="nav-group__main"
              :class="{ 'nav-group__main--active': isActive(exercicesGroup.path) }"
              @click="goToExercices"
            >
              <span class="nav-icon" v-html="exercicesGroup.icon"></span>
              <span class="nav-label">{{ getExercicesNavDisplayName() }}</span>
              <span class="nav-indicator" v-if="isActive(exercicesGroup.path)"></span>
            </button>
            <button
              type="button"
              class="nav-chevron-btn"
              :class="{ 'nav-chevron-btn--open': exercicesExpanded }"
              :aria-expanded="exercicesExpanded"
              aria-controls="exercices-submenu"
              aria-label="Ouvrir ou fermer le sous-menu Exercices"
              @click.stop="toggleExercicesChevron"
            >
              <span class="nav-chevron" :class="{ 'nav-chevron--open': exercicesExpanded }">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </span>
            </button>
          </div>

          <div
            id="exercices-submenu"
            class="nav-group__children"
            :class="{ 'nav-group__children--open': exercicesExpanded }"
          >
            <div
              class="nav-group__children-inner"
              @dragover="onExercicesDragOver"
              @drop="onExercicesDropOnRoot"
              @dragend="onExercicesDragEnd"
            >
              <template
                v-for="(exNode, exIdx) in exercicesTree"
                :key="`${exNode.type}-${exNode.id}-${exIdx}`"
              >
                <div
                  v-if="exNode.type === 'folder'"
                  class="nav-folder"
                  draggable="true"
                  @dragstart="onExercicesDragStart([exIdx], $event)"
                  @dragover="onExercicesDragOver"
                  @drop="onExercicesDropOnNode([exIdx], $event)"
                  @dragend="onExercicesDragEnd"
                >
                  <div class="nav-folder__header">
                    <span class="nav-folder__name">{{ exNode.name }}</span>
                  </div>
                  <div class="nav-folder__children">
                    <button
                      v-for="(exChild, exCIdx) in exNode.children"
                      :key="`${exChild.type}-${exChild.id}-${exCIdx}`"
                      type="button"
                      class="nav-link nav-link--child"
                      :class="{
                        'nav-link--active': isActive(exercicesLinkForId(exChild.id)?.path),
                      }"
                      draggable="true"
                      @dragstart="onExercicesDragStart([exIdx, exCIdx], $event)"
                      @dragover="onExercicesDragOver"
                      @drop="onExercicesDropOnNode([exIdx, exCIdx], $event)"
                      @dragend="onExercicesDragEnd"
                      @click="navigate(exercicesLinkForId(exChild.id)?.path)"
                    >
                      <span class="nav-icon" v-html="exercicesLinkForId(exChild.id)?.icon"></span>
                      <span class="nav-label">{{ exercicesLinkForId(exChild.id)?.name }}</span>
                      <span
                        class="nav-indicator"
                        v-if="isActive(exercicesLinkForId(exChild.id)?.path)"
                      ></span>
                    </button>
                  </div>
                </div>

                <button
                  v-else
                  type="button"
                  class="nav-link nav-link--child"
                  :class="{ 'nav-link--active': isActive(exercicesLinkForId(exNode.id)?.path) }"
                  draggable="true"
                  @dragstart="onExercicesDragStart([exIdx], $event)"
                  @dragover="onExercicesDragOver"
                  @drop="onExercicesDropOnNode([exIdx], $event)"
                  @dragend="onExercicesDragEnd"
                  @click="navigate(exercicesLinkForId(exNode.id)?.path)"
                >
                  <span class="nav-icon" v-html="exercicesLinkForId(exNode.id)?.icon"></span>
                  <span class="nav-label">{{ exercicesLinkForId(exNode.id)?.name }}</span>
                  <span
                    class="nav-indicator"
                    v-if="isActive(exercicesLinkForId(exNode.id)?.path)"
                  ></span>
                </button>
              </template>
            </div>
          </div>
        </div>

        <!-- Page simple à la racine -->
        <button
          v-else-if="isPageVisibleInNav(node.id)"
          type="button"
          class="nav-link nav-link--draggable"
          :class="{
            'nav-link--active': isActive(getItemPath(node.id)),
            'nav-link--dragging':
              draggingSidebar && draggingSidebar.path.length === 1 && draggingSidebar.path[0] === idx,
          }"
          draggable="true"
          @dragstart="onSidebarDragStart([idx], $event)"
          @dragover="onSidebarDragOver"
          @drop="onSidebarDropOnNode([idx], $event)"
          @dragend="onSidebarDragEnd"
          @click="onItemClick(node.id)"
        >
          <span class="nav-icon" v-html="sidebarLinkForId(node.id)?.icon"></span>
          <span class="nav-label">{{ getNavDisplayName(node.id) }}</span>
          <span class="nav-indicator" v-if="isActive(getItemPath(node.id))"></span>
        </button>
      </template>
    </nav>

    <div
      v-if="folderContextMenu"
      class="sidebar-folder-context"
      role="menu"
      :style="{ top: `${folderContextMenu.y}px`, left: `${folderContextMenu.x}px` }"
      @contextmenu.prevent
    >
      <button type="button" class="sidebar-folder-context__item" role="menuitem" @click="onFolderContextRename">
        Renommer
      </button>
      <button
        type="button"
        class="sidebar-folder-context__item sidebar-folder-context__item--danger"
        role="menuitem"
        @click="onFolderContextDelete"
      >
        Supprimer
      </button>
    </div>

    <!-- Réglages + déconnexion (footer) -->
    <div class="sidebar-footer">
      <div class="sidebar-divider"></div>
      <button class="logout-btn" @click="handleLogout">
        <span class="nav-icon">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="sidebar-svg-icon"
            aria-hidden="true"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
        </span>
        <span>Déconnexion</span>
      </button>
      <button
        class="nav-link footer-nav-link"
        :class="{ 'nav-link--active': isActive(settingsLink.path) }"
        @click="navigate(settingsLink.path)"
      >
        <span class="nav-icon" v-html="settingsLink.icon"></span>
        <span class="nav-label">{{ settingsLink.name }}</span>
        <span class="nav-indicator" v-if="isActive(settingsLink.path)"></span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
/* ─── Sidebar ─── */
.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  width: 260px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-right: 1px solid rgba(213, 181, 234, 0.3);
  box-shadow: 4px 0 24px rgba(173, 129, 190, 0.1);
  display: flex;
  flex-direction: column;
  z-index: 100;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@media (prefers-color-scheme: dark) {
  .sidebar {
    background: rgba(25, 20, 35, 0.95);
    border-right: 1px solid rgba(213, 181, 234, 0.15);
  }
}

/* ─── Brand block ─── */
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 1.75rem 1.25rem 1.5rem;
}

.brand-logo-wrapper {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(213, 181, 234, 0.35), rgba(149, 209, 170, 0.2));
  border: 1px solid rgba(213, 181, 234, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}

.brand-logo {
  width: 36px;
  height: 36px;
  object-fit: contain;
}

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.brand-name {
  font-size: 1.1rem;
  font-weight: 800;
  color: #ad81be;
  letter-spacing: -0.3px;
  line-height: 1.1;
}

.brand-user {
  font-size: 0.82rem;
  color: #72a098;
  font-weight: 500;
}

/* ─── Divider ─── */
.sidebar-divider {
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(213, 181, 234, 0.4), transparent);
  margin: 0 1rem;
}

/* ─── Toolbar dossiers ─── */
.sidebar-toolbar {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0.35rem 0.75rem 0;
}

.sidebar-folder-create {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.55rem;
  height: 1.55rem;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #ad81be;
  cursor: pointer;
  transition:
    color 0.15s ease,
    transform 0.15s ease,
    opacity 0.15s ease;
  opacity: 0.78;
}

.sidebar-folder-create:hover {
  opacity: 1;
  color: #9568a8;
  transform: translateY(-1px);
}

.sidebar-folder-create :deep(.sidebar-svg-icon) {
  width: 15px;
  height: 15px;
}

.sidebar-folder-create__plus {
  position: absolute;
  right: -0.05rem;
  bottom: -0.05rem;
  font-size: 0.68rem;
  font-weight: 800;
  line-height: 1;
  color: #72a098;
}

.nav-sidebar-folder {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  border-radius: 12px;
  touch-action: manipulation;
}

.nav-sidebar-folder--open {
  background: rgba(213, 181, 234, 0.06);
}

.nav-sidebar-folder__header {
  display: flex;
  align-items: stretch;
  gap: 0.15rem;
}

.nav-sidebar-folder__toggle {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.5rem 0.75rem 1rem;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: #6c757d;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.nav-sidebar-folder__toggle:hover {
  background: rgba(213, 181, 234, 0.12);
  color: #ad81be;
}

.nav-sidebar-folder__rename {
  flex: 1;
  min-width: 0;
  padding: 0.2rem 0.4rem;
  border: 1px solid rgba(173, 129, 190, 0.45);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  color: #2c3e50;
  font-size: 0.9rem;
  font-weight: 600;
}

.nav-sidebar-folder__actions {
  display: none;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  align-self: center;
  width: 1.85rem;
  height: 1.85rem;
  margin-right: 0.2rem;
  padding: 0;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: #ad81be;
  cursor: pointer;
  opacity: 0.7;
  transition:
    opacity 0.15s ease,
    background 0.15s ease;
}

.nav-sidebar-folder__actions svg {
  width: 0.95rem;
  height: 0.95rem;
}

.nav-sidebar-folder__actions:hover,
.nav-sidebar-folder__actions:focus-visible {
  opacity: 1;
  background: rgba(213, 181, 234, 0.16);
}

@media (max-width: 768px) {
  .nav-sidebar-folder__actions {
    display: inline-flex;
  }
}

.sidebar-folder-context {
  position: fixed;
  z-index: 400;
  min-width: 10.25rem;
  padding: 0.35rem;
  border-radius: 14px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 8px 28px rgba(173, 129, 190, 0.18);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.sidebar-folder-context__item {
  display: block;
  width: 100%;
  padding: 0.6rem 0.85rem;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: #6c757d;
  font-size: 0.88rem;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    transform 0.15s ease;
}

.sidebar-folder-context__item:hover {
  background: rgba(213, 181, 234, 0.14);
  color: #ad81be;
  transform: translateX(2px);
}

.sidebar-folder-context__item--danger {
  color: #a86b8a;
}

.sidebar-folder-context__item--danger:hover {
  background: linear-gradient(135deg, rgba(213, 181, 234, 0.16), rgba(192, 57, 43, 0.08));
  color: #c0392b;
}

@media (prefers-color-scheme: dark) {
  .sidebar-folder-create {
    color: #d5b5ea;
  }

  .sidebar-folder-create:hover {
    color: #e6d0f3;
  }

  .nav-sidebar-folder__toggle {
    color: #adb5bd;
  }

  .nav-sidebar-folder__rename {
    background: rgba(25, 20, 35, 0.85);
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.3);
  }

  .nav-sidebar-folder__actions {
    color: #d5b5ea;
  }

  .nav-sidebar-folder__actions:hover,
  .nav-sidebar-folder__actions:focus-visible {
    background: rgba(213, 181, 234, 0.14);
  }

  .sidebar-folder-context {
    background: rgba(25, 20, 35, 0.94);
    border-color: rgba(213, 181, 234, 0.22);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  }

  .sidebar-folder-context__item {
    color: #adb5bd;
  }

  .sidebar-folder-context__item:hover {
    background: rgba(213, 181, 234, 0.12);
    color: #d5b5ea;
  }

  .sidebar-folder-context__item--danger {
    color: #d5a0b8;
  }

  .sidebar-folder-context__item--danger:hover {
    background: linear-gradient(135deg, rgba(213, 181, 234, 0.12), rgba(192, 57, 43, 0.14));
    color: #ffb4ae;
  }
}

/* ─── Nav ─── */
.sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1rem 0.75rem;
  overflow-y: auto;
}

.nav-link {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.75rem 1rem;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: #6c757d;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
}

.nav-link--draggable {
  touch-action: manipulation;
}

.nav-link--dragging {
  opacity: 0.6;
  transform: none;
}

@media (prefers-color-scheme: dark) {
  .nav-link {
    color: #adb5bd;
  }
}

.nav-link:hover {
  background: rgba(213, 181, 234, 0.12);
  color: #ad81be;
  transform: translateX(3px);
}

.nav-link--active {
  background: linear-gradient(135deg, rgba(213, 181, 234, 0.2), rgba(149, 209, 170, 0.1));
  color: #ad81be;
  font-weight: 700;
  border: 1px solid rgba(213, 181, 234, 0.3);
}

.nav-icon {
  font-size: 1.1rem;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sidebar-svg-icon,
:deep(.sidebar-svg-icon) {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  transition: stroke 0.2s ease;
}

.nav-label {
  flex: 1;
}

.nav-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: linear-gradient(135deg, #d5b5ea, #95d1aa);
  flex-shrink: 0;
}

/* ─── Menu dépliant Exercices ─── */
.nav-group {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.nav-group--draggable {
  touch-action: manipulation;
}

.nav-group__header {
  display: flex;
  align-items: stretch;
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  transition: background 0.2s ease;
}

.nav-group__header--open {
  background: rgba(213, 181, 234, 0.08);
}

.nav-group__header--active {
  background: linear-gradient(135deg, rgba(213, 181, 234, 0.2), rgba(149, 209, 170, 0.1));
  border: 1px solid rgba(213, 181, 234, 0.3);
}

.nav-group__main {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
  padding: 0.75rem 0.5rem 0.75rem 1rem;
  border: none;
  border-radius: 0;
  background: transparent;
  color: #6c757d;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: color 0.2s ease, transform 0.2s ease;
}

@media (prefers-color-scheme: dark) {
  .nav-group__main {
    color: #adb5bd;
  }
}

.nav-group__main:hover {
  color: #ad81be;
}

.nav-group__main--active,
.nav-group__header--active .nav-group__main {
  color: #ad81be;
  font-weight: 700;
}

.nav-group__main:hover {
  transform: translateX(3px);
}

.nav-chevron-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  padding: 0;
  border: none;
  border-left: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  color: #6c757d;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease;
}

@media (prefers-color-scheme: dark) {
  .nav-chevron-btn {
    color: #adb5bd;
  }
}

.nav-group__header--active .nav-chevron-btn {
  border-left-color: rgba(213, 181, 234, 0.25);
}

.nav-chevron-btn:hover {
  background: rgba(213, 181, 234, 0.15);
  color: #ad81be;
}

.nav-chevron-btn--open {
  color: #ad81be;
}

.nav-chevron {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  transition: transform 0.25s ease;
}

.nav-chevron svg {
  width: 1rem;
  height: 1rem;
  stroke: currentColor;
}

.nav-chevron--open {
  transform: rotate(180deg);
}

.nav-group__children {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.25s ease;
  overflow: hidden;
}

.nav-group__children--open {
  grid-template-rows: 1fr;
}

.nav-group__children-inner {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.nav-link--child {
  margin-left: 0.5rem;
  padding-left: 2.25rem;
  font-size: 0.9rem;
}

.nav-link--child:hover {
  transform: translateX(2px);
}

.nav-folder {
  margin-left: 0.5rem;
  border-radius: 12px;
  padding: 0.25rem 0;
}

.nav-folder__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.45rem 0.75rem 0.35rem 1.75rem;
  color: #6c757d;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  user-select: none;
}

@media (prefers-color-scheme: dark) {
  .nav-folder__header {
    color: #adb5bd;
  }
}

.nav-folder__children {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

/* ─── Footer ─── */
.sidebar-footer {
  padding: 0 0.75rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex-shrink: 0;
}

.footer-nav-link {
  margin-bottom: 0.25rem;
}

.logout-btn {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid rgba(213, 181, 234, 0.3);
  border-radius: 12px;
  background: transparent;
  color: #ad81be;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.logout-btn:hover {
  background: rgba(213, 181, 234, 0.15);
  transform: translateX(3px);
}

/* ─── Hamburger (mobile only) ─── */
.hamburger {
  display: none;
  position: fixed;
  top: 1rem;
  left: 1rem;
  z-index: 200;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  box-shadow: 0 4px 12px rgba(173, 129, 190, 0.15);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  cursor: pointer;
  transition: all 0.2s ease;
}

@media (prefers-color-scheme: dark) {
  .hamburger {
    background: rgba(25, 20, 35, 0.9);
  }
}

.hamburger span {
  display: block;
  width: 20px;
  height: 2px;
  background: #ad81be;
  border-radius: 2px;
  transition: all 0.3s ease;
  transform-origin: center;
}

.hamburger.is-open span:nth-child(1) {
  transform: translateY(7px) rotate(45deg);
}
.hamburger.is-open span:nth-child(2) {
  opacity: 0;
  transform: scaleX(0);
}
.hamburger.is-open span:nth-child(3) {
  transform: translateY(-7px) rotate(-45deg);
}

/* ─── Overlay (mobile) ─── */
.sidebar-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
  z-index: 99;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}

/* ─── Responsive ─── */
@media (max-width: 768px) {
  .sidebar {
    transform: translateX(-100%);
  }
  .sidebar--open {
    transform: translateX(0);
  }
  .hamburger {
    display: flex;
  }
  .hamburger.is-open {
    display: none;
  }
  .sidebar-overlay {
    display: block;
  }
  .sidebar-overlay.visible {
    opacity: 1;
    pointer-events: auto;
  }
}
</style>
