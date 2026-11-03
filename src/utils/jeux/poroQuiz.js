/**
 * Quiz Poro : généraux (items / macro) + liés à la partie ouverte.
 */

import { PORO_ITEM_ADVICE_BY_TAG, PORO_QUIZ_BANK } from '../../constants/jeux/poroKnowledge.js'
import { markChamp, markChipRow, markItem, markRole } from './poroMarkup.js'
import { inferEnemyStyleTags } from './poroMatchAdvice.js'

/** Items typiquement AD / lethality — à éviter sur un mage AP. */
const QUIZ_AD_LEAN_ITEMS = new Set([
  3139, 6035, 3036, 3153, 3071, 6609, 3033, 3075, 3047, 3143, 3742, 3053, 3026, 3814, 3072, 3031,
])
/** Items typiquement AP. */
const QUIZ_AP_LEAN_ITEMS = new Set([
  3135, 4633, 3165, 3157, 3102, 3065, 4401, 3152, 3089, 6655, 4645, 3116, 4629, 8010, 3140,
])
/** Items support / enchanteur. */
const QUIZ_SUPPORT_LEAN_ITEMS = new Set([3222, 3107, 6617, 3504, 2065, 3190, 4005])

/**
 * Profil dégâts / rôle pour filtrer les exemples d’items du quiz.
 * @param {{ tags?: string[], role?: string } | null | undefined} me
 * @returns {'ap'|'ad'|'support'|'tank'}
 */
export function quizChampProfile(me) {
  const tags = new Set((me?.tags || []).map(String))
  const role = String(me?.role || '').toLowerCase()
  if (role === 'support') {
    if (tags.has('Mage') && !tags.has('Tank') && !tags.has('Fighter')) return 'ap'
    if (tags.has('Marksman')) return 'ad'
    if (tags.has('Tank') || tags.has('Fighter')) return 'tank'
    return 'support'
  }
  if (tags.has('Tank') && !tags.has('Mage') && !tags.has('Marksman')) return 'tank'
  if (tags.has('Mage') && !tags.has('Marksman')) return 'ap'
  if (tags.has('Marksman') || (tags.has('Assassin') && !tags.has('Mage'))) return 'ad'
  if (tags.has('Fighter') && tags.has('Mage')) return 'ap'
  if (tags.has('Fighter') || tags.has('Assassin')) return 'ad'
  return 'ap'
}

/**
 * @param {number} id
 * @param {'ap'|'ad'|'support'|'tank'} profile
 */
function quizItemFitsProfile(id, profile) {
  const n = Number(id)
  if (profile === 'ap') {
    if (QUIZ_AD_LEAN_ITEMS.has(n) && !QUIZ_AP_LEAN_ITEMS.has(n)) return false
    if (QUIZ_SUPPORT_LEAN_ITEMS.has(n) && n !== 3222) return false
    return true
  }
  if (profile === 'ad') {
    if (QUIZ_AP_LEAN_ITEMS.has(n) && !QUIZ_AD_LEAN_ITEMS.has(n) && n !== 3111 && n !== 3140) {
      return false
    }
    if (QUIZ_SUPPORT_LEAN_ITEMS.has(n)) return false
    return true
  }
  if (profile === 'support') {
    return (
      QUIZ_SUPPORT_LEAN_ITEMS.has(n) ||
      n === 3111 ||
      n === 3140 ||
      n === 3165 ||
      n === 3102 ||
      n === 3065
    )
  }
  // tank : résistances / boots / anti-heal tanky OK ; skip crit carry
  if (QUIZ_AD_LEAN_ITEMS.has(n) && [3036, 3153, 3072, 3031].includes(n)) return false
  return true
}

/**
 * Exemples d’items qui illustrent la bonne réponse, filtrés pour le champion.
 * @param {string} tag
 * @param {{ tags?: string[], role?: string, championName?: string } | null} me
 * @param {Map<number, { name?: string }>|null} [itemsById]
 * @param {number} [limit]
 * @returns {{ id: number, name: string }[]}
 */
export function pickQuizExampleItems(tag, me, itemsById = null, limit = 3) {
  const advice = PORO_ITEM_ADVICE_BY_TAG[tag]
  if (!advice?.itemIds?.length) return []
  const profile = quizChampProfile(me)
  const ordered = [
    ...advice.itemIds.filter((id) => quizItemFitsProfile(id, profile)),
    ...advice.itemIds.filter((id) => !quizItemFitsProfile(id, profile)),
  ]
  /** @type {{ id: number, name: string }[]} */
  const out = []
  const seen = new Set()
  for (const rawId of ordered) {
    const id = Number(rawId)
    if (!id || seen.has(id)) continue
    if (!quizItemFitsProfile(id, profile) && out.length > 0) continue
    const name = itemsById?.get(id)?.name
    if (!name && itemsById?.size) continue
    out.push({ id, name: name || advice.title || `Item #${id}` })
    seen.add(id)
    if (out.length >= limit) break
  }
  return out
}

