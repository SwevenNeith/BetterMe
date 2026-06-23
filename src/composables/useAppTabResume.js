import { onMounted, onUnmounted } from 'vue'
import { invalidateAllPageCaches } from '../stores/invalidatePageCaches.js'

export const TAB_HIDDEN_EVENT = 'betterme-tab-hidden'

const RELOAD_FLAG = 'betterme-tab-reload-pending'
const MIN_HIDDEN_MS = 800

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
let filePickerActive = false
let fileUploadInProgress = false

function shouldSuppressTabReload() {
  return filePickerActive || fileUploadInProgress
}

export function isTabReloadSuppressed() {
  return shouldSuppressTabReload()
}

/** À appeler à l’ouverture / fermeture du sélecteur de fichiers (évite un reload au retour). */
export function setFilePickerActive(active) {
  filePickerActive = Boolean(active)
  if (filePickerActive) {
    hiddenSince = 0
  }
}

/** Pendant un upload Storage, ne pas recharger l’app. */
export function setFileUploadInProgress(active) {
  fileUploadInProgress = Boolean(active)
}

function notifyTabHidden() {
  window.dispatchEvent(new CustomEvent(TAB_HIDDEN_EVENT))
}

function reloadAuthenticatedApp() {
  if (!isAuthenticatedAppPath()) return
  if (shouldSuppressTabReload()) return
  invalidateAllPageCaches()
  try {
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()))
  } catch {
    /* ignore */
  }
  window.location.reload()
}

function tryReloadAfterBackground() {
  if (!hiddenSince) return
  if (document.visibilityState !== 'visible') return
  if (shouldSuppressTabReload()) {
    hiddenSince = 0
    return
  }

  const elapsed = Date.now() - hiddenSince
  hiddenSince = 0

  if (elapsed < MIN_HIDDEN_MS) return

  reloadAuthenticatedApp()
}

function markTabHidden() {
  if (shouldSuppressTabReload()) return
  if (!hiddenSince) hiddenSince = Date.now()
  notifyTabHidden()
}

function scheduleReloadCheck() {
  if (shouldSuppressTabReload()) return
  if (resumeTimer != null) clearTimeout(resumeTimer)
  resumeTimer = setTimeout(() => {
    resumeTimer = null
    tryReloadAfterBackground()
  }, 150)
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    markTabHidden()
    return
  }
  scheduleReloadCheck()
}

function onWindowBlur() {
  markTabHidden()
}

function onWindowFocus() {
  scheduleReloadCheck()
}

function onPageShow(event) {
  if (event.persisted && !shouldSuppressTabReload()) {
    reloadAuthenticatedApp()
  }
}

/**
 * Recharge l’app au retour sur l’onglet navigateur (évite l’état gelé après arrière-plan).
 * À brancher une seule fois dans App.vue.
 */
export function useAppTabResume() {
  onMounted(() => {
    try {
      if (sessionStorage.getItem(RELOAD_FLAG)) {
        sessionStorage.removeItem(RELOAD_FLAG)
      }
    } catch {
      /* ignore */
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('blur', onWindowBlur)
    window.addEventListener('focus', onWindowFocus)
    window.addEventListener('pageshow', onPageShow)
  })

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('blur', onWindowBlur)
    window.removeEventListener('focus', onWindowFocus)
    window.removeEventListener('pageshow', onPageShow)
    if (resumeTimer != null) clearTimeout(resumeTimer)
  })
}
