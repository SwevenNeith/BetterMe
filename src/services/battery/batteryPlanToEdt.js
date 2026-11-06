/**
 * Création d’événements EDT à partir d’une planification Batterie
 * (parent + implications), sans re-sync Batterie (évite les doublons).
 */

import {
  BATTERY_DEFAULT_PRIORITY,
  BATTERY_HOBBIES_CATEGORY_NAME,
  isBatteryTimeOptionalCategoryName,
  normalizeBatteryPriority,
} from '../../constants/battery/battery.js'
import { findHobbiesCategory } from '../timetable/timetableCategories.js'
import { ensureTimetableCategory } from '../timetable/timetableEvents.js'
import { formatEdtTimeRange, normalizeHhMm, shiftHhMm } from '../../utils/battery/batteryTime.js'
import { normalizeDurationMinutes } from '../../utils/battery/batteryDuration.js'

/**
 * @param {object | null | undefined} category
 * @param {object[]} categories
 */
export function isHobbiesCategory(category, categories = []) {
  if (!category) return false
  const hobby = findHobbiesCategory(categories)
  if (hobby) {
    if (category.id && hobby.id && category.id === hobby.id) return true
    if (category.name && hobby.name && category.name.toLowerCase() === hobby.name.toLowerCase()) {
      return true
    }
  }
  return String(category.name || category || '')
    .trim()
    .toLowerCase() === BATTERY_HOBBIES_CATEGORY_NAME.toLowerCase()
}

/**
 * Hobbies + Autre : pas d’horaires obligatoires, durée via pastilles.
 * @param {object | string | null | undefined} category
 * @param {object[]} [categories]
 */
export function isTimeOptionalCategory(category, categories = []) {
  if (!category) return false
  if (typeof category === 'string') {
    return isBatteryTimeOptionalCategoryName(category)
  }
  if (isHobbiesCategory(category, categories)) return true
  return isBatteryTimeOptionalCategoryName(category.name)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string | null | undefined} categoryId
 * @param {object[]} categories
 */
export async function resolveActivityCategory(supabase, userId, categoryId, categories = []) {
  if (!categoryId) return { category: null, categories }
  const existing = categories.find((c) => c.id === categoryId)
  if (existing && !existing.is_temp) return { category: existing, categories }

  const { data, error } = await supabase
    .from('timetable_categories')
    .select('id, user_id, name, color, icon')
    .eq('id', categoryId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) return { category: null, categories }
  return {
    category: data,
    categories: categories.some((c) => c.id === data.id) ? categories : [...categories, data],
  }
}

/**
 * Crée un événement EDT lié à une entrée Batterie.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{
 *   title: string,
 *   dayIso: string,
 *   categoryId?: string | null,
 *   categoryName?: string | null,
 *   plannedStart?: string | null,
 *   plannedEnd?: string | null,
 *   allDay?: boolean,
 *   batteryActivityId?: string | null,
 *   priority?: string | null,
 *   impliedByEventId?: string | null,
 *   detail?: string,
 * }} input
 * @param {object[]} userCategories
 */
export async function createEdtEventForBatteryPlan(
  supabase,
  userId,
  input,
  userCategories = [],
) {
  const title = String(input.title ?? '').trim()
  if (!title) throw new Error('Titre manquant pour l’EDT.')
  const dayIso = String(input.dayIso ?? '').slice(0, 10)
  if (!dayIso) throw new Error('Date manquante pour l’EDT.')

  let categories = userCategories
  let category = null

  if (input.categoryId) {
    const resolved = await resolveActivityCategory(supabase, userId, input.categoryId, categories)
    category = resolved.category
    categories = resolved.categories
  }

  if (!category) {
    const name = String(input.categoryName || 'Travail').trim() || 'Travail'
    const ensured = await ensureTimetableCategory(supabase, userId, name, categories)
    category = ensured.category
    categories = ensured.categories
  }

  const start = normalizeHhMm(input.plannedStart)
  const end = normalizeHhMm(input.plannedEnd)
  // Batterie sans horaire ne crée pas d’EDT ; un événement EDT exige un créneau
  if (!start || !end) {
    throw new Error('Un créneau (début et fin) est requis pour créer un événement EDT.')
  }
  const timeRange = formatEdtTimeRange(start, end)
  if (!timeRange) {
    throw new Error('Créneau horaire invalide pour l’EDT.')
  }

  const payload = {
    user_id: userId,
    title,
    date_start: dayIso,
    date_end: null,
    all_day: false,
    time: timeRange,
    category: category?.id ?? null,
    detail: String(input.detail ?? '').trim(),
    reminder: false,
    reminder_time: null,
    timer: false,
    timer_duration: null,
    battery_activity_id: input.batteryActivityId || null,
    implied_by_event_id: input.impliedByEventId || null,
    priority: normalizeBatteryPriority(input.priority || BATTERY_DEFAULT_PRIORITY),
  }

  const { data, error } = await supabase.from('timetable_events').insert(payload).select().single()

  if (error) {
    // Colonnes absentes (migration non appliquée) → insert minimal
    if (
      error.code === 'PGRST204' ||
      String(error.message || '').includes('battery_activity') ||
      String(error.message || '').includes('priority') ||
      String(error.message || '').includes('implied_by')
    ) {
      const { battery_activity_id, implied_by_event_id, priority, ...legacy } = payload
      const fallback = await supabase.from('timetable_events').insert(legacy).select().single()
      if (fallback.error) throw fallback.error
      return { event: fallback.data, categories }
    }
    throw error
  }

  return { event: data, categories }
}

/**
 * Calcule le créneau d’une implication à partir du parent.
 * @param {{ plannedStart?: string|null, plannedEnd?: string|null }} parentSlot
 * @param {{ offset_minutes?: number, child?: { default_duration_minutes?: number|null, default_all_day?: boolean } }} implication
 */
export function computeImplicationSlot(parentSlot, implication) {
  const parentStart = normalizeHhMm(parentSlot?.plannedStart)
  if (!parentStart) {
    return { plannedStart: null, plannedEnd: null, allDay: true }
  }
  const offset = Number(implication?.offset_minutes)
  const childStart = shiftHhMm(parentStart, Number.isFinite(offset) ? offset : -30)
  const duration =
    implication?.child?.default_all_day
      ? null
      : normalizeDurationMinutes(implication?.child?.default_duration_minutes) ?? 30
  if (duration == null) {
    return { plannedStart: childStart, plannedEnd: null, allDay: true }
  }
  const childEnd = shiftHhMm(childStart, duration)
  return { plannedStart: childStart, plannedEnd: childEnd, allDay: false }
}
