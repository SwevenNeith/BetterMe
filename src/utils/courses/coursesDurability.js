import {
  COURSES_DEFAULT_RENEW_THRESHOLD_DAYS,
  COURSES_DUREE_UNITES,
} from '../../constants/courses/courses.js'

const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })

/**
 * @param {string|Date|null|undefined} value
 * @returns {Date|null}
 */
export function parseLocalDate(value) {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  }
  const raw = String(value).slice(0, 10)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const date = new Date(year, month, day)
  if (Number.isNaN(date.getTime())) return null
  return date
}

/**
 * @param {Date} date
 * @returns {string}
 */
export function formatLocalDateISO(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * @param {string|Date} start
 * @param {number} value
 * @param {'jours'|'semaines'|'mois'|'ans'} unit
 * @returns {string|null}
 */
export function addDurationToDate(start, value, unit) {
  const base = parseLocalDate(start)
  const n = Number(value)
  if (!base || !Number.isFinite(n) || n <= 0) return null

  const next = new Date(base.getTime())
  switch (unit) {
    case 'jours':
      next.setDate(next.getDate() + n)
      break
    case 'semaines':
      next.setDate(next.getDate() + n * 7)
      break
    case 'mois':
      next.setMonth(next.getMonth() + n)
      break
    case 'ans':
      next.setFullYear(next.getFullYear() + n)
      break
    default:
      return null
  }
  return formatLocalDateISO(next)
}

/**
 * Date estimée de renouvellement = dernier achat + durée de vie.
 * @param {{ suivi_durabilite?: boolean, date_dernier_achat?: string|null, duree_valeur?: number|null, duree_unite?: string|null }} article
 * @returns {string|null}
 */
export function estimatedRenewalDate(article) {
  if (!article?.suivi_durabilite) return null
  if (!article.date_dernier_achat || !article.duree_valeur || !article.duree_unite) return null
  return addDurationToDate(article.date_dernier_achat, article.duree_valeur, article.duree_unite)
}

/**
 * Progression 0–1 entre dernier achat et renouvellement estimé.
 * @param {{ date_dernier_achat?: string|null } & Parameters<typeof estimatedRenewalDate>[0]} article
 * @param {Date} [now]
 * @returns {number|null}
 */
export function durabilityProgress(article, now = new Date()) {
  const start = parseLocalDate(article?.date_dernier_achat)
  const endIso = estimatedRenewalDate(article)
  const end = parseLocalDate(endIso)
  if (!start || !end) return null
  const total = end.getTime() - start.getTime()
  if (total <= 0) return 1
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const elapsed = today.getTime() - start.getTime()
  return Math.min(1, Math.max(0, elapsed / total))
}

/**
 * Jours restants avant renouvellement (négatif = déjà dépassé).
 * @param {Parameters<typeof estimatedRenewalDate>[0]} article
 * @param {Date} [now]
 * @returns {number|null}
 */
export function daysUntilRenewal(article, now = new Date()) {
  const end = parseLocalDate(estimatedRenewalDate(article))
  if (!end) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((end.getTime() - today.getTime()) / 86400000)
}

/**
 * @param {Parameters<typeof estimatedRenewalDate>[0]} article
 * @param {number} [thresholdDays]
 * @param {Date} [now]
 */
export function needsRenewalSoon(
  article,
  thresholdDays = COURSES_DEFAULT_RENEW_THRESHOLD_DAYS,
  now = new Date(),
) {
  if (!article?.suivi_durabilite) return false
  const days = daysUntilRenewal(article, now)
  if (days == null) return false
  return days <= thresholdDays
}

/**
 * Libellé calme pour le renouvellement.
 * @param {Parameters<typeof estimatedRenewalDate>[0]} article
 * @param {number} [thresholdDays]
 */
export function renewalStatusLabel(
  article,
  thresholdDays = COURSES_DEFAULT_RENEW_THRESHOLD_DAYS,
) {
  const days = daysUntilRenewal(article)
  if (days == null) return null
  if (days < 0) return 'À renouveler'
  if (days <= thresholdDays) return 'À renouveler bientôt'
  return null
}

/**
 * Date relative en français (« il y a 2 mois »).
 * @param {string|Date|null|undefined} value
 * @param {Date} [now]
 */
export function formatRelativePast(value, now = new Date()) {
  const date = parseLocalDate(value)
  if (!date) return ''
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffMs = date.getTime() - today.getTime()
  const diffDays = Math.round(diffMs / 86400000)

  if (diffDays === 0) return 'aujourd’hui'
  if (Math.abs(diffDays) < 7) return rtf.format(diffDays, 'day')
  const diffWeeks = Math.round(diffDays / 7)
  if (Math.abs(diffDays) < 30) return rtf.format(diffWeeks, 'week')
  const diffMonths = Math.round(diffDays / 30)
  if (Math.abs(diffDays) < 365) return rtf.format(diffMonths, 'month')
  const diffYears = Math.round(diffDays / 365)
  return rtf.format(diffYears, 'year')
}

/**
 * @param {number|null|undefined} value
 * @param {string|null|undefined} unit
 */
export function formatDureeLabel(value, unit) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0 || !unit) return ''
  const meta = COURSES_DUREE_UNITES.find((u) => u.id === unit)
  if (!meta) return `${n} ${unit}`
  if (n === 1) return `1 ${meta.singular}`
  return `${n} ${meta.label}`
}

/**
 * Texte carte renouvellement : « Acheté il y a 2 mois · durée prévue 6 mois »
 * @param {Parameters<typeof estimatedRenewalDate>[0]} article
 */
export function durabilityCardCaption(article) {
  if (!article?.suivi_durabilite || !article.date_dernier_achat) return ''
  const past = formatRelativePast(article.date_dernier_achat)
  const duree = formatDureeLabel(article.duree_valeur, article.duree_unite)
  const bought = past === 'aujourd’hui' ? 'Acheté aujourd’hui' : `Acheté ${past}`
  if (!duree) return bought
  return `${bought} · durée prévue ${duree}`
}
