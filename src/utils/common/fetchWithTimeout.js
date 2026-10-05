/** Horodatage du dernier retour au premier plan. */
let lastNetworkResumeAt = 0

export function markNetworkResumed() {
  lastNetworkResumeAt = Date.now()
}

export function wasRecentlyResumed(withinMs = 20_000) {
  return Date.now() - lastNetworkResumeAt < withinMs
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function waitUntilVisible() {
  if (typeof document === 'undefined') return Promise.resolve()
  if (document.visibilityState === 'visible') return Promise.resolve()
  return new Promise((resolve) => {
    const onChange = () => {
      if (document.visibilityState === 'visible') {
        document.removeEventListener('visibilitychange', onChange)
        resolve()
      }
    }
    document.addEventListener('visibilitychange', onChange)
  })
}

function isRetriableNetworkError(err) {
  const name = err?.name || ''
  const msg = String(err?.message || '')
  return (
    name === 'AbortError' ||
    name === 'TypeError' ||
    msg.includes('Délai réseau') ||
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('network')
  )
}

/**
 * fetch résistant à la mise en arrière-plan mobile :
 * - le délai est en pause tant que l’onglet est hidden
 * - retry unique sur erreur réseau / abort (typique au switch d’app)
 */
export async function fetchWithTimeout(input, init = {}, timeoutMs = 25_000) {
  const runOnce = () =>
    new Promise((resolve, reject) => {
      const externalSignal = init.signal
      if (externalSignal?.aborted) {
        reject(externalSignal.reason ?? new DOMException('Aborted', 'AbortError'))
        return
      }

      const controller = new AbortController()
      const onExternalAbort = () => {
        controller.abort(externalSignal?.reason)
      }
      if (externalSignal) {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true })
      }

      let remaining = timeoutMs
      let lastTick = Date.now()
      let timeoutId = null
      let settled = false

      const cleanup = () => {
        if (timeoutId != null) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', onVisibility)
        }
        if (externalSignal) {
          externalSignal.removeEventListener('abort', onExternalAbort)
        }
      }

      const finish = (fn, value) => {
        if (settled) return
        settled = true
        cleanup()
        fn(value)
      }

      const armTimer = () => {
        if (timeoutId != null) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          return
        }
        lastTick = Date.now()
        timeoutId = setTimeout(() => {
          controller.abort()
          finish(reject, new Error('Délai réseau dépassé. Réessaie.'))
        }, Math.max(remaining, 1))
      }

      const onVisibility = () => {
        if (typeof document === 'undefined' || settled) return
        if (document.visibilityState === 'hidden') {
          if (timeoutId != null) {
            remaining = Math.max(0, remaining - (Date.now() - lastTick))
            clearTimeout(timeoutId)
            timeoutId = null
          }
          return
        }
        armTimer()
      }

      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibility)
      }
      armTimer()

      fetch(input, { ...init, signal: controller.signal }).then(
        (response) => finish(resolve, response),
        (err) => finish(reject, err),
      )
    })

  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    await waitUntilVisible()
  }

  try {
    return await runOnce()
  } catch (err) {
    if (init.signal?.aborted) throw err
    if (!isRetriableNetworkError(err)) throw err

    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      await waitUntilVisible()
    }
    markNetworkResumed()
    await sleep(400)
    return runOnce()
  }
}
