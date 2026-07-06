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

const FULL_SYNC_COOLDOWN_MS = 5 * 60 * 1000

/** @type {string|null} */
let startupPurgeDoneForUser = null
/** @type {Promise<void>|null} */
let startupPurgePromise = null
/** @type {string|null} */
let fullSyncInFlightForUser = null
/** @type {Map<string, number>} */
const lastFullSyncAtByUser = new Map()

async function resolveCycleModeForUser(userId) {
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

  return { cycleMode, countPilule, countNaturel }
}

/**
 * Au démarrage : supprime uniquement les notifs du mauvais mode (léger, sans replanifier).
 */
export async function purgeStaleMenstruationNotificationsOnStartup(userId) {
  if (!userId) return
  if (startupPurgeDoneForUser === userId) return
  if (startupPurgePromise) {
    await startupPurgePromise
    return
  }

  startupPurgePromise = (async () => {
    try {
      const { cycleMode } = await resolveCycleModeForUser(userId)

      if (cycleMode === 'naturel') {
        await clearPiluleMenstruationNotifications(userId)
      } else if (cycleMode === 'pilule') {
        await clearNaturalMenstruationNotifications(userId)
      } else {
        await clearPiluleMenstruationNotifications(userId)
        await clearNaturalMenstruationNotifications(userId)
      }

      startupPurgeDoneForUser = userId
    } finally {
      startupPurgePromise = null
    }
  })()

  await startupPurgePromise
}

/**
 * Sync complet (prévisions + replanification). Réservé à la page Menstruation / Réglages.
 * @param {{ force?: boolean }} [options]
 */
export async function syncMenstruationNotificationsForUser(userId, options = {}) {
  if (!userId) return

  const lastSyncAt = lastFullSyncAtByUser.get(userId) ?? 0
  if (!options.force && Date.now() - lastSyncAt < FULL_SYNC_COOLDOWN_MS) return
  if (fullSyncInFlightForUser === userId) return

  fullSyncInFlightForUser = userId
  try {
    const { cycleMode, countPilule, countNaturel } = await resolveCycleModeForUser(userId)

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

    lastFullSyncAtByUser.set(userId, Date.now())
  } finally {
    fullSyncInFlightForUser = null
  }
}
