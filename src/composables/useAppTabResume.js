import { onMounted, onUnmounted } from 'vue'
import { supabase } from '../lib/supabase.js'
import { withTimeout } from '../utils/common/asyncTimeout.js'

export const TAB_HIDDEN_EVENT = 'betterme-tab-hidden'
export const TAB_RESUME_EVENT = 'betterme-tab-resume'

/** Ignore les micro-bascules (notifs, etc.). */
const MIN_HIDDEN_MS = 800
/** Anti double-reprise. */
const RESUME_COOLDOWN_MS = 1500
/**
 * Au-delà, le navigateur mobile a souvent tué le réseau :
 * un seul hard reload évite les « Enregistrement… » gelés.
 */
const HARD_RELOAD_AFTER_MS = 10 * 60 * 1000
/** Si getSession ne répond pas, le client est probablement gelé. */
const SESSION_PROBE_MS = 4_000

/** Chemin app relatif à la base Vite (ex. /BetterMe/dashboard → /dashboard). */
function getAppRelativePath(pathname = window.location.pathname) {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  let path = pathname.replace(/\/$/, '') || '/'
  if (base && base !== '/' && path.startsWith(base)) {
    path = path.slice(base.length) || '/'
  }
  return path.replace(/\/$/, '') || '/'
}

/** Toute route authentifiée (AppLayout) : tout sauf la page de connexion à /. */
function isAuthenticatedAppPath() {
  return getAppRelativePath() !== '/'
}

let hiddenSince = 0
let resumeTimer = null
let lastResumeAt = 0
let filePickerActive = false
let fileUploadInProgress = false
/** Compteur d’écritures en cours (check-in, symptômes, notes…). */
let mutationDepth = 0

/** Focus dans une iframe (widgets notes) : blur parent sans quitter l’onglet. */
function isFocusInEmbeddedFrame() {
  try {
    return document.activeElement?.tagName === 'IFRAME'
  } catch {
    return false
  }
}

function shouldSuppressTabResume() {
  return (
    filePickerActive ||
    fileUploadInProgress ||
    mutationDepth > 0 ||
    isFocusInEmbeddedFrame()
  )
}

export function isTabReloadSuppressed() {
  return shouldSuppressTabResume()
}

export function hasActiveMutations() {
  return mutationDepth > 0
}

/** À appeler à l’ouverture / fermeture du sélecteur de fichiers. */
export function setFilePickerActive(active) {
  filePickerActive = Boolean(active)
  if (filePickerActive) hiddenSince = 0
}

/** Pendant un upload Storage. */
export function setFileUploadInProgress(active) {
  fileUploadInProgress = Boolean(active)
}

/**
 * Protège les enregistrements : pas de resume/refetch pendant une mutation.
 * @param {boolean} active
 */
export function setMutationInProgress(active) {
  mutationDepth = Math.max(0, mutationDepth + (active ? 1 : -1))
}

function notifyTabHidden() {
  window.dispatchEvent(new CustomEvent(TAB_HIDDEN_EVENT))
}

function notifyTabResume(detail = {}) {
  window.dispatchEvent(new CustomEvent(TAB_RESUME_EVENT, { detail }))
}

function hardReloadOnce() {
  if (!isAuthenticatedAppPath()) return
  if (shouldSuppressTabResume()) return
  window.location.reload()
}

/**
 * Reprise au retour :
 * - courte absence : sonde la session, pas de reload ni d’invalidation de formulaires
 * - longue absence / session gelée : un seul hard reload
 */
async function resumeAuthenticatedApp(elapsedMs) {
  if (!isAuthenticatedAppPath()) return
  if (shouldSuppressTabResume()) return

  const now = Date.now()
  if (now - lastResumeAt < RESUME_COOLDOWN_MS) return
  lastResumeAt = now

  if (elapsedMs >= HARD_RELOAD_AFTER_MS) {
    hardReloadOnce()
    return
  }

  try {
    await withTimeout(
      supabase.auth.getSession(),
      SESSION_PROBE_MS,
      'Session probe timeout',
    )
  } catch {
    hardReloadOnce()
    return
  }

  // Signal léger : les listes peuvent se rafraîchir, pas les formulaires en édition.
  notifyTabResume({ elapsedMs })
}

function tryResumeAfterBackground() {
  if (!hiddenSince) return
  if (document.visibilityState !== 'visible') return
  if (shouldSuppressTabResume()) {
    hiddenSince = 0
    return
  }

  const elapsed = Date.now() - hiddenSince
  hiddenSince = 0

  if (elapsed < MIN_HIDDEN_MS) return

  void resumeAuthenticatedApp(elapsed)
}

function markTabHidden() {
  // Uniquement la vraie mise en arrière-plan (pas blur/focus).
  if (document.visibilityState !== 'hidden') return
  if (shouldSuppressTabResume()) return
  if (!hiddenSince) hiddenSince = Date.now()
  notifyTabHidden()
}

function scheduleResumeCheck() {
  if (shouldSuppressTabResume()) return
  if (resumeTimer != null) clearTimeout(resumeTimer)
  resumeTimer = setTimeout(() => {
    resumeTimer = null
    tryResumeAfterBackground()
  }, 150)
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    markTabHidden()
    return
  }
  scheduleResumeCheck()
}

function onPageShow(event) {
  if (!event.persisted || shouldSuppressTabResume()) return
  // bfcache : même logique (sonde, reload seulement si réseau mort).
  void resumeAuthenticatedApp(MIN_HIDDEN_MS)
}

/**
 * Cycle de vie onglet / app mobile.
 * Pas de blur/focus (trop de faux positifs → boucles d’enregistrement).
 */
export function useAppTabResume() {
  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pageshow', onPageShow)
  })

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pageshow', onPageShow)
    if (resumeTimer != null) clearTimeout(resumeTimer)
  })
}