/**
 * @param {{ id: number, name: string }[]} examples
 * @param {string} [champName]
 */
function formatQuizExampleItemsLine(examples, champName = '') {
  if (!examples.length) return ''
  const label = champName
    ? `**Exemples adaptés à ${champName}**`
    : '**Exemples d’items**'
  return (
    `\n\n${label}\n` +
    markChipRow(examples.map((it) => markItem(it.name, it.id)))
  )
}

/** Quiz « que fait cet item » (ids DDragon stables). */
export const PORO_ITEM_FACT_QUIZ = [
  {
    id: 'item_zhonya',
    itemId: 3157,
    question: 'À quoi sert surtout le **Sablier de Zhonya** ?',
    choices: [
      'Stase : invulnérable brièvement (mais tu ne peux pas agir)',
      'Full heal sur kill',
      'Double ton mana',
      'Téléportation globale',
    ],
    answerIndex: 0,
    explain:
      'Zhonya = stase ~2,5 s : tu ignores les dégâts, mais tu es figé. Timing vs assassins / ultis.',
    tags: ['items', 'survivability'],
  },
  {
    id: 'item_morello',
    itemId: 3165,
    question: 'Que apporte principalement **Morellonomicon** en fight ?',
    choices: [
      'Anti-heal (Grievous Wounds) + AP',
      'Uniquement armure',
      'Uniquement mana illimité',
      'Invisibilité permanente',
    ],
    answerIndex: 0,
    explain:
      'Morello applique l’anti-heal : crucial vs sustain (Soraka, Aatrox, Vlad, WW…).',
    tags: ['items', 'heal'],
  },
  {
    id: 'item_ga',
    itemId: 3026,
    question: 'Que fait l’**Ange gardien** quand tu « meurs » ?',
    choices: [
      'Tu ressuscites une fois (avec un CD long)',
      'Tu gagnes +500 MS pour toujours',
      'Tes alliés sont soignés à 100 %',
      'Rien, c’est cosmétique',
    ],
    answerIndex: 0,
    explain: 'GA te redonne une 2ᵉ vie après un délai — très fort vs burst / assassins.',
    tags: ['items', 'survivability'],
  },
  {
    id: 'item_qss',
    itemId: 3140,
    question: 'Le **Quicksilver Sash (QSS)** / Mercurial sert surtout à…',
    choices: [
      'Purger des CC / effets néfastes (charm, suppress…)',
      'Augmenter uniquement le crit',
      'Farm les sbires plus vite',
      'Révéler toute la map',
    ],
    answerIndex: 0,
    explain: 'QSS / Mercurial = cleanse actif. Sauve vs Malz R, Skarner, WW, etc.',
    tags: ['items', 'cc'],
  },
  {
    id: 'item_ldr',
    itemId: 3036,
    question: '**Salutations de Lord Dominik** (LDR) est surtout utile pour…',
    choices: [
      'Pénétration d’armure vs tanks / frontline tanky',
      'Contre les full AP only',
      'Remplacer Flash',
      'Heal ton équipe',
    ],
    answerIndex: 0,
    explain: 'LDR = pénétration d’armure : le carry AD DPS mieux les tanks.',
    tags: ['items', 'tank'],
  },
  {
    id: 'item_void',
    itemId: 3135,
    question: 'Le **Bâton du Vide** (Void Staff) sert à…',
    choices: [
      'Pénétration magique % vs stacks MR',
      'Uniquement AD crit',
      'Tanker les tours',
      'Donner vision permanente',
    ],
    answerIndex: 0,
    explain: 'Void Staff = magic pen % : indispensable quand l’équipe adverse stack la MR.',
    tags: ['items', 'tank', 'ap'],
  },
  {
    id: 'item_tabi',
    itemId: 3047,
    question: 'Les **Tabis** (chaussures à pointes d’acier) réduisent surtout…',
    choices: [
      'Les dégâts des auto-attaques (AD)',
      'Les dégâts magiques uniquement',
      'Le coût en mana',
      'Le CD de Flash',
    ],
    answerIndex: 0,
    explain: 'Tabis = armure + réduction des AA. Fort vs AD / crit / bruisers auto-based.',
    tags: ['items', 'ad'],
  },
  {
    id: 'item_mercurial_boots',
    itemId: 3111,
    question: 'Les **Mercure** (bottes) apportent surtout…',
    choices: [
      'Tenacity (résistance aux CC) + MR',
      'Crit chance',
      'Omnivamp illimité',
      'Double Relic Shield',
    ],
    answerIndex: 0,
    explain: 'Mercure = tenacity + MR : standard vs CC / poke magique.',
    tags: ['items', 'cc'],
  },
]

