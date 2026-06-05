import { ref, watch, unref, onMounted, onUnmounted } from 'vue'
import { supabase } from '../lib/supabase.js'
import { TAB_HIDDEN_EVENT } from './useAppTabResume.js'
import { withTimeout } from '../utils/asyncTimeout.js'
import {
  computeCycleContext,
  computeScoreGlobal,
  detectEmotionPatterns,
  getEmotionLogForDate,
  listEmotionLogs,
  saveEmotionLogForDate,
} from '../services/emotionLogs.js'
import { maybeScheduleReconfortNotification } from '../services/reconfortNotifications.js'

const SAVE_TIMEOUT_MS = 25_000
const LOAD_TIMEOUT_MS = 20_000

function snapshotFromRow(row) {
  return {
    humeurGenerale: row['humeur_générale'],
    energieEmotionnelle: row['énergie_émotionnelle'],
    besoinReassurance: row['besoin_réassurance'],
    sentimentGeneral: row['sentiment_général'],
  }
}

function snapshotFromValues(values) {
  return {
    humeurGenerale: values.humeurGenerale,
    energieEmotionnelle: values.energieEmotionnelle,
    besoinReassurance: values.besoinReassurance,
    sentimentGeneral: values.sentimentGeneral,
  }
}

export function useEmotionalCheckinPersistence({
  userId,
  dateJour,
  menstruationMode,
  cyclesPilule,
  cyclesNaturel,
  setCheckinPayload,
}) {
  const activeLogId = ref(null)
  const savedToday = ref(false)
  const savedSnapshot = ref(null)
  const patternMessage = ref('')
  const isLoading = ref(false)
  const isSaving = ref(false)
  const saveMessage = ref('')
  let loadToken = 0
  let saveToken = 0
  let lastContextKey = ''

  function cancelPendingWork() {
    loadToken++
    saveToken++
    isLoading.value = false
    isSaving.value = false
  }

  async function loadPatterns(uid) {
    try {
      const logs = await listEmotionLogs(supabase, uid, { limit: 180 })
      patternMessage.value = detectEmotionPatterns(logs) || ''
    } catch (err) {
      console.error('Détection patterns emotion_logs:', err)
    }
  }

  async function loadFromDb({ applyToForm = true, silent = false } = {}) {
    const uid = unref(userId)
    const day = unref(dateJour)

    if (!uid || !day) {
      activeLogId.value = null
      savedToday.value = false
      savedSnapshot.value = null
      isLoading.value = false
      if (applyToForm) setCheckinPayload({})
      return
    }

    const token = ++loadToken
    if (!silent) isLoading.value = true

    try {
      const row = await withTimeout(
        getEmotionLogForDate(supabase, uid, day),
        LOAD_TIMEOUT_MS,
      )
      if (token !== loadToken) return

      if (row) {
        savedToday.value = true
        activeLogId.value = row.id ?? null
        const snap = snapshotFromRow(row)
        savedSnapshot.value = snap
        if (applyToForm) setCheckinPayload(snap)
        await loadPatterns(uid)
      } else {
        savedToday.value = false
        activeLogId.value = null
        savedSnapshot.value = null
        patternMessage.value = ''
        if (applyToForm) setCheckinPayload({})
      }
    } catch (err) {
      if (token !== loadToken) return
      console.error('Chargement emotion_logs:', err)
      saveMessage.value = err.message || 'Impossible de charger le check-in du jour.'
    } finally {
      if (token === loadToken) isLoading.value = false
    }
  }

  watch(
    () => {
      const uid = unref(userId)
      const day = unref(dateJour)
      return `${uid ?? ''}|${day ?? ''}`
    },
    (key) => {
      const dateChanged = lastContextKey && key !== lastContextKey
      const silent = Boolean(lastContextKey)
      lastContextKey = key
      if (dateChanged) {
        activeLogId.value = null
      }
      loadFromDb({ applyToForm: !silent, silent })
    },
    { immediate: true },
  )

  function onTabHidden() {
    cancelPendingWork()
  }

  onMounted(() => {
    window.addEventListener(TAB_HIDDEN_EVENT, onTabHidden)
  })

  onUnmounted(() => {
    window.removeEventListener(TAB_HIDDEN_EVENT, onTabHidden)
    cancelPendingWork()
  })

  async function saveCheckin(values) {
    const uid = unref(userId)
    const day = unref(dateJour)

    if (!uid || !day) {
      saveMessage.value = 'Connecte-toi pour enregistrer.'
      return false
    }

    if (document.visibilityState === 'hidden') {
      saveMessage.value = 'Reviens sur l’onglet BetterMe pour enregistrer.'
      return false
    }

    const wasSaved = savedToday.value
    const token = ++saveToken
    isSaving.value = true
    saveMessage.value = ''

    try {
      const score_global = computeScoreGlobal({
        humeurGenerale: values.humeurGenerale,
        energieEmotionnelle: values.energieEmotionnelle,
        sentimentGeneral: values.sentimentGeneral,
        besoinReassurance: values.besoinReassurance,
      })

      const { cycle, typeCycle, jourRelatif } = computeCycleContext({
        dateJour: day,
        menstruationMode: menstruationMode.value,
        cyclesPilule: cyclesPilule.value,
        cyclesNaturel: cyclesNaturel.value,
      })

      const payload = {
        user_id: uid,
        date_jour: day,
        'humeur_générale': Number(values.humeurGenerale),
        'énergie_émotionnelle': Number(values.energieEmotionnelle),
        besoin_réassurance: Boolean(values.besoinReassurance),
        'sentiment_général': Number(values.sentimentGeneral),
        score_global,
        jour_relatif: jourRelatif,
        cycle_id: cycle?.id ?? null,
        type_cycle: typeCycle,
      }

      const result = await withTimeout(
        saveEmotionLogForDate(supabase, uid, payload, activeLogId.value),
        SAVE_TIMEOUT_MS,
        'Délai dépassé. Reviens sur l’onglet BetterMe puis réessaie.',
      )
      if (token !== saveToken) return false

      if (result?.id) activeLogId.value = result.id

      savedToday.value = true
      savedSnapshot.value = snapshotFromValues(values)
      saveMessage.value = wasSaved
        ? 'Données mises à jour.'
        : 'Données du jour enregistrées.'

      await loadPatterns(uid)
      void maybeScheduleReconfortNotification(supabase, uid, {
        dateISO: day,
        checkinPartial: snapshotFromValues(values),
      })
      return true
    } catch (err) {
      if (token !== saveToken) return false
      console.error('Enregistrement emotion_logs:', err)
      saveMessage.value = err.message || "Impossible d'enregistrer pour l'instant."
      return false
    } finally {
      if (token === saveToken) isSaving.value = false
    }
  }

  function cancelToSaved() {
    saveMessage.value = ''
    if (savedToday.value && savedSnapshot.value) {
      setCheckinPayload(savedSnapshot.value)
    }
  }

  return {
    activeLogId,
    savedToday,
    patternMessage,
    isLoading,
    isSaving,
    saveMessage,
    loadFromDb,
    saveCheckin,
    cancelToSaved,
  }
}
