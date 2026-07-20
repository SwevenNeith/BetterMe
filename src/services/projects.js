import {
  DEFAULT_QUANTITE_CIBLE,
  DEFAULT_RESET_PERIODE,
  normalizeQuantiteCible,
  normalizeResetPeriode,
} from '../constants/projectProgress.js'

const PROJECTS_TABLE = 'projects'
const STEPS_TABLE = 'project_steps'
const SUBSTEPS_TABLE = 'project_substeps'
const DEFAULT_PROJECT_COLOR = '#ad81be'
const PROJECTS_CUSTOM_ORDER_KEY = 'betterme:projects-custom-order'

export function compareProjectsByTitle(a, b) {
  return a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' })
}

export function projectsCustomOrderStorageKey(userId) {
  return `${PROJECTS_CUSTOM_ORDER_KEY}:${userId}`
}

export function isProjectsCustomOrder(userId) {
  if (!userId) return false
  try {
    return localStorage.getItem(projectsCustomOrderStorageKey(userId)) === '1'
  } catch {
    return false
  }
}

export function markProjectsCustomOrder(userId) {
  if (!userId) return
  try {
    localStorage.setItem(projectsCustomOrderStorageKey(userId), '1')
  } catch {
    /* ignore */
  }
}

function normalizeProjectRow(p, index) {
  const iconeRaw = (p.icone ?? '').trim()
  return {
    id: p.id,
    title: p.title,
    description: p.description ?? '',
    icone: iconeRaw || null,
    couleur: (p.couleur ?? '').trim() || DEFAULT_PROJECT_COLOR,
    sort_order: p.sort_order ?? index + 1,
    habit_id: p.habit_id ?? null,
    steps: [],
  }
}

export async function fetchProjectById(supabase, userId, projectId) {
  const projects = await fetchProjectsTree(supabase, userId)
  return projects.find((p) => p.id === projectId) ?? null
}

