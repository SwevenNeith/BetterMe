<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../lib/supabase.js'

const router = useRouter()
const isCheckingSession = ref(true)

onMounted(async () => {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session) {
      router.push('/dashboard')
      return
    }
  } catch (error) {
    console.error('Error checking session:', error)
  } finally {
    isCheckingSession.value = false
  }
})

const baseUrl = import.meta.env.BASE_URL || '/'

const isLogin = ref(true)
const name = ref('')
const email = ref('')
const password = ref('')
const errorMessage = ref('')
const isLoading = ref(false)

const toggleMode = () => {
  isLogin.value = !isLogin.value
  errorMessage.value = ''
  name.value = ''
  email.value = ''
  password.value = ''
}

const getErrorMessage = (error) => {
  const msg = error?.message?.toLowerCase() ?? ''
  if (!email.value || !password.value) return 'Veuillez remplir tous les champs.'
  if (!isLogin.value && !name.value) return 'Veuillez entrer votre nom complet.'
  if (msg.includes('user already registered') || msg.includes('already been registered'))
    return 'Cet email est déjà utilisé. Essayez de vous connecter.'
  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials'))
    return 'Email ou mot de passe incorrect.'
  if (msg.includes('password should be at least'))
    return 'Le mot de passe doit contenir au moins 6 caractères.'
  if (msg.includes('unable to validate email address')) return 'Adresse email invalide.'
  return error?.message ?? 'Une erreur est survenue. Veuillez réessayer.'
}

const handleSubmit = async () => {
  errorMessage.value = ''

  if (!email.value || !password.value || (!isLogin.value && !name.value)) {
    errorMessage.value = 'Veuillez remplir tous les champs.'
    return
  }

  isLoading.value = true

  try {
    if (isLogin.value) {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.value,
        password: password.value,
      })
      if (error) throw error
    } else {
      const { error } = await supabase.auth.signUp({
        email: email.value,
        password: password.value,
        options: {
          data: { nom: name.value },
        },
      })
      if (error) throw error
    }

    router.push('/dashboard')
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="auth-wrapper">
    <div class="auth-header-outside">
      <img :src="baseUrl + 'icon-512.png'" alt="BetterMe Logo" class="logo" />
      <h1 class="app-name">BetterMe</h1>
      <p class="subtitle">{{ isLogin ? 'Bon retour parmi nous !' : 'Commencez votre aventure' }}</p>
    </div>

    <div class="auth-card">
      <div v-if="isCheckingSession" class="loading-session">
        <span class="spinner"></span>
        <p>Connexion automatique...</p>
      </div>
      <template v-else>
        <form class="auth-form" @submit.prevent="handleSubmit">
          <div class="input-group" v-if="!isLogin">
            <label for="name">Nom complet</label>
            <input
              v-model="name"
              type="text"
              id="name"
              placeholder="John Doe"
              autocomplete="name"
            />
          </div>

          <div class="input-group">
            <label for="email">Email</label>
            <input
              v-model="email"
              type="email"
              id="email"
              placeholder="john@example.com"
              autocomplete="email"
            />
          </div>

          <div class="input-group">
            <label for="password">Mot de passe</label>
            <input
              v-model="password"
              type="password"
              id="password"
              placeholder="••••••••"
              autocomplete="current-password"
            />
          </div>

          <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>

          <button type="submit" class="submit-btn" :disabled="isLoading">
            <span v-if="isLoading" class="spinner"></span>
            <span v-else>{{ isLogin ? 'Se connecter' : "S'inscrire" }}</span>
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
      </template>
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
  background: linear-gradient(-45deg, #d5b5ea, #72a098, #8fa2d4, #95d1aa, #fedfed, #ad81be);
  background-size: 400% 400%;
  animation: gradientBG 15s ease infinite;
  overflow: hidden;
  padding: 1rem;
}

@keyframes gradientBG {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
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
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.15));
}

@keyframes bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
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
  color: #ad81be;
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
  border-color: #d5b5ea;
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
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  font-size: 1.05rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
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
  color: #ad81be;
  font-weight: 700;
  text-decoration: none;
  margin-left: 0.5rem;
  transition: color 0.2s ease;
}

.toggle-link:hover {
  color: #d5b5ea;
  text-decoration: underline;
}

.error-message {
  background: rgba(255, 80, 80, 0.1);
  border: 1px solid rgba(255, 80, 80, 0.35);
  color: #c0392b;
  font-size: 0.875rem;
  font-weight: 500;
  padding: 0.65rem 1rem;
  border-radius: 10px;
  text-align: center;
  animation: fadeIn 0.2s ease;
}

@media (prefers-color-scheme: dark) {
  .error-message {
    color: #ff8a80;
    background: rgba(255, 80, 80, 0.15);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.submit-btn:disabled {
  opacity: 0.75;
  cursor: not-allowed;
  transform: none;
}

/* Loading spinner inside button */
.spinner {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 2.5px solid rgba(255, 255, 255, 0.4);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  vertical-align: middle;
}

.loading-session {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem 0;
  gap: 1.25rem;
  color: #ad81be;
  font-weight: 600;
  font-size: 1.05rem;
}

.loading-session .spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(213, 181, 234, 0.3);
  border-top-color: #ad81be;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
