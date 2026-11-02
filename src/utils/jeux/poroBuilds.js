/**
 * Suggestions de builds Poro (heuristiques Data Dragon, pas un scrape méta).
 */

import { markChamp, markItem, markRole } from './poroMarkup.js'
import { resolvePoroItemNames } from '../../services/jeux/lolPoroData.js'

/**
 * Cores par archétype × poste (ids Data Dragon SR, patch courant).
 */
const ARCHETYPE_BUILDS = {
  mage_mid: {
    start: [1056],
    boots: [3020],
    core: [6655, 4645, 3089],
    lux: [3137, 3157, 3165],
  },
  mage_adc: {
    start: [1056],
    boots: [3020],
    core: [6653, 3116, 3089],
    lux: [4629, 3165, 3137],
  },
  mage_support: {
    start: [3865],
    boots: [3020],
    core: [4005, 3116, 2065],
    lux: [3107, 3222],
  },
  assassin_mid: {
    start: [1055],
    boots: [3047],
    core: [6692, 6694, 6698],
    lux: [3142, 6697, 3814],
  },
  marksman_adc: {
    start: [1055],
    boots: [3006],
    core: [6672, 3031, 3072],
    lux: [3036, 3033, 3046],
  },
  fighter_top: {
    start: [1055],
    boots: [3047],
    core: [6610, 3071, 6333],
    lux: [3053, 3742, 3078],
  },
  fighter_jungle: {
    start: [1103],
    boots: [3047],
    core: [6610, 3071, 6333],
    lux: [3748, 3053],
  },
  tank_top: {
    start: [1054],
    boots: [3047],
    core: [3068, 3075, 3084],
    lux: [3143, 4401, 6665],
  },
  tank_jungle: {
    start: [1103],
    boots: [3111],
    core: [3068, 3075, 3083],
    lux: [3143, 4401, 6665],
  },
  tank_support: {
    start: [3865],
    boots: [3111],
    core: [3190, 3068, 3107],
    lux: [3222, 3075],
  },
  support_enchanter: {
    start: [3865],
    boots: [3158],
    core: [6617, 3504, 3107],
    lux: [3222, 2065],
  },
  ap_fighter: {
    start: [1056],
    boots: [3020],
    core: [4633, 3115, 3152],
    lux: [3135, 3165, 3089],
  },
}

const SITUATIONAL_BY_TAG = {
  tank: [3036, 3135, 3071, 4633, 3302],
  heal: [3165, 6609, 3075, 8010, 3033],
  assassin: [3157, 3026, 3102, 3053],
  poke: [3111, 3065, 3143],
  cc: [3111, 3139, 3222],
  adc: [3143, 3047, 3068],
  ap: [3065, 3102, 4401, 2504],
  ad: [3075, 3143, 3047],
}

/**
 * @param {string[]} champTags
 * @param {string} roleId
 */
export function pickArchetypeKey(champTags, roleId) {
  const tags = new Set((champTags || []).map(String))
  const role = roleId || 'mid'

  if (role === 'adc' || (tags.has('Marksman') && role !== 'mid' && role !== 'top')) {
    if (tags.has('Mage') && !tags.has('Marksman')) return 'mage_adc'
    return 'marksman_adc'
  }
  if (role === 'support') {
    if (tags.has('Tank') || tags.has('Fighter')) return 'tank_support'
    if (tags.has('Mage') && !tags.has('Support')) return 'mage_support'
    return 'support_enchanter'
  }
  if (role === 'jungle') {
    if (tags.has('Tank')) return 'tank_jungle'
    if (tags.has('Mage')) return 'ap_fighter'
    return 'fighter_jungle'
  }
  if (role === 'top') {
    if (tags.has('Tank') && !tags.has('Mage')) return 'tank_top'
    if (tags.has('Mage')) return 'ap_fighter'
    return 'fighter_top'
  }
  if (tags.has('Assassin') && !tags.has('Mage')) return 'assassin_mid'
  if (tags.has('Fighter') && tags.has('Mage')) return 'ap_fighter'
  if (tags.has('Marksman')) return 'marksman_adc'
  return 'mage_mid'
}

/**
 * @param {number[]} ids
 * @param {Map<number, { name: string }> | null} itemsById
 */
function resolveExisting(ids, itemsById) {
  if (!itemsById?.size) {
    return (ids || []).map((id) => ({ id, name: `Item #${id}` }))
  }
  return resolvePoroItemNames(ids, itemsById)
}

/**
 * Calcule un build ordonné (ids) pour un champion / rôle / compo.
 * @param {object} opts
 * @param {{ name: string, tags?: string[] }} opts.champion
 * @param {{ id: string, label: string }} opts.role
 * @param {{ name: string, tags?: string[] } | null} [opts.enemy]
 * @param {string[]} [opts.enemyStyleTags]
 * @param {string[]} [opts.enemyNames]
 */
