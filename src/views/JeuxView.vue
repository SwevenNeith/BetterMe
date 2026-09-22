<script setup>
import { APP_PAGE_IDS } from '../constants/common/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'

defineOptions({ name: 'JeuxView' })

const { pageTitle } = usePageDisplayLabel(APP_PAGE_IDS.JEUX, undefined, {
  setDocumentTitle: true,
})
</script>

<template>
  <div class="jeux-wrapper">
    <header class="jeux-header">
      <h1 class="jeux-title">{{ pageTitle }}</h1>
      <p class="jeux-subtitle">
        Ta bibliothèque de jeux — ceux auxquels tu joues, que tu suis ou que tu as terminés.
      </p>
    </header>

    <section class="jeux-card">
      <p class="jeux-badge" aria-hidden="true">En construction</p>
      <p class="jeux-placeholder">
        Cette page permettra bientôt de suivre ta ludothèque : jeux en cours, terminés, envies et
        progression. Reviens un peu plus tard !
      </p>
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

.jeux-card {
  width: 100%;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 16px;
  padding: 1.75rem 1.25rem;
  text-align: center;
}

.jeux-badge {
  display: inline-block;
  margin: 0 0 0.85rem;
  padding: 0.28rem 0.7rem;
  border-radius: 999px;
  background: rgba(173, 129, 190, 0.18);
  border: 1px solid rgba(173, 129, 190, 0.35);
  color: #6b4f7c;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.jeux-placeholder {
  margin: 0 auto;
  max-width: 36rem;
  color: #6c757d;
  font-size: 1rem;
  line-height: 1.55;
}

@media (prefers-color-scheme: dark) {
  .jeux-title {
    color: #f0e8f8;
  }
  .jeux-subtitle,
  .jeux-placeholder {
    color: #adb5bd;
  }
  .jeux-card {
    background: rgba(35, 30, 48, 0.75);
    border-color: rgba(213, 181, 234, 0.2);
  }
  .jeux-badge {
    color: #e9d5f5;
    background: rgba(173, 129, 190, 0.22);
  }
}
</style>
