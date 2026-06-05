<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
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
import { rescheduleMenstruationPatternNotifications } from '../services/menstruationPatternNotifications.js'
import { TYPE_CYCLE } from '../services/menstruationSymptoms.js'
import { listMenstruationPatterns } from '../services/menstruationPatterns.js'
import { RECONFORT_CONDITION_GROUPS } from '../constants/reconfortConditions.js'
import {
  createReconfortMessage,
  updateReconfortMessage,
  deleteReconfortMessage,
  listReconfortMessages,
} from '../services/reconfortMessages.js'
import { sendRandomReconfortNotificationNow } from '../services/reconfortNotifications.js'

const router = useRouter()

const SETTINGS_TABS = {
  RAPPELS: 'rappels',
  MENSTRUATION: 'menstruation',
  RECONFORT: 'reconfort',
}

const activeTab = ref(SETTINGS_TABS.RAPPELS)

const COLLAPSIBLE_SECTIONS = {
  DAILY: 'daily',
  ONE_TIME: 'oneTime',
  TIMER: 'timer',
  MENSTRUATION: 'menstruation',
  PATTERNS: 'patterns',
}

const expandedSections = ref({
  [COLLAPSIBLE_SECTIONS.DAILY]: false,
  [COLLAPSIBLE_SECTIONS.ONE_TIME]: false,
  [COLLAPSIBLE_SECTIONS.TIMER]: false,
  [COLLAPSIBLE_SECTIONS.MENSTRUATION]: false,
  [COLLAPSIBLE_SECTIONS.PATTERNS]: false,
})

function toggleSection(section) {
  expandedSections.value[section] = !expandedSections.value[section]
}

const showReconfortForm = ref(false)
const editingReconfortId = ref(null)
const deletingReconfortId = ref(null)
const isSavingReconfort = ref(false)
const isSendingReconfortTest = ref(false)
const isLoadingReconfort = ref(false)
const reconfortFormError = ref('')
const reconfortSaveMessage = ref('')
const reconfortLoadError = ref('')
const reconfortMessages = ref([])
const expandedReconfortSenders = ref({})
const reconfortForm = ref({
  who: '',
  message: '',
  conditions: [],
})

const reconfortConditionLabels = (() => {
  const map = new Map()
  for (const group of RECONFORT_CONDITION_GROUPS) {
    for (const option of group.options) {
      map.set(option.id, option.label)
    }
  }
  return map
})()

const reconfortGroupsBySender = computed(() => {
  const bySender = new Map()

  for (const msg of reconfortMessages.value) {
    const qui = msg.qui?.trim() || 'Sans nom'
    if (!bySender.has(qui)) {
      bySender.set(qui, [])
    }
    bySender.get(qui).push(msg)
  }

  return [...bySender.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'fr', { sensitivity: 'base' }))
    .map(([qui, messages]) => ({
      qui,
      messages: [...messages].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    }))
})

function getReconfortConditionLabel(conditionId) {
  return reconfortConditionLabels.get(conditionId) ?? conditionId
}

function isReconfortSenderExpanded(qui) {
  return Boolean(expandedReconfortSenders.value[qui])
}

function toggleReconfortSender(qui) {
  expandedReconfortSenders.value = {
    ...expandedReconfortSenders.value,
    [qui]: !expandedReconfortSenders.value[qui],
  }
}

const loadReconfortMessages = async () => {
  if (!userId.value) return
  isLoadingReconfort.value = true
  reconfortLoadError.value = ''
  try {
    reconfortMessages.value = await listReconfortMessages(supabase, userId.value)
  } catch (err) {
    console.error(err)
    reconfortLoadError.value = err.message || 'Impossible de charger les messages.'
    reconfortMessages.value = []
  } finally {
    isLoadingReconfort.value = false
  }
}

function createEmptyReconfortForm() {
  return {
    who: '',
    message: '',
    conditions: [],
  }
}

function openReconfortForm() {
  reconfortFormError.value = ''
  editingReconfortId.value = null
  reconfortForm.value = createEmptyReconfortForm()
  showReconfortForm.value = true
}

