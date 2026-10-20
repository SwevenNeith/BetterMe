import { ensureUserSettings } from '../menstruation/menstruationNotifications.js'
import {
  mergePageVisibility,
  primePageVisibilityCache,
} from './pageVisibility.js'
import {
  mergeDashboardVisibility,
  primeDashboardVisibilityCache,
} from '../dashboard/dashboardVisibility.js'

const SETTINGS_TABLE = 'settings'

const BOOT_COLUMNS = [
  'page_visibility',
  'dashboard_visibility',
  'visibility_onboarding_completed',
  'menstruation_cycle_mode',
  'notification_utc_offset_minutes',
  'notification_timezone',
].join(', ')

/** @type {Map<string, Promise<ReturnType<typeof loadSettingsBootBundleUnaided>>>} */
const bootInFlight = new Map()
/** @type {Map<string, Awaited<ReturnType<typeof loadSettingsBootBundleUnaided>>>} */
const bootCache = new Map()

function emptyBootBundle() {
  return {
    pageVisibility: mergePageVisibility(null),
    dashboardVisibility: mergeDashboardVisibility(null),
    visibilityOnboardingCompleted: true,
    menstruationCycleMode: null,
    notificationUtcOffsetMinutes: null,
    notificationTimezone: null,
  }
}

async function loadSettingsBootBundleUnaided(supabase, userId) {
  await ensureUserSettings(userId)

  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select(BOOT_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    // Colonnes absentes / schéma partiel → laisser les loaders individuels réessayer.
    console.warn('loadSettingsBootBundle:', error)
    return emptyBootBundle()
  }

  const pageVisibility = mergePageVisibility(data?.page_visibility)
  const dashboardVisibility = mergeDashboardVisibility(data?.dashboard_visibility)
  primePageVisibilityCache(userId, pageVisibility)
  primeDashboardVisibilityCache(userId, dashboardVisibility)

  const mode = data?.menstruation_cycle_mode
  return {
    pageVisibility,
    dashboardVisibility,
    visibilityOnboardingCompleted: Boolean(data?.visibility_onboarding_completed),
    menstruationCycleMode: mode === 'pilule' || mode === 'naturel' ? mode : null,
    notificationUtcOffsetMinutes:
      typeof data?.notification_utc_offset_minutes === 'number'
        ? data.notification_utc_offset_minutes
        : null,
    notificationTimezone:
      typeof data?.notification_timezone === 'string' ? data.notification_timezone : null,
  }
}

/**
 * Un seul SELECT settings au boot : alimente les caches de visibilité
 * et renvoie onboarding / mode cycle / offset notifs.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function loadSettingsBootBundle(supabase, userId) {
  if (!userId) return emptyBootBundle()

  const cached = bootCache.get(userId)
  if (cached) return cached

  const pending = bootInFlight.get(userId)
  if (pending) return pending

  const task = loadSettingsBootBundleUnaided(supabase, userId)
  bootInFlight.set(userId, task)
  try {
    const result = await task
    bootCache.set(userId, result)
    return result
  } finally {
    bootInFlight.delete(userId)
  }
}

/**
 * Si un boot settings est en cours, attend qu’il ait primé les caches
 * (évite un 2ᵉ SELECT page_visibility / dashboard_visibility en parallèle).
 * @param {string} userId
 */
export async function awaitSettingsBootIfPending(userId) {
  if (!userId) return
  const pending = bootInFlight.get(userId)
  if (pending) await pending
}

/** @param {string | null} [userId] */
export function invalidateSettingsBootCache(userId = null) {
  if (userId) {
    bootCache.delete(userId)
    return
  }
  bootCache.clear()
}