export async function fetchProjectsTree(supabase, userId) {
  let projRows
  let projError

  ;({ data: projRows, error: projError } = await supabase
    .from(PROJECTS_TABLE)
    .select('id, title, description, icone, couleur, sort_order, habit_id, created_at')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true }))

  if (projError?.message?.includes('habit_id')) {
    ;({ data: projRows, error: projError } = await supabase
      .from(PROJECTS_TABLE)
      .select('id, title, description, icone, couleur, sort_order, created_at')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }))
  }

  if (projError?.message?.includes('icone') || projError?.message?.includes('couleur')) {
    ;({ data: projRows, error: projError } = await supabase
      .from(PROJECTS_TABLE)
      .select('id, title, description, sort_order, created_at')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }))
  }

  if (projError?.message?.includes('sort_order')) {
    ;({ data: projRows, error: projError } = await supabase
      .from(PROJECTS_TABLE)
      .select('id, title, description, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }))
  }

  if (projError?.message?.includes('description')) {
    ;({ data: projRows, error: projError } = await supabase
      .from(PROJECTS_TABLE)
      .select('id, title, sort_order, created_at')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }))
  }

  if (projError) throw projError

  const projects = (projRows ?? []).map((p, index) => normalizeProjectRow(p, index))

  const projectIds = projects.map((p) => p.id)
  if (projectIds.length === 0) return projects

  let stepRows
  let stepsError

  ;({ data: stepRows, error: stepsError } = await supabase
    .from(STEPS_TABLE)
    .select('id, project_id, title, description, step_order, is_done, quantite_cible, reset_periode, created_at')
    .eq('user_id', userId)
    .in('project_id', projectIds)
    .order('step_order', { ascending: true }))

  if (
    stepsError?.message?.includes('quantite_cible')
    || stepsError?.message?.includes('reset_periode')
  ) {
    ;({ data: stepRows, error: stepsError } = await supabase
      .from(STEPS_TABLE)
      .select('id, project_id, title, description, step_order, is_done, created_at')
      .eq('user_id', userId)
      .in('project_id', projectIds)
      .order('step_order', { ascending: true }))
  }

  if (stepsError?.message?.includes('description') || stepsError?.message?.includes('is_done')) {
    ;({ data: stepRows, error: stepsError } = await supabase
      .from(STEPS_TABLE)
      .select('id, project_id, title, step_order, created_at')
      .eq('user_id', userId)
      .in('project_id', projectIds)
      .order('step_order', { ascending: true }))
  }

  if (stepsError) throw stepsError

  const stepsByProject = new Map(projectIds.map((id) => [id, []]))
  const allSteps = (stepRows ?? []).map((s) => ({
    id: s.id,
    project_id: s.project_id,
    title: s.title,
    description: s.description ?? '',
    step_order: s.step_order ?? 1,
    is_done: Boolean(s.is_done),
    quantite_cible: normalizeQuantiteCible(s.quantite_cible),
    reset_periode: normalizeResetPeriode(s.reset_periode),
    substeps: [],
  }))

  for (const step of allSteps) {
    stepsByProject.get(step.project_id)?.push(step)
  }

  const stepIds = allSteps.map((s) => s.id)
  if (stepIds.length > 0) {
    let subRows
    let subsError

    ;({ data: subRows, error: subsError } = await supabase
      .from(SUBSTEPS_TABLE)
      .select('id, step_id, title, description, substep_order, is_done, quantite_cible, reset_periode, created_at')
      .eq('user_id', userId)
      .in('step_id', stepIds)
      .order('substep_order', { ascending: true }))

    if (
      subsError?.message?.includes('quantite_cible')
      || subsError?.message?.includes('reset_periode')
    ) {
      ;({ data: subRows, error: subsError } = await supabase
        .from(SUBSTEPS_TABLE)
        .select('id, step_id, title, description, substep_order, is_done, created_at')
        .eq('user_id', userId)
        .in('step_id', stepIds)
        .order('substep_order', { ascending: true }))
    }

    if (subsError?.message?.includes('description') || subsError?.message?.includes('is_done')) {
      ;({ data: subRows, error: subsError } = await supabase
        .from(SUBSTEPS_TABLE)
        .select('id, step_id, title, substep_order, created_at')
        .eq('user_id', userId)
        .in('step_id', stepIds)
        .order('substep_order', { ascending: true }))
    }

    if (subsError) throw subsError

    const subsByStep = new Map(stepIds.map((id) => [id, []]))
    for (const sub of subRows ?? []) {
      subsByStep.get(sub.step_id)?.push({
        id: sub.id,
        title: sub.title,
        description: sub.description ?? '',
        substep_order: sub.substep_order ?? 1,
        is_done: Boolean(sub.is_done),
        quantite_cible: normalizeQuantiteCible(sub.quantite_cible),
        reset_periode: normalizeResetPeriode(sub.reset_periode),
      })
    }

    for (const step of allSteps) {
      step.substeps = subsByStep.get(step.id) ?? []
    }
  }

  for (const project of projects) {
    project.steps = stepsByProject.get(project.id) ?? []
  }

  return projects
}

export async function createProject(
  supabase,
  userId,
  title,
  sortOrder,
  description = '',
  icone = null,
  couleur = DEFAULT_PROJECT_COLOR,
  habitId = null,
) {
  const desc = String(description ?? '').trim()
  const iconeRaw = (icone ?? '').trim()
  const color = (couleur ?? '').trim() || DEFAULT_PROJECT_COLOR
  const habit_id = habitId || null
  let { error } = await supabase.from(PROJECTS_TABLE).insert({
    user_id: userId,
    title,
    sort_order: sortOrder,
    description: desc,
    icone: iconeRaw || null,
    couleur: color,
    habit_id,
  })
  if (error?.message?.includes('habit_id')) {
    ;({ error } = await supabase.from(PROJECTS_TABLE).insert({
      user_id: userId,
      title,
      sort_order: sortOrder,
      description: desc,
      icone: iconeRaw || null,
      couleur: color,
    }))
  }
  if (error?.message?.includes('icone') || error?.message?.includes('couleur')) {
    ;({ error } = await supabase.from(PROJECTS_TABLE).insert({
      user_id: userId,
      title,
      sort_order: sortOrder,
      description: desc,
    }))
  }
  if (error?.message?.includes('sort_order') || error?.message?.includes('description')) {
    ;({ error } = await supabase.from(PROJECTS_TABLE).insert({
      user_id: userId,
      title,
      sort_order: sortOrder,
    }))
  }
  if (error?.message?.includes('sort_order')) {
    ;({ error } = await supabase.from(PROJECTS_TABLE).insert({
      user_id: userId,
      title,
    }))
  }
  if (error) throw error
}

