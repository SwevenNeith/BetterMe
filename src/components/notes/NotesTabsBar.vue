<script setup>
defineProps({
  tabs: { type: Array, default: () => [] },
  activeKey: { type: String, default: '' },
})

const emit = defineEmits(['select', 'close'])

function onClose(event, tab) {
  event.preventDefault()
  event.stopPropagation()
  emit('close', tab)
}
</script>

<template>
  <div v-if="tabs.length" class="notes-tabs" role="tablist" aria-label="Notes ouvertes">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      type="button"
      role="tab"
      class="notes-tabs__tab"
      :class="{ 'notes-tabs__tab--active': tab.key === activeKey }"
      :aria-selected="tab.key === activeKey"
      :title="tab.label"
      @click="emit('select', tab)"
      @click.middle.prevent="emit('close', tab)"
    >
      <span class="notes-tabs__label">{{ tab.label }}</span>
      <span
        class="notes-tabs__close"
        title="Fermer"
        role="button"
        tabindex="0"
        @click="onClose($event, tab)"
        @keydown.enter.prevent="emit('close', tab)"
      >
        ×
      </span>
    </button>
  </div>
</template>

<style scoped>
.notes-tabs {
  display: flex;
  flex-wrap: nowrap;
  gap: 0.2rem;
  align-items: stretch;
  overflow-x: auto;
  padding: 0.35rem 0.45rem 0;
  background: #efe6f8;
  border-bottom: 1px solid #e0d4ee;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .notes-tabs {
    padding-left: 2.6rem;
  }
}

.notes-tabs__tab {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  max-width: 180px;
  min-width: 72px;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  background: transparent;
  color: #6d5a7e;
  padding: 0.35rem 0.35rem 0.4rem 0.55rem;
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}

.notes-tabs__tab:hover {
  background: rgba(255, 255, 255, 0.45);
  color: #3b2a4a;
}

.notes-tabs__tab--active {
  background: #faf7fd;
  border-color: #e0d4ee;
  color: #3b2a4a;
  font-weight: 600;
}

.notes-tabs__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
  text-align: left;
}

.notes-tabs__close {
  flex-shrink: 0;
  width: 1.15rem;
  height: 1.15rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  font-size: 0.95rem;
  line-height: 1;
  color: #8a779c;
}

.notes-tabs__close:hover {
  background: rgba(60, 40, 80, 0.08);
  color: #3b2a4a;
}
</style>
