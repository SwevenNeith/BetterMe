<script setup>
import { computed, ref, watch } from 'vue'
import { supabase } from '../../lib/supabase.js'
import { WORKSPACE_PAGE_OPTIONS } from '../../constants/workspace/workspacePages.js'
import { resolveSessionUser } from '../../utils/auth/sessionUser.js'
import {
  loadPageVisibility,
  getPageDisplayLabel,
  isPageVisible,
  mergePageVisibility,
} from '../../services/settings/pageVisibility.js'

const props = defineProps({
  open: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'select'])

const visibility = ref(mergePageVisibility(null))
const searchQuery = ref('')

async function refreshVisibility() {
  try {
    const user = await resolveSessionUser()
    if (!user?.id) {
      visibility.value = mergePageVisibility(null)
      return
    }
    visibility.value = await loadPageVisibility(supabase, user.id)
  } catch (err) {
    console.error(err)
    visibility.value = mergePageVisibility(null)
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) {
      searchQuery.value = ''
      return
    }
    void refreshVisibility()
  },
  { immediate: true },
)

const options = computed(() => {
  const pages = WORKSPACE_PAGE_OPTIONS.filter((page) => {
    if (page.alwaysVisible) return true
    const visibilityId = page.visibilityId || page.id
    return isPageVisible(visibilityId, visibility.value)
  }).map((page) => {
    const visibilityId = page.visibilityId || page.id
    return {
      ...page,
      label: page.alwaysVisible
        ? page.defaultLabel
        : getPageDisplayLabel(visibilityId, visibility.value, page.defaultLabel),
    }
  })

  pages.sort((a, b) =>
    String(a.label || '').localeCompare(String(b.label || ''), 'fr', {
      sensitivity: 'base',
    }),
  )
  return pages
})

const filteredOptions = computed(() => {
  const q = String(searchQuery.value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  if (!q) return options.value
  return options.value.filter((page) => {
    const label = String(page.label || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
    return label.includes(q)
  })
})

function onSelect(page) {
  emit('select', {
    pageId: page.id,
    path: page.path,
    label: page.label,
  })
  emit('close')
}

function onOverlayClick() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <template v-if="open">
      <div class="workspace-picker__overlay" @click="onOverlayClick" />
      <div
        class="workspace-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Ajouter une page au plan de travail"
      >
        <header class="workspace-picker__header">
          <h2 class="workspace-picker__title">Ajouter une page</h2>
          <button type="button" class="workspace-picker__close" aria-label="Fermer" @click="emit('close')">
            ✕
          </button>
        </header>
        <p class="workspace-picker__hint">Choisis une page visible dans ton menu.</p>
        <label class="workspace-picker__search">
          <span class="sr-only">Rechercher une page</span>
          <input
            v-model="searchQuery"
            type="search"
            class="workspace-picker__search-input"
            placeholder="Rechercher une page…"
            autocomplete="off"
          />
        </label>
        <div v-if="filteredOptions.length" class="workspace-picker__grid">
          <button
            v-for="page in filteredOptions"
            :key="page.id"
            type="button"
            class="workspace-picker__item"
            @click="onSelect(page)"
          >
            <span class="workspace-picker__item-label">{{ page.label }}</span>
          </button>
        </div>
        <p v-else class="workspace-picker__empty">Aucune page ne correspond à ta recherche.</p>
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
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

.workspace-picker__overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(44, 36, 52, 0.4);
}

.workspace-picker {
  position: fixed;
  z-index: 81;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(92vw, 28rem);
  max-height: min(80vh, 32rem);
  overflow: auto;
  padding: 1.1rem;
  border-radius: 16px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 44px rgba(61, 47, 74, 0.18);
}

.workspace-picker__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.workspace-picker__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: #6b4f7c;
}

.workspace-picker__close {
  border: none;
  background: transparent;
  color: #6c757d;
  font-size: 1.1rem;
  cursor: pointer;
}

.workspace-picker__hint {
  margin: 0.45rem 0 0.65rem;
  font-size: 0.85rem;
  color: #8b7a96;
}

.workspace-picker__search {
  display: block;
  margin-bottom: 0.85rem;
}

.workspace-picker__search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.65rem 0.8rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.45);
  background: rgba(255, 255, 255, 0.92);
  color: #4a3b58;
  font: inherit;
  font-size: 0.9rem;
}

.workspace-picker__search-input::placeholder {
  color: #9a8aa8;
}

.workspace-picker__search-input:focus {
  outline: none;
  border-color: rgba(173, 129, 190, 0.7);
  box-shadow: 0 0 0 3px rgba(213, 181, 234, 0.28);
}

.workspace-picker__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
}

.workspace-picker__item {
  padding: 0.75rem 0.85rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.4);
  background: rgba(213, 181, 234, 0.12);
  color: #6b4f7c;
  font-weight: 800;
  font-size: 0.9rem;
  text-align: left;
  cursor: pointer;
}

.workspace-picker__item:hover {
  background: rgba(173, 129, 190, 0.22);
  border-color: rgba(173, 129, 190, 0.5);
}

.workspace-picker__empty {
  margin: 0.35rem 0 0;
  font-size: 0.88rem;
  color: #8b7a96;
  text-align: center;
}

@media (prefers-color-scheme: dark) {
  .workspace-picker {
    background: rgba(35, 30, 48, 0.98);
    border-color: rgba(213, 181, 234, 0.22);
  }

  .workspace-picker__title {
    color: #e8dcf5;
  }

  .workspace-picker__search-input {
    background: rgba(25, 20, 35, 0.9);
    border-color: rgba(213, 181, 234, 0.28);
    color: #f0e8f8;
  }

  .workspace-picker__item {
    background: rgba(61, 47, 74, 0.65);
    border-color: rgba(213, 181, 234, 0.28);
    color: #e8dcf5;
  }

  .workspace-picker__empty {
    color: #adb5bd;
  }
}
</style>
