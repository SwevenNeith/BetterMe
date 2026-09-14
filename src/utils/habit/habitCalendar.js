import { HABIT_FREQUENCY, HABIT_WEEKDAYS } from '../constants/habitOptions.js'

export const HABIT_VIEW_MODE = {
  ANNUAL: 'annual',
  MONTHLY: 'monthly',
}

export function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

export function toISODate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function parseISODate(iso) {
  const normalized = normalizeDateISO(iso)
  const [y, m, d] = normalized.split('-').map(Number)
  return { year: y, month: m, day: d }
}

/** Normalise une date Supabase / ISO en YYYY-MM-DD. */
export function normalizeDateISO(value) {
  if (!value) return ''
  const str = String(value)
  const match = str.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : str
}

/** Ajoute (ou retire) des jours à une date ISO locale. */
export function addDaysISO(iso, days) {
  const { year, month, day } = parseISODate(iso)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return toISODate(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

/** Dates ISO inclusives de start à end. */
export function iterateISODateRange(startIso, endIso) {
  const dates = []
  if (!startIso || !endIso || startIso > endIso) return dates
  let current = startIso
  while (current <= endIso) {
    dates.push(current)
    current = addDaysISO(current, 1)
  }
  return dates
}

export function getIsoWeekdayFromDate(year, month, day) {
  const date = new Date(year, month - 1, day)
  const jsDay = date.getDay()
  return jsDay === 0 ? 7 : jsDay
}

export function getMonthLabelFr(month, style = 'long') {
  return new Date(2000, month - 1, 1).toLocaleDateString('fr-FR', { month: style })
}

export function buildYearOptions(anchorYear = new Date().getFullYear(), span = 5) {
  const years = []
  for (let y = anchorYear - span; y <= anchorYear + span; y += 1) {
    years.push(y)
  }
  return years
}

export function buildMonthOptions() {
  return Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: getMonthLabelFr(i + 1, 'long'),
  }))
}

/** Colonnes annuelles : une colonne par mois, uniquement les jours existants. */
export function buildAnnualMonthColumns(year) {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const daysInMonth = getDaysInMonth(year, month)
    return {
      month,
      label: getMonthLabelFr(month, 'short'),
      days: Array.from({ length: daysInMonth }, (_, d) => {
        const day = d + 1
        return { day, date: toISODate(year, month, day) }
      }),
    }
  })
}

/** Jours du mois positionnés dans une grille 7×N (sans cellules vides). */
export function buildMonthlyPlacedDays(year, month) {
  const daysInMonth = getDaysInMonth(year, month)
  const firstIsoWeekday = getIsoWeekdayFromDate(year, month, 1)
  const offset = firstIsoWeekday - 1

  const days = []
  for (let day = 1; day <= daysInMonth; day += 1) {
    const index = offset + day - 1
    days.push({
      day,
      date: toISODate(year, month, day),
      gridRow: Math.floor(index / 7) + 2,
      gridColumn: (index % 7) + 1,
    })
  }

  const rowCount = Math.ceil((offset + daysInMonth) / 7)

  return {
    weekdayHeaders: HABIT_WEEKDAYS.map((w) => w.label),
    days,
    rowCount,
  }
}

export function getAnnualDateRange(year) {
  return {
    start: toISODate(year, 1, 1),
    end: toISODate(year, 12, 31),
  }
}

export function getMonthlyDateRange(year, month) {
  const daysInMonth = getDaysInMonth(year, month)
  return {
    start: toISODate(year, month, 1),
    end: toISODate(year, month, daysInMonth),
  }
}

/** Indique si l’habitude est active à la date donnée (fréquence + date de début). */
export function isHabitScheduledOnDate(habit, dateIso) {
  if (!habit || !dateIso) return false
  if (dateIso < habit.date_debut) return false

  const { year, month, day } = parseISODate(dateIso)
  const activeDays = Array.isArray(habit.jours_actifs) ? habit.jours_actifs : []

  if (habit.frequence === HABIT_FREQUENCY.DAILY || habit.frequence === HABIT_FREQUENCY.WEEKLY) {
    const isoWeekday = getIsoWeekdayFromDate(year, month, day)
    return activeDays.includes(isoWeekday)
  }

  if (habit.frequence === HABIT_FREQUENCY.MONTHLY) {
    return activeDays.includes(day)
  }

  return true
}