function openReconfortFormForEdit(msg) {
  if (!msg?.id) return
  reconfortFormError.value = ''
  editingReconfortId.value = msg.id
  reconfortForm.value = {
    who: msg.qui ?? '',
    message: msg.message ?? '',
    conditions: Array.isArray(msg.conditions) ? [...msg.conditions] : [],
  }
  showReconfortForm.value = true
}

function closeReconfortForm() {
  showReconfortForm.value = false
  editingReconfortId.value = null
  reconfortFormError.value = ''
  reconfortForm.value = createEmptyReconfortForm()
}

function isReconfortConditionSelected(conditionId) {
  return reconfortForm.value.conditions.includes(conditionId)
}

function toggleReconfortCondition(conditionId) {
  const conditions = [...reconfortForm.value.conditions]
  const index = conditions.indexOf(conditionId)
  if (index >= 0) {
    conditions.splice(index, 1)
  } else {
    conditions.push(conditionId)
  }
  reconfortForm.value.conditions = conditions
  if (conditions.length > 0) {
    reconfortFormError.value = ''
  }
}

function onCancelReconfortForm() {
  closeReconfortForm()
}

const onSaveReconfortForm = async () => {
  reconfortFormError.value = ''
  reconfortSaveMessage.value = ''

  if (!userId.value) {
    reconfortFormError.value = 'Utilisateur non connecté.'
    return
  }

  isSavingReconfort.value = true
  try {
    const payload = {
      who: reconfortForm.value.who,
      message: reconfortForm.value.message,
      conditions: [...reconfortForm.value.conditions],
    }

    if (editingReconfortId.value) {
      await updateReconfortMessage(supabase, userId.value, editingReconfortId.value, payload)
      reconfortSaveMessage.value = 'Message de réconfort modifié.'
    } else {
      await createReconfortMessage(supabase, userId.value, payload)
      reconfortSaveMessage.value = 'Message de réconfort enregistré.'
    }

    closeReconfortForm()
    await loadReconfortMessages()
    setTimeout(() => {
      reconfortSaveMessage.value = ''
    }, 3000)
  } catch (err) {
    console.error(err)
    reconfortFormError.value = err.message || 'Impossible d’enregistrer le message.'
  } finally {
    isSavingReconfort.value = false
  }
}

const onSendRandomReconfortNotification = async () => {
  if (!userId.value) {
    reconfortLoadError.value = 'Utilisateur non connecté.'
    return
  }
  if (!notificationsActives()) {
    reconfortLoadError.value = 'Active les notifications push pour recevoir un message de réconfort.'
    return
  }

  isSendingReconfortTest.value = true
  reconfortLoadError.value = ''
  try {
    await sendRandomReconfortNotificationNow(supabase, userId.value)
    reconfortSaveMessage.value = 'Notification de réconfort envoyée.'
    setTimeout(() => {
      reconfortSaveMessage.value = ''
    }, 3000)
  } catch (err) {
    console.error(err)
    reconfortLoadError.value = err.message || 'Impossible d’envoyer la notification.'
  } finally {
    isSendingReconfortTest.value = false
  }
}

const onDeleteReconfortMessage = async (msg) => {
  if (!userId.value || !msg?.id) return
  if (!window.confirm('Supprimer ce message de réconfort ?')) return

  deletingReconfortId.value = msg.id
  reconfortLoadError.value = ''
  try {
    await deleteReconfortMessage(supabase, userId.value, msg.id)
    if (editingReconfortId.value === msg.id) {
      closeReconfortForm()
    }
    await loadReconfortMessages()
    reconfortSaveMessage.value = 'Message de réconfort supprimé.'
    setTimeout(() => {
      reconfortSaveMessage.value = ''
    }, 3000)
  } catch (err) {
    console.error(err)
    reconfortLoadError.value = err.message || 'Impossible de supprimer le message.'
  } finally {
    deletingReconfortId.value = null
  }
}

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

    const typeCycle = cyclesPilule.length > 0 ? TYPE_CYCLE.PILULE : TYPE_CYCLE.NATUREL
    const cycleList = cyclesPilule.length > 0 ? cyclesPilule : cyclesNaturel
    if (cycleList.length) {
      const patterns = await listMenstruationPatterns(supabase, userId.value, typeCycle, {
        actifOnly: false,
      })
      await rescheduleMenstruationPatternNotifications(
        userId.value,
        typeCycle,
        cycleList,
        patterns.filter((p) => p.actif !== false),
        menstruationNotifSettings.value,
      )
    }

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
  await Promise.all([
    loadReminders(),
    loadOneTimeReminders(),
    loadMenstruationSettings(),
    loadReconfortMessages(),
  ])
  window.addEventListener('betterme-notifications-granted', onNotificationsGranted)
  oneTimeRefreshIntervalId = window.setInterval(loadStandaloneScheduled, ONE_TIME_REFRESH_MS)
})

