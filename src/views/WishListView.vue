<script setup>
import { APP_PAGE_IDS } from '../constants/common/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'

defineOptions({ name: 'WishListView' })

const { pageTitle } = usePageDisplayLabel(APP_PAGE_IDS.WISHLIST, undefined, {
  setDocumentTitle: true,
})
</script>

<template>
  <div class="wishlist-wrapper">
    <header class="wishlist-header">
      <h1 class="wishlist-title">{{ pageTitle }}</h1>
      <p class="wishlist-subtitle">
        Tes envies regroupées — idées, achats et coups de cœur à ne pas oublier.
      </p>
    </header>

    <section class="wishlist-card">
      <p class="wishlist-badge" aria-hidden="true">En construction</p>
      <p class="wishlist-placeholder">
        Cette page permettra bientôt de gérer ta wishlist : listes d’envies, priorités et suivi.
        Reviens un peu plus tard !
      </p>
    </section>
  </div>
</template>

<style scoped>
.wishlist-wrapper {
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
}

.wishlist-header {
  margin-bottom: 1.5rem;
  text-align: center;
}

.wishlist-title {
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  margin: 0;
}

.wishlist-subtitle {
  margin: 0.5rem 0 0;
  color: #6c757d;
  font-size: 1rem;
}

.wishlist-card {
  width: 100%;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 16px;
  padding: 1.75rem 1.25rem;
  text-align: center;
}

.wishlist-badge {
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

.wishlist-placeholder {
  margin: 0 auto;
  max-width: 36rem;
  color: #6c757d;
  font-size: 1rem;
  line-height: 1.55;
}

@media (prefers-color-scheme: dark) {
  .wishlist-title {
    color: #f0e8f8;
  }
  .wishlist-subtitle,
  .wishlist-placeholder {
    color: #adb5bd;
  }
  .wishlist-card {
    background: rgba(35, 30, 48, 0.75);
    border-color: rgba(213, 181, 234, 0.2);
  }
  .wishlist-badge {
    color: #e9d5f5;
    background: rgba(173, 129, 190, 0.22);
  }
}
</style>
