/**
 * Horaires Batterie / EDT (HH:MM).
 */

/**
 * @param {unknown} value
 * @returns {string} HH:MM ou ''
 */
export function normalizeHhMm(value) {
  if (value == null || value === '') return ''
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return ''
  const h = Number(match[1])
  const m = Number(match[2])
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return ''
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * @param {string} hhmm
 * @param {number} deltaMinutes
 * @returns {string | null} HH:MM clampé dans la journée, ou null si invalide
 */
export function shiftHhMm(hhmm, deltaMinutes) {
  const base = normalizeHhMm(hhmm)
  if (!base) return null
  const [h, m] = base.split(':').map(Number)
  let total = h * 60 + m + (Number(deltaMinutes) || 0)
  if (total < 0) total = 0
  if (total >= 24 * 60) total = 24 * 60 - 1
  const endH = Math.floor(total / 60)
  const endM = total % 60
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
}

/**
 * Parse « HH:MM - HH:MM » (format EDT).
 * @param {string | null | undefined} timeRange
 * @returns {{ start: string, end: string }}
 */
export function parseEdtTimeRange(timeRange) {
  const raw = String(timeRange ?? '').trim()
  if (!raw) return { start: '', end: '' }
  const parts = raw.split(/\s*[-–—]\s*/)
  return {
    start: normalizeHhMm(parts[0]),
    end: normalizeHhMm(parts[1]),
  }
}

/**
 * @param {string} start
 * @param {string} end
 */
export function formatEdtTimeRange(start, end) {
  const s = normalizeHhMm(start)
  const e = normalizeHhMm(end)
  if (s && e) return `${s} - ${e}`
  return s || e || null
}

/**
 * @param {string} start
 * @param {string} end
 * @returns {string | null} message d’erreur
 */
export function validatePlannedSlot(start, end) {
  const s = normalizeHhMm(start)
  const e = normalizeHhMm(end)
  if (!s) return 'Indique une heure de début.'
  if (!e) return 'Indique une heure de fin.'
  const [sh, sm] = s.split(':').map(Number)
  const [eh, em] = e.split(':').map(Number)
  if (eh * 60 + em <= sh * 60 + sm) {
    return 'L’heure de fin doit être après l’heure de début.'
  }
  return null
}

/**
 * Durée en minutes entre deux HH:MM (même jour ; si fin ≤ début → +24h).
 * @param {string | null | undefined} start
 * @param {string | null | undefined} end
 * @returns {number | null}
 */
export function minutesBetweenHhMm(start, end) {
  const s = normalizeHhMm(start)
  const e = normalizeHhMm(end)
  if (!s || !e) return null
  const [sh, sm] = s.split(':').map(Number)
  const [eh, em] = e.split(':').map(Number)
  let diff = eh * 60 + em - (sh * 60 + sm)
  if (diff <= 0) diff += 24 * 60
  return diff
}
