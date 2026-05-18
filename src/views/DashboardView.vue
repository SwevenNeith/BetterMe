<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '../lib/supabase.js';
import { useRouter } from 'vue-router';

const router = useRouter();
const userName = ref('');

onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    router.push('/');
    return;
  }
  userName.value = user.user_metadata?.nom ?? user.email;
});
</script>

<template>
  <div class="dashboard-wrapper">
    <div class="bg-blob"></div>

    <div class="page-header">
      <div class="welcome-badge">✨ Tableau de bord</div>
      <h1 class="welcome-title">
        Bienvenue, <span class="highlight">{{ userName }}</span>&nbsp;!
      </h1>
      <p class="welcome-text">
        Ton espace personnel BetterMe est prêt. Les fonctionnalités arrivent bientôt&nbsp;🚀
      </p>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <span class="stat-icon">🎯</span>
        <span class="stat-label">Objectifs</span>
        <span class="stat-value">—</span>
      </div>
      <div class="stat-card">
        <span class="stat-icon">🌿</span>
        <span class="stat-label">Habitudes</span>
        <span class="stat-value">—</span>
      </div>
      <div class="stat-card">
        <span class="stat-icon">📈</span>
        <span class="stat-label">Progression</span>
        <span class="stat-value">—</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-wrapper {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.5rem;
  min-height: 100%;
  overflow: hidden;
  gap: 2rem;
}

/* Decorative blob — Lavande */
.bg-blob {
  position: absolute;
  top: -120px;
  right: -120px;
  width: 480px;
  height: 480px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(213, 181, 234, 0.3) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}

.page-header {
  position: relative;
  z-index: 1;
  text-align: center;
  max-width: 560px;
  width: 100%;
}

.welcome-badge {
  display: inline-block;
  background: linear-gradient(135deg, rgba(213, 181, 234, 0.25), rgba(149, 209, 170, 0.25));
  color: #AD81BE;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  padding: 0.35rem 1rem;
  border-radius: 20px;
  margin-bottom: 1.25rem;
  border: 1px solid rgba(213, 181, 234, 0.4);
}

.welcome-title {
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  margin-bottom: 0.75rem;
  line-height: 1.2;
}

@media (prefers-color-scheme: dark) {
  .welcome-title { color: #f0e8f8; }
}

.highlight {
  background: linear-gradient(135deg, #D5B5EA, #AD81BE);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.welcome-text {
  font-size: 1rem;
  color: #6c757d;
  line-height: 1.6;
}

@media (prefers-color-scheme: dark) {
  .welcome-text { color: #adb5bd; }
}

/* ─── Stats (Vert Menthe & Gris-sarcelle) ─── */
.stats-row {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
  width: 100%;
  max-width: 560px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  flex: 1;
  min-width: 120px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(149, 209, 170, 0.35);
  border-radius: 20px;
  padding: 1.5rem 1rem;
  box-shadow: 0 4px 20px rgba(114, 160, 152, 0.1);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

@media (prefers-color-scheme: dark) {
  .stat-card {
    background: rgba(25, 30, 25, 0.75);
    border: 1px solid rgba(149, 209, 170, 0.2);
  }
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(114, 160, 152, 0.18);
}

.stat-icon { font-size: 1.6rem; }

.stat-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: #72A098;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.stat-value {
  font-size: 1.4rem;
  font-weight: 800;
  color: #95D1AA;
}
</style>
