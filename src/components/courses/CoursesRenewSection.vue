<script setup>
import CoursesArticleCard from './CoursesArticleCard.vue'

defineProps({
  open: { type: Boolean, default: true },
  articles: { type: Array, default: () => [] },
  thresholdDays: { type: Number, default: 30 },
})

const emit = defineEmits(['update:open', 'update:thresholdDays', 'open-article', 'racheter'])
</script>

<template>
  <section v-if="articles.length" class="courses-renew">
    <button
      type="button"
      class="courses-renew__toggle"
      :aria-expanded="open"
      @click="emit('update:open', !open)"
    >
      <span class="courses-renew__title">À renouveler</span>
      <span class="courses-renew__meta">{{ articles.length }}</span>
      <span class="courses-renew__chev" aria-hidden="true">{{ open ? '▾' : '▸' }}</span>
    </button>

    <div v-show="open" class="courses-renew__body">
      <label class="courses-renew__threshold">
        <span>Seuil</span>
        <input
          type="number"
          min="1"
          max="365"
          :value="thresholdDays"
          @change="emit('update:thresholdDays', Math.max(1, Number($event.target.value) || 30))"
        />
        <span>jours</span>
      </label>
      <div class="courses-renew__grid">
        <CoursesArticleCard
          v-for="article in articles"
          :key="article.id"
          :article="article"
          show-durability
          @open="emit('open-article', $event)"
          @racheter="emit('racheter', $event)"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.courses-renew {
  margin-bottom: 1.25rem;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--color-secondary) 40%, var(--color-border));
  background: color-mix(in srgb, var(--color-secondary) 12%, var(--color-background));
  overflow: hidden;
}

.courses-renew__toggle {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  min-height: 48px;
  padding: 0.75rem 1rem;
  border: none;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
}

.courses-renew__title {
  font-weight: 800;
  font-size: 1rem;
}

.courses-renew__meta {
  font-size: 0.8rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-secondary) 35%, transparent);
  color: var(--color-text);
}

.courses-renew__chev {
  margin-left: auto;
  color: var(--color-text-light);
}

.courses-renew__body {
  padding: 0 1rem 1rem;
}

.courses-renew__threshold {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
  color: var(--color-text-light);
  margin-bottom: 0.75rem;
}

.courses-renew__threshold input {
  width: 4.2rem;
  min-height: 36px;
  padding: 0.25rem 0.4rem;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
}

.courses-renew__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.65rem;
}

@media (min-width: 640px) {
  .courses-renew__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
