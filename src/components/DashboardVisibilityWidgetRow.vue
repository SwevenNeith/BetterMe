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
  draggable: {
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
})

const emit = defineEmits(['toggle', 'dragstart', 'dragover', 'drop', 'dragend'])

function onRowDragStart(event) {
  if (event.target?.closest('input, label, button')) {
    event.preventDefault()
    return
  }
  emit('dragstart', event)
}
</script>

<template>
  <li
    class="visibility-page-row dashboard-visibility-row"
    :class="{
      'dashboard-visibility-row--dragging': dragging,
      'dashboard-visibility-row--drop-target': dropTarget,
      'dashboard-visibility-row--draggable': draggable,
    }"
    :draggable="draggable && !disabled"
    @dragstart="onRowDragStart"
    @dragover="draggable ? emit('dragover', $event) : undefined"
    @drop="draggable ? emit('drop', $event) : undefined"
    @dragend="draggable ? emit('dragend', $event) : undefined"
  >
    <span
      v-if="draggable"
      class="dashboard-visibility-row__handle"
      aria-hidden="true"
      title="Glisser pour réorganiser"
    >
      ⋮⋮
    </span>

    <label
      class="visibility-page-check"
      :title="widget.visible ? 'Masquer sur le dashboard' : 'Afficher sur le dashboard'"
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

    <div class="visibility-page-main">
      <span class="visibility-page-label">{{ widget.displayLabel }}</span>
    </div>
  </li>
</template>

<style scoped>
.dashboard-visibility-row--draggable {
  cursor: grab;
}

.dashboard-visibility-row--dragging {
  opacity: 0.55;
  cursor: grabbing;
}

.dashboard-visibility-row--drop-target {
  box-shadow: 0 0 0 2px rgba(173, 129, 190, 0.45);
}

.dashboard-visibility-row__handle {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.1rem;
  color: #ad81be;
  font-size: 0.7rem;
  letter-spacing: -0.12em;
  opacity: 0.75;
  user-select: none;
}
</style>
