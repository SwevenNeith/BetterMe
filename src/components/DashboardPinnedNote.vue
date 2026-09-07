<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { formatPinnedNoteWidgetLabel } from '../constants/dashboardPinnedNotes.js'
import { renderMarkdownToSafeHtml } from '../utils/renderMarkdown.js'
import { extractNoteWidgets, mountNoteWidgets } from '../utils/noteWidgets.js'
import { supabase } from '../lib/supabase.js'
import { getNote } from '../services/notes.js'
import {
  loadDashboardVisibility,
  removeDashboardPinnedNote,
  saveDashboardVisibility,
} from '../services/dashboardVisibility.js'

const props = defineProps({
  userId: {
    type: String,
    default: null,
  },
  widgetId: {
    type: String,
    required: true,
  },
  pin: {
    type: Object,
    default: null,
  },
})

const router = useRouter()
const previewEl = ref(null)
const isRemoving = ref(false)
const isLoading = ref(false)
const actionError = ref('')
const liveContentMd = ref(null)
const liveTitle = ref('')

/** @type {null | (() => void)} */
let unmountWidgets = null

const isExcerptPin = computed(() => Boolean(String(props.pin?.partTitle ?? '').trim()))

/**
 * Contenu à afficher : extrait stocké, ou note live.
 * Si l’extrait ne contient pas de fence widget exploitable alors que la note oui
 * (cas fréquent après une sélection partielle), on retombe sur la note live.
 */
