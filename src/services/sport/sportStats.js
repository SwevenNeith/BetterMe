import { listSessions } from './sportSessions.js'

function startOfWeekMonday(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

function endOfWeek(start) {
  const d = new Date(start)
  d.setDate(d.getDate() + 7)
  return d
}

/**
 * Stats dashboard à partir des séances réellement enregistrées.
 */
export async function computeSportDashboard(supabase, userId, profile) {
  const weekStart = startOfWeekMonday()
  const weekEnd = endOfWeek(weekStart)

  const [weekSessions, recent, active, planned] = await Promise.all([
    listSessions(supabase, userId, {
      status: 'completed',
      from: weekStart.toISOString(),
      to: weekEnd.toISOString(),
      limit: 50,
    }),
    listSessions(supabase, userId, { status: 'completed', limit: 1 }),
    listSessions(supabase, userId, { status: ['in_progress', 'paused'], limit: 1 }),
    listSessions(supabase, userId, { limit: 30 }),
  ])

  const { count: totalCompleted, error: countErr } = await supabase
    .from('sport_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'completed')
  if (countErr) throw countErr

  const weekDurationSec = weekSessions.reduce(
    (sum, s) => sum + (Number(s.duration_seconds) || 0),
    0,
  )
  const weeklyGoal = Number(profile?.weekly_sessions_goal) || 0
  const weekCount = weekSessions.length

  const upcoming = (planned || [])
    .filter((s) => s.planned_at && new Date(s.planned_at) >= new Date() && s.status === 'paused')
    .sort((a, b) => String(a.planned_at).localeCompare(String(b.planned_at)))[0]

  return {
    weekSessionCount: weekCount,
    weekDurationSec,
    weekDurationMin: Math.round(weekDurationSec / 60),
    totalCompleted: Number(totalCompleted) || 0,
    lastSession: recent[0] || null,
    weeklyGoal,
    weeklyProgress: weeklyGoal > 0 ? Math.min(1, weekCount / weeklyGoal) : null,
    activeSession: active[0] || null,
    nextPlanned: upcoming || null,
  }
}

/**
 * Historique de charge pour un exercice (sessions complétées).
 */
export async function getExerciseProgressSeries(supabase, userId, { wgerId, name, limit = 20 }) {
  const sessions = await listSessions(supabase, userId, {
    status: 'completed',
    limit: 80,
  })
  if (!sessions.length) return []

  const { data: exercises, error } = await supabase
    .from('sport_session_exercises')
    .select('id, session_id, snapshot')
    .eq('user_id', userId)
    .in(
      'session_id',
      sessions.map((s) => s.id),
    )
  if (error) throw error

  const matched = (exercises || []).filter((ex) => {
    const snap = ex.snapshot || {}
    if (wgerId && Number(snap.wger_id) === Number(wgerId)) return true
    if (name && String(snap.name || '').toLowerCase() === String(name).toLowerCase()) return true
    return false
  })
  if (!matched.length) return []

  const exIds = matched.map((m) => m.id)
  const { data: sets, error: setErr } = await supabase
    .from('sport_session_sets')
    .select('session_exercise_id, weight, reps, weight_unit, completed_at')
    .eq('user_id', userId)
    .in('session_exercise_id', exIds)
  if (setErr) throw setErr

  const bySession = new Map()
  for (const m of matched) {
    const session = sessions.find((s) => s.id === m.session_id)
    if (!session) continue
    const exSets = (sets || []).filter((s) => s.session_exercise_id === m.id)
    if (!exSets.length) continue
    const maxWeight = Math.max(...exSets.map((s) => Number(s.weight) || 0))
    const maxReps = Math.max(...exSets.map((s) => Number(s.reps) || 0))
    bySession.set(m.session_id, {
      sessionId: m.session_id,
      date: session.started_at,
      maxWeight,
      maxReps,
      setCount: exSets.length,
      weightUnit: exSets[0]?.weight_unit || 'kg',
    })
  }

  return [...bySession.values()]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-limit)
}

export function formatDuration(seconds) {
  const s = Math.max(0, Number(seconds) || 0)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`
  return `${m} min`
}