export function planChampionBuild(opts) {
  const { champion, role, enemy = null } = opts
  const styleTags = opts.enemyStyleTags || []
  const enemyNames = (opts.enemyNames || []).join(' ')
  const enemyNameBlob = `${enemy?.name || ''} ${enemyNames}`

  const archKey = pickArchetypeKey(champion.tags || [], role.id)
  const template = ARCHETYPE_BUILDS[archKey] || ARCHETYPE_BUILDS.mage_mid

  /** @type {number[]} */
  const situIds = []
  const enemyTags = new Set([...(enemy?.tags || []).map(String), ...styleTags])
  // Tags Data Dragon bruts aussi (Tank, Assassin…)
  for (const t of styleTags) {
    const x = String(t)
    if (/^tank$/i.test(x)) enemyTags.add('Tank')
    if (/^assassin$/i.test(x)) enemyTags.add('Assassin')
    if (/^(adc|marksman)$/i.test(x)) enemyTags.add('Marksman')
    if (/^(ap|mage)$/i.test(x)) enemyTags.add('Mage')
    if (/^(ad|fighter)$/i.test(x)) enemyTags.add('Fighter')
  }

  if (enemyTags.has('Tank') || styleTags.includes('tank')) situIds.push(...SITUATIONAL_BY_TAG.tank)
  if (
    enemyTags.has('Support') ||
    styleTags.includes('heal') ||
    /soraka|sona|yuumi|nami|mundo|aatrox|warwick|sylas|vlad/i.test(enemyNameBlob)
  ) {
    situIds.push(...SITUATIONAL_BY_TAG.heal)
  }
  if (enemyTags.has('Assassin') || styleTags.includes('assassin')) {
    situIds.push(...SITUATIONAL_BY_TAG.assassin)
  }
  if (enemyTags.has('Marksman') || styleTags.includes('adc')) {
    situIds.push(...SITUATIONAL_BY_TAG.adc)
  }
  if (enemyTags.has('Mage') || styleTags.includes('ap')) {
    situIds.push(...SITUATIONAL_BY_TAG.ap)
  }
  if (styleTags.includes('cc')) situIds.push(...SITUATIONAL_BY_TAG.cc)
  if (styleTags.includes('poke')) situIds.push(...SITUATIONAL_BY_TAG.poke)
  if (enemyTags.has('Fighter') || styleTags.includes('ad')) situIds.push(...SITUATIONAL_BY_TAG.ad)

  const used = new Set([...template.start, ...template.boots, ...template.core])
  const situUnique = [...new Set(situIds)].filter((id) => !used.has(id)).slice(0, 3)
  // Injecte 1–2 situationnels dans le « core étendu » pour une seule liste lisible
  const extendedCore = [...template.core, ...situUnique.slice(0, 2)]
  const lux = template.lux.filter((id) => !extendedCore.includes(id) && !situUnique.includes(id))

  return {
    archKey,
    start: template.start,
    boots: template.boots,
    core: extendedCore,
    lux: lux.slice(0, 3),
    situ: situUnique,
  }
}

/**
 * @param {object} opts
 * @param {{ name: string, tags?: string[], id?: string, key?: number }} opts.champion
 * @param {{ id: string, label: string }} opts.role
 * @param {{ name: string, tags?: string[] } | null} [opts.enemy]
 * @param {string[]} [opts.enemyStyleTags]
 * @param {string[]} [opts.enemyNames]
 * @param {number[]} [opts.ownedItemIds] items déjà achetés (match)
 * @param {Map<number, object>} [opts.itemsById]
 * @param {string} [opts.patch]
 * @param {boolean} [opts.compact] une seule liste numérotée
 */
export function buildChampionBuildReply(opts) {
  const {
    champion,
    role,
    enemy = null,
    itemsById = null,
    patch = '',
    ownedItemIds = [],
    compact = false,
  } = opts
  const styleTags = opts.enemyStyleTags || []
  const plan = planChampionBuild(opts)
  const owned = new Set((ownedItemIds || []).map(Number).filter((id) => id > 0))

  const fmt = (ids) => {
    const resolved = resolveExisting(ids, itemsById)
    return resolved.map((it, i) => {
      const had = owned.has(Number(it.id))
      return `${i + 1}. ${markItem(it.name, it.id)}${had ? ' _(tu l’avais)_' : ''}`
    })
  }

  const patchLine = patch ? `_Patch Data Dragon : **${patch}**_\n\n` : ''
  const vsLine = enemy
    ? ` vs ${markChamp(enemy.name)}`
    : styleTags.length
      ? ` · adapté à la compo (${styleTags.join(', ')})`
      : ''

  if (compact) {
    const fullOrder = [...plan.start, ...plan.boots, ...plan.core, ...plan.lux].filter(
      (id, idx, arr) => arr.indexOf(id) === idx,
    )
    return (
      `${patchLine}` +
      `## Build conseillé · ${markChamp(champion.name)} ${markRole(role.label)}${vsLine}\n` +
      `_Pour **ton** champion + cette compo (heuristique Poro, pas un scrape méta)._\n\n` +
      fmt(fullOrder).join('\n') +
      `\n\n_Priorise le haut de liste ; les items déjà notés « tu l’avais » étaient cohérents._`
    )
  }

  return (
    `${patchLine}` +
    `## Build ${markChamp(champion.name)} ${markRole(role.label)}${vsLine}\n` +
    `_Archétype : **${plan.archKey.replace(/_/g, ' ')}** · pistes heuristiques (pas un scrape u.gg)._\n\n` +
    `### Ordre conseillé\n` +
    `**1 · Départ**\n${fmt(plan.start).join('\n') || '• —'}\n\n` +
    `**2 · Bottes**\n${fmt(plan.boots).join('\n') || '• —'}\n\n` +
    `**3 · Core (ordre typique)**\n${fmt(plan.core).join('\n') || '• —'}\n\n` +
    `**4 · Compléments / luxe**\n${fmt(plan.lux).join('\n') || '• —'}\n` +
    (plan.situ.length
      ? `\n### Situationnel compo\n${fmt(plan.situ).join('\n')}\n`
      : '') +
    `\n_Adapte selon gold, feed et timing. Un item absent du patch est omis._`
  )
}
