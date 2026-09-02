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
import NotesTemplateSettingsModal from '../components/NotesTemplateSettingsModal.vue'
import NotesGraphView from '../components/NotesGraphView.vue'
import NotesTabsBar from '../components/NotesTabsBar.vue'
import {
  isNotesExtensionEnabled,
  mergeNotesExtensionPrefs,
} from '../services/notesExtensions.js'
import { createDefaultNotesExtensionPrefs } from '../constants/notesExtensions.js'
import { createDefaultNoteTemplatePrefs } from '../constants/noteTemplates.js'
import { resolveTemplateContent } from '../services/noteTemplateExtension.js'
import {
  loadVaultExtensionPrefs,
  loadVaultTemplatePrefs,
  saveVaultExtensionPrefs,
  saveVaultTemplatePrefs,
  ensureVaultSettings,
  removeVaultSettings,
} from '../services/noteVaultSettings.js'
import {
  createNoteVault,
  deleteNoteVault,
  listNoteVaults,
  updateNoteVault,
} from '../services/noteVaults.js'
import { vaultThemeStyle, normalizeVaultIcon } from '../constants/noteVaults.js'
import NotesVaultThemeModal from '../components/NotesVaultThemeModal.vue'
import DictionaryEntryModal from '../components/DictionaryEntryModal.vue'
import DictionaryLinkEntryModal from '../components/DictionaryLinkEntryModal.vue'
import { listDictionaryEntries } from '../services/dictionaryEntries.js'
import { listDictionaryAliases } from '../services/dictionaryAliases.js'
import {
  annotateHtmlWithDictionary,
  buildDictionaryLookup,
  formatDictionaryTooltip,
  lookupDictionarySelection,
} from '../utils/dictionaryLookup.js'

const GRAPH_TAB = { type: 'graph', id: 'graph' }

const { pageTitle } = usePageDisplayLabel(APP_PAGE_IDS.NOTES, undefined, { setDocumentTitle: true })

const route = useRoute()
const router = useRouter()

const userId = ref(null)
const isLoading = ref(true)
const errorMessage = ref('')
const folders = ref([])
const notes = ref([])
const vaults = ref([])
const activeVaultId = ref(null)
const vaultThemeModalOpen = ref(false)
const vaultThemeModalMode = ref('create')
const vaultThemeTarget = ref(null)
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
const isMobileNotes = ref(false)
const editorEl = ref(null)
const previewEl = ref(null)
const dictionaryEntries = ref([])
const dictionaryAliases = ref([])
const dictionaryEntryModalOpen = ref(false)
const dictionaryLinkModalOpen = ref(false)
const dictionaryModalWord = ref('')
const dictionaryEditEntry = ref(null)
/** @type {import('vue').Ref<{ x: number, y: number, word: string } | null>} */
const editorContextMenu = ref(null)
/** @type {import('vue').Ref<{ x: number, y: number, text: string } | null>} */
const dictionaryTooltip = ref(null)
const extensionsOpen = ref(false)
const templateSettingsOpen = ref(false)
const extensionPrefs = ref(createDefaultNotesExtensionPrefs())
const templatePrefs = ref(createDefaultNoteTemplatePrefs())
/** @type {import('vue').Ref<Array<{ type: 'note' | 'graph', id: string }>>} */
const openTabs = ref([])
/** @type {import('vue').Ref<Record<string, { title: string, content: string, folderId: string | null, dirty: boolean, viewMode: string, saveStatus: string, saveError: string }>>} */
const noteSessions = ref({})
let scrollSyncLock = false
let switchingTabs = false

const isGraphView = computed(() => {
  const name = route.name?.toString() ?? ''
  return (
    name === 'notes-graph' ||
    name === 'embed-notes-graph' ||
    name === 'notes-vault-graph' ||
    name === 'embed-notes-vault-graph'
  )
})

function isEmbedRoute() {
  return route.name?.toString().startsWith('embed-') ?? false
}

function routeName(base) {
  return isEmbedRoute() ? `embed-${base}` : base
}

const activeVault = computed(() =>
  activeVaultId.value ? vaults.value.find((vault) => vault.id === activeVaultId.value) ?? null : null,
)

const activeVaultStyle = computed(() => vaultThemeStyle(activeVault.value))

const contextFolders = computed(() =>
  folders.value.filter((folder) => (folder.vault_id ?? null) === (activeVaultId.value ?? null)),
)

const contextNotes = computed(() =>
  notes.value.filter((note) => (note.vault_id ?? null) === (activeVaultId.value ?? null)),
)

const vaultSummaries = computed(() =>
  vaults.value.map((vault) => {
    const vaultFolders = folders.value.filter((folder) => folder.vault_id === vault.id)
    const vaultNotes = notes.value.filter((note) => note.vault_id === vault.id)
    return {
      ...vault,
      folderCount: vaultFolders.length,
      noteCount: vaultNotes.length,
    }
  }),
)

const effectiveViewMode = computed(() => {
  if (isMobileNotes.value && viewMode.value === 'split') return 'edit'
  return viewMode.value
})

const defaultViewMode = computed(() => (isMobileNotes.value ? 'edit' : 'split'))

const MOBILE_NOTES_MQ = '(max-width: 900px)'
let mobileNotesMql = null

function syncMobileNotesLayout() {
  if (typeof window === 'undefined') return
  const mobile = window.matchMedia(MOBILE_NOTES_MQ).matches
  const becameMobile = mobile && !isMobileNotes.value
  isMobileNotes.value = mobile
  if (becameMobile) {
    sidebarCollapsed.value = true
  }
  if (mobile && viewMode.value === 'split') {
    viewMode.value = 'edit'
  }
}

function closeMobileDrawer() {
  if (isMobileNotes.value) sidebarCollapsed.value = true
}

const activeTabKey = computed(() => {
  if (isGraphView.value) return 'graph'
  if (selectedNoteId.value) return `note:${selectedNoteId.value}`
  return ''
})

