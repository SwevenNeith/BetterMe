<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '../lib/supabase.js'
import { APP_PAGE_IDS } from '../constants/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import {
  createNote,
  deleteNote,
  ensureMarkdownTutorial,
  getNote,
  listNotes,
  updateNote,
} from '../services/notes.js'
import {
  createNoteFolder,
  deleteNoteFolder,
  listNoteFolders,
  updateNoteFolder,
} from '../services/noteFolders.js'
import { buildNotesTree, flattenFolderOptions } from '../utils/notesTree.js'
import { parseNoteWikiHref, renderMarkdownToSafeHtml } from '../utils/renderMarkdown.js'
import NotesTreeNode from '../components/NotesTreeNode.vue'
import AppConfirmDialog from '../components/AppConfirmDialog.vue'
import NotesExtensionsModal from '../components/NotesExtensionsModal.vue'
import NotesGraphView from '../components/NotesGraphView.vue'
import NotesTabsBar from '../components/NotesTabsBar.vue'
import {
  isNotesExtensionEnabled,
  loadNotesExtensionPrefs,
  mergeNotesExtensionPrefs,
  saveNotesExtensionPrefs,
} from '../services/notesExtensions.js'
import { createDefaultNotesExtensionPrefs } from '../constants/notesExtensions.js'

const GRAPH_TAB = { type: 'graph', id: 'graph' }

const { pageTitle } = usePageDisplayLabel(APP_PAGE_IDS.NOTES, undefined, { setDocumentTitle: true })

const route = useRoute()
const router = useRouter()

const userId = ref(null)
const isLoading = ref(true)
const errorMessage = ref('')
const folders = ref([])
const notes = ref([])
const expandedFolderIds = ref(new Set())
const selectedNoteId = ref(null)
const selectedNote = ref(null)
const draftTitle = ref('')
const draftContent = ref('')
const draftFolderId = ref(null)
const viewMode = ref('split') // edit | preview | split
const isSaving = ref(false)
const saveError = ref('')
const saveStatus = ref('')
const dirty = ref(false)
const treeQuery = ref('')
const sidebarCollapsed = ref(false)
const editorEl = ref(null)
const previewEl = ref(null)
const extensionsOpen = ref(false)
const extensionPrefs = ref(createDefaultNotesExtensionPrefs())
/** @type {import('vue').Ref<Array<{ type: 'note' | 'graph', id: string }>>} */
const openTabs = ref([])
/** @type {import('vue').Ref<Record<string, { title: string, content: string, folderId: string | null, dirty: boolean, viewMode: string, saveStatus: string, saveError: string }>>} */
const noteSessions = ref({})
let scrollSyncLock = false
let switchingTabs = false

const isGraphView = computed(() => {
  const name = route.name?.toString() ?? ''
  return name === 'notes-graph' || name === 'embed-notes-graph'
})

const activeTabKey = computed(() => {
  if (isGraphView.value) return 'graph'
  if (selectedNoteId.value) return `note:${selectedNoteId.value}`
  return ''
})

const tabItems = computed(() =>
  openTabs.value.map((tab) => {
    if (tab.type === 'graph') {
      return { ...tab, key: 'graph', label: 'Vue globale' }
    }
    const fromDraft =
      tab.id === selectedNoteId.value && !isGraphView.value
        ? String(draftTitle.value ?? '').trim()
        : ''
    const fromList = notes.value.find((note) => note.id === tab.id)?.title
    const fromSession = noteSessions.value[tab.id]?.title
    return {
      ...tab,
      key: `note:${tab.id}`,
      label: fromDraft || String(fromSession || fromList || 'Note').trim() || 'Note',
    }
  }),
)

const promptOpen = ref(false)
const promptKind = ref('note') // note | folder | rename-folder | rename-note
const promptParentId = ref(null)
const promptTargetId = ref(null)
const promptValue = ref('')
const promptError = ref('')

const confirmState = ref({
  open: false,
  title: 'Confirmation',
  message: '',
  confirmLabel: 'Confirmer',
  cancelLabel: 'Annuler',
  danger: false,
  resolve: null,
})

let saveTimer = null

/**
 * @param {{ title?: string, message: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean }} options
 * @returns {Promise<boolean>}
 */
function askConfirm(options) {
  return new Promise((resolve) => {
    confirmState.value = {
      open: true,
      title: options.title || 'Confirmation',
      message: options.message || '',
      confirmLabel: options.confirmLabel || 'Confirmer',
      cancelLabel: options.cancelLabel || 'Annuler',
      danger: Boolean(options.danger),
      resolve,
    }
  })
}

function resolveConfirm(ok) {
  const resolve = confirmState.value.resolve
  confirmState.value = {
    ...confirmState.value,
    open: false,
    resolve: null,
  }
  resolve?.(Boolean(ok))
}

function isExtEnabled(extensionId) {
  return isNotesExtensionEnabled(extensionPrefs.value, extensionId)
}

function updateExtensionPrefs(nextPrefs) {
  extensionPrefs.value = mergeNotesExtensionPrefs(nextPrefs)
  if (!userId.value) return
  void (async () => {
    try {
      extensionPrefs.value = await saveNotesExtensionPrefs(supabase, userId.value, nextPrefs)
    } catch (err) {
      console.error(err)
      errorMessage.value = err.message || 'Impossible d’enregistrer les extensions.'
    }
  })()
}

function tabsStorageKey(uid) {
  return `betterme-notes-open-tabs:${uid || 'anon'}`
}

function persistOpenTabs() {
  if (!userId.value) return
  try {
    localStorage.setItem(tabsStorageKey(userId.value), JSON.stringify(openTabs.value))
  } catch {
    // ignore
  }
}

