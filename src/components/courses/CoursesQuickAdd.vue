<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  suggestions: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['query', 'submit', 'pick'])

const value = ref('')
const open = ref(false)
const activeIndex = ref(-1)

const hasSuggestions = computed(() => open.value && props.suggestions.length > 0)

watch(value, (v) => {
  emit('query', v)
  open.value = String(v).trim().length > 0
  activeIndex.value = -1
})

function submit() {
  const nom = value.value.trim()
  if (!nom || props.disabled) return
  emit('submit', nom)
  value.value = ''
  open.value = false
}

function pick(item) {
  emit('pick', item)
  value.value = ''
  open.value = false
}

function onBlur() {
  window.setTimeout(() => {
    open.value = false
  }, 150)
}

function onKeydown(event) {
  if (!hasSuggestions.value) {
    if (event.key === 'Enter') {
      event.preventDefault()
      submit()
    }
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, props.suggestions.length - 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    if (activeIndex.value >= 0) pick(props.suggestions[activeIndex.value])
    else submit()
  } else if (event.key === 'Escape') {
    open.value = false
  }
}
</script>

<template>
  <div class="courses-quick">
    <label class="courses-quick__label" for="courses-quick-input">Ajout rapide</label>
    <div class="courses-quick__row">
      <input
        id="courses-quick-input"
        v-model="value"
        type="text"
        class="courses-quick__input"
        placeholder="Ex. lait, éponge, brosse à dents…"
        autocomplete="off"
        :disabled="disabled"
        @keydown="onKeydown"
        @focus="open = String(value).trim().length > 0"
        @blur="onBlur"
      />
      <button
        type="button"
        class="courses-quick__btn"
        :disabled="disabled || !value.trim()"
        @click="submit"
      >
        Ajouter
      </button>
    </div>
    <ul v-if="hasSuggestions" class="courses-quick__list" role="listbox">
      <li
        v-for="(item, index) in suggestions"
        :key="`${item.source}-${item.nom}`"
        role="option"
        :aria-selected="index === activeIndex"
        class="courses-quick__item"
        :class="{ 'is-active': index === activeIndex }"
        @mousedown.prevent="pick(item)"
      >
        <span>{{ item.nom }}</span>
        <span class="courses-quick__src">{{ item.source === 'historique' ? 'historique' : 'liste' }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.courses-quick {
  position: relative;
  margin-bottom: 1rem;
}

.courses-quick__label {
  display: block;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-text-light);
  margin-bottom: 0.35rem;
}

.courses-quick__row {
  display: flex;
  gap: 0.5rem;
}

.courses-quick__input {
  flex: 1;
  min-width: 0;
  min-height: 48px;
  padding: 0.65rem 0.9rem;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
  background: var(--color-background);
  color: var(--color-text);
  font-size: 1rem;
}

.courses-quick__btn {
  flex-shrink: 0;
  min-height: 48px;
  min-width: 5.5rem;
  padding: 0 1rem;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  color: #2c3e50;
  font-weight: 800;
  cursor: pointer;
}

.courses-quick__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.courses-quick__list {
  position: absolute;
  z-index: 20;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  margin: 0;
  padding: 0.35rem;
  list-style: none;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12);
  max-height: 240px;
  overflow: auto;
}

.courses-quick__item {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.7rem 0.75rem;
  border-radius: 8px;
  cursor: pointer;
  min-height: 44px;
  align-items: center;
}

.courses-quick__item.is-active,
.courses-quick__item:hover {
  background: color-mix(in srgb, var(--color-primary) 28%, transparent);
}

.courses-quick__src {
  font-size: 0.72rem;
  color: var(--color-text-light);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
</style>
