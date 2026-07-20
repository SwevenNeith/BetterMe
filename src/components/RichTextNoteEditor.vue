<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import RichTextColorPicker from './RichTextColorPicker.vue'
import {
  DEFAULT_TEXT_COLOR,
  normalizeHex,
  normalizeNoteHighlightElement,
  normalizeNoteHighlightsInHtml,
  rememberRecentTextColor,
  rgbToHex,
} from '../utils/richNoteTextColors.js'

const INLINE_FORMAT_CONFIG = {
  bold: { cmd: 'bold', tags: ['B', 'STRONG'] },
  italic: { cmd: 'italic', tags: ['I', 'EM'] },
  underline: { cmd: 'underline', tags: ['U'] },
}

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  /** Quand true : l'éditeur s'agrandit pour afficher tout le contenu (pas de scroll vertical). */
  autoGrow: {
    type: Boolean,
    default: false,
  },
  placeholder: {
    type: String,
    default: 'Ajoutez des détails…',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  /** Affiche des lignes de carnet en arrière-plan. */
  lined: {
    type: Boolean,
    default: false,
  },
  /** Active le bouton Note (surlignage + annotations en marge / tooltip). */
  enableNotes: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue', 'update:notes'])

const editorRef = ref(null)
const colorPickerAnchor = ref(null)
const isEmpty = ref(true)
const colorPickerOpen = ref(false)
const currentTextColor = ref(DEFAULT_TEXT_COLOR)
const formatState = ref({
  bold: false,
  italic: false,
  underline: false,
  alignLeft: false,
  alignCenter: false,
  alignRight: false,
})

const notes = ref([])
let noteIdCounter = 0
const activeNoteId = ref(null)
const noteInputText = ref('')
const notePopupPos = ref({ top: 0, left: 0 })
const showNoteInput = ref(false)
const editingNoteId = ref(null)
const editingMarginNoteId = ref(null)
const marginNoteEditText = ref('')
const marginNoteRefs = ref({})
let savedSelectionRange = null

let selectionHandler = null
let documentMouseDownHandler = null

function resizeEditorToContent() {
  if (!props.autoGrow) return
  const el = editorRef.value
  if (!el) return

  // Reset pour permettre aussi la contraction si on supprime du texte.
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function findColoredSpanAncestor() {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return null

  let node = selection.getRangeAt(0).startContainer
  const editor = editorRef.value
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement

  while (node && node !== editor) {
    if (node.nodeType === Node.ELEMENT_NODE && (node.tagName === 'SPAN' || node.tagName === 'FONT')) {
      const color = node.style?.color || node.getAttribute?.('color')
      const hex = rgbToHex(color)
      if (hex && hex !== DEFAULT_TEXT_COLOR) return node
    }
    node = node.parentElement
  }

  return null
}

function exitTextColor() {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return

  const range = selection.getRangeAt(0)
  const coloredEl = findColoredSpanAncestor()
  if (!coloredEl) return

  if (isCaretAtEndOfElement(range, coloredEl)) {
    placeCaretAfter(coloredEl)
    return
  }

  if (isCaretAtStartOfElement(range, coloredEl)) {
    placeCaretBefore(coloredEl)
    return
  }

  splitInlineElementAtCaret(coloredEl)
}

function readCurrentTextColor() {
  const coloredEl = findColoredSpanAncestor()
  if (coloredEl) {
    const color = coloredEl.style?.color || coloredEl.getAttribute?.('color')
    return rgbToHex(color) ?? DEFAULT_TEXT_COLOR
  }

  return rgbToHex(document.queryCommandValue('foreColor')) ?? DEFAULT_TEXT_COLOR
}

function toggleColorPicker() {
  if (props.disabled) return
  colorPickerOpen.value = !colorPickerOpen.value
  if (colorPickerOpen.value) {
    ensureCaretInEditor()
    currentTextColor.value = readCurrentTextColor()
  }
}

function applyTextColor(color) {
  if (props.disabled) return
  if (!ensureCaretInEditor()) return

  const hex = normalizeHex(color) ?? DEFAULT_TEXT_COLOR

  document.execCommand('styleWithCSS', false, true)
  document.execCommand('foreColor', false, hex)

  if (hex === DEFAULT_TEXT_COLOR) {
    exitTextColor()
  } else {
    rememberRecentTextColor(hex)
  }

  currentTextColor.value = hex
  colorPickerOpen.value = false
  emitContent()
  updateFormatState()
}

function onDocumentMouseDown(event) {
  if (!colorPickerOpen.value) return
  const anchor = colorPickerAnchor.value
  if (anchor && !anchor.contains(event.target)) {
    colorPickerOpen.value = false
  }
}

function syncEmptyState() {
  const el = editorRef.value
  if (!el) return
  const text = (el.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\u200b/g, '').trim()
  isEmpty.value = text.length === 0
}

function hasFormattingShell(el) {
  return Boolean(el.querySelector('b, strong, i, em, u'))
}

function cleanEmptyInlineTags(root) {
  const tags = ['B', 'STRONG', 'I', 'EM', 'U']
  let changed = true

  while (changed) {
    changed = false
    tags.forEach((tag) => {
      root.querySelectorAll(tag).forEach((inlineEl) => {
        const text = (inlineEl.textContent ?? '').replace(/\u200b/g, '').trim()
        if (!text) {
          inlineEl.remove()
          changed = true
        }
      })
    })
  }
}

function emitContent() {
  const el = editorRef.value
  if (!el) return

  cleanEmptyInlineTags(el)

  el.querySelectorAll('mark[data-note-id]').forEach(normalizeNoteHighlightElement)

  const plainText = (el.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\u200b/g, '').trim()
  const keepShell = hasFormattingShell(el)
  const html =
    plainText.length === 0 && !keepShell ? '' : normalizeNoteHighlightsInHtml(el.innerHTML)

  if (plainText.length === 0 && !keepShell && el.innerHTML) {
    el.innerHTML = ''
  }

  syncEmptyState()
  emit('update:modelValue', html)

  resizeEditorToContent()
}

function isSelectionInEditor() {
  const el = editorRef.value
  if (!el) return false
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return false
  const anchor = selection.anchorNode
  const focus = selection.focusNode
  return Boolean(anchor && el.contains(anchor) && focus && el.contains(focus))
}

function setCaretAt(node, offset) {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

function ensureCaretInEditor() {
  const el = editorRef.value
  if (!el) return false

  el.focus()

  const selection = window.getSelection()
  if (!selection) return false

  if (!isSelectionInEditor()) {
    const range = document.createRange()
    if (el.childNodes.length === 0) {
      range.setStart(el, 0)
      range.collapse(true)
    } else {
      range.selectNodeContents(el)
      range.collapse(false)
    }
    selection.removeAllRanges()
    selection.addRange(range)
  }

  return true
}

function findInlineAncestor(tags) {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return null

  let node = selection.getRangeAt(0).startContainer
  const editor = editorRef.value
  if (!editor) return null

  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement

  while (node && node !== editor) {
    if (node.nodeType === Node.ELEMENT_NODE && tags.includes(node.tagName)) {
      return node
    }
    node = node.parentElement
  }

  return null
}

function isFormatActiveAtCaret(tags) {
  if (!isSelectionInEditor()) return false
  const selection = window.getSelection()
  if (!selection?.rangeCount) return false
  if (!selection.getRangeAt(0).collapsed) return false
  return Boolean(findInlineAncestor(tags))
}

function syncBrowserFormatWithCaret() {
  if (!isSelectionInEditor()) return

  const selection = window.getSelection()
  if (!selection?.rangeCount) return
  if (!selection.getRangeAt(0).collapsed) return

  const formats = [
    { cmd: 'bold', tags: ['B', 'STRONG'] },
    { cmd: 'italic', tags: ['I', 'EM'] },
    { cmd: 'underline', tags: ['U'] },
  ]

  formats.forEach(({ cmd, tags }) => {
    const inTag = Boolean(findInlineAncestor(tags))
    if (!inTag && document.queryCommandState(cmd)) {
      document.execCommand(cmd, false, null)
    }
  })
}

function isCaretAtStartOfElement(range, element) {
  const startRange = document.createRange()
  startRange.selectNodeContents(element)
  startRange.collapse(true)
  return range.compareBoundaryPoints(Range.START_TO_START, startRange) <= 0
}

function isCaretAtEndOfElement(range, element) {
  const endRange = document.createRange()
  endRange.selectNodeContents(element)
  endRange.collapse(false)
  return range.compareBoundaryPoints(Range.START_TO_START, endRange) >= 0
}

function placeCaretAfter(node) {
  const parent = node.parentNode
  if (!parent) return

  const next = node.nextSibling
  if (next?.nodeType === Node.TEXT_NODE) {
    setCaretAt(next, 0)
    return
  }

  const textNode = document.createTextNode('')
  parent.insertBefore(textNode, next)
  setCaretAt(textNode, 0)
}

function placeCaretBefore(node) {
  const parent = node.parentNode
  if (!parent) return

  const prev = node.previousSibling
  if (prev?.nodeType === Node.TEXT_NODE) {
    setCaretAt(prev, prev.textContent?.length ?? 0)
    return
  }

  const textNode = document.createTextNode('')
  parent.insertBefore(textNode, node)
  setCaretAt(textNode, 0)
}

function splitInlineElementAtCaret(inlineEl) {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return

  const range = selection.getRangeAt(0)
  if (!inlineEl.contains(range.startContainer)) return

  const afterRange = document.createRange()
  afterRange.selectNodeContents(inlineEl)
  afterRange.setStart(range.startContainer, range.startOffset)

  const trailingContent = afterRange.extractContents()
  const trailingText = (trailingContent.textContent ?? '').replace(/\u200b/g, '')

  if (!trailingText) {
    placeCaretAfter(inlineEl)
    return
  }

  const trailingWrapper = inlineEl.cloneNode(false)
  trailingWrapper.appendChild(trailingContent)
  inlineEl.parentNode.insertBefore(trailingWrapper, inlineEl.nextSibling)
  placeCaretAfter(inlineEl)
}

function exitInlineFormat(tags) {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return

  const range = selection.getRangeAt(0)
  const inlineEl = findInlineAncestor(tags)
  if (!inlineEl) return

  if (isCaretAtEndOfElement(range, inlineEl)) {
    placeCaretAfter(inlineEl)
    return
  }

  if (isCaretAtStartOfElement(range, inlineEl)) {
    placeCaretBefore(inlineEl)
    return
  }

  splitInlineElementAtCaret(inlineEl)
}

function readInlineFormatState() {
  const selection = window.getSelection()
  const collapsed = !selection?.rangeCount || selection.getRangeAt(0).collapsed

  if (collapsed) {
    return {
      bold: isFormatActiveAtCaret(['B', 'STRONG']),
      italic: isFormatActiveAtCaret(['I', 'EM']),
      underline: isFormatActiveAtCaret(['U']),
    }
  }

  return {
    bold: Boolean(findInlineAncestor(['B', 'STRONG'])),
    italic: Boolean(findInlineAncestor(['I', 'EM'])),
    underline: Boolean(findInlineAncestor(['U'])),
  }
}

function updateFormatState() {
  if (!isSelectionInEditor()) return

  const inline = readInlineFormatState()
  formatState.value = {
    ...formatState.value,
    ...inline,
    alignLeft: document.queryCommandState('justifyLeft'),
    alignCenter: document.queryCommandState('justifyCenter'),
    alignRight: document.queryCommandState('justifyRight'),
  }
  currentTextColor.value = readCurrentTextColor()
}

function toggleInlineFormat(cmd, key) {
  if (props.disabled) return
  if (!ensureCaretInEditor()) return

  const config = INLINE_FORMAT_CONFIG[key]
  const wasActive = isFormatActiveAtCaret(config.tags) || formatState.value[key]

  if (wasActive) {
    document.execCommand(cmd, false, null)
    exitInlineFormat(config.tags)
    formatState.value = { ...formatState.value, [key]: false }
  } else {
    document.execCommand(cmd, false, null)
    formatState.value = { ...formatState.value, [key]: true }
  }

  emitContent()
  nextTick(updateFormatState)
}

function applyAlignment(cmd) {
  if (props.disabled) return
  if (!ensureCaretInEditor()) return

  document.execCommand(cmd, false, null)

  formatState.value = {
    ...formatState.value,
    alignLeft: document.queryCommandState('justifyLeft'),
    alignCenter: document.queryCommandState('justifyCenter'),
    alignRight: document.queryCommandState('justifyRight'),
  }

  emitContent()
}

function hasTextSelection() {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return false
  const range = sel.getRangeAt(0)
  return !range.collapsed && isSelectionInEditor()
}

function getMarkFromNode(node) {
  const editor = editorRef.value
  if (!editor || !node) return null

  let current = node.nodeType === Node.TEXT_NODE ? node.parentElement : node
  while (current && current !== editor) {
    if (current.matches?.('mark.rich-note__highlight[data-note-id]')) return current
    current = current.parentElement
  }

  return null
}

function getNoteIdFromSelection() {
  const sel = window.getSelection()
  if (!sel?.rangeCount || !isSelectionInEditor()) return null

  const range = sel.getRangeAt(0)
  const markAtCaret = getMarkFromNode(range.startContainer)
  if (markAtCaret) return markAtCaret.dataset.noteId

  const editor = editorRef.value
  const marks = editor.querySelectorAll('mark.rich-note__highlight[data-note-id]')
  for (const mark of marks) {
    if (typeof range.intersectsNode === 'function' && range.intersectsNode(mark)) {
      return mark.dataset.noteId
    }
  }

  return null
}

function positionNotePopup(anchorRect) {
  const editorRect = editorRef.value.getBoundingClientRect()
  notePopupPos.value = {
    top: anchorRect.top - editorRect.top + anchorRect.height + 4,
    left: Math.max(0, anchorRect.left - editorRect.left),
  }
}

function focusNotePopupInput() {
  nextTick(() => {
    const inp = editorRef.value?.parentElement?.querySelector('.rich-note__note-input-field')
    inp?.focus()
    inp?.select?.()
  })
}

function openNoteInput() {
  if (props.disabled || !props.enableNotes) return
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.getRangeAt(0).collapsed) return
  if (!isSelectionInEditor()) return

  const existingNoteId = getNoteIdFromSelection()
  if (existingNoteId) {
    const mark = editorRef.value.querySelector(`mark[data-note-id="${existingNoteId}"]`)
    if (!mark) return

    editingNoteId.value = existingNoteId
    savedSelectionRange = null
    noteInputText.value = mark.dataset.noteText || notes.value.find((n) => n.id === existingNoteId)?.text || ''
    positionNotePopup(mark.getBoundingClientRect())
    showNoteInput.value = true
    focusNotePopupInput()
    return
  }

  savedSelectionRange = sel.getRangeAt(0).cloneRange()
  editingNoteId.value = null
  noteInputText.value = ''
  positionNotePopup(savedSelectionRange.getBoundingClientRect())
  showNoteInput.value = true
  focusNotePopupInput()
}

function updateNoteText(noteId, noteText) {
  const el = editorRef.value
  if (!el) return

  const mark = el.querySelector(`mark[data-note-id="${noteId}"]`)
  if (mark) {
    mark.dataset.noteText = noteText
    mark.title = noteText
  }

  const note = notes.value.find((n) => n.id === noteId)
  if (note) {
    note.text = noteText
    note.excerpt = mark?.textContent?.slice(0, 40) || ''
  } else {
    notes.value.push({
      id: noteId,
      text: noteText,
      excerpt: mark?.textContent?.slice(0, 40) || '',
    })
  }

  emitContent()
  emitNotes()
}

function confirmNote() {
  const noteText = noteInputText.value.trim()
  if (!noteText) {
    cancelNote()
    return
  }

  if (editingNoteId.value) {
    const noteId = editingNoteId.value
    updateNoteText(noteId, noteText)
    showNoteInput.value = false
    editingNoteId.value = null
    savedSelectionRange = null
    noteInputText.value = ''
    focusNote(noteId)
    return
  }

  if (!savedSelectionRange) {
    cancelNote()
    return
  }

  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(savedSelectionRange)

  const id = `rn-note-${++noteIdCounter}`
  const mark = document.createElement('mark')
  mark.className = 'rich-note__highlight'
  mark.dataset.noteId = id
  mark.dataset.noteText = noteText
  mark.title = noteText

  const fragment = savedSelectionRange.extractContents()
  mark.appendChild(fragment)
  savedSelectionRange.insertNode(mark)

  notes.value.push({
    id,
    text: noteText,
    excerpt: mark.textContent?.slice(0, 40) || '',
  })

  showNoteInput.value = false
  savedSelectionRange = null
  noteInputText.value = ''
  emitContent()
  emitNotes()
  focusNote(id)
}

function cancelNote() {
  showNoteInput.value = false
  savedSelectionRange = null
  editingNoteId.value = null
  noteInputText.value = ''
}

function deleteNote(noteId) {
  const el = editorRef.value
  if (!el) return
  const mark = el.querySelector(`mark[data-note-id="${noteId}"]`)
  if (mark) {
    const parent = mark.parentNode
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
  }
  notes.value = notes.value.filter((n) => n.id !== noteId)
  if (activeNoteId.value === noteId) activeNoteId.value = null
  if (editingMarginNoteId.value === noteId) editingMarginNoteId.value = null
  emitContent()
  emitNotes()
}

function setMarginNoteRef(noteId, el) {
  if (el) marginNoteRefs.value[noteId] = el
  else delete marginNoteRefs.value[noteId]
}

function focusNote(noteId) {
  if (!noteId) return
  activeNoteId.value = noteId
  nextTick(() => {
    marginNoteRefs.value[noteId]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

function focusHighlight(noteId) {
  if (!noteId) return
  activeNoteId.value = noteId
  nextTick(() => {
    const mark = editorRef.value?.querySelector(`mark[data-note-id="${noteId}"]`)
    if (!mark) return
    mark.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    mark.classList.add('rich-note__highlight--pulse')
    window.setTimeout(() => mark.classList.remove('rich-note__highlight--pulse'), 1200)
  })
}

function openNoteEditor(noteId) {
  const note = notes.value.find((n) => n.id === noteId)
  if (!note) return
  editingMarginNoteId.value = noteId
  marginNoteEditText.value = note.text
  focusHighlight(noteId)
  nextTick(() => {
    marginNoteRefs.value[noteId]?.querySelector('textarea')?.focus()
  })
}

function saveMarginNoteEdit(noteId) {
  const text = marginNoteEditText.value.trim()
  if (!text) {
    deleteNote(noteId)
    editingMarginNoteId.value = null
    marginNoteEditText.value = ''
    return
  }

  updateNoteText(noteId, text)
  editingMarginNoteId.value = null
  marginNoteEditText.value = ''
}

function cancelMarginNoteEdit() {
  editingMarginNoteId.value = null
  marginNoteEditText.value = ''
}

function onHighlightHover(noteId) {
  activeNoteId.value = noteId
}

function onHighlightLeave() {
  activeNoteId.value = null
}

function emitNotes() {
  emit('update:notes', notes.value)
}

function getTooltipPosition() {
  if (!activeNoteId.value || !editorRef.value) return { display: 'none' }
  const mark = editorRef.value.querySelector(`mark[data-note-id="${activeNoteId.value}"]`)
  if (!mark) return { display: 'none' }
  const rect = mark.getBoundingClientRect()
  return {
    top: `${rect.bottom + window.scrollY + 6}px`,
    left: `${rect.left + window.scrollX}px`,
  }
}

function setupHighlightListeners() {
  const el = editorRef.value
  if (!el) return
  el.addEventListener('mouseover', (e) => {
    const mark = e.target.closest?.('mark.rich-note__highlight')
    if (mark) onHighlightHover(mark.dataset.noteId)
  })
  el.addEventListener('mouseout', (e) => {
    const mark = e.target.closest?.('mark.rich-note__highlight')
    if (!mark) return
    const margin = el.parentElement?.querySelector('.rich-note__margin')
    if (margin?.contains(e.relatedTarget)) return
    onHighlightLeave()
  })
  el.addEventListener('click', (e) => {
    const mark = e.target.closest?.('mark.rich-note__highlight')
    if (mark?.dataset.noteId) focusNote(mark.dataset.noteId)
  })
}

function onEditorMouseDown() {
  nextTick(() => {
    syncBrowserFormatWithCaret()
    updateFormatState()
  })
}

function rebuildNotesFromDom() {
  const el = editorRef.value
  if (!el) return

  const markEls = el.querySelectorAll('mark.rich-note__highlight[data-note-id]')
  const nextNotes = []
  let maxCounter = 0

  markEls.forEach((mark) => {
    const id = mark.getAttribute('data-note-id') || ''
    if (!id) return

    const text = String(mark.getAttribute('data-note-text') || '').trim()

    const match = id.match(/^rn-note-(\d+)$/)
    if (match?.[1]) maxCounter = Math.max(maxCounter, Number(match[1]))

    nextNotes.push({
      id,
      text,
      excerpt: String(mark.textContent || '').slice(0, 40),
    })
  })

  notes.value = nextNotes
  noteIdCounter = maxCounter
  activeNoteId.value = null
}

function onInput() {
  emitContent()
  updateFormatState()
  resizeEditorToContent()
}

function onPaste(event) {
  event.preventDefault()
  if (!ensureCaretInEditor()) return
  const text = event.clipboardData?.getData('text/plain') ?? ''
  document.execCommand('insertText', false, text)
  emitContent()
  nextTick(updateFormatState)
  resizeEditorToContent()
}

function onEditorInteraction() {
  nextTick(updateFormatState)
  resizeEditorToContent()
}

function setHtml(html) {
  const el = editorRef.value
  if (!el) return
  el.innerHTML = normalizeNoteHighlightsInHtml(html || '')
  el.querySelectorAll('mark[data-note-id]').forEach(normalizeNoteHighlightElement)
  syncEmptyState()
  rebuildNotesFromDom()
}

watch(
  () => props.modelValue,
  (value) => {
    const el = editorRef.value
    if (!el) return
    const next = value || ''
    if (el.innerHTML !== next) setHtml(next)
    resizeEditorToContent()
  },
)

onMounted(async () => {
  await nextTick()
  setHtml(props.modelValue)
  resizeEditorToContent()

  selectionHandler = () => {
    if (isSelectionInEditor()) updateFormatState()
  }
  document.addEventListener('selectionchange', selectionHandler)

  documentMouseDownHandler = onDocumentMouseDown
  document.addEventListener('mousedown', documentMouseDownHandler)

  if (props.enableNotes) setupHighlightListeners()
})

onBeforeUnmount(() => {
  if (selectionHandler) document.removeEventListener('selectionchange', selectionHandler)
  if (documentMouseDownHandler) document.removeEventListener('mousedown', documentMouseDownHandler)
})
</script>

<template>
  <div class="rich-note" :class="{ 'rich-note--disabled': disabled, 'rich-note--with-margin': enableNotes && notes.length > 0 }">
    <div class="rich-note__toolbar" role="toolbar" aria-label="Mise en forme">
      <button
        type="button"
        class="rich-note__tool"
        :class="{ 'rich-note__tool--active': formatState.bold }"
        title="Gras"
        :disabled="disabled"
        :aria-pressed="formatState.bold"
        @mousedown.prevent
        @click="toggleInlineFormat('bold', 'bold')"
      >
        <span class="rich-note__tool-label rich-note__tool-label--bold">B</span>
      </button>
      <button
        type="button"
        class="rich-note__tool"
        :class="{ 'rich-note__tool--active': formatState.italic }"
        title="Italique"
        :disabled="disabled"
        :aria-pressed="formatState.italic"
        @mousedown.prevent
        @click="toggleInlineFormat('italic', 'italic')"
      >
        <span class="rich-note__tool-label rich-note__tool-label--italic">I</span>
      </button>
      <button
        type="button"
        class="rich-note__tool"
        :class="{ 'rich-note__tool--active': formatState.underline }"
        title="Souligné"
        :disabled="disabled"
        :aria-pressed="formatState.underline"
        @mousedown.prevent
        @click="toggleInlineFormat('underline', 'underline')"
      >
        <span class="rich-note__underline">U</span>
      </button>
      <div ref="colorPickerAnchor" class="rich-note__color-wrap">
        <button
          type="button"
          class="rich-note__tool rich-note__tool--color"
          :class="{ 'rich-note__tool--active': colorPickerOpen }"
          title="Couleur du texte"
          :disabled="disabled"
          :aria-expanded="colorPickerOpen"
          @mousedown.prevent
          @click="toggleColorPicker"
        >
          <span class="rich-note__color-letter">A</span>
          <span class="rich-note__color-bar" :style="{ backgroundColor: currentTextColor }" />
        </button>
        <RichTextColorPicker
          v-if="colorPickerOpen"
          :current-color="currentTextColor"
          @select="applyTextColor"
          @close="colorPickerOpen = false"
        />
      </div>
      <template v-if="enableNotes">
        <span class="rich-note__sep" aria-hidden="true" />
        <button
          type="button"
          class="rich-note__tool rich-note__tool--icon"
          title="Ajouter une note"
          :disabled="disabled || !hasTextSelection()"
          @mousedown.prevent
          @click="openNoteInput"
        >
          <svg class="rich-note__align-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z" fill="currentColor" />
            <path d="M7 9h10v2H7z" fill="currentColor" />
          </svg>
        </button>
      </template>
      <span class="rich-note__sep" aria-hidden="true" />
      <button
        type="button"
        class="rich-note__tool rich-note__tool--icon"
        :class="{ 'rich-note__tool--active': formatState.alignLeft }"
        title="Aligner à gauche"
        :disabled="disabled"
        :aria-pressed="formatState.alignLeft"
        @mousedown.prevent
        @click="applyAlignment('justifyLeft')"
      >
        <svg class="rich-note__align-icon" viewBox="0 0 24 24" aria-hidden="true">
          <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <line x1="3" y1="12" x2="15" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <line x1="3" y1="18" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>
      <button
        type="button"
        class="rich-note__tool rich-note__tool--icon"
        :class="{ 'rich-note__tool--active': formatState.alignCenter }"
        title="Centrer"
        :disabled="disabled"
        :aria-pressed="formatState.alignCenter"
        @mousedown.prevent
        @click="applyAlignment('justifyCenter')"
      >
        <svg class="rich-note__align-icon" viewBox="0 0 24 24" aria-hidden="true">
          <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <line x1="6" y1="12" x2="18" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <line x1="4" y1="18" x2="20" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>
      <button
        type="button"
        class="rich-note__tool rich-note__tool--icon"
        :class="{ 'rich-note__tool--active': formatState.alignRight }"
        title="Aligner à droite"
        :disabled="disabled"
        :aria-pressed="formatState.alignRight"
        @mousedown.prevent
        @click="applyAlignment('justifyRight')"
      >
        <svg class="rich-note__align-icon" viewBox="0 0 24 24" aria-hidden="true">
          <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <line x1="9" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <line x1="6" y1="18" x2="21" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <div class="rich-note__body" :class="{ 'rich-note__body--with-margin': enableNotes && notes.length > 0 }">
      <div
        ref="editorRef"
        class="rich-note__editor"
        :class="{
          'rich-note__editor--empty': isEmpty,
          'rich-note__editor--lined': lined,
        }"
        :style="props.autoGrow ? { maxHeight: 'none', overflowY: 'hidden' } : null"
        :contenteditable="!disabled"
        role="textbox"
        aria-multiline="true"
        :data-placeholder="placeholder"
        @mousedown="onEditorMouseDown"
        @input="onInput"
        @paste="onPaste"
        @keyup="onEditorInteraction"
        @mouseup="onEditorInteraction"
        @focus="onEditorMouseDown"
      />

      <!-- Note input popup -->
      <div
        v-if="showNoteInput"
        class="rich-note__note-popup"
        :style="{ top: notePopupPos.top + 'px', left: notePopupPos.left + 'px' }"
      >
        <input
          v-model="noteInputText"
          class="rich-note__note-input-field"
          placeholder="Votre note…"
          @mousedown.stop
          @keydown.enter.prevent="confirmNote"
          @keydown.escape="cancelNote"
        />
        <div class="rich-note__note-popup-actions">
          <button type="button" class="rich-note__note-popup-btn rich-note__note-popup-btn--ok" @click="confirmNote">✓</button>
          <button type="button" class="rich-note__note-popup-btn rich-note__note-popup-btn--cancel" @click="cancelNote">✕</button>
        </div>
      </div>

      <!-- Margin notes (desktop) -->
      <aside v-if="enableNotes && notes.length > 0" class="rich-note__margin">
        <div
          v-for="note in notes"
          :key="note.id"
          :ref="(el) => setMarginNoteRef(note.id, el)"
          class="rich-note__margin-note"
          :class="{ 'rich-note__margin-note--active': activeNoteId === note.id }"
          @click="focusHighlight(note.id)"
          @mouseenter="activeNoteId = note.id"
        >
          <textarea
            v-if="editingMarginNoteId === note.id"
            v-model="marginNoteEditText"
            class="rich-note__margin-edit"
            rows="3"
            @click.stop
            @keydown.enter.ctrl.prevent="saveMarginNoteEdit(note.id)"
            @keydown.escape.prevent="cancelMarginNoteEdit"
            @blur="saveMarginNoteEdit(note.id)"
          />
          <p v-else class="rich-note__margin-text">{{ note.text }}</p>
          <div class="rich-note__margin-actions">
            <button
              type="button"
              class="rich-note__margin-edit-btn"
              title="Modifier la note"
              @click.stop="openNoteEditor(note.id)"
            >
              ✎
            </button>
            <button type="button" class="rich-note__margin-delete" title="Supprimer la note" @click.stop="deleteNote(note.id)">✕</button>
          </div>
        </div>
      </aside>
    </div>

    <!-- Tooltip for notes (mobile) -->
    <Teleport to="body">
      <div
        v-if="activeNoteId && enableNotes"
        class="rich-note__tooltip"
        :style="getTooltipPosition()"
      >
        {{ notes.find(n => n.id === activeNoteId)?.text }}
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.rich-note {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: 0;
}

.rich-note--disabled {
  opacity: 0.65;
}

.rich-note__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
  padding: 0.35rem;
  border-radius: 10px;
  background: rgba(213, 181, 234, 0.12);
  border: 1px solid rgba(213, 181, 234, 0.25);
  position: relative;
}

.rich-note__color-wrap {
  position: relative;
}

.rich-note__tool--color {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.1rem;
  min-width: 1.6rem;
  padding: 0.15rem 0.25rem 0.1rem;
  line-height: 1;
}

.rich-note__color-letter {
  font-size: 0.72rem;
  font-weight: 800;
  color: currentColor;
}

.rich-note__color-bar {
  width: 0.95rem;
  height: 0.16rem;
  border-radius: 999px;
}

.rich-note__tool {
  min-width: 2rem;
  height: 2rem;
  padding: 0 0.45rem;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.85);
  color: #2c3e50;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease;
}

.rich-note__tool--icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.35rem;
}

.rich-note__align-icon {
  width: 1.1rem;
  height: 1.1rem;
  display: block;
}

.rich-note__tool:hover:not(:disabled) {
  background: white;
}

.rich-note__tool--active {
  background: var(--habit-color, #ad81be);
  color: white;
  box-shadow: 0 0 0 2px rgba(173, 129, 190, 0.25);
}

.rich-note__tool--active:hover:not(:disabled) {
  background: var(--habit-color, #ad81be);
  filter: brightness(1.05);
}

.rich-note__tool:disabled {
  cursor: not-allowed;
}

.rich-note__tool-label--bold {
  font-weight: 800;
}

.rich-note__tool-label--italic {
  font-style: italic;
}

.rich-note__underline {
  text-decoration: underline;
}

.rich-note__sep {
  width: 1px;
  height: 1.25rem;
  margin: 0 0.15rem;
  background: rgba(173, 129, 190, 0.35);
}

.rich-note__editor {
  width: 100%;
  min-height: 7rem;
  max-height: 16rem;
  overflow-y: auto;
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.95);
  font-size: 0.95rem;
  line-height: 1.5;
  color: #2c3e50;
  outline: none;
}

.rich-note__editor:focus {
  border-color: var(--habit-color, #ad81be);
  box-shadow: 0 0 0 2px rgba(173, 129, 190, 0.15);
}

.rich-note__editor :deep(mark.rich-note__highlight) {
  background: rgba(213, 181, 234, 0.45);
  border-bottom: 2px solid #ad81be;
  cursor: pointer;
  border-radius: 2px;
}

.rich-note__editor :deep(mark.rich-note__highlight--pulse) {
  box-shadow: 0 0 0 2px rgba(173, 129, 190, 0.75);
}

.rich-note__editor--empty::before {
  content: attr(data-placeholder);
  color: #9aa5b1;
  pointer-events: none;
}

/* Lined notebook background */
.rich-note__editor--lined {
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(1.5em - 1px),
    rgba(173, 129, 190, 0.22) calc(1.5em - 1px),
    rgba(173, 129, 190, 0.22) 1.5em
  );
  background-size: 100% 1.5em;
  background-position: 0 0.65rem;
  line-height: 1.5em;
  padding-top: 0.65rem;
}

/* Body layout for editor + margin */
.rich-note__body {
  position: relative;
  display: flex;
  width: 100%;
}

.rich-note__body--with-margin .rich-note__editor {
  flex: 1;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  border-right: none;
}

/* Margin notes panel (desktop) */
.rich-note__margin {
  /* La marge ne doit pas dépasser ~1/4 de l'espace disponible. */
  width: clamp(120px, 25%, 220px);
  min-width: 120px;
  max-width: 25%;
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-left: 2px solid rgba(173, 129, 190, 0.55);
  border-radius: 0 10px 10px 0;
  background: rgba(250, 246, 255, 0.95);
  padding: 0.45rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  overflow-y: auto;
  max-height: 16rem;
}

.rich-note__margin-note {
  position: relative;
  padding: 0.5rem 0.55rem 0.55rem;
  border-radius: 8px;
  background: rgba(213, 181, 234, 0.16);
  border-left: 3px solid #ad81be;
  font-size: 0.75rem;
  line-height: 1.35;
  color: #3d2f4a;
  transition: background 0.15s;
  cursor: pointer;
}

.rich-note__margin-note--active {
  background: rgba(213, 181, 234, 0.3);
}

.rich-note__margin-text {
  margin: 0;
  word-break: break-word;
  padding-right: 2rem;
}

.rich-note__margin-edit {
  width: 100%;
  min-height: 3rem;
  resize: vertical;
  border: 1px solid rgba(213, 181, 234, 0.45);
  border-radius: 6px;
  padding: 0.35rem 0.4rem;
  font: inherit;
  color: inherit;
  background: rgba(255, 255, 255, 0.95);
  box-sizing: border-box;
}

.rich-note__margin-actions {
  position: absolute;
  top: 0.35rem;
  right: 0.35rem;
  display: flex;
  gap: 0.25rem;
  opacity: 0;
  transition: opacity 0.15s;
}

.rich-note__margin-note:hover .rich-note__margin-actions,
.rich-note__margin-note--active .rich-note__margin-actions {
  opacity: 1;
}

.rich-note__margin-edit-btn,
.rich-note__margin-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.15rem;
  height: 1.15rem;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 4px;
  cursor: pointer;
  color: #6b4f7c;
  font-size: 0.68rem;
  padding: 0;
  line-height: 1;
}

/* Note input popup */
.rich-note__note-popup {
  position: absolute;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.35rem;
  border-radius: 8px;
  background: white;
  border: 1px solid rgba(213, 181, 234, 0.4);
  box-shadow: 0 4px 16px rgba(20, 30, 40, 0.15);
}

.rich-note__note-input-field {
  width: 180px;
  padding: 0.3rem 0.45rem;
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 6px;
  font-size: 0.8rem;
  outline: none;
}

.rich-note__note-input-field:focus {
  border-color: #ad81be;
}

.rich-note__note-popup-actions {
  display: flex;
  gap: 0.2rem;
}

.rich-note__note-popup-btn {
  width: 1.5rem;
  height: 1.5rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.7rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.rich-note__note-popup-btn--ok {
  background: #ad81be;
  color: white;
}

.rich-note__note-popup-btn--cancel {
  background: rgba(0, 0, 0, 0.06);
  color: #666;
}

/* Tooltip for mobile */
.rich-note__tooltip {
  position: absolute;
  z-index: 9999;
  max-width: 240px;
  padding: 0.45rem 0.65rem;
  border-radius: 10px;
  background: linear-gradient(135deg, #5a4a68, #3d2f4a);
  color: white;
  font-size: 0.78rem;
  line-height: 1.35;
  box-shadow: 0 6px 18px rgba(61, 47, 74, 0.28);
  pointer-events: none;
}

/* On mobile, hide margin, rely on tooltip */
@media (max-width: 640px) {
  .rich-note__margin {
    display: none;
  }
  .rich-note__body--with-margin .rich-note__editor {
    border-radius: 10px;
    border-right: 1px solid rgba(213, 181, 234, 0.35);
  }
}

/* On desktop, hide tooltip */
@media (min-width: 641px) {
  .rich-note__tooltip {
    display: none;
  }
}
</style>
