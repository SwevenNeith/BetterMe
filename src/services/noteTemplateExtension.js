import {
  NOTE_TEMPLATE_RULE_TYPES,
  NOTE_TEMPLATE_VARIABLES,
  createDefaultNoteTemplatePrefs,
} from '../constants/noteTemplates.js'
import { ensureUserSettings } from './menstruationNotifications.js'

const SETTINGS_TABLE = 'settings'
const COLUMN = 'notes_template_prefs'

const VALID_RULE_TYPES = new Set(NOTE_TEMPLATE_RULE_TYPES.map((item) => item.type))

function isMissingColumnError(error) {
  return (
    error?.code === 'PGRST204' &&
    typeof error.message === 'string' &&
    error.message.includes(`'${COLUMN}'`)
  )
}

/**
 * @param {unknown} raw
 * @returns {import('../constants/noteTemplates.js').NoteTemplatePrefs}
 */
export function mergeNoteTemplatePrefs(raw) {
  const defaults = createDefaultNoteTemplatePrefs()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults

  const source = /** @type {Record<string, unknown>} */ (raw)

  return {
    folderName:
      typeof source.folderName === 'string' && source.folderName.trim()
        ? source.folderName.trim()
        : defaults.folderName,
    folderId: typeof source.folderId === 'string' ? source.folderId : null,
    folderSource:
      source.folderSource === 'existing' || source.folderSource === 'create'
        ? source.folderSource
        : defaults.folderSource,
    rules: normalizeTemplateRules(source.rules),
  }
}

/**
 * @param {unknown} rules
 * @returns {import('../constants/noteTemplates.js').NoteTemplateRule[]}
 */
