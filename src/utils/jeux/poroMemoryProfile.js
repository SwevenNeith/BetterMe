/**
 * Mémoire Poro enrichie : poste, mains, style, objectif.
 */

import { detectRoleInText, normalizeRoleText, PORO_ROLES } from './poroRoles.js'
import { findChampionsInCatalog } from '../../services/jeux/lolPoroData.js'

/** @typedef {{ kind?: string, label?: string, value?: string }} PoroMemory */

export const MEMORY_KIND_LABELS = {
  preferred_role: 'Poste',
  mains: 'Mains',
  playstyle: 'Style',
  goal: 'Objectif',
  preference: 'Préférence',
  avoid: 'À éviter',
  rank: 'Rang',
  main: 'Main',
  note: 'Note',
}

/**
 * @param {string} text
 */
export function normalizeMemoryText(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * @param {string} raw
 * @returns {'safe'|'aggro'|'balanced'|null}
 */
export function detectPlaystyle(raw) {
  const n = normalizeMemoryText(raw)
  if (!n) return null
  if (
    /\b(safe|safeline|scale|scaling|passif|passive|farm|patient|defensif|défensif)\b/.test(n)
  ) {
    return 'safe'
  }
  if (
    /\b(aggro|agressif|agressive|aggressif|aggressive|all[- ]?in|roam|proactif|proactive|fight)\b/.test(
      n,
    )
  ) {
    return 'aggro'
  }
  if (/\b(equilibre|équilibré|equilibre|balanced|flexible|adaptatif)\b/.test(n)) {
    return 'balanced'
  }
  return null
}

/**
 * @param {string} raw
 * @returns {string | null} libellé objectif court
 */
export function detectGoal(raw) {
  const n = normalizeMemoryText(raw)
  if (!n) return null

  const learn = n.match(
    /\b(?:apprendre|apprendre a jouer|apprendre a|focus|one[- ]?trick|otp)\s+([a-z0-9 ']+?)(?:\s|$|,|\.|!)/i,
  )
  if (learn?.[1] && !/^(le|la|les|un|une|du|de|des)$/.test(learn[1].trim())) {
    const champ = learn[1].trim().replace(/\b(en|au|sur)\b.*$/, '').trim()
    if (champ.length >= 2) return `Apprendre ${champ}`
  }
  if (/\b(apprendre|one[- ]?trick|otp|masteriser|maitriser)\b/.test(n)) {
    return 'Apprendre un champion'
  }
  if (
    /\b(grind|grinder|climb|climber|lp|elo|rank up|monter|progresser|ranked|serie de wins)\b/.test(
      n,
    )
  ) {
    return 'Grind LP'
  }
  if (/\b(fun|plaisir|detente|détente|casual|norms|normale)\b/.test(n)) {
    return 'Jouer pour le fun'
  }
  if (/\b(stagne|stagner|debloquer|débloquer|tilt|remonter)\b/.test(n)) {
    return 'Débloquer / remonter'
  }
  return null
}

/**
 * @param {'safe'|'aggro'|'balanced'} style
 */
export function playstyleLabel(style) {
  if (style === 'safe') return 'Safe / scale'
  if (style === 'aggro') return 'Aggro / proactif'
  if (style === 'balanced') return 'Équilibré'
  return String(style || '')
}

/**
 * Profil structuré depuis les mémoires persistées.
 * @param {PoroMemory[]} memories
 * @param {object[]} [champions] catalogue DDragon (optionnel, pour normaliser les mains)
 */
export function getPoroMemoryProfile(memories = [], champions = []) {
  const list = Array.isArray(memories) ? memories : []
  const byLabel = (label) =>
    list.find((m) => String(m.label || '').toLowerCase() === label) || null

  const roleMem = byLabel('preferred_role')
  let role = null
  if (roleMem?.value) {
    role =
      detectRoleInText(roleMem.value) ||
      PORO_ROLES.find((r) => r.id === normalizeRoleText(roleMem.value)) ||
      null
    if (role && !role.label) {
      const hit = PORO_ROLES.find((r) => r.id === role.id)
      role = hit ? { id: hit.id, label: hit.label } : role
    }
  }

  const styleMem = byLabel('playstyle')
  const playstyle =
    detectPlaystyle(styleMem?.value || '') ||
    (styleMem?.value && ['safe', 'aggro', 'balanced'].includes(normalizeMemoryText(styleMem.value))
      ? /** @type {'safe'|'aggro'|'balanced'} */ (normalizeMemoryText(styleMem.value))
      : null)

  const goalMem = byLabel('goal')
  const goal = goalMem?.value?.trim() || detectGoal(goalMem?.value || '') || null

  const mainsMem = byLabel('mains') || byLabel('main')
  /** @type {string[]} */
  let mains = []
  if (mainsMem?.value) {
    if (champions?.length) {
      mains = findChampionsInCatalog(mainsMem.value, champions).map((c) => c.name)
    }
    if (!mains.length) {
      mains = String(mainsMem.value)
        .split(/[,;/|]+|\bet\b/i)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2)
        .slice(0, 5)
    }
  }

  return {
    role,
    playstyle,
    playstyleLabel: playstyle ? playstyleLabel(playstyle) : null,
    goal,
    mains,
    avoid: byLabel('avoid')?.value || null,
    preference: byLabel('preference')?.value || null,
    raw: list,
  }
}

/**
 * Parse « souviens-toi que… » → une ou plusieurs mémoires.
 * @param {string} raw
 * @param {object[]} [champions]
 */
export function parseRememberIntent(raw, champions = []) {
  const text = String(raw ?? '').trim()
  const n = normalizeMemoryText(text)
  const rememberMatch = n.match(
    /(?:souviens[ -]?toi|reteniens|retenir|remember)\s+(?:que\s+)?(.+)$/i,
  )
  if (!rememberMatch) return null

  const value = text
    .replace(/^.*?(?:souviens[ -]?toi|reteniens|retenir|remember)\s+(?:que\s+)?/i, '')
    .trim()
  if (!value) return null

  const nv = normalizeMemoryText(value)
  /** @type {{ kind: string, label: string, value: string }[]} */
  const memories = []

  const role = detectRoleInText(value) || detectRoleInText(text)
  if (role && (/\b(joue|main|poste|role|lane|prefere)\b/i.test(nv) || /\bmain\b/i.test(nv))) {
    memories.push({
      kind: 'preference',
      label: 'preferred_role',
      value: role.id,
    })
  }

  const style = detectPlaystyle(value)
  if (style) {
    memories.push({
      kind: 'playstyle',
      label: 'playstyle',
      value: style,
    })
  }

  const goal = detectGoal(value)
  if (goal) {
    memories.push({
      kind: 'goal',
      label: 'goal',
      value: goal.slice(0, 200),
    })
  }

  const champHits = champions?.length ? findChampionsInCatalog(value, champions) : []
  if (
    champHits.length &&
    (/\b(main|mains|otp|one[- ]?trick|joue (?:surtout|souvent)|pool)\b/i.test(nv) ||
      /\bje main\b/i.test(nv))
  ) {
    memories.push({
      kind: 'mains',
      label: 'mains',
      value: champHits
        .slice(0, 5)
        .map((c) => c.name)
        .join(', '),
    })
  } else if (/\bmain\b/i.test(nv) && !champHits.length) {
    memories.push({
      kind: 'main',
      label: 'main',
      value: value.slice(0, 500),
    })
  }

  if (/\b(evite|hate|deteste|avoid)\b/i.test(nv)) {
    memories.push({
      kind: 'avoid',
      label: 'avoid',
      value: value.slice(0, 500),
    })
  }

  if (
    /\b(gold|plat|diamond|iron|bronze|silver|emeraude|master|challenger|rank)\b/i.test(nv)
  ) {
    memories.push({
      kind: 'rank',
      label: 'rank',
      value: value.slice(0, 500),
    })
  }

  // Fallback : au moins une note si rien de structuré
  if (!memories.length) {
    let kind = 'note'
    let label = `note_${Date.now().toString(36)}`
    if (/\b(prefere|prefer|j aime|jaime|like)\b/i.test(nv)) {
      kind = 'preference'
      label = 'preference'
    }
    memories.push({ kind, label, value: value.slice(0, 500) })
  } else if (
    !memories.some((m) => m.label === 'preference') &&
    /\b(prefere|prefer|j aime|jaime)\b/i.test(nv) &&
    !style &&
    !goal
  ) {
    memories.push({
      kind: 'preference',
      label: 'preference',
      value: value.slice(0, 500),
    })
  }

  return { primary: memories[0], extras: memories.slice(1), memories }
}

/**
 * @param {PoroMemory[]} memories
 * @param {object[]} [champions]
 */
export function formatPoroMemories(memories, champions = []) {
  const list = Array.isArray(memories) ? memories : []
  if (!list.length) {
    return (
      'Pour l’instant je n’ai rien mémorisé sur toi.\n' +
      'Ex. : « souviens-toi que je joue mid agressif pour grind LP »\n' +
      'ou « souviens-toi que je main Orianna Ahri ».'
    )
  }

  const profile = getPoroMemoryProfile(list, champions)
  /** @type {string[]} */
  const lines = []
  if (profile.role) lines.push(`• **Poste** : ${profile.role.label}`)
  if (profile.mains.length) lines.push(`• **Mains** : ${profile.mains.join(', ')}`)
  if (profile.playstyleLabel) lines.push(`• **Style** : ${profile.playstyleLabel}`)
  if (profile.goal) lines.push(`• **Objectif** : ${profile.goal}`)
  if (profile.avoid) lines.push(`• **À éviter** : ${profile.avoid}`)

  const used = new Set(['preferred_role', 'mains', 'main', 'playstyle', 'goal', 'avoid'])
  for (const m of list) {
    const lab = String(m.label || '').toLowerCase()
    if (used.has(lab)) continue
    const title = MEMORY_KIND_LABELS[lab] || MEMORY_KIND_LABELS[m.kind] || m.label
    lines.push(`• **${title}** : ${m.value}`)
  }

  return `Voici ce que je retiens :\n${lines.join('\n')}`
}

/**
 * @param {PoroMemory[]} memories
 * @param {object[]} [champions]
 */
export function memoryContextBlurb(memories, champions = []) {
  const profile = getPoroMemoryProfile(memories, champions)
  /** @type {string[]} */
  const bits = []
  if (profile.role) bits.push(`poste ${profile.role.label}`)
  if (profile.mains.length) bits.push(`mains ${profile.mains.slice(0, 3).join('/')}`)
  if (profile.playstyleLabel) bits.push(profile.playstyleLabel)
  if (profile.goal) bits.push(profile.goal)
  if (!bits.length) {
    const list = Array.isArray(memories) ? memories.slice(0, 4) : []
    if (!list.length) return ''
    return `\n\n_Aussi d’après ta mémoire Poro : ${list.map((m) => m.value).join(' · ')}_`
  }
  return `\n\n_Mémoire Poro : ${bits.join(' · ')}_`
}

/**
 * Pistes courtes pour draft / debrief.
 * @param {ReturnType<typeof getPoroMemoryProfile>} profile
 */
export function memoryCoachingHints(profile) {
  /** @type {string[]} */
  const tips = []
  if (!profile) return tips
  if (profile.playstyle === 'safe') {
    tips.push('Style safe mémorisé : privilégie farm / scale, évite les fights dry avant spike.')
  } else if (profile.playstyle === 'aggro') {
    tips.push('Style aggro mémorisé : cherche les fenêtres de pression / roam, pas le farm passif seul.')
  }
  if (profile.goal && /grind|lp/i.test(profile.goal)) {
    tips.push('Objectif grind LP : reste sur 1–2 mains confort, pas d’expé ranked tilt.')
  } else if (profile.goal && /apprendre/i.test(profile.goal)) {
    tips.push(`Objectif apprentissage : accepte les games « labo », focus 1–2 axes (farm / deaths).`)
  } else if (profile.goal && /fun/i.test(profile.goal)) {
    tips.push('Objectif fun : choisis un pick qui te plaît, la perf LP passe après.')
  }
  if (profile.mains.length) {
    tips.push(`Mains retenues : ${profile.mains.slice(0, 3).join(', ')}.`)
  }
  return tips.slice(0, 3)
}
