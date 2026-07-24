<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  collections: {
    type: Array,
    default: () => [],
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  placeholder: {
    type: String,
    default: 'WishList, En cours…',
  },
  autofocus: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue', 'commit', 'cancel'])

const open = ref(false)
const inputValue = ref(props.modelValue ?? '')
const inputRef = ref(null)
const rootRef = ref(null)

watch(
  () => props.modelValue,
  (value) => {
    if (document.activeElement !== inputRef.value) {
      inputValue.value = value ?? ''
    }
  },
)

const collectionNames = computed(() =>
  (props.collections ?? []).map((item) => (typeof item === 'string' ? item : item?.name)).filter(Boolean),
)

const filteredCollections = computed(() => {
  const query = inputValue.value.trim().toLowerCase()
  if (!query) return collectionNames.value
  return collectionNames.value.filter((name) => name.toLowerCase().includes(query))
})

const exactMatch = computed(() => {
  const query = inputValue.value.trim().toLowerCase()
  if (!query) return null
  return collectionNames.value.find((name) => name.toLowerCase() === query) ?? null
})

const showCreateHint = computed(() => {
  const query = inputValue.value.trim()
  return Boolean(query) && !exactMatch.value
})

function openDropdown() {
  if (props.disabled) return
  open.value = true
}

function closeDropdown() {
  open.value = false
}

function selectCollection(name) {
  inputValue.value = name
  emit('update:modelValue', name)
  closeDropdown()
  emit('commit', name)
}

function commitCurrent() {
  const trimmed = inputValue.value.trim()
  if (!trimmed) {
    inputValue.value = ''
    emit('update:modelValue', '')
    closeDropdown()
    emit('commit', '')
    return
  }

  const matched = exactMatch.value
  const finalName = matched || trimmed
  inputValue.value = finalName
  emit('update:modelValue', finalName)
  closeDropdown()
  emit('commit', finalName)
}

function onInput() {
  emit('update:modelValue', inputValue.value)
  openDropdown()
}

function onFocus() {
  openDropdown()
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    inputValue.value = props.modelValue ?? ''
    closeDropdown()
    emit('cancel')
    return
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    commitCurrent()
  }
}

function onBlur() {
  // Laisse le temps d'un clic dans la liste
  window.setTimeout(() => {
    if (!rootRef.value?.contains(document.activeElement)) {
      commitCurrent()
    }
  }, 120)
}

function onDocumentPointerDown(event) {
  if (!open.value) return
  if (rootRef.value?.contains(event.target)) return
  commitCurrent()
}

onMounted(async () => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  if (props.autofocus) {
    await nextTick()
    inputRef.value?.focus()
    inputRef.value?.select?.()
  }
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
})
</script>

<template>
  <div ref="rootRef" class="reading-collection-combo" :class="{ 'reading-collection-combo--open': open }">
    <div class="reading-collection-combo__row">
      <input
        ref="inputRef"
        v-model="inputValue"
        type="text"
        class="reading-fiche-input reading-collection-combo__input"
        maxlength="120"
        :placeholder="placeholder"
        :disabled="disabled"
        autocomplete="off"
        @input="onInput"
        @focus="onFocus"
        @keydown="onKeydown"
        @blur="onBlur"
      />
      <button
        type="button"
        class="reading-collection-combo__toggle"
        :disabled="disabled"
        :aria-expanded="open"
        aria-label="Ouvrir les collections"
        @mousedown.prevent
        @click="open ? closeDropdown() : openDropdown()"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </div>

    <div v-if="open" class="reading-collection-combo__menu" role="listbox">
      <button
        v-for="name in filteredCollections"
        :key="name"
        type="button"
        class="reading-collection-combo__option"
        :class="{ 'reading-collection-combo__option--active': exactMatch === name }"
        role="option"
        @mousedown.prevent
        @click="selectCollection(name)"
      >
        {{ name }}
      </button>

      <p v-if="showCreateHint" class="reading-collection-combo__create">
        Créer « {{ inputValue.trim() }} »
      </p>
      <p v-else-if="!filteredCollections.length" class="reading-collection-combo__empty">
        Aucune collection
      </p>
    </div>
  </div>
</template>

<style scoped>
.reading-collection-combo {
  position: relative;
  width: 100%;
}

.reading-collection-combo__row {
  display: flex;
  align-items: stretch;
  gap: 0.35rem;
}

.reading-collection-combo__input {
  flex: 1;
  min-width: 0;
}

.reading-collection-combo__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.35rem;
  flex-shrink: 0;
  border: 1px solid rgba(173, 129, 190, 0.35);
  border-radius: 8px;
  background: #fff;
  color: #6b4f7c;
  cursor: pointer;
}

.reading-collection-combo__toggle svg {
  width: 1rem;
  height: 1rem;
}

.reading-collection-combo__toggle:hover:not(:disabled) {
  background: rgba(213, 181, 234, 0.25);
}

.reading-collection-combo__menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + 0.3rem);
  left: 0;
  right: 0;
  max-height: 12rem;
  overflow: auto;
  padding: 0.35rem;
  border-radius: 10px;
  border: 1px solid rgba(173, 129, 190, 0.4);
  background: #fff;
  box-shadow: 0 10px 28px rgba(61, 47, 74, 0.14);
}

.reading-collection-combo__option {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.5rem 0.65rem;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: #2c2434;
  font-size: 0.9rem;
  cursor: pointer;
}

.reading-collection-combo__option:hover,
.reading-collection-combo__option--active {
  background: rgba(213, 181, 234, 0.35);
}

.reading-collection-combo__create,
.reading-collection-combo__empty {
  margin: 0.25rem 0.35rem 0.15rem;
  font-size: 0.78rem;
  color: #8b7a96;
  font-style: italic;
}

@media (prefers-color-scheme: dark) {
  .reading-collection-combo__toggle {
    background: rgba(35, 30, 48, 0.95);
    border-color: rgba(173, 129, 190, 0.4);
    color: #e8dcf5;
  }

  .reading-collection-combo__toggle:hover:not(:disabled) {
    background: rgba(173, 129, 190, 0.28);
  }

  .reading-collection-combo__menu {
    background: #2a2438;
    border-color: rgba(173, 129, 190, 0.4);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
  }

  .reading-collection-combo__option {
    color: #f0e8f8;
  }

  .reading-collection-combo__option:hover,
  .reading-collection-combo__option--active {
    background: rgba(173, 129, 190, 0.3);
  }

  .reading-collection-combo__create,
  .reading-collection-combo__empty {
    color: #c5b8d2;
  }
}
</style>
