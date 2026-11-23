<script setup>
import CoursesMagasinBanner from './CoursesMagasinBanner.vue'
import CoursesArticleCard from './CoursesArticleCard.vue'
import CoursesRenewSection from './CoursesRenewSection.vue'
import {
  COURSES_GROUP_BY,
  COURSES_SANS_CATEGORIE_ID,
  COURSES_SANS_MAGASIN_ID,
} from '../../constants/courses/courses.js'

defineProps({
  groups: { type: Array, default: () => [] },
  renewArticles: { type: Array, default: () => [] },
  renewOpen: { type: Boolean, default: true },
  renewThresholdDays: { type: Number, default: 30 },
  groupBy: { type: String, default: COURSES_GROUP_BY.MAGASIN },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:groupBy',
  'update:renewOpen',
  'update:renewThresholdDays',
  'open-article',
  'racheter',
  'edit-group',
])

function isEditableGroup(group) {
  if (!group) return false
  if (group.key === COURSES_SANS_MAGASIN_ID || group.key === COURSES_SANS_CATEGORIE_ID) {
    return false
  }
  return Boolean(group.meta?.magasin || group.meta?.categorie)
}

function onEditGroup(group) {
  if (!isEditableGroup(group)) return
  if (group.meta?.magasin) {
    emit('edit-group', { kind: 'magasin', entity: group.meta.magasin })
  } else if (group.meta?.categorie) {
    emit('edit-group', { kind: 'categorie', entity: group.meta.categorie })
  }
}
</script>

<template>
  <div class="courses-vitrine">
    <CoursesRenewSection
      :open="renewOpen"
      :articles="renewArticles"
      :threshold-days="renewThresholdDays"
      @update:open="emit('update:renewOpen', $event)"
      @update:threshold-days="emit('update:renewThresholdDays', $event)"
      @open-article="emit('open-article', $event)"
      @racheter="emit('racheter', $event)"
    />

    <div class="courses-vitrine__toolbar">
      <span class="courses-vitrine__label">Regrouper par</span>
      <div class="courses-vitrine__tabs" role="group" aria-label="Regroupement">
        <button
          type="button"
          class="courses-vitrine__tab"
          :class="{ 'is-active': groupBy === COURSES_GROUP_BY.MAGASIN }"
          :aria-pressed="groupBy === COURSES_GROUP_BY.MAGASIN"
          @click="emit('update:groupBy', COURSES_GROUP_BY.MAGASIN)"
        >
          Magasin
        </button>
        <button
          type="button"
          class="courses-vitrine__tab"
          :class="{ 'is-active': groupBy === COURSES_GROUP_BY.CATEGORIE }"
          :aria-pressed="groupBy === COURSES_GROUP_BY.CATEGORIE"
          @click="emit('update:groupBy', COURSES_GROUP_BY.CATEGORIE)"
        >
          Rayon
        </button>
      </div>
    </div>

    <div v-if="loading" class="courses-vitrine__skel" aria-busy="true" aria-label="Chargement">
      <div v-for="n in 3" :key="n" class="courses-vitrine__skel-block" />
    </div>

    <div
      v-else-if="!groups.length"
      class="courses-vitrine__empty"
    >
      <p class="courses-vitrine__empty-emoji" aria-hidden="true">🛒</p>
      <p class="courses-vitrine__empty-title">Ta vitrine est vide</p>
      <p class="courses-vitrine__empty-text">
        Ajoute un article ci-dessus. Les magasins et rayons se créent en tapant leur nom,
        puis tu les personnalises en cliquant sur leur bandeau.
      </p>
    </div>

    <section
      v-for="group in groups"
      v-else
      :key="group.key"
      class="courses-vitrine__group"
    >
      <CoursesMagasinBanner
        :title="group.title"
        :color="group.color || '#AD81BE'"
        :count="group.articles.length"
        :subtitle="group.meta?.magasin?.type === 'en_ligne' ? 'En ligne' : ''"
        :editable="isEditableGroup(group)"
        @edit="onEditGroup(group)"
      />
      <div class="courses-vitrine__grid">
        <CoursesArticleCard
          v-for="article in group.articles"
          :key="article.id"
          :article="article"
          @open="emit('open-article', $event)"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.courses-vitrine__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 1rem;
}

.courses-vitrine__label {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--color-text-light);
}

.courses-vitrine__tabs {
  display: inline-flex;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  overflow: hidden;
  background: var(--color-background);
}

.courses-vitrine__tab {
  min-height: 40px;
  padding: 0.4rem 0.95rem;
  border: none;
  background: transparent;
  color: var(--color-text-light);
  font-weight: 700;
  cursor: pointer;
}

.courses-vitrine__tab.is-active {
  background: color-mix(in srgb, var(--color-primary) 45%, transparent);
  color: var(--color-text);
}

.courses-vitrine__group {
  margin-bottom: 1.5rem;
}

.courses-vitrine__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.7rem;
}

@media (min-width: 560px) {
  .courses-vitrine__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 900px) {
  .courses-vitrine__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.courses-vitrine__empty {
  text-align: center;
  padding: 2.5rem 1.25rem;
  border-radius: 16px;
  border: 1px dashed color-mix(in srgb, var(--color-primary) 45%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}

.courses-vitrine__empty-emoji {
  font-size: 2.2rem;
  margin: 0 0 0.5rem;
}

.courses-vitrine__empty-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
}

.courses-vitrine__empty-text {
  margin: 0.45rem auto 0;
  max-width: 28rem;
  color: var(--color-text-light);
  font-size: 0.92rem;
  line-height: 1.45;
}

.courses-vitrine__skel {
  display: grid;
  gap: 0.85rem;
}

.courses-vitrine__skel-block {
  height: 7rem;
  border-radius: 14px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--color-border) 55%, transparent),
    color-mix(in srgb, var(--color-primary) 25%, transparent),
    color-mix(in srgb, var(--color-border) 55%, transparent)
  );
  background-size: 200% 100%;
  animation: courses-skel 1.2s ease-in-out infinite;
}

@keyframes courses-skel {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}
</style>