watch(activeTab, (tab) => {
  if (tab === SETTINGS_TABS.RECONFORT) {
    loadReconfortMessages()
  }
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

    <nav class="settings-tabs" role="tablist" aria-label="Sections des réglages">
      <button
        type="button"
        role="tab"
        class="settings-tab"
        :class="{ 'settings-tab--active': activeTab === SETTINGS_TABS.RAPPELS }"
        :aria-selected="activeTab === SETTINGS_TABS.RAPPELS"
        @click="activeTab = SETTINGS_TABS.RAPPELS"
      >
        Rappels
      </button>
      <button
        type="button"
        role="tab"
        class="settings-tab"
        :class="{ 'settings-tab--active': activeTab === SETTINGS_TABS.MENSTRUATION }"
        :aria-selected="activeTab === SETTINGS_TABS.MENSTRUATION"
        @click="activeTab = SETTINGS_TABS.MENSTRUATION"
      >
        Menstruation
      </button>
      <button
        type="button"
        role="tab"
        class="settings-tab"
        :class="{ 'settings-tab--active': activeTab === SETTINGS_TABS.RECONFORT }"
        :aria-selected="activeTab === SETTINGS_TABS.RECONFORT"
        @click="activeTab = SETTINGS_TABS.RECONFORT"
      >
        Réconfort
      </button>
    </nav>

    <div
      v-show="activeTab === SETTINGS_TABS.RAPPELS"
      role="tabpanel"
      class="settings-tab-panel"
      aria-label="Rappels"
    >
    <section class="settings-card settings-card--collapsible">
      <button
        type="button"
        class="card-toggle"
        :aria-expanded="expandedSections[COLLAPSIBLE_SECTIONS.DAILY]"
        aria-controls="settings-section-daily"
        @click="toggleSection(COLLAPSIBLE_SECTIONS.DAILY)"
      >
        <h2 class="card-toggle__title">Rappels quotidiens</h2>
        <span
          class="card-toggle__chevron"
          :class="{ 'card-toggle__chevron--open': expandedSections[COLLAPSIBLE_SECTIONS.DAILY] }"
          aria-hidden="true"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      <div
        v-show="expandedSections[COLLAPSIBLE_SECTIONS.DAILY]"
        id="settings-section-daily"
        class="card-body"
      >
      <p class="card-body__desc">
        Chaque rappel envoie une notification push à l'heure choisie (plusieurs par jour
        possibles).
      </p>

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
      </div>
    </section>

    <section class="settings-card settings-card--spaced settings-card--collapsible">
      <button
        type="button"
        class="card-toggle"
        :aria-expanded="expandedSections[COLLAPSIBLE_SECTIONS.ONE_TIME]"
        aria-controls="settings-section-one-time"
        @click="toggleSection(COLLAPSIBLE_SECTIONS.ONE_TIME)"
      >
        <h2 class="card-toggle__title">Rappels ponctuels</h2>
        <span
          class="card-toggle__chevron"
          :class="{ 'card-toggle__chevron--open': expandedSections[COLLAPSIBLE_SECTIONS.ONE_TIME] }"
          aria-hidden="true"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      <div
        v-show="expandedSections[COLLAPSIBLE_SECTIONS.ONE_TIME]"
        id="settings-section-one-time"
        class="card-body"
      >
      <p class="card-body__desc">
        Une notification unique à la date et l’heure de ton appareil. Envoyée automatiquement si
        l’app est ouverte ou via le cron Supabase.
      </p>

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
      </div>
    </section>

    <section class="settings-card settings-card--spaced settings-card--collapsible">
      <button
        type="button"
        class="card-toggle"
        :aria-expanded="expandedSections[COLLAPSIBLE_SECTIONS.TIMER]"
        aria-controls="settings-section-timer"
        @click="toggleSection(COLLAPSIBLE_SECTIONS.TIMER)"
      >
        <h2 class="card-toggle__title">Timer seul</h2>
        <span
          class="card-toggle__chevron"
          :class="{ 'card-toggle__chevron--open': expandedSections[COLLAPSIBLE_SECTIONS.TIMER] }"
          aria-hidden="true"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      <div
        v-show="expandedSections[COLLAPSIBLE_SECTIONS.TIMER]"
        id="settings-section-timer"
        class="card-body"
      >
      <p class="card-body__desc">Compte a rebours : notification a la fin de la duree choisie.</p>

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
      </div>
    </section>
    </div>

    <div
      v-show="activeTab === SETTINGS_TABS.MENSTRUATION"
      role="tabpanel"
      class="settings-tab-panel"
      aria-label="Menstruation"
    >
      <section class="settings-card settings-card--collapsible">
        <button
          type="button"
          class="card-toggle"
          :aria-expanded="expandedSections[COLLAPSIBLE_SECTIONS.MENSTRUATION]"
          aria-controls="settings-section-menstruation"
          @click="toggleSection(COLLAPSIBLE_SECTIONS.MENSTRUATION)"
        >
          <h2 class="card-toggle__title">Menstruation</h2>
          <span
            class="card-toggle__chevron"
            :class="{
              'card-toggle__chevron--open': expandedSections[COLLAPSIBLE_SECTIONS.MENSTRUATION],
            }"
            aria-hidden="true"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </button>

        <div
          v-show="expandedSections[COLLAPSIBLE_SECTIONS.MENSTRUATION]"
          id="settings-section-menstruation"
          class="card-body"
        >
        <p class="card-body__desc">Notifications cycle (pilule et naturel).</p>

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
        </div>
      </section>

      <section class="settings-card settings-card--spaced settings-card--collapsible">
        <button
          type="button"
          class="card-toggle"
          :aria-expanded="expandedSections[COLLAPSIBLE_SECTIONS.PATTERNS]"
          aria-controls="settings-section-patterns"
          @click="toggleSection(COLLAPSIBLE_SECTIONS.PATTERNS)"
        >
          <h2 class="card-toggle__title">Tendances & patterns</h2>
          <span
            class="card-toggle__chevron"
            :class="{ 'card-toggle__chevron--open': expandedSections[COLLAPSIBLE_SECTIONS.PATTERNS] }"
            aria-hidden="true"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </button>

        <div
          v-show="expandedSections[COLLAPSIBLE_SECTIONS.PATTERNS]"
          id="settings-section-patterns"
          class="card-body"
        >
        <p class="card-body__desc">
          Prévoyance (anticipation) et alarmes (symptômes intenses ou inhabituels). Les alertes du
          jour sont envoyées le soir à l’heure choisie, pas à la saisie.
        </p>

        <div class="reminder-row">
          <label class="choice-check choice-check--card">
            <input
              v-model="menstruationNotifSettings.menstruation_notify_patterns_simple"
              type="checkbox"
            />
            <span>Pattern simple (récurrence & symptôme inhabituel)</span>
          </label>
          <label class="choice-check choice-check--card">
            <input
              v-model="menstruationNotifSettings.menstruation_notify_patterns_intensite"
              type="checkbox"
            />
            <span>Pattern d’intensité</span>
          </label>
          <label class="choice-check choice-check--card">
            <input
              v-model="menstruationNotifSettings.menstruation_notify_patterns_duree"
              type="checkbox"
            />
            <span>Pattern de durée</span>
          </label>
          <label class="choice-check choice-check--card">
            <input
              v-model="menstruationNotifSettings.menstruation_notify_patterns_combine"
              type="checkbox"
            />
            <span>Pattern combiné (clusters)</span>
          </label>
          <label class="field">
            <span>Heure d’envoi (prévoyance & alarmes du jour)</span>
            <input
              v-model="menstruationNotifSettings.menstruation_pattern_notification_time"
              type="time"
            />
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
            {{ isSavingMenstruationNotif ? 'Enregistrement…' : 'Enregistrer' }}
          </button>
        </div>
        </div>
      </section>
    </div>

    <div
      v-show="activeTab === SETTINGS_TABS.RECONFORT"
      role="tabpanel"
      class="settings-tab-panel"
      aria-label="Réconfort"
    >
      <section v-if="!showReconfortForm" class="settings-card">
        <div class="settings-actions settings-actions--form reconfort-actions">
          <button
            type="button"
            class="btn btn--primary"
            :disabled="isSendingReconfortTest || isLoadingReconfort"
            @click="onSendRandomReconfortNotification"
          >
            {{
              isSendingReconfortTest
                ? 'Envoi…'
                : 'Envoyer une notification de réconfort'
            }}
          </button>
          <button
            type="button"
            class="btn btn--primary reconfort-actions__add"
            @click="openReconfortForm"
          >
            Ajouter un message de réconfort
          </button>
        </div>
        <p v-if="reconfortSaveMessage" class="settings-feedback settings-feedback--ok">
          {{ reconfortSaveMessage }}
        </p>
        <p v-if="reconfortLoadError && !showReconfortForm" class="settings-feedback settings-feedback--error">
          {{ reconfortLoadError }}
        </p>
      </section>

      <section v-else class="settings-card reconfort-form">
        <h2 class="reconfort-form__title">
          {{ editingReconfortId ? 'Modifier le message de réconfort' : 'Nouveau message de réconfort' }}
        </h2>

        <form class="reconfort-form__body" @submit.prevent="onSaveReconfortForm">
          <label class="field field--full">
            <span>Qui es-tu ?</span>
            <input
              v-model="reconfortForm.who"
              type="text"
              maxlength="120"
              required
              placeholder="Ex. Maman, Toi-même, Une amie…"
            />
          </label>

          <label class="field field--full">
            <span>Quel est ton message ?</span>
            <input
              v-model="reconfortForm.message"
              type="text"
              maxlength="500"
              required
              placeholder="Ton message de réconfort"
            />
          </label>

          <fieldset class="reconfort-conditions">
            <legend class="reconfort-conditions__legend">Condition(s) ?</legend>
            <p class="reconfort-conditions__hint">
              Sélectionne au moins une condition (plusieurs possibles).
            </p>

            <div
              v-for="group in RECONFORT_CONDITION_GROUPS"
              :key="group.id"
              class="reconfort-conditions__group"
            >
              <h3 class="reconfort-conditions__group-title">{{ group.label }}</h3>
              <div class="reconfort-conditions__grid">
                <label
                  v-for="option in group.options"
                  :key="option.id"
                  class="choice-check choice-check--card"
                >
                  <input
                    type="checkbox"
                    :checked="isReconfortConditionSelected(option.id)"
                    @change="toggleReconfortCondition(option.id)"
                  />
                  <span>{{ option.label }}</span>
                </label>
              </div>
            </div>
          </fieldset>

          <p v-if="reconfortFormError" class="settings-feedback settings-feedback--error">
            {{ reconfortFormError }}
          </p>

          <div class="settings-actions">
            <button
              type="button"
              class="btn btn--secondary"
              :disabled="isSavingReconfort"
              @click="onCancelReconfortForm"
            >
              Annuler
            </button>
            <button type="submit" class="btn btn--primary" :disabled="isSavingReconfort">
              {{ isSavingReconfort ? 'Enregistrement…' : 'Enregistrer' }}
            </button>
          </div>
        </form>
      </section>

      <section class="settings-card settings-card--spaced reconfort-list">
        <h2 class="reconfort-list__title">Mes messages de réconfort</h2>

        <div v-if="isLoadingReconfort" class="settings-loading">Chargement…</div>

        <p v-else-if="reconfortLoadError" class="settings-feedback settings-feedback--error">
          {{ reconfortLoadError }}
        </p>

        <p v-else-if="reconfortGroupsBySender.length === 0" class="settings-empty">
          Aucun message enregistré pour l'instant.
        </p>

        <div v-else class="reconfort-list__groups">
          <section
            v-for="(senderGroup, senderIndex) in reconfortGroupsBySender"
            :key="senderGroup.qui"
            class="settings-card settings-card--collapsible reconfort-sender-card"
          >
            <button
              type="button"
              class="card-toggle"
              :aria-expanded="isReconfortSenderExpanded(senderGroup.qui)"
              :aria-controls="`reconfort-sender-${senderIndex}`"
              @click="toggleReconfortSender(senderGroup.qui)"
            >
              <div class="reconfort-sender-card__head">
                <h3 class="card-toggle__title">{{ senderGroup.qui }}</h3>
                <span class="reconfort-sender-card__count">
                  {{ senderGroup.messages.length }}
                  message{{ senderGroup.messages.length > 1 ? 's' : '' }}
                </span>
              </div>
              <span
                class="card-toggle__chevron"
                :class="{ 'card-toggle__chevron--open': isReconfortSenderExpanded(senderGroup.qui) }"
                aria-hidden="true"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </button>

            <div
              v-show="isReconfortSenderExpanded(senderGroup.qui)"
              :id="`reconfort-sender-${senderIndex}`"
              class="card-body"
            >
              <article
                v-for="msg in senderGroup.messages"
                :key="msg.id"
                class="reconfort-message"
              >
                <div class="reconfort-message__row">
                  <div class="reconfort-message__content">
                    <p class="reconfort-message__text">{{ msg.message }}</p>
                    <ul v-if="msg.conditions?.length" class="reconfort-message__conditions">
                      <li
                        v-for="conditionId in msg.conditions"
                        :key="`${msg.id}-${conditionId}`"
                        class="reconfort-message__condition"
                      >
                        {{ getReconfortConditionLabel(conditionId) }}
                      </li>
                    </ul>
                  </div>
                  <div class="reconfort-message__actions">
                    <button
                      type="button"
                      class="btn btn--ghost reconfort-message__action"
                      :disabled="deletingReconfortId === msg.id || isSavingReconfort"
                      @click="openReconfortFormForEdit(msg)"
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      class="btn btn--ghost reconfort-message__action reconfort-message__action--danger"
                      :disabled="deletingReconfortId === msg.id || isSavingReconfort"
                      @click="onDeleteReconfortMessage(msg)"
                    >
                      {{ deletingReconfortId === msg.id ? 'Suppression…' : 'Supprimer' }}
                    </button>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-wrapper {
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
}

