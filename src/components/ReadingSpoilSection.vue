<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import RichSpoilHtmlContent from './RichSpoilHtmlContent.vue'

const props = defineProps({
  bookId: {
    type: String,
    default: '',
  },
  chapters: {
    type: Array,
    default: () => [],
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  isSaving: {
    type: Boolean,
    default: false,
  },
  errorMessage: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['delete-chapter'])

const router = useRouter()

const pendingDeleteChapter = ref(null)
const expandedChapterId = ref(null)
const expandedSections = ref({})

watch(
  () => props.chapters,
  (list) => {
    const ids = new Set((list ?? []).map((chapter) => chapter.id))
    if (expandedChapterId.value && !ids.has(expandedChapterId.value)) {
      expandedChapterId.value = null
      expandedSections.value = {}
    }
    if (pendingDeleteChapter.value && !ids.has(pendingDeleteChapter.value.id)) {
      pendingDeleteChapter.value = null
    }
  },
)

function openAddPage() {
  if (!props.bookId || props.disabled || props.isSaving) return
  router.push({ name: 'lecture-spoil-nouveau', params: { bookId: props.bookId } })
}

function openEditPage(chapter) {
  if (props.disabled || props.isSaving || !chapter?.id || !props.bookId) return
  router.push({
    name: 'lecture-spoil-edition',
    params: { bookId: props.bookId, chapterId: chapter.id },
  })
}

function onDeleteChapter(chapter) {
  if (props.disabled || props.isSaving || !chapter?.id) return
  pendingDeleteChapter.value = chapter
}

function cancelDeleteChapter() {
  if (props.isSaving) return
  pendingDeleteChapter.value = null
}

function confirmDeleteChapter() {
  const chapter = pendingDeleteChapter.value
  if (!chapter?.id || props.disabled || props.isSaving) return
  pendingDeleteChapter.value = null
  emit('delete-chapter', chapter.id)
}

function toggleChapter(chapterId) {
  if (expandedChapterId.value === chapterId) {
    expandedChapterId.value = null
    expandedSections.value = {}
    return
  }
  expandedChapterId.value = chapterId
  expandedSections.value = {}
}

function toggleSection(chapterId, sectionKey) {
  if (expandedChapterId.value !== chapterId) {
    expandedChapterId.value = chapterId
    expandedSections.value = { [sectionKey]: true }
    return
  }
  expandedSections.value = {
    ...expandedSections.value,
    [sectionKey]: !expandedSections.value[sectionKey],
  }
}

function isSectionOpen(chapterId, sectionKey) {
  return expandedChapterId.value === chapterId && Boolean(expandedSections.value[sectionKey])
}

function displayHtml(value) {
  return String(value ?? '').trim()
}

function isRichEmpty(value) {
  const html = String(value ?? '')
  const plain = html.replace(/<[^>]*>/g, '').replace(/\u00a0/g, ' ').trim()
  return plain.length === 0
}

function isNumericChapterNumber(value) {
  const label = String(value ?? '').trim()
  if (!label) return false
  return /^-?\d+(?:[.,]\d+)?$/.test(label)
}

function formatChapterLabel(chapterNumber) {
  const label = String(chapterNumber ?? '').trim()
  if (!label) return ''
  if (isNumericChapterNumber(label)) return `Chapitre ${label}`
  return label
}
</script>

<template>
  <div class="spoil-section">
    <p v-if="errorMessage" class="spoil-section-error">{{ errorMessage }}</p>

    <button
      type="button"
      class="spoil-add-btn"
      :disabled="disabled || isSaving"
      @click="openAddPage"
    >
      Ajouter un chapitre
    </button>

    <div v-if="!chapters.length" class="spoil-empty">
      Aucun chapitre pour l’instant.
    </div>

    <ul v-else class="spoil-chapter-list">
      <li v-for="chapter in chapters" :key="chapter.id" class="spoil-chapter-item">
        <div class="spoil-chapter-row">
          <button
            type="button"
            class="spoil-chapter-toggle"
            :class="{ 'spoil-chapter-toggle--open': expandedChapterId === chapter.id }"
            :aria-expanded="expandedChapterId === chapter.id"
            @click="toggleChapter(chapter.id)"
          >
            <span class="spoil-chapter-toggle__label">{{ formatChapterLabel(chapter.chapter_number) }}</span>
            <span class="spoil-chapter-toggle__chevron" aria-hidden="true">▾</span>
          </button>

          <div class="spoil-chapter-actions">
            <button
              type="button"
              class="spoil-chapter-action"
              title="Modifier"
              aria-label="Modifier le chapitre"
              :disabled="disabled || isSaving"
              @click.stop="openEditPage(chapter)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
            <button
              type="button"
              class="spoil-chapter-action spoil-chapter-action--delete"
              title="Supprimer"
              aria-label="Supprimer le chapitre"
              :disabled="disabled || isSaving"
              @click.stop="onDeleteChapter(chapter)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </button>
          </div>
        </div>

        <div v-if="expandedChapterId === chapter.id" class="spoil-chapter-body">
          <div class="spoil-sub">
            <button
              type="button"
              class="spoil-sub-toggle"
              :class="{ 'spoil-sub-toggle--open': isSectionOpen(chapter.id, 'characters') }"
              :aria-expanded="isSectionOpen(chapter.id, 'characters')"
              @click="toggleSection(chapter.id, 'characters')"
            >
              <span>Personnages rencontrés</span>
              <span aria-hidden="true">▾</span>
            </button>
            <RichSpoilHtmlContent
              v-if="isSectionOpen(chapter.id, 'characters')"
              class="spoil-sub-content"
              :class="{ 'spoil-sub-content--empty': isRichEmpty(chapter.characters_met) }"
              :html="displayHtml(chapter.characters_met)"
            />
          </div>

          <div class="spoil-sub">
            <button
              type="button"
              class="spoil-sub-toggle"
              :class="{ 'spoil-sub-toggle--open': isSectionOpen(chapter.id, 'world') }"
              :aria-expanded="isSectionOpen(chapter.id, 'world')"
              @click="toggleSection(chapter.id, 'world')"
            >
              <span>World building</span>
              <span aria-hidden="true">▾</span>
            </button>
            <RichSpoilHtmlContent
              v-if="isSectionOpen(chapter.id, 'world')"
              class="spoil-sub-content"
              :class="{ 'spoil-sub-content--empty': isRichEmpty(chapter.world_building) }"
              :html="displayHtml(chapter.world_building)"
            />
          </div>

          <div class="spoil-sub">
            <button
              type="button"
              class="spoil-sub-toggle"
              :class="{ 'spoil-sub-toggle--open': isSectionOpen(chapter.id, 'scene') }"
              :aria-expanded="isSectionOpen(chapter.id, 'scene')"
              @click="toggleSection(chapter.id, 'scene')"
            >
              <span>Scène</span>
              <span aria-hidden="true">▾</span>
            </button>
            <RichSpoilHtmlContent
              v-if="isSectionOpen(chapter.id, 'scene')"
              class="spoil-sub-content"
              :class="{ 'spoil-sub-content--empty': isRichEmpty(chapter.scene) }"
              :html="displayHtml(chapter.scene)"
            />
          </div>
        </div>
      </li>
    </ul>

    <Teleport to="body">
      <div
        v-if="pendingDeleteChapter"
        class="spoil-confirm-overlay"
        @click.self="cancelDeleteChapter"
      >
        <div
          class="spoil-confirm-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="spoil-delete-title"
          aria-describedby="spoil-delete-message"
        >
          <h2 id="spoil-delete-title" class="spoil-confirm-title">Supprimer ce chapitre ?</h2>
          <p id="spoil-delete-message" class="spoil-confirm-message">
            Le chapitre « {{ pendingDeleteChapter.chapter_number }} » sera définitivement supprimé.
          </p>
          <div class="spoil-confirm-actions">
            <button
              type="button"
              class="spoil-confirm-cancel"
              :disabled="isSaving"
              @click="cancelDeleteChapter"
            >
              Annuler
            </button>
            <button
              type="button"
              class="spoil-confirm-delete"
              :disabled="isSaving"
              @click="confirmDeleteChapter"
            >
              {{ isSaving ? 'Suppression…' : 'Supprimer' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.spoil-section {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  min-height: 100%;
}

.spoil-section-error {
  margin: 0;
  padding: 0.45rem 0.55rem;
  border-radius: 8px;
  background: rgba(220, 53, 69, 0.1);
  color: #b02a37;
  font-size: 0.8rem;
}

.spoil-add-btn {
  align-self: stretch;
  padding: 0.55rem 0.75rem;
  border-radius: 10px;
  border: 1px dashed rgba(173, 129, 190, 0.55);
  background: rgba(255, 255, 255, 0.75);
  color: #6b4f7c;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.15s ease;
}

.spoil-add-btn:hover:not(:disabled) {
  background: rgba(213, 181, 234, 0.28);
}

.spoil-add-btn:disabled {
  opacity: 0.65;
  cursor: wait;
}

.spoil-empty {
  margin: 0;
  font-size: 0.85rem;
  color: #9a8aa6;
  font-style: italic;
  text-align: center;
  padding: 0.35rem 0;
}

.spoil-chapter-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.spoil-chapter-item {
  border-bottom: 1px dashed rgba(173, 129, 190, 0.4);
  padding-bottom: 0.25rem;
}

.spoil-chapter-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.spoil-chapter-row {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.spoil-chapter-toggle,
.spoil-sub-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  padding: 0.35rem 0.15rem;
  border: none;
  background: transparent;
  color: #3d2f4a;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  text-align: left;
}

.spoil-chapter-toggle {
  min-width: 0;
  flex: 1;
}

.spoil-chapter-actions {
  display: flex;
  align-items: center;
  gap: 0.1rem;
  flex-shrink: 0;
}

.spoil-chapter-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #8b7a96;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.spoil-chapter-action svg {
  width: 0.95rem;
  height: 0.95rem;
}

.spoil-chapter-action:hover:not(:disabled) {
  background: rgba(213, 181, 234, 0.28);
  color: #5a4a68;
}

.spoil-chapter-action--delete:hover:not(:disabled) {
  background: rgba(220, 53, 69, 0.12);
  color: #b02a37;
}

.spoil-chapter-action:disabled {
  opacity: 0.5;
  cursor: wait;
}

.spoil-chapter-toggle__label {
  border-bottom: 1px dashed rgba(173, 129, 190, 0.55);
  padding-bottom: 0.1rem;
  line-height: 1.35;
}

.spoil-chapter-toggle__chevron,
.spoil-sub-toggle span:last-child {
  color: #ad81be;
  transition: transform 0.15s ease;
  flex-shrink: 0;
}

.spoil-chapter-toggle--open .spoil-chapter-toggle__chevron,
.spoil-sub-toggle--open span:last-child {
  transform: rotate(180deg);
}

.spoil-chapter-body {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.15rem 0 0.35rem 0.55rem;
}

.spoil-sub-toggle {
  font-weight: 650;
  font-size: 0.84rem;
  color: #5a4a68;
}

.spoil-sub-content {
  --lined-h: 1.75rem;
  margin: 0 0 0.35rem;
  padding: 0;
  min-height: calc(var(--lined-h) * 3);
  font-size: 0.95rem;
  color: #2c2434;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: var(--lined-h);
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(var(--lined-h) - 1px),
    rgba(173, 129, 190, 0.38) calc(var(--lined-h) - 1px),
    rgba(173, 129, 190, 0.38) var(--lined-h)
  );
  background-size: 100% var(--lined-h);
  background-position: left top;
  background-attachment: local;
  border-radius: 4px;
}

.spoil-sub-content--empty {
  color: transparent;
}

.spoil-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(20, 24, 32, 0.5);
  backdrop-filter: blur(4px);
  box-sizing: border-box;
}

.spoil-confirm-dialog {
  width: 100%;
  max-width: 22rem;
  padding: 1.25rem;
  border-radius: 16px;
  border: 1px solid rgba(173, 129, 190, 0.45);
  background: linear-gradient(180deg, #fffefb 0%, #faf6ff 100%);
  box-shadow: 0 18px 50px rgba(92, 62, 112, 0.18);
  box-sizing: border-box;
}

.spoil-confirm-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: #3d2f4a;
}

.spoil-confirm-message {
  margin: 0.65rem 0 1.1rem;
  font-size: 0.92rem;
  color: #6c757d;
  line-height: 1.45;
}

.spoil-confirm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: flex-end;
}

