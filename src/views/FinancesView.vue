<script setup>
import { APP_PAGE_IDS } from '../constants/common/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'

defineOptions({ name: 'FinancesView' })

const { pageTitle } = usePageDisplayLabel(APP_PAGE_IDS.FINANCES, undefined, {
  setDocumentTitle: true,
})
</script>

<template>
  <div class="finances-wrapper">
    <header class="finances-header">
      <h1 class="finances-title">{{ pageTitle }}</h1>
      <p class="finances-subtitle">
        Suivi de tes dépenses, budgets et revenus — pour y voir plus clair au quotidien.
      </p>
    </header>

    <section class="finances-card">
      <p class="finances-badge" aria-hidden="true">En construction</p>
      <p class="finances-placeholder">
        Cette page permettra bientôt de suivre tes finances : budgets, dépenses, catégories et
        bilans. Reviens un peu plus tard !
      </p>
    </section>
  </div>
</template>

<style scoped>
.finances-wrapper {
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
}

.finances-header {
  margin-bottom: 1.5rem;
  text-align: center;
}

.finances-title {
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  margin: 0;
}

.finances-subtitle {
  margin: 0.5rem 0 0;
  color: #6c757d;
  font-size: 1rem;
}

.finances-card {
  width: 100%;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 16px;
  padding: 1.75rem 1.25rem;
  text-align: center;
}

.finances-badge {
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

.finances-placeholder {
  margin: 0 auto;
  max-width: 36rem;
  color: #6c757d;
  font-size: 1rem;
  line-height: 1.55;
}

@media (prefers-color-scheme: dark) {
  .finances-title {
    color: #f0e8f8;
  }
  .finances-subtitle,
  .finances-placeholder {
    color: #adb5bd;
  }
  .finances-card {
    background: rgba(35, 30, 48, 0.75);
    border-color: rgba(213, 181, 234, 0.2);
  }
  .finances-badge {
    color: #e9d5f5;
    background: rgba(173, 129, 190, 0.22);
  }
}
</style>
