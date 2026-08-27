<script setup>
defineProps({
  node: { type: Object, required: true },
  depth: { type: Number, default: 0 },
  selectedNoteId: { type: String, default: null },
  isFolderExpanded: { type: Function, required: true },
})

defineEmits([
  'select-note',
  'toggle-folder',
  'create-note',
  'create-folder',
  'rename-folder',
  'rename-note',
  'delete-note',
  'delete-folder',
])
</script>

<template>
  <div class="notes-tree-node" :style="{ '--depth': depth }">
    <template v-if="node.type === 'folder'">
      <div class="notes-tree-node__row notes-tree-node__row--folder">
        <button
          type="button"
          class="notes-tree-node__main"
          :aria-expanded="isFolderExpanded(node.id)"
          @click="$emit('toggle-folder', node.id)"
        >
          <span class="notes-tree-node__chevron" :class="{ 'notes-tree-node__chevron--open': isFolderExpanded(node.id) }">
            ▸
          </span>
          <svg
            class="notes-tree-node__icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span class="notes-tree-node__label">{{ node.name }}</span>
        </button>
        <div class="notes-tree-node__actions">
          <button
            type="button"
            title="Nouvelle note"
            aria-label="Nouvelle note"
            @click.stop="$emit('create-note', node.id)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="11" x2="12" y2="17" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
          </button>
          <button
            type="button"
            title="Sous-dossier"
            aria-label="Créer un sous-dossier"
            @click.stop="$emit('create-folder', node.id)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              <line x1="12" y1="11" x2="12" y2="17" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
          </button>
          <button
            type="button"
            title="Renommer"
            aria-label="Renommer le dossier"
            @click.stop="$emit('rename-folder', node)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3 2.12 2.12 0 0 1 0 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
          <button
            type="button"
            title="Supprimer"
            aria-label="Supprimer le dossier"
            @click.stop="$emit('delete-folder', node.id)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </button>
        </div>
      </div>
      <div v-if="isFolderExpanded(node.id)" class="notes-tree-node__children">
        <NotesTreeNode
          v-for="child in node.children"
          :key="`${child.type}-${child.id}`"
          :node="child"
          :depth="depth + 1"
          :selected-note-id="selectedNoteId"
          :is-folder-expanded="isFolderExpanded"
          @select-note="$emit('select-note', $event)"
          @toggle-folder="$emit('toggle-folder', $event)"
          @create-note="$emit('create-note', $event)"
          @create-folder="$emit('create-folder', $event)"
          @rename-folder="$emit('rename-folder', $event)"
          @rename-note="$emit('rename-note', $event)"
          @delete-note="$emit('delete-note', $event)"
          @delete-folder="$emit('delete-folder', $event)"
        />
      </div>
    </template>

    <template v-else>
      <div
        class="notes-tree-node__row notes-tree-node__row--note"
        :class="{ 'notes-tree-node__row--active': selectedNoteId === node.id }"
      >
        <button type="button" class="notes-tree-node__main" @click="$emit('select-note', node.id)">
          <span class="notes-tree-node__chevron notes-tree-node__chevron--spacer" />
          <svg
            class="notes-tree-node__icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span class="notes-tree-node__label">{{ node.title }}</span>
        </button>
        <div class="notes-tree-node__actions">
          <button
            type="button"
            title="Renommer"
            aria-label="Renommer la note"
            @click.stop="$emit('rename-note', node)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3 2.12 2.12 0 0 1 0 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
          <button
            type="button"
            title="Supprimer"
            aria-label="Supprimer la note"
            @click.stop="$emit('delete-note', node.id)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.notes-tree-node__row {
  display: flex;
  align-items: center;
  gap: 0.1rem;
  border-radius: 6px;
  padding-left: calc(var(--depth) * 0.7rem);
}

.notes-tree-node__row:hover {
  background: rgba(255, 255, 255, 0.45);
}

.notes-tree-node__row--active {
  background: rgba(213, 181, 234, 0.55);
}

.notes-tree-node__main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  border: none;
  background: transparent;
  text-align: left;
  padding: 0.18rem 0.15rem;
  cursor: pointer;
  color: #3b2a4a;
  font: inherit;
  font-size: 0.8rem;
}

.notes-tree-node__chevron {
  width: 0.9rem;
  flex-shrink: 0;
  display: inline-flex;
  justify-content: center;
  transition: transform 0.12s ease;
  color: #7a668c;
  font-size: 0.75rem;
}

.notes-tree-node__chevron--open {
  transform: rotate(90deg);
}

.notes-tree-node__chevron--spacer {
  visibility: hidden;
}

.notes-tree-node__icon {
  width: 0.8rem;
  height: 0.8rem;
  flex-shrink: 0;
  color: #7a668c;
}

.notes-tree-node__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notes-tree-node__actions {
  display: none;
  gap: 0.1rem;
  padding-right: 0.2rem;
}

.notes-tree-node__row:hover .notes-tree-node__actions {
  display: inline-flex;
}

.notes-tree-node__actions button {
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 4px;
  padding: 0.2rem;
  color: #6d5a7e;
  line-height: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.notes-tree-node__actions button svg {
  width: 0.85rem;
  height: 0.85rem;
  display: block;
}

.notes-tree-node__actions button:hover {
  background: rgba(255, 255, 255, 0.7);
  color: #4a3560;
}

.notes-tree-node__children {
  display: grid;
}
</style>
