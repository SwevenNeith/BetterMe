import { ref, watch, unref, onMounted, onUnmounted } from 'vue'
import { supabase } from '../lib/supabase.js'
import { TAB_HIDDEN_EVENT } from './useAppTabResume.js'
import { withTimeout } from '../utils/asyncTimeout.js'
import {
  fetchSymptomEntryForDate,
  rowToSymptomValues,
  saveSymptomField,
  createEmptyValuesFromDefs,
} from '../services/menstruationSymptoms.js'
import { maybeScheduleReconfortNotification } from '../services/reconfortNotifications.js'

const SAVE_TIMEOUT_MS = 25_000
const LOAD_TIMEOUT_MS = 20_000

/**
 * Charge / enregistre les symptômes : une seule saisie modifiable par jour.
 */
export function useMenstruationSymptomPersistence({
  userId,
  typeCycle,
  context,
  symptomDefs,
}) {
  const values = ref({})
  const activeEntryId = ref(null)
  const savedToday = ref(false)
  const isLoading = ref(false)
  const isSaving = ref(false)
  const saveError = ref('')
  const lastSavedAt = ref(null)

  let loadToken = 0
  let saveToken = 0
  let lastContextKey = ''

  function applyRowToValues(row) {
    values.value = row
      ? rowToSymptomValues(row, symptomDefs.value)
      : createEmptyValuesFromDefs(symptomDefs.value)
  }

  function cancelPendingWork() {
    loadToken++
    saveToken++
    isLoading.value = false
    isSaving.value = false
  }

  async function loadFromDb({ silent = false } = {}) {
    const uid = unref(userId)
    const ctx = context.value

    if (!uid || !ctx?.iso) {
      activeEntryId.value = null
      savedToday.value = false
      values.value = createEmptyValuesFromDefs(symptomDefs.value)
      isLoading.value = false
      return
    }

    const token = ++loadToken
    if (!silent) isLoading.value = true
    saveError.value = ''

    try {
      const row = await withTimeout(
        fetchSymptomEntryForDate(supabase, uid, ctx.iso, typeCycle),
        LOAD_TIMEOUT_MS,
      )
      if (token !== loadToken) return

      activeEntryId.value = row?.id ?? null
      savedToday.value = Boolean(row?.id)
      applyRowToValues(row)
    } catch (err) {
      if (token !== loadToken) return
      console.error(err)
      saveError.value = err.message || 'Impossible de charger les symptômes.'
      activeEntryId.value = null
      savedToday.value = false
      values.value = createEmptyValuesFromDefs(symptomDefs.value)
    } finally {
      if (token === loadToken) isLoading.value = false
    }
  }

  watch(
    () => {
      const uid = unref(userId)
      const ctx = context.value
      return `${uid ?? ''}|${ctx?.iso ?? ''}|${ctx?.cycle?.id ?? ''}|${typeCycle}`
    },
    (key) => {
      const contextChanged = lastContextKey && key !== lastContextKey
      const silent = Boolean(lastContextKey)
      lastContextKey = key
      if (contextChanged) {
        activeEntryId.value = null
      }
      loadFromDb({ silent })
    },
    { immediate: true },
  )

  watch(
    () => symptomDefs.value,
    () => {
      if (activeEntryId.value) return
      values.value = createEmptyValuesFromDefs(symptomDefs.value)
    },
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

  async function persistField(fieldKey, value) {
    const uid = unref(userId)
    const ctx = context.value
    const phase = ctx?.phase ?? ctx?.period
    const cycleId = ctx?.cycle?.id

    if (!uid || !ctx?.iso || !phase || !cycleId) return
    if (document.visibilityState === 'hidden') {
      saveError.value = 'Reviens sur l’onglet BetterMe pour enregistrer.'
      return
    }

    const token = ++saveToken
    isSaving.value = true
    saveError.value = ''

    try {
      const { entryId } = await withTimeout(
        saveSymptomField(
          supabase,
          uid,
          {
            dateJour: ctx.iso,
            phase,
            typeCycle,
            cycleId,
            cycle: ctx.cycle,
            entryId: activeEntryId.value,
          },
          fieldKey,
          value,
        ),
        SAVE_TIMEOUT_MS,
        'Délai dépassé. Reviens sur l’onglet BetterMe puis réessaie.',
      )
      if (token !== saveToken) return

      if (entryId) {
        activeEntryId.value = entryId
        savedToday.value = true
      }
      lastSavedAt.value = Date.now()
      void maybeScheduleReconfortNotification(supabase, uid, {
        dateISO: ctx.iso,
        symptomsPartial: { ...values.value },
      })
    } catch (err) {
      if (token !== saveToken) return
      console.error(err)
      saveError.value = err.message || 'Impossible d’enregistrer ce symptôme.'
    } finally {
      if (token === saveToken) isSaving.value = false
    }
  }

  function selectScale(key, n) {
    const v = values.value[key] === n ? null : n
    values.value = { ...values.value, [key]: v }
    persistField(key, v)
  }

  function selectEnum(key, v) {
    const next = values.value[key] === v ? null : v
    values.value = { ...values.value, [key]: next }
    persistField(key, next)
  }

  async function selectBoolean(key, v, { clearSideKey } = {}) {
    const next = { ...values.value, [key]: values.value[key] === v ? null : v }
    if (clearSideKey && (v === false || next[key] !== true)) {
      next[clearSideKey] = null
    }
    values.value = next
    await persistField(key, next[key])
    if (clearSideKey && (v === false || next[key] !== true)) {
      await persistField(clearSideKey, null)
    }
  }

  function selectSide(sideKey, v) {
    const next = values.value[sideKey] === v ? null : v
    values.value = { ...values.value, [sideKey]: next }
    persistField(sideKey, next)
  }

  return {
    values,
    activeEntryId,
    savedToday,
    isLoading,
    isSaving,
    saveError,
    lastSavedAt,
    loadFromDb,
    selectScale,
    selectEnum,
    selectBoolean,
    selectSide,
  }
}
