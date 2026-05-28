<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../lib/supabase.js'
import {
  listDailyReminders,
  saveDailyReminders,
  deleteDailyReminder,
} from '../services/dailyReminders.js'
import {
  loadStandaloneScheduledGrouped,
  createOneTimeReminder,
  createStandaloneTimer,
  deleteOneTimeReminder,
  getLocalTodayISO,
  formatScheduledAtLocal,
  getScheduledDisplayBody,
} from '../services/scheduledReminders.js'
import { formatDelaiAvantEvenement } from '../services/notifications.js'
import {
  notificationsActives,
  notificationsSupportees,
  activerNotificationsUtilisateur,
  testerNotificationPush,
  declencherCronNotifications,
} from '../services/notifications.js'
import { listCyclesPilule } from '../services/menstruationCycles.js'
import { listCyclesNaturel } from '../services/menstruationCyclesNaturel.js'
import {
  createDefaultMenstruationNotifSettings,
  loadMenstruationNotifSettings,
  saveMenstruationNotifSettings,
  rescheduleMenstruationEstimatedNotifications,
  rescheduleMenstruationNaturalPhaseNotifications,
} from '../services/menstruationNotifications.js'

const router = useRouter()

const ONE_TIME_REFRESH_MS = 30_000
let oneTimeRefreshIntervalId = null

const isLoading = ref(true)
const isSaving = ref(false)
const userId = ref(null)
const reminders = ref([])
const saveMessage = ref('')
const saveError = ref('')
const isTestingPush = ref(false)
const isRunningCron = ref(false)
const deletingIndex = ref(null)
const menstruationNotifSettings = ref(createDefaultMenstruationNotifSettings())
const isSavingMenstruationNotif = ref(false)
const menstruationNotifMessage = ref('')
const menstruationNotifError = ref('')

const oneTimeUpcoming = ref([])
const oneTimeFailed = ref([])
const standaloneTimersUpcoming = ref([])
const standaloneTimersFailed = ref([])
const isLoadingOneTime = ref(true)
const isPlanningOneTime = ref(false)
const isStartingTimer = ref(false)
const deletingOneTimeId = ref(null)
const oneTimeMessage = ref('')
const oneTimeError = ref('')
const timerMessage = ref('')
const timerError = ref('')
const standaloneTimerForm = ref({
  title: 'BetterMe',
  body: '',
  duration_hours: 0,
  duration_minutes: 15,
})
const localToday = getLocalTodayISO()
const oneTimeForm = ref({
  title: 'BetterMe',
  body: '',
  scheduled_date: localToday,
  scheduled_time: '12:00',
})

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