/**
 * @param {number} [seed]
 */
function seededIndex(seed, len) {
  if (!len) return 0
  return Math.abs(Number(seed) || Date.now()) % len
}

/**
 * Mélange déterministe léger.
 * @template T
 * @param {T[]} arr
 * @param {number} seed
 */
function shuffleSeeded(arr, seed) {
  const a = [...arr]
  let s = Math.abs(Number(seed) || 1) || 1
  for (let i = a.length - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const j = s % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * @param {object} fact
 * @param {Map<number, { name?: string }>|null} [itemsById]
 */
function enrichItemFactQuestion(fact, itemsById = null) {
  const name = itemsById?.get(fact.itemId)?.name
  const q = name
    ? fact.question.replace(/\*\*[^*]+\*\*/, `**${name}**`)
    : fact.question
  return {
    ...fact,
    kind: 'item_fact',
    question: q,
  }
}

/**
 * Quiz lié à la partie : priorité item vs compo adverse.
 * @param {object} snap
 * @param {Map<number, object>|null} [itemsById]
 * @param {number} [seed]
 */
/**
 * Tags style pour quiz match — fallback lane mage/assassin si infer vide.
 * @param {object} snap
 */
function styleTagsForMatchQuiz(snap) {
  let styleTags = inferEnemyStyleTags(snap).filter((t) => PORO_ITEM_ADVICE_BY_TAG[t])
  if (styleTags.length) return styleTags
  const laneTags = new Set((snap.laneOpponent?.tags || []).map(String))
  if (laneTags.has('Mage')) styleTags.push('ap')
  if (laneTags.has('Assassin')) styleTags.push('assassin')
  if (laneTags.has('Tank')) styleTags.push('tank')
  if (laneTags.has('Marksman')) styleTags.push('adc')
  if (laneTags.has('Fighter')) styleTags.push('ad')
  for (const t of snap.enemyTags || []) {
    const x = String(t)
    if (x === 'Mage' && !styleTags.includes('ap')) styleTags.push('ap')
    if (x === 'Assassin' && !styleTags.includes('assassin')) styleTags.push('assassin')
  }
  return styleTags.filter((t) => PORO_ITEM_ADVICE_BY_TAG[t])
}

export function buildMatchBuildQuiz(snap, itemsById = null, seed = Date.now()) {
  if (!snap?.me) return null
  const styleTags = styleTagsForMatchQuiz(snap)
  if (!styleTags.length) return null

  const tag = styleTags[seededIndex(seed, styleTags.length)]
  const advice = PORO_ITEM_ADVICE_BY_TAG[tag]
  if (!advice?.itemIds?.length) return null

  const profile = quizChampProfile(snap.me)
  const fittedIds = advice.itemIds.filter((id) => quizItemFitsProfile(id, profile))
  const pickFrom = fittedIds.length ? fittedIds : advice.itemIds
  const correctId = pickFrom[seededIndex(seed + 7, pickFrom.length)]
  const correctName =
    itemsById?.get(correctId)?.name ||
    advice.title ||
    `Item #${correctId}`

  /** distracteurs : autres tags (nom DDragon ou titre de catégorie) */
  const otherTags = Object.keys(PORO_ITEM_ADVICE_BY_TAG).filter((t) => t !== tag)
  const distractors = []
  for (const t of shuffleSeeded(otherTags, seed + 3)) {
    const a = PORO_ITEM_ADVICE_BY_TAG[t]
    const id = a?.itemIds?.[0]
    if (!id || id === correctId) continue
    const name = itemsById?.get(id)?.name || a.title
    if (!name || name === correctName) continue
    distractors.push(name)
    if (distractors.length >= 3) break
  }
  while (distractors.length < 3) {
    distractors.push(['Warmog', 'Zephyr', 'Doran’s Blade', 'Cull'][distractors.length])
  }

  const mixed = shuffleSeeded([correctName, ...distractors.slice(0, 3)], seed + 11)
  const answerIndex = mixed.indexOf(correctName)

  const examples = pickQuizExampleItems(tag, snap.me, itemsById, 3)
  // Assure que la bonne réponse figure dans les exemples affichés
  if (correctId && !examples.some((e) => e.id === Number(correctId))) {
    examples.unshift({ id: Number(correctId), name: correctName })
    if (examples.length > 3) examples.length = 3
  }
  const enemyBits = (snap.enemies || [])
    .slice(0, 5)
    .map((e) => markChamp(typeof e === 'string' ? e : e.name, e?.id || e?.championId))
    .join(' ')

  const explain =
    `Contre une compo plutôt **${tag}** (${advice.title.toLowerCase()}), ` +
    `viser ${markItem(correctName, correctId)} (ou équivalent : ${advice.focus}).\n` +
    `_${advice.tip}_` +
    formatQuizExampleItemsLine(examples, snap.me.championName)

  return {
    id: `match_build_${snap.matchId || 'x'}_${tag}`,
    kind: 'match_build',
    question:
      `**Quiz partie** · ${markChamp(snap.me.championName, snap.me.championId)} ${markRole(snap.me.role || '')}\n` +
      `Vs ${enemyBits || 'leur compo'} — **quel item collait le mieux** à leur menace ?`,
    choices: mixed,
    answerIndex: answerIndex >= 0 ? answerIndex : 0,
    explain,
    exampleItems: examples,
    tags: ['match', 'items', tag],
    matchId: snap.matchId || null,
  }
}

/**
 * Quiz « focus » vs compo (sans nommer un item précis).
 * @param {object} snap
 * @param {number} [seed]
 */
/**
 * @param {object} snap
 * @param {Map<number, object>|null} [itemsById]
 * @param {number} [seed]
 */
export function buildMatchFocusQuiz(snap, itemsById = null, seed = Date.now()) {
  if (!snap?.me) return null
  // Compat : ancien signature (snap, seed)
  if (typeof itemsById === 'number') {
    seed = itemsById
    itemsById = null
  }
  const styleTags = styleTagsForMatchQuiz(snap)
  if (!styleTags.length) return null
  const tag = styleTags[seededIndex(seed + 2, styleTags.length)]
  const advice = PORO_ITEM_ADVICE_BY_TAG[tag]
  if (!advice) return null

  const correct = advice.focus
  const wrong = shuffleSeeded(
    Object.entries(PORO_ITEM_ADVICE_BY_TAG)
      .filter(([t]) => t !== tag)
      .map(([, a]) => a.focus),
    seed,
  ).slice(0, 3)
  const choices = shuffleSeeded([correct, ...wrong], seed + 5)
  const answerIndex = choices.indexOf(correct)

  const examples = pickQuizExampleItems(tag, snap.me, itemsById, 3)

  return {
    id: `match_focus_${snap.matchId || 'x'}_${tag}`,
    kind: 'match_focus',
    question:
      `**Quiz partie** · ${markChamp(snap.me.championName, snap.me.championId)}\n` +
      `Leur compo penche **${tag}**. Quel **focus d’itemisation** était le plus pertinent ?`,
    choices,
    answerIndex: answerIndex >= 0 ? answerIndex : 0,
    explain:
      `Bonne lecture : **${advice.title}** — ${advice.focus}.\n_${advice.tip}_` +
      formatQuizExampleItemsLine(examples, snap.me.championName),
    exampleItems: examples,
    tags: ['match', tag],
    matchId: snap.matchId || null,
  }
}

/**
 * Fallback toujours dispo dès qu’un match est lié (poste réel du joueur).
 * @param {object} snap
 * @param {number} [seed]
 */
export function buildMatchRolePositionQuiz(snap, seed = Date.now()) {
  if (!snap?.me?.championName) return null
  const role = String(snap.me.role || 'Mid')
  const roleN = role.toLowerCase()
  const isCarryBackline =
    roleN === 'adc' ||
    roleN === 'mid' ||
    (snap.me.tags || []).includes('Mage') ||
    (snap.me.tags || []).includes('Marksman')

  const correct = isCarryBackline
    ? 'Backline / spacing derrière ta frontline'
    : roleN === 'jungle'
      ? 'Flanc / vision / objectifs, pas forcément le premier engage tête baissée'
      : roleN === 'support'
        ? 'Près de ton carry / peel-engage selon ton kit'
        : 'Frontline ou side contrôlé selon ton kit (pas AFK farm seul)'

  const wrong = shuffleSeeded(
    [
      'Premier engage en face à 1 HP',
      'Solo side adverse sans vision toute la game',
      'AFK sous Nexus jusqu’au 40 min',
      'Ignore toute la vision',
      'Vendre Flash pour un 7ᵉ item',
    ].filter((c) => c !== correct),
    seed,
  ).slice(0, 3)

  const choices = shuffleSeeded([correct, ...wrong], seed + 9)
  const answerIndex = choices.indexOf(correct)
  const lane = snap.laneOpponent?.championName
    ? markChamp(snap.laneOpponent.championName, snap.laneOpponent.championId)
    : null

  return {
    id: `match_pos_${snap.matchId || 'x'}`,
    kind: 'match_position',
    question:
      `**Quiz partie** · ${markChamp(snap.me.championName, snap.me.championId)} ${markRole(role)}` +
      (lane ? ` vs ${lane}` : '') +
      `\nEn mid/late de **cette** partie, où te placer / comment te positionner idéalement ?`,
    choices,
    answerIndex: answerIndex >= 0 ? answerIndex : 0,
    explain:
      `Tu jouais **${snap.me.championName}** en **${role}**` +
      (lane ? ` contre ${snap.laneOpponent.championName}` : '') +
      `. ${correct}.`,
    tags: ['match', 'macro', roleN],
    matchId: snap.matchId || null,
  }
}

/**
 * Pioche une question : **toujours** liée au match si une partie est ouverte
 * (sauf preferMatch: false). Sinon général / items.
 * @param {{
 *   seed?: number,
 *   matchSnapshot?: object|null,
 *   itemsById?: Map<number, object>|null,
 *   preferMatch?: boolean,
 * }} [opts]
 */
export function pickPoroQuizQuestion(opts = {}) {
  // Compat tests : pickPoroQuizQuestion(0)
  if (typeof opts === 'number') opts = { seed: opts, preferMatch: false }
  const seed = opts.seed ?? Date.now()
  const snap = opts.matchSnapshot || null
  const itemsById = opts.itemsById || null
  const preferMatch = opts.preferMatch !== false

  if (preferMatch && snap?.me) {
    /** @type {object[]} */
    const pool = []
    const m1 = buildMatchBuildQuiz(snap, itemsById, seed)
    const m2 = buildMatchFocusQuiz(snap, itemsById, seed + 17)
    const m3 = buildMatchRolePositionQuiz(snap, seed + 31)
    if (m1) pool.push(m1)
    if (m2) pool.push(m2)
    if (m3) pool.push(m3)
    if (pool.length) {
      return pool[seededIndex(seed + 1, pool.length)]
    }
  }

  const general = PORO_QUIZ_BANK.map((q) => ({ ...q, kind: q.kind || 'general' }))
  const items = PORO_ITEM_FACT_QUIZ.map((q) => enrichItemFactQuestion(q, itemsById))
  const all = [...general, ...items]
  if (!all.length) {
    return {
      id: 'fallback',
      kind: 'general',
      question: 'Contre beaucoup de soins adverses, que prioriser ?',
      choices: ['Anti-heal', 'Uniquement mana', 'Rien', 'Full lethality only'],
      answerIndex: 0,
      explain: 'Anti-heal (Grievous) coupe le sustain.',
      tags: ['items'],
    }
  }
  return all[seededIndex(seed, all.length)]
}

/**
 * @param {object} question
 */
export function formatQuizQuestion(question) {
  const title =
    question.kind === 'match_build' ||
    question.kind === 'match_focus' ||
    question.kind === 'match_position'
      ? 'Quiz Poro · partie'
      : question.kind === 'item_fact'
        ? 'Quiz Poro · item'
        : 'Quiz Poro'
  const choices = (question.choices || []).map((c, i) => `${i + 1}. ${c}`).join('\n')
  return (
    `**${title}**\n${question.question}\n\n${choices}\n\n` +
    `Réponds avec le **numéro** (1–${question.choices.length}) ou le texte du choix.`
  )
}

/**
 * @param {object} question
 * @param {string} userAnswer
 * @param {(text: string) => string} normalize
 */
export function gradePoroQuizAnswer(question, userAnswer, normalize) {
  const n = normalize(userAnswer)
  const asNum = Number.parseInt(n, 10)
  let correct = false
  const choices = question.choices || []
  if (Number.isFinite(asNum) && asNum >= 1 && asNum <= choices.length) {
    correct = asNum - 1 === question.answerIndex
  } else {
    const expected = normalize(choices[question.answerIndex] || '')
    correct = n === expected || expected.includes(n) || n.includes(expected)
  }
  return {
    correct,
    reply: correct
      ? `Exact !\n${question.explain}`
      : `Pas tout à fait. La bonne réponse était : **${choices[question.answerIndex]}**.\n${question.explain}`,
  }
}