.settings-header {
  margin-bottom: 1.25rem;
  text-align: center;
  max-width: 720px;
  margin-left: auto;
  margin-right: auto;
}

.settings-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
  padding: 0.35rem;
  border-radius: 14px;
  background: rgba(213, 181, 234, 0.12);
  border: 1px solid rgba(213, 181, 234, 0.25);
}

.settings-tab {
  flex: 1;
  border: none;
  border-radius: 10px;
  padding: 0.65rem 1rem;
  font-size: 0.95rem;
  font-weight: 700;
  color: #6c757d;
  background: transparent;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
}

.settings-tab:hover {
  color: #ad81be;
  background: rgba(255, 255, 255, 0.45);
}

.settings-tab--active {
  color: #ad81be;
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 2px 8px rgba(173, 129, 190, 0.15);
}

.settings-tab-panel {
  display: flex;
  flex-direction: column;
}

@media (prefers-color-scheme: dark) {
  .settings-tabs {
    background: rgba(35, 30, 48, 0.6);
    border-color: rgba(213, 181, 234, 0.15);
  }
  .settings-tab {
    color: #adb5bd;
  }
  .settings-tab:hover {
    background: rgba(255, 255, 255, 0.06);
  }
  .settings-tab--active {
    background: rgba(45, 38, 58, 0.95);
    color: #d5b5ea;
  }
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

.card-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.card-toggle__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 800;
  color: #ad81be;
}

