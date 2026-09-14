<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { NOTES_EXTENSIONS } from '../constants/notesExtensions.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  prefs: {
    type: Object,
    default: () => ({}),
  },
})

const emit = defineEmits(['close', 'update:prefs', 'configure'])

const expandedIds = ref(new Set())

const extensions = computed(() => NOTES_EXTENSIONS)

function hasSettings(id) {
  return extensions.value.find((item) => item.id === id)?.hasSettings === true
}

function isExpanded(id) {
  return expandedIds.value.has(id)
}

function toggleExpanded(id) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

function isEnabled(id) {
  return props.prefs?.[id] !== false
}

function setEnabled(id, enabled) {
  emit('update:prefs', {
    ...props.prefs,
    [id]: Boolean(enabled),
  })
}

function onToggle(id, event) {
  const enabled = Boolean(event.target.checked)
  setEnabled(id, enabled)
  if (enabled && hasSettings(id)) {
    emit('configure', id)
  }
}

function openSettings(id) {
  emit('configure', id)
}

function onKeydown(event) {
  if (!props.open) return
  if (event.key === 'Escape') emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      window.addEventListener('keydown', onKeydown)
    } else {
      window.removeEventListener('keydown', onKeydown)
      expandedIds.value = new Set()
    }
  },
)

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="notes-ext" role="dialog" aria-modal="true" aria-label="Extensions Disponibles">
      <div class="notes-ext__overlay" @click="emit('close')" />
      <div class="notes-ext__card">
        <header class="notes-ext__header">
          <div>
            <h2 class="notes-ext__title">Extensions Disponibles</h2>
            <p class="notes-ext__subtitle">Active ou désactive les modules de la page Notes.</p>
          </div>
          <button type="button" class="notes-ext__close" aria-label="Fermer" @click="emit('close')">
            ×
          </button>
        </header>

        <ul class="notes-ext__list">
          <li v-for="ext in extensions" :key="ext.id" class="notes-ext__item">
            <div class="notes-ext__row">
              <div class="notes-ext__info">
                <p class="notes-ext__name">{{ ext.name }}</p>
                <p class="notes-ext__desc">{{ ext.description }}</p>
              </div>
              <div class="notes-ext__controls">
                <button
                  v-if="hasSettings(ext.id) && isEnabled(ext.id)"
                  type="button"
                  class="notes-ext__settings"
                  title="Paramètres"
                  :aria-label="`Paramètres de ${ext.name}`"
                  @click="openSettings(ext.id)"
                >
                  ⚙
                </button>
                <label class="notes-ext__switch" :title="isEnabled(ext.id) ? 'Désactiver' : 'Activer'">
                  <input
                    type="checkbox"
                    :checked="isEnabled(ext.id)"
                    @change="onToggle(ext.id, $event)"
                  />
                  <span class="notes-ext__slider" />
                  <span class="sr-only">{{ ext.name }}</span>
                </label>
                <button
                  type="button"
                  class="notes-ext__chevron"
                  :class="{ 'notes-ext__chevron--open': isExpanded(ext.id) }"
                  :aria-expanded="isExpanded(ext.id)"
                  :aria-label="`Détails de ${ext.name}`"
                  @click="toggleExpanded(ext.id)"
                >
                  ▸
                </button>
              </div>
            </div>
            <div v-if="isExpanded(ext.id)" class="notes-ext__details">
              <p v-for="(paragraph, index) in ext.details.split('\n\n')" :key="index">
                {{ paragraph }}
              </p>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.notes-ext__overlay {
  position: fixed;
  inset: 0;
  background: rgba(40, 25, 55, 0.35);
  z-index: 100;
}

.notes-ext__card {
  position: fixed;
  z-index: 101;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(520px, calc(100vw - 2rem));
  max-height: min(80vh, 640px);
  overflow: auto;
  background: #fff;
  border-radius: 14px;
  padding: 1.1rem 1.2rem 1.2rem;
  box-shadow: 0 16px 40px rgba(60, 30, 80, 0.18);
}

.notes-ext__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.notes-ext__title {
  margin: 0;
  font-size: 1.15rem;
  color: #3b2a4a;
}

.notes-ext__subtitle {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: #6d5a7e;
}

.notes-ext__close {
  border: none;
  background: transparent;
  color: #6d5a7e;
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.1rem 0.35rem;
}

.notes-ext__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}

.notes-ext__item {
  border: 1px solid #e6ddf2;
  border-radius: 10px;
  padding: 0.7rem 0.75rem;
  background: #faf7fd;
}

.notes-ext__row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.notes-ext__info {
  flex: 1;
  min-width: 0;
}

.notes-ext__name {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 650;
  color: #3b2a4a;
}

.notes-ext__desc {
  margin: 0.25rem 0 0;
  font-size: 0.82rem;
  line-height: 1.4;
  color: #6d5a7e;
}

.notes-ext__controls {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
  padding-top: 0.1rem;
}

.notes-ext__settings {
  width: 1.6rem;
  height: 1.6rem;
  border: none;
  background: rgba(213, 181, 234, 0.2);
  color: #6d4f84;
  cursor: pointer;
  font-size: 0.85rem;
  line-height: 1;
  border-radius: 6px;
}

.notes-ext__settings:hover {
  background: rgba(213, 181, 234, 0.35);
}

.notes-ext__switch {
  position: relative;
  display: inline-block;
  width: 2.4rem;
  height: 1.35rem;
  cursor: pointer;
}

.notes-ext__switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.notes-ext__slider {
  position: absolute;
  inset: 0;
  background: #d9cfe6;
  border-radius: 999px;
  transition: background 0.15s ease;
}

.notes-ext__slider::before {
  content: '';
  position: absolute;
  width: 1.05rem;
  height: 1.05rem;
  left: 0.15rem;
  top: 0.15rem;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.15s ease;
  box-shadow: 0 1px 3px rgba(40, 25, 55, 0.2);
}

.notes-ext__switch input:checked + .notes-ext__slider {
  background: var(--color-success, #95d1aa);
}

.notes-ext__switch input:checked + .notes-ext__slider::before {
  transform: translateX(1.05rem);
}

.notes-ext__chevron {
  width: 1.6rem;
  height: 1.6rem;
  border: none;
  background: transparent;
  color: var(--color-tertiary, #72a098);
  cursor: pointer;
  font-size: 0.95rem;
  line-height: 1;
  border-radius: 6px;
  transition: transform 0.12s ease;
}

.notes-ext__chevron--open {
  transform: rotate(90deg);
}

.notes-ext__details {
  margin-top: 0.65rem;
  padding-top: 0.65rem;
  border-top: 1px solid #e6ddf2;
  display: grid;
  gap: 0.45rem;
}

.notes-ext__details p {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.5;
  color: #5a4a68;
  white-space: pre-line;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
