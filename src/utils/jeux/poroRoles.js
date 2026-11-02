/**
 * Détection / résolution du poste LoL pour Poro.
 */

export const PORO_ROLES = [
  {
    id: 'top',
    label: 'Top',
    aliases: ['top', 'haut', 'toplane', 'top lane'],
  },
  {
    id: 'jungle',
    label: 'Jungle',
    aliases: ['jungle', 'jgl', 'jg', 'jungler'],
  },
  {
    id: 'mid',
    label: 'Mid',
    aliases: ['mid', 'middle', 'milieu', 'midlane', 'mid lane'],
  },
  {
    id: 'adc',
    label: 'ADC',
    aliases: ['adc', 'bot', 'bottom', 'carry', 'marksman', 'tireur'],
  },
  {
    id: 'support',
    label: 'Support',
    aliases: ['support', 'supp', 'sup'],
  },
]

/**
 * @param {string} text
 */
export function normalizeRoleText(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Poste explicite dans la question (ex. « en jungle », « ADC »).
 * @param {string} raw
 * @returns {{ id: string, label: string } | null}
 */
export function detectRoleInText(raw) {
  const n = normalizeRoleText(raw)
  if (!n) return null

  // « poste mid », « role jungle », « en tant que support »
  for (const role of PORO_ROLES) {
    for (const alias of role.aliases) {
      const a = normalizeRoleText(alias)
      if (!a) continue
      const framed = new RegExp(
        `(?:poste|role|r[oô]le|lane|en\\s+tant\\s+que)\\s+(?:de\\s+|d\\s+)?${a}\\b`,
      )
      if (framed.test(n)) return { id: role.id, label: role.label }
    }
  }

  // Aliases les plus longs d’abord (« mid lane » avant « mid », « top lane » avant « top »)
  /** @type {{ id: string, label: string, alias: string }[]} */
  const flat = []
  for (const role of PORO_ROLES) {
    for (const alias of role.aliases) {
      const a = normalizeRoleText(alias)
      if (a) flat.push({ id: role.id, label: role.label, alias: a })
    }
  }
  flat.sort((a, b) => b.alias.length - a.alias.length)

  for (const { id, label, alias: a } of flat) {
    const escaped = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
    const re = new RegExp(
      `(?:^|\\s)(?:en\\s+|sur\\s+|au\\s+|en\\s+tant\\s+que\\s+)?${escaped}(?:\\s|$)`,
    )
    if (re.test(n) || n === a) {
      return { id, label }
    }
  }
  return null
}

/**
 * Infère un poste à partir des tags Data Dragon d’un champion.
 * @param {string[]} tags
 */
export function inferRoleFromChampionTags(tags) {
  const t = new Set((tags || []).map(String))
  if (t.has('Marksman')) return { id: 'adc', label: 'ADC' }
  if (t.has('Support') && !t.has('Mage') && !t.has('Assassin')) {
    return { id: 'support', label: 'Support' }
  }
  if (t.has('Tank') && t.has('Fighter')) return { id: 'top', label: 'Top' }
  if (t.has('Fighter') && !t.has('Mage')) return { id: 'top', label: 'Top' }
  if (t.has('Assassin') || t.has('Mage')) return { id: 'mid', label: 'Mid' }
  if (t.has('Tank')) return { id: 'top', label: 'Top' }
  return { id: 'mid', label: 'Mid' }
}

/**
 * Poste préféré : question > mémoire > défaut mid.
 * @param {string} raw
 * @param {{ kind?: string, label?: string, value?: string }[]} [memories]
 * @param {{ id?: string, label?: string } | null} [fallback]
 */
export function resolvePreferredRole(raw, memories = [], fallback = null) {
  const fromText = detectRoleInText(raw)
  if (fromText) return { ...fromText, source: 'question' }

  const list = Array.isArray(memories) ? memories : []
  const roleMem =
    list.find((m) => String(m.label || '').toLowerCase() === 'preferred_role') ||
    list.find((m) => String(m.kind) === 'main' && detectRoleInText(m.value || ''))

  if (roleMem) {
    const detected = detectRoleInText(roleMem.value) || detectRoleInText(roleMem.label)
    if (detected) return { ...detected, source: 'memory' }
    const byId = PORO_ROLES.find((r) => r.id === normalizeRoleText(roleMem.value))
    if (byId) return { id: byId.id, label: byId.label, source: 'memory' }
  }

  if (fallback?.id) {
    return {
      id: fallback.id,
      label: fallback.label || PORO_ROLES.find((r) => r.id === fallback.id)?.label || fallback.id,
      source: 'player',
    }
  }

  return { id: 'mid', label: 'Mid', source: 'default' }
}
