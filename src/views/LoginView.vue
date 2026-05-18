<script setup>
import { ref } from 'vue';

const isLogin = ref(true);

const toggleMode = () => {
  isLogin.value = !isLogin.value;
};
</script>

<template>
  <div class="auth-wrapper">
    <div class="auth-header-outside">
      <img src="/favicon.ico" alt="BetterMe Logo" class="logo" />
      <h1 class="app-name">BetterMe</h1>
      <p class="subtitle">{{ isLogin ? 'Bon retour parmi nous !' : 'Commencez votre aventure' }}</p>
    </div>

    <div class="auth-card">
      <form class="auth-form" @submit.prevent>
        <div class="input-group" v-if="!isLogin">
          <label for="name">Nom complet</label>
          <input type="text" id="name" placeholder="John Doe" />
        </div>
        
        <div class="input-group">
          <label for="email">Email</label>
          <input type="email" id="email" placeholder="john@example.com" />
        </div>

        <div class="input-group">
          <label for="password">Mot de passe</label>
          <input type="password" id="password" placeholder="••••••••" />
        </div>

        <button type="submit" class="submit-btn">
          {{ isLogin ? 'Se connecter' : "S'inscrire" }}
        </button>
      </form>

      <div class="auth-footer">
        <p>
          {{ isLogin ? "Vous n'avez pas de compte ?" : 'Déjà un compte ?' }}
          <a href="#" @click.prevent="toggleMode" class="toggle-link">
            {{ isLogin ? "S'inscrire" : 'Se connecter' }}
          </a>
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-wrapper {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: linear-gradient(-45deg, #D5B5EA, #72A098, #8FA2D4, #95D1AA, #FEDFED, #AD81BE);
  background-size: 400% 400%;
  animation: gradientBG 15s ease infinite;
  overflow: hidden;
  padding: 1rem;
}

@keyframes gradientBG {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

.auth-header-outside {
  text-align: center;
  margin-bottom: 1.5rem;
  z-index: 1;
  flex-shrink: 0;
}

.logo {
  width: 60px;
  height: 60px;
  margin-bottom: 0.5rem;
  animation: bounce 3s infinite ease-in-out;
  filter: drop-shadow(0 4px 10px rgba(0,0,0,0.15));
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

.app-name {
  font-size: 2.5rem;
  font-weight: 800;
  color: #ffffff;
  margin-bottom: 0.5rem;
  text-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  letter-spacing: -0.5px;
}

.subtitle {
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.95);
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  font-weight: 500;
}

.auth-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 420px;
  padding: 2.5rem 2rem;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 24px;
  border: 1px solid rgba(213, 181, 234, 0.4);
  box-shadow: 0 12px 40px rgba(173, 129, 190, 0.25);
  transition: transform 0.3s ease;
  flex-shrink: 0;
  margin-bottom: 0;
}

@media (prefers-color-scheme: dark) {
  .auth-card {
    background: rgba(30, 30, 40, 0.8);
    border: 1px solid rgba(213, 181, 234, 0.3);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
  }
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  text-align: left;
}

.input-group label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #AD81BE;
  margin-left: 0.25rem;
}

.input-group input {
  padding: 0.85rem 1rem;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: rgba(255, 255, 255, 0.6);
  color: var(--color-text);
  font-size: 1rem;
  outline: none;
  transition: all 0.2s ease;
}

@media (prefers-color-scheme: dark) {
  .input-group input {
    background: rgba(0, 0, 0, 0.3);
    color: #fff;
  }
}

.input-group input:focus {
  border-color: #D5B5EA;
  box-shadow: 0 0 0 3px rgba(213, 181, 234, 0.3);
  background: rgba(255, 255, 255, 0.95);
}

@media (prefers-color-scheme: dark) {
  .input-group input:focus {
    background: rgba(0, 0, 0, 0.6);
  }
}

.submit-btn {
  margin-top: 1rem;
  padding: 1rem;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #D5B5EA, #AD81BE);
  color: white;
  font-size: 1.05rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  box-shadow: 0 4px 15px rgba(213, 181, 234, 0.4);
}

.submit-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(213, 181, 234, 0.6);
}

.submit-btn:active {
  transform: translateY(0);
}

.auth-footer {
  margin-top: 2rem;
  text-align: center;
  font-size: 0.95rem;
  color: var(--color-text-light);
}

.toggle-link {
  color: #AD81BE;
  font-weight: 700;
  text-decoration: none;
  margin-left: 0.5rem;
  transition: color 0.2s ease;
}

.toggle-link:hover {
  color: #D5B5EA;
  text-decoration: underline;
}
</style>
