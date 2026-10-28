/**
 * Durées Batterie : résolution effective (saisie / EDT / défaut catalogue).
 */

import {
  BATTERY_DURATION_OVER_2H_ID,
  BATTERY_DURATION_OVER_2H_MINUTES,
  BATTERY_DURATION_PRESETS,
  BATTERY_SOURCE_TYPES,
} from '../../constants/battery/battery.js'

/**
 * @typedef {{
 *   minutes: number | null,
 *   allDay: boolean,
 *   source: 'override' | 'edt' | 'catalog' | 'none',
 *   fromEdt: boolean,
 *   overriddenFromEdt: boolean,
 * }} BatteryDurationResolved
 */

/**
 * @param {unknown} value
 * @returns {number | null}
 */
export function normalizeDurationMinutes(value) {
  if (value == null || value === '') return null
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/**
 * Parse "HH:MM - HH:MM" (format EDT) → minutes.
 * @param {string | null | undefined} timeRange
 * @returns {number | null}
 */
export function minutesFromTimetableTimeRange(timeRange) {
  const raw = String(timeRange ?? '').trim()
  if (!raw) return null
  const parts = raw.split(/\s*[-–—]\s*/)
  if (parts.length < 2) return null
  const start = parseHmToMinutes(parts[0])
  const end = parseHmToMinutes(parts[1])
  if (start == null || end == null) return null
  let diff = end - start
  if (diff <= 0) diff += 24 * 60
  if (diff > 16 * 60) return null
  return diff
}

/**
 * @param {string | null | undefined} hm
 * @returns {number | null}
 */
export function parseHmToMinutes(hm) {
  const m = String(hm ?? '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null
  return h * 60 + min
}

/**
 * Durée proposée par un événement EDT (lecture seule).
 * @param {{ all_day?: boolean, time?: string | null } | null | undefined} event
 * @returns {{ minutes: number | null, allDay: boolean } | null}
 */
export function durationFromTimetableEvent(event) {
  if (!event) return null
  if (event.all_day) return { minutes: null, allDay: true }
  const minutes = minutesFromTimetableTimeRange(event.time)
  if (minutes == null) return { minutes: null, allDay: false }
  return { minutes, allDay: false }
}

/**
 * @param {{
 *   has_duration_override?: boolean,
 *   duration_minutes?: number | null,
 *   duration_all_day?: boolean,
 *   source_type?: string | null,
 * } | null | undefined} entry
 * @param {{ minutes: number | null, allDay: boolean } | null | undefined} edtDuration
 * @param {{
 *   default_duration_minutes?: number | null,
 *   default_all_day?: boolean,
 * } | null | undefined} [catalogActivity]
 * @returns {BatteryDurationResolved}
 */
export function resolveBatteryDuration(entry, edtDuration = null, catalogActivity = null) {
  if (entry?.has_duration_override) {
    const allDay = Boolean(entry.duration_all_day)
    const minutes = allDay ? null : normalizeDurationMinutes(entry.duration_minutes)
    const edt = edtDuration || null
    const overriddenFromEdt = Boolean(
      edt &&
        (allDay !== Boolean(edt.allDay) ||
          (!allDay && minutes !== normalizeDurationMinutes(edt.minutes))),
    )
    return {
      minutes,
      allDay,
      source: 'override',
      fromEdt: false,
      overriddenFromEdt,
    }
  }

  if (
    entry?.source_type === BATTERY_SOURCE_TYPES.TIMETABLE &&
    edtDuration &&
    (edtDuration.allDay || edtDuration.minutes != null)
  ) {
    return {
      minutes: edtDuration.allDay ? null : normalizeDurationMinutes(edtDuration.minutes),
      allDay: Boolean(edtDuration.allDay),
      source: 'edt',
      fromEdt: true,
      overriddenFromEdt: false,
    }
  }

  if (catalogActivity?.default_all_day) {
    return {
      minutes: null,
      allDay: true,
      source: 'catalog',
      fromEdt: false,
      overriddenFromEdt: false,
    }
  }

  const catalogMinutes = normalizeDurationMinutes(catalogActivity?.default_duration_minutes)
  if (catalogMinutes != null) {
    return {
      minutes: catalogMinutes,
      allDay: false,
      source: 'catalog',
      fromEdt: false,
      overriddenFromEdt: false,
    }
  }

  return {
    minutes: null,
    allDay: false,
    source: 'none',
    fromEdt: false,
    overriddenFromEdt: false,
  }
}

/**
 * Format minutes → "15 min", "1 h", "1 h 15", "+2 h".
 * @param {number | null | undefined} minutes
 * @param {{ compactOver2h?: boolean }} [opts]
 */
export function formatDurationMinutesLabel(minutes, opts = {}) {
  const n = normalizeDurationMinutes(minutes)
  if (n == null) return '—'
  if (opts.compactOver2h !== false && n > 120) return '+2 h'
  const h = Math.floor(n / 60)
  const m = n % 60
  if (h <= 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m}`
}

/**
 * Libellé court (15 min, 1 h, +2 h, Journée entière, —).
 * @param {{ minutes?: number | null, allDay?: boolean } | null | undefined} duration
 */
export function formatBatteryDuration(duration) {
  if (!duration) return '—'
  if (duration.allDay) return 'Journée entière'
  return formatDurationMinutesLabel(duration.minutes)
}

/**
 * Id de preset actif pour l’UI, ou `custom:${minutes}` / `all_day` / null.
 * @param {BatteryDurationResolved | null | undefined} resolved
 */
export function activeDurationPresetId(resolved) {
  if (!resolved) return null
  if (resolved.allDay) return 'all_day'
  const minutes = normalizeDurationMinutes(resolved.minutes)
  if (minutes == null) return null
  if (minutes > 120) return BATTERY_DURATION_OVER_2H_ID
  const preset = BATTERY_DURATION_PRESETS.find(
    (p) => p.id !== BATTERY_DURATION_OVER_2H_ID && p.minutes === minutes,
  )
  return preset ? preset.id : `custom:${minutes}`
}

/**
 * Payload DB pour une surcharge Batterie.
 * @param {'reset' | 'all_day' | 'over_2h' | number} choice
 */
export function durationOverridePayload(choice) {
  if (choice === 'reset') {
    return {
      has_duration_override: false,
      duration_minutes: null,
      duration_all_day: false,
    }
  }
  if (choice === 'all_day') {
    return {
      has_duration_override: true,
      duration_minutes: null,
      duration_all_day: true,
    }
  }
  if (choice === BATTERY_DURATION_OVER_2H_ID || choice === 'over_2h') {
    return {
      has_duration_override: true,
      duration_minutes: BATTERY_DURATION_OVER_2H_MINUTES,
      duration_all_day: false,
    }
  }
  const minutes = normalizeDurationMinutes(choice)
  return {
    has_duration_override: true,
    duration_minutes: minutes,
    duration_all_day: false,
  }
}

/**
 * Champs durée à persister sur une entrée (création / copie).
 * @param {{
 *   has_duration_override?: boolean,
 *   duration_minutes?: number | null,
 *   duration_all_day?: boolean,
 * } | null | undefined} source
 */
export function durationFieldsFromSource(source) {
  if (!source?.has_duration_override) {
    return {
      has_duration_override: false,
      duration_minutes: null,
      duration_all_day: false,
    }
  }
  return {
    has_duration_override: true,
    duration_minutes: source.duration_all_day
      ? null
      : normalizeDurationMinutes(source.duration_minutes),
    duration_all_day: Boolean(source.duration_all_day),
  }
}

/**
 * Figé la durée effective pour l’historique (ex. au moment du « Fait »).
 * @param {BatteryDurationResolved} resolved
 */
export function stampDurationFromResolved(resolved) {
  if (!resolved || resolved.source === 'none') {
    return {
      has_duration_override: false,
      duration_minutes: null,
      duration_all_day: false,
    }
  }
  if (resolved.allDay) {
    return {
      has_duration_override: true,
      duration_minutes: null,
      duration_all_day: true,
    }
  }
  if (resolved.minutes != null) {
    return {
      has_duration_override: true,
      duration_minutes: resolved.minutes,
      duration_all_day: false,
    }
  }
  return {
    has_duration_override: false,
    duration_minutes: null,
    duration_all_day: false,
  }
}

/**
 * Prépare les usages numériques pour learnedDefaultFromTwoWeeks.
 * @param {{ day_date: string, duration_minutes?: number | null, duration_all_day?: boolean }[]} usages
 */
export function numericDurationUsagesForLearning(usages) {
  return (usages ?? [])
    .filter((u) => !u.duration_all_day)
    .map((u) => ({
      day_date: u.day_date,
      cost: normalizeDurationMinutes(u.duration_minutes),
    }))
    .filter((u) => u.cost != null)
}