function loadPersistedOpenTabs(uid) {
  try {
    const raw = localStorage.getItem(tabsStorageKey(uid))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (tab) =>
        tab &&
        (tab.type === 'graph' || tab.type === 'note') &&
        typeof tab.id === 'string' &&
        tab.id,
    )
  } catch {
    return []
  }
}

function ensureNoteTab(noteId) {
  if (!noteId) return
  if (openTabs.value.some((tab) => tab.type === 'note' && tab.id === noteId)) return
  openTabs.value = [...openTabs.value, { type: 'note', id: noteId }]
  persistOpenTabs()
}

function ensureGraphTab() {
  if (openTabs.value.some((tab) => tab.type === 'graph')) return
  openTabs.value = [...openTabs.value, { ...GRAPH_TAB }]
  persistOpenTabs()
}

function removeNoteTab(noteId) {
  openTabs.value = openTabs.value.filter((tab) => !(tab.type === 'note' && tab.id === noteId))
  persistOpenTabs()
}

function pruneOpenTabs(noteRows) {
  const ids = new Set((noteRows ?? []).map((note) => note.id))
  openTabs.value = openTabs.value.filter((tab) => tab.type === 'graph' || ids.has(tab.id))
  persistOpenTabs()
}

function stashCurrentNoteSession() {
  if (!selectedNoteId.value) return
  noteSessions.value = {
    ...noteSessions.value,
    [selectedNoteId.value]: {
      title: draftTitle.value,
      content: draftContent.value,
      folderId: draftFolderId.value,
      dirty: dirty.value,
      viewMode: viewMode.value,
      saveStatus: saveStatus.value,
      saveError: saveError.value,
    },
  }
}

function applyNoteToEditor(note) {
  const session = noteSessions.value[note.id]
  selectedNoteId.value = note.id
  selectedNote.value = note
  if (session) {
    draftTitle.value = session.title
    draftContent.value = session.content
    draftFolderId.value = session.folderId
    dirty.value = Boolean(session.dirty)
    viewMode.value = session.viewMode || 'split'
    saveStatus.value = session.saveStatus || ''
    saveError.value = session.saveError || ''
  } else {
    draftTitle.value = note.title
    draftContent.value = note.content_md
    draftFolderId.value = note.folder_id
    dirty.value = false
    saveStatus.value = ''
    saveError.value = ''
  }
}

async function activateTab(tab) {
  if (!tab) return
  if (tab.type === 'graph') {
    await openGraphView()
    return
  }
  await selectNote(tab.id)
}

async function closeTab(tab) {
  if (!tab) return
  const key = tab.type === 'graph' ? 'graph' : `note:${tab.id}`
  const wasActive = activeTabKey.value === key
  const index = openTabs.value.findIndex((item) =>
    tab.type === 'graph' ? item.type === 'graph' : item.type === 'note' && item.id === tab.id,
  )

  if (wasActive && tab.type === 'note' && dirty.value) {
    await flushSave()
  }
  if (wasActive && tab.type === 'note') {
    stashCurrentNoteSession()
  }

  openTabs.value = openTabs.value.filter((item) =>
    tab.type === 'graph' ? item.type !== 'graph' : !(item.type === 'note' && item.id === tab.id),
  )
  persistOpenTabs()

  if (tab.type === 'note') {
    const nextSessions = { ...noteSessions.value }
    delete nextSessions[tab.id]
    noteSessions.value = nextSessions
  }

  if (!wasActive) return

  const fallback =
    openTabs.value[Math.min(Math.max(index, 0), openTabs.value.length - 1)] ?? openTabs.value[0] ?? null

  if (fallback) {
    await activateTab(fallback)
    return
  }

  clearSelection()
  const name = route.name?.toString().startsWith('embed-') ? 'embed-notes' : 'notes'
  await router.replace({ name })
}

const tree = computed(() => buildNotesTree(folders.value, notes.value, null))

const filteredTree = computed(() => {
  if (!isExtEnabled('tree-search')) return tree.value
  const q = treeQuery.value.trim().toLowerCase()
  if (!q) return tree.value
  return filterTree(tree.value, q)
})

const showTreeSearch = computed(() => isExtEnabled('tree-search'))

const folderOptions = computed(() =>
  flattenFolderOptions(folders.value).map((opt) => ({
    id: opt.id ?? '',
    label: opt.label,
  })),
)

const draftFolderSelect = computed({
  get: () => draftFolderId.value ?? '',
  set: (value) => {
    draftFolderId.value = value === '' || value == null ? null : value
  },
})

const previewHtml = computed(() =>
  renderMarkdownToSafeHtml(draftContent.value, {
    notes: notes.value,
    enableWikiLinks: isExtEnabled('wikilinks'),
    breaks: isExtEnabled('line-breaks'),
  }),
)

const noteCountLabel = computed(() => {
  const n = notes.value.length
  const f = folders.value.length
  const parts = []
  if (f) parts.push(`${f} dossier${f > 1 ? 's' : ''}`)
  parts.push(`${n} note${n > 1 ? 's' : ''}`)
  return parts.join(' · ')
})

function filterTree(nodes, query) {
  const result = []
  for (const node of nodes) {
    if (node.type === 'folder') {
      const children = filterTree(node.children ?? [], query)
      if (node.name.toLowerCase().includes(query) || children.length) {
        result.push({ ...node, children })
      }
    } else if (node.title.toLowerCase().includes(query)) {
      result.push(node)
    }
  }
  return result
}

function isFolderExpanded(id) {
  return expandedFolderIds.value.has(id)
}

