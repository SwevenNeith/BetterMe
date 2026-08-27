<script setup>
defineProps({
  widget: {
    type: Object,
    required: true,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  /** Peut être déplacé (handle + gesture). */
  movable: {
    type: Boolean,
    default: false,
  },
  dragging: {
    type: Boolean,
    default: false,
  },
  dropTarget: {
    type: Boolean,
    default: false,
  },
  /** Attributs de drop (sur le <li> réel, pas en fallthrough parent). */
  dropMode: {
    type: String,
    default: null,
  },
  dropZone: {
    type: String,
    default: null,
  },
  dropGroup: {
    type: [Number, String],
    default: null,
  },
  dropBefore: {
    type: String,
    default: null,
  },
})

const emit = defineEmits(['toggle', 'move-start'])

function onHandlePointerDown(event) {
  if (event.button != null && event.button !== 0) return
  emit('move-start', event)
}
</script>

<template>
  <li
    class="visibility-page-row dashboard-visibility-row"
    :class="{
      'dashboard-visibility-row--dragging': dragging,
      'dashboard-visibility-row--drop-target': dropTarget,
      'dashboard-visibility-row--movable': movable,
    }"
    :data-dash-widget="widget.id"
    :data-dash-drop="dropMode || undefined"
    :data-zone="dropZone || undefined"
    :data-group="dropGroup != null && dropGroup !== '' ? String(dropGroup) : undefined"
    :data-before="dropBefore || undefined"
  >
    <button
      v-if="movable"
      type="button"
      class="dashboard-visibility-row__handle"
      title="Glisser pour réorganiser"
      aria-label="Glisser pour réorganiser"
      @pointerdown.stop.prevent="onHandlePointerDown"
    >
      <span class="dashboard-visibility-row__handle-glyph" aria-hidden="true">⋮⋮</span>
    </button>

    <label
      class="visibility-page-check"
      :title="widget.visible ? 'Masquer sur le dashboard' : 'Afficher sur le dashboard'"
      @pointerdown.stop
    >
      <input
        type="checkbox"
        class="visibility-page-check__input"
        :checked="widget.visible"
        :disabled="disabled"
        :aria-label="`${widget.visible ? 'Masquer' : 'Afficher'} ${widget.displayLabel}`"
        @change="$emit('toggle', widget.id, $event.target.checked)"
      />
    </label>

    <div
      class="visibility-page-main"
      :class="{ 'visibility-page-main--draggable': movable }"
      @pointerdown="movable ? onHandlePointerDown($event) : undefined"
    >
      <span class="visibility-page-label">{{ widget.displayLabel }}</span>
    </div>
  </li>
</template>

<style scoped>
.dashboard-visibility-row--movable {
  touch-action: none;
}

.dashboard-visibility-row--dragging {
  opacity: 0.4;
}

.dashboard-visibility-row--drop-target {
  box-shadow: 0 0 0 2px rgba(173, 129, 190, 0.45);
}

.dashboard-visibility-row__handle {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.55rem;
  height: 1.55rem;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: rgba(213, 181, 234, 0.18);
  color: #ad81be;
  cursor: grab;
  user-select: none;
  touch-action: none;
  -webkit-user-select: none;
}

.dashboard-visibility-row__handle-glyph {
  font-size: 0.72rem;
  letter-spacing: -0.12em;
  line-height: 1;
  pointer-events: none;
}

.dashboard-visibility-row__handle:active {
  cursor: grabbing;
}

.visibility-page-main--draggable {
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.visibility-page-main--draggable:active {
  cursor: grabbing;
}
</style>