.card-toggle:hover .card-toggle__title {
  color: #9a6dad;
}

.card-toggle__chevron {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 8px;
  color: #ad81be;
  background: rgba(213, 181, 234, 0.15);
  transition:
    transform 0.2s ease,
    background 0.2s ease;
}

.card-toggle:hover .card-toggle__chevron {
  background: rgba(213, 181, 234, 0.28);
}

.card-toggle__chevron svg {
  width: 1.1rem;
  height: 1.1rem;
}

.card-toggle__chevron--open {
  transform: rotate(180deg);
}

.card-body {
  margin-top: 1.25rem;
  padding-top: 1.25rem;
  border-top: 1px solid rgba(213, 181, 234, 0.2);
}

.card-body__desc {
  margin: 0 0 1.25rem;
  font-size: 0.9rem;
  color: #6c757d;
  line-height: 1.45;
}

@media (prefers-color-scheme: dark) {
  .card-body {
    border-top-color: rgba(213, 181, 234, 0.12);
  }

  .card-body__desc {
    color: #adb5bd;
  }

  .card-toggle__chevron {
    background: rgba(213, 181, 234, 0.1);
  }

  .card-toggle:hover .card-toggle__chevron {
    background: rgba(213, 181, 234, 0.2);
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

.reconfort-form__title {
  margin: 0 0 1.25rem;
  font-size: 1.25rem;
  font-weight: 800;
  color: #ad81be;
}

.reconfort-form__body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.reconfort-conditions {
  margin: 0;
  padding: 0;
  border: none;
  min-width: 0;
}

.reconfort-conditions__legend {
  font-size: 0.9rem;
  font-weight: 700;
  color: #5d6d7e;
  margin-bottom: 0.35rem;
}

.reconfort-conditions__hint {
  margin: 0 0 1rem;
  font-size: 0.85rem;
  color: #8c98a4;
  line-height: 1.45;
}

.reconfort-conditions__group + .reconfort-conditions__group {
  margin-top: 1.25rem;
}

.reconfort-conditions__group-title {
  margin: 0 0 0.65rem;
  font-size: 0.95rem;
  font-weight: 800;
  color: #ad81be;
}

.reconfort-conditions__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.55rem;
}

.reconfort-actions.settings-actions--form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  width: 100%;
  justify-content: flex-start;
}

