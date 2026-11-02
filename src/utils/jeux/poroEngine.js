/**
 * Moteur Poro : intents + réponses structurées (Data Dragon + historique, sans LLM payant).
 */

import {
  PORO_CHAMPION_GUIDES,
  PORO_HELP,
  PORO_ITEM_ADVICE_BY_TAG,
  PORO_QUIZ_BANK,
  PORO_TEAM_TAGS,
  PORO_WELCOME,
} from '../../constants/jeux/poroKnowledge.js'
import {
  findChampionInCatalog,
  findChampionsInCatalog,
  resolvePoroItemNames,
} from '../../services/jeux/lolPoroData.js'
import { buildChampionBuildReply } from './poroBuilds.js'
import { markChamp, markItem, markRole, markSpell } from './poroMarkup.js'
import {
  formatDraftPickReply,
  isDraftPickQuery,
} from './poroDraftPick.js'
import {
  formatPoolCoachReply,
  isPoolCoachQuery,
} from './poroCoach.js'
import {
  buildPoroMatchSnapshot,
  formatMatchAdviceReply,
  getConversationHints,
  isMatchAdviceQuery,
} from './poroMatchAdvice.js'
import {
  formatPoroMemories,
  memoryContextBlurb,
  parseRememberIntent,
  playstyleLabel,
} from './poroMemoryProfile.js'
import { detectRoleInText, PORO_ROLES, resolvePreferredRole } from './poroRoles.js'

export { formatPoroMemories, parseRememberIntent } from './poroMemoryProfile.js'
export { isPoolCoachQuery, formatPoolCoachReply } from './poroCoach.js'

/**
 * @typedef {{ kind: string, label: string, value: string }} PoroMemory
 * @typedef {{
 *   reply: string,
 *   meta?: object,
 *   memoriesToUpsert?: { kind: string, label: string, value: string }[],
 * }} PoroEngineResult
 */

/**
 * @param {string} text
 */
