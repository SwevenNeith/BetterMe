<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  nodes: {
    type: Array,
    default: () => [],
  },
  /** Niveaux ouverts par défaut (tous). */
  defaultExpanded: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits(['select'])

/** @type {import('vue').Ref<Record<string, boolean>>} */
const expandedById = ref({})

function syncExpanded(nodes, map) {
  for (const node of nodes ?? []) {
    if (!(node.id in map)) {
      map[node.id] = props.defaultExpanded
    }
    if (node.children?.length) {
      syncExpanded(node.children, map)
    }
  }
}

watch(
  () => props.nodes,
  (nodes) => {
    const next = { ...expandedById.value }
    syncExpanded(nodes, next)
    expandedById.value = next
  },
  { immediate: true, deep: true },
)

function isExpanded(id) {
  return expandedById.value[id] !== false
}

function toggle(id) {
  expandedById.value = {
    ...expandedById.value,
    [id]: !isExpanded(id),
  }
}

function onSelect(node) {
  emit('select', node)
}
</script>

<template>
  <ul v-if="nodes?.length" class="notes-toc__list">
    <li v-for="node in nodes" :key="node.id" class="notes-toc__item">
      <div class="notes-toc__row">
        <button
          v-if="node.children?.length"
          type="button"
          class="notes-toc__chevron"
          :class="{ 'notes-toc__chevron--open': isExpanded(node.id) }"
          :aria-expanded="isExpanded(node.id)"
          :aria-label="isExpanded(node.id) ? 'Replier la section' : 'Déplier la section'"
          @click.stop="toggle(node.id)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>
        <span v-else class="notes-toc__chevron-spacer" aria-hidden="true" />

        <button
          type="button"
          class="notes-toc__link"
          :class="`notes-toc__link--h${node.level}`"
          :title="node.text"
          @click="onSelect(node)"
        >
          {{ node.text }}
        </button>
      </div>

      <NotesTableOfContentsTree
        v-if="node.children?.length && isExpanded(node.id)"
        class="notes-toc__children"
        :nodes="node.children"
        :default-expanded="defaultExpanded"
        @select="onSelect"
      />
    </li>
  </ul>
</template>

<style scoped>
.notes-toc__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.notes-toc__children {
  margin-left: 0.85rem;
  padding-left: 0.35rem;
  border-left: 1px solid rgba(173, 129, 190, 0.28);
}

.notes-toc__row {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  min-width: 0;
}

.notes-toc__chevron,
.notes-toc__chevron-spacer {
  flex-shrink: 0;
  width: 1.35rem;
  height: 1.35rem;
}

.notes-toc__chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #ad81be;
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease;
}

.notes-toc__chevron:hover {
  background: rgba(213, 181, 234, 0.22);
}

.notes-toc__chevron--open {
  transform: rotate(90deg);
}

.notes-toc__chevron svg {
  width: 0.9rem;
  height: 0.9rem;
}

.notes-toc__link {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  text-align: left;
  padding: 0.35rem 0.45rem;
  border-radius: 8px;
  font-size: 0.88rem;
  font-weight: 650;
  color: #4a5560;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: background 0.15s ease, color 0.15s ease;
}

.notes-toc__link:hover {
  background: rgba(213, 181, 234, 0.2);
  color: #ad81be;
}

.notes-toc__link--h1 {
  font-size: 0.95rem;
  font-weight: 800;
}

.notes-toc__link--h2 {
  font-weight: 750;
}

.notes-toc__link--h3,
.notes-toc__link--h4,
.notes-toc__link--h5,
.notes-toc__link--h6 {
  font-weight: 600;
  font-size: 0.84rem;
  color: #6c757d;
}

@media (prefers-color-scheme: dark) {
  .notes-toc__link {
    color: #e9ecef;
  }

  .notes-toc__link--h3,
  .notes-toc__link--h4,
  .notes-toc__link--h5,
  .notes-toc__link--h6 {
    color: #adb5bd;
  }

  .notes-toc__children {
    border-left-color: rgba(213, 181, 234, 0.18);
  }
}
</style>
