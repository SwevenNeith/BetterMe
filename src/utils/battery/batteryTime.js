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
 * Minutes depuis minuit, ou null.
 * @param {string | null | undefined} hhmm
 * @returns {number | null}
 */
export function minutesFromHhMm(hhmm) {
  const n = normalizeHhMm(hhmm)
  if (!n) return null
  const [h, m] = n.split(':').map(Number)
  return h * 60 + m
}

/**
 * Fin d’horloge avant le début : le créneau passe minuit (23:00 → 00:00).
 * @param {string | null | undefined} start
 * @param {string | null | undefined} end
 */
export function clockRangeCrossesMidnight(start, end) {
  const s = minutesFromHhMm(start)
  const e = minutesFromHhMm(end)
  if (s == null || e == null) return false
  return e < s
}

/**
 * @param {string} iso YYYY-MM-DD
 * @param {number} deltaDays
 */
function shiftIsoDate(iso, deltaDays) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + deltaDays)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Avant 06:00 = encore la nuit (sauf si un réveil plus tardif est fourni). */
export const BATTERY_EDT_NIGHT_CUTOFF_MINUTES = 6 * 60

/**
 * Après minuit et avant le réveil (ou 06:00) → jour calendaire suivant pour l’EDT.
 * 11:00 le 25 reste le 25 ; 00:30 le 25 → grille du 26.
 * @param {string | null | undefined} hhmm
 * @param {string | null | undefined} [wakeHhmm] réveil du jour Batterie, si connu
 */
export function batteryTimeMapsToNextCalendarDay(hhmm, wakeHhmm = null) {
  const mins = minutesFromHhMm(hhmm)
  if (mins == null) return false
  const wakeMins = minutesFromHhMm(wakeHhmm)
  const cutoff =
    wakeMins != null && wakeMins > 0 && wakeMins <= 12 * 60
      ? wakeMins
      : BATTERY_EDT_NIGHT_CUTOFF_MINUTES
  return mins < cutoff
}

/**
 * Créneau saisi sur un jour Batterie → dates calendaires EDT.
 * Seule la plage « encore debout après minuit » (avant réveil / 06:00) passe au lendemain.
 * Ex. Batterie 25, 00:30–01:30 → EDT 26. Batterie 25, 11:00–12:00 → EDT 25.
 * Ex. Batterie 25, 21:00–00:15 → EDT 25 21:00 → 26 00:15.
 * @param {string} batteryDayIso
 * @param {string | null | undefined} start
 * @param {string | null | undefined} end
 * @param {string | null | undefined} [wakeHhmm]
 * @returns {{ date_start: string, date_end: string, time: string | null }}
 */
export function batterySlotToEdtDateRange(batteryDayIso, start, end, wakeHhmm = null) {
  const day = String(batteryDayIso || '').slice(0, 10)
  const s = normalizeHhMm(start)
  const e = normalizeHhMm(end)
  if (!day) return { date_start: '', date_end: '', time: null }
  if (!s || !e) {
    return { date_start: day, date_end: day, time: formatEdtTimeRange(s, e) }
  }

  const date_start = batteryTimeMapsToNextCalendarDay(s, wakeHhmm)
    ? shiftIsoDate(day, 1)
    : day

  if (clockRangeCrossesMidnight(s, e)) {
    return {
      date_start,
      date_end: e === '00:00' ? date_start : shiftIsoDate(date_start, 1),
      time: formatEdtTimeRange(s, e),
    }
  }

  return {
    date_start,
    date_end: date_start,
    time: formatEdtTimeRange(s, e),
  }
}

/**
 * Heure à dessiner pour un événement sur un jour de grille.
 * 23:00–00:00 reste sur le jour de début, jusqu’à minuit (24:00).
 * 23:00–01:00 continue le lendemain de 00:00 à 01:00.
 * @param {{ date_start?: string, date_end?: string | null, time?: string | null, all_day?: boolean } | null | undefined} event
 * @param {string} dayIso
 * @returns {string | null}
 */
export function sliceEventTimeForDay(event, dayIso) {
  if (!event || event.all_day) return null
  const day = String(dayIso || '').slice(0, 10)
  const startDay = String(event.date_start || '').slice(0, 10)
  if (!day || !startDay) return null
  const endDay = String(event.date_end || startDay).slice(0, 10)
  let { start, end } = parseEdtTimeRange(event.time || '')
  if (!start || !end) {
    start = '12:00'
    end = '13:00'
  }
  if (start === end) return null

  // Passage de minuit (ex. 21:00–00:15) : début jusqu’à 24:00, suite 00:00–fin le lendemain.
  if (endDay === startDay && clockRangeCrossesMidnight(start, end)) {
    if (day === startDay) return `${start} - 24:00`
    if (day === shiftIsoDate(startDay, 1) && end !== '00:00') return `00:00 - ${end}`
    return null
  }

  if (day < startDay || day > endDay) return null
  if (day === startDay && day === endDay) return `${start} - ${end}`
  if (day === startDay) return `${start} - 24:00`
  if (day === endDay) {
    if (end === '00:00') return null
    return `00:00 - ${end}`
  }
  return `00:00 - 24:00`
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
  // Fin identique : durée nulle. Fin plus petite : minuit est franchi (23:00 → 00:00).
  if (minutesFromHhMm(e) === minutesFromHhMm(s)) {
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
