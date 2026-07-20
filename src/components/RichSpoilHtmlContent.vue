<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { normalizeNoteHighlightElement } from '../utils/richNoteTextColors.js'

const props = defineProps({
  html: {
    type: String,
    default: '',
  },
})

const containerRef = ref(null)
const tooltip = ref({
  visible: false,
  text: '',
  top: 0,
  left: 0,
})

let boundMarks = []

function hideTooltip() {
  tooltip.value.visible = false
}

function showTooltip(mark) {
  const text = String(mark.getAttribute('data-note-text') || mark.title || '').trim()
  if (!text) return

  const rect = mark.getBoundingClientRect()
  tooltip.value = {
    visible: true,
    text,
    top: rect.bottom + window.scrollY + 6,
    left: rect.left + window.scrollX,
  }
}

function onMarkEnter(event) {
  showTooltip(event.currentTarget)
}

function onMarkLeave() {
  hideTooltip()
}

function unbindMarks() {
  boundMarks.forEach((mark) => {
    mark.removeEventListener('mouseenter', onMarkEnter)
    mark.removeEventListener('mouseleave', onMarkLeave)
  })
  boundMarks = []
}

function bindMarks() {
  unbindMarks()
  const el = containerRef.value
  if (!el) return

  boundMarks = [...el.querySelectorAll('mark[data-note-id]')]
  boundMarks.forEach((mark) => {
    normalizeNoteHighlightElement(mark)
    mark.addEventListener('mouseenter', onMarkEnter)
    mark.addEventListener('mouseleave', onMarkLeave)
  })
}

watch(
  () => props.html,
  () => nextTick(bindMarks),
)

onMounted(() => nextTick(bindMarks))

onBeforeUnmount(() => {
  unbindMarks()
  hideTooltip()
})
</script>

<template>
  <div
    ref="containerRef"
    class="rich-spoil-html"
    v-html="html"
  />

  <Teleport to="body">
    <div
      v-if="tooltip.visible"
      class="rich-spoil-html__tooltip"
      :style="{ top: `${tooltip.top}px`, left: `${tooltip.left}px` }"
    >
      {{ tooltip.text }}
    </div>
  </Teleport>
</template>

<style scoped>
.rich-spoil-html :deep(mark.rich-note__highlight),
.rich-spoil-html :deep(mark[data-note-id]) {
  background: rgba(213, 181, 234, 0.45) !important;
  border-bottom: 2px solid #ad81be !important;
  cursor: help;
  border-radius: 2px;
}

.rich-spoil-html__tooltip {
  position: absolute;
  z-index: 9999;
  max-width: 260px;
  padding: 0.45rem 0.65rem;
  border-radius: 10px;
  background: linear-gradient(135deg, #5a4a68, #3d2f4a);
  color: #fff;
  font-size: 0.78rem;
  line-height: 1.4;
  box-shadow: 0 6px 18px rgba(61, 47, 74, 0.28);
  pointer-events: none;
}
</style>
