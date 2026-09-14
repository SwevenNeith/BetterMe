import {
  countLogsInPeriod,
  getPeriodBoundsForDate,
  isDateInPeriod,
} from '../utils/projectProgressPeriods.js'

const LOGS_TABLE = 'project_progress_logs'

export async function fetchProgressLogsForProject(supabase, userId, stepIds, substepIds) {
  const logs = []

  if (stepIds?.length) {
    const { data, error } = await supabase
      .from(LOGS_TABLE)
      .select('id, step_id, substep_id, logged_at')
      .eq('user_id', userId)
      .in('step_id', stepIds)
      .order('logged_at', { ascending: true })

    if (error) throw error
    logs.push(...(data ?? []))
  }

  if (substepIds?.length) {
    const { data, error } = await supabase
      .from(LOGS_TABLE)
      .select('id, step_id, substep_id, logged_at')
      .eq('user_id', userId)
      .in('substep_id', substepIds)
      .order('logged_at', { ascending: true })

    if (error) throw error
    logs.push(...(data ?? []))
  }

  return logs
}

export function groupLogsByItemId(logs) {
  const byItem = new Map()

  for (const log of logs) {
    const itemId = log.step_id ?? log.substep_id
    if (!itemId) continue
    if (!byItem.has(itemId)) byItem.set(itemId, [])
    byItem.get(itemId).push(log)
  }

  return byItem
}

export async function addProgressLog(supabase, userId, { stepId = null, substepId = null }) {
  const row = { user_id: userId }
  if (stepId) row.step_id = stepId
  if (substepId) row.substep_id = substepId

  const { data, error } = await supabase.from(LOGS_TABLE).insert(row).select('id, step_id, substep_id, logged_at').single()
  if (error) throw error
  return data
}

export async function removeLatestLogInPeriod(
  supabase,
  userId,
  { stepId = null, substepId = null, resetPeriode },
) {
  const bounds = getPeriodBoundsForDate(new Date(), resetPeriode)
  let query = supabase
    .from(LOGS_TABLE)
    .select('id, logged_at')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })
    .limit(50)

  if (stepId) query = query.eq('step_id', stepId)
  if (substepId) query = query.eq('substep_id', substepId)

  const { data, error } = await query
  if (error) throw error

  const inPeriod = (data ?? []).find((log) => isDateInPeriod(log.logged_at, bounds))
  if (!inPeriod) return null

  const { error: deleteError } = await supabase
    .from(LOGS_TABLE)
    .delete()
    .eq('id', inPeriod.id)
    .eq('user_id', userId)

  if (deleteError) throw deleteError
  return inPeriod.id
}

export function getCurrentPeriodCount(logs, resetPeriode) {
  return countLogsInPeriod(logs ?? [], resetPeriode)
}