const removeReminder = async (index) => {
  const reminder = reminders.value[index]
  if (!reminder || !userId.value) return

  deletingIndex.value = index
  saveError.value = ''
  saveMessage.value = ''

  try {
    if (reminder.id) {
      await deleteDailyReminder(supabase, userId.value, reminder.id)
    }
    reminders.value.splice(index, 1)
    saveMessage.value = 'Rappel supprimé.'
    setTimeout(() => {
      saveMessage.value = ''
    }, 2500)
  } catch (err) {
    saveError.value = err.message || 'Impossible de supprimer ce rappel.'
  } finally {
    deletingIndex.value = null
  }
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
  loadOneTimeReminders()
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

const loadStandaloneScheduled = async () => {
  if (!userId.value) return
  isLoadingOneTime.value = true
  oneTimeError.value = ''
  timerError.value = ''
  try {
    const { ponctuel, timers } = await loadStandaloneScheduledGrouped(supabase, userId.value)
    oneTimeUpcoming.value = ponctuel.upcoming
    oneTimeFailed.value = ponctuel.failed
    standaloneTimersUpcoming.value = timers.upcoming
    standaloneTimersFailed.value = timers.failed
  } catch (err) {
    console.error(err)
    oneTimeError.value = err.message || 'Impossible de charger les notifications planifiées.'
  } finally {
    isLoadingOneTime.value = false
  }
}

const loadOneTimeReminders = loadStandaloneScheduled

const resetOneTimeForm = () => {
  oneTimeForm.value = {
    title: 'BetterMe',
    body: '',
    scheduled_date: getLocalTodayISO(),
    scheduled_time: '12:00',
  }
}

const onPlanOneTimeReminder = async () => {
  if (!userId.value) return
  isPlanningOneTime.value = true
  oneTimeMessage.value = ''
  oneTimeError.value = ''

  try {
    const created = await createOneTimeReminder(supabase, userId.value, {
      title: oneTimeForm.value.title,
      body: oneTimeForm.value.body,
      scheduledDate: oneTimeForm.value.scheduled_date,
      scheduledTime: oneTimeForm.value.scheduled_time,
    })
    await loadOneTimeReminders()
    resetOneTimeForm()
    oneTimeMessage.value = `Rappel planifié pour le ${formatScheduledAtLocal(created.scheduled_at)}.`
    setTimeout(() => {
      oneTimeMessage.value = ''
    }, 3000)
  } catch (err) {
    oneTimeError.value = err.message || 'Impossible de planifier ce rappel.'
  } finally {
    isPlanningOneTime.value = false
  }
}

const onStartStandaloneTimer = async () => {
  if (!userId.value) return
  isStartingTimer.value = true
  timerMessage.value = ''
  timerError.value = ''

  try {
    const durationLabel = formatDelaiAvantEvenement(
      standaloneTimerForm.value.duration_hours,
      standaloneTimerForm.value.duration_minutes,
    )
    const created = await createStandaloneTimer(supabase, userId.value, {
      title: standaloneTimerForm.value.title,
      body: standaloneTimerForm.value.body,
      durationHours: standaloneTimerForm.value.duration_hours,
      durationMinutes: standaloneTimerForm.value.duration_minutes,
    })
    await loadStandaloneScheduled()
    standaloneTimerForm.value = {
      title: 'BetterMe',
      body: '',
      duration_hours: 0,
      duration_minutes: 15,
    }
    timerMessage.value = `Timer lancé — fin prévue le ${formatScheduledAtLocal(created.scheduled_at)} (${durationLabel}).`
    setTimeout(() => {
      timerMessage.value = ''
    }, 4000)
  } catch (err) {
    timerError.value = err.message || 'Impossible de démarrer ce timer.'
  } finally {
    isStartingTimer.value = false
  }
}

const onRemoveOneTimeReminder = async (reminderId) => {
  if (!userId.value) return
  deletingOneTimeId.value = reminderId
  oneTimeError.value = ''
  oneTimeMessage.value = ''

  try {
    await deleteOneTimeReminder(supabase, userId.value, reminderId)
    oneTimeUpcoming.value = oneTimeUpcoming.value.filter((r) => r.id !== reminderId)
    oneTimeFailed.value = oneTimeFailed.value.filter((r) => r.id !== reminderId)
    standaloneTimersUpcoming.value = standaloneTimersUpcoming.value.filter(
      (r) => r.id !== reminderId,
    )
    standaloneTimersFailed.value = standaloneTimersFailed.value.filter((r) => r.id !== reminderId)
    oneTimeMessage.value = 'Notification planifiée annulée.'
    setTimeout(() => {
      oneTimeMessage.value = ''
    }, 2500)
  } catch (err) {
    oneTimeError.value = err.message || 'Impossible d’annuler ce rappel.'
  } finally {
    deletingOneTimeId.value = null
  }
}

const onRunCronNow = async () => {
  isRunningCron.value = true
  saveError.value = ''
  const ok = await declencherCronNotifications()
  isRunningCron.value = false
  if (ok) {
    await loadOneTimeReminders()
  }
  saveMessage.value = ok
    ? 'Vérification des rappels effectuée.'
    : 'Échec — redéploie send-notification et configure le cron Supabase.'
  setTimeout(() => {
    saveMessage.value = ''
  }, 4000)
}

const loadMenstruationSettings = async () => {
  if (!userId.value) return
  try {
    menstruationNotifSettings.value = await loadMenstruationNotifSettings(userId.value)
  } catch (err) {
    console.error(err)
    menstruationNotifError.value = err.message || 'Impossible de charger les réglages menstruation.'
  }
}

const onSaveMenstruationSettings = async () => {
  if (!userId.value) return
  isSavingMenstruationNotif.value = true
  menstruationNotifError.value = ''
  menstruationNotifMessage.value = ''
  try {
    await saveMenstruationNotifSettings(userId.value, menstruationNotifSettings.value)
    const [cyclesPilule, cyclesNaturel] = await Promise.all([
      listCyclesPilule(supabase, userId.value),
      listCyclesNaturel(supabase, userId.value),
    ])
    await rescheduleMenstruationEstimatedNotifications(userId.value, cyclesPilule, menstruationNotifSettings.value)
    await rescheduleMenstruationNaturalPhaseNotifications(userId.value, cyclesNaturel, menstruationNotifSettings.value)
    menstruationNotifMessage.value = 'Réglages menstruation enregistrés.'
    setTimeout(() => {
      menstruationNotifMessage.value = ''
    }, 2500)
  } catch (err) {
    console.error(err)
    menstruationNotifError.value = err.message || 'Impossible d’enregistrer ces réglages.'
  } finally {
    isSavingMenstruationNotif.value = false
  }
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
  await Promise.all([loadReminders(), loadOneTimeReminders(), loadMenstruationSettings()])
  window.addEventListener('betterme-notifications-granted', onNotificationsGranted)
  oneTimeRefreshIntervalId = window.setInterval(loadStandaloneScheduled, ONE_TIME_REFRESH_MS)
})