const resolvedContentMd = computed(() => {
  const stored = String(props.pin?.contentMd ?? '')
  const live = liveContentMd.value

  if (!isExcerptPin.value) {
    return live != null ? live : stored
  }

  const storedWidgets = extractNoteWidgets(stored).widgets.filter((w) => String(w).trim())
  if (storedWidgets.length) return stored

  if (typeof live === 'string') {
    const liveWidgets = extractNoteWidgets(live).widgets.filter((w) => String(w).trim())
    if (liveWidgets.length) {
      const part = String(props.pin?.partTitle ?? '')
      const looksLikeWidgetIntent =
        /widget|interactive|html-run/i.test(part) ||
        /```\s*(widget|interactive|html-run)/i.test(stored) ||
        !stored.trim()
      if (looksLikeWidgetIntent) return live
    }
  }

  return stored
})

const displayPin = computed(() => {
  const base = props.pin || {}
  return {
    ...base,
    noteTitle: liveTitle.value || base.noteTitle,
    contentMd: resolvedContentMd.value,
  }
})

const label = computed(() => formatPinnedNoteWidgetLabel(displayPin.value))

const renderedPreview = computed(() =>
  renderMarkdownToSafeHtml(displayPin.value?.contentMd || '', {
    enableHtmlWidgets: true,
    enableWikiLinks: false,
  }),
)

const previewHtml = computed(() => renderedPreview.value.html)
const previewWidgets = computed(() => renderedPreview.value.widgets)
const hasPreview = computed(
  () => Boolean(previewHtml.value) || previewWidgets.value.length > 0,
)

const canOpenNote = computed(() => Boolean(props.pin?.noteId && props.pin?.vaultId))

function remountWidgets() {
  if (unmountWidgets) {
    unmountWidgets()
    unmountWidgets = null
  }
  if (!previewEl.value) return
  unmountWidgets = mountNoteWidgets(previewEl.value, previewWidgets.value)
}

async function scheduleRemount() {
  await nextTick()
  remountWidgets()
  // Second pass : le ref peut arriver après le v-if / v-html.
  await nextTick()
  remountWidgets()
}

async function loadLiveNote() {
  if (!props.userId || !props.pin?.noteId) {
    liveContentMd.value = null
    liveTitle.value = ''
    return
  }
  isLoading.value = true
  try {
    const note = await getNote(supabase, props.userId, props.pin.noteId)
    liveContentMd.value = note?.content_md ?? ''
    liveTitle.value = String(note?.title ?? '').trim()
  } catch (err) {
    console.error(err)
    liveContentMd.value = null
    liveTitle.value = ''
  } finally {
    isLoading.value = false
  }
}

function openInNotes() {
  if (!canOpenNote.value) return
  void router.push({
    name: 'notes-vault-detail',
    params: {
      vaultId: props.pin.vaultId,
      noteId: props.pin.noteId,
    },
  })
}

async function removeFromDashboard() {
  if (!props.userId || !props.widgetId || isRemoving.value) return
  isRemoving.value = true
  actionError.value = ''
  try {
    const current = await loadDashboardVisibility(supabase, props.userId)
    const next = removeDashboardPinnedNote(current, props.widgetId)
    await saveDashboardVisibility(supabase, props.userId, next)
  } catch (err) {
    console.error(err)
    actionError.value = err.message || 'Impossible de retirer cette note.'
  } finally {
    isRemoving.value = false
  }
}

onMounted(() => {
  void loadLiveNote().then(() => scheduleRemount())
})

onUnmounted(() => {
  if (unmountWidgets) {
    unmountWidgets()
    unmountWidgets = null
  }
})

watch(
  () => [props.userId, props.pin?.noteId, props.pin?.partTitle, props.pin?.contentMd],
  () => {
    void loadLiveNote()
  },
)

watch([previewHtml, previewWidgets, isLoading], () => {
  void scheduleRemount()
}, { flush: 'post', immediate: true })
</script>

<template>
  <section class="dashboard-pinned-note" aria-label="Note épinglée">
    <header class="dashboard-pinned-note__chrome">
      <h2 class="dashboard-pinned-note__heading">{{ label }}</h2>
      <div class="dashboard-pinned-note__actions">
        <button
          v-if="canOpenNote"
          type="button"
          class="dashboard-pinned-note__btn"
          @click="openInNotes"
        >
          Voir dans Notes
        </button>
        <button
          type="button"
          class="dashboard-pinned-note__btn dashboard-pinned-note__btn--danger"
          :disabled="isRemoving"
          @click="removeFromDashboard"
        >
          {{ isRemoving ? 'Retrait…' : 'Retirer' }}
        </button>
      </div>
    </header>

    <p v-if="actionError" class="dashboard-pinned-note__error">{{ actionError }}</p>

    <div v-if="isLoading && !hasPreview" class="dashboard-pinned-note__empty">Chargement…</div>
    <div
      v-else-if="hasPreview"
      ref="previewEl"
      class="dashboard-pinned-note__body markdown-body"
      v-html="previewHtml"
    />
    <p v-else class="dashboard-pinned-note__empty">Cette note est vide.</p>
  </section>
</template>

<style scoped>
.dashboard-pinned-note {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.dashboard-pinned-note__chrome {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0 0.1rem;
}

.dashboard-pinned-note__heading {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: #ad81be;
  line-height: 1.3;
  min-width: 0;
  flex: 1 1 12rem;
}

.dashboard-pinned-note__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.dashboard-pinned-note__btn {
  border: 1px solid rgba(213, 181, 234, 0.55);
  background: rgba(255, 255, 255, 0.72);
  color: #6b4f7a;
  border-radius: 999px;
  padding: 0.28rem 0.7rem;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}

.dashboard-pinned-note__btn:hover:not(:disabled) {
  background: rgba(246, 237, 251, 0.95);
}

.dashboard-pinned-note__btn:disabled {
  opacity: 0.65;
  cursor: default;
}

.dashboard-pinned-note__btn--danger {
  color: #9b3b4a;
  border-color: rgba(192, 57, 43, 0.28);
}

.dashboard-pinned-note__error {
  margin: 0;
  color: #c0392b;
  font-size: 0.82rem;
  font-weight: 700;
}

.dashboard-pinned-note__body {
  max-height: min(36rem, 72vh);
  overflow: auto;
  padding: 1rem 1.05rem;
  border-radius: 16px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 8px 28px rgba(173, 129, 190, 0.1);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-sizing: border-box;
}

.dashboard-pinned-note__empty {
  margin: 0;
  padding: 1.2rem;
  text-align: center;
  color: #8c98a4;
  font-weight: 700;
  border-radius: 16px;
  border: 1px dashed rgba(213, 181, 234, 0.45);
  background: rgba(255, 255, 255, 0.45);
}

:deep(.notes-html-widget) {
  width: 100%;
  max-width: 100%;
  margin: 0.75rem 0;
  overflow: visible;
  min-height: 4rem;
}

:deep(.notes-html-widget__frame) {
  width: 100%;
  max-width: 100%;
  border: 0;
  display: block;
  background: transparent;
  overflow: visible;
}

@media (prefers-color-scheme: dark) {
  .dashboard-pinned-note__heading {
    color: #d4b4e8;
  }

  .dashboard-pinned-note__btn {
    background: rgba(36, 28, 48, 0.85);
    color: #e8dcf2;
    border-color: rgba(213, 181, 234, 0.28);
  }

  .dashboard-pinned-note__body {
    background: rgba(36, 28, 48, 0.72);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .dashboard-pinned-note__empty {
    background: rgba(36, 28, 48, 0.45);
    color: #adb5bd;
  }
}
</style>