function toggleFolder(id) {
  const next = new Set(expandedFolderIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedFolderIds.value = next
}

function expandAncestorsOfNote(noteId) {
  const note = notes.value.find((n) => n.id === noteId)
  if (!note?.folder_id) return
  const next = new Set(expandedFolderIds.value)
  let folderId = note.folder_id
  while (folderId) {
    next.add(folderId)
    folderId = folders.value.find((f) => f.id === folderId)?.parent_id ?? null
  }
  expandedFolderIds.value = next
}

async function loadAll() {
  if (!userId.value) return
  isLoading.value = true
  errorMessage.value = ''
  try {
    await ensureMarkdownTutorial(supabase, userId.value)
    const [folderRows, noteRows] = await Promise.all([
      listNoteFolders(supabase, userId.value),
      listNotes(supabase, userId.value),
    ])
    folders.value = folderRows
    notes.value = noteRows

    if (!openTabs.value.length) {
      openTabs.value = loadPersistedOpenTabs(userId.value)
    }
    pruneOpenTabs(noteRows)
    const ids = new Set(noteRows.map((n) => n.id))

    if (isGraphView.value) {
      ensureGraphTab()
      const keepId =
        (selectedNoteId.value && noteRows.some((n) => n.id === selectedNoteId.value)
          ? selectedNoteId.value
          : null) ||
        noteRows.find((n) => n.system_key === 'markdown-tutorial')?.id ||
        noteRows[0]?.id ||
        null
      if (keepId) await selectNote(keepId, { syncRoute: false, openTab: false })
      else clearSelection()
    } else {
      const routeNoteId = typeof route.params.noteId === 'string' ? route.params.noteId : null
      if (routeNoteId && noteRows.some((n) => n.id === routeNoteId)) {
        await selectNote(routeNoteId, { syncRoute: false })
      } else if (selectedNoteId.value && noteRows.some((n) => n.id === selectedNoteId.value)) {
        await selectNote(selectedNoteId.value, { syncRoute: false })
      } else if (openTabs.value.some((tab) => tab.type === 'note' && ids.has(tab.id))) {
        const firstTab = openTabs.value.find((tab) => tab.type === 'note' && ids.has(tab.id))
        if (firstTab) await selectNote(firstTab.id)
      } else {
        const tutorial = noteRows.find((n) => n.system_key === 'markdown-tutorial')
        const first =
          tutorial ?? noteRows.slice().sort((a, b) => a.title.localeCompare(b.title, 'fr'))[0]
        if (first) await selectNote(first.id)
        else clearSelection()
      }
    }
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Impossible de charger les notes.'
    folders.value = []
    notes.value = []
  } finally {
    isLoading.value = false
  }
}

function clearSelection() {
  selectedNoteId.value = null
  selectedNote.value = null
  draftTitle.value = ''
  draftContent.value = ''
  draftFolderId.value = null
  dirty.value = false
  saveStatus.value = ''
  saveError.value = ''
}

async function selectNote(noteId, { syncRoute = true, openTab = true } = {}) {
  if (!noteId || !userId.value) return

  if (selectedNoteId.value && selectedNoteId.value !== noteId) {
    stashCurrentNoteSession()
    if (dirty.value) await flushSave()
  }

  try {
    const note = await getNote(supabase, userId.value, noteId)
    if (!note) return
    switchingTabs = true
    applyNoteToEditor(note)
    await nextTick()
    switchingTabs = false
    expandAncestorsOfNote(note.id)
    if (openTab) ensureNoteTab(note.id)
    if (syncRoute) {
      const name = route.name?.toString().startsWith('embed-') ? 'embed-notes-detail' : 'notes-detail'
      const onGraph = isGraphView.value
      if (onGraph || route.params.noteId !== note.id) {
        await router.push({ name, params: { noteId: note.id } })
      }
    }
  } catch (err) {
    switchingTabs = false
    console.error(err)
    saveError.value = err.message || 'Impossible d’ouvrir la note.'
  }
}

async function openGraphView() {
  if (selectedNoteId.value) {
    stashCurrentNoteSession()
    if (dirty.value) await flushSave()
  }
  ensureGraphTab()
  if (isGraphView.value) return
  const name = route.name?.toString().startsWith('embed-') ? 'embed-notes-graph' : 'notes-graph'
  await router.push({ name })
}

function markDirty() {
  dirty.value = true
  saveStatus.value = 'Modifications non enregistrées…'
  scheduleSave()
}

function scheduleSave() {
  if (!isExtEnabled('auto-save')) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void flushSave()
  }, 700)
}

async function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (!userId.value || !selectedNoteId.value || !dirty.value || isSaving.value) return

  const title = draftTitle.value.trim()
  if (!title) {
    saveError.value = 'Le titre ne peut pas être vide.'
    return
  }

  isSaving.value = true
  saveError.value = ''
  saveStatus.value = 'Enregistrement…'
  try {
    const updated = await updateNote(supabase, userId.value, selectedNoteId.value, {
      title,
      contentMd: draftContent.value,
      folderId: draftFolderId.value,
    })
    selectedNote.value = updated
    notes.value = notes.value.map((n) => (n.id === updated.id ? updated : n))
    dirty.value = false
    saveStatus.value = 'Enregistré'
    noteSessions.value = {
      ...noteSessions.value,
      [updated.id]: {
        title: draftTitle.value,
        content: draftContent.value,
        folderId: draftFolderId.value,
        dirty: false,
        viewMode: viewMode.value,
        saveStatus: 'Enregistré',
        saveError: '',
      },
    }
  } catch (err) {
    console.error(err)
    saveError.value = err.message || 'Échec de l’enregistrement.'
    saveStatus.value = ''
  } finally {
    isSaving.value = false
  }
}

