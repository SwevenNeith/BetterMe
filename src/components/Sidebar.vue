<!-- eslint-disable vue/multi-word-component-names -->
<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '../lib/supabase.js'

const router = useRouter()
const route = useRoute()

const baseUrl = import.meta.env.BASE_URL || '/'

const userName = ref('')
const userId = ref(null)
const isOpen = ref(false)
const exercicesExpanded = ref(false)

onMounted(async () => {
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

const habitTrackerLink = {
  name: 'Habit Tracker',
  path: '/habit-tracker',
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-svg-icon"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
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

const isActive = (path) => route.path === path

// --- Sidebar order persistence (Supabase) ---
const POSITIONS_TABLE = 'positions'
const SIDEBAR_SCOPE = 'Sidebar'
const EXERCICES_SCOPE = 'Sidebar:Exercices'

const SIDEBAR_ITEM_IDS = {
  DASHBOARD: 'dashboard',
  TIMETABLE: 'timetable',
  HABIT: 'habit-tracker',
  PROJETS: 'projets',
  MENSTRUATION: 'menstruation',
  EXERCICES_GROUP: 'exercices-group',
}

// Position par défaut demandée : Habit Tracker avant Projets
const defaultSidebarOrder = [
  SIDEBAR_ITEM_IDS.DASHBOARD,
  SIDEBAR_ITEM_IDS.TIMETABLE,
  SIDEBAR_ITEM_IDS.HABIT,
  SIDEBAR_ITEM_IDS.PROJETS,
  SIDEBAR_ITEM_IDS.MENSTRUATION,
  SIDEBAR_ITEM_IDS.EXERCICES_GROUP,
]

const sidebarItemsById = {
  [SIDEBAR_ITEM_IDS.DASHBOARD]: navLinksTop[0],
  [SIDEBAR_ITEM_IDS.TIMETABLE]: navLinksTop[1],
  [SIDEBAR_ITEM_IDS.PROJETS]: projetsLink,
  [SIDEBAR_ITEM_IDS.HABIT]: habitTrackerLink,
  [SIDEBAR_ITEM_IDS.MENSTRUATION]: menstruationLink,
  [SIDEBAR_ITEM_IDS.EXERCICES_GROUP]: exercicesGroup,
}

const sidebarOrder = ref([...defaultSidebarOrder])
const draggingId = ref(null)

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

function normalizeOrder(rawIds) {
  const known = new Set(Object.keys(sidebarItemsById))
  const clean = Array.isArray(rawIds) ? rawIds.filter((id) => known.has(id)) : []
  const deduped = []
  const seen = new Set()
  for (const id of clean) {
    if (seen.has(id)) continue
    seen.add(id)
    deduped.push(id)
  }
  for (const id of defaultSidebarOrder) {
    if (!seen.has(id)) deduped.push(id)
  }
  return deduped
}

async function ensureSidebarPositionRow() {
  if (!userId.value) return

  const { data, error } = await fetchPosition(SIDEBAR_SCOPE)

  if (error) {
    console.error(error)
    return
  }

  const normalized = normalizeOrder(data?.order)
  sidebarOrder.value = normalized

  // Si la ligne n'existe pas ou si elle est incomplète (nouvelle page ajoutée), on upsert.
  if (!data || JSON.stringify(normalized) !== JSON.stringify(data.order ?? [])) {
    await upsertPosition(SIDEBAR_SCOPE, normalized)
  }
}

async function persistSidebarOrder() {
  if (!userId.value) return
  const normalized = normalizeOrder(sidebarOrder.value)
  sidebarOrder.value = normalized

  await upsertPosition(SIDEBAR_SCOPE, normalized)
}

watch(
  userId,
  (id) => {
    if (!id) return
    void ensureSidebarPositionRow()
    void ensureExercicesPositionRow()
  },
  { immediate: true },
)

function sidebarLinkForId(id) {
  return sidebarItemsById[id] ?? null
}

function onDragStart(id, event) {
  draggingId.value = id
  try {
    event.dataTransfer?.setData('text/plain', id)
    event.dataTransfer?.setDragImage?.(event.currentTarget, 16, 16)
    event.dataTransfer.effectAllowed = 'move'
  } catch {
    // noop
  }
}

function onDragOver(id, event) {
  if (!draggingId.value || draggingId.value === id) return
  event.preventDefault()
  try {
    event.dataTransfer.dropEffect = 'move'
  } catch {
    // noop
  }
}

async function onDrop(id, event) {
  event.preventDefault()
  const source = draggingId.value || event.dataTransfer?.getData('text/plain')
  if (!source || source === id) {
    draggingId.value = null
    return
  }

  const current = [...sidebarOrder.value]
  const from = current.indexOf(source)
  const to = current.indexOf(id)
  if (from === -1 || to === -1) {
    draggingId.value = null
    return
  }
  current.splice(from, 1)
  current.splice(to, 0, source)
  sidebarOrder.value = current
  draggingId.value = null
  await persistSidebarOrder()
}

function onDragEnd() {
  draggingId.value = null
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

    <!-- Navigation -->
    <nav class="sidebar-nav">
      <template v-for="id in sidebarOrder" :key="id">
        <div
          v-if="isGroupId(id)"
          class="nav-group nav-group--draggable"
          :class="{ 'nav-link--dragging': draggingId === id }"
          draggable="true"
          @dragstart="onDragStart(id, $event)"
          @dragover="onDragOver(id, $event)"
          @drop="onDrop(id, $event)"
          @dragend="onDragEnd"
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
            <span class="nav-label">{{ exercicesGroup.name }}</span>
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
              <template v-for="(node, idx) in exercicesTree" :key="`${node.type}-${node.id}-${idx}`">
                <div
                  v-if="node.type === 'folder'"
                  class="nav-folder"
                  draggable="true"
                  @dragstart="onExercicesDragStart([idx], $event)"
                  @dragover="onExercicesDragOver"
                  @drop="onExercicesDropOnNode([idx], $event)"
                  @dragend="onExercicesDragEnd"
                >
                  <div class="nav-folder__header">
                    <span class="nav-folder__name">{{ node.name }}</span>
                  </div>
                  <div class="nav-folder__children">
                    <button
                      v-for="(child, cIdx) in node.children"
                      :key="`${child.type}-${child.id}-${cIdx}`"
                      type="button"
                      class="nav-link nav-link--child"
                      :class="{ 'nav-link--active': isActive(exercicesLinkForId(child.id)?.path) }"
                      draggable="true"
                      @dragstart="onExercicesDragStart([idx, cIdx], $event)"
                      @dragover="onExercicesDragOver"
                      @drop="onExercicesDropOnNode([idx, cIdx], $event)"
                      @dragend="onExercicesDragEnd"
                      @click="navigate(exercicesLinkForId(child.id)?.path)"
                    >
                      <span class="nav-icon" v-html="exercicesLinkForId(child.id)?.icon"></span>
                      <span class="nav-label">{{ exercicesLinkForId(child.id)?.name }}</span>
                      <span
                        class="nav-indicator"
                        v-if="isActive(exercicesLinkForId(child.id)?.path)"
                      ></span>
                    </button>
                  </div>
                </div>

                <button
                  v-else
                  type="button"
                  class="nav-link nav-link--child"
                  :class="{ 'nav-link--active': isActive(exercicesLinkForId(node.id)?.path) }"
                  draggable="true"
                  @dragstart="onExercicesDragStart([idx], $event)"
                  @dragover="onExercicesDragOver"
                  @drop="onExercicesDropOnNode([idx], $event)"
                  @dragend="onExercicesDragEnd"
                  @click="navigate(exercicesLinkForId(node.id)?.path)"
                >
                  <span class="nav-icon" v-html="exercicesLinkForId(node.id)?.icon"></span>
                  <span class="nav-label">{{ exercicesLinkForId(node.id)?.name }}</span>
                  <span class="nav-indicator" v-if="isActive(exercicesLinkForId(node.id)?.path)"></span>
                </button>
              </template>
            </div>
          </div>
      </div>

        <button
          v-else
          type="button"
          class="nav-link nav-link--draggable"
          :class="{
            'nav-link--active': isActive(getItemPath(id)),
            'nav-link--dragging': draggingId === id,
          }"
          draggable="true"
          @dragstart="onDragStart(id, $event)"
          @dragover="onDragOver(id, $event)"
          @drop="onDrop(id, $event)"
          @dragend="onDragEnd"
          @click="onItemClick(id)"
        >
          <span class="nav-icon" v-html="sidebarLinkForId(id)?.icon"></span>
          <span class="nav-label">{{ sidebarLinkForId(id)?.name }}</span>
          <span class="nav-indicator" v-if="isActive(getItemPath(id))"></span>
        </button>
      </template>
    </nav>

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