function normalizeTemplateRules(rules) {
  if (!Array.isArray(rules)) return []

  /** @type {import('../constants/noteTemplates.js').NoteTemplateRule[]} */
  const normalized = []

  for (const raw of rules) {
    if (!raw || typeof raw !== 'object') continue
    const rule = /** @type {Record<string, unknown>} */ (raw)
    const type = rule.type
    if (typeof type !== 'string' || !VALID_RULE_TYPES.has(type)) continue

    const templateNoteId = String(rule.templateNoteId ?? '').trim()
    if (!templateNoteId) continue

    const entry = {
      id: typeof rule.id === 'string' && rule.id ? rule.id : crypto.randomUUID(),
      type,
      templateNoteId,
      folderId: null,
      pattern: '',
    }

    if (type === 'folder') {
      const folderId = rule.folderId ?? rule.folder_id
      if (typeof folderId !== 'string' || !folderId) continue
      entry.folderId = folderId
    } else if (type === 'title-exact' || type === 'title-contains') {
      const pattern = String(rule.pattern ?? '').trim()
      if (!pattern) continue
      entry.pattern = pattern
    }

    normalized.push(entry)
  }

  return normalized
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function loadNoteTemplatePrefs(supabase, userId) {
  if (!userId) return createDefaultNoteTemplatePrefs()

  await ensureUserSettings(userId)

  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select(COLUMN)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (isMissingColumnError(error)) {
      console.warn(
        `Colonne ${COLUMN} absente. Exécute scripts/migrate-settings-notes-template-prefs.sql dans Supabase.`,
      )
      return createDefaultNoteTemplatePrefs()
    }
    throw error
  }

  return mergeNoteTemplatePrefs(data?.[COLUMN])
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {import('../constants/noteTemplates.js').NoteTemplatePrefs} prefs
 */
export async function saveNoteTemplatePrefs(supabase, userId, prefs) {
  const payload = mergeNoteTemplatePrefs(prefs)
  if (!userId) return payload

  await ensureUserSettings(userId)

  const { error } = await supabase
    .from(SETTINGS_TABLE)
    .update({ [COLUMN]: payload })
    .eq('user_id', userId)

  if (error) {
    if (isMissingColumnError(error)) {
      throw new Error(
        `Colonne ${COLUMN} absente. Exécute scripts/migrate-settings-notes-template-prefs.sql dans Supabase.`,
      )
    }
    throw error
  }

  return payload
}

/**
 * @param {Array<{ id: string, content_md?: string, contentMd?: string }>} notes
 * @param {string} templateNoteId
 */
function getTemplateContent(notes, templateNoteId) {
  const note = notes.find((item) => item.id === templateNoteId)
  if (!note) return ''
  return String(note.content_md ?? note.contentMd ?? '')
}

/**
 * @param {Date} [date]
 */
function localDateIso(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * @param {{ title?: string, date?: Date }} vars
 * @returns {Record<string, string>}
 */
export function buildTemplateVariableContext(vars = {}) {
  const title = String(vars.title ?? '').trim()
  const now = vars.date instanceof Date ? vars.date : new Date()

  /** @type {Record<string, string>} */
  const context = {
    titre: title,
    title: title,
    date: now.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    'date-courte': now.toLocaleDateString('fr-FR'),
    date_courte: now.toLocaleDateString('fr-FR'),
    'date-short': now.toLocaleDateString('fr-FR'),
    'date-iso': localDateIso(now),
    date_iso: localDateIso(now),
    jour: String(now.getDate()).padStart(2, '0'),
    day: String(now.getDate()).padStart(2, '0'),
    mois: String(now.getMonth() + 1).padStart(2, '0'),
    month: String(now.getMonth() + 1).padStart(2, '0'),
    annee: String(now.getFullYear()),
    year: String(now.getFullYear()),
    heure: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    time: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    'heure-complete': now.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    heure_complete: now.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    'time-full': now.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  }

  for (let level = 1; level <= 6; level += 1) {
    const heading = title ? `${'#'.repeat(level)} ${title}` : ''
    context[`titre-h${level}`] = heading
    context[`title-h${level}`] = heading
    context[`titre-${level}`] = heading
    context[`title-${level}`] = heading
  }

  for (const variable of NOTE_TEMPLATE_VARIABLES) {
    const token = variable.token.toLowerCase()
    if (!(token in context)) context[token] = ''
    for (const alias of variable.aliases ?? []) {
      const key = alias.toLowerCase()
      if (!(key in context) && token in context) context[key] = context[token]
    }
  }

  return context
}

/**
 * Remplace les variables simples dans le contenu du modèle.
 * @param {string} content
 * @param {{ title?: string, date?: Date }} vars
 */
export function applyTemplateVariables(content, vars = {}) {
  const context = buildTemplateVariableContext(vars)
  return String(content ?? '').replace(/\{\{\s*([a-z0-9_-]+)\s*\}\}/gi, (match, rawKey) => {
    const key = String(rawKey ?? '').toLowerCase()
    if (key in context) return context[key]
    return match
  })
}

/**
 * Détermine le contenu initial d’une nouvelle note selon les règles configurées.
 * @param {import('../constants/noteTemplates.js').NoteTemplatePrefs} prefs
 * @param {Array<{ id: string, folder_id?: string | null, content_md?: string, contentMd?: string }>} notes
 * @param {{ folderId?: string | null, title?: string }} context
 */
export function resolveTemplateContent(prefs, notes, context = {}) {
  const templatesFolderId = prefs?.folderId ?? null
  const folderId = context.folderId ?? null
  const title = String(context.title ?? '').trim()

  if (templatesFolderId && folderId === templatesFolderId) return ''

  const titleLower = title.toLowerCase()
  const rules = prefs?.rules ?? []

  for (const rule of rules.filter((item) => item.type === 'title-exact')) {
    if (rule.pattern?.toLowerCase() === titleLower) {
      return applyTemplateVariables(getTemplateContent(notes, rule.templateNoteId), { title })
    }
  }

  for (const rule of rules.filter((item) => item.type === 'title-contains')) {
    const pattern = rule.pattern?.toLowerCase() ?? ''
    if (pattern && titleLower.includes(pattern)) {
      return applyTemplateVariables(getTemplateContent(notes, rule.templateNoteId), { title })
    }
  }

  for (const rule of rules.filter((item) => item.type === 'folder')) {
    if (rule.folderId && rule.folderId === folderId) {
      return applyTemplateVariables(getTemplateContent(notes, rule.templateNoteId), { title })
    }
  }

  for (const rule of rules.filter((item) => item.type === 'default')) {
    return applyTemplateVariables(getTemplateContent(notes, rule.templateNoteId), { title })
  }

  return ''
}

/**
 * @param {import('../constants/noteTemplates.js').NoteTemplateRuleType} type
 */
export function labelForTemplateRuleType(type) {
  return NOTE_TEMPLATE_RULE_TYPES.find((item) => item.type === type)?.label ?? type
}
