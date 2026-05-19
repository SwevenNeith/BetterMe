<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../lib/supabase.js'
import { listDailyReminders, saveDailyReminders } from '../services/dailyReminders.js'
import {
  notificationsActives,
  notificationsSupportees,
  activerNotificationsUtilisateur,
  testerNotificationPush,
  declencherCronNotifications,
} from '../services/notifications.js'

const router = useRouter()

const isLoading = ref(true)
const isSaving = ref(false)
const userId = ref(null)
const reminders = ref([])
const saveMessage = ref('')
const saveError = ref('')
const isTestingPush = ref(false)
const isRunningCron = ref(false)

function newEmptyReminder() {
  return {
    id: null,
    reminder_time: '09:00',
    title: 'BetterMe',
    body: '',
  }
}

const loadReminders = async () => {
  if (!userId.value) return
  isLoading.value = true
  saveError.value = ''
  try {
    const rows = await listDailyReminders(supabase, userId.value)
    reminders.value = rows.map((r) => ({ ...r }))
  } catch (err) {
    console.error(err)
    saveError.value = err.message || 'Impossible de charger les rappels.'
  } finally {
    isLoading.value = false
  }
}

const addReminder = () => {
  reminders.value.push(newEmptyReminder())
}

const removeReminder = (index) => {
  reminders.value.splice(index, 1)
}

const onSave = async () => {
  if (!userId.value) return
  isSaving.value = true
  saveMessage.value = ''
  saveError.value = ''

  try {
    const saved = await saveDailyReminders(supabase, userId.value, reminders.value)
    reminders.value = saved.map((r) => ({ ...r }))
    saveMessage.value = 'Rappels enregistrés.'
    setTimeout(() => {
      saveMessage.value = ''
    }, 3000)
  } catch (err) {
    saveError.value = err.message || 'Erreur lors de la sauvegarde.'
  } finally {
    isSaving.value = false
  }
}

const onActiverNotifications = async () => {
  const result = await activerNotificationsUtilisateur(supabase)
  if (result.success) {
    await loadReminders()
  }
}

const onNotificationsGranted = () => {
  loadReminders()
}

const onTestPush = async () => {
  if (!userId.value) return
  isTestingPush.value = true
  saveError.value = ''
  const ok = await testerNotificationPush(userId.value, 'BetterMe', 'Notification Test')
  isTestingPush.value = false
  saveMessage.value = ok
    ? 'Notification test envoyée (vérifie tes appareils).'
    : "Échec de l'envoi — vérifie push_subscriptions et le déploiement de l'Edge Function."
  setTimeout(() => {
    saveMessage.value = ''
  }, 4000)
}

const onRunCronNow = async () => {
  isRunningCron.value = true
  saveError.value = ''
  const ok = await declencherCronNotifications()
  isRunningCron.value = false
  saveMessage.value = ok
    ? 'Vérification des rappels effectuée (heure actuelle à Paris).'
    : 'Échec — redéploie send-notification et configure le cron Supabase.'
  setTimeout(() => {
    saveMessage.value = ''
  }, 4000)
}

onMounted(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    router.push('/')
    return
  }
  userId.value = user.id
  await loadReminders()
  window.addEventListener('betterme-notifications-granted', onNotificationsGranted)
})

onUnmounted(() => {
  window.removeEventListener('betterme-notifications-granted', onNotificationsGranted)
})
</script>

