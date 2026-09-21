/**
 * Persistance légère (onglet) pour recherches / filtres de listes.
 */

/**
 * @template {Record<string, unknown>} T
 * @param {string} key
 * @param {T} defaults
 * @returns {T}
 */
export function readPersistedPageState(key, defaults) {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return { ...defaults }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...defaults }
    return { ...defaults, ...parsed }
  } catch {
    return { ...defaults }
  }
}

/**
 * @param {string} key
 * @param {Record<string, unknown>} state
 */
export function writePersistedPageState(key, state) {
  try {
    sessionStorage.setItem(key, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}