.reconfort-actions .btn {
  padding: 0.65rem 1.15rem;
  font-size: 0.9rem;
  border-radius: 12px;
}

.reconfort-actions__add {
  margin-left: auto;
}

.reconfort-list__title {
  margin: 0 0 1rem;
  font-size: 1.25rem;
  font-weight: 800;
  color: #ad81be;
}

.reconfort-list__groups {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.reconfort-sender-card {
  padding: 1rem 1.25rem;
  box-shadow: none;
}

.reconfort-sender-card__head {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.reconfort-sender-card__count {
  font-size: 0.82rem;
  font-weight: 600;
  color: #8c98a4;
}

.reconfort-message + .reconfort-message {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(213, 181, 234, 0.2);
}

.reconfort-message__row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.reconfort-message__content {
  flex: 1;
  min-width: 0;
}

.reconfort-message__actions {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: flex-end;
  align-items: center;
}

.reconfort-message__action {
  padding: 0.65rem 1.15rem;
  font-size: 0.9rem;
  border-radius: 12px;
}

.reconfort-message__action--danger {
  background: rgba(192, 57, 43, 0.12);
  color: #c0392b;
  border: 1px solid rgba(192, 57, 43, 0.22);
}

.reconfort-message__action--danger:hover:not(:disabled) {
  background: rgba(192, 57, 43, 0.18);
  transform: translateY(-1px);
}

.reconfort-message__action--danger:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.reconfort-message__text {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: #2c3e50;
  line-height: 1.5;
}

.reconfort-message__conditions {
  margin: 0.65rem 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.reconfort-message__condition {
  font-size: 0.78rem;
  font-weight: 600;
  color: #6c757d;
  padding: 0.3rem 0.55rem;
  border-radius: 8px;
  background: rgba(213, 181, 234, 0.12);
  border: 1px solid rgba(213, 181, 234, 0.22);
}

@media (prefers-color-scheme: dark) {
  .reconfort-form__title,
  .reconfort-list__title,
  .reconfort-conditions__group-title {
    color: #d5b5ea;
  }

  .reconfort-conditions__legend {
    color: #adb5bd;
  }

  .reconfort-conditions__hint {
    color: #8c98a4;
  }

  .reconfort-message__text {
    color: #f0e8f8;
  }

  .reconfort-message__condition {
    color: #adb5bd;
    background: rgba(213, 181, 234, 0.08);
    border-color: rgba(213, 181, 234, 0.15);
  }

  .reconfort-message + .reconfort-message {
    border-top-color: rgba(213, 181, 234, 0.12);
  }
}

@media (max-width: 560px) {
  .reconfort-message__row {
    flex-direction: column;
    gap: 0.65rem;
  }

  .reconfort-message__actions {
    width: 100%;
    justify-content: flex-start;
  }
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