.spoil-confirm-cancel,
.spoil-confirm-delete {
  padding: 0.7rem 1rem;
  border-radius: 12px;
  font-weight: 700;
  font-size: 0.92rem;
  cursor: pointer;
  transition: filter 0.15s ease, transform 0.15s ease;
}

.spoil-confirm-cancel {
  border: 1px solid rgba(173, 129, 190, 0.35);
  background: rgba(255, 255, 255, 0.85);
  color: #5a4a68;
}

.spoil-confirm-delete {
  border: none;
  background: #c0392b;
  color: #fff;
}

.spoil-confirm-delete:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.05);
}

.spoil-confirm-cancel:disabled,
.spoil-confirm-delete:disabled {
  opacity: 0.65;
  cursor: wait;
}

@media (prefers-color-scheme: dark) {
  .spoil-add-btn {
    background: rgba(35, 30, 48, 0.85);
    border-color: rgba(173, 129, 190, 0.45);
    color: #e8dcf5;
  }

  .spoil-add-btn:hover:not(:disabled) {
    background: rgba(173, 129, 190, 0.28);
  }

  .spoil-empty {
    color: #c5b8d2;
  }

  .spoil-chapter-toggle,
  .spoil-sub-toggle {
    color: #e8dcf5;
  }

  .spoil-chapter-action {
    color: #c5b8d2;
  }

  .spoil-chapter-action:hover:not(:disabled) {
    background: rgba(173, 129, 190, 0.28);
    color: #f0e8f8;
  }

  .spoil-sub-toggle {
    color: #d5c6e4;
  }

  .spoil-sub-content {
    color: #f0e8f8;
    background-image: repeating-linear-gradient(
      to bottom,
      transparent 0,
      transparent calc(var(--lined-h) - 1px),
      rgba(173, 129, 190, 0.28) calc(var(--lined-h) - 1px),
      rgba(173, 129, 190, 0.28) var(--lined-h)
    );
  }

  .spoil-confirm-dialog {
    background: linear-gradient(180deg, #2a2438 0%, #1f1a2c 100%);
    border-color: rgba(213, 181, 234, 0.28);
  }

  .spoil-confirm-title {
    color: #f0e8f8;
  }

  .spoil-confirm-message {
    color: #adb5bd;
  }

  .spoil-confirm-cancel {
    background: rgba(35, 30, 48, 0.95);
    border-color: rgba(173, 129, 190, 0.4);
    color: #e8dcf5;
  }

  .spoil-section-error {
    background: rgba(220, 53, 69, 0.18);
    color: #ff8a95;
  }
}
</style>