function openPrompt(kind, { parentId = null, targetId = null, initial = '' } = {}) {
  promptKind.value = kind
  promptParentId.value = parentId
  promptTargetId.value = targetId
  promptValue.value = initial
  promptError.value = ''
  promptOpen.value = true
}

function closePrompt() {
  promptOpen.value = false
  promptValue.value = ''
  promptError.value = ''
}

const promptTitle = computed(() => {
  switch (promptKind.value) {
    case 'folder':
      return 'Nouveau dossier'
    case 'note':
      return 'Nouvelle note'
    case 'rename-folder':
      return 'Renommer le dossier'
    case 'rename-note':
      return 'Renommer la note'
    default:
      return 'Saisie'
  }
})

async function submitPrompt() {
  if (!userId.value) return
  const value = promptValue.value.trim()
  if (!value) {
    promptError.value = 'Ce champ est requis.'
    return
  }

  try {
    if (promptKind.value === 'folder') {
      const folder = await createNoteFolder(supabase, userId.value, {
        name: value,
        parentId: promptParentId.value,
      })
      folders.value = [...folders.value, folder]
      if (promptParentId.value) {
        const next = new Set(expandedFolderIds.value)
        next.add(promptParentId.value)
        expandedFolderIds.value = next
      }
    } else if (promptKind.value === 'note') {
      const note = await createNote(supabase, userId.value, {
        title: value,
        contentMd: '',
        folderId: promptParentId.value,
      })
      notes.value = [...notes.value, note]
      closePrompt()
      await selectNote(note.id)
      return
    } else if (promptKind.value === 'rename-folder' && promptTargetId.value) {
      const folder = await updateNoteFolder(supabase, userId.value, promptTargetId.value, {
        name: value,
      })
      folders.value = folders.value.map((f) => (f.id === folder.id ? folder : f))
    } else if (promptKind.value === 'rename-note' && promptTargetId.value) {
      const note = await updateNote(supabase, userId.value, promptTargetId.value, { title: value })
      notes.value = notes.value.map((n) => (n.id === note.id ? note : n))
      if (selectedNoteId.value === note.id) {
        draftTitle.value = note.title
        selectedNote.value = note
      }
    }
    closePrompt()
  } catch (err) {
    console.error(err)
    promptError.value = err.message || 'Action impossible.'
  }
}

async function onDeleteNote(noteId) {
  const note = notes.value.find((n) => n.id === noteId)
  if (!note || !userId.value) return
  const ok = await askConfirm({
    title: 'Supprimer la note',
    message: `Supprimer la note « ${note.title} » ?\nCette action est définitive.`,
    confirmLabel: 'Supprimer',
    danger: true,
  })
  if (!ok) return

  try {
    await flushSave()
    await deleteNote(supabase, userId.value, noteId, note)
    notes.value = notes.value.filter((n) => n.id !== noteId)
    const nextSessions = { ...noteSessions.value }
    delete nextSessions[noteId]
    noteSessions.value = nextSessions

    const wasSelected = selectedNoteId.value === noteId || activeTabKey.value === `note:${noteId}`
    const tabIndex = openTabs.value.findIndex((tab) => tab.type === 'note' && tab.id === noteId)
    removeNoteTab(noteId)

    if (wasSelected) {
      const fallback =
        openTabs.value[Math.min(Math.max(tabIndex, 0), openTabs.value.length - 1)] ??
        openTabs.value[0] ??
        null
      if (fallback) {
        await activateTab(fallback)
      } else {
        clearSelection()
        const name = route.name?.toString().startsWith('embed-') ? 'embed-notes' : 'notes'
        await router.replace({ name })
      }
    }
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Suppression impossible.'
  }
}

async function onDeleteFolder(folderId) {
  const folder = folders.value.find((f) => f.id === folderId)
  if (!folder || !userId.value) return
  const ok = await askConfirm({
    title: 'Supprimer le dossier',
    message: `Supprimer le dossier « ${folder.name} » et tout son contenu (sous-dossiers et notes) ?\nCette action est définitive.`,
    confirmLabel: 'Supprimer',
    danger: true,
  })
  if (!ok) return

  try {
    const selectedId = selectedNoteId.value
    const wasOnGraph = isGraphView.value
    await deleteNoteFolder(supabase, userId.value, folderId)
    const [folderRows, noteRows] = await Promise.all([
      listNoteFolders(supabase, userId.value),
      listNotes(supabase, userId.value),
    ])
    folders.value = folderRows
    notes.value = noteRows
    pruneOpenTabs(noteRows)

    const survivingSessions = { ...noteSessions.value }
    for (const id of Object.keys(survivingSessions)) {
      if (!noteRows.some((n) => n.id === id)) delete survivingSessions[id]
    }
    noteSessions.value = survivingSessions

    if (wasOnGraph) {
      ensureGraphTab()
      return
    }

    if (selectedId && !noteRows.some((n) => n.id === selectedId)) {
      const fallback = openTabs.value[0] ?? null
      if (fallback) {
        await activateTab(fallback)
      } else {
        clearSelection()
        const name = route.name?.toString().startsWith('embed-') ? 'embed-notes' : 'notes'
        await router.replace({ name })
      }
    }
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Suppression du dossier impossible.'
  }
}

async function onMoveNoteFolder() {
  markDirty()
  await flushSave()
}

