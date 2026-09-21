<script setup>
import { onUnmounted, ref, watch } from 'vue'
import {
  listOpenLibraryCoverOptions,
} from '../../services/bibliotheque/openLibrary.js'
import { findExactOpenLibraryMatchForBook } from '../../services/bibliotheque/openLibraryLink.js'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  book: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['close', 'select'])

const isLoading = ref(false)
const loadError = ref('')
const options = ref([])
const selectedId = ref('')
const resolvingWork = ref(false)
const resolvedWorkKey = ref('')

let abortController = null

const selectedOption = () => options.value.find((item) => item.id === selectedId.value) || null

function close() {
  emit('close')
}

function confirm() {
  const option = selectedOption()
  if (!option) return
  emit('select', {
    ...option,
    workKey: resolvedWorkKey.value || null,
  })
}

async function resolveWorkKey() {
  const existing = String(props.book?.open_library_work_key ?? '').trim()
  if (existing) return existing

  resolvingWork.value = true
  try {
    const match = await findExactOpenLibraryMatchForBook(props.book, {
      signal: abortController?.signal,
    })
    return match?.key || null
  } finally {
    resolvingWork.value = false
  }
}

async function loadOptions() {
  abortController?.abort()
  abortController = new AbortController()

  options.value = []
  selectedId.value = ''
  loadError.value = ''
  resolvedWorkKey.value = ''
  isLoading.value = true

  try {
    const workKey = await resolveWorkKey()
    if (!workKey) {
      loadError.value =
        'Aucune fiche Open Library trouvée pour ce titre/auteur. Lie d’abord le livre via le catalogue, ou vérifie l’orthographe.'
      return
    }

    resolvedWorkKey.value = workKey
    const list = await listOpenLibraryCoverOptions(workKey, {
      signal: abortController.signal,
      limit: 50,
    })
    options.value = list
    if (!list.length) {
      loadError.value = 'Aucune couverture trouvée pour les éditions de ce livre.'
    }
  } catch (err) {
    if (err?.name === 'AbortError') return
    console.error(err)
    loadError.value = err.message || 'Impossible de charger les éditions.'
  } finally {
    isLoading.value = false
  }
}

watch(
  () => [props.open, props.book?.id, props.book?.open_library_work_key],
  ([open]) => {
    if (open) loadOptions()
  },
)

onUnmounted(() => {
  abortController?.abort()
  abortController = null
})
</script>

<template>
  <Teleport to="body">
    <template v-if="open">
      <div class="ol-cover-picker__overlay" @click="close" />
      <div
        class="ol-cover-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ol-cover-picker-title"
        @click.stop
      >
        <header class="ol-cover-picker__header">
          <div>
            <h2 id="ol-cover-picker-title" class="ol-cover-picker__title">
              Choisir une édition / couverture
            </h2>
            <p class="ol-cover-picker__subtitle">
              {{ book?.title || 'Livre' }}
              <span v-if="book?.author"> · {{ book.author }}</span>
            </p>
          </div>
          <button type="button" class="ol-cover-picker__close" aria-label="Fermer" @click="close">
            ✕
          </button>
        </header>

        <p v-if="isLoading || resolvingWork" class="ol-cover-picker__status">
          Chargement des éditions Open Library…
        </p>
        <p v-else-if="loadError" class="ol-cover-picker__error">{{ loadError }}</p>

        <div v-else class="ol-cover-picker__grid">
          <button
            v-for="option in options"
            :key="option.id"
            type="button"
            class="ol-cover-picker__option"
            :class="{ 'ol-cover-picker__option--selected': selectedId === option.id }"
            :aria-pressed="selectedId === option.id"
            @click="selectedId = option.id"
          >
            <img
              :src="option.coverUrl"
              :alt="option.label"
              class="ol-cover-picker__cover"
              loading="lazy"
            />
            <span class="ol-cover-picker__label">{{ option.label }}</span>
          </button>
        </div>

        <footer class="ol-cover-picker__footer">
          <button type="button" class="ol-cover-picker__cancel" @click="close">Annuler</button>
          <button
            type="button"
            class="ol-cover-picker__confirm"
            :disabled="!selectedId"
            @click="confirm"
          >
            Utiliser cette couverture
          </button>
        </footer>
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
.ol-cover-picker__overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(28, 22, 38, 0.45);
  backdrop-filter: blur(2px);
}