<template>
  <div class="settings-wrapper">
    <header class="settings-header">
      <h1 class="settings-title">Réglages</h1>
      <p class="settings-subtitle">Gère tes rappels quotidiens et tes notifications.</p>
    </header>

    <section class="settings-card">
      <div class="card-head">
        <h2>Rappels quotidiens</h2>
        <p>Chaque rappel envoie une notification push à l'heure choisie (plusieurs par jour possibles).</p>
      </div>

      <div v-if="!notificationsSupportees()" class="settings-alert settings-alert--warn">
        Ton navigateur ne supporte pas les notifications push sur cet appareil.
      </div>

      <div v-else-if="!notificationsActives()" class="settings-alert">
        <p>Active les notifications pour recevoir tes rappels.</p>
        <button type="button" class="btn btn--secondary" @click="onActiverNotifications">
          Autoriser les notifications
        </button>
      </div>

      <div v-else class="settings-test-actions">
        <button
          type="button"
          class="btn btn--secondary"
          :disabled="isTestingPush"
          @click="onTestPush"
        >
          {{ isTestingPush ? 'Envoi…' : 'Tester une notification maintenant' }}
        </button>
        <button
          type="button"
          class="btn btn--ghost"
          :disabled="isRunningCron"
          @click="onRunCronNow"
        >
          {{ isRunningCron ? 'Vérification…' : 'Vérifier les rappels maintenant' }}
        </button>
      </div>

      <div v-if="isLoading" class="settings-loading">Chargement…</div>

      <p v-else-if="reminders.length === 0" class="settings-empty">
        Aucun rappel pour l'instant. Ajoute-en avec le bouton ci-dessous, puis enregistre.
      </p>

      <div v-else class="reminders-list">
        <article
          v-for="(reminder, index) in reminders"
          :key="reminder.id ?? `new-${index}`"
          class="reminder-row"
        >
          <div class="reminder-fields">
            <label class="field">
              <span>Heure</span>
              <input v-model="reminder.reminder_time" type="time" required />
            </label>
            <label class="field field--grow">
              <span>Titre</span>
              <input v-model="reminder.title" type="text" maxlength="80" />
            </label>
          </div>
          <label class="field field--full">
            <span>Message</span>
            <input v-model="reminder.body" type="text" maxlength="200" placeholder="Texte de la notification" />
          </label>
          <button
            type="button"
            class="btn-remove"
            title="Supprimer"
            @click="removeReminder(index)"
          >
            Supprimer
          </button>
        </article>
      </div>

      <p v-if="saveError" class="settings-feedback settings-feedback--error">{{ saveError }}</p>
      <p v-if="saveMessage" class="settings-feedback settings-feedback--ok">{{ saveMessage }}</p>

      <div class="settings-actions">
        <button type="button" class="btn btn--ghost" :disabled="isLoading" @click="addReminder">
          + Ajouter un rappel
        </button>
        <button
          type="button"
          class="btn btn--primary"
          :disabled="isLoading || isSaving"
          @click="onSave"
        >
          {{ isSaving ? 'Enregistrement…' : 'Enregistrer' }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.settings-wrapper {
  flex: 1;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
}

.settings-header {
  margin-bottom: 1.5rem;
  text-align: center;
}

.settings-title {
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  margin: 0;
}

.settings-subtitle {
  margin: 0.5rem 0 0;
  color: #6c757d;
  font-size: 1rem;
}

@media (prefers-color-scheme: dark) {
  .settings-title {
    color: #f0e8f8;
  }
  .settings-subtitle {
    color: #adb5bd;
  }
}

.settings-card {
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.25);
  border-radius: 20px;
  padding: 1.5rem;
  box-shadow: 0 8px 32px rgba(173, 129, 190, 0.08);
}

@media (prefers-color-scheme: dark) {
  .settings-card {
    background: rgba(25, 20, 35, 0.65);
    border-color: rgba(213, 181, 234, 0.15);
  }
}

.card-head h2 {
  margin: 0 0 0.35rem;
  font-size: 1.25rem;
  font-weight: 800;
  color: #ad81be;
}

.card-head p {
  margin: 0 0 1.25rem;
  font-size: 0.9rem;
  color: #6c757d;
  line-height: 1.45;
}

@media (prefers-color-scheme: dark) {
  .card-head p {
    color: #adb5bd;
  }
}

.settings-alert {
  padding: 1rem;
  border-radius: 12px;
  background: rgba(213, 181, 234, 0.15);
  margin-bottom: 1rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.settings-alert--warn {
  background: rgba(255, 193, 7, 0.12);
}

.settings-alert p {
  margin: 0;
  flex: 1;
  font-size: 0.9rem;
  color: #4f5f6f;
}

.settings-loading {
  text-align: center;
  padding: 2rem;
  color: #8c98a4;
  font-weight: 600;
}

.settings-empty {
  margin: 0 0 1rem;
  padding: 1.25rem;
  text-align: center;
  font-size: 0.9rem;
  color: #6c757d;
  background: rgba(213, 181, 234, 0.1);
  border-radius: 12px;
  line-height: 1.45;
}

@media (prefers-color-scheme: dark) {
  .settings-empty {
    color: #adb5bd;
  }
}

.reminders-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.reminder-row {
  padding: 1rem;
  border-radius: 14px;
  border: 1px solid rgba(213, 181, 234, 0.25);
  background: rgba(255, 255, 255, 0.5);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

@media (prefers-color-scheme: dark) {
  .reminder-row {
    background: rgba(0, 0, 0, 0.15);
    border-color: rgba(213, 181, 234, 0.12);
  }
}

.reminder-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 120px;
}

.field--grow {
  flex: 1;
  min-width: 160px;
}

.field--full {
  width: 100%;
}

.field span {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #ad81be;
}

.field input {
  padding: 0.55rem 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  font-size: 0.95rem;
  background: rgba(255, 255, 255, 0.9);
  color: #2c3e50;
}

@media (prefers-color-scheme: dark) {
  .field input {
    background: rgba(30, 25, 40, 0.9);
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.2);
  }
}

.btn-remove {
  align-self: flex-end;
  border: none;
  background: transparent;
  color: #c0392b;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
}

.btn-remove:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.settings-test-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.settings-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: flex-end;
  margin-top: 1.25rem;
}

.btn {
  border: none;
  border-radius: 12px;
  padding: 0.65rem 1.15rem;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn--primary {
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  box-shadow: 0 4px 12px rgba(173, 129, 190, 0.35);
}

.btn--primary:hover:not(:disabled) {
  transform: translateY(-1px);
}

.btn--primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn--ghost {
  background: rgba(213, 181, 234, 0.2);
  color: #ad81be;
}

.btn--secondary {
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  font-size: 0.85rem;
  padding: 0.5rem 1rem;
}

.settings-feedback {
  margin: 1rem 0 0;
  font-size: 0.9rem;
  font-weight: 600;
}

.settings-feedback--error {
  color: #c0392b;
}

.settings-feedback--ok {
  color: #27ae60;
}
</style>
