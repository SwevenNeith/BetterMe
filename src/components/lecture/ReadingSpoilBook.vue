<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import RichSpoilHtmlContent from './RichSpoilHtmlContent.vue'

const COLUMN_GAP_PX = 32

const props = defineProps({
  chapter: {
    type: Object,
    default: null,
  },
  bookTitle: {
    type: String,
    default: '',
  },
  canGoPrevChapter: {
    type: Boolean,
    default: false,
  },
  canGoNextChapter: {
    type: Boolean,
    default: false,
  },
  deleting: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['prev-chapter', 'next-chapter', 'edit', 'delete'])

const viewportRef = ref(null)
const pageCount = ref(1)
const currentPage = ref(1)

let resizeObserver = null

function isNumericChapterNumber(value) {
  const label = String(value ?? '').trim()
  if (!label) return false
  return /^-?\d+(?:[.,]\d+)?$/.test(label)
}

function formatChapterLabel(chapterNumber) {
  const label = String(chapterNumber ?? '').trim()
  if (!label) return 'Chapitre'
  if (isNumericChapterNumber(label)) return `Chapitre ${label}`
  return label
}

function displayHtml(value) {
  return String(value ?? '').trim()
}

function isRichEmpty(value) {
  const html = String(value ?? '')
  const plain = html.replace(/<[^>]*>/g, '').replace(/\u00a0/g, ' ').trim()
  return plain.length === 0
}

const chapterTitle = computed(() => formatChapterLabel(props.chapter?.chapter_number))

const chapterHtml = computed(() => {
  const chapter = props.chapter
  if (!chapter) return '<p></p>'

  const sections = [
    { title: 'Personnages rencontrés', html: chapter.characters_met },
    { title: 'World building', html: chapter.world_building },
    { title: 'Scène', html: chapter.scene },
  ]

  return sections
    .map((section) => {
      const content = isRichEmpty(section.html)
        ? '<p class="spoil-book__empty">—</p>'
        : displayHtml(section.html)
      return `<h2 class="spoil-book__section-title">${section.title}</h2>${content}`
    })
    .join('')
})

function syncViewportWidth() {
  const viewport = viewportRef.value
  if (!viewport) return
  viewport.style.setProperty('--spoil-book-page-width', `${viewport.clientWidth}px`)
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
  () => props.chapter?.id,
  async () => {
    currentPage.value = 1
    await nextTick()
    updatePageMetrics()
  },
)

watch(chapterHtml, async () => {
  currentPage.value = 1
  await nextTick()
  updatePageMetrics()
})
</script>

<template>
  <section class="spoil-book">
    <header class="spoil-book__head">
      <div>
        <h1 class="spoil-book__title">{{ chapterTitle }}</h1>
        <p v-if="bookTitle" class="spoil-book__book">{{ bookTitle }}</p>
      </div>

      <div class="spoil-book__actions">
        <button type="button" class="spoil-book__action" @click="emit('edit')">Modifier</button>
        <button
          type="button"
          class="spoil-book__action spoil-book__action--danger"
          :disabled="deleting"
          @click="emit('delete')"
        >
          {{ deleting ? 'Suppression…' : 'Supprimer' }}
        </button>
      </div>
    </header>

    <div class="spoil-book__page-shell">
      <div
        ref="viewportRef"
        class="spoil-book__viewport"
        @scroll="handleViewportScroll"
        @wheel="handleViewportWheel"
      >
        <div class="spoil-book__columns">
          <RichSpoilHtmlContent :html="chapterHtml" />
        </div>
      </div>
    </div>

    <footer class="spoil-book__footer">
      <div class="spoil-book__footer-group">
        <button type="button" class="spoil-book__nav" :disabled="currentPage <= 1" @click="goPrevPage">
          ← Page précédente
        </button>
        <span class="spoil-book__counter">Page {{ currentPage }} / {{ pageCount }}</span>
        <button type="button" class="spoil-book__nav" :disabled="currentPage >= pageCount" @click="goNextPage">
          Page suivante →
        </button>
      </div>

      <div class="spoil-book__footer-group">
        <button type="button" class="spoil-book__nav" :disabled="!canGoPrevChapter" @click="emit('prev-chapter')">
          ← Chapitre précédent
        </button>
        <button type="button" class="spoil-book__nav" :disabled="!canGoNextChapter" @click="emit('next-chapter')">
          Chapitre suivant →
        </button>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.spoil-book {
  display: grid;
  gap: 1rem;
  min-height: 0;
}

.spoil-book__head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  flex-wrap: wrap;
}

.spoil-book__title {
  margin: 0;
  font-size: 2rem;
  font-weight: 800;
  color: #3d2f4a;
}

.spoil-book__book {
  margin: 0.35rem 0 0;
  font-size: 0.95rem;
  color: #8b7a96;
  font-style: italic;
}

