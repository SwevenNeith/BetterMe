<script setup>
import { RouterLink } from 'vue-router'
import { APP_PAGE_IDS } from '../constants/common/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'

defineOptions({ name: 'JeuxView' })

const { pageTitle } = usePageDisplayLabel(APP_PAGE_IDS.JEUX, undefined, {
  setDocumentTitle: true,
})

const games = [
  {
    id: 'league-of-legends',
    name: 'League of Legends',
    description:
      'Enregistre tes comptes Riot et consulte les matchs des derniers jours via l’API officielle.',
    path: '/league-of-legends',
    emoji: '🎮',
  },
]
</script>

<template>
  <div class="jeux-wrapper">
    <header class="jeux-header">
      <h1 class="jeux-title">{{ pageTitle }}</h1>
      <p class="jeux-subtitle">
        Ta bibliothèque de jeux — suivi de comptes, matchs et progression.
      </p>
    </header>

    <section class="jeux-grid" aria-label="Jeux disponibles">
      <RouterLink
        v-for="game in games"
        :key="game.id"
        :to="game.path"
        class="jeux-card-link"
      >
        <span class="jeux-card-link__emoji" aria-hidden="true">{{ game.emoji }}</span>
        <h2 class="jeux-card-link__title">{{ game.name }}</h2>
        <p class="jeux-card-link__desc">{{ game.description }}</p>
      </RouterLink>
    </section>
  </div>
</template>

<style scoped>
.jeux-wrapper {
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
  min-width: 0;
}

.jeux-header {
  margin-bottom: 1.5rem;
  text-align: center;
}

.jeux-title {
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  margin: 0;
}

.jeux-subtitle {
  margin: 0.5rem 0 0;
  color: #6c757d;
  font-size: 1rem;
}

.jeux-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr));
  gap: 1rem;
}

.jeux-card-link {
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

.jeux-card-link:hover {
  transform: translateY(-2px);
  border-color: rgba(173, 129, 190, 0.55);
  box-shadow: 0 10px 28px rgba(173, 129, 190, 0.18);
}

.jeux-card-link__emoji {
  font-size: 1.75rem;
  line-height: 1;
}

.jeux-card-link__title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: #2c3e50;
}

.jeux-card-link__desc {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.45;
  color: #6c757d;
}

@media (prefers-color-scheme: dark) {
  .jeux-title,
  .jeux-card-link__title {
    color: #f0e8f8;
  }

  .jeux-subtitle,
  .jeux-card-link__desc {
    color: #adb5bd;
  }

  .jeux-card-link {
    background: rgba(35, 30, 48, 0.75);
    border-color: rgba(213, 181, 234, 0.2);
  }
}
</style>
