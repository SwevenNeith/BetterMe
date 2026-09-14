<script setup>
import { computed, onUnmounted, watch } from 'vue'
import ReadingSpoilChapterForm from './ReadingSpoilChapterForm.vue'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  /** Chapitre existant → mode édition */
  chapter: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['close', 'submit'])

const isEdit = computed(() => Boolean(props.chapter?.id))

function handleClose() {
  if (props.disabled) return
  emit('close')
}

function onOverlayClick(event) {
  if (event.target === event.currentTarget) handleClose()
}

function onKeydown(event) {
  if (!props.open || props.disabled) return
  if (event.key === 'Escape') handleClose()
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) document.addEventListener('keydown', onKeydown)
    else document.removeEventListener('keydown', onKeydown)
  },
)

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="spoil-chapter-modal"
      role="dialog"
      aria-modal="true"
      :aria-label="isEdit ? 'Modifier un chapitre' : 'Ajouter un chapitre'"
      @click="onOverlayClick"
    >
      <ReadingSpoilChapterForm
        class="spoil-chapter-modal__panel"
        :chapter="chapter"
        :disabled="disabled"
        :title="isEdit ? 'Modifier le chapitre' : 'Ajouter un chapitre'"
        :submit-label="isEdit ? 'Enregistrer' : 'Valider'"
        @submit="emit('submit', $event)"
        @cancel="handleClose"
        @click.stop
      >
        <template #header-action>
          <button
            type="button"
            class="spoil-chapter-close"
            title="Fermer"
            aria-label="Fermer"
            :disabled="disabled"
            @click="handleClose"
          >
            ✕
          </button>
        </template>
      </ReadingSpoilChapterForm>
    </div>
  </Teleport>
</template>

<style scoped>
.spoil-chapter-modal {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(20, 24, 32, 0.5);
  backdrop-filter: blur(4px);
  box-sizing: border-box;
}

.spoil-chapter-modal__panel {
  width: min(480px, 100%);
  max-height: min(90vh, 760px);
  overflow: auto;
}

.spoil-chapter-close {
  width: 2rem;
  height: 2rem;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #7a6b86;
  cursor: pointer;
  flex-shrink: 0;
}

.spoil-chapter-close:hover:not(:disabled) {
  background: rgba(173, 129, 190, 0.15);
}

@media (prefers-color-scheme: dark) {
  .spoil-chapter-close {
    color: #c5b8d2;
  }

  .spoil-chapter-close:hover:not(:disabled) {
    background: rgba(173, 129, 190, 0.22);
  }
}
</style>