.spoil-book__actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.spoil-book__action,
.spoil-book__nav {
  padding: 0.72rem 1rem;
  border-radius: 12px;
  border: 1px solid rgba(173, 129, 190, 0.35);
  background: rgba(255, 255, 255, 0.88);
  color: #5a4a68;
  font-weight: 700;
  cursor: pointer;
}

.spoil-book__action--danger {
  color: #b02a37;
  border-color: rgba(176, 42, 55, 0.2);
}

.spoil-book__page-shell {
  --spoil-book-line-h: 1.5rem;
  --spoil-book-font-size: 1rem;
  min-height: min(64vh, 44rem);
  padding: 1.25rem;
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(250, 246, 255, 0.92));
  border: 1px solid rgba(213, 181, 234, 0.32);
  box-shadow: 0 18px 40px rgba(92, 62, 112, 0.12);
  box-sizing: border-box;
  overflow: hidden;
}

.spoil-book__viewport {
  --spoil-book-page-width: 100%;
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
    transparent calc(var(--spoil-book-line-h) - 1px),
    rgba(173, 129, 190, 0.22) calc(var(--spoil-book-line-h) - 1px),
    rgba(173, 129, 190, 0.22) var(--spoil-book-line-h)
  );
  background-size: 100% var(--spoil-book-line-h);
  background-position: 0 0;
  font-size: var(--spoil-book-font-size);
  line-height: var(--spoil-book-line-h);
}

.spoil-book__viewport::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.spoil-book__columns {
  height: 100%;
  max-height: 100%;
  column-width: var(--spoil-book-page-width);
  column-gap: 32px;
  column-fill: auto;
  column-rule: none;
  overflow: visible;
}

.spoil-book__columns :deep(.rich-spoil-html) {
  display: block;
  box-sizing: border-box;
  padding: 0 0.75rem;
  margin: 0;
  color: #3d2f4a;
  font-size: var(--spoil-book-font-size);
  line-height: var(--spoil-book-line-h);
}

.spoil-book__columns :deep(.spoil-book__section-title) {
  margin: 0 0 0.35rem;
  padding: 0;
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: #ad81be;
}

.spoil-book__columns :deep(.spoil-book__section-title:not(:first-child)) {
  margin-top: 0.85rem;
}

.spoil-book__columns :deep(.spoil-book__empty) {
  margin: 0;
  color: #9a8aa6;
  font-style: italic;
}

.spoil-book__columns :deep(.rich-spoil-html p),
.spoil-book__columns :deep(.rich-spoil-html div),
.spoil-book__columns :deep(.rich-spoil-html span),
.spoil-book__columns :deep(.rich-spoil-html li) {
  margin: 0;
  padding: 0;
  font-size: inherit;
  line-height: inherit;
}

.spoil-book__columns :deep(.rich-spoil-html > *) {
  break-inside: auto;
  orphans: 1;
  widows: 1;
}

.spoil-book__footer {
  display: flex;
  justify-content: space-between;
  gap: 0.85rem;
  flex-wrap: wrap;
  align-items: center;
}

.spoil-book__footer-group {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  align-items: center;
}

.spoil-book__counter {
  min-width: 6.25rem;
  text-align: center;
  font-size: 0.88rem;
  font-weight: 700;
  color: #6c757d;
}

.spoil-book__action:disabled,
.spoil-book__nav:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (max-width: 720px) {
  .spoil-book__title {
    font-size: 1.55rem;
  }

  .spoil-book__page-shell {
    padding: 0.8rem;
  }

  .spoil-book__viewport {
    height: 50vh;
  }
}

@media (prefers-color-scheme: dark) {
  .spoil-book__title {
    color: #f0e8f8;
  }

  .spoil-book__book {
    color: #adb5bd;
  }

  .spoil-book__action,
  .spoil-book__nav {
    background: rgba(35, 30, 48, 0.95);
    border-color: rgba(173, 129, 190, 0.4);
    color: #e8dcf5;
  }

  .spoil-book__action--danger {
    color: #ff8a95;
    border-color: rgba(220, 53, 69, 0.28);
  }

  .spoil-book__page-shell {
    background: linear-gradient(180deg, rgba(42, 36, 56, 0.96), rgba(31, 26, 44, 0.96));
    border-color: rgba(213, 181, 234, 0.22);
  }

  .spoil-book__viewport {
    background-color: rgba(25, 20, 35, 0.92);
    border-color: rgba(213, 181, 234, 0.22);
  }

  .spoil-book__columns :deep(.rich-spoil-html) {
    color: #f0e8f8;
  }

  .spoil-book__columns :deep(.spoil-book__empty) {
    color: #adb5bd;
  }

  .spoil-book__counter {
    color: #adb5bd;
  }
}
</style>