function onPreviewClick(event) {
  const anchor = event.target?.closest?.('a')
  if (!anchor) return
  const parsed = parseNoteWikiHref(anchor.getAttribute('href'))
  if (!parsed) return
  event.preventDefault()
  if (parsed.kind === 'note') {
    if (!isExtEnabled('wikilinks')) return
    void selectNote(parsed.noteId)
    return
  }
  if (parsed.kind === 'missing') {
    if (!isExtEnabled('wikilinks') || !isExtEnabled('create-from-missing-link')) return
    void (async () => {
      const create = await askConfirm({
        title: 'Créer la note',
        message: `La note « ${parsed.title} » n’existe pas encore.\nVeux-tu la créer ?`,
        confirmLabel: 'Créer',
      })
      if (!create || !userId.value) return
      try {
        const note = await createNote(supabase, userId.value, {
          title: parsed.title,
          contentMd: '',
          folderId: draftFolderId.value,
        })
        notes.value = [...notes.value, note]
        await selectNote(note.id)
      } catch (err) {
        console.error(err)
        saveError.value = err.message || 'Impossible de créer la note liée.'
      }
    })()
  }
}

function syncSplitScroll(source, target) {
  if (!isExtEnabled('sync-scroll')) return
  if (viewMode.value !== 'split' || !source || !target || scrollSyncLock) return
  const sourceMax = source.scrollHeight - source.clientHeight
  const targetMax = target.scrollHeight - target.clientHeight
  if (sourceMax <= 0 || targetMax <= 0) {
    target.scrollTop = 0
    return
  }
  scrollSyncLock = true
  target.scrollTop = (source.scrollTop / sourceMax) * targetMax
  requestAnimationFrame(() => {
    scrollSyncLock = false
  })
}

function onEditorScroll() {
  syncSplitScroll(editorEl.value, previewEl.value)
}

function onPreviewScroll() {
  syncSplitScroll(previewEl.value, editorEl.value)
}

function onTreeCreateNote(folderId) {
  openPrompt('note', { parentId: folderId })
}

function onTreeCreateFolder(folderId) {
  openPrompt('folder', { parentId: folderId })
}

function onTreeRenameFolder(folder) {
  openPrompt('rename-folder', { targetId: folder.id, initial: folder.name })
}

function onTreeRenameNote(note) {
  openPrompt('rename-note', { targetId: note.id, initial: note.title })
}

onMounted(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) userId.value = user.id
})

onUnmounted(() => {
  if (saveTimer) clearTimeout(saveTimer)
  if (dirty.value) void flushSave()
})

watch(userId, (id) => {
  if (!id) return
  void (async () => {
    openTabs.value = loadPersistedOpenTabs(id)
    try {
      extensionPrefs.value = await loadNotesExtensionPrefs(supabase, id)
    } catch (err) {
      console.error(err)
      extensionPrefs.value = createDefaultNotesExtensionPrefs()
    }
    await loadAll()
  })()
})

watch(
  () => route.params.noteId,
  (noteId) => {
    if (typeof noteId === 'string' && noteId && noteId !== selectedNoteId.value) {
      void selectNote(noteId, { syncRoute: false })
    }
  },
)

watch(isGraphView, (active) => {
  if (active) ensureGraphTab()
})

watch(viewMode, async (mode) => {
  if (mode !== 'split') return
  await nextTick()
  syncSplitScroll(editorEl.value, previewEl.value)
})

watch(draftTitle, () => {
  if (switchingTabs) return
  if (selectedNote.value && draftTitle.value !== selectedNote.value.title) markDirty()
})

watch(draftContent, () => {
  if (switchingTabs) return
  if (selectedNote.value && draftContent.value !== selectedNote.value.content_md) markDirty()
})

watch(draftFolderId, (value) => {
  if (switchingTabs) return
  if (selectedNote.value && value !== selectedNote.value.folder_id) {
    void onMoveNoteFolder()
  }
})
</script>

