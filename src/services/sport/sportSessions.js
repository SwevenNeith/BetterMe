const SESSIONS = 'sport_sessions'
const SESSION_EX = 'sport_session_exercises'
const SESSION_SETS = 'sport_session_sets'

const S_COLS =
  'id, user_id, template_id, name, status, started_at, ended_at, paused_at, duration_seconds, active_elapsed_ms, current_exercise_index, notes, planned_at, created_at, updated_at'

const SE_COLS =
  'id, user_id, session_id, exercise_id, sort_order, target_sets, target_reps, target_weight, weight_unit, rest_seconds, notes, snapshot, created_at'

const SET_COLS =
  'id, user_id, session_id, session_exercise_id, set_number, reps, weight, weight_unit, duration_seconds, distance_m, difficulty, notes, completed_at, created_at'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listSessions(supabase, userId, opts = {}) {
  let q = supabase.from(SESSIONS).select(S_COLS).eq('user_id', userId)
  if (opts.status) {
    if (Array.isArray(opts.status)) q = q.in('status', opts.status)
    else q = q.eq('status', opts.status)
  }
  if (opts.from) q = q.gte('started_at', opts.from)
  if (opts.to) q = q.lte('started_at', opts.to)
  q = q.order('started_at', { ascending: false })
  if (opts.limit) q = q.limit(Number(opts.limit))
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function getActiveSession(supabase, userId) {
  const { data, error } = await supabase
    .from(SESSIONS)
    .select(S_COLS)
    .eq('user_id', userId)
    .in('status', ['in_progress', 'paused'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function getSessionDetail(supabase, userId, sessionId) {
  const { data: session, error } = await supabase
    .from(SESSIONS)
    .select(S_COLS)
    .eq('user_id', userId)
    .eq('id', sessionId)
    .maybeSingle()
  if (error) throw error
  if (!session) return null

  const { data: exercises, error: exErr } = await supabase
    .from(SESSION_EX)
    .select(SE_COLS)
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .order('sort_order', { ascending: true })
  if (exErr) throw exErr

  const { data: sets, error: setErr } = await supabase
    .from(SESSION_SETS)
    .select(SET_COLS)
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .order('set_number', { ascending: true })
  if (setErr) throw setErr

  const setsByEx = new Map()
  for (const s of sets ?? []) {
    const list = setsByEx.get(s.session_exercise_id) || []
    list.push(s)
    setsByEx.set(s.session_exercise_id, list)
  }

  return {
    ...session,
    exercises: (exercises ?? []).map((ex) => ({
      ...ex,
      sets: setsByEx.get(ex.id) || [],
    })),
  }
}

/**
 * Démarre une séance depuis un modèle (ou liste d’exercices libre).
 */
export async function startSession(supabase, userId, payload) {
  const existing = await getActiveSession(supabase, userId)
  if (existing) {
    const err = new Error('Une séance est déjà en cours. Reprends-la ou termine-la.')
    err.code = 'SPORT_SESSION_ACTIVE'
    err.sessionId = existing.id
    throw err
  }

  const exercises = Array.isArray(payload.exercises) ? payload.exercises : []
  if (!exercises.length) throw new Error('Ajoute au moins un exercice pour démarrer.')

  const { data: session, error } = await supabase
    .from(SESSIONS)
    .insert({
      user_id: userId,
      template_id: payload.template_id || payload.templateId || null,
      name: String(payload.name || '').trim() || 'Séance',
      status: 'in_progress',
      started_at: new Date().toISOString(),
      current_exercise_index: 0,
      active_elapsed_ms: 0,
      duration_seconds: 0,
      notes: payload.notes || null,
    })
    .select(S_COLS)
    .single()
  if (error) throw error

  const rows = exercises.map((ex, index) => ({
    user_id: userId,
    session_id: session.id,
    exercise_id: ex.exercise_id || ex.exerciseId || null,
    sort_order: ex.sort_order ?? index,
    target_sets: Number(ex.target_sets ?? 3) || 3,
    target_reps: ex.target_reps ?? 10,
    target_weight: ex.target_weight ?? null,
    weight_unit: ex.weight_unit || 'kg',
    rest_seconds: Number(ex.rest_seconds ?? 90) || 90,
    notes: ex.notes || null,
    snapshot: ex.snapshot || {},
  }))
  const { error: exErr } = await supabase.from(SESSION_EX).insert(rows)
  if (exErr) throw exErr

  return getSessionDetail(supabase, userId, session.id)
}

export async function updateSessionProgress(supabase, userId, sessionId, patch) {
  const payload = {
    ...patch,
    updated_at: new Date().toISOString(),
  }
  delete payload.id
  delete payload.user_id
  delete payload.created_at

  const { data, error } = await supabase
    .from(SESSIONS)
    .update(payload)
    .eq('user_id', userId)
    .eq('id', sessionId)
    .select(S_COLS)
    .single()
  if (error) throw error
  return data
}

export async function pauseSession(supabase, userId, sessionId, activeElapsedMs) {
  return updateSessionProgress(supabase, userId, sessionId, {
    status: 'paused',
    paused_at: new Date().toISOString(),
    active_elapsed_ms: Math.max(0, Number(activeElapsedMs) || 0),
  })
}

export async function resumeSession(supabase, userId, sessionId) {
  return updateSessionProgress(supabase, userId, sessionId, {
    status: 'in_progress',
    paused_at: null,
  })
}

export async function completeSession(supabase, userId, sessionId, opts = {}) {
  const activeMs = Math.max(0, Number(opts.activeElapsedMs) || 0)
  return updateSessionProgress(supabase, userId, sessionId, {
    status: 'completed',
    ended_at: new Date().toISOString(),
    paused_at: null,
    active_elapsed_ms: activeMs,
    duration_seconds: Math.round(activeMs / 1000),
    notes: opts.notes !== undefined ? opts.notes : undefined,
  })
}

export async function abandonSession(supabase, userId, sessionId, opts = {}) {
  const activeMs = Math.max(0, Number(opts.activeElapsedMs) || 0)
  return updateSessionProgress(supabase, userId, sessionId, {
    status: 'abandoned',
    ended_at: new Date().toISOString(),
    paused_at: null,
    active_elapsed_ms: activeMs,
    duration_seconds: Math.round(activeMs / 1000),
  })
}

/**
 * Enregistre ou met à jour une série (upsert sur set_number).
 */
export async function upsertSessionSet(supabase, userId, payload) {
  const sessionExerciseId = payload.session_exercise_id || payload.sessionExerciseId
  const sessionId = payload.session_id || payload.sessionId
  const setNumber = Number(payload.set_number ?? payload.setNumber)
  if (!sessionExerciseId || !sessionId || !setNumber) {
    throw new Error('Série incomplète.')
  }

  const { data: existing } = await supabase
    .from(SESSION_SETS)
    .select('id')
    .eq('user_id', userId)
    .eq('session_exercise_id', sessionExerciseId)
    .eq('set_number', setNumber)
    .maybeSingle()

  const row = {
    user_id: userId,
    session_id: sessionId,
    session_exercise_id: sessionExerciseId,
    set_number: setNumber,
    reps: payload.reps != null ? Number(payload.reps) : null,
    weight: payload.weight != null ? Number(payload.weight) : null,
    weight_unit: payload.weight_unit || payload.weightUnit || 'kg',
    duration_seconds:
      payload.duration_seconds != null ? Number(payload.duration_seconds) : null,
    distance_m: payload.distance_m != null ? Number(payload.distance_m) : null,
    difficulty: payload.difficulty != null ? Number(payload.difficulty) : null,
    notes: payload.notes || null,
    completed_at: new Date().toISOString(),
  }

  if (existing?.id) {
    const { data, error } = await supabase
      .from(SESSION_SETS)
      .update(row)
      .eq('id', existing.id)
      .eq('user_id', userId)
      .select(SET_COLS)
      .single()
    if (error) throw error
    return data
  }

  const { data, error } = await supabase.from(SESSION_SETS).insert(row).select(SET_COLS).single()
  if (error) throw error
  return data
}

export async function deleteSessionSet(supabase, userId, setId) {
  const { error } = await supabase
    .from(SESSION_SETS)
    .delete()
    .eq('user_id', userId)
    .eq('id', setId)
  if (error) throw error
}

export async function scheduleSession(supabase, userId, payload) {
  const { data, error } = await supabase
    .from(SESSIONS)
    .insert({
      user_id: userId,
      template_id: payload.template_id || null,
      name: String(payload.name || '').trim() || 'Séance planifiée',
      status: 'paused',
      planned_at: payload.planned_at || payload.plannedAt,
      started_at: payload.planned_at || payload.plannedAt || new Date().toISOString(),
      notes: payload.notes || null,
    })
    .select(S_COLS)
    .single()
  if (error) throw error
  return data
}

/**
 * Dernières perfs pour un exercice (via wger_id ou nom dans snapshot).
 */
export async function getLastPerformanceForExercise(supabase, userId, { wgerId, name }) {
  const { data: sessions, error } = await supabase
    .from(SESSIONS)
    .select('id, started_at, status')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('started_at', { ascending: false })
    .limit(40)
  if (error) throw error
  if (!sessions?.length) return null

  const sessionIds = sessions.map((s) => s.id)
  const { data: exercises, error: exErr } = await supabase
    .from(SESSION_EX)
    .select(SE_COLS)
    .eq('user_id', userId)
    .in('session_id', sessionIds)
  if (exErr) throw exErr

  const match = (exercises || []).find((ex) => {
    const snap = ex.snapshot || {}
    if (wgerId && Number(snap.wger_id) === Number(wgerId)) return true
    if (name && String(snap.name || '').toLowerCase() === String(name).toLowerCase()) return true
    return false
  })
  if (!match) return null

  const { data: sets, error: setErr } = await supabase
    .from(SESSION_SETS)
    .select(SET_COLS)
    .eq('user_id', userId)
    .eq('session_exercise_id', match.id)
    .order('set_number', { ascending: true })
  if (setErr) throw setErr

  const session = sessions.find((s) => s.id === match.session_id)
  return {
    sessionId: match.session_id,
    startedAt: session?.started_at || null,
    exercise: match,
    sets: sets ?? [],
  }
}
