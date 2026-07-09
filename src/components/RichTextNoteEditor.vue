<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import RichTextColorPicker from './RichTextColorPicker.vue'
import {
  DEFAULT_TEXT_COLOR,
  normalizeHex,
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
  placeholder: {
    type: String,
    default: 'Ajoutez des détails…',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue'])

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

let selectionHandler = null
let documentMouseDownHandler = null

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

function emitContent() {
  const el = editorRef.value
  if (!el) return

  const plainText = (el.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\u200b/g, '').trim()
  const keepShell = hasFormattingShell(el)
  const html = plainText.length === 0 && !keepShell ? '' : el.innerHTML

  if (plainText.length === 0 && !keepShell && el.innerHTML) {
    el.innerHTML = ''
  }

  syncEmptyState()
  emit('update:modelValue', html)
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

  while (node && node !== editor) {
    if (node.nodeType === Node.ELEMENT_NODE && tags.includes(node.tagName)) {
      return node
    }
    if (node.nodeType === Node.TEXT_NODE && node.parentElement?.tagName && tags.includes(node.parentElement.tagName)) {
      return node.parentElement
    }
    node = node.parentNode
  }

  return null
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
  return {
    bold: document.queryCommandState('bold'),
    italic: document.queryCommandState('italic'),
    underline: document.queryCommandState('underline'),
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
  const wasActive = formatState.value[key] || document.queryCommandState(cmd)

  if (wasActive) {
    document.execCommand(cmd, false, null)
    exitInlineFormat(config.tags)
    formatState.value = { ...formatState.value, [key]: false }
  } else {
    document.execCommand(cmd, false, null)
    formatState.value = { ...formatState.value, [key]: true }
  }

  emitContent()
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

function onInput() {
  emitContent()
  updateFormatState()
}

function onPaste(event) {
  event.preventDefault()
  if (!ensureCaretInEditor()) return
  const text = event.clipboardData?.getData('text/plain') ?? ''
  document.execCommand('insertText', false, text)
  emitContent()
  nextTick(updateFormatState)
}

function onEditorInteraction() {
  nextTick(updateFormatState)
}

function setHtml(html) {
  const el = editorRef.value
  if (!el) return
  el.innerHTML = html || ''
  syncEmptyState()
}

watch(
  () => props.modelValue,
  (value) => {
    const el = editorRef.value
    if (!el) return
    const next = value || ''
    if (el.innerHTML !== next) setHtml(next)
  },
)

onMounted(async () => {
  await nextTick()
  setHtml(props.modelValue)

  selectionHandler = () => {
    if (isSelectionInEditor()) updateFormatState()
  }
  document.addEventListener('selectionchange', selectionHandler)

  documentMouseDownHandler = onDocumentMouseDown
  document.addEventListener('mousedown', documentMouseDownHandler)
})

onBeforeUnmount(() => {
  if (selectionHandler) document.removeEventListener('selectionchange', selectionHandler)
  if (documentMouseDownHandler) document.removeEventListener('mousedown', documentMouseDownHandler)
})
</script>

<template>
  <div class="rich-note" :class="{ 'rich-note--disabled': disabled }">
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
        <strong>B</strong>
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
        <em>I</em>
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

    <div
      ref="editorRef"
      class="rich-note__editor"
      :class="{ 'rich-note__editor--empty': isEmpty }"
      :contenteditable="!disabled"
      role="textbox"
      aria-multiline="true"
      :data-placeholder="placeholder"
      @input="onInput"
      @paste="onPaste"
      @keyup="onEditorInteraction"
      @mouseup="onEditorInteraction"
      @focus="onEditorInteraction"
    />
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
  min-width: 2.1rem;
  padding: 0.2rem 0.4rem 0.15rem;
  line-height: 1;
}

.rich-note__color-letter {
  font-size: 0.9rem;
  font-weight: 800;
  color: currentColor;
}

.rich-note__color-bar {
  width: 1.15rem;
  height: 0.2rem;
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

.rich-note__editor--empty::before {
  content: attr(data-placeholder);
  color: #9aa5b1;
  pointer-events: none;
}
</style>
