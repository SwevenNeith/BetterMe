<script setup>
import { computed } from 'vue'
import { getTodoItemColorClass } from '../constants/todoOptions.js'
import '../styles/todo-frequency.css'

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
  draggable: {
    type: Boolean,
    default: false,
  },
  dragging: {
    type: Boolean,
    default: false,
  },
  compact: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['toggle', 'increment', 'decrement', 'edit', 'delete', 'dragstart', 'dragover', 'drop', 'dragend'])

const hasQuantite = computed(
  () =>
    props.item.occurrenceQuantiteCible != null && Number(props.item.occurrenceQuantiteCible) >= 1,
)

const quantiteLabel = computed(() => {
  if (!hasQuantite.value) return ''
  const actuelle = props.item.occurrenceQuantiteActuelle ?? 0
  const cible = props.item.occurrenceQuantiteCible
  return `${actuelle}/${cible}`
})

const itemColorClass = computed(() => getTodoItemColorClass(props.item))

function hasDescription(text) {
  return String(text ?? '').trim().length > 0
}

function onCardDragStart(event) {
  if (!props.draggable) return
  if (event.target?.closest('button, input, label, .todo-item-action')) {
    event.preventDefault()
    return
  }
  emit('dragstart', event)
}

function onCardDragEnd(event) {
  if (!props.draggable) return
  emit('dragend', event)
}
</script>

<template>
  <article
    class="todo-item-card"
    :class="[
      itemColorClass,
      {
        'todo-item-card--done': item.occurrenceDone,
        'todo-item-card--dragging': dragging,
        'todo-item-card--compact': compact,
        'todo-item-card--quantite': hasQuantite,
      },
    ]"
    :draggable="draggable"
    @dragstart="onCardDragStart"
    @dragend="onCardDragEnd"
    @dragover="draggable ? emit('dragover', $event) : undefined"
    @drop="draggable ? emit('drop', $event) : undefined"
  >
    <div v-if="hasQuantite" class="todo-item-quantite" role="group" :aria-label="`Progression : ${quantiteLabel}`">
      <button
        type="button"
        class="todo-item-quantite__btn"
        title="Diminuer"
        aria-label="Diminuer la quantité"
        :disabled="(item.occurrenceQuantiteActuelle ?? 0) <= 0"
        @click.stop="emit('decrement')"
      >
        −
      </button>
      <span class="todo-item-quantite__value">{{ quantiteLabel }}</span>
      <button
        type="button"
        class="todo-item-quantite__btn"
        title="Augmenter"
        aria-label="Augmenter la quantité"
        @click.stop="emit('increment')"
      >
        +
      </button>
    </div>

    <div class="todo-item-main">
      <label v-if="!hasQuantite" class="todo-item-check">
        <input
          type="checkbox"
          class="todo-item-check__input"
          :checked="item.occurrenceDone"
          :aria-label="
            item.occurrenceDone
              ? `Marquer « ${item.nom} » comme non fait`
              : `Marquer « ${item.nom} » comme fait`
          "
          @change="emit('toggle')"
        />
      </label>

      <div class="todo-item-content">
        <div class="todo-item-title-row">
          <h2 class="todo-item-title">{{ item.nom }}</h2>
          <span v-if="item.is_promesse" class="todo-item-badge">Promesse</span>
        </div>
        <p v-if="hasDescription(item.description)" class="todo-item-description">
          {{ item.description }}
        </p>
      </div>

      <div class="todo-item-actions">
        <button
          type="button"
          class="todo-item-action"
          title="Modifier"
          aria-label="Modifier l'élément"
          @click.stop="emit('edit')"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
        <button
          type="button"
          class="todo-item-action todo-item-action--danger"
          title="Supprimer"
          aria-label="Supprimer l'élément"
          @click.stop="emit('delete')"
        >
          ✕
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.todo-item-card {
  display: flex;
  align-items: stretch;
  border-radius: 12px;
  border: 1px solid var(--todo-freq-border, rgba(213, 181, 234, 0.3));
  border-left-width: 4px;
  border-left-color: var(--todo-freq-accent, #ad81be);
  background: var(--todo-freq-bg, rgba(213, 181, 234, 0.08));
  padding: 0.75rem 0.85rem;
  transition:
    opacity 0.15s ease,
    box-shadow 0.15s ease;
}

.todo-item-card--quantite {
  padding: 0;
  cursor: grab;
}

.todo-item-card--quantite:active {
  cursor: grabbing;
}

.todo-item-card--dragging {
  opacity: 0.55;
  cursor: grabbing;
}

.todo-item-card[draggable='true']:not(.todo-item-card--quantite) {
  cursor: grab;
}

.todo-item-card[draggable='true']:not(.todo-item-card--quantite):active {
  cursor: grabbing;
}

.todo-item-card--done {
  opacity: 0.72;
}

.todo-item-card--compact {
  padding: 0.5rem 0.45rem;
}

.todo-item-card--compact.todo-item-card--quantite {
  padding: 0;
}

.todo-item-card--compact .todo-item-main {
  gap: 0.35rem;
}

.todo-item-card--compact.todo-item-card--quantite .todo-item-main {
  padding: 0.45rem 0.4rem 0.45rem 0.35rem;
}

.todo-item-card--compact .todo-item-quantite {
  padding: 0.4rem 0.3rem;
}

.todo-item-card--compact .todo-item-title {
  font-size: 0.8rem;
  line-height: 1.3;
}

.todo-item-card--compact .todo-item-badge {
  font-size: 0.58rem;
  padding: 0.1rem 0.35rem;
}

.todo-item-card--compact .todo-item-check__input {
  width: 0.95rem;
  height: 0.95rem;
}

.todo-item-card--compact .todo-item-actions {
  flex-direction: row;
  gap: 0.2rem;
}

.todo-item-card--compact .todo-item-action {
  width: 1.45rem;
  height: 1.45rem;
  font-size: 0.75rem;
}

.todo-item-card--compact .todo-item-action svg {
  width: 0.75rem;
  height: 0.75rem;
}

.todo-item-main {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  flex: 1;
  min-width: 0;
}

.todo-item-card--quantite .todo-item-main {
  padding: 0.75rem 0.85rem 0.75rem 0.55rem;
}

.todo-item-quantite {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  align-self: stretch;
  gap: 0.35rem;
  padding: 0.55rem 0.4rem;
  border-radius: 12px 0 0 12px;
  background: color-mix(in srgb, var(--todo-freq-accent, #ad81be) 16%, white);
  border-right: 1px solid var(--todo-freq-border, rgba(213, 181, 234, 0.22));
}

.todo-item-quantite__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.85rem;
  height: 1.85rem;
  flex-shrink: 0;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.7);
  color: #ad81be;
  font-size: 1rem;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
}

.todo-item-quantite__btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.todo-item-quantite__btn:not(:disabled):hover {
  background: #fff;
}

.todo-item-quantite__value {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 2.4rem;
  text-align: center;
  font-size: 0.82rem;
  font-weight: 800;
  color: #2c3e50;
  line-height: 1.2;
}

.todo-item-card--done .todo-item-quantite__value {
  color: #72a098;
}

.todo-item-check {
  flex-shrink: 0;
  display: flex;
  padding-top: 0.15rem;
  cursor: pointer;
}

.todo-item-check__input {
  width: 1.1rem;
  height: 1.1rem;
  accent-color: var(--todo-freq-accent, #ad81be);
  cursor: pointer;
}

.todo-item-content {
  flex: 1;
  min-width: 0;
}

.todo-item-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
}

.todo-item-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: #2c3e50;
  line-height: 1.35;
  word-break: break-word;
}

