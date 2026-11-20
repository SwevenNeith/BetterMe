<script setup>
import { computed } from 'vue'
import { COURSES_PRIORITES } from '../../constants/courses/courses.js'

const props = defineProps({
  article: { type: Object, required: true },
  showDurability: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
})

const emit = defineEmits(['open', 'racheter'])

const prioriteMeta = computed(() =>
  COURSES_PRIORITES.find((p) => p.id === props.article.priorite) || null,
)

const magasinColor = computed(
  () => props.article.magasin?.couleur || props.article.magasinColor || '#9aa0a6',
)

const qtyLabel = computed(() => {
  const q = props.article.quantite
  const u = props.article.unite
  if (u) return `${q} ${u}`
  if (Number(q) !== 1) return String(q)
  return ''
})

const progressPct = computed(() => {
  const p = props.article.durabilityProgress
  if (p == null) return 0
  return Math.round(p * 100)
})
</script>

<template>
  <button
    type="button"
    class="courses-card"
    :class="{ 'courses-card--compact': compact }"
    @click="emit('open', article)"
  >
    <span class="courses-card__icone" aria-hidden="true">{{ article.icone || '🛒' }}</span>
    <span class="courses-card__body">
      <span class="courses-card__top">
        <span class="courses-card__nom">{{ article.nom }}</span>
        <span
          v-if="prioriteMeta"
          class="courses-card__prio"
          :title="`Priorité ${prioriteMeta.label}`"
          :aria-label="`Priorité ${prioriteMeta.label}`"
        >{{ prioriteMeta.marker }}</span>
      </span>
      <span v-if="qtyLabel" class="courses-card__qty">{{ qtyLabel }}</span>
      <span
        v-if="showDurability && article.durabilityCaption"
        class="courses-card__dura"
      >
        {{ article.durabilityCaption }}
      </span>
      <span
        v-if="showDurability && article.renewLabel"
        class="courses-card__renew-label"
      >{{ article.renewLabel }}</span>
      <span
        v-if="showDurability && article.durabilityProgress != null"
        class="courses-card__bar"
        role="progressbar"
        :aria-valuenow="progressPct"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="`Usure estimée ${progressPct} %`"
      >
        <span class="courses-card__bar-fill" :style="{ width: `${progressPct}%` }" />
      </span>
    </span>
    <span
      class="courses-card__dot"
      :style="{ background: magasinColor }"
      :title="article.magasin?.nom || 'N’importe où'"
      aria-hidden="true"
    />
    <span
      v-if="showDurability"
      class="courses-card__racheter-wrap"
      @click.stop
    >
      <button
        type="button"
        class="courses-card__racheter"
        @click="emit('racheter', article)"
      >
        Racheter
      </button>
    </span>
  </button>
</template>

<style scoped>
.courses-card {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.65rem 0.75rem;
  align-items: start;
  width: 100%;
  text-align: left;
  padding: 0.9rem 1rem;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 35%, var(--color-border));
  background: color-mix(in srgb, var(--color-background) 88%, var(--color-primary) 12%);
  box-shadow: 0 6px 18px color-mix(in srgb, var(--color-primary-dark) 12%, transparent);
  color: var(--color-text);
  cursor: pointer;
  min-height: 44px;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.courses-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 22px color-mix(in srgb, var(--color-primary-dark) 18%, transparent);
}

.courses-card--compact {
  padding: 0.75rem 0.85rem;
}

.courses-card__icone {
  font-size: 1.55rem;
  line-height: 1;
  margin-top: 0.1rem;
}

.courses-card__body {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.courses-card__top {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
}

.courses-card__nom {
  font-weight: 700;
  font-size: 0.98rem;
  line-height: 1.25;
}

.courses-card__prio {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--color-text-light);
  flex-shrink: 0;
}

.courses-card__qty {
  font-size: 0.85rem;
  color: var(--color-text-light);
}

.courses-card__dura {
  font-size: 0.78rem;
  color: var(--color-text-light);
  line-height: 1.35;
  margin-top: 0.15rem;
}

.courses-card__renew-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: color-mix(in srgb, var(--color-primary-dark) 55%, var(--color-text));
}

.courses-card__bar {
  display: block;
  height: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-border) 80%, transparent);
  overflow: hidden;
  margin-top: 0.35rem;
}

.courses-card__bar-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: color-mix(in srgb, var(--color-secondary) 70%, var(--color-primary-dark));
}

.courses-card__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-top: 0.35rem;
  border: 1px solid color-mix(in srgb, var(--color-text) 15%, transparent);
  flex-shrink: 0;
}

.courses-card__racheter-wrap {
  grid-column: 1 / -1;
}

.courses-card__racheter {
  width: 100%;
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--color-primary-dark) 35%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 35%, transparent);
  color: var(--color-text);
  font-weight: 700;
  cursor: pointer;
}

.courses-card__racheter:hover {
  background: color-mix(in srgb, var(--color-primary) 55%, transparent);
}

@media (prefers-color-scheme: dark) {
  .courses-card {
    background: color-mix(in srgb, var(--color-background) 92%, var(--color-primary) 8%);
  }
}
</style>
