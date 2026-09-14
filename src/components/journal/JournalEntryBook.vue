<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import RichSpoilHtmlContent from './RichSpoilHtmlContent.vue'

const COLUMN_GAP_PX = 32

const props = defineProps({
  entry: {
    type: Object,
    default: null,
  },
  canGoPrevEntry: {
    type: Boolean,
    default: false,
  },
  canGoNextEntry: {
    type: Boolean,
    default: false,
  },
  deleting: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['prev-entry', 'next-entry', 'edit', 'delete'])

const viewportRef = ref(null)
const pageCount = ref(1)
const currentPage = ref(1)

let resizeObserver = null

const formattedDate = computed(() => {
  if (!props.entry?.created_at) return ''
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(props.entry.created_at))
})

const safeHtml = computed(() => props.entry?.content_html || '<p></p>')

function syncViewportWidth() {
  const viewport = viewportRef.value
  if (!viewport) return
  viewport.style.setProperty('--journal-page-width', `${viewport.clientWidth}px`)
}

function updatePageMetrics() {
  const viewport = viewportRef.value
  if (!viewport) {
    pageCount.value = 1
    currentPage.value = 1
    return
  }

  syncViewportWidth()
  viewport.scrollTop = 0

  const pageWidth = viewport.clientWidth
  if (pageWidth <= 0) {
    pageCount.value = 1
    currentPage.value = 1
    return
  }

  const total = Math.max(1, Math.round((viewport.scrollWidth + COLUMN_GAP_PX) / (pageWidth + COLUMN_GAP_PX)))
  pageCount.value = total
  currentPage.value = Math.min(currentPage.value, total)
  scrollToPage(currentPage.value, false)
}

function scrollToPage(page, smooth = true) {
  const viewport = viewportRef.value
  if (!viewport) return

  const targetPage = Math.min(Math.max(page, 1), pageCount.value)
  currentPage.value = targetPage

  viewport.scrollTo({
    left: (targetPage - 1) * (viewport.clientWidth + COLUMN_GAP_PX),
    top: 0,
    behavior: smooth ? 'smooth' : 'auto',
  })
}

function goPrevPage() {
  if (currentPage.value <= 1) return
  scrollToPage(currentPage.value - 1)
}

function goNextPage() {
  if (currentPage.value >= pageCount.value) return
  scrollToPage(currentPage.value + 1)
}

function handleViewportScroll() {
  const viewport = viewportRef.value
  if (!viewport) return
  if (viewport.scrollTop !== 0) viewport.scrollTop = 0
  const pageWidth = viewport.clientWidth + COLUMN_GAP_PX
  if (pageWidth <= 0) return
  currentPage.value = Math.min(
    pageCount.value,
    Math.max(1, Math.round(viewport.scrollLeft / pageWidth) + 1),
  )
}

function handleViewportWheel(event) {
  if (!viewportRef.value) return
  // Empêche le scroll vertical de la page : on tourne les pages du journal.
  if (Math.abs(event.deltaY) >= Math.abs(event.deltaX) && event.deltaY !== 0) {
    event.preventDefault()
    if (event.deltaY > 0) goNextPage()
    else goPrevPage()
  }
}

