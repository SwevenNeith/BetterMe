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

const handleLogout = async () => {
  await supabase.auth.signOut();
  router.push('/');
};
</script>

<template>
  <div class="dashboard-wrapper">
    <!-- Subtle background gradient -->
    <div class="bg-gradient"></div>

    <header class="dashboard-header">
      <div class="header-brand">
        <img src="/favicon.ico" alt="BetterMe" class="header-logo" />
        <span class="header-title">BetterMe</span>
      </div>
      <button class="logout-btn" @click="handleLogout">
        Se déconnecter
      </button>
    </header>

    <main class="dashboard-main">
      <div class="welcome-card">
        <div class="welcome-badge">✨ Tableau de bord</div>
        <h1 class="welcome-title">
          Bienvenue, <span class="highlight">{{ userName }}</span> !
        </h1>
        <p class="welcome-text">
          Ton espace personnel BetterMe est prêt. Les fonctionnalités arrivent bientôt&nbsp;🚀
        </p>
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
    </main>
  </div>
</template>

<style scoped>
.dashboard-wrapper {
  position: relative;
  min-height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
  background-color: #f9f6fd;
  overflow: hidden;
}

@media (prefers-color-scheme: dark) {
  .dashboard-wrapper {
    background-color: #1a1724;
  }
}

/* Subtle top-left blob using primary Lavande */
.bg-gradient {
  position: absolute;
  top: -150px;
  right: -150px;
  width: 500px;
  height: 500px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(213, 181, 234, 0.35) 0%, transparent 70%);
  z-index: 0;
  pointer-events: none;
}

/* ─── Header ─── */
.dashboard-header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(213, 181, 234, 0.3);
  box-shadow: 0 2px 12px rgba(173, 129, 190, 0.1);
}

@media (prefers-color-scheme: dark) {
  .dashboard-header {
    background: rgba(30, 26, 40, 0.85);
    border-bottom: 1px solid rgba(213, 181, 234, 0.15);
  }
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.header-logo {
  width: 32px;
  height: 32px;
}

.header-title {
  font-size: 1.2rem;
  font-weight: 800;
  color: #AD81BE;
  letter-spacing: -0.3px;
}

.logout-btn {
  padding: 0.5rem 1.1rem;
  border: 1.5px solid #D5B5EA;
  border-radius: 10px;
  background: transparent;
  color: #AD81BE;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;
}

.logout-btn:hover {
  background: #D5B5EA;
  color: #ffffff;
  transform: translateY(-1px);
}

/* ─── Main ─── */
.dashboard-main {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 2rem 1rem;
}

/* ─── Welcome Card ─── */
.welcome-card {
  width: 100%;
  max-width: 560px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 24px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  box-shadow: 0 12px 40px rgba(173, 129, 190, 0.15);
  padding: 2.5rem 2rem;
  text-align: center;
}

@media (prefers-color-scheme: dark) {
  .welcome-card {
    background: rgba(30, 26, 40, 0.85);
    border: 1px solid rgba(213, 181, 234, 0.2);
  }
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
  font-size: 1.9rem;
  font-weight: 800;
  color: #2c3e50;
  margin-bottom: 0.75rem;
  line-height: 1.2;
}

@media (prefers-color-scheme: dark) {
  .welcome-title {
    color: #f0e8f8;
  }
}

.highlight {
  background: linear-gradient(135deg, #D5B5EA, #AD81BE);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.welcome-text {
  font-size: 1rem;
  color: #6c757d;
  margin-bottom: 2rem;
  line-height: 1.6;
}

@media (prefers-color-scheme: dark) {
  .welcome-text {
    color: #adb5bd;
  }
}

/* ─── Stats Row (using Vert Menthe & Gris-sarcelle) ─── */
.stats-row {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  flex: 1;
  min-width: 90px;
  background: linear-gradient(135deg, rgba(149, 209, 170, 0.12), rgba(114, 160, 152, 0.12));
  border: 1px solid rgba(149, 209, 170, 0.35);
  border-radius: 16px;
  padding: 1rem 0.75rem;
  transition: transform 0.2s ease;
}

.stat-card:hover {
  transform: translateY(-3px);
}

.stat-icon {
  font-size: 1.4rem;
}

.stat-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: #72A098;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.stat-value {
  font-size: 1.3rem;
  font-weight: 800;
  color: #95D1AA;
}
</style>
