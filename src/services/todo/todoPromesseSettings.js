import { supabase } from '../lib/supabase.js'
import {
  MAX_TODO_PROMESSES_PER_DAY,
  MAX_TODO_PROMESSES_PER_WEEK,
} from '../constants/todoOptions.js'
import { ensureUserSettings } from './menstruationNotifications.js'

const SETTINGS_TABLE = 'settings'

const MIN_PROMESSE_LIMIT = 1
const MAX_PROMESSE_LIMIT = 99

export function createDefaultTodoPromesseLimitSettings() {
  return {
    todo_promesse_limit_per_day: MAX_TODO_PROMESSES_PER_DAY,
    todo_promesse_limit_per_week: MAX_TODO_PROMESSES_PER_WEEK,
  }
}

export function normalizeTodoPromesseLimit(value, fallback) {
  const parsed = Math.round(Number(value))
  if (!Number.isInteger(parsed) || parsed < MIN_PROMESSE_LIMIT || parsed > MAX_PROMESSE_LIMIT) {
    return fallback
  }
  return parsed
}

/** @returns {{ perDay: number, perWeek: number }} */
export function toPromesseLimits(settings) {
  const defaults = createDefaultTodoPromesseLimitSettings()
  return {
    perDay: normalizeTodoPromesseLimit(
      settings?.todo_promesse_limit_per_day,
      defaults.todo_promesse_limit_per_day,
    ),
    perWeek: normalizeTodoPromesseLimit(
      settings?.todo_promesse_limit_per_week,
      defaults.todo_promesse_limit_per_week,
    ),
  }
}

function isMissingColumnError(error) {
  const msg = String(error?.message ?? '')
  return (
    error?.code === 'PGRST204' &&
    (msg.includes('todo_promesse_limit_per_day') || msg.includes('todo_promesse_limit_per_week'))
  )
}

export async function loadTodoPromesseLimitSettings(userId) {
  if (!userId) return createDefaultTodoPromesseLimitSettings()

  await ensureUserSettings(userId)

  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select('todo_promesse_limit_per_day, todo_promesse_limit_per_week')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (isMissingColumnError(error)) return createDefaultTodoPromesseLimitSettings()
    throw error
  }

  const defaults = createDefaultTodoPromesseLimitSettings()
  return {
    todo_promesse_limit_per_day: normalizeTodoPromesseLimit(
      data?.todo_promesse_limit_per_day,
      defaults.todo_promesse_limit_per_day,
    ),
    todo_promesse_limit_per_week: normalizeTodoPromesseLimit(
      data?.todo_promesse_limit_per_week,
      defaults.todo_promesse_limit_per_week,
    ),
  }
}

/** @returns {Promise<{ perDay: number, perWeek: number }>} */
export async function loadTodoPromesseLimits(userId) {
  const settings = await loadTodoPromesseLimitSettings(userId)
  return toPromesseLimits(settings)
}

export async function saveTodoPromesseLimitSettings(userId, settings) {
  if (!userId) return

  await ensureUserSettings(userId)

  const defaults = createDefaultTodoPromesseLimitSettings()
  const payload = {
    todo_promesse_limit_per_day: normalizeTodoPromesseLimit(
      settings.todo_promesse_limit_per_day,
      defaults.todo_promesse_limit_per_day,
    ),
    todo_promesse_limit_per_week: normalizeTodoPromesseLimit(
      settings.todo_promesse_limit_per_week,
      defaults.todo_promesse_limit_per_week,
    ),
  }

  const { error } = await supabase.from(SETTINGS_TABLE).update(payload).eq('user_id', userId)

  if (error) {
    if (isMissingColumnError(error)) {
      throw new Error(
        'Colonnes limites promesses absentes. Exécute scripts/migrate-settings-todo-promesse-limits.sql dans Supabase.',
      )
    }
    throw error
  }
}