onMounted(() => {
  resizeObserver = new ResizeObserver(() => updatePageMetrics())
  if (viewportRef.value) resizeObserver.observe(viewportRef.value)
  void nextTick(updatePageMetrics)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

watch(
  () => props.entry?.id,
  async () => {
    currentPage.value = 1
    await nextTick()
    updatePageMetrics()
  },
)

watch(safeHtml, async () => {
  currentPage.value = 1
  await nextTick()
  updatePageMetrics()
})
</script>

<template>
  <section class="journal-book">
    <header class="journal-book__head">
      <div>
        <h1 class="journal-book__title">{{ entry?.title || 'Sans titre' }}</h1>
        <p class="journal-book__date">{{ formattedDate }}</p>
      </div>

      <div class="journal-book__actions">
        <button type="button" class="journal-book__action" @click="emit('edit')">Modifier</button>
        <button
          type="button"
          class="journal-book__action journal-book__action--danger"
          :disabled="deleting"
          @click="emit('delete')"
        >
          {{ deleting ? 'Suppression…' : 'Supprimer' }}
        </button>
      </div>
    </header>

    <div class="journal-book__page-shell">
      <div
        ref="viewportRef"
        class="journal-book__viewport"
        @scroll="handleViewportScroll"
        @wheel="handleViewportWheel"
      >
        <div class="journal-book__columns">
          <RichSpoilHtmlContent :html="safeHtml" />
        </div>
      </div>
    </div>

    <footer class="journal-book__footer">
      <div class="journal-book__footer-group">
        <button type="button" class="journal-book__nav" :disabled="currentPage <= 1" @click="goPrevPage">
          ← Page précédente
        </button>
        <span class="journal-book__counter">Page {{ currentPage }} / {{ pageCount }}</span>
        <button type="button" class="journal-book__nav" :disabled="currentPage >= pageCount" @click="goNextPage">
          Page suivante →
        </button>
      </div>

      <div class="journal-book__footer-group">
        <button type="button" class="journal-book__nav" :disabled="!canGoPrevEntry" @click="emit('prev-entry')">
          ← Entrée précédente
        </button>
        <button type="button" class="journal-book__nav" :disabled="!canGoNextEntry" @click="emit('next-entry')">
          Entrée suivante →
        </button>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.journal-book {
  display: grid;
  gap: 1rem;
  min-height: 0;
}

.journal-book__head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  flex-wrap: wrap;
}

.journal-book__title {
  margin: 0;
  font-size: 2rem;
  font-weight: 800;
  color: #3d2f4a;
}

.journal-book__date {
  margin: 0.35rem 0 0;
  font-size: 0.95rem;
  color: #8b7a96;
  font-style: italic;
}

.journal-book__actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.journal-book__action,
.journal-book__nav {
  padding: 0.72rem 1rem;
  border-radius: 12px;
  border: 1px solid rgba(173, 129, 190, 0.35);
  background: rgba(255, 255, 255, 0.88);
  color: #5a4a68;
  font-weight: 700;
  cursor: pointer;
}

.journal-book__action--danger {
  color: #b02a37;
  border-color: rgba(176, 42, 55, 0.2);
}

.journal-book__page-shell {
  --journal-line-h: 1.5rem;
  --journal-font-size: 1rem;
  min-height: min(64vh, 44rem);
  padding: 1.25rem;
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(250, 246, 255, 0.92));
  border: 1px solid rgba(213, 181, 234, 0.32);
  box-shadow: 0 18px 40px rgba(92, 62, 112, 0.12);
  box-sizing: border-box;
  overflow: hidden;
}

.journal-book__viewport {
  --journal-page-width: 100%;
  width: 100%;
  height: min(58vh, 40rem);
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior: contain;
  scroll-behavior: smooth;
  scrollbar-width: none;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background-color: rgba(255, 255, 255, 0.95);
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(var(--journal-line-h) - 1px),
    rgba(173, 129, 190, 0.22) calc(var(--journal-line-h) - 1px),
    rgba(173, 129, 190, 0.22) var(--journal-line-h)
  );
  background-size: 100% var(--journal-line-h);
  background-position: 0 0;
  font-size: var(--journal-font-size);
  line-height: var(--journal-line-h);
}

.journal-book__viewport::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.journal-book__columns {
  height: 100%;
  max-height: 100%;
  column-width: var(--journal-page-width);
  column-gap: 32px;
  column-fill: auto;
  column-rule: none;
  overflow: visible;
}

.journal-book__columns :deep(.rich-spoil-html) {
  display: block;
  box-sizing: border-box;
  padding: 0 0.75rem;
  margin: 0;
  color: #3d2f4a;
  font-size: var(--journal-font-size);
  line-height: var(--journal-line-h);
}

.journal-book__columns :deep(.rich-spoil-html p),
.journal-book__columns :deep(.rich-spoil-html div),
.journal-book__columns :deep(.rich-spoil-html span),
.journal-book__columns :deep(.rich-spoil-html li) {
  margin: 0;
  padding: 0;
  font-size: inherit;
  line-height: inherit;
}

.journal-book__columns :deep(.rich-spoil-html > *) {
  break-inside: auto;
  orphans: 1;
  widows: 1;
}

.journal-book__footer {
  display: flex;
  justify-content: space-between;
  gap: 0.85rem;
  flex-wrap: wrap;
  align-items: center;
}

.journal-book__footer-group {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  align-items: center;
}

.journal-book__counter {
  min-width: 6.25rem;
  text-align: center;
  font-size: 0.88rem;
  font-weight: 700;
  color: #6c757d;
}

.journal-book__action:disabled,
.journal-book__nav:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (max-width: 720px) {
  .journal-book__title {
    font-size: 1.55rem;
  }

  .journal-book__page-shell {
    padding: 0.8rem;
  }

  .journal-book__viewport {
    height: 50vh;
  }
}
</style>
