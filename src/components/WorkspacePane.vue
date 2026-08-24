<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  pane: {
    type: Object,
    required: true,
  },
  area: {
    type: String,
    required: true,
  },
})

const emit = defineEmits(['close', 'drag-start', 'drag-over', 'drop', 'path-change'])

const router = useRouter()
const iframeRef = ref(null)
const liveTitle = ref(props.pane.label)
/** Src figée au montage pour ne pas recharger l’iframe à chaque navigation interne. */
const embedSrc = ref('')

function resolveEmbedHref(path) {
  const normalized = path?.startsWith('/') ? path : `/${path || ''}`
  return router.resolve(`/embed${normalized}`).href
}

embedSrc.value = resolveEmbedHref(props.pane.path)

function onClose() {
  emit('close', props.pane.id)
}

function onDragStart(event) {
  event.dataTransfer?.setData('text/plain', props.pane.id)
  event.dataTransfer.effectAllowed = 'move'
  emit('drag-start', props.pane.id)
}

function onDragOver(event) {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  emit('drag-over', props.pane.id)
}

function onDrop(event) {
  event.preventDefault()
  const fromId = event.dataTransfer?.getData('text/plain')
  emit('drop', { fromId, toId: props.pane.id })
}

function stripEmbedPrefix(pathname) {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  let path = pathname || ''
  if (base && base !== '/' && path.startsWith(base)) {
    path = path.slice(base.length) || '/'
  }
  if (path.startsWith('/embed')) {
    path = path.slice('/embed'.length) || '/'
  }
  if (!path.startsWith('/')) path = `/${path}`
  return path
}

function syncFromIframe() {
  try {
    const win = iframeRef.value?.contentWindow
    if (!win) return
    const path = stripEmbedPrefix(win.location.pathname)
    if (path && path !== props.pane.path) {
      emit('path-change', { paneId: props.pane.id, path })
    }
    const docTitle = win.document?.title
    if (docTitle) {
      liveTitle.value = docTitle.replace(/\s*[—–|-]\s*BetterMe.*$/i, '').trim() || props.pane.label
    }
  } catch {
    /* ignore */
  }
}

let pollId = null

onMounted(() => {
  pollId = window.setInterval(syncFromIframe, 1200)
})

onUnmounted(() => {
  if (pollId) clearInterval(pollId)
})

watch(
  () => props.pane.label,
  (label) => {
    if (label) liveTitle.value = label
  },
)
</script>

<template>
  <section
    class="workspace-pane"
    :style="{ gridArea: area }"
    @dragover="onDragOver"
    @drop="onDrop"
  >
    <header
      class="workspace-pane__chrome"
      draggable="true"
      :title="'Glisser pour réorganiser'"
      @dragstart="onDragStart"
    >
      <span class="workspace-pane__grip" aria-hidden="true">⋮⋮</span>
      <span class="workspace-pane__title">{{ liveTitle }}</span>
      <button
        type="button"
        class="workspace-pane__close"
        title="Retirer ce panneau"
        aria-label="Retirer ce panneau"
        @click.stop="onClose"
      >
        ✕
      </button>
    </header>
    <iframe
      ref="iframeRef"
      class="workspace-pane__frame"
      :src="embedSrc"
      :title="liveTitle"
      @load="syncFromIframe"
    />
  </section>
</template>

<style scoped>
.workspace-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-radius: 14px;
  border: 1px solid rgba(173, 129, 190, 0.28);
  background: rgba(255, 255, 255, 0.72);
  overflow: hidden;
  box-shadow: 0 6px 18px rgba(61, 47, 74, 0.06);
}

.workspace-pane__chrome {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-shrink: 0;
  padding: 0.4rem 0.55rem;
  background: linear-gradient(135deg, rgba(213, 181, 234, 0.28), rgba(173, 129, 190, 0.12));
  border-bottom: 1px solid rgba(173, 129, 190, 0.22);
  cursor: grab;
  user-select: none;
}

.workspace-pane__chrome:active {
  cursor: grabbing;
}

.workspace-pane__grip {
  color: #8b7a96;
  font-size: 0.72rem;
  letter-spacing: -0.08em;
}

.workspace-pane__title {
  flex: 1;
  min-width: 0;
  font-size: 0.82rem;
  font-weight: 800;
  color: #6b4f7c;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace-pane__close {
  width: 1.55rem;
  height: 1.55rem;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.55);
  color: #b02a37;
  cursor: pointer;
  font-size: 0.85rem;
  line-height: 1;
}

.workspace-pane__close:hover {
  background: rgba(220, 53, 69, 0.12);
}

.workspace-pane__frame {
  flex: 1;
  width: 100%;
  min-height: 0;
  border: none;
  background: #f9f6fd;
}

@media (prefers-color-scheme: dark) {
  .workspace-pane {
    background: rgba(35, 30, 48, 0.75);
    border-color: rgba(213, 181, 234, 0.22);
  }

  .workspace-pane__chrome {
    background: linear-gradient(135deg, rgba(173, 129, 190, 0.28), rgba(61, 47, 74, 0.55));
    border-bottom-color: rgba(213, 181, 234, 0.2);
  }

  .workspace-pane__title {
    color: #e8dcf5;
  }

  .workspace-pane__close {
    background: rgba(42, 36, 56, 0.85);
    color: #ff8a95;
  }

  .workspace-pane__frame {
    background: #1a1724;
  }
}
</style>
