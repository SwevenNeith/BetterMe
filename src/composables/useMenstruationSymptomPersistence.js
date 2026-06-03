import { ref, watch, unref, onMounted, onUnmounted } from 'vue'
import { supabase } from '../lib/supabase.js'
import { TAB_HIDDEN_EVENT } from './useAppTabResume.js'
import { withTimeout } from '../utils/asyncTimeout.js'
import {
  fetchSymptomEntriesForDate,
  fetchSymptomEntryById,
  formatEntryLabel,
  rowToSymptomValues,
  saveSymptomField,
} from '../services/menstruationSymptoms.js'

const SAVE_TIMEOUT_MS = 25_000
const LOAD_TIMEOUT_MS = 20_000

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
  let saveToken = 0
  let lastContextKey = ''

  function applyRowToValues(row, phase) {
    values.value = row
      ? rowToSymptomValues(row, symptomDefs.value)
      : createEmptyValues(phase)
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
    const phase = ctx?.phase ?? ctx?.period

    if (!uid || !ctx?.iso || !phase) {
      entries.value = []
      activeEntryId.value = null
      values.value = createEmptyValues(phase)
      isLoading.value = false
      return
    }

    const token = ++loadToken
    if (!silent) isLoading.value = true
    saveError.value = ''

    try {
      const list = await withTimeout(
        fetchSymptomEntriesForDate(supabase, uid, ctx.iso, typeCycle),
        LOAD_TIMEOUT_MS,
      )
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
      const uid = unref(userId)
      const ctx = context.value
      const phase = ctx?.phase ?? ctx?.period
      return `${uid ?? ''}|${ctx?.iso ?? ''}|${phase ?? ''}|${ctx?.cycle?.id ?? ''}|${typeCycle}`
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

  async function selectEntry(entryId) {
    const uid = unref(userId)
    const ctx = context.value
    const phase = ctx?.phase ?? ctx?.period
    if (!uid || !entryId) return

    const token = ++loadToken
    isLoading.value = true
    saveError.value = ''
    try {
      const row = await fetchSymptomEntryById(supabase, uid, entryId)
      if (token !== loadToken) return
      activeEntryId.value = entryId
      applyRowToValues(row, phase)
    } catch (err) {
      if (token !== loadToken) return
      console.error(err)
      saveError.value = err.message || 'Impossible de charger cette saisie.'
    } finally {
      if (token === loadToken) isLoading.value = false
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
        const list = await withTimeout(
          fetchSymptomEntriesForDate(supabase, uid, ctx.iso, typeCycle),
          LOAD_TIMEOUT_MS,
        )
        if (token !== saveToken) return
        entries.value = list
      }
      lastSavedAt.value = Date.now()
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
