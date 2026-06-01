import { ref, watch } from 'vue'
import { supabase } from '../lib/supabase.js'
import {
  fetchSymptomEntriesForDate,
  fetchSymptomEntryById,
  formatEntryLabel,
  rowToSymptomValues,
  saveSymptomField,
} from '../services/menstruationSymptoms.js'

/**
 * Charge / enregistre les symptômes : plusieurs saisies possibles par jour.
 */
export function useMenstruationSymptomPersistence({
  userId,
  typeCycle,
  context,
  symptomDefs,
  createEmptyValues,
}) {
  const values = ref({})
  const entries = ref([])
  const activeEntryId = ref(null)
  const isLoading = ref(false)
  const isSaving = ref(false)
  const saveError = ref('')
  const lastSavedAt = ref(null)

  let loadToken = 0

  function applyRowToValues(row, phase) {
    values.value = row
      ? rowToSymptomValues(row, symptomDefs.value)
      : createEmptyValues(phase)
  }

  async function loadFromDb() {
    const uid = userId.value ?? userId
    const ctx = context.value
    const phase = ctx?.phase ?? ctx?.period

    if (!uid || !ctx?.iso || !phase) {
      entries.value = []
      activeEntryId.value = null
      values.value = createEmptyValues(phase)
      return
    }

    const token = ++loadToken
    isLoading.value = true
    saveError.value = ''

    try {
      const list = await fetchSymptomEntriesForDate(supabase, uid, ctx.iso, typeCycle)
      if (token !== loadToken) return

      entries.value = list

      const keepId =
        activeEntryId.value && list.some((e) => e.id === activeEntryId.value)
          ? activeEntryId.value
          : null

      if (keepId) {
        const row = list.find((e) => e.id === keepId)
        activeEntryId.value = keepId
        applyRowToValues(row, phase)
      } else {
        activeEntryId.value = null
        values.value = createEmptyValues(phase)
      }
    } catch (err) {
      if (token !== loadToken) return
      console.error(err)
      saveError.value = err.message || 'Impossible de charger les symptômes.'
      entries.value = []
      activeEntryId.value = null
      values.value = createEmptyValues(phase)
    } finally {
      if (token === loadToken) isLoading.value = false
    }
  }

  watch(
    () => {
      const uid = userId.value ?? userId
      const ctx = context.value
      return [uid, ctx?.iso, ctx?.phase ?? ctx?.period, ctx?.cycle?.id, typeCycle]
    },
    () => {
      activeEntryId.value = null
      loadFromDb()
    },
    { immediate: true },
  )

  async function selectEntry(entryId) {
    const uid = userId.value ?? userId
    const ctx = context.value
    const phase = ctx?.phase ?? ctx?.period
    if (!uid || !entryId) return

    isLoading.value = true
    saveError.value = ''
    try {
      const row = await fetchSymptomEntryById(supabase, uid, entryId)
      activeEntryId.value = entryId
      applyRowToValues(row, phase)
    } catch (err) {
      console.error(err)
      saveError.value = err.message || 'Impossible de charger cette saisie.'
    } finally {
      isLoading.value = false
    }
  }

  function startNewEntry() {
    const ctx = context.value
    const phase = ctx?.phase ?? ctx?.period
    activeEntryId.value = null
    values.value = createEmptyValues(phase)
    saveError.value = ''
  }

  function entryLabel(entry) {
    return formatEntryLabel(entry)
  }

  async function persistField(fieldKey, value) {
    const uid = userId.value ?? userId
    const ctx = context.value
    const phase = ctx?.phase ?? ctx?.period
    const cycleId = ctx?.cycle?.id

    if (!uid || !ctx?.iso || !phase || !cycleId) return

    isSaving.value = true
    saveError.value = ''

    try {
      const { entryId } = await saveSymptomField(
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
      )
      if (entryId) {
        activeEntryId.value = entryId
        const list = await fetchSymptomEntriesForDate(supabase, uid, ctx.iso, typeCycle)
        entries.value = list
      }
      lastSavedAt.value = Date.now()
    } catch (err) {
      console.error(err)
      saveError.value = err.message || 'Impossible d’enregistrer ce symptôme.'
    } finally {
      isSaving.value = false
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
    entries,
    activeEntryId,
    isLoading,
    isSaving,
    saveError,
    lastSavedAt,
    loadFromDb,
    selectEntry,
    startNewEntry,
    entryLabel,
    selectScale,
    selectEnum,
    selectBoolean,
    selectSide,
  }
}
