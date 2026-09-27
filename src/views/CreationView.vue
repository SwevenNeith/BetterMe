<script setup>
import { RouterLink } from 'vue-router'
import { APP_PAGE_IDS } from '../constants/common/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'

const { pageTitle } = usePageDisplayLabel(APP_PAGE_IDS.CREATION, undefined, {
  setDocumentTitle: true,
})

const hobbies = [
  {
    id: 'points-de-croix',
    name: 'Points de Croix',
    description: 'Transforme une photo en grille de croix : resize progressif puis palette LAB.',
    path: '/points-de-croix',
    emoji: '🧵',
  },
]
</script>

<template>
  <div class="creation-wrapper">
    <header class="creation-header">
      <h1 class="creation-title">{{ pageTitle }}</h1>
      <p class="creation-subtitle">Tes loisirs créatifs — outils et projets au même endroit.</p>
    </header>

    <section class="creation-grid" aria-label="Loisirs créatifs">
      <RouterLink
        v-for="hobby in hobbies"
        :key="hobby.id"
        :to="hobby.path"
        class="creation-card"
      >
        <span class="creation-card__emoji" aria-hidden="true">{{ hobby.emoji }}</span>
        <h2 class="creation-card__title">{{ hobby.name }}</h2>
        <p class="creation-card__desc">{{ hobby.description }}</p>
      </RouterLink>
    </section>
  </div>
</template>

<style scoped>
.creation-wrapper {
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
  min-width: 0;
}

.creation-header {
  margin-bottom: 1.5rem;
  text-align: center;
}

.creation-title {
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  margin: 0;
}

.creation-subtitle {
  margin: 0.5rem 0 0;
  color: #6c757d;
  font-size: 1rem;
}

.creation-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr));
  gap: 1rem;
}

.creation-card {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: 0;
  padding: 1.25rem 1.15rem;
  border-radius: 16px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  text-decoration: none;
  color: inherit;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease,
    border-color 0.15s ease;
}

.creation-card:hover {
  transform: translateY(-2px);
  border-color: rgba(173, 129, 190, 0.55);
  box-shadow: 0 10px 28px rgba(173, 129, 190, 0.18);
}

.creation-card__emoji {
  font-size: 1.75rem;
  line-height: 1;
}

.creation-card__title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: #2c3e50;
}

.creation-card__desc {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.45;
  color: #6c757d;
}

@media (prefers-color-scheme: dark) {
  .creation-title,
  .creation-card__title {
    color: #f0e8f8;
  }
  .creation-subtitle,
  .creation-card__desc {
    color: #adb5bd;
  }
  .creation-card {
    background: rgba(35, 30, 48, 0.75);
    border-color: rgba(213, 181, 234, 0.2);
  }
}
</style>
