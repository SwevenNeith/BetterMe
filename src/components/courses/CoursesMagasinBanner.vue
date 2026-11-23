<script setup>
defineProps({
  title: { type: String, required: true },
  color: { type: String, default: '#AD81BE' },
  count: { type: Number, default: 0 },
  subtitle: { type: String, default: '' },
  editable: { type: Boolean, default: false },
})

defineEmits(['edit'])
</script>

<template>
  <component
    :is="editable ? 'button' : 'header'"
    type="button"
    class="courses-banner"
    :class="{ 'courses-banner--editable': editable }"
    :style="{ '--banner-color': color }"
    :aria-label="editable ? `Personnaliser ${title}` : undefined"
    @click="editable ? $emit('edit') : undefined"
  >
    <div class="courses-banner__stripe" aria-hidden="true" />
    <div class="courses-banner__content">
      <div class="courses-banner__top">
        <h2 class="courses-banner__title">{{ title }}</h2>
        <span v-if="editable" class="courses-banner__edit" aria-hidden="true">Personnaliser</span>
      </div>
      <p v-if="subtitle" class="courses-banner__sub">{{ subtitle }}</p>
      <p class="courses-banner__count">
        {{ count }} article{{ count > 1 ? 's' : '' }}
      </p>
    </div>
  </component>
</template>

<style scoped>
.courses-banner {
  display: flex;
  align-items: stretch;
  width: 100%;
  text-align: left;
  border-radius: 14px;
  overflow: hidden;
  background: color-mix(in srgb, var(--banner-color) 18%, var(--color-background));
  border: 1px solid color-mix(in srgb, var(--banner-color) 40%, var(--color-border));
  margin-bottom: 0.85rem;
  color: inherit;
  font: inherit;
  padding: 0;
}

.courses-banner--editable {
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.courses-banner--editable:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px color-mix(in srgb, var(--banner-color) 22%, transparent);
}

.courses-banner__stripe {
  width: 10px;
  flex-shrink: 0;
  background: var(--banner-color);
}

.courses-banner__content {
  padding: 0.75rem 1rem;
  min-width: 0;
  flex: 1;
}

.courses-banner__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.65rem;
}

.courses-banner__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--color-text);
}

.courses-banner__edit {
  flex-shrink: 0;
  font-size: 0.72rem;
  font-weight: 750;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--banner-color) 35%, var(--color-text-light));
}

.courses-banner__sub {
  margin: 0.15rem 0 0;
  font-size: 0.8rem;
  color: var(--color-text-light);
}

.courses-banner__count {
  margin: 0.2rem 0 0;
  font-size: 0.78rem;
  font-weight: 600;
  color: color-mix(in srgb, var(--banner-color) 45%, var(--color-text));
}
</style>
