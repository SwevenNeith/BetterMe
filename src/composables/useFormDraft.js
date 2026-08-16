import { onScopeDispose, toValue, watch } from 'vue'

const STORAGE_PREFIX = 'betterme:form-draft:v1:'

/**
 * Persiste un formulaire dans localStorage pendant la saisie.
 * Restauré après refresh / retour sur la page ; effacé via clearDraft() (Annuler / succès).
 *
 * @param {import('vue').MaybeRefOrGetter<string|null|undefined>} draftKeySource
 * @param {object} options
 * @param {() => unknown} options.getState
 * @param {(state: any) => void} options.setState
 * @param {import('vue').MaybeRefOrGetter<boolean>} [options.enabled]
 * @param {number} [options.debounceMs]
 */
export function useFormDraft(draftKeySource, options) {
  const { getState, setState, enabled = true, debounceMs = 450 } = options

  let saveTimer = null
  let restoring = false
  let skipNextSave = false

  function resolveStorageKey() {
    const key = toValue(draftKeySource)
    if (!key) return null
    return `${STORAGE_PREFIX}${key}`
  }

  function clearDraft() {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    const storageKey = resolveStorageKey()
    if (!storageKey) return
    try {
      localStorage.removeItem(storageKey)
    } catch {
      /* quota / private mode */
    }
  }

  function readDraft() {
    const storageKey = resolveStorageKey()
    if (!storageKey) return null
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return parsed?.state ?? null
    } catch {
      return null
    }
  }

  function hasDraft() {
    return readDraft() != null
  }

  function saveDraftNow() {
    if (restoring) return
    if (skipNextSave) {
      skipNextSave = false
      return
    }
    if (!toValue(enabled)) return

    const storageKey = resolveStorageKey()
    if (!storageKey) return

    try {
      const state = getState()
      if (state == null) {
        localStorage.removeItem(storageKey)
        return
      }
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          v: 1,
          savedAt: Date.now(),
          state,
        }),
      )
    } catch (err) {
      console.warn('useFormDraft: enregistrement impossible', err)
    }
  }

  function scheduleSave() {
    if (restoring || skipNextSave || !toValue(enabled) || !resolveStorageKey()) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      saveDraftNow()
    }, debounceMs)
  }

  /**
   * @returns {boolean} true si un brouillon a été appliqué
   */
  function restoreDraft() {
    const state = readDraft()
    if (state == null) return false

    restoring = true
    try {
      setState(state)
      skipNextSave = true
      return true
    } finally {
      restoring = false
    }
  }

  watch(
    () => {
      if (!toValue(enabled) || !toValue(draftKeySource)) return null
      return getState()
    },
    () => {
      scheduleSave()
    },
    { deep: true },
  )

  onScopeDispose(() => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
      saveDraftNow()
    }
  })

  return {
    clearDraft,
    restoreDraft,
    saveDraftNow,
    hasDraft,
    readDraft,
  }
}

/**
 * Construit une clé de brouillon stable.
 * @param {...(string|number|null|undefined)} parts
 */
export function formDraftKey(...parts) {
  return parts
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(':')
}