<template>
  <div class="notes-page" :class="{ 'notes-page--sidebar-collapsed': sidebarCollapsed }">
    <aside v-show="!sidebarCollapsed" class="notes-page__sidebar">
      <header class="notes-page__sidebar-header">
        <div class="notes-page__sidebar-title-row">
          <h1 class="notes-page__title">{{ pageTitle }}</h1>
          <button
            type="button"
            class="notes-page__sidebar-toggle"
            title="Masquer la liste"
            aria-label="Masquer la liste des notes"
            @click="sidebarCollapsed = true"
          >
            «
          </button>
        </div>
        <p class="notes-page__meta">{{ noteCountLabel }}</p>
        <div class="notes-page__sidebar-actions">
          <button
            type="button"
            class="notes-page__icon-btn"
            title="Nouvelle note"
            aria-label="Nouvelle note"
            @click="openPrompt('note')"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="11" x2="12" y2="17" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
          </button>
          <button
            type="button"
            class="notes-page__icon-btn"
            title="Nouveau dossier"
            aria-label="Nouveau dossier"
            @click="openPrompt('folder')"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              <line x1="12" y1="11" x2="12" y2="17" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
          </button>
          <button
            type="button"
            class="notes-page__icon-btn"
            :class="{ 'notes-page__icon-btn--active': isGraphView }"
            title="Vue globale"
            aria-label="Ouvrir la vue globale des notes"
            @click="openGraphView"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="6" cy="6" r="2.5" />
              <circle cx="18" cy="6" r="2.5" />
              <circle cx="12" cy="18" r="2.5" />
              <line x1="8.2" y1="7.2" x2="10.2" y2="16" />
              <line x1="15.8" y1="7.2" x2="13.8" y2="16" />
              <line x1="8.5" y1="6" x2="15.5" y2="6" />
            </svg>
          </button>
        </div>
        <input
          v-if="showTreeSearch"
          v-model="treeQuery"
          type="search"
          class="notes-page__search"
          placeholder="Rechercher…"
          aria-label="Rechercher dans les notes"
        />
      </header>

      <div v-if="isLoading" class="notes-page__tree-status">Chargement…</div>
      <div v-else-if="errorMessage" class="notes-page__tree-status notes-page__tree-status--error">
        {{ errorMessage }}
      </div>
      <nav v-else class="notes-page__tree" aria-label="Arborescence des notes">
        <NotesTreeNode
          v-for="node in filteredTree"
          :key="`${node.type}-${node.id}`"
          :node="node"
          :depth="0"
          :selected-note-id="selectedNoteId"
          :is-folder-expanded="isFolderExpanded"
          @select-note="selectNote"
          @toggle-folder="toggleFolder"
          @create-note="onTreeCreateNote"
          @create-folder="onTreeCreateFolder"
          @rename-folder="onTreeRenameFolder"
          @rename-note="onTreeRenameNote"
          @delete-note="onDeleteNote"
          @delete-folder="onDeleteFolder"
        />
        <p v-if="!filteredTree.length" class="notes-page__tree-empty">Aucun élément.</p>
      </nav>

      <footer class="notes-page__sidebar-footer">
        <button
          type="button"
          class="notes-page__icon-btn"
          title="Extensions Disponibles"
          aria-label="Ouvrir les extensions disponibles"
          @click="extensionsOpen = true"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 22v-5" />
            <path d="M9 8V2" />
            <path d="M15 8V2" />
            <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z" />
          </svg>
        </button>
      </footer>
    </aside>

    <button
      v-if="sidebarCollapsed"
      type="button"
      class="notes-page__sidebar-rail"
      title="Afficher la liste"
      aria-label="Afficher la liste des notes"
      @click="sidebarCollapsed = false"
    >
      <span class="notes-page__sidebar-rail-label">Notes</span>
    </button>

    <section class="notes-page__main">
      <NotesTabsBar
        :tabs="tabItems"
        :active-key="activeTabKey"
        @select="activateTab"
        @close="closeTab"
      />

      <NotesGraphView
        v-if="isGraphView"
        :active="isGraphView"
        :notes="notes"
        :selected-note-id="selectedNoteId"
        @select-note="selectNote"
      />

      <template v-else-if="selectedNote">
        <header class="notes-page__editor-header">
          <input
            v-model="draftTitle"
            type="text"
            class="notes-page__title-input"
            maxlength="200"
            placeholder="Titre de la note"
            @blur="flushSave"
          />
          <div class="notes-page__editor-toolbar">
            <label class="notes-page__folder-label">
              Dossier
              <select v-model="draftFolderSelect" class="notes-page__folder-select">
                <option v-for="opt in folderOptions" :key="opt.id || 'root'" :value="opt.id">
                  {{ opt.label }}
                </option>
              </select>
            </label>
            <div class="notes-page__mode-switch" role="group" aria-label="Mode d’affichage">
              <button
                type="button"
                class="notes-page__mode"
                :class="{ 'notes-page__mode--active': viewMode === 'edit' }"
                @click="viewMode = 'edit'"
              >
                Édition
              </button>
              <button
                type="button"
                class="notes-page__mode"
                :class="{ 'notes-page__mode--active': viewMode === 'split' }"
                @click="viewMode = 'split'"
              >
                Split
              </button>
              <button
                type="button"
                class="notes-page__mode"
                :class="{ 'notes-page__mode--active': viewMode === 'preview' }"
                @click="viewMode = 'preview'"
              >
                Aperçu
              </button>
            </div>
            <button type="button" class="notes-page__btn" :disabled="isSaving || !dirty" @click="flushSave">
              Enregistrer
            </button>
            <button type="button" class="notes-page__btn notes-page__btn--danger" @click="onDeleteNote(selectedNote.id)">
              Supprimer
            </button>
          </div>
          <p v-if="saveError" class="notes-page__save-msg notes-page__save-msg--error">{{ saveError }}</p>
          <p v-else-if="saveStatus" class="notes-page__save-msg">{{ saveStatus }}</p>
        </header>

        <div
          class="notes-page__panes"
          :class="{
            'notes-page__panes--edit': viewMode === 'edit',
            'notes-page__panes--preview': viewMode === 'preview',
            'notes-page__panes--split': viewMode === 'split',
          }"
        >
          <textarea
            v-if="viewMode !== 'preview'"
            ref="editorEl"
            v-model="draftContent"
            class="notes-page__editor"
            spellcheck="true"
            placeholder="Écris en Markdown…"
            @scroll="onEditorScroll"
            @blur="flushSave"
          />
          <div
            v-if="viewMode !== 'edit'"
            ref="previewEl"
            class="notes-page__preview markdown-body"
            @scroll="onPreviewScroll"
            @click="onPreviewClick"
            v-html="previewHtml"
          />
        </div>
      </template>

      <div v-else class="notes-page__empty">
        <p>Sélectionne une note ou crée-en une nouvelle.</p>
        <button type="button" class="notes-page__btn notes-page__btn--primary" @click="openPrompt('note')">
          Créer une note
        </button>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="promptOpen" class="notes-prompt" role="dialog" aria-modal="true" :aria-label="promptTitle">
        <div class="notes-prompt__overlay" @click="closePrompt" />
        <form class="notes-prompt__card" @submit.prevent="submitPrompt">
          <h2 class="notes-prompt__title">{{ promptTitle }}</h2>
          <input
            v-model="promptValue"
            type="text"
            class="notes-prompt__input"
            maxlength="200"
            autofocus
            :placeholder="promptKind.includes('folder') ? 'Nom du dossier' : 'Titre de la note'"
          />
          <p v-if="promptError" class="notes-prompt__error">{{ promptError }}</p>
          <div class="notes-prompt__actions">
            <button type="button" class="notes-page__btn" @click="closePrompt">Annuler</button>
            <button type="submit" class="notes-page__btn notes-page__btn--primary">Valider</button>
          </div>
        </form>
      </div>
    </Teleport>

    <AppConfirmDialog
      :open="confirmState.open"
      :title="confirmState.title"
      :message="confirmState.message"
      :confirm-label="confirmState.confirmLabel"
      :cancel-label="confirmState.cancelLabel"
      :danger="confirmState.danger"
      @confirm="resolveConfirm(true)"
      @cancel="resolveConfirm(false)"
    />

    <NotesExtensionsModal
      :open="extensionsOpen"
      :prefs="extensionPrefs"
      @close="extensionsOpen = false"
      @update:prefs="updateExtensionPrefs"
    />
  </div>