onUnmounted(() => {
  window.removeEventListener('betterme-notifications-granted', onNotificationsGranted)
  if (oneTimeRefreshIntervalId) {
    clearInterval(oneTimeRefreshIntervalId)
    oneTimeRefreshIntervalId = null
  }
})
</script>

<template>
  <div class="settings-wrapper">
    <header class="settings-header">
      <h1 class="settings-title">Réglages</h1>
      <p class="settings-subtitle">Gère tes rappels, tes timers et tes notifications.</p>
    </header>

    <section class="settings-card">
      <div class="card-head">
        <h2>Rappels quotidiens</h2>
        <p>
          Chaque rappel envoie une notification push à l'heure choisie (plusieurs par jour
          possibles).
        </p>
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
            <input
              v-model="reminder.body"
              type="text"
              maxlength="200"
              placeholder="Texte de la notification"
            />
          </label>
          <button
            type="button"
            class="btn-remove"
            title="Supprimer"
            :disabled="deletingIndex === index"
            @click="removeReminder(index)"
          >
            {{ deletingIndex === index ? 'Suppression…' : 'Supprimer' }}
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

    <section class="settings-card settings-card--spaced">
      <div class="card-head">
        <h2>Menstruation</h2>
        <p>Notifications cycle (pilule et naturel).</p>
      </div>

      <div class="reminder-row">
        <label class="choice-check choice-check--card">
          <input
            v-model="menstruationNotifSettings.menstruation_notify_spm_estimee"
            type="checkbox"
          />
          <span>Notifier le début estimé du SPM</span>
        </label>
        <label class="choice-check choice-check--card">
          <input
            v-model="menstruationNotifSettings.menstruation_notify_regles_estimees"
            type="checkbox"
          />
          <span>Notifier le début estimé des règles</span>
        </label>
        <label class="choice-check choice-check--card">
          <input
            v-model="menstruationNotifSettings.menstruation_notify_phase_folliculaire"
            type="checkbox"
          />
          <span>Notifier le début de la phase folliculaire (cycle naturel)</span>
        </label>
        <label class="choice-check choice-check--card">
          <input
            v-model="menstruationNotifSettings.menstruation_notify_phase_ovulatoire"
            type="checkbox"
          />
          <span>Notifier le début de la phase ovulatoire (cycle naturel)</span>
        </label>
        <label class="choice-check choice-check--card">
          <input
            v-model="menstruationNotifSettings.menstruation_notify_phase_luteale"
            type="checkbox"
          />
          <span>Notifier le début de la phase lutéale (cycle naturel)</span>
        </label>
        <label class="field">
          <span>Heure d’envoi</span>
          <input v-model="menstruationNotifSettings.menstruation_notification_time" type="time" />
        </label>
      </div>
      <p v-if="menstruationNotifError" class="settings-feedback settings-feedback--error">
        {{ menstruationNotifError }}
      </p>
      <p v-if="menstruationNotifMessage" class="settings-feedback settings-feedback--ok">
        {{ menstruationNotifMessage }}
      </p>
      <div class="settings-actions">
        <button
          type="button"
          class="btn btn--primary"
          :disabled="isSavingMenstruationNotif"
          @click="onSaveMenstruationSettings"
        >
          {{ isSavingMenstruationNotif ? 'Enregistrement…' : 'Enregistrer menstruation' }}
        </button>
      </div>
    </section>

    <section class="settings-card settings-card--spaced">
      <div class="card-head">
        <h2>Rappels ponctuels</h2>
        <p>
          Une notification unique à la date et l’heure de ton appareil. Envoyée automatiquement si
          l’app est ouverte ou via le cron Supabase.
        </p>
      </div>

      <div v-if="!notificationsSupportees()" class="settings-alert settings-alert--warn">
        Les rappels ponctuels nécessitent les notifications push sur cet appareil.
      </div>

      <div v-else-if="!notificationsActives()" class="settings-alert">
        <p>Autorise les notifications pour recevoir tes rappels planifiés.</p>
        <button type="button" class="btn btn--secondary" @click="onActiverNotifications">
          Autoriser les notifications
        </button>
      </div>

      <form class="one-time-form" @submit.prevent="onPlanOneTimeReminder">
        <div class="reminder-fields">
          <label class="field field--grow">
            <span>Titre</span>
            <input
              v-model="oneTimeForm.title"
              type="text"
              maxlength="80"
              required
              placeholder="Ex. Rappel important"
            />
          </label>
        </div>
        <label class="field field--full">
          <span>Message</span>
          <input
            v-model="oneTimeForm.body"
            type="text"
            maxlength="200"
            placeholder="Texte de la notification"
          />
        </label>
        <div class="reminder-fields">
          <label class="field">
            <span>Date d’envoi</span>
            <input v-model="oneTimeForm.scheduled_date" type="date" required :min="localToday" />
          </label>
          <label class="field">
            <span>Heure</span>
            <input v-model="oneTimeForm.scheduled_time" type="time" required />
          </label>
        </div>
        <div class="settings-actions settings-actions--form">
          <button type="submit" class="btn btn--primary" :disabled="isPlanningOneTime">
            {{ isPlanningOneTime ? 'Planification…' : 'Planifier ce rappel' }}
          </button>
        </div>
      </form>

      <div v-if="isLoadingOneTime" class="settings-loading">Chargement…</div>

      <template v-else>
        <div v-if="oneTimeFailed.length > 0" class="one-time-failed-block">
          <h3 class="one-time-subheading one-time-subheading--error">Échecs d’envoi</h3>
          <div class="reminders-list one-time-list">
            <article
              v-for="item in oneTimeFailed"
              :key="`failed-${item.id}`"
              class="reminder-row reminder-row--failed"
            >
              <div class="one-time-summary">
                <strong class="one-time-title">{{ item.title }}</strong>
                <p v-if="getScheduledDisplayBody(item)" class="one-time-body">
                  {{ getScheduledDisplayBody(item) }}
                </p>
                <time class="one-time-when" :datetime="item.scheduled_at">
                  Prévu le {{ formatScheduledAtLocal(item.scheduled_at) }}
                </time>
                <p class="one-time-failed-msg">
                  L’heure d’envoi est passée et la notification n’a pas été reçue. Vérifie que les
                  notifications sont autorisées et qu’un appareil est abonné, puis utilise «
                  Vérifier les rappels » ou supprime ce rappel.
                </p>
              </div>
              <button
                type="button"
                class="btn-remove"
                title="Supprimer ce rappel en échec"
                :disabled="deletingOneTimeId === item.id"
                @click="onRemoveOneTimeReminder(item.id)"
              >
                {{ deletingOneTimeId === item.id ? 'Suppression…' : 'Supprimer' }}
              </button>
            </article>
          </div>
        </div>

        <h3
          v-if="oneTimeUpcoming.length > 0"
          class="one-time-subheading"
          :class="{ 'one-time-subheading--spaced': oneTimeFailed.length > 0 }"
        >
          À venir
        </h3>

        <p v-if="oneTimeUpcoming.length === 0 && oneTimeFailed.length === 0" class="settings-empty">
          Aucun rappel ponctuel planifié.
        </p>

        <div v-else-if="oneTimeUpcoming.length > 0" class="reminders-list one-time-list">
          <article
            v-for="item in oneTimeUpcoming"
            :key="item.id"
            class="reminder-row reminder-row--readonly"
          >
            <div class="one-time-summary">
              <strong class="one-time-title">{{ item.title }}</strong>
              <p v-if="getScheduledDisplayBody(item)" class="one-time-body">
                {{ getScheduledDisplayBody(item) }}
              </p>
              <time class="one-time-when" :datetime="item.scheduled_at">
                {{ formatScheduledAtLocal(item.scheduled_at) }}
              </time>
            </div>
            <button
              type="button"
              class="btn-remove"
              title="Annuler ce rappel"
              :disabled="deletingOneTimeId === item.id"
              @click="onRemoveOneTimeReminder(item.id)"
            >
              {{ deletingOneTimeId === item.id ? 'Annulation…' : 'Annuler' }}
            </button>
          </article>
        </div>
      </template>

      <p v-if="oneTimeError" class="settings-feedback settings-feedback--error">
        {{ oneTimeError }}
      </p>
      <p v-if="oneTimeMessage" class="settings-feedback settings-feedback--ok">
        {{ oneTimeMessage }}
      </p>
    </section>

    <section class="settings-card settings-card--spaced">
      <div class="card-head">
        <h2>Timer seul</h2>
        <p>Compte a rebours : notification a la fin de la duree choisie.</p>
      </div>

      <form class="one-time-form" @submit.prevent="onStartStandaloneTimer">
        <div class="reminder-fields">
          <label class="field field--grow">
            <span>Titre</span>
            <input v-model="standaloneTimerForm.title" type="text" maxlength="80" required />
          </label>
        </div>
        <label class="field field--full">
          <span>Message (optionnel)</span>
          <input v-model="standaloneTimerForm.body" type="text" maxlength="200" />
        </label>
        <div class="reminder-fields">
          <label class="field field--full">
            <span>Duree</span>
            <div class="reminder-timer reminder-timer--inline">
              <div class="reminder-timer-unit">
                <input
                  v-model.number="standaloneTimerForm.duration_hours"
                  type="number"
                  min="0"
                  max="23"
                  class="reminder-timer-input"
                />
                <span class="reminder-timer-suffix">h</span>
              </div>
              <span class="reminder-timer-sep">:</span>
              <div class="reminder-timer-unit">
                <input
                  v-model.number="standaloneTimerForm.duration_minutes"
                  type="number"
                  min="0"
                  max="59"
                  class="reminder-timer-input"
                />
                <span class="reminder-timer-suffix">min</span>
              </div>
            </div>
          </label>
        </div>
        <div class="settings-actions settings-actions--form">
          <button type="submit" class="btn btn--primary" :disabled="isStartingTimer">
            {{ isStartingTimer ? 'Demarrage…' : 'Demarrer le timer' }}
          </button>
        </div>
      </form>

      <template v-if="!isLoadingOneTime">
        <div v-if="standaloneTimersFailed.length > 0" class="one-time-failed-block">
          <h3 class="one-time-subheading one-time-subheading--error">Timers en echec</h3>
          <div class="reminders-list one-time-list">
            <article
              v-for="item in standaloneTimersFailed"
              :key="`tf-${item.id}`"
              class="reminder-row reminder-row--failed"
            >
              <div class="one-time-summary">
                <strong class="one-time-title">⏱️ {{ item.title }}</strong>
                <time class="one-time-when" :datetime="item.scheduled_at">
                  Fin prevue le {{ formatScheduledAtLocal(item.scheduled_at) }}
                </time>
                <p class="one-time-failed-msg">Fin du timer passee sans notification.</p>
              </div>
              <button type="button" class="btn-remove" @click="onRemoveOneTimeReminder(item.id)">
                Supprimer
              </button>
            </article>
          </div>
        </div>

        <h3 v-if="standaloneTimersUpcoming.length > 0" class="one-time-subheading">
          Timers en cours
        </h3>
        <p
          v-if="standaloneTimersUpcoming.length === 0 && standaloneTimersFailed.length === 0"
          class="settings-empty"
        >
          Aucun timer en cours.
        </p>
        <div v-else-if="standaloneTimersUpcoming.length > 0" class="reminders-list one-time-list">
          <article
            v-for="item in standaloneTimersUpcoming"
            :key="`tu-${item.id}`"
            class="reminder-row reminder-row--readonly"
          >
            <div class="one-time-summary">
              <strong class="one-time-title">⏱️ {{ item.title }}</strong>
              <time class="one-time-when" :datetime="item.scheduled_at">
                Fin le {{ formatScheduledAtLocal(item.scheduled_at) }}
              </time>
            </div>
            <button type="button" class="btn-remove" @click="onRemoveOneTimeReminder(item.id)">
              Annuler
            </button>
          </article>
        </div>
      </template>

      <p v-if="timerError" class="settings-feedback settings-feedback--error">{{ timerError }}</p>
      <p v-if="timerMessage" class="settings-feedback settings-feedback--ok">{{ timerMessage }}</p>
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

