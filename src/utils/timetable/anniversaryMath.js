/**
 * Calculs d’âge / anniversaires (annuel & mensuel couple).
 */

/** @param {string} iso */
export function parseDateParts(iso) {
  const raw = String(iso || '').slice(0, 10)
  const [y, m, d] = raw.split('-').map(Number)
  if (!y || !m || !d) return null
  return { year: y, month: m, day: d }
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

/**
 * L’anniversaire (MM-JJ d’origine) tombe-t-il sur targetISO ?
 * 29/02 → 28/02 les années non bissextiles.
 */
export function birthdayOccursOn(originISO, targetISO) {
  const origin = parseDateParts(originISO)
  const target = parseDateParts(targetISO)
  if (!origin || !target) return false
  if (targetISO < String(originISO).slice(0, 10)) return false

  if (origin.month === 2 && origin.day === 29) {
    if (target.month !== 2) return false
    if (isLeapYear(target.year)) return target.day === 29
    return target.day === 28
  }
  return origin.month === target.month && origin.day === target.day
}

/**
 * Marqueur mensuel couple : même jour du mois (clampé), à partir de la date de départ.
 */
export function coupleMonthlyOccursOn(startISO, targetISO) {
  const start = parseDateParts(startISO)
  const target = parseDateParts(targetISO)
  if (!start || !target) return false
  if (targetISO < String(startISO).slice(0, 10)) return false

  const dueDay = Math.min(start.day, daysInMonth(target.year, target.month))
  return target.day === dueDay
}

/** Âge en années révolues à la date target. */
export function computeAgeYears(originISO, targetISO) {
  const origin = parseDateParts(originISO)
  const target = parseDateParts(targetISO)
  if (!origin || !target) return 0
  let years = target.year - origin.year
  if (
    target.month < origin.month ||
    (target.month === origin.month && target.day < origin.day)
  ) {
    years -= 1
  }
  return Math.max(0, years)
}

/** Âge en mois révolus à la date target. */
export function computeAgeMonths(originISO, targetISO) {
  const origin = parseDateParts(originISO)
  const target = parseDateParts(targetISO)
  if (!origin || !target) return 0
  let months = (target.year - origin.year) * 12 + (target.month - origin.month)
  if (target.day < origin.day) months -= 1
  return Math.max(0, months)
}

export function isFullYearFromMonths(months) {
  return months > 0 && months % 12 === 0
}

export function formatAgeYearsLabel(years) {
  if (years <= 0) return 'moins d’1 an'
  return years === 1 ? '1 an' : `${years} ans`
}

/** Ex. 14 → « 14 mois », 26 → « 2 ans 2 mois », 24 → « 2 ans ». */
export function formatAgeMonthsLabel(months) {
  if (months <= 0) return 'moins d’1 mois'
  if (months < 12) return months === 1 ? '1 mois' : `${months} mois`
  const years = Math.floor(months / 12)
  const rem = months % 12
  const yLabel = years === 1 ? '1 an' : `${years} ans`
  if (rem === 0) return yLabel
  return `${yLabel} ${rem === 1 ? '1 mois' : `${rem} mois`}`
}

export const TIMETABLE_EVENT_KIND = {
  BIRTHDAY: 'birthday',
}
