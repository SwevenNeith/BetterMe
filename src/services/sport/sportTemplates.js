import { estimateWorkoutDurationMin } from '../../utils/sport/wgerExercise.js'
import { sportExerciseToSnapshot } from './sportExercises.js'

const TEMPLATES = 'sport_workout_templates'
const TEMPLATE_EX = 'sport_workout_template_exercises'

const T_COLS =
  'id, user_id, name, description, estimated_duration_min, muscle_focus, created_at, updated_at'

const TE_COLS =
  'id, user_id, template_id, exercise_id, sort_order, target_sets, target_reps, target_weight, weight_unit, rest_seconds, notes, snapshot, created_at'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listWorkoutTemplates(supabase, userId) {
  const { data, error } = await supabase
    .from(TEMPLATES)
    .select(T_COLS)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getWorkoutTemplate(supabase, userId, templateId) {
  const { data: template, error } = await supabase
    .from(TEMPLATES)
    .select(T_COLS)
    .eq('user_id', userId)
    .eq('id', templateId)
    .maybeSingle()
  if (error) throw error
  if (!template) return null

  const { data: exercises, error: exErr } = await supabase
    .from(TEMPLATE_EX)
    .select(TE_COLS)
    .eq('user_id', userId)
    .eq('template_id', templateId)
    .order('sort_order', { ascending: true })
  if (exErr) throw exErr

  return { ...template, exercises: exercises ?? [] }
}

/**
 * @param {object} payload
 * @param {Array<object>} payload.exercises — items avec snapshot / exercise_id / targets
 */
export async function createWorkoutTemplate(supabase, userId, payload) {
  const exercises = Array.isArray(payload.exercises) ? payload.exercises : []
  const estimated =
    payload.estimated_duration_min ??
    estimateWorkoutDurationMin(
      exercises.map((e) => ({
        target_sets: e.target_sets ?? 3,
        rest_seconds: e.rest_seconds ?? 90,
      })),
    )

  const { data: template, error } = await supabase
    .from(TEMPLATES)
    .insert({
      user_id: userId,
      name: String(payload.name || '').trim() || 'Séance',
      description: payload.description || null,
      estimated_duration_min: estimated,
      muscle_focus: payload.muscle_focus || payload.muscleFocus || [],
    })
    .select(T_COLS)
    .single()
  if (error) throw error

  if (exercises.length) {
    const rows = exercises.map((ex, index) => ({
      user_id: userId,
      template_id: template.id,
      exercise_id: ex.exercise_id || ex.exerciseId || null,
      sort_order: ex.sort_order ?? index,
      target_sets: Number(ex.target_sets ?? ex.targetSets ?? 3) || 3,
      target_reps: ex.target_reps ?? ex.targetReps ?? 10,
      target_weight: ex.target_weight ?? ex.targetWeight ?? null,
      weight_unit: ex.weight_unit || ex.weightUnit || 'kg',
      rest_seconds: Number(ex.rest_seconds ?? ex.restSeconds ?? 90) || 90,
      notes: ex.notes || null,
      snapshot: ex.snapshot || (ex.exerciseRow ? sportExerciseToSnapshot(ex.exerciseRow) : {}),
    }))
    const { error: exErr } = await supabase.from(TEMPLATE_EX).insert(rows)
    if (exErr) throw exErr
  }

  return getWorkoutTemplate(supabase, userId, template.id)
}

export async function updateWorkoutTemplate(supabase, userId, templateId, payload) {
  const patch = {
    updated_at: new Date().toISOString(),
  }
  if (payload.name != null) patch.name = String(payload.name).trim()
  if (payload.description !== undefined) patch.description = payload.description
  if (payload.estimated_duration_min !== undefined) {
    patch.estimated_duration_min = payload.estimated_duration_min
  }
  if (payload.muscle_focus !== undefined) patch.muscle_focus = payload.muscle_focus

  const { error } = await supabase
    .from(TEMPLATES)
    .update(patch)
    .eq('user_id', userId)
    .eq('id', templateId)
  if (error) throw error

  if (Array.isArray(payload.exercises)) {
    const { error: delErr } = await supabase
      .from(TEMPLATE_EX)
      .delete()
      .eq('user_id', userId)
      .eq('template_id', templateId)
    if (delErr) throw delErr

    if (payload.exercises.length) {
      const rows = payload.exercises.map((ex, index) => ({
        user_id: userId,
        template_id: templateId,
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
      const { error: insErr } = await supabase.from(TEMPLATE_EX).insert(rows)
      if (insErr) throw insErr

      const estimated = estimateWorkoutDurationMin(rows)
      await supabase
        .from(TEMPLATES)
        .update({ estimated_duration_min: estimated, updated_at: new Date().toISOString() })
        .eq('id', templateId)
        .eq('user_id', userId)
    }
  }

  return getWorkoutTemplate(supabase, userId, templateId)
}

export async function duplicateWorkoutTemplate(supabase, userId, templateId) {
  const full = await getWorkoutTemplate(supabase, userId, templateId)
  if (!full) throw new Error('Séance introuvable.')
  return createWorkoutTemplate(supabase, userId, {
    name: `${full.name} (copie)`,
    description: full.description,
    muscle_focus: full.muscle_focus,
    estimated_duration_min: full.estimated_duration_min,
    exercises: (full.exercises || []).map((ex) => ({
      exercise_id: ex.exercise_id,
      sort_order: ex.sort_order,
      target_sets: ex.target_sets,
      target_reps: ex.target_reps,
      target_weight: ex.target_weight,
      weight_unit: ex.weight_unit,
      rest_seconds: ex.rest_seconds,
      notes: ex.notes,
      snapshot: ex.snapshot,
    })),
  })
}

export async function deleteWorkoutTemplate(supabase, userId, templateId) {
  const { error } = await supabase
    .from(TEMPLATES)
    .delete()
    .eq('user_id', userId)
    .eq('id', templateId)
  if (error) throw error
}
