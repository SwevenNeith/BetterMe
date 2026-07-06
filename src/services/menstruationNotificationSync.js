import { supabase } from '../lib/supabase.js'
import { countMenstruationCyclesPilule, listCyclesPilule } from './menstruationCycles.js'
import { countMenstruationCyclesNaturel, syncForecastCyclesNaturel } from './menstruationCyclesNaturel.js'
import { resolveMenstruationCycleMode } from './menstruationCycleModePreference.js'
import {
  loadMenstruationNotifSettings,
  rescheduleMenstruationNotificationsByMode,
  clearPiluleMenstruationNotifications,
  clearNaturalMenstruationNotifications,
} from './menstruationNotifications.js'

/**
 * Aligne scheduled_notifications avec le mode cycle actif (pilule vs naturel).
 * À appeler au démarrage de l’app pour purger d’éventuelles notifs pilule obsolètes.
 */
export async function syncMenstruationNotificationsForUser(userId) {
  if (!userId) return

  const [countPilule, countNaturel] = await Promise.all([
    countMenstruationCyclesPilule(supabase, userId),
    countMenstruationCyclesNaturel(supabase, userId),
  ])

  const cycleMode = await resolveMenstruationCycleMode(
    supabase,
    userId,
    countPilule,
    countNaturel,
  )

  if (!cycleMode) {
    await clearPiluleMenstruationNotifications(userId)
    await clearNaturalMenstruationNotifications(userId)
    return
  }

  const settings = await loadMenstruationNotifSettings(userId)
  const [cyclesPilule, cyclesNaturel] = await Promise.all([
    cycleMode === 'pilule' && countPilule > 0
      ? listCyclesPilule(supabase, userId)
      : Promise.resolve([]),
    cycleMode === 'naturel' && countNaturel > 0
      ? syncForecastCyclesNaturel(supabase, userId)
      : Promise.resolve([]),
  ])

  await rescheduleMenstruationNotificationsByMode(userId, cycleMode, {
    cyclesPilule,
    cyclesNaturel,
    settings,
  })
}
