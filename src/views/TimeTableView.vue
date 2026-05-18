<script setup>
// TimeTableView — placeholder, à développer
</script>

<template>
  <div class="timetable-wrapper">
    <div class="bg-blob"></div>

    <div class="page-header">
      <div class="page-badge">📅 Emploi du temps</div>
      <h1 class="page-title">Emploi du temps</h1>
      <p class="page-subtitle">Organise ta semaine et visualise tes créneaux d'un coup d'œil.</p>
    </div>

    <div class="coming-soon-card">
      <div class="coming-soon-icon">🚧</div>
      <h2 class="coming-soon-title">Fonctionnalité en cours de développement</h2>
      <p class="coming-soon-text">
        Ton emploi du temps interactif arrive bientôt. Tu pourras y ajouter tes cours,
        tes réunions et tes blocs de travail personnel.
      </p>
      <div class="tag-row">
        <span class="tag tag--mint">Semaine</span>
        <span class="tag tag--teal">Créneaux</span>
        <span class="tag tag--lavande">Rappels</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timetable-wrapper {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.5rem;
  min-height: 100%;
  overflow: hidden;
}

/* Decorative blob — Vert Menthe */
.bg-blob {
  position: absolute;
  bottom: -100px;
  left: -100px;
  width: 420px;
  height: 420px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(149, 209, 170, 0.22) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}

.page-header {
  text-align: center;
  margin-bottom: 2rem;
  position: relative;
  z-index: 1;
}

.page-badge {
  display: inline-block;
  background: linear-gradient(135deg, rgba(149, 209, 170, 0.2), rgba(114, 160, 152, 0.2));
  color: #72A098;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  padding: 0.35rem 1rem;
  border-radius: 20px;
  margin-bottom: 1rem;
  border: 1px solid rgba(114, 160, 152, 0.35);
}

.page-title {
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  margin-bottom: 0.5rem;
  line-height: 1.2;
}

@media (prefers-color-scheme: dark) {
  .page-title { color: #f0e8f8; }
}

.page-subtitle {
  font-size: 1rem;
  color: #6c757d;
  max-width: 420px;
  line-height: 1.6;
}

@media (prefers-color-scheme: dark) {
  .page-subtitle { color: #adb5bd; }
}

/* ─── Coming soon card ─── */
.coming-soon-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 500px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 24px;
  border: 1px solid rgba(149, 209, 170, 0.35);
  box-shadow: 0 12px 40px rgba(114, 160, 152, 0.15);
  padding: 2.5rem 2rem;
  text-align: center;
}

@media (prefers-color-scheme: dark) {
  .coming-soon-card {
    background: rgba(25, 30, 25, 0.85);
    border: 1px solid rgba(149, 209, 170, 0.2);
  }
}

.coming-soon-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.coming-soon-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #72A098;
  margin-bottom: 0.75rem;
}

.coming-soon-text {
  font-size: 0.95rem;
  color: #6c757d;
  line-height: 1.7;
  margin-bottom: 1.75rem;
}

@media (prefers-color-scheme: dark) {
  .coming-soon-text { color: #adb5bd; }
}

/* ─── Tags ─── */
.tag-row {
  display: flex;
  gap: 0.6rem;
  justify-content: center;
  flex-wrap: wrap;
}

.tag {
  font-size: 0.78rem;
  font-weight: 600;
  padding: 0.3rem 0.85rem;
  border-radius: 20px;
}

.tag--mint {
  background: rgba(149, 209, 170, 0.15);
  color: #95D1AA;
  border: 1px solid rgba(149, 209, 170, 0.4);
}

.tag--teal {
  background: rgba(114, 160, 152, 0.15);
  color: #72A098;
  border: 1px solid rgba(114, 160, 152, 0.4);
}

.tag--lavande {
  background: rgba(213, 181, 234, 0.15);
  color: #AD81BE;
  border: 1px solid rgba(213, 181, 234, 0.4);
}
</style>
