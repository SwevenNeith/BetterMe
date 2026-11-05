<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { NOTES_EXTENSIONS } from '../../constants/notes/notesExtensions.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  prefs: {
    type: Object,
    default: () => ({}),
  },
})

const emit = defineEmits(['close', 'update:prefs', 'configure'])

const expandedIds = ref(new Set())

const rootExtensions = computed(() => NOTES_EXTENSIONS.filter((ext) => !ext.parentId))

function childrenOf(parentId) {
  return NOTES_EXTENSIONS.filter((ext) => ext.parentId === parentId)
}

function hasSettings(id) {
  return NOTES_EXTENSIONS.find((item) => item.id === id)?.hasSettings === true
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
  const ext = NOTES_EXTENSIONS.find((item) => item.id === id)
  if (ext?.parentId && props.prefs?.[ext.parentId] === false) return false
  return props.prefs?.[id] !== false
}

function setEnabled(id, enabled) {
  const next = {
    ...props.prefs,
    [id]: Boolean(enabled),
  }
  // Désactiver les enfants si le parent s’éteint
  if (!enabled) {
    for (const child of childrenOf(id)) next[child.id] = false
  }
  emit('update:prefs', next)
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
          <li v-for="ext in rootExtensions" :key="ext.id" class="notes-ext__item">
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

            <ul v-if="isEnabled(ext.id) && childrenOf(ext.id).length" class="notes-ext__children">
              <li v-for="child in childrenOf(ext.id)" :key="child.id" class="notes-ext__child">
                <div class="notes-ext__row">
                  <div class="notes-ext__info">
                    <p class="notes-ext__name">{{ child.name }}</p>
                    <p class="notes-ext__desc">{{ child.description }}</p>
                  </div>
                  <div class="notes-ext__controls">
                    <label
                      class="notes-ext__switch"
                      :title="isEnabled(child.id) ? 'Désactiver' : 'Activer'"
                    >
                      <input
                        type="checkbox"
                        :checked="prefs?.[child.id] === true"
                        @change="onToggle(child.id, $event)"
                      />
                      <span class="notes-ext__slider" />
                      <span class="sr-only">{{ child.name }}</span>
                    </label>
                    <button
                      type="button"
                      class="notes-ext__chevron"
                      :class="{ 'notes-ext__chevron--open': isExpanded(child.id) }"
                      :aria-expanded="isExpanded(child.id)"
                      :aria-label="`Détails de ${child.name}`"
                      @click="toggleExpanded(child.id)"
                    >
                      ▸
                    </button>
                  </div>
                </div>
                <div v-if="isExpanded(child.id)" class="notes-ext__details">
                  <p v-for="(paragraph, index) in child.details.split('\n\n')" :key="index">
                    {{ paragraph }}
                  </p>
                </div>
              </li>
            </ul>
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
  width: min(560px, calc(100vw - 2rem));
  max-height: min(80vh, 720px);
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
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.notes-ext__item {
  border: 1px solid #eadff2;
  border-radius: 12px;
  padding: 0.65rem 0.75rem;
}

.notes-ext__row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.notes-ext__name {
  margin: 0;
  font-weight: 650;
  color: #3b2a4a;
  font-size: 0.95rem;
}

.notes-ext__desc {
  margin: 0.2rem 0 0;
  font-size: 0.82rem;
  color: #6d5a7e;
}

.notes-ext__controls {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.notes-ext__settings {
  border: none;
  background: #f4ecf8;
  border-radius: 8px;
  width: 2rem;
  height: 2rem;
  cursor: pointer;
  color: #5a3d72;
}

.notes-ext__chevron {
  border: none;
  background: transparent;
  cursor: pointer;
  color: #8b6fa3;
  transition: transform 0.15s ease;
}

.notes-ext__chevron--open {
  transform: rotate(90deg);
}

.notes-ext__details {
  margin-top: 0.55rem;
  padding-top: 0.55rem;
  border-top: 1px solid #f0e6f6;
  font-size: 0.82rem;
  color: #5a4a68;
  white-space: pre-wrap;
}

.notes-ext__details p {
  margin: 0 0 0.45rem;
}

.notes-ext__children {
  list-style: none;
  margin: 0.55rem 0 0;
  padding: 0.45rem 0 0 0.65rem;
  border-left: 2px solid #e6d8f0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.notes-ext__child {
  padding: 0.35rem 0.25rem;
}

.notes-ext__switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
}

.notes-ext__switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.notes-ext__slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: #d9cce4;
  border-radius: 999px;
  transition: 0.15s;
}

.notes-ext__slider::before {
  position: absolute;
  content: '';
  height: 16px;
  width: 16px;
  left: 3px;
  top: 3px;
  background: white;
  border-radius: 50%;
  transition: 0.15s;
}

.notes-ext__switch input:checked + .notes-ext__slider {
  background: #7b5ea7;
}

.notes-ext__switch input:checked + .notes-ext__slider::before {
  transform: translateX(18px);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
</style>