.choice-check {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  color: #5d6d7e;
}

.choice-check input {
  width: 1.05rem;
  height: 1.05rem;
  accent-color: #ad81be;
}

.choice-check--card {
  padding: 0.65rem 0.8rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.3);
  background: rgba(255, 255, 255, 0.55);
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

.settings-card--spaced {
  margin-top: 1.5rem;
}

.one-time-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.settings-actions--form {
  margin-top: 0.25rem;
  justify-content: flex-start;
}

.one-time-list {
  margin-top: 0.5rem;
}

.reminder-row--readonly {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.one-time-summary {
  flex: 1;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.one-time-title {
  font-size: 1rem;
  color: #2c3e50;
}

.one-time-body {
  margin: 0;
  font-size: 0.9rem;
  color: #5d6d7e;
  line-height: 1.4;
}

.one-time-when {
  font-size: 0.8rem;
  font-weight: 600;
  color: #ad81be;
}

@media (prefers-color-scheme: dark) {
  .one-time-title {
    color: #f0e8f8;
  }
  .one-time-body {
    color: #adb5bd;
  }
}

.one-time-subheading {
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
  font-weight: 800;
  color: #ad81be;
}

.one-time-subheading--spaced {
  margin-top: 1.25rem;
}

.one-time-subheading--error {
  color: #c0392b;
}

@media (prefers-color-scheme: dark) {
  .one-time-subheading--error {
    color: #e74c3c;
  }
}

.one-time-failed-block {
  margin-bottom: 0.5rem;
}

.reminder-row--failed {
  border-color: rgba(192, 57, 43, 0.35);
  background: rgba(192, 57, 43, 0.06);
}

.one-time-failed-msg {
  margin: 0.35rem 0 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: #c0392b;
  line-height: 1.45;
}

@media (prefers-color-scheme: dark) {
  .reminder-row--failed {
    background: rgba(231, 76, 60, 0.08);
    border-color: rgba(231, 76, 60, 0.3);
  }
  .one-time-failed-msg {
    color: #e74c3c;
  }
}

.reminder-timer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.reminder-timer--inline {
  margin-top: 0.25rem;
}

.reminder-timer-unit {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
  flex-shrink: 0;
}

.reminder-timer-input {
  box-sizing: border-box;
  width: 4rem;
  min-width: 4rem;
  padding: 0.5rem 0.4rem;
  font-size: 1.15rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  text-align: center;
  border: 2px solid rgba(173, 129, 190, 0.35);
  border-radius: 10px;
  background: #fff;
  color: #2c3e50;
}

.reminder-timer-input:focus {
  outline: none;
  border-color: #ad81be;
  box-shadow: 0 0 0 3px rgba(173, 129, 190, 0.2);
}

.reminder-timer-input::-webkit-outer-spin-button,
.reminder-timer-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.reminder-timer-input[type='number'] {
  -moz-appearance: textfield;
  appearance: textfield;
}

@media (prefers-color-scheme: dark) {
  .reminder-timer-input {
    background: #2a2433;
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.3);
  }
}

.reminder-timer-sep {
  font-size: 1.25rem;
  font-weight: 800;
  color: #ad81be;
  line-height: 1;
  flex-shrink: 0;
}

.reminder-timer-suffix {
  font-size: 0.75rem;
  font-weight: 700;
  color: #9b59b6;
  flex-shrink: 0;
}
</style>
