import { hasQuantiteTracking } from '../constants/projectProgress.js'
import { deleteStep, deleteSubstep } from './projects.js'

const DEFAULT_STALE_DAYS = 30

let purgeDoneForUser = null
let purgePromise = null

function getCutoffIso(olderThanDays) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - olderThanDays)
  return cutoff.toISOString()
}

function isStaleCheckboxItem(item, cutoffIso) {
  if (!item?.is_done) return false
  if (hasQuantiteTracking(item)) return false
  if (!item.done_at) return false
  return String(item.done_at) < cutoffIso
}

async function fetchEligibleProjectIds(supabase, userId) {
  let { data: projects, error } = await supabase
    .from('projects')
    .select('id, habit_id')
    .eq('user_id', userId)

  if (error?.message?.includes('habit_id')) {
    ;({ data: projects, error } = await supabase
      .from('projects')
      .select('id')
      .eq('user_id', userId))
  }

  if (error) throw error

  return (projects ?? [])
    .filter((project) => !project.habit_id)
    .map((project) => project.id)
}

async function fetchDoneSteps(supabase, userId, projectIds) {
  const { data, error } = await supabase
    .from('project_steps')
    .select('id, project_id, is_done, quantite_cible, done_at')
    .eq('user_id', userId)
    .in('project_id', projectIds)
    .eq('is_done', true)

  if (error?.message?.includes('done_at')) return { rows: null, missingDoneAt: true }
  if (error) throw error
  return { rows: data ?? [], missingDoneAt: false }
}

async function fetchDoneSubsteps(supabase, userId, stepIds) {
  if (!stepIds.length) return { rows: [], missingDoneAt: false }

  const { data, error } = await supabase
    .from('project_substeps')
    .select('id, step_id, is_done, quantite_cible, done_at')
    .eq('user_id', userId)
    .in('step_id', stepIds)
    .eq('is_done', true)

  if (error?.message?.includes('done_at')) return { rows: null, missingDoneAt: true }
  if (error) throw error
  return { rows: data ?? [], missingDoneAt: false }
}

async function runPurge(supabase, userId, olderThanDays) {
  const cutoffIso = getCutoffIso(olderThanDays)
  const projectIds = await fetchEligibleProjectIds(supabase, userId)

  if (!projectIds.length) {
    return { deletedSteps: 0, deletedSubsteps: 0 }
  }

  const stepsResult = await fetchDoneSteps(supabase, userId, projectIds)
  if (stepsResult.missingDoneAt) {
    console.warn('projectCleanup: colonne done_at absente, purge ignorée')
    return { deletedSteps: 0, deletedSubsteps: 0 }
  }

  const stepIds = stepsResult.rows.map((step) => step.id)
  const substepsResult = await fetchDoneSubsteps(supabase, userId, stepIds)
  if (substepsResult.missingDoneAt) {
    console.warn('projectCleanup: colonne done_at absente, purge ignorée')
    return { deletedSteps: 0, deletedSubsteps: 0 }
  }

  const staleSteps = stepsResult.rows.filter((step) => isStaleCheckboxItem(step, cutoffIso))
  const staleStepIds = new Set(staleSteps.map((step) => step.id))
  const staleSubsteps = substepsResult.rows.filter(
    (substep) => isStaleCheckboxItem(substep, cutoffIso) && !staleStepIds.has(substep.step_id),
  )

  for (const substep of staleSubsteps) {
    await deleteSubstep(supabase, userId, substep.id)
  }

  for (const step of staleSteps) {
    await deleteStep(supabase, userId, step.id)
  }

  return {
    deletedSteps: staleSteps.length,
    deletedSubsteps: staleSubsteps.length,
  }
}

/**
 * Supprime les étapes/sous-étapes « une fois » restées complétées depuis plus d'un mois.
 * Les éléments avec suivi quantité ou les projets liés à une habitude ne sont jamais supprimés.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ olderThanDays?: number, force?: boolean }} [options]
 */
export async function purgeStaleCompletedProjectItems(
  supabase,
  userId,
  { olderThanDays = DEFAULT_STALE_DAYS, force = false } = {},
) {
  if (!userId) return { deletedSteps: 0, deletedSubsteps: 0 }
  if (!force && purgeDoneForUser === userId) return { deletedSteps: 0, deletedSubsteps: 0 }

  if (purgePromise) {
    return purgePromise
  }

  purgePromise = (async () => {
    try {
      const result = await runPurge(supabase, userId, olderThanDays)
      purgeDoneForUser = userId
      return result
    } catch (err) {
      console.error('projectCleanup:', err)
      return { deletedSteps: 0, deletedSubsteps: 0 }
    } finally {
      purgePromise = null
    }
  })()

  return purgePromise
}
