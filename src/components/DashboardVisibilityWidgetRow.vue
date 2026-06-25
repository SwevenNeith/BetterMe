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
})

defineEmits(['toggle'])
</script>

<template>
  <li class="visibility-page-row dashboard-visibility-row">
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
