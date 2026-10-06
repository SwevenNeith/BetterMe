/**
 * Date du reset annuel de la ranked (YYYY-MM-DD).
 * Modifiable depuis l’UI League of Legends ; valeur par défaut utilisée
 * si aucune préférence n’est enregistrée. À mettre à jour à chaque reset.
 */
export const DEFAULT_RANKED_RESET_DATE = '2026-01-08'

/** Borne basse de validation (évite les dates absurdes). */
export const MIN_RANKED_RESET_DATE = '2020-01-01'

/**
 * Convertit une date YYYY-MM-DD en epoch secondes (minuit UTC du jour indiqué).
 * @param {string} dateYmd
 * @returns {number | null}
 */
export function rankedResetDateToSec(dateYmd) {
  const date = String(dateYmd ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const ms = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(ms)) return null
  return Math.floor(ms / 1000)
}

/**
 * @param {string} dateYmd
 * @returns {string}
 */
export function formatRankedResetDateFr(dateYmd) {
  const sec = rankedResetDateToSec(dateYmd)
  if (sec == null) return String(dateYmd ?? '')
  return new Date(sec * 1000).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * @param {unknown} raw
 * @param {{ nowMs?: number }} [options]
 * @returns {{ ok: true, date: string } | { ok: false, error: string }}
 */
export function validateRankedResetDate(raw, options = {}) {
  const date = String(raw ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: 'Date invalide. Utilise le format AAAA-MM-JJ.' }
  }
  const sec = rankedResetDateToSec(date)
  if (sec == null) {
    return { ok: false, error: 'Date invalide.' }
  }

  const nowMs = Number.isFinite(options.nowMs) ? Number(options.nowMs) : Date.now()
  const todayUtc = new Date(nowMs).toISOString().slice(0, 10)
  if (date > todayUtc) {
    return { ok: false, error: 'La date de reset ne peut pas être dans le futur.' }
  }

  const minSec = rankedResetDateToSec(MIN_RANKED_RESET_DATE)
  if (minSec != null && sec < minSec) {
    return {
      ok: false,
      error: `La date de reset ne peut pas être antérieure au ${formatRankedResetDateFr(MIN_RANKED_RESET_DATE)}.`,
    }
  }

  return { ok: true, date }
}