export async function updateProjectHabitId(supabase, userId, projectId, habitId) {
  const { error } = await supabase
    .from(PROJECTS_TABLE)
    .update({ habit_id: habitId || null })
    .eq('id', projectId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function applyAlphabeticalProjectOrder(supabase, userId, projects) {
  const sorted = [...projects].sort(compareProjectsByTitle)
  const changed = sorted.some((p, index) => projects[index]?.id !== p.id)
  if (!changed) return sorted
  await persistProjectOrders(supabase, userId, sorted)
  return sorted.map((p, index) => ({ ...p, sort_order: index + 1 }))
}

export async function updateProjectTitle(supabase, userId, projectId, title) {
  const { error } = await supabase
    .from(PROJECTS_TABLE)
    .update({ title })
    .eq('id', projectId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function updateProjectDescription(supabase, userId, projectId, description) {
  const { error } = await supabase
    .from(PROJECTS_TABLE)
    .update({ description })
    .eq('id', projectId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function updateProjectAppearance(supabase, userId, projectId, icone, couleur) {
  const iconeRaw = (icone ?? '').trim()
  const color = (couleur ?? '').trim() || DEFAULT_PROJECT_COLOR
  let { error } = await supabase
    .from(PROJECTS_TABLE)
    .update({ icone: iconeRaw || null, couleur: color })
    .eq('id', projectId)
    .eq('user_id', userId)
  if (error?.message?.includes('icone') || error?.message?.includes('couleur')) return
  if (error) throw error
}

export async function deleteProject(supabase, userId, projectId) {
  const { error } = await supabase
    .from(PROJECTS_TABLE)
    .delete()
    .eq('id', projectId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function createStep(
  supabase,
  userId,
  projectId,
  title,
  stepOrder,
  description = '',
  quantiteCible = DEFAULT_QUANTITE_CIBLE,
  resetPeriode = DEFAULT_RESET_PERIODE,
) {
  const desc = String(description ?? '').trim()
  const payload = {
    user_id: userId,
    project_id: projectId,
    title,
    step_order: stepOrder,
    description: desc,
    quantite_cible: normalizeQuantiteCible(quantiteCible),
    reset_periode: normalizeResetPeriode(resetPeriode),
  }
  let { error } = await supabase.from(STEPS_TABLE).insert(payload)
  if (
    error?.message?.includes('quantite_cible')
    || error?.message?.includes('reset_periode')
  ) {
    delete payload.quantite_cible
    delete payload.reset_periode
    ;({ error } = await supabase.from(STEPS_TABLE).insert(payload))
  }
  if (error?.message?.includes('description')) {
    ;({ error } = await supabase.from(STEPS_TABLE).insert({
      user_id: userId,
      project_id: projectId,
      title,
      step_order: stepOrder,
    }))
  }
  if (error) throw error
}

export async function updateStepTitle(supabase, userId, stepId, title) {
  const { error } = await supabase
    .from(STEPS_TABLE)
    .update({ title })
    .eq('id', stepId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function updateStepDescription(supabase, userId, stepId, description) {
  const { error } = await supabase
    .from(STEPS_TABLE)
    .update({ description })
    .eq('id', stepId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function updateStepProgressSettings(
  supabase,
  userId,
  stepId,
  quantiteCible,
  resetPeriode,
) {
  const payload = {
    quantite_cible: normalizeQuantiteCible(quantiteCible),
    reset_periode: normalizeResetPeriode(resetPeriode),
  }
  const { error } = await supabase
    .from(STEPS_TABLE)
    .update(payload)
    .eq('id', stepId)
    .eq('user_id', userId)
  if (error?.message?.includes('quantite_cible') || error?.message?.includes('reset_periode')) return
  if (error) throw error
}

export async function updateStepDone(supabase, userId, stepId, isDone) {
  const payload = {
    is_done: isDone,
    done_at: isDone ? new Date().toISOString() : null,
  }
  let { error } = await supabase
    .from(STEPS_TABLE)
    .update(payload)
    .eq('id', stepId)
    .eq('user_id', userId)
  if (error?.message?.includes('done_at')) {
    ;({ error } = await supabase
      .from(STEPS_TABLE)
      .update({ is_done: isDone })
      .eq('id', stepId)
      .eq('user_id', userId))
  }
  if (error) throw error
}

export async function deleteStep(supabase, userId, stepId) {
  const { error } = await supabase
    .from(STEPS_TABLE)
    .delete()
    .eq('id', stepId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function createSubstep(
  supabase,
  userId,
  stepId,
  title,
  substepOrder,
  description = '',
  quantiteCible = DEFAULT_QUANTITE_CIBLE,
  resetPeriode = DEFAULT_RESET_PERIODE,
) {
  const desc = String(description ?? '').trim()
  const payload = {
    user_id: userId,
    step_id: stepId,
    title,
    substep_order: substepOrder,
    description: desc,
    quantite_cible: normalizeQuantiteCible(quantiteCible),
    reset_periode: normalizeResetPeriode(resetPeriode),
  }
  let { error } = await supabase.from(SUBSTEPS_TABLE).insert(payload)
  if (
    error?.message?.includes('quantite_cible')
    || error?.message?.includes('reset_periode')
  ) {
    delete payload.quantite_cible
    delete payload.reset_periode
    ;({ error } = await supabase.from(SUBSTEPS_TABLE).insert(payload))
  }
  if (error?.message?.includes('description')) {
    ;({ error } = await supabase.from(SUBSTEPS_TABLE).insert({
      user_id: userId,
      step_id: stepId,
      title,
      substep_order: substepOrder,
    }))
  }
  if (error) throw error
}

export async function updateSubstepTitle(supabase, userId, substepId, title) {
  const { error } = await supabase
    .from(SUBSTEPS_TABLE)
    .update({ title })
    .eq('id', substepId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function updateSubstepDescription(supabase, userId, substepId, description) {
  const { error } = await supabase
    .from(SUBSTEPS_TABLE)
    .update({ description })
    .eq('id', substepId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function updateSubstepProgressSettings(
  supabase,
  userId,
  substepId,
  quantiteCible,
  resetPeriode,
) {
  const payload = {
    quantite_cible: normalizeQuantiteCible(quantiteCible),
    reset_periode: normalizeResetPeriode(resetPeriode),
  }
  const { error } = await supabase
    .from(SUBSTEPS_TABLE)
    .update(payload)
    .eq('id', substepId)
    .eq('user_id', userId)
  if (error?.message?.includes('quantite_cible') || error?.message?.includes('reset_periode')) return
  if (error) throw error
}

export async function updateSubstepDone(supabase, userId, substepId, isDone) {
  const payload = {
    is_done: isDone,
    done_at: isDone ? new Date().toISOString() : null,
  }
  let { error } = await supabase
    .from(SUBSTEPS_TABLE)
    .update(payload)
    .eq('id', substepId)
    .eq('user_id', userId)
  if (error?.message?.includes('done_at')) {
    ;({ error } = await supabase
      .from(SUBSTEPS_TABLE)
      .update({ is_done: isDone })
      .eq('id', substepId)
      .eq('user_id', userId))
  }
  if (error) throw error
}

export async function deleteSubstep(supabase, userId, substepId) {
  const { error } = await supabase
    .from(SUBSTEPS_TABLE)
    .delete()
    .eq('id', substepId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function persistProjectOrders(supabase, userId, projects) {
  const updates = projects.map((p, index) =>
    supabase
      .from(PROJECTS_TABLE)
      .update({ sort_order: index + 1 })
      .eq('id', p.id)
      .eq('user_id', userId),
  )
  const results = await Promise.all(updates)
  const failed = results.find((r) => r.error)
  if (failed?.error?.message?.includes('sort_order')) return
  if (failed?.error) throw failed.error
}

export async function persistStepOrders(supabase, userId, steps) {
  const updates = steps.map((s, index) =>
    supabase
      .from(STEPS_TABLE)
      .update({ step_order: index + 1 })
      .eq('id', s.id)
      .eq('user_id', userId),
  )
  const results = await Promise.all(updates)
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}

export async function persistSubstepOrders(supabase, userId, substeps) {
  const updates = substeps.map((s, index) =>
    supabase
      .from(SUBSTEPS_TABLE)
      .update({ substep_order: index + 1 })
      .eq('id', s.id)
      .eq('user_id', userId),
  )
  const results = await Promise.all(updates)
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}
