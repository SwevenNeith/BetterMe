<script setup>
import { APP_PAGE_IDS } from '../constants/common/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'

defineOptions({ name: 'SportView' })

const { pageTitle } = usePageDisplayLabel(APP_PAGE_IDS.SPORT, undefined, {
  setDocumentTitle: true,
})
</script>

<template>
  <div class="sport-wrapper">
    <header class="sport-header">
      <h1 class="sport-title">{{ pageTitle }}</h1>
      <p class="sport-subtitle">
        Suivi de ton activité sportive — séances, objectifs et progression.
      </p>
    </header>

    <section class="sport-card">
      <p class="sport-badge" aria-hidden="true">En construction</p>
      <p class="sport-placeholder">
        Cette page permettra bientôt de suivre ton sport : entraînements, objectifs, bilans et
        habitudes. Reviens un peu plus tard !
      </p>
    </section>
  </div>
</template>

<style scoped>
.sport-wrapper {
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
}

.sport-header {
  margin-bottom: 1.5rem;
  text-align: center;
}

.sport-title {
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  margin: 0;
}

.sport-subtitle {
  margin: 0.5rem 0 0;
  color: #6c757d;
  font-size: 1rem;
}

.sport-card {
  width: 100%;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 16px;
  padding: 1.75rem 1.25rem;
  text-align: center;
}

.sport-badge {
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

.sport-placeholder {
  margin: 0 auto;
  max-width: 36rem;
  color: #6c757d;
  font-size: 1rem;
  line-height: 1.55;
}

@media (prefers-color-scheme: dark) {
  .sport-title {
    color: #f0e8f8;
  }
  .sport-subtitle,
  .sport-placeholder {
    color: #adb5bd;
  }
  .sport-card {
    background: rgba(35, 30, 48, 0.75);
    border-color: rgba(213, 181, 234, 0.2);
  }
  .sport-badge {
    color: #e9d5f5;
    background: rgba(173, 129, 190, 0.22);
  }
}
</style>
