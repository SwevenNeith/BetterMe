<script setup>
// Page Projets — contenu à venir.
</script>

<template>
  <div class="coming-soon-wrapper">
    <header class="coming-soon-header">
      <h1 class="coming-soon-title">Projets</h1>
      <p class="coming-soon-subtitle">Organise et suis tes projets personnels.</p>
    </header>

    <section class="coming-soon-card">
      <p class="coming-soon-message">Cette page est en cours de création.</p>
    </section>
  </div>
</template>

<style scoped>
.coming-soon-wrapper {
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
}

.coming-soon-header {
  margin-bottom: 1.5rem;
  text-align: center;
  max-width: 720px;
  margin-left: auto;
  margin-right: auto;
}

.coming-soon-title {
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  margin: 0;
}

.coming-soon-subtitle {
  margin: 0.5rem 0 0;
  color: #6c757d;
  font-size: 1rem;
}

.coming-soon-card {
  max-width: 720px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 16px;
  padding: 1.5rem 1.25rem;
}

.coming-soon-message {
  margin: 0;
  color: #6c757d;
  font-size: 1rem;
  line-height: 1.5;
  text-align: center;
}

@media (prefers-color-scheme: dark) {
  .coming-soon-title {
    color: #f0e8f8;
  }

  .coming-soon-subtitle,
  .coming-soon-message {
    color: #adb5bd;
  }

  .coming-soon-card {
    background: rgba(30, 25, 40, 0.65);
    border-color: rgba(213, 181, 234, 0.2);
  }
}
</style>