</template>

<style scoped>
.notes-page {
  display: grid;
  grid-template-columns: minmax(180px, 220px) 1fr;
  gap: 0;
  height: calc(100vh - 2rem);
  min-height: 520px;
  background: #f4f0fa;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid #e6ddf2;
}

.notes-page--sidebar-collapsed {
  grid-template-columns: 36px 1fr;
}

.notes-page__sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #efe6f8;
  border-right: 1px solid #e0d4ee;
  min-width: 0;
}

.notes-page__sidebar-header {
  padding: 0.65rem 0.65rem 0.5rem;
  border-bottom: 1px solid #e0d4ee;
  flex-shrink: 0;
}

.notes-page__sidebar-title-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.notes-page__title {
  flex: 1;
  min-width: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: #3b2a4a;
  margin: 0;
  line-height: 1.2;
}

.notes-page__sidebar-toggle {
  flex-shrink: 0;
  width: 1.6rem;
  height: 1.6rem;
  border: 1px solid #d5c4e6;
  border-radius: 6px;
  background: #fff;
  color: #5a4a68;
  cursor: pointer;
  font: inherit;
  font-size: 0.85rem;
  line-height: 1;
}

.notes-page__sidebar-toggle:hover {
  background: #f7f1fb;
}

.notes-page__sidebar-rail {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-right: 1px solid #e0d4ee;
  background: #efe6f8;
  color: #5a4a68;
  cursor: pointer;
  padding: 0.4rem 0;
  min-height: 0;
}

.notes-page__sidebar-rail:hover {
  background: #e6daf3;
}

.notes-page__sidebar-rail-label {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.notes-page__meta {
  margin: 0.2rem 0 0.5rem;
  font-size: 0.72rem;
  color: #6d5a7e;
}

.notes-page__sidebar-actions {
  display: flex;
  gap: 0.35rem;
  margin-bottom: 0.45rem;
}

.notes-page__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-tertiary, #72a098);
  cursor: pointer;
}

.notes-page__icon-btn:hover {
  color: var(--color-success, #95d1aa);
  background: transparent;
}

.notes-page__icon-btn--active {
  color: var(--color-success, #95d1aa);
}

.notes-page__icon-btn svg {
  width: 1.15rem;
  height: 1.15rem;
}

.notes-page__search {
  width: 100%;
  border: 1px solid #d5c4e6;
  border-radius: 6px;
  padding: 0.3rem 0.45rem;
  background: #fff;
  color: #3b2a4a;
  font: inherit;
  font-size: 0.8rem;
}

.notes-page__tree {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0.35rem 0.3rem 0.75rem;
}

.notes-page__sidebar-footer {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  padding: 0.35rem 0.45rem 0.5rem;
  border-top: 1px solid #e0d4ee;
}

.notes-page__tree-status,
.notes-page__tree-empty {
  padding: 0.75rem;
  color: #6d5a7e;
  font-size: 0.8rem;
}

.notes-page__tree-status--error {
  color: #a33;
}

.notes-page__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #faf7fd;
}

.notes-page__editor-header {
  flex-shrink: 0;
  padding: 0.7rem 1rem 0.55rem;
  border-bottom: 1px solid #e6ddf2;
  background: #f3ebf9;
}

.notes-page__title-input {
  width: 100%;
  border: none;
  background: transparent;
  font-size: 1.25rem;
  font-weight: 700;
  color: #3b2a4a;
  margin-bottom: 0.45rem;
  outline: none;
}

.notes-page__editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.notes-page__folder-label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  color: #6d5a7e;
}

.notes-page__folder-select {
  border: 1px solid #d5c4e6;
  border-radius: 8px;
  padding: 0.3rem 0.45rem;
  background: #fff;
  font: inherit;
  color: #3b2a4a;
}