.todo-item-card--done .todo-item-title {
  color: #8c98a4;
  text-decoration: line-through;
}

.todo-item-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--todo-freq-accent, #d4a06a);
  background: color-mix(in srgb, var(--todo-freq-accent, #d4a06a) 24%, white);
}

.todo-item-card--compact .todo-item-description {
  margin-top: 0.2rem;
  font-size: 0.75rem;
  line-height: 1.35;
}

.todo-item-description {
  margin: 0.35rem 0 0;
  font-size: 0.88rem;
  color: #6c757d;
  line-height: 1.45;
  word-break: break-word;
}

.todo-item-card--done .todo-item-description {
  text-decoration: line-through;
}

.todo-item-actions {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.todo-item-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: rgba(213, 181, 234, 0.15);
  color: #ad81be;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s ease;
}

.todo-item-action svg {
  width: 0.9rem;
  height: 0.9rem;
}

.todo-item-action:hover {
  background: rgba(213, 181, 234, 0.28);
}

.todo-item-action--danger {
  color: #c0392b;
  background: rgba(192, 57, 43, 0.1);
}

.todo-item-action--danger:hover {
  background: rgba(192, 57, 43, 0.18);
}

@media (prefers-color-scheme: dark) {
  .todo-item-card {
    background: var(--todo-freq-bg, rgba(213, 181, 234, 0.08));
    border-color: var(--todo-freq-border, rgba(213, 181, 234, 0.2));
  }

  .todo-item-title {
    color: #f0e8f8;
  }

  .todo-item-description {
    color: #adb5bd;
  }

  .todo-item-badge {
    background: color-mix(in srgb, var(--todo-freq-accent, #d4a06a) 32%, transparent);
  }

  .todo-item-quantite {
    background: color-mix(in srgb, var(--todo-freq-accent, #ad81be) 24%, transparent);
    border-right-color: rgba(213, 181, 234, 0.22);
  }

  .todo-item-quantite__btn {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(213, 181, 234, 0.28);
    color: var(--todo-freq-accent, #d5b5ea);
  }

  .todo-item-quantite__btn:not(:disabled):hover {
    background: rgba(255, 255, 255, 0.18);
  }

  .todo-item-quantite__value {
    color: #f0e8f8;
  }

  .todo-item-card--done .todo-item-quantite__value {
    color: #95d1aa;
  }
}
</style>
