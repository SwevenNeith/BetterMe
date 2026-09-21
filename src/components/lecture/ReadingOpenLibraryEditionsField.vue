<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { listOpenLibraryCoverOptions } from '../../services/bibliotheque/openLibrary.js'
import { findExactOpenLibraryMatchForBook } from '../../services/bibliotheque/openLibraryLink.js'
import { isLinkedToOpenLibrary } from '../../utils/bibliotheque/openLibraryMatch.js'

const props = defineProps({
  book: {
    type: Object,
    default: null,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['select'])

const open = ref(false)
const isLoading = ref(false)
const loadError = ref('')
const options = ref([])
const resolvedWorkKey = ref('')
const selectedLabel = ref('')

let abortController = null
let loadedForKey = ''

const summaryLabel = computed(() => {
  if (selectedLabel.value) return selectedLabel.value
  if (!isLinkedToOpenLibrary(props.book)) return 'Non lié — ouvrir pour chercher'
  return 'Choisir une édition…'
})

function coverMatchesCurrent(option) {
  const current = String(props.book?.coverUrl || props.book?.cover_image_url || '').trim()
  if (!current || !option?.coverId) return false
  return (
    current.includes(`/${option.coverId}-`) ||
    current.includes(`id/${option.coverId}`) ||
    option.coverUrlLarge === current ||
    option.coverUrl === current
  )
}

function syncSelectedFromOptions() {
  const match = options.value.find((option) => coverMatchesCurrent(option))
  if (match) selectedLabel.value = match.label
}

async function resolveWorkKey() {
  const existing = String(props.book?.open_library_work_key ?? '').trim()
  if (existing) return existing
  const match = await findExactOpenLibraryMatchForBook(props.book, {
    signal: abortController?.signal,
  })
  return match?.key || null
}

async function loadOptions({ force = false } = {}) {
  abortController?.abort()
  abortController = new AbortController()

  isLoading.value = true
  loadError.value = ''

  try {
    const workKey = await resolveWorkKey()
    if (!workKey) {
      options.value = []
      resolvedWorkKey.value = ''
      loadedForKey = ''
      loadError.value =
        'Aucune fiche Open Library trouvée. Utilise « Lier manuellement » dans le bandeau.'
      return
    }

    if (!force && loadedForKey === workKey && options.value.length) {
      syncSelectedFromOptions()
      return
    }

    resolvedWorkKey.value = workKey
    const list = await listOpenLibraryCoverOptions(workKey, {
      signal: abortController.signal,
      limit: 50,
    })
    options.value = list
    loadedForKey = workKey
    syncSelectedFromOptions()

    if (!list.length) {
      loadError.value = 'Aucune édition avec couverture trouvée.'
    }
  } catch (err) {
    if (err?.name === 'AbortError') return
    console.error(err)
    options.value = []
    loadError.value = err.message || 'Impossible de charger les éditions.'
  } finally {
    isLoading.value = false
  }
}

async function toggle() {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) await loadOptions()
}

async function selectOption(option) {
  if (props.disabled || !option) return
  selectedLabel.value = option.label
  open.value = false
  emit('select', {
    ...option,
    workKey: resolvedWorkKey.value || null,
  })
}

watch(
  () => [props.book?.id, props.book?.open_library_work_key, props.book?.coverUrl],
  ([bookId, workKey]) => {
    const cacheKey = String(workKey || bookId || '')
    if (cacheKey !== loadedForKey) {
      options.value = []
      selectedLabel.value = ''
      loadedForKey = ''
      open.value = false
      return
    }
    syncSelectedFromOptions()
  },
)

onUnmounted(() => {
  abortController?.abort()
  abortController = null
})
</script>

<template>
  <div class="reading-editions">
    <span class="reading-fiche-label">Éditions :</span>
    <div class="reading-editions__control">
      <button
        type="button"
        class="reading-editions__trigger"
        :class="{ 'reading-editions__trigger--open': open }"
        :disabled="disabled"
        :aria-expanded="open"
        aria-haspopup="listbox"
        @click="toggle"
      >
        <span class="reading-editions__summary">{{ summaryLabel }}</span>
        <span class="reading-editions__chevron" aria-hidden="true">{{ open ? '▴' : '▾' }}</span>
      </button>

      <div v-if="open" class="reading-editions__panel" role="listbox" aria-label="Éditions Open Library">
        <p v-if="isLoading" class="reading-editions__status">Chargement des éditions…</p>
        <p v-else-if="loadError" class="reading-editions__error">{{ loadError }}</p>
        <div v-else class="reading-editions__list">
          <button
            v-for="option in options"
            :key="option.id"
            type="button"
            class="reading-editions__option"
            :class="{ 'reading-editions__option--current': coverMatchesCurrent(option) }"
            role="option"
            :aria-selected="coverMatchesCurrent(option)"
            @click="selectOption(option)"
          >
            <img
              :src="option.coverUrl"
              :alt="option.label"
              class="reading-editions__cover"
              loading="lazy"
            />
            <span class="reading-editions__option-label">{{ option.label }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reading-editions {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.65rem;
}

.reading-fiche-label {
  font-weight: 700;
  color: #6b4f7c;
  font-size: 0.9rem;
}

.reading-editions__control {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.reading-editions__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  box-sizing: border-box;
  padding: 0.45rem 0.65rem;
  border-radius: 8px;
  border: 1px solid rgba(213, 181, 234, 0.45);
  background: rgba(255, 255, 255, 0.75);
  color: #2c3e50;
  font-size: 0.92rem;
  font-weight: 650;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.reading-editions__trigger:hover:not(:disabled) {
  border-color: rgba(173, 129, 190, 0.65);
  background: rgba(213, 181, 234, 0.12);
}

.reading-editions__trigger--open {
  border-color: rgba(173, 129, 190, 0.85);
  background: rgba(213, 181, 234, 0.16);
}

.reading-editions__trigger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.reading-editions__summary {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reading-editions__chevron {
  flex: 0 0 auto;
  color: #ad81be;
  font-size: 0.85rem;
}

.reading-editions__panel {
  max-height: 16rem;
  overflow: auto;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.45);
  background: rgba(255, 255, 255, 0.95);
  padding: 0.35rem;
}

.reading-editions__status,
.reading-editions__error {
  margin: 0;
  padding: 0.65rem 0.5rem;
  text-align: center;
  font-size: 0.85rem;
  font-weight: 650;
}

.reading-editions__status {
  color: #6c757d;
}

.reading-editions__error {
  color: #b02a37;
}

.reading-editions__list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.reading-editions__option {
  display: grid;
  grid-template-columns: 2.4rem 1fr;
  gap: 0.55rem;
  align-items: center;
  width: 100%;
  padding: 0.35rem 0.4rem;
  border: none;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s ease;
}

.reading-editions__option:hover {
  background: rgba(213, 181, 234, 0.22);
}

.reading-editions__option--current {
  background: rgba(213, 181, 234, 0.32);
}

.reading-editions__cover {
  width: 2.4rem;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  border-radius: 3px;
  display: block;
  background: #f0e8f8;
}

.reading-editions__option-label {
  font-size: 0.82rem;
  font-weight: 700;
  color: #4a3a58;
  line-height: 1.25;
}

@media (prefers-color-scheme: dark) {
  .reading-fiche-label {
    color: #d5b5ea;
  }

  .reading-editions__trigger,
  .reading-editions__panel {
    background: rgba(35, 30, 48, 0.95);
    border-color: rgba(213, 181, 234, 0.28);
    color: #f0e8f8;
  }

  .reading-editions__summary,
  .reading-editions__option-label {
    color: #f0e8f8;
  }

  .reading-editions__status {
    color: #adb5bd;
  }

  .reading-editions__option:hover,
  .reading-editions__option--current {
    background: rgba(173, 129, 190, 0.25);
  }
}
</style>