const tabItems = computed(() =>
  openTabs.value.map((tab) => {
    if (tab.type === 'graph') {
      return {
        ...tab,
        key: 'graph',
        label: activeVault.value ? `Vue · ${activeVault.value.name}` : 'Vue globale',
      }
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
      extensionPrefs.value = await saveVaultExtensionPrefs(
        supabase,
        userId.value,
        activeVaultId.value,
        nextPrefs,
      )
    } catch (err) {
      console.error(err)
      errorMessage.value = err.message || 'Impossible d’enregistrer les extensions.'
    }
  })()
}

function onExtensionConfigure(extensionId) {
  if (extensionId === 'templates') {
    templateSettingsOpen.value = true
  }
}

async function onTemplateSettingsSave(nextPrefs) {
  if (!userId.value) return
  try {
    templatePrefs.value = await saveVaultTemplatePrefs(
      supabase,
      userId.value,
      activeVaultId.value,
      nextPrefs,
    )
    if (nextPrefs.folder) {
      const existing = folders.value.some((folder) => folder.id === nextPrefs.folder.id)
      folders.value = existing
        ? folders.value.map((folder) =>
            folder.id === nextPrefs.folder.id ? nextPrefs.folder : folder,
          )
        : [...folders.value, nextPrefs.folder]
      const nextExpanded = new Set(expandedFolderIds.value)
      nextExpanded.add(nextPrefs.folder.id)
      expandedFolderIds.value = nextExpanded
    }
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Impossible d’enregistrer les paramètres Templates.'
  }
}

function resolveInitialNoteContent({ title, folderId }) {
  if (!isExtEnabled('templates')) return ''
  return resolveTemplateContent(templatePrefs.value, contextNotes.value, { title, folderId })
}

async function createNoteFromContext({ title, folderId }) {
  const contentMd = resolveInitialNoteContent({ title, folderId })
  return createNote(supabase, userId.value, {
    title,
    contentMd,
    folderId,
    vaultId: activeVaultId.value,
  })
}