.ol-cover-picker {
  position: fixed;
  z-index: 1201;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(52rem, calc(100vw - 1.5rem));
  max-height: min(86vh, 44rem);
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1rem 1.1rem 1rem;
  border-radius: 16px;
  background: linear-gradient(180deg, #fff 0%, #faf6fd 100%);
  border: 1px solid rgba(213, 181, 234, 0.45);
  box-shadow: 0 18px 48px rgba(44, 30, 60, 0.28);
  box-sizing: border-box;
}

.ol-cover-picker__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.ol-cover-picker__title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: #2c3e50;
}

.ol-cover-picker__subtitle {
  margin: 0.25rem 0 0;
  color: #6c757d;
  font-size: 0.9rem;
}

.ol-cover-picker__close {
  border: none;
  background: transparent;
  color: #8a6a9a;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0.2rem 0.4rem;
  border-radius: 8px;
}

.ol-cover-picker__close:hover {
  background: rgba(213, 181, 234, 0.25);
}

.ol-cover-picker__status,
.ol-cover-picker__error {
  margin: 0;
  text-align: center;
  font-weight: 650;
}

.ol-cover-picker__status {
  color: #6c757d;
  padding: 1.5rem 0;
}

.ol-cover-picker__error {
  color: #b02a37;
  padding: 1rem 0.5rem;
}

.ol-cover-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
  gap: 0.75rem;
  overflow: auto;
  padding: 0.15rem 0.1rem 0.35rem;
  min-height: 8rem;
}

.ol-cover-picker__option {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.35rem;
  border-radius: 10px;
  border: 2px solid transparent;
  background: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
}

.ol-cover-picker__option:hover {
  transform: translateY(-1px);
  border-color: rgba(173, 129, 190, 0.45);
}

.ol-cover-picker__option--selected {
  border-color: rgba(173, 129, 190, 0.95);
  box-shadow: 0 0 0 2px rgba(213, 181, 234, 0.55);
}

.ol-cover-picker__cover {
  width: 100%;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  border-radius: 6px;
  display: block;
  background: #f0e8f8;
}

.ol-cover-picker__label {
  font-size: 0.72rem;
  font-weight: 700;
  color: #5a4a68;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ol-cover-picker__footer {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.55rem;
  padding-top: 0.25rem;
}

.ol-cover-picker__cancel,
.ol-cover-picker__confirm {
  border-radius: 10px;
  padding: 0.55rem 0.9rem;
  font-weight: 800;
  font-size: 0.9rem;
  cursor: pointer;
}

.ol-cover-picker__cancel {
  border: 1px solid rgba(173, 129, 190, 0.4);
  background: rgba(255, 255, 255, 0.9);
  color: #6b4f7c;
}

.ol-cover-picker__confirm {
  border: none;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: #fff;
}

.ol-cover-picker__confirm:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (prefers-color-scheme: dark) {
  .ol-cover-picker {
    background: linear-gradient(180deg, #2a2438 0%, #1f1a2c 100%);
    border-color: rgba(213, 181, 234, 0.28);
  }

  .ol-cover-picker__title {
    color: #f0e8f8;
  }

  .ol-cover-picker__subtitle,
  .ol-cover-picker__status,
  .ol-cover-picker__label {
    color: #adb5bd;
  }

  .ol-cover-picker__option {
    background: rgba(35, 30, 48, 0.85);
  }

  .ol-cover-picker__cancel {
    background: rgba(35, 30, 48, 0.9);
    color: #e8dcf5;
  }
}
</style>
