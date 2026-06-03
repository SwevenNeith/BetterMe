<script setup>
// Page d’accueil de la section Exercices (contenu à enrichir plus tard).
</script>

<template>
  <div class="exercices-wrapper">
    <header class="exercices-header">
      <h1 class="exercices-title">Exercices</h1>
      <p class="exercices-subtitle">
        Retrouve ici tes exercices et outils de bien-être.
      </p>
    </header>

    <section class="exercices-card">
      <p class="exercices-placeholder">
        Cette section sera bientôt enrichie. Ouvre le menu <strong>Exercices</strong> à gauche pour
        accéder aux <strong>Humeurs</strong>.
      </p>
    </section>
  </div>
</template>

<style scoped>
.exercices-wrapper {
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
}

.exercices-header {
  margin-bottom: 1.5rem;
  text-align: center;
  max-width: 720px;
  margin-left: auto;
  margin-right: auto;
}

.exercices-title {
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  margin: 0;
}

.exercices-subtitle {
  margin: 0.5rem 0 0;
  color: #6c757d;
  font-size: 1rem;
}

.exercices-card {
  max-width: 720px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 16px;
  padding: 1.5rem 1.25rem;
}

.exercices-placeholder {
  margin: 0;
  color: #6c757d;
  font-size: 1rem;
  line-height: 1.5;
  text-align: center;
}

@media (prefers-color-scheme: dark) {
  .exercices-title {
    color: #f0e8f8;
  }
  .exercices-subtitle,
  .exercices-placeholder {
    color: #adb5bd;
  }
  .exercices-card {
    background: rgba(35, 30, 48, 0.75);
    border-color: rgba(213, 181, 234, 0.2);
  }
}
</style>