.notes-page__mode-switch {
  display: inline-flex;
  border: 1px solid var(--color-tertiary, #72a098);
  border-radius: 8px;
  overflow: hidden;
  background: #e8f6ee;
}

.notes-page__mode {
  border: none;
  background: transparent;
  padding: 0.35rem 0.65rem;
  font: inherit;
  font-size: 0.85rem;
  color: #3d5c50;
  cursor: pointer;
}

.notes-page__mode--active {
  background: var(--color-success, #95d1aa);
  color: #244438;
  font-weight: 600;
}

.notes-page__btn {
  border: 1px solid #d5c4e6;
  background: #fff;
  color: #3b2a4a;
  border-radius: 8px;
  padding: 0.3rem 0.55rem;
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}

.notes-page__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.notes-page__btn--primary {
  background: var(--color-primary, #d5b5ea);
  border-color: #c5a0dc;
  font-weight: 600;
}

.notes-page__btn--danger {
  color: #8a3030;
  border-color: #e0b4b4;
  background: #fff5f5;
}

.notes-page__save-msg {
  margin: 0.4rem 0 0;
  font-size: 0.8rem;
  color: #6d5a7e;
}

.notes-page__save-msg--error {
  color: #a33;
}

.notes-page__panes {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: grid;
}

.notes-page__panes--edit {
  grid-template-columns: 1fr;
}

.notes-page__panes--preview {
  grid-template-columns: 1fr;
}

.notes-page__panes--split {
  grid-template-columns: 1fr 1fr;
}

.notes-page__editor,
.notes-page__preview {
  min-width: 0;
  min-height: 0;
  height: 100%;
  max-height: 100%;
  overflow: auto;
}

.notes-page__editor {
  width: 100%;
  border: none;
  resize: none;
  padding: 1rem 1.1rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.92rem;
  line-height: 1.55;
  color: #2f243a;
  background: #fff;
  outline: none;
  border-right: 1px solid #e6ddf2;
}

.notes-page__preview {
  padding: 1rem 1.25rem 2rem;
  background: #faf7fd;
  color: #2f243a;
  -webkit-overflow-scrolling: touch;
}

.notes-page__empty {
  flex: 1;
  display: grid;
  place-content: center;
  gap: 0.75rem;
  text-align: center;
  color: #6d5a7e;
}

.notes-prompt__overlay {
  position: fixed;
  inset: 0;
  background: rgba(40, 25, 55, 0.35);
  z-index: 90;
}

.notes-prompt__card {
  position: fixed;
  z-index: 91;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(420px, calc(100vw - 2rem));
  background: #fff;
  border-radius: 14px;
  padding: 1.1rem 1.2rem;
  box-shadow: 0 16px 40px rgba(60, 30, 80, 0.18);
  display: grid;
  gap: 0.75rem;
}

.notes-prompt__title {
  margin: 0;
  font-size: 1.1rem;
  color: #3b2a4a;
}

.notes-prompt__input {
  width: 100%;
  border: 1px solid #d5c4e6;
  border-radius: 8px;
  padding: 0.55rem 0.7rem;
  font: inherit;
}

.notes-prompt__error {
  margin: 0;
  color: #a33;
  font-size: 0.85rem;
}

.notes-prompt__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

:deep(.markdown-body) {
  line-height: 1.65;
}

:deep(.markdown-body h1),
:deep(.markdown-body h2),
:deep(.markdown-body h3),
:deep(.markdown-body h4),
:deep(.markdown-body h5),
:deep(.markdown-body h6) {
  margin: 1.2em 0 0.45em;
  line-height: 1.25;
  color: #3b2a4a;
}

:deep(.markdown-body h1) {
  font-size: 1.7rem;
  border-bottom: 1px solid #e6ddf2;
  padding-bottom: 0.3rem;
}

:deep(.markdown-body h2) {
  font-size: 1.35rem;
}

:deep(.markdown-body p),
:deep(.markdown-body ul),
:deep(.markdown-body ol),
:deep(.markdown-body blockquote),
:deep(.markdown-body pre),
:deep(.markdown-body table) {
  margin: 0.7em 0;
}

:deep(.markdown-body ul),
:deep(.markdown-body ol) {
  padding-left: 1.4rem;
}

:deep(.markdown-body blockquote) {
  border-left: 3px solid var(--color-primary, #d5b5ea);
  padding: 0.2rem 0.85rem;
  color: #5a4a68;
  background: #f3ebf9;
}

:deep(.markdown-body code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.88em;
  background: #efe6f8;
  padding: 0.1em 0.35em;
  border-radius: 4px;
}

:deep(.markdown-body pre) {
  background: #2a2233;
  color: #f4eef8;
  padding: 0.85rem 1rem;
  border-radius: 10px;
  overflow: auto;
}

:deep(.markdown-body pre code) {
  background: transparent;
  padding: 0;
  color: inherit;
}

:deep(.markdown-body table) {
  border-collapse: collapse;
  width: 100%;
  display: block;
  overflow-x: auto;
}

:deep(.markdown-body th),
:deep(.markdown-body td) {
  border: 1px solid #dccfe9;
  padding: 0.4rem 0.65rem;
}

:deep(.markdown-body th) {
  background: #efe6f8;
}

:deep(.markdown-body a) {
  color: #6b4a8a;
}

:deep(.markdown-body a.note-wikilink) {
  color: #5a3d7a;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

:deep(.markdown-body a.note-wikilink--missing) {
  color: #a33;
  text-decoration-style: dashed;
}

:deep(.markdown-body img) {
  max-width: 100%;
  border-radius: 8px;
}

:deep(.markdown-body hr) {
  border: none;
  border-top: 1px solid #e0d4ee;
  margin: 1.4rem 0;
}

:deep(.markdown-body input[type='checkbox']) {
  margin-right: 0.4rem;
}

@media (max-width: 900px) {
  .notes-page {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
    height: calc(100vh - 2rem);
    min-height: 520px;
  }

  .notes-page--sidebar-collapsed {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }

  .notes-page__sidebar {
    max-height: 28vh;
    border-right: none;
    border-bottom: 1px solid #e0d4ee;
  }

  .notes-page__sidebar-rail {
    width: 100%;
    min-height: 2.2rem;
    border-right: none;
    border-bottom: 1px solid #e0d4ee;
  }

  .notes-page__sidebar-rail-label {
    writing-mode: horizontal-tb;
    transform: none;
  }

  .notes-page__panes--split {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr 1fr;
  }

  .notes-page__editor {
    border-right: none;
    border-bottom: 1px solid #e6ddf2;
  }
}
</style>