export function normalizePoroText(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, ' ')
    .replace(/[^a-z0-9+#\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * @param {string} raw
 * @returns {string[]}
 */
export function detectPoroTags(raw) {
  const n = normalizePoroText(raw)
  /** @type {string[]} */
  const found = []
  for (const tag of PORO_TEAM_TAGS) {
    if (tag.labels.some((label) => n.includes(normalizePoroText(label)))) {
      found.push(tag.id)
    }
  }
  return [...new Set(found)]
}

/**
 * @param {string} raw
 */
export function findPoroChampionGuide(raw) {
  const n = normalizePoroText(raw)
  for (const [key, guide] of Object.entries(PORO_CHAMPION_GUIDES)) {
    const names = [guide.name, ...(guide.aliases || [])].map(normalizePoroText)
    if (names.some((name) => name && (n.includes(name) || n === name))) {
      return { key, guide }
    }
  }
  return null
}

/**
 * Q / W / E / R / passif dans la question.
 * @param {string} raw
 * @returns {'Q'|'W'|'E'|'R'|'P'|null}
 */
export function detectSpellKey(raw) {
  const text = String(raw ?? '')
  const n = normalizePoroText(text)

  if (/\bpassif\b|\bpassive\b|\bpassiv\b/.test(n)) return 'P'

  const patterns = [
    /\b(?:le|la|l|du|de la|sort|ulti|ultimate|ult)\s*([qwer])\b/i,
    /\b([qwer])\s*(?:de|du|d)\b/i,
    /\b(?:sort|spell)\s+([qwer])\b/i,
    /(?:^|\s)([qwer])(?:\s|$)/i,
  ]
  for (const re of patterns) {
    const m = text.match(re) || n.match(re)
    if (m?.[1]) return m[1].toUpperCase()
  }

  if (/\bulti\b|\bultimate\b|\bult\b/.test(n)) return 'R'
  return null
}

/**
 * Build ciblé : « items/build sur X [rôle] contre Y »
 * @param {string} raw
 */
export function isChampionBuildQuery(raw) {
  const n = normalizePoroText(raw)
  const asksBuild =
    n.includes('build') ||
    n.includes('stuff') ||
    (n.includes('item') && (n.includes('sur ') || n.includes('pour ') || n.includes('avec ')))
  return asksBuild
}

/**
 * @param {string[]} tagIds
 * @param {Map<number, { name: string }> | null | undefined} itemsById
 * @param {string} [patch]
 */
export function buildItemAdviceReply(tagIds, itemsById = null, patch = '') {
  const tags = (tagIds ?? []).filter((id) => PORO_ITEM_ADVICE_BY_TAG[id])
  if (!tags.length) {
    return (
      'Dis-moi le **style** de l’équipe adverse pour te conseiller des items.\n' +
      'Ex. : « items contre tanks et heal », ou un build précis « build Veigar ADC vs MF ».\n' +
      `Tags connus : ${PORO_TEAM_TAGS.map((t) => t.id).join(', ')}.`
    )
  }

  const patchLine = patch ? `_Patch Data Dragon : **${patch}**_\n\n` : ''
  const blocks = tags.map((id) => {
    const a = PORO_ITEM_ADVICE_BY_TAG[id]
    const resolved = resolvePoroItemNames(a.itemIds, itemsById)
    const itemLines = resolved.length
      ? resolved.map((it) => `• ${markItem(it.name)}`).join('\n')
      : a.itemIds.map((itemId) => `• ${markItem(`Item #${itemId}`)}`).join('\n')
    return (
      `### ${a.title}\n` +
      `**Focus :** ${a.focus}\n\n` +
      `**Items à regarder :**\n${itemLines}\n\n` +
      `_${a.tip}_`
    )
  })

  return (
    `${patchLine}Voici des pistes d’items (noms officiels FR) — à adapter à ton champion / rôle :\n\n` +
    blocks.join('\n\n')
  )
}

/**
 * @param {string[]} tagIds
 * @param {'with'|'against'} mode
 */
export function buildPickAdviceReply(tagIds, mode) {
  const tags = tagIds ?? []
  if (!tags.length) {
    return (
      'Indique le style d’équipe pour un conseil de pick.\n' +
      'Ex. : « quel champion contre poke et assassins », « pick avec beaucoup de tanks ».'
    )
  }
  if (mode === 'with') {
    const tips = []
    if (tags.includes('tank')) tips.push('Avec des tanks : privilégie un carry qui scale derrière (ADC / mage DPS).')
    if (tags.includes('assassin')) tips.push('Avec des assassins : un engage / peel (support tank ou enchanter) aide à convertir.')
    if (tags.includes('poke')) tips.push('Avec du poke : un engage pour finir les cibles basses est très fort.')
    if (tags.includes('heal')) tips.push('Avec du heal : un frontline ou un second carry qui tient le fight long.')
    if (!tips.length) tips.push('Cherche la complémentarité : engage + DPS, ou poke + pick.')
    return `**Synergies** (styles alliés : ${tags.join(', ')}) :\n${tips.map((t) => `• ${t}`).join('\n')}`
  }
  const tips = []
  if (tags.includes('tank')) tips.push('Contre tanks : % HP / pénétration / DPS soutenu plutôt que burst sec.')
  if (tags.includes('assassin')) tips.push('Contre assassins : champions avec escape, peel, ou zhonya/GA naturel.')
  if (tags.includes('poke')) tips.push('Contre poke : all-in / engage ou sustain lane (pas de siège passif).')
  if (tags.includes('heal')) tips.push('Contre heal : accès facile à l’anti-heal + pression constante.')
  if (tags.includes('cc')) tips.push('Contre CC : mobilité, tenacity, ou range pour ne pas se faire chaîner.')
  if (!tips.length) tips.push('Identifie la win condition adverse (engage, poke, scale) et contre-pick en conséquence.')
  return `**Contre cette équipe** (styles : ${tags.join(', ')}) :\n${tips.map((t) => `• ${t}`).join('\n')}`
}

/**
 * @param {{ name: string, role: string, summary: string, early: string, mid: string, late: string, mistakes: string[] }} guide
 * @param {{ id: string, label: string } | null} [role]
 */
export function formatChampionGuide(guide, role = null) {
  const roleLine = role ? `\n**Poste ciblé :** ${markRole(role.label)}` : ''
  return (
    `## ${markChamp(guide.name)} (${guide.role})${roleLine}\n` +
    `${guide.summary}\n\n` +
    `**Early** — ${guide.early}\n` +
    `**Mid** — ${guide.mid}\n` +
    `**Late** — ${guide.late}\n\n` +
    `**Erreurs fréquentes**\n` +
    guide.mistakes.map((m) => `• ${m}`).join('\n')
  )
}

/**
 * @param {object} guide
 * @param {object | null} [manual]
 * @param {object | null} [playerRow]
 * @param {{ id: string, label: string, source?: string } | null} [role]
 */
export function formatDdragonGuide(guide, manual = null, playerRow = null, role = null) {
  if (!guide) return 'Guide introuvable pour ce champion.'
  const roles = (guide.tags || []).join(' · ') || '—'
  const roleNote = role
    ? `**Poste :** ${markRole(role.label)}` +
      (role.source === 'question'
        ? ' _(précisé)_'
        : role.source === 'memory'
          ? ' _(ta mémoire)_'
          : role.source === 'player'
            ? ' _(inféré de ton pool)_'
            : ' _(défaut)_')
    : ''

  const lines = [
    `## ${markChamp(guide.name)} — ${guide.title}`,
    `**Rôles Riot :** ${roles}`,
    roleNote,
    guide.patch ? `_Données Riot · patch **${guide.patch}**_` : '',
    '',
    guide.blurb || '',
  ]

  if (playerRow && playerRow.games > 0) {
    const wr =
      playerRow.winRate == null ? '—' : `${Math.round(Number(playerRow.winRate) * 10) / 10} %`
    lines.push(
      '',
      `**Sur ton compte :** ${playerRow.games} partie${playerRow.games > 1 ? 's' : ''} · WR ${wr}` +
        (playerRow.masteryLevel ? ` · maîtrise ${playerRow.masteryLevel}` : ''),
    )
  }

  if (role) {
    lines.push(
      '',
      `### Focus ${markRole(role.label)}`,
      roleTipsFor(guide, role.id),
    )
  }

  if (manual) {
    lines.push('', '### Repères BetterMe', formatChampionGuide(manual, role).replace(/^##.+\n/, ''))
  }

  if (guide.allytips?.length) {
    lines.push('', '### Conseils Riot (alliés)')
    for (const tip of guide.allytips.slice(0, 5)) lines.push(`• ${tip}`)
  }
  if (guide.enemytips?.length) {
    lines.push('', '### Si tu joues contre')
    for (const tip of guide.enemytips.slice(0, 4)) lines.push(`• ${tip}`)
  }
  if (guide.passive) {
    lines.push('', `### Passif — ${markSpell(guide.passive.name)}`, guide.passive.description)
  }
  if (guide.spells?.length) {
    lines.push('', '### Sorts')
    for (const s of guide.spells) {
      lines.push(`• ${markSpell(`${s.key} — ${s.name}`)} : ${s.description}`)
    }
  }

  return lines.filter((l) => l !== undefined && l !== '').join('\n')
}

/**
 * @param {object} guide
 * @param {string} roleId
 */
function roleTipsFor(guide, roleId) {
  const name = guide.name || 'ce champion'
  const map = {
    top: `En ${markRole('Top')}, gère les vagues et les TP. ${name} doit choisir trade court vs long selon le matchup.`,
    jungle: `En ${markRole('Jungle')}, clear + pathing objectifs. Cherche les ganks quand tes sorts de CC/setup sont up.`,
    mid: `En ${markRole('Mid')}, priorité farm + priorité de roam après shove. Track l’ulti adverse.`,
    adc: `En ${markRole('ADC')}, spacing et DPS. Ne force pas sans vision / peel.`,
    support: `En ${markRole('Support')}, vision et roam timers. Tes sorts existent pour setup ou peel — pas pour farm.`,
  }
  return map[roleId] || map.mid
}

/**
 * @param {object} guide buildDdragonChampionGuide
 * @param {'Q'|'W'|'E'|'R'|'P'} key
 */
export function formatSpellReply(guide, key) {
  if (!guide) return 'Champion introuvable.'
  if (key === 'P') {
    if (!guide.passive) return `Pas de passif trouvé pour ${markChamp(guide.name)}.`
    return (
      `## ${markChamp(guide.name)} · ${markSpell(`Passif — ${guide.passive.name}`)}\n` +
      (guide.patch ? `_Patch **${guide.patch}**_\n\n` : '\n') +
      guide.passive.description
    )
  }
  const spell = (guide.spells || []).find((s) => s.key === key)
  if (!spell) {
    return `Sort ${key} introuvable pour ${markChamp(guide.name)}.`
  }
  return (
    `## ${markChamp(guide.name)} · ${markSpell(`${spell.key} — ${spell.name}`)}\n` +
    (guide.patch ? `_Patch **${guide.patch}**_\n\n` : '\n') +
    spell.description +
    `\n\n_Pour le kit complet : « comment jouer ${guide.name} »._`
  )
}

/**
 * @param {{ totalGames?: number, champions?: object[], note?: string|null }} player
 * @param {string} [patch]
 */
export function formatPlayerHistoryReply(player, patch = '') {
  const champs = player?.champions ?? []
  if (!champs.length) {
    return (
      (player?.note || 'Pas encore de stats de parties pour ce compte.') +
      '\n\nSynchronise tes matchs sur la page League of Legends, puis redemande « mon historique ».'
    )
  }
  const header = patch
    ? `## Ton pool (BetterMe) · patch ref. **${patch}**\n`
    : '## Ton pool (BetterMe)\n'
  const total = player.totalGames || champs.reduce((a, c) => a + (c.games || 0), 0)
  const lines = champs.slice(0, 10).map((c, i) => {
    const wr =
      c.winRate == null ? '—' : `${Math.round(Number(c.winRate) * 10) / 10} %`
    const share =
      c.playShare == null ? '' : ` · pick ${Math.round(Number(c.playShare) * 10) / 10} %`
    return `${i + 1}. ${markChamp(c.championName)} — ${c.games} games · WR **${wr}**${share}`
  })
  return (
    `${header}` +
    `_Basé sur **${total}** parties synchronisées (fenêtre reset ranked)._ \n\n` +
    lines.join('\n') +
    `\n\nTu peux croiser avec « comment jouer [champion] » pour un guide détaillé.`
  )
}

/**
 * @param {number} [seed]
 */
export function pickPoroQuizQuestion(seed = Date.now()) {
  const idx = Math.abs(Number(seed) || 0) % PORO_QUIZ_BANK.length
  return PORO_QUIZ_BANK[idx]
}

/**
 * @param {ReturnType<typeof pickPoroQuizQuestion>} question
 */
export function formatQuizQuestion(question) {
  const choices = question.choices.map((c, i) => `${i + 1}. ${c}`).join('\n')
  return (
    `**Quiz Poro**\n${question.question}\n\n${choices}\n\n` +
    `Réponds avec le **numéro** (1–${question.choices.length}) ou le texte du choix.`
  )
}

/**
 * @param {ReturnType<typeof pickPoroQuizQuestion>} question
 * @param {string} userAnswer
 */
export function gradePoroQuizAnswer(question, userAnswer) {
  const n = normalizePoroText(userAnswer)
  const asNum = Number.parseInt(n, 10)
  let correct = false
  if (Number.isFinite(asNum) && asNum >= 1 && asNum <= question.choices.length) {
    correct = asNum - 1 === question.answerIndex
  } else {
    const expected = normalizePoroText(question.choices[question.answerIndex])
    correct = n === expected || expected.includes(n) || n.includes(expected)
  }
  return {
    correct,
    reply: correct
      ? `Exact !\n${question.explain}`
      : `Pas tout à fait. La bonne réponse était : **${question.choices[question.answerIndex]}**.\n${question.explain}`,
  }
}

/**
 * Version sync (tests / fallback sans catalogue).
 * @param {string} userText
 * @param {{ memories?: PoroMemory[], pendingQuiz?: object|null, itemsById?: Map<number, object>|null, patch?: string, preferredRole?: object|null }} [ctx]
 * @returns {PoroEngineResult}
 */
export function runPoroEngine(userText, ctx = {}) {
  const raw = String(userText ?? '').trim()
  if (!raw) {
    return { reply: 'Dis-moi quelque chose (ou tape « aide »).', meta: { intent: 'empty' } }
  }

  const n = normalizePoroText(raw)
  const memories = ctx.memories ?? []
  const itemsById = ctx.itemsById || null
  const patch = ctx.patch || ''

  if (ctx.pendingQuiz) {
    const graded = gradePoroQuizAnswer(ctx.pendingQuiz, raw)
    return {
      reply: graded.reply + memoryContextBlurb(memories),
      meta: { intent: 'quiz_answer', correct: graded.correct, clearQuiz: true },
    }
  }

  if (/^(aide|help|commandes|\?)$/i.test(n) || n.includes('que peux tu') || n.includes('que peux-tu')) {
    return { reply: PORO_HELP, meta: { intent: 'help' } }
  }

  if (
    n.includes('que reten') ||
    n.includes('que sais tu de moi') ||
    n.includes('ma memoire') ||
    n.includes('mes infos') ||
    n === 'memoire'
  ) {
    return {
      reply: formatPoroMemories(memories, ctx.champions || []),
      meta: { intent: 'list_memory' },
    }
  }

  const remember = parseRememberIntent(raw, ctx.champions || [])
  if (remember) {
    /** @type {string[]} */
    const bits = []
    for (const m of remember.memories) {
      if (m.label === 'preferred_role') {
        const r =
          PORO_ROLES.find((x) => x.id === m.value) || detectRoleInText(m.value)
        bits.push(`Poste : ${r?.label || m.value}`)
      } else if (m.label === 'playstyle') {
        bits.push(`Style : ${playstyleLabel(/** @type {'safe'|'aggro'|'balanced'} */ (m.value))}`)
      } else if (m.label === 'goal') bits.push(`Objectif : ${m.value}`)
      else if (m.label === 'mains' || m.label === 'main') bits.push(`Mains : ${m.value}`)
      else if (m.label === 'avoid') bits.push(`À éviter : ${m.value}`)
      else bits.push(m.value)
    }
    return {
      reply:
        `C’est noté.\n` +
        bits.map((b) => `• ${b}`).join('\n') +
        `\n\nDemande « qu’est-ce que tu retiens sur moi ? » pour revoir le profil.`,
      meta: { intent: 'remember' },
      memoriesToUpsert: remember.memories,
    }
  }

  if (
    n.includes('historique') ||
    n.includes('mes champions') ||
    n.includes('mon pool') ||
    n.includes('mes stats') ||
    n.includes('mon winrate')
  ) {
    return {
      reply:
        'Charge le contexte compte pour voir ton historique (ouvre Poro depuis un compte synchronisé), ou redemande après synchro.',
      meta: { intent: 'history_needs_context' },
    }
  }

  if (/\bquiz\b/.test(n) || n.includes('entraine') || n.includes('test moi')) {
    const question = pickPoroQuizQuestion()
    return {
      reply: formatQuizQuestion(question) + memoryContextBlurb(memories),
      meta: { intent: 'quiz', quiz: question },
    }
  }

  const tags = detectPoroTags(raw)
  const asksItems = n.includes('item') || n.includes('build') || n.includes('stuff')
  const asksPick =
    n.includes('quel champion') ||
    n.includes('qui jouer') ||
    n.includes('pick') ||
    n.includes('contre-pick') ||
    n.includes('contre pick') ||
    n.includes('synergie')

  const role = resolvePreferredRole(raw, memories, ctx.preferredRole || null)
  const manual = findPoroChampionGuide(raw)
  if (
    manual &&
    (n.includes('comment') || n.includes('guide') || n.includes('jouer')) &&
    !asksItems
  ) {
    return {
      reply: formatChampionGuide(manual.guide, role) + memoryContextBlurb(memories),
      meta: { intent: 'guide_manual', champion: manual.key, role: role.id },
    }
  }

  if (asksItems || (tags.length && !asksPick && (n.includes('contre') || n.includes('vs')))) {
    return {
      reply: buildItemAdviceReply(tags, itemsById, patch) + memoryContextBlurb(memories),
      meta: { intent: 'items', tags },
    }
  }

  if (asksPick || (tags.length && (n.includes('avec') || n.includes('contre')))) {
    const mode = n.includes('avec') && !n.includes('contre') ? 'with' : 'against'
    return {
      reply: buildPickAdviceReply(tags, mode) + memoryContextBlurb(memories),
      meta: { intent: 'pick', tags, mode },
    }
  }

  if (manual) {
    return {
      reply: formatChampionGuide(manual.guide, role) + memoryContextBlurb(memories),
      meta: { intent: 'guide_manual', champion: manual.key, role: role.id },
    }
  }

  return {
    reply: `Je n’ai pas encore de réponse précise pour ça.\n\n${PORO_HELP}` + memoryContextBlurb(memories),
    meta: { intent: 'fallback' },
  }
}

/**
 * @param {string} userText
 * @param {{
 *   memories?: PoroMemory[],
 *   pendingQuiz?: object|null,
 *   runtime?: object|null,
 *   recentMessages?: { role?: string, content?: string, meta?: object }[],
 * }} [ctx]
 * @returns {Promise<PoroEngineResult>}
 */
export async function answerPoroQuery(userText, ctx = {}) {
  const runtime = ctx.runtime || null
  const raw = String(userText ?? '').trim()
  const n = normalizePoroText(raw)
  const memories = ctx.memories ?? []
  const role = resolvePreferredRole(raw, memories, runtime?.preferredRole || null)
  const hints = getConversationHints(ctx.recentMessages || [])

  if (ctx.pendingQuiz) {
    return runPoroEngine(userText, {
      ...ctx,
      preferredRole: runtime?.preferredRole || null,
      champions: runtime?.champions || [],
    })
  }

  // Mémoire avant les autres intents (même avec un match ouvert)
  const rememberEarly = parseRememberIntent(raw, runtime?.champions || [])
  if (rememberEarly) {
    return runPoroEngine(userText, {
      ...ctx,
      preferredRole: runtime?.preferredRole || null,
      champions: runtime?.champions || [],
    })
  }

  if (
    (n.includes('que reten') ||
      n.includes('que sais tu de moi') ||
      n.includes('ma memoire') ||
      n.includes('mes infos') ||
      n === 'memoire') &&
    !n.includes('souviens')
  ) {
    return {
      reply: formatPoroMemories(memories, runtime?.champions || []),
      meta: { intent: 'list_memory' },
    }
  }

  if (
    n.includes('historique') ||
    n.includes('mes champions') ||
    n.includes('mon pool') ||
    n.includes('mes stats') ||
    n.includes('mon winrate')
  ) {
    if (!runtime?.player) {
      return {
        reply: 'Sélectionne un compte LoL sur la page, synchronise tes parties, puis réessaie.',
        meta: { intent: 'history' },
      }
    }
    return {
      reply:
        formatPlayerHistoryReply(runtime.player, runtime.patch) +
        memoryContextBlurb(memories, runtime?.champions),
      meta: { intent: 'history' },
    }
  }

  // Coach pool / tilt (avant draft « quel champion contre »)
  if (isPoolCoachQuery(raw)) {
    return {
      reply:
        formatPoolCoachReply({
          raw,
          player: runtime?.player || null,
          role,
          memories,
          recentMatches: runtime?.recentMatches || [],
          champions: runtime?.champions || [],
        }) + memoryContextBlurb(memories, runtime?.champions),
      meta: { intent: 'pool_coach', role: role?.id || null },
    }
  }

  const champs = runtime?.champions ? findChampionsInCatalog(raw, runtime.champions) : []
  const spellKey = detectSpellKey(raw)
  const matchSnap =
    runtime?.matchSnapshot ||
    (runtime?.match
      ? buildPoroMatchSnapshot(runtime.match, runtime.itemsById, runtime.champions)
      : null)

  const asksItemsOrBuild =
    n.includes('item') || n.includes('build') || n.includes('stuff')

  // Pick / draft avec liste d’équipes + pool (avant le match advice générique)
  if (runtime?.champions && isDraftPickQuery(raw)) {
    return {
      reply:
        formatDraftPickReply({
          raw,
          champions: runtime.champions,
          player: runtime.player || null,
          preferredRole: role,
          memories,
        }) + memoryContextBlurb(memories, runtime?.champions),
      meta: { intent: 'draft_pick' },
    }
  }

  // Follow-up items après une analyse, mais match plus lié
  if (!matchSnap && hints.hadMatchAdvice && asksItemsOrBuild) {
    return {
      reply:
        'On parlait d’une partie juste avant, mais elle n’est plus liée à Poro.\n' +
        'Rouvre le **détail du match** puis **Analyser avec Poro**, ou précise le style adverse ' +
        '(ex. « items contre tanks et heal »).',
      meta: { intent: 'match_context_missing' },
    }
  }

  // Conseils sur le match sélectionné (+ timeline si dispo)
  // hasMatchContext : match lié OU conversation récente d’analyse (si snap encore là)
  const hasMatchContext = Boolean(matchSnap)
  if (isMatchAdviceQuery(raw, hasMatchContext) || (hasMatchContext && hints.hadMatchAdvice && asksItemsOrBuild)) {
    let timeline = runtime?.timeline || null
    if (!timeline && matchSnap?.matchId && typeof runtime?.fetchTimeline === 'function') {
      try {
        timeline = await runtime.fetchTimeline(matchSnap.matchId)
        if (runtime) runtime.timeline = timeline
      } catch (err) {
        console.warn('Poro timeline:', err)
        timeline = { error: err?.message || 'timeline_failed' }
      }
    }

    return {
      reply:
        formatMatchAdviceReply(
          matchSnap,
          raw,
          runtime?.itemsById || null,
          timeline,
          { memories, champions: runtime?.champions || [] },
        ) + memoryContextBlurb(memories, runtime?.champions),
      meta: {
        intent: 'match_advice',
        hasMatch: Boolean(matchSnap),
        hasTimeline: Boolean(timeline && !timeline.error),
      },
    }
  }

  // Sort précis
  if (runtime?.buildGuide && spellKey && champs.length) {
    const champ = pickSelfChampion(raw, champs) || champs[0]
    try {
      const guide = await runtime.buildGuide(champ.id)
      return {
        reply: formatSpellReply(guide, spellKey) + memoryContextBlurb(memories),
        meta: { intent: 'spell', champion: champ.id, spell: spellKey },
      }
    } catch (err) {
      console.warn('Poro spell:', err)
    }
  }

  // Build champion + rôle + matchup
  if (runtime && isChampionBuildQuery(raw) && champs.length) {
    const self = pickSelfChampion(raw, champs)
    const enemy = pickEnemyChampion(raw, champs, self)
    const styleTags = detectPoroTags(raw)
    const buildRole =
      detectRoleInText(raw) ||
      role
    try {
      const reply = buildChampionBuildReply({
        champion: self,
        role: buildRole,
        enemy,
        enemyStyleTags: styleTags,
        itemsById: runtime.itemsById,
        patch: runtime.patch,
      })
      return {
        reply: reply + memoryContextBlurb(memories),
        meta: {
          intent: 'build',
          champion: self.id,
          enemy: enemy?.id || null,
          role: buildRole.id,
        },
      }
    } catch (err) {
      console.warn('Poro build:', err)
    }
  }

  // Guide champion
  const wantsGuide =
    n.includes('comment jouer') ||
    n.includes('guide') ||
    (n.includes('jouer') && !n.includes('qui jouer') && !n.includes('quel champion'))

  if (runtime?.champions && (wantsGuide || champs.length === 1)) {
    const champ = champs[0] || findChampionInCatalog(raw, runtime.champions)
    if (champ && (wantsGuide || n.includes(normalizePoroText(champ.name)))) {
      if (
        !(
          n.includes('item') ||
          n.includes('build') ||
          n.includes('pick') ||
          (n.includes('contre') && champs.length > 1)
        )
      ) {
        try {
          const guide = await runtime.buildGuide(champ.id)
          const manual = findPoroChampionGuide(champ.name)
          const playerRow =
            runtime.player?.champions?.find((c) => c.championId === champ.key) || null
          return {
            reply:
              formatDdragonGuide(guide, manual?.guide || null, playerRow, role) +
              memoryContextBlurb(memories),
            meta: { intent: 'guide_ddragon', champion: champ.id, role: role.id },
          }
        } catch (err) {
          console.warn('Poro guide:', err)
        }
      }
    }
  }

  return runPoroEngine(userText, {
    ...ctx,
    itemsById: runtime?.itemsById || null,
    patch: runtime?.patch || '',
    preferredRole: runtime?.preferredRole || null,
    champions: runtime?.champions || [],
  })
}

/**
 * Champion « joué » : avant contre/vs, ou après build/items/sur…
 * @param {string} raw
 * @param {object[]} champs
 */
export function pickSelfChampion(raw, champs) {
  if (!champs?.length) return null
  if (champs.length === 1) return champs[0]

  const n = normalizePoroText(raw)
  const parts = n.split(/\bcontre\b|\bvs\b|\bversus\b/)
  const before = (parts[0] || n).trim()
  const after = (parts[1] || '').trim()

  const namedIn = (zone) =>
    champs.filter((c) => {
      const name = normalizePoroText(c.name)
      const id = String(c.id || '').toLowerCase()
      return (name && zone.includes(name)) || (id.length > 2 && zone.includes(id))
    })

  const inBefore = namedIn(before)
  const inAfter = after ? namedIn(after) : []

  const pickLongest = (list) =>
    [...list].sort(
      (a, b) => normalizePoroText(b.name).length - normalizePoroText(a.name).length,
    )[0]

  if (inBefore.length) {
    const prefixZone = before.match(/\b(?:build|items?|stuff|guide|jouer|sur|avec|pour)\s+(.+)$/)
    if (prefixZone?.[1]) {
      const inZone = namedIn(prefixZone[1])
      if (inZone.length) return pickLongest(inZone)
    }
    // Évite de prendre l’ennemi s’il apparaît aussi avant (rare)
    const onlyBefore = inBefore.filter((c) => !inAfter.some((e) => e.id === c.id))
    return pickLongest(onlyBefore.length ? onlyBefore : inBefore)
  }

  const surMatch = n.match(/\b(?:sur|avec|pour)\s+([a-z0-9]+)/)
  if (surMatch) {
    const token = surMatch[1]
    const hit = champs.find(
      (c) =>
        normalizePoroText(c.name).startsWith(token) ||
        String(c.id).toLowerCase().startsWith(token),
    )
    if (hit) return hit
  }

  // Si un seul n’est pas après « contre », c’est le self
  if (inAfter.length && inAfter.length < champs.length) {
    const notEnemy = champs.filter((c) => !inAfter.some((e) => e.id === c.id))
    if (notEnemy.length) return pickLongest(notEnemy)
  }

  return champs[0]
}

/**
 * @param {string} raw
 * @param {object[]} champs
 * @param {object} self
 */
export function pickEnemyChampion(raw, champs, self) {
  const n = normalizePoroText(raw)
  if (!(n.includes('contre') || n.includes('vs') || n.includes(' versus '))) return null
  const others = champs.filter((c) => c.id !== self?.id)
  if (!others.length) return null
  const after = n.split(/\bcontre\b|\bvs\b|\bversus\b/)[1] || ''
  if (after) {
    const hit = others.find((c) => after.includes(normalizePoroText(c.name)))
    if (hit) return hit
    const idHit = others.find((c) => after.includes(String(c.id || '').toLowerCase()))
    if (idHit) return idHit
  }
  return others[0]
}

export function poroWelcomeMessage(patch = '', roleLabel = '') {
  let msg = PORO_WELCOME
  if (patch) msg += `\n\n_Catalogue chargé · patch **${patch}**._`
  if (roleLabel) {
    msg +=
      `\n_Poste de base actuel : ${markRole(roleLabel)}._` +
      `\n_Mémoire : « souviens-toi que je joue mid agressif pour grind LP » · Coach : « je stagne mid »._`
  }
  return msg
}
