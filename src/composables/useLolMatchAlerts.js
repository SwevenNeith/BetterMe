/**
 * Alertes fin de cooldown : flash UI, son Web Audio, vibration, notification.
 */

import { ensureServiceWorker } from '../services/common/notifications.js'

let audioCtx = null

function getAudioContext() {
  if (typeof window === 'undefined') return null
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  if (!audioCtx) audioCtx = new Ctx()
  return audioCtx
}

/** Bip court généré (pas de fichier audio). */
export async function playAlertBeep() {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    if (ctx.state === 'suspended') await ctx.resume()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.value = 0.0001
    osc.connect(gain)
    gain.connect(ctx.destination)
    const now = ctx.currentTime
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28)
    osc.start(now)
    osc.stop(now + 0.3)
  } catch (err) {
    console.warn('beep', err)
  }
}

export function vibrateAlert() {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([120, 60, 120])
    }
  } catch {
    /* ignore */
  }
}

/**
 * @param {{ title: string, body: string, tag?: string }} opts
 */
export async function showMatchNotification(opts) {
  const title = opts.title || 'BetterMe'
  const body = opts.body || ''
  const tag = opts.tag || 'lol-match-tracker'

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { ok: false, reason: 'unsupported' }
  }
  if (Notification.permission !== 'granted') {
    return { ok: false, reason: 'denied' }
  }

  try {
    const reg = await ensureServiceWorker().catch(() => null)
    if (reg?.showNotification) {
      await reg.showNotification(title, {
        body,
        tag,
        renotify: true,
        silent: false,
      })
      return { ok: true, via: 'service-worker' }
    }
  } catch (err) {
    console.warn('SW notification', err)
  }

  try {
    // Fallback desktop
    // eslint-disable-next-line no-new
    new Notification(title, { body, tag })
    return { ok: true, via: 'notification' }
  } catch (err) {
    console.warn('Notification', err)
    return { ok: false, reason: String(err?.message || err) }
  }
}

export async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported'
  }
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const result = await Notification.requestPermission()
    return result
  } catch {
    return 'denied'
  }
}

/**
 * @returns {Promise<{ wakeLock: WakeLockSentinel | null, supported: boolean }>}
 */
export async function requestWakeLock() {
  if (typeof navigator === 'undefined' || !navigator.wakeLock?.request) {
    return { wakeLock: null, supported: false }
  }
  try {
    const wakeLock = await navigator.wakeLock.request('screen')
    return { wakeLock, supported: true }
  } catch (err) {
    console.warn('Wake Lock', err)
    return { wakeLock: null, supported: true }
  }
}

export async function releaseWakeLock(sentinel) {
  try {
    await sentinel?.release?.()
  } catch {
    /* ignore */
  }
}
