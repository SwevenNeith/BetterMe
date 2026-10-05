import { onMounted, onUnmounted } from 'vue'
import { supabase } from '../lib/supabase.js'
import { markNetworkResumed } from '../utils/common/fetchWithTimeout.js'

export const TAB_HIDDEN_EVENT = 'betterme-tab-hidden'
export const TAB_RESUME_EVENT = 'betterme-tab-resume'

const MIN_HIDDEN_MS = 800
const RESUME_COOLDOWN_MS = 1500

function getAppRelativePath(pathname = window.location.pathname) {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  let path = pathname.replace(/\/$/, '') || '/'
  if (base && base !== '/' && path.startsWith(base)) {
    path = path.slice(base.length) || '/'
  }
  return path.replace(/\/$/, '') || '/'
}

function isAuthenticatedAppPath() {
  return getAppRelativePath() !== '/'
}

let hiddenSince = 0
let resumeTimer = null
let lastResumeAt = 0
let filePickerActive = false
let fileUploadInProgress = false
let mutationDepth = 0

function isFocusInEmbeddedFrame() {
  try {
    return document.activeElement?.tagName === 'IFRAME'
  } catch {
    return false
  }
}

export function isTabReloadSuppressed() {
  return filePickerActive || fileUploadInProgress || mutationDepth > 0 || isFocusInEmbeddedFrame()
}

export function hasActiveMutations() {
  return mutationDepth > 0
}

export function setFilePickerActive(active) {
  filePickerActive = Boolean(active)
  if (filePickerActive) hiddenSince = 0
}

export function setFileUploadInProgress(active) {
  fileUploadInProgress = Boolean(active)
}

export function setMutationInProgress(active) {
  mutationDepth = Math.max(0, mutationDepth + (active ? 1 : -1))
}

function notifyTabHidden() {
  window.dispatchEvent(new CustomEvent(TAB_HIDDEN_EVENT))
}

function notifyTabResume(detail = {}) {
  window.dispatchEvent(new CustomEvent(TAB_RESUME_EVENT, { detail }))
}

/**
 * Reprise minimale : pas de reload, pas de getSession (peut bloquer le verrou auth),
 * pas d’invalidation de vues. On réveille juste le refresh token.
 */
function resumeAuthenticatedApp(elapsedMs) {
  if (!isAuthenticatedAppPath()) return

  const now = Date.now()
  if (now - lastResumeAt < RESUME_COOLDOWN_MS) return
  lastResumeAt = now

  markNetworkResumed()
  try {
    supabase.auth.startAutoRefresh()
  } catch {
    /* ignore */
  }

  notifyTabResume({ remount: false, elapsedMs })
}

function tryResumeAfterBackground() {
  if (!hiddenSince) return
  if (document.visibilityState !== 'visible') return
  if (filePickerActive || fileUploadInProgress || isFocusInEmbeddedFrame()) {
    hiddenSince = 0
    return
  }

  const elapsed = Date.now() - hiddenSince
  hiddenSince = 0
  if (elapsed < MIN_HIDDEN_MS) return
  resumeAuthenticatedApp(elapsed)
}

function markTabHidden() {
  if (document.visibilityState !== 'hidden') return
  if (filePickerActive || fileUploadInProgress || isFocusInEmbeddedFrame()) return
  if (!hiddenSince) hiddenSince = Date.now()
  try {
    supabase.auth.stopAutoRefresh()
  } catch {
    /* ignore */
  }
  notifyTabHidden()
}

function scheduleResumeCheck() {
  if (filePickerActive || fileUploadInProgress || isFocusInEmbeddedFrame()) return
  if (resumeTimer != null) clearTimeout(resumeTimer)
  resumeTimer = setTimeout(() => {
    resumeTimer = null
    tryResumeAfterBackground()
  }, 200)
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    markTabHidden()
    return
  }
  scheduleResumeCheck()
}

function onPageShow(event) {
  if (!event.persisted) return
  if (filePickerActive || fileUploadInProgress || isFocusInEmbeddedFrame()) return
  resumeAuthenticatedApp(MIN_HIDDEN_MS)
}

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