function tabsStorageKey(uid) {
  const vaultKey = activeVaultId.value ?? 'root'
  return `betterme-notes-open-tabs:${uid || 'anon'}:${vaultKey}`
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

function pruneOpenTabsForContext() {
  pruneOpenTabs(contextNotes.value)
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
    viewMode.value =
      session.viewMode === 'split' && isMobileNotes.value
        ? 'edit'
        : session.viewMode || defaultViewMode.value
    saveStatus.value = session.saveStatus || ''
    saveError.value = session.saveError || ''
  } else {
    draftTitle.value = note.title
    draftContent.value = note.content_md
    draftFolderId.value = note.folder_id
    dirty.value = false
    viewMode.value = defaultViewMode.value
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
  await navigateToNotesHome()
}

async function navigateToNotesHome() {
  if (activeVaultId.value) {
    await router.replace({
      name: routeName('notes-vault'),
      params: { vaultId: activeVaultId.value },
    })
    return
  }
  await router.replace({ name: routeName('notes') })
}

const tree = computed(() => buildNotesTree(contextFolders.value, contextNotes.value, null))

const filteredTree = computed(() => {
  if (!isExtEnabled('tree-search')) return tree.value
  const q = treeQuery.value.trim().toLowerCase()
  if (!q) return tree.value
  return filterTree(tree.value, q)
})

const showTreeSearch = computed(() => isExtEnabled('tree-search'))

const folderOptions = computed(() =>
  flattenFolderOptions(contextFolders.value).map((opt) => ({
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

const previewHtml = computed(() => {
  let html = renderMarkdownToSafeHtml(draftContent.value, {
    notes: contextNotes.value,
    enableWikiLinks: isExtEnabled('wikilinks'),
    breaks: isExtEnabled('line-breaks'),
  })
  if (isExtEnabled('dictionary-hints') && dictionaryLookup.value.size) {
    html = annotateHtmlWithDictionary(html, dictionaryLookup.value)
  }
  return html
})

const dictionaryLookup = computed(() =>
  buildDictionaryLookup(dictionaryEntries.value, dictionaryAliases.value),
)

const dictionaryEntriesById = computed(() => {
  const map = new Map()
  for (const entry of dictionaryEntries.value) {
    map.set(entry.id, entry)
  }
  return map
})

const editorContextSelectionHit = computed(() => {
  if (!editorContextMenu.value?.word) return null
  return lookupDictionarySelection(editorContextMenu.value.word, dictionaryLookup.value)
})

const noteCountLabel = computed(() => {
  const n = contextNotes.value.length
  const f = contextFolders.value.length
  const parts = []
  if (activeVault.value) parts.push(activeVault.value.name)
  if (f) parts.push(`${f} dossier${f > 1 ? 's' : ''}`)
  parts.push(`${n} note${n > 1 ? 's' : ''}`)
  return parts.join(' · ')
})

const graphNotes = computed(() => contextNotes.value)

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

async function loadVaultPrefs() {
  if (!userId.value) return
  try {
    extensionPrefs.value = await loadVaultExtensionPrefs(
      supabase,
      userId.value,
      activeVaultId.value,
    )
    templatePrefs.value = await loadVaultTemplatePrefs(
      supabase,
      userId.value,
      activeVaultId.value,
    )
  } catch (err) {
    console.error(err)
    extensionPrefs.value = createDefaultNotesExtensionPrefs()
    templatePrefs.value = createDefaultNoteTemplatePrefs()
  }
}

async function openVault(vaultId, { syncRoute = true } = {}) {
  if (!vaultId) {
    await leaveVault({ syncRoute })
    return
  }
  const vault = vaults.value.find((item) => item.id === vaultId)
  if (!vault) return

  if (selectedNoteId.value) {
    stashCurrentNoteSession()
    if (dirty.value) await flushSave()
  }

  activeVaultId.value = vaultId
  if (userId.value) {
    openTabs.value = loadPersistedOpenTabs(userId.value)
  }
  await loadVaultPrefs()
  pruneOpenTabsForContext()
  clearSelection()

  if (syncRoute) {
    await router.push({ name: routeName('notes-vault'), params: { vaultId } })
  }
  closeMobileDrawer()
}

async function leaveVault({ syncRoute = true } = {}) {
  if (selectedNoteId.value) {
    stashCurrentNoteSession()
    if (dirty.value) await flushSave()
  }

  activeVaultId.value = null
  if (userId.value) {
    openTabs.value = loadPersistedOpenTabs(userId.value)
  }
  await loadVaultPrefs()
  pruneOpenTabsForContext()
  clearSelection()

  if (syncRoute) {
    await router.push({ name: routeName('notes') })
  }
  closeMobileDrawer()
}

async function onCreateVault(payload) {
  if (!userId.value) return
  try {
    const vault = await createNoteVault(supabase, userId.value, payload)
    const merged = {
      ...vault,
      icon: normalizeVaultIcon(payload.icon ?? vault.icon),
    }
    await ensureVaultSettings(supabase, userId.value, merged.id)
    vaults.value = [...vaults.value, merged]
    await openVault(merged.id)
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Impossible de créer le coffre.'
  }
}

function openVaultThemeCreate() {
  vaultThemeModalMode.value = 'create'
  vaultThemeTarget.value = null
  vaultThemeModalOpen.value = true
}

function openVaultThemeEditor(vault) {
  if (!vault) return
  vaultThemeModalMode.value = 'edit'
  vaultThemeTarget.value = vault
  vaultThemeModalOpen.value = true
}

async function onSaveVaultTheme(payload) {
  if (!userId.value) return
  try {
    if (payload.vaultId) {
      const updated = await updateNoteVault(supabase, userId.value, payload.vaultId, payload)
      const merged = {
        ...updated,
        icon: normalizeVaultIcon(payload.icon ?? updated.icon),
      }
      vaults.value = vaults.value.map((item) => (item.id === merged.id ? merged : item))
    } else {
      await onCreateVault(payload)
    }
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Impossible d’enregistrer le thème du coffre.'
  }
}

async function onDeleteVault(vaultId) {
  const vault = vaults.value.find((item) => item.id === vaultId)
  if (!vault || !userId.value) return
  const ok = await askConfirm({
    title: 'Supprimer le coffre',
    message: `Supprimer le coffre « ${vault.name} » et tout son contenu ?\nCette action est définitive.`,
    confirmLabel: 'Supprimer',
    danger: true,
  })
  if (!ok) return

  try {
    if (activeVaultId.value === vaultId) {
      activeVaultId.value = null
      clearSelection()
    }
    await deleteNoteVault(supabase, userId.value, vaultId)
    await removeVaultSettings(supabase, userId.value, vaultId)
    vaults.value = vaults.value.filter((item) => item.id !== vaultId)
    const [folderRows, noteRows] = await Promise.all([
      listNoteFolders(supabase, userId.value),
      listNotes(supabase, userId.value),
    ])
    folders.value = folderRows
    notes.value = noteRows
    pruneOpenTabsForContext()
    if (!activeVaultId.value) {
      await router.push({ name: routeName('notes') })
    }
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Suppression du coffre impossible.'
  }
}

async function loadAll() {
  if (!userId.value) return
  isLoading.value = true
  errorMessage.value = ''
  try {
    await ensureMarkdownTutorial(supabase, userId.value)
    const [folderRows, noteRows, vaultRows] = await Promise.all([
      listNoteFolders(supabase, userId.value),
      listNotes(supabase, userId.value),
      listNoteVaults(supabase, userId.value),
    ])
    folders.value = folderRows
    notes.value = noteRows
    vaults.value = vaultRows

    const routeVaultId =
      typeof route.params.vaultId === 'string' && route.params.vaultId
        ? route.params.vaultId
        : null
    if (routeVaultId && vaultRows.some((vault) => vault.id === routeVaultId)) {
      activeVaultId.value = routeVaultId
    } else if (routeVaultId) {
      activeVaultId.value = null
    }

    if (!openTabs.value.length) {
      openTabs.value = loadPersistedOpenTabs(userId.value)
    }

    const scopedNotes = noteRows.filter(
      (note) => (note.vault_id ?? null) === (activeVaultId.value ?? null),
    )
    pruneOpenTabs(scopedNotes)
    const ids = new Set(scopedNotes.map((n) => n.id))

    if (isGraphView.value) {
      ensureGraphTab()
      const keepId =
        (selectedNoteId.value && scopedNotes.some((n) => n.id === selectedNoteId.value)
          ? selectedNoteId.value
          : null) ||
        scopedNotes.find((n) => n.system_key === 'markdown-tutorial')?.id ||
        scopedNotes[0]?.id ||
        null
      if (keepId) await selectNote(keepId, { syncRoute: false, openTab: false })
      else clearSelection()
    } else {
      const routeNoteId = typeof route.params.noteId === 'string' ? route.params.noteId : null
      if (routeNoteId && noteRows.some((n) => n.id === routeNoteId)) {
        const note = noteRows.find((n) => n.id === routeNoteId)
        if ((note?.vault_id ?? null) !== (activeVaultId.value ?? null)) {
          activeVaultId.value = note?.vault_id ?? null
          await loadVaultPrefs()
          openTabs.value = loadPersistedOpenTabs(userId.value)
        }
        await selectNote(routeNoteId, { syncRoute: false })
      } else if (selectedNoteId.value && scopedNotes.some((n) => n.id === selectedNoteId.value)) {
        await selectNote(selectedNoteId.value, { syncRoute: false })
      } else if (openTabs.value.some((tab) => tab.type === 'note' && ids.has(tab.id))) {
        const firstTab = openTabs.value.find((tab) => tab.type === 'note' && ids.has(tab.id))
        if (firstTab) await selectNote(firstTab.id)
      } else {
        const tutorial = scopedNotes.find((n) => n.system_key === 'markdown-tutorial')
        const first =
          tutorial ?? scopedNotes.slice().sort((a, b) => a.title.localeCompare(b.title, 'fr'))[0]
        if (first) await selectNote(first.id)
        else clearSelection()
      }
    }
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Impossible de charger les notes.'
    folders.value = []
    notes.value = []
    vaults.value = []
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

  const listed = notes.value.find((note) => note.id === noteId)
  if (listed && (listed.vault_id ?? null) !== (activeVaultId.value ?? null)) {
    activeVaultId.value = listed.vault_id ?? null
    if (userId.value) openTabs.value = loadPersistedOpenTabs(userId.value)
    await loadVaultPrefs()
    pruneOpenTabsForContext()
  }

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
      const onGraph = isGraphView.value
      if (activeVaultId.value) {
        const name = routeName('notes-vault-detail')
        if (onGraph || route.params.noteId !== note.id) {
          await router.push({
            name,
            params: { vaultId: activeVaultId.value, noteId: note.id },
          })
        }
      } else {
        const name = routeName('notes-detail')
        if (onGraph || route.params.noteId !== note.id) {
          await router.push({ name, params: { noteId: note.id } })
        }
      }
    }
    closeMobileDrawer()
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
  closeMobileDrawer()
  if (isGraphView.value) return
  if (activeVaultId.value) {
    await router.push({
      name: routeName('notes-vault-graph'),
      params: { vaultId: activeVaultId.value },
    })
    return
  }
  await router.push({ name: routeName('notes-graph') })
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
        vaultId: activeVaultId.value,
      })
      folders.value = [...folders.value, folder]
      if (promptParentId.value) {
        const next = new Set(expandedFolderIds.value)
        next.add(promptParentId.value)
        expandedFolderIds.value = next
      }
    } else if (promptKind.value === 'note') {
      const note = await createNoteFromContext({
        title: value,
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
        await navigateToNotesHome()
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
        await navigateToNotesHome()
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

async function loadDictionary() {
  if (!userId.value) return
  try {
    const [entries, aliases] = await Promise.all([
      listDictionaryEntries(supabase, userId.value),
      listDictionaryAliases(supabase, userId.value),
    ])
    dictionaryEntries.value = entries
    dictionaryAliases.value = aliases
  } catch (err) {
    console.error(err)
  }
}

function isValidDictionarySelection(value) {
  const trimmed = String(value ?? '').trim()
  return Boolean(trimmed) && trimmed.length <= 120
}

function openEditorContextMenu(event, word) {
  if (!isValidDictionarySelection(word)) return
  event.preventDefault()
  editorContextMenu.value = { x: event.clientX, y: event.clientY, word: word.trim() }
}

function onEditorContextMenu(event) {
  const el = editorEl.value
  if (!el) return
  const start = el.selectionStart ?? 0
  const end = el.selectionEnd ?? 0
  if (start === end) return
  openEditorContextMenu(event, el.value.slice(start, end))
}

function onPreviewContextMenu(event) {
  const selection = window.getSelection()
  const selected = selection?.toString().trim()
  if (!selected) return
  if (!previewEl.value?.contains(selection?.anchorNode ?? null)) return
  openEditorContextMenu(event, selected)
}

function closeEditorContextMenu() {
  editorContextMenu.value = null
}

function openDictionaryEntryModal(word) {
  dictionaryEditEntry.value = null
  dictionaryModalWord.value = word
  dictionaryEntryModalOpen.value = true
  closeEditorContextMenu()
}

function openDictionaryLinkModal(word) {
  dictionaryModalWord.value = word
  dictionaryLinkModalOpen.value = true
  closeEditorContextMenu()
}

function onDictionaryEntrySaved(entry) {
  const index = dictionaryEntries.value.findIndex((item) => item.id === entry.id)
  if (index >= 0) {
    dictionaryEntries.value = dictionaryEntries.value.map((item) =>
      item.id === entry.id ? entry : item,
    )
  } else {
    dictionaryEntries.value = [...dictionaryEntries.value, entry]
  }
}

function onDictionaryAliasLinked(alias) {
  dictionaryAliases.value = [...dictionaryAliases.value, alias]
}

function hideDictionaryTooltip() {
  dictionaryTooltip.value = null
}

function onPreviewMouseOver(event) {
  if (!isExtEnabled('dictionary-hints')) {
    hideDictionaryTooltip()
    return
  }
  const term = event.target?.closest?.('.notes-dict-term')
  if (!term || !previewEl.value?.contains(term)) {
    hideDictionaryTooltip()
    return
  }
  const entryId = term.getAttribute('data-dict-id')
  const entry = dictionaryEntriesById.value.get(entryId)
  if (!entry) {
    hideDictionaryTooltip()
    return
  }
  const alias = term.getAttribute('data-dict-alias')
  const hit = lookupDictionarySelection(alias || term.textContent, dictionaryLookup.value)
  if (!hit) {
    hideDictionaryTooltip()
    return
  }
  const rect = term.getBoundingClientRect()
  dictionaryTooltip.value = {
    x: rect.left + rect.width / 2,
    y: rect.top,
    text: formatDictionaryTooltip(hit),
  }
}

function onGlobalPointerDown(event) {
  if (!editorContextMenu.value) return
  const target = event.target
  if (target instanceof Element && target.closest('.notes-dict-context')) return
  closeEditorContextMenu()
}

function onGlobalKeyDown(event) {
  if (event.key === 'Escape') {
    closeEditorContextMenu()
    hideDictionaryTooltip()
  }
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
        const note = await createNoteFromContext({
          title: parsed.title,
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
  syncMobileNotesLayout()
  if (typeof window !== 'undefined') {
    mobileNotesMql = window.matchMedia(MOBILE_NOTES_MQ)
    mobileNotesMql.addEventListener('change', syncMobileNotesLayout)
    window.addEventListener('pointerdown', onGlobalPointerDown, true)
    window.addEventListener('keydown', onGlobalKeyDown)
  }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) userId.value = user.id
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('pointerdown', onGlobalPointerDown, true)
    window.removeEventListener('keydown', onGlobalKeyDown)
  }
  if (mobileNotesMql) {
    mobileNotesMql.removeEventListener('change', syncMobileNotesLayout)
    mobileNotesMql = null
  }
  if (saveTimer) clearTimeout(saveTimer)
  if (dirty.value) void flushSave()
})

watch(userId, (id) => {
  if (!id) return
  void (async () => {
    const routeVaultId =
      typeof route.params.vaultId === 'string' && route.params.vaultId
        ? route.params.vaultId
        : null
    activeVaultId.value = routeVaultId
    openTabs.value = loadPersistedOpenTabs(id)
    await loadVaultPrefs()
    await Promise.all([loadAll(), loadDictionary()])
  })()
})

watch(
  () => route.params.vaultId,
  async (vaultId) => {
    const nextVaultId = typeof vaultId === 'string' && vaultId ? vaultId : null
    if (nextVaultId === activeVaultId.value) return
    if (selectedNoteId.value) {
      stashCurrentNoteSession()
      if (dirty.value) await flushSave()
    }
    activeVaultId.value = nextVaultId
    if (!userId.value) return
    openTabs.value = loadPersistedOpenTabs(userId.value)
    await loadVaultPrefs()
    pruneOpenTabsForContext()
    clearSelection()
  },
)

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
  <div
    class="notes-page"
    :class="{
      'notes-page--sidebar-collapsed': sidebarCollapsed || isMobileNotes,
      'notes-page--mobile': isMobileNotes,
      'notes-page--drawer-open': isMobileNotes && !sidebarCollapsed,
      'notes-page--in-vault': Boolean(activeVault),
    }"
    :style="activeVault ? activeVaultStyle : undefined"
  >
    <div
      v-if="isMobileNotes && !sidebarCollapsed"
      class="notes-page__drawer-overlay"
      @click="sidebarCollapsed = true"
    />

    <aside
      v-show="isMobileNotes || !sidebarCollapsed"
      class="notes-page__sidebar"
      :aria-hidden="isMobileNotes && sidebarCollapsed ? 'true' : undefined"
    >
      <header class="notes-page__sidebar-header">
        <div v-if="activeVault" class="notes-page__vault-nav">
          <button type="button" class="notes-page__back-btn" @click="leaveVault()">
            ← Retour
          </button>
          <span class="notes-page__vault-badge" :style="activeVaultStyle">
            <span class="notes-page__vault-badge-icon" aria-hidden="true">
              {{ normalizeVaultIcon(activeVault.icon) }}
            </span>
            {{ activeVault.name }}
          </span>
        </div>
        <div class="notes-page__sidebar-title-row">
          <h1 class="notes-page__title">
            <span
              v-if="activeVault"
              class="notes-page__vault-title-icon"
              aria-hidden="true"
            >{{ normalizeVaultIcon(activeVault.icon) }}</span>
            {{ activeVault ? activeVault.name : pageTitle }}
          </h1>
          <div class="notes-page__sidebar-title-actions">
            <button
              v-if="activeVault"
              type="button"
              class="notes-page__vault-theme-btn"
              title="Personnaliser le thème"
              aria-label="Personnaliser le thème du coffre"
              @click="openVaultThemeEditor(activeVault)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 2a10 10 0 0 0-10 10c0 1.7 1.4 3 3 3h1.2c.9 0 1.6.7 1.6 1.6 0 .9.7 1.6 1.6 1.6H12a10 10 0 0 0 0-20z" />
                <circle cx="8" cy="11" r="1.1" fill="currentColor" stroke="none" />
                <circle cx="12" cy="8" r="1.1" fill="currentColor" stroke="none" />
                <circle cx="16" cy="11" r="1.1" fill="currentColor" stroke="none" />
                <circle cx="14.5" cy="15" r="1.1" fill="currentColor" stroke="none" />
              </svg>
            </button>
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
      <div v-else class="notes-page__tree-scroll">
        <section v-if="!activeVault" class="notes-page__vaults">
          <div class="notes-page__vaults-head">
            <h2 class="notes-page__vaults-title">Coffres</h2>
            <button
              type="button"
              class="notes-page__vaults-add"
              title="Nouveau coffre"
              @click="openVaultThemeCreate()"
            >
              +
            </button>
          </div>
          <p class="notes-page__vaults-hint">
            Ouvre un coffre pour y ranger dossiers et notes avec leurs propres extensions.
          </p>
          <div v-if="vaultSummaries.length" class="notes-page__vaults-grid">
            <button
              v-for="vault in vaultSummaries"
              :key="vault.id"
              type="button"
              class="notes-page__vault-card"
              :style="vaultThemeStyle(vault)"
              @click="openVault(vault.id)"
            >
              <div class="notes-page__vault-card-head">
                <span class="notes-page__vault-card-icon" aria-hidden="true">
                  {{ normalizeVaultIcon(vault.icon) }}
                </span>
                <span class="notes-page__vault-card-name">{{ vault.name }}</span>
              </div>
              <span class="notes-page__vault-card-meta">
                {{ vault.noteCount }} note{{ vault.noteCount > 1 ? 's' : '' }}
                · {{ vault.folderCount }} dossier{{ vault.folderCount > 1 ? 's' : '' }}
              </span>
              <span
                class="notes-page__vault-card-theme"
                role="button"
                tabindex="0"
                title="Personnaliser le thème"
                @click.stop="openVaultThemeEditor(vault)"
                @keydown.enter.stop.prevent="openVaultThemeEditor(vault)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 2a10 10 0 0 0-10 10c0 1.7 1.4 3 3 3h1.2c.9 0 1.6.7 1.6 1.6 0 .9.7 1.6 1.6 1.6H12a10 10 0 0 0 0-20z" />
                  <circle cx="8" cy="11" r="1.1" fill="currentColor" stroke="none" />
                  <circle cx="12" cy="8" r="1.1" fill="currentColor" stroke="none" />
                  <circle cx="16" cy="11" r="1.1" fill="currentColor" stroke="none" />
                  <circle cx="14.5" cy="15" r="1.1" fill="currentColor" stroke="none" />
                </svg>
              </span>
              <span
                class="notes-page__vault-card-delete"
                role="button"
                tabindex="0"
                title="Supprimer le coffre"
                @click.stop="onDeleteVault(vault.id)"
                @keydown.enter.stop.prevent="onDeleteVault(vault.id)"
              >
                ×
              </span>
            </button>
          </div>
          <p v-else class="notes-page__vaults-empty">Aucun coffre pour l’instant.</p>
        </section>

        <section v-if="!activeVault" class="notes-page__section-label">Hors coffre</section>

        <nav class="notes-page__tree" aria-label="Arborescence des notes">
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
          <p v-if="!filteredTree.length" class="notes-page__tree-empty">
            {{ activeVault ? 'Ce coffre est vide.' : 'Aucun élément hors coffre.' }}
          </p>
        </nav>
      </div>

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
        :notes="graphNotes"
        :selected-note-id="selectedNoteId"
        :theme-style="activeVault ? activeVaultStyle : null"
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
                :class="{ 'notes-page__mode--active': effectiveViewMode === 'edit' }"
                @click="viewMode = 'edit'"
              >
                Édition
              </button>
              <button
                v-if="!isMobileNotes"
                type="button"
                class="notes-page__mode"
                :class="{ 'notes-page__mode--active': effectiveViewMode === 'split' }"
                @click="viewMode = 'split'"
              >
                Split
              </button>
              <button
                type="button"
                class="notes-page__mode"
                :class="{ 'notes-page__mode--active': effectiveViewMode === 'preview' }"
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
            'notes-page__panes--edit': effectiveViewMode === 'edit',
            'notes-page__panes--preview': effectiveViewMode === 'preview',
            'notes-page__panes--split': effectiveViewMode === 'split',
          }"
        >
          <textarea
            v-if="effectiveViewMode !== 'preview'"
            ref="editorEl"
            v-model="draftContent"
            class="notes-page__editor"
            spellcheck="true"
            placeholder="Écris en Markdown…"
            @scroll="onEditorScroll"
            @blur="flushSave"
            @contextmenu="onEditorContextMenu"
          />
          <div
            v-if="effectiveViewMode !== 'edit'"
            ref="previewEl"
            class="notes-page__preview markdown-body"
            @scroll="onPreviewScroll"
            @click="onPreviewClick"
            @contextmenu="onPreviewContextMenu"
            @mouseover="onPreviewMouseOver"
            @mouseleave="hideDictionaryTooltip"
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
      @configure="onExtensionConfigure"
    />

    <NotesTemplateSettingsModal
      :open="templateSettingsOpen"
      :prefs="templatePrefs"
      :folders="contextFolders"
      :notes="contextNotes"
      :user-id="userId || ''"
      :vault-id="activeVaultId"
      @close="templateSettingsOpen = false"
      @save="onTemplateSettingsSave"
    />

    <NotesVaultThemeModal
      :open="vaultThemeModalOpen"
      :mode="vaultThemeModalMode"
      :vault="vaultThemeTarget"
      @close="vaultThemeModalOpen = false"
      @save="onSaveVaultTheme"
    />

    <DictionaryEntryModal
      :open="dictionaryEntryModalOpen"
      :user-id="userId || ''"
      :initial-word="dictionaryModalWord"
      :entry="dictionaryEditEntry"
      @close="dictionaryEntryModalOpen = false"
      @saved="onDictionaryEntrySaved"
    />

    <DictionaryLinkEntryModal
      :open="dictionaryLinkModalOpen"
      :user-id="userId || ''"
      :alias-text="dictionaryModalWord"
      :entries="dictionaryEntries"
      @close="dictionaryLinkModalOpen = false"
      @linked="onDictionaryAliasLinked"
    />

    <div
      v-if="editorContextMenu"
      class="notes-dict-context"
      role="menu"
      :style="{ top: `${editorContextMenu.y}px`, left: `${editorContextMenu.x}px` }"
      @contextmenu.prevent
    >
      <p v-if="editorContextSelectionHit" class="notes-dict-context__hint">
        Déjà connu : {{ editorContextSelectionHit.word }}
      </p>
      <button
        type="button"
        class="notes-dict-context__item"
        role="menuitem"
        @click="openDictionaryEntryModal(editorContextMenu.word)"
      >
        Ajouter au dictionnaire
      </button>
      <button
        type="button"
        class="notes-dict-context__item"
        role="menuitem"
        @click="openDictionaryLinkModal(editorContextMenu.word)"
      >
        Lier à une définition existante
      </button>
    </div>

    <div
      v-if="dictionaryTooltip"
      class="notes-dict-tooltip"
      role="tooltip"
      :style="{ top: `${dictionaryTooltip.y}px`, left: `${dictionaryTooltip.x}px` }"
    >
      {{ dictionaryTooltip.text }}
    </div>
  </div>
</template>

<style scoped>
.notes-page {
  position: relative;
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

.notes-page__sidebar-title-actions {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-shrink: 0;
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

.notes-page--in-vault {
  background: var(--notes-vault-page-bg, #f4f0fa);
  border-color: var(--notes-vault-border-strong, #e6ddf2);
}

.notes-page--in-vault .notes-page__sidebar {
  background: var(--notes-vault-sidebar-bg, #faf7ff);
  border-right-color: var(--notes-vault-border, #e6ddf2);
}

.notes-page--in-vault .notes-page__sidebar-footer {
  border-top-color: var(--notes-vault-border, #e6ddf2);
}

.notes-page--in-vault .notes-page__main {
  background: var(--notes-vault-main-bg, #faf7fd);
}

.notes-page--in-vault :deep(.notes-tabs) {
  background: var(--notes-vault-tabs-bg, #efe6f8);
  border-bottom-color: var(--notes-vault-border, #e0d4ee);
}

.notes-page--in-vault :deep(.notes-tabs__tab--active) {
  background: var(--notes-vault-main-bg, #faf7fd);
  border-color: var(--notes-vault-border, #e0d4ee);
  color: var(--notes-vault-text, #3b2a4a);
}

.notes-page--in-vault :deep(.notes-tabs__tab:hover) {
  background: var(--notes-vault-icon-hover-bg, rgba(255, 255, 255, 0.45));
  color: var(--notes-vault-text, #3b2a4a);
}

.notes-page--in-vault .notes-page__editor-header {
  background: var(--notes-vault-header-bg, #f3ebf9);
  border-bottom-color: var(--notes-vault-border, #e6ddf2);
}

.notes-page--in-vault .notes-page__title-input {
  color: var(--notes-vault-text, #3b2a4a);
}

.notes-page--in-vault .notes-page__folder-label,
.notes-page--in-vault .notes-page__meta,
.notes-page--in-vault .notes-page__save-msg {
  color: var(--notes-vault-text-muted, #6d5a7e);
}

.notes-page--in-vault .notes-page__folder-select,
.notes-page--in-vault .notes-page__search {
  border-color: var(--notes-vault-border-strong, #d5c4e6);
  background: var(--notes-vault-input-bg, #fff);
  color: var(--notes-vault-text, #3b2a4a);
}

.notes-page--in-vault .notes-page__icon-btn {
  color: var(--notes-vault-icon, #72a098);
}

.notes-page--in-vault .notes-page__icon-btn:hover {
  color: var(--notes-vault-color, #ad81be);
  background: var(--notes-vault-icon-hover-bg, transparent);
}

.notes-page--in-vault .notes-page__icon-btn--active {
  color: var(--notes-vault-color, #ad81be);
}

.notes-page--in-vault .notes-page__mode-switch {
  border-color: var(--notes-vault-border-strong, #72a098);
  background: var(--notes-vault-mode-bg, #e8f6ee);
}

.notes-page--in-vault .notes-page__mode {
  color: var(--notes-vault-text, #3d5c50);
}

.notes-page--in-vault .notes-page__mode--active {
  background: var(--notes-vault-mode-active, #95d1aa);
  color: var(--notes-vault-text, #244438);
}

.notes-page--in-vault .notes-page__btn {
  border-color: var(--notes-vault-border-strong, #d5c4e6);
  background: var(--notes-vault-input-bg, #fff);
  color: var(--notes-vault-text, #3b2a4a);
}

.notes-page--in-vault .notes-page__btn--primary {
  background: var(--notes-vault-btn-bg, #d5b5ea);
  border-color: var(--notes-vault-color, #c5a0dc);
  color: var(--notes-vault-btn-text, #fff);
}

.notes-page--in-vault .notes-page__back-btn {
  border-color: var(--notes-vault-border-strong, rgba(173, 129, 190, 0.35));
  color: var(--notes-vault-text, #3d2f4a);
  background: var(--notes-vault-input-bg, #fff);
}

.notes-page--in-vault .notes-page__vault-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--notes-vault-text, #3d2f4a);
  background: color-mix(in srgb, var(--notes-vault-accent, #d5b5ea) 65%, white);
  border: 1px solid color-mix(in srgb, var(--notes-vault-color, #ad81be) 30%, transparent);
}

.notes-page--in-vault .notes-page__title {
  color: var(--notes-vault-text, #3b2a4a);
}

.notes-page--in-vault .notes-page__sidebar-rail {
  background: var(--notes-vault-sidebar-bg, #efe6f8);
  border-right-color: var(--notes-vault-border, #e0d4ee);
  color: var(--notes-vault-icon, #ad81be);
}

.notes-page__vault-nav {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-bottom: 0.45rem;
  flex-wrap: wrap;
}

.notes-page__back-btn {
  border: 1px solid color-mix(in srgb, var(--notes-vault-color, #ad81be) 35%, transparent);
  background: #fff;
  color: #3d2f4a;
  border-radius: 8px;
  padding: 0.28rem 0.55rem;
  font-size: 0.78rem;
  font-weight: 650;
  cursor: pointer;
}

.notes-page__vault-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  color: #3d2f4a;
  background: color-mix(in srgb, var(--notes-vault-accent, #d5b5ea) 65%, white);
  border: 1px solid color-mix(in srgb, var(--notes-vault-color, #ad81be) 30%, transparent);
  min-width: 0;
}

.notes-page__vault-badge-icon {
  font-size: 0.68rem;
  line-height: 1;
  flex-shrink: 0;
}

.notes-page__vault-title-icon {
  margin-right: 0.3rem;
  font-size: 0.82em;
  line-height: 1;
}

.notes-page__vault-theme-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--notes-vault-color, #ad81be) 35%, transparent);
  background: var(--notes-vault-input-bg, #fff);
  color: var(--notes-vault-icon, #ad81be);
  cursor: pointer;
}

.notes-page__vault-theme-btn svg {
  width: 0.95rem;
  height: 0.95rem;
}

.notes-page__vault-theme-btn:hover {
  background: var(--notes-vault-icon-hover-bg, rgba(255, 255, 255, 0.6));
  color: var(--notes-vault-color, #ad81be);
}

.notes-page__tree-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.notes-page__vaults {
  margin-bottom: 0.75rem;
  padding-bottom: 0.65rem;
  border-bottom: 1px dashed #d5c4e6;
}

.notes-page__vaults-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.notes-page__vaults-title {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 800;
  color: #3d2f4a;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.notes-page__vaults-add {
  width: 1.65rem;
  height: 1.65rem;
  border-radius: 8px;
  border: 1px solid #d5c4e6;
  background: #fff;
  color: #5a4a68;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
}

.notes-page__vaults-hint {
  margin: 0 0 0.55rem;
  font-size: 0.72rem;
  line-height: 1.4;
  color: #6d5a7e;
}

.notes-page__vaults-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.45rem;
}

.notes-page__vault-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  width: 100%;
  padding: 0.55rem 0.65rem;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--notes-vault-color, #ad81be) 35%, transparent);
  background: var(--notes-vault-graph-bg);
  text-align: left;
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}

.notes-page__vault-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px color-mix(in srgb, var(--notes-vault-color, #ad81be) 18%, transparent);
}

.notes-page__vault-card-head {
  display: flex;
  align-items: center;
  gap: 0.32rem;
  width: 100%;
  min-width: 0;
  padding-right: 2.4rem;
}

.notes-page__vault-card-icon {
  font-size: 0.76rem;
  line-height: 1;
  flex-shrink: 0;
}

.notes-page__vault-card-name {
  font-size: 0.84rem;
  font-weight: 750;
  color: #2c2434;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notes-page__vault-card-meta {
  font-size: 0.68rem;
  color: #6d5a7e;
}

.notes-page__vault-card-delete {
  position: absolute;
  top: 0.35rem;
  right: 0.4rem;
  width: 1.25rem;
  height: 1.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: #8b7a96;
  font-size: 1rem;
  line-height: 1;
}

.notes-page__vault-card-theme {
  position: absolute;
  top: 0.35rem;
  right: 1.75rem;
  width: 1.25rem;
  height: 1.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--notes-vault-icon, #8b7a96);
}

.notes-page__vault-card-theme svg {
  width: 0.85rem;
  height: 0.85rem;
}

.notes-page__vault-card-theme:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--notes-vault-color, #ad81be);
}

.notes-page__vault-card-delete:hover {
  background: rgba(0, 0, 0, 0.06);
  color: #c0392b;
}

.notes-page__vaults-empty {
  margin: 0;
  font-size: 0.75rem;
  color: #8b7a96;
  font-style: italic;
}

.notes-page__section-label {
  margin: 0 0 0.35rem;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #8b7a96;
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

:deep(.markdown-body .notes-dict-term) {
  border-bottom: 1px dotted #9b7ab8;
  cursor: help;
}

.notes-dict-context {
  position: fixed;
  z-index: 1100;
  min-width: 220px;
  padding: 0.35rem;
  border-radius: 12px;
  background: #fff;
  border: 1px solid #e6ddf2;
  box-shadow: 0 12px 32px rgba(58, 34, 86, 0.16);
}

.notes-dict-context__hint {
  margin: 0.15rem 0.55rem 0.35rem;
  font-size: 0.78rem;
  color: #7a688c;
}

.notes-dict-context__item {
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 0.5rem 0.65rem;
  border-radius: 8px;
  font: inherit;
  color: #3a2256;
  cursor: pointer;
}

.notes-dict-context__item:hover {
  background: #f4edf9;
}

.notes-dict-tooltip {
  position: fixed;
  z-index: 1150;
  transform: translate(-50%, calc(-100% - 8px));
  max-width: min(320px, calc(100vw - 2rem));
  padding: 0.55rem 0.7rem;
  border-radius: 10px;
  background: #2f203f;
  color: #f8f4fc;
  font-size: 0.84rem;
  line-height: 1.4;
  white-space: pre-wrap;
  pointer-events: none;
  box-shadow: 0 10px 24px rgba(24, 16, 36, 0.28);
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
  .notes-page,
  .notes-page--sidebar-collapsed,
  .notes-page--mobile {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr;
    height: calc(100vh - 2rem);
    min-height: 520px;
  }

  .notes-page__drawer-overlay {
    position: absolute;
    inset: 0;
    z-index: 25;
    background: rgba(40, 25, 55, 0.35);
  }

  .notes-page__sidebar {
    position: absolute;
    top: 0;
    left: auto;
    right: 0;
    bottom: 0;
    width: min(300px, 86vw);
    max-height: none;
    z-index: 26;
    border-right: none;
    border-left: 1px solid #e0d4ee;
    border-bottom: none;
    transform: translateX(105%);
    transition: transform 0.2s ease;
    box-shadow: -8px 0 28px rgba(60, 30, 80, 0.16);
    pointer-events: none;
  }

  .notes-page--drawer-open .notes-page__sidebar {
    transform: translateX(0);
    pointer-events: auto;
  }

  .notes-page__sidebar-rail {
    position: absolute;
    top: 50%;
    left: auto;
    right: 0;
    z-index: 20;
    width: 1.55rem;
    min-height: 3.8rem;
    transform: translateY(-50%);
    border: 1px solid rgba(224, 212, 238, 0.55);
    border-right: none;
    border-radius: 10px 0 0 10px;
    background: rgba(239, 230, 248, 0.42);
    color: rgba(90, 74, 104, 0.72);
    box-shadow: none;
    backdrop-filter: blur(4px);
  }

  .notes-page__sidebar-rail:hover,
  .notes-page__sidebar-rail:focus-visible {
    background: rgba(239, 230, 248, 0.92);
    color: #5a4a68;
  }

  .notes-page__sidebar-rail-label {
    writing-mode: vertical-rl;
    transform: none;
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    opacity: 0.85;
  }

  .notes-page__main {
    padding-right: 1.15rem;
  }

  .notes-page__editor {
    border-right: none;
  }
}
</style>
