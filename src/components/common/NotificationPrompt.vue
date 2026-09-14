<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '../lib/supabase.js'
import {
  notificationsSupportees,
  obtenirEtatNotifications,
  activerNotificationsUtilisateur,
  synchroniserNotificationsAccordees,
} from '../services/notifications.js'

const visible = ref(false)
const denied = ref(false)
const unsupported = ref(false)
const loading = ref(false)
const errorMessage = ref('')

async function refreshEtat() {
  errorMessage.value = ''

  if (!notificationsSupportees()) {
    unsupported.value = true
    visible.value = true
    return
  }

  const etat = await obtenirEtatNotifications()

  if (etat.showDeniedHelp) {
    denied.value = true
    visible.value = true
    return
  }

  if (etat.permission === 'granted') {
    visible.value = false
    await synchroniserNotificationsAccordees(supabase)
    return
  }

  if (etat.showPrompt) {
    denied.value = false
    visible.value = true
  }
}

onMounted(refreshEtat)

async function onAutoriser() {
  loading.value = true
  errorMessage.value = ''

  const result = await activerNotificationsUtilisateur(supabase)
  loading.value = false

  if (result.success) {
    visible.value = false
    return
  }

  if (result.reason === 'denied') {
    denied.value = true
    return
  }

  if (result.reason === 'subscription_failed') {
    errorMessage.value =
      "Permission accordée, mais l'enregistrement a échoué. Vérifie les droits Supabase (table push_subscriptions)."
    return
  }

  errorMessage.value = 'Autorisation annulée ou en attente.'
}
</script>

<template>
  <div
    v-if="visible"
    class="notif-prompt"
    role="region"
    aria-label="Activation des notifications"
  >
    <div class="notif-prompt-inner">
      <p class="notif-prompt-icon" aria-hidden="true">🔔</p>

      <div v-if="unsupported" class="notif-prompt-text">
        <strong>Notifications non disponibles</strong>
        <span>
          Ton navigateur ou appareil ne prend pas en charge les notifications push. Essaie Chrome,
          Firefox ou Safari récent (idéalement en installant l'app sur l'écran d'accueil sur
          iPhone).
        </span>
      </div>

      <div v-else-if="denied" class="notif-prompt-text">
        <strong>Notifications bloquées</strong>
        <span>
          Tu as refusé les notifications. Pour les activer : icône à gauche de l'URL →
          Notifications → Autoriser, puis recharge la page.
        </span>
      </div>

      <div v-else class="notif-prompt-text">
        <strong>Active tes notifications</strong>
        <span>
          Reçois tes rappels BetterMe (dashboard, emploi du temps, etc.) sur ordinateur et téléphone.
        </span>
      </div>

      <p v-if="errorMessage" class="notif-prompt-error">{{ errorMessage }}</p>

      <div v-if="!unsupported && !denied" class="notif-prompt-actions">
        <button type="button" class="notif-btn notif-btn--primary" :disabled="loading" @click="onAutoriser">
          {{ loading ? 'Activation…' : 'Autoriser les notifications' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.notif-prompt {
  position: sticky;
  top: 0;
  z-index: 50;
  width: 100%;
  padding: 0.75rem 1rem 0;
  box-sizing: border-box;
}

@media (max-width: 768px) {
  .notif-prompt {
    padding-top: 0.25rem;
  }
}

.notif-prompt-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1rem;
  max-width: 1000px;
  margin: 0 auto;
  padding: 1rem 1.25rem;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.45);
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(173, 129, 190, 0.12);
}

@media (prefers-color-scheme: dark) {
  .notif-prompt-inner {
    background: rgba(25, 20, 35, 0.92);
    border-color: rgba(213, 181, 234, 0.2);
  }
}

.notif-prompt-icon {
  font-size: 1.75rem;
  margin: 0;
  line-height: 1;
}

.notif-prompt-text {
  flex: 1;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.notif-prompt-text strong {
  font-size: 0.95rem;
  font-weight: 800;
  color: #2c3e50;
}

.notif-prompt-text span {
  font-size: 0.85rem;
  color: #6c757d;
  line-height: 1.4;
}

@media (prefers-color-scheme: dark) {
  .notif-prompt-text strong {
    color: #f0e8f8;
  }
  .notif-prompt-text span {
    color: #adb5bd;
  }
}

.notif-prompt-error {
  width: 100%;
  margin: 0;
  font-size: 0.8rem;
  color: #c0392b;
  font-weight: 600;
}

.notif-prompt-actions {
  display: flex;
  flex-shrink: 0;
}

.notif-btn {
  border: none;
  border-radius: 12px;
  padding: 0.65rem 1.1rem;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.notif-btn--primary {
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  box-shadow: 0 4px 12px rgba(173, 129, 190, 0.35);
}

.notif-btn--primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(173, 129, 190, 0.45);
}

.notif-btn--primary:disabled {
  opacity: 0.7;
  cursor: wait;
}
</style>
