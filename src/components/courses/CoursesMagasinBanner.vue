<script setup>
defineProps({
  title: { type: String, required: true },
  color: { type: String, default: '#AD81BE' },
  count: { type: Number, default: 0 },
  subtitle: { type: String, default: '' },
})
</script>

<template>
  <header class="courses-banner" :style="{ '--banner-color': color }">
    <div class="courses-banner__stripe" aria-hidden="true" />
    <div class="courses-banner__content">
      <h2 class="courses-banner__title">{{ title }}</h2>
      <p v-if="subtitle" class="courses-banner__sub">{{ subtitle }}</p>
      <p class="courses-banner__count">
        {{ count }} article{{ count > 1 ? 's' : '' }}
      </p>
    </div>
  </header>
</template>

<style scoped>
.courses-banner {
  display: flex;
  align-items: stretch;
  border-radius: 14px;
  overflow: hidden;
  background: color-mix(in srgb, var(--banner-color) 18%, var(--color-background));
  border: 1px solid color-mix(in srgb, var(--banner-color) 40%, var(--color-border));
  margin-bottom: 0.85rem;
}

.courses-banner__stripe {
  width: 10px;
  flex-shrink: 0;
  background: var(--banner-color);
}

.courses-banner__content {
  padding: 0.75rem 1rem;
  min-width: 0;
}

.courses-banner__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--color-text);
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
