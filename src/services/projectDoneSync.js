import {
  hasQuantiteTracking,
  DEFAULT_RESET_PERIODE,
} from '../constants/projectProgress.js'
import {
  buildHabitLogsByDate,
  getHabitLinkedCibleForPeriode,
  getHabitLogsFetchRangeForProject,
} from '../utils/habitProjectLink.js'
import { listHabitLogsForRange } from './habitLogs.js'
import { updateStepDone, updateSubstepDone } from './projects.js'
import {
  fetchProgressLogsForProject,
  getCurrentPeriodCount,
  groupLogsByItemId,
} from './projectProgress.js'

/**
 * Calcule si une étape/sous-étape est terminée pour la période courante.
 */
export function computeItemDoneForPeriod(item, logs, opts = {}) {
  const habitLinked = Boolean(opts.habitLinked)
  const usesQty = habitLinked || hasQuantiteTracking(item)
  if (!usesQty) return Boolean(item.is_done)

  const resetPeriode = item.reset_periode || DEFAULT_RESET_PERIODE
  const cible = habitLinked
    ? getHabitLinkedCibleForPeriode(opts.habitLogsByDate ?? {}, resetPeriode)
    : Number(item.quantite_cible) || 0

  if (cible < 1) return false
  return getCurrentPeriodCount(logs ?? [], resetPeriode) >= cible
}

/**
 * Aligne is_done en mémoire (+ optionnellement en base) avec les logs / lien habit.
 * @returns {Promise<number>} nombre de mises à jour persistées
 */
export async function reconcileProjectDoneStates(
  supabase,
  userId,
  project,
  {
    logsByItemId = {},
    habitLinked = false,
    habitLogsByDate = {},
    persist = true,
  } = {},
) {
  if (!project?.steps?.length) return 0

  const persistJobs = []
  const opts = { habitLinked, habitLogsByDate }

  for (const step of project.steps) {
    const usesQty = habitLinked || hasQuantiteTracking(step)
    if (usesQty) {
      const nextDone = computeItemDoneForPeriod(step, logsByItemId[step.id] ?? [], opts)
      if (nextDone !== Boolean(step.is_done)) {
        step.is_done = nextDone
        if (persist && userId) {
          persistJobs.push(updateStepDone(supabase, userId, step.id, nextDone))
        }
      }
    }

    for (const substep of step.substeps ?? []) {
      const subUsesQty = habitLinked || hasQuantiteTracking(substep)
      if (!subUsesQty) continue
      const nextDone = computeItemDoneForPeriod(substep, logsByItemId[substep.id] ?? [], opts)
      if (nextDone !== Boolean(substep.is_done)) {
        substep.is_done = nextDone
        if (persist && userId) {
          persistJobs.push(updateSubstepDone(supabase, userId, substep.id, nextDone))
        }
      }
    }
  }

  if (persistJobs.length) {
    await Promise.all(persistJobs)
  }
  return persistJobs.length
}

/**
 * Recalcule (et persiste) is_done pour une liste de projets, y compris liens habit.
 * Mutates `projects` in place.
 */
export async function syncProjectsListDoneStates(supabase, userId, projects) {
  if (!userId || !projects?.length) return projects

  const stepIds = []
  const substepIds = []
  const habitIds = new Set()

  for (const project of projects) {
    if (project.habit_id) habitIds.add(project.habit_id)
    for (const step of project.steps ?? []) {
      stepIds.push(step.id)
      for (const substep of step.substeps ?? []) {
        substepIds.push(substep.id)
      }
    }
  }

  let logsByItemId = {}
  try {
    if (stepIds.length || substepIds.length) {
      const logs = await fetchProgressLogsForProject(supabase, userId, stepIds, substepIds)
      logsByItemId = Object.fromEntries(groupLogsByItemId(logs))
    }
  } catch (err) {
    console.warn('syncProjectsListDoneStates logs:', err)
  }

  const habitLogsByHabitId = new Map()
  if (habitIds.size) {
    const { start, end } = getHabitLogsFetchRangeForProject()
    await Promise.all(
      [...habitIds].map(async (habitId) => {
        try {
          const logs = await listHabitLogsForRange(supabase, userId, habitId, start, end)
          habitLogsByHabitId.set(habitId, buildHabitLogsByDate(logs))
        } catch (err) {
          console.warn('syncProjectsListDoneStates habit:', habitId, err)
          habitLogsByHabitId.set(habitId, {})
        }
      }),
    )
  }

  await Promise.all(
    projects.map((project) =>
      reconcileProjectDoneStates(supabase, userId, project, {
        logsByItemId,
        habitLinked: Boolean(project.habit_id),
        habitLogsByDate: project.habit_id
          ? habitLogsByHabitId.get(project.habit_id) ?? {}
          : {},
        persist: true,
      }),
    ),
  )

  return projects
}
