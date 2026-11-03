import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildChampionBuildReply, pickArchetypeKey } from './poroBuilds.js'
import {
  answerPoroQuery,
  buildItemAdviceReply,
  detectPoroTags,
  detectSpellKey,
  formatPlayerHistoryReply,
  formatSpellReply,
  gradePoroQuizAnswer,
  isChampionBuildQuery,
  parseRememberIntent,
  pickEnemyChampion,
  pickPoroQuizQuestion,
  pickSelfChampion,
  runPoroEngine,
  formatPoolCoachReply,
  isPoolCoachQuery,
} from './poroEngine.js'
import {
  assessKeystoneVsLane,
  buildPoroMatchSnapshot,
  findLaneOpponent,
  formatLaneMatchupReply,
  formatMatchAdviceReply,
  formatMatchItemAlternatives,
  formatRuneAdviceReply,
  getConversationHints,
  inferEnemyStyleTags,
  isMatchAdviceQuery,
  rateLaneMatchupTier,
} from './poroMatchAdvice.js'
import {
  markChipRow,
  markItem,
  markRune,
  markSpell,
  renderPoroContent,
} from './poroMarkup.js'
import { formatTimelineSection, humanizeTimelineLabel } from './poroTimeline.js'
import { detectRoleInText, resolvePreferredRole } from './poroRoles.js'

describe('poroEngine', () => {
  it('détecte les tags d’équipe', () => {
    assert.deepEqual(detectPoroTags('contre tanks et heal'), ['tank', 'heal'])
  })

  it('met en avant les vrais noms d’items (marqueurs typés)', () => {
    const itemsById = new Map([
      [3036, { name: 'Salutations de Dominik' }],
      [3153, { name: 'Lame du roi déchu' }],
      [3071, { name: 'Couperet noir' }],
      [3135, { name: 'Bâton du vide' }],
      [4633, { name: 'Créateur de failles' }],
      [3165, { name: 'Morellonomicon' }],
      [6609, { name: 'Épée dentelée chimico-punk' }],
      [3075, { name: 'Cotte épineuse' }],
      [8010, { name: 'Malédiction du sanguinaire' }],
    ])
    const reply = buildItemAdviceReply(['tank', 'heal'], itemsById, '16.21.1')
    assert.match(reply, /\[\[item\|Salutations de Dominik\]\]/)
    assert.match(reply, /\[\[item\|Morellonomicon\]\]/)
    assert.match(reply, /16\.21\.1/)
    assert.match(reply, /Items à regarder/)
  })

  it('rend des couleurs distinctes', () => {
    const html = renderPoroContent(
      '## Titre\n### Sous\n---\n' +
        '[[item|Morellonomicon]] [[spell|R — Cyclone]] [[champ|Wukong]] [[role|Jungle]] ' +
        '[[tier|S|Très difficile]] [[stat|Gold @10|3200g]] **focus** _tip_\n• point',
    )
    assert.match(html, /poro-tag-item/)
    assert.match(html, /poro-tag-spell/)
    assert.match(html, /poro-tag-champ/)
    assert.match(html, /poro-tag-role/)
    assert.match(html, /poro-tier-s/)
    assert.match(html, /poro-stat-k/)
    assert.match(html, /poro-sep/)
    assert.match(html, /poro-li/)
    assert.match(html, /poro-h-main/)
    assert.match(html, /poro-strong/)
    assert.doesNotMatch(html, /_k">/)
    assert.doesNotMatch(html, /poro-stat__/)
  })

  it('rend l’italique même avec gras à l’intérieur / lignes indentées', () => {
    const html = renderPoroContent(
      '_Priorise le haut ; items « tu l’avais » OK._\n' +
        '_Poro estime pour **Malzahar**._\n' +
        '   _Carry derrière frontline · 152 games_',
    )
    assert.match(html, /poro-tip/)
    assert.match(html, /poro-strong">Malzahar/)
    assert.doesNotMatch(html, /(^|[^a-z])_Priorise/)
    assert.doesNotMatch(html, /_Poro estime/)
    assert.doesNotMatch(html, /_Carry derrière/)
  })

  it('rend les icônes champions / items / runes / summons', () => {
    const html = renderPoroContent(
      '[[champ|Katarina|55]] [[item|Morellonomicon|3165]] ' +
        '[[spell|Flash|SummonerFlash.png]] ' +
        '[[rune|Aery|perk-images/Styles/Sorcery/SummonAery/SummonAery.png]]',
    )
    assert.match(html, /champion-icons\/55\.png/)
    assert.match(html, /img\/item\/3165\.png/)
    assert.match(html, /img\/spell\/SummonerFlash\.png/)
    assert.match(html, /cdn\/img\/perk-images\/Styles\/Sorcery\/SummonAery\/SummonAery\.png/)
    assert.match(html, /poro-tag-ico/)
    assert.match(html, /poro-tag-rune/)
  })

  it('rend une rangée d’items / runes sans fuite de marqueurs', () => {
    const row = markChipRow([
      markItem('Anneau de Doran', 1056),
      markItem('Torche noire', 2230),
      markRune(
        "Invocation d'Aery",
        'perk-images/Styles/Sorcery/SummonAery/SummonAery.png',
      ),
      markSpell('Saut éclair', 'SummonerFlash.png'),
    ])
    const html = renderPoroContent(`**Items**\n${row}\n\n### Tes morts\n• 2:17`)
    assert.doesNotMatch(html, /\[\[item\|/)
    assert.doesNotMatch(html, /\]\]/)
    assert.match(html, /img\/item\/1056\.png/)
    assert.match(html, /img\/item\/2230\.png/)
    assert.match(html, /SummonAery\.png/)
    assert.match(html, /SummonerFlash\.png/)
    assert.match(html, /poro-row/)
    assert.match(html, /poro-h-sub">Tes morts/)
  })

  it('clarifie l’écart gold d’équipe sur la timeline', () => {
    const section = formatTimelineSection(
      {
        goldAt: { '10': 2880, '15': 4304 },
        teamGoldAt: {
          '10': { ally: 1415, enemy: 1000 },
          '15': { ally: 9000, enemy: 4618 },
        },
        keyMoments: [
          { tSec: 137, kind: 'death', label: 'Mort' },
          {
            tSec: 467,
            kind: 'objective',
            label: 'DRAGON/AIR_DRAGON · équipe 100 (7:47)',
          },
        ],
      },
      { teamId: 100, championName: 'Orianna' },
    )
    assert.match(section, /Ton gold @10/)
    assert.match(section, /ton équipe \+415g/)
    assert.match(section, /### Tes morts/)
    assert.match(section, /### Objectifs/)
    assert.doesNotMatch(section, /écart = alliés/)
    assert.doesNotMatch(section, /Gold pour/)
  })

  it('traduit les objectifs timeline (larves, tours T1/lane)', () => {
    assert.match(
      humanizeTimelineLabel('HORDE · équipe 100 (8:52)', 100),
      /Larves du Néant.*ton équipe/,
    )
    assert.match(
      humanizeTimelineLabel(
        'TOWER_BUILDING/OUTER_TURRET/TOP_LANE perdue par équipe 100 (14:19)',
        200,
      ),
      /Tour T1 Top perdue par ennemis/,
    )
    assert.match(
      humanizeTimelineLabel('DRAGON/AIR_DRAGON · équipe 200 (7:47)', 100),
      /Dragon Nuage · ennemis/,
    )
  })

  it('répond sur les items vs tags', () => {
    const { reply, meta } = runPoroEngine('Items contre tanks et heal')
    assert.equal(meta.intent, 'items')
    assert.match(reply, /tank|heal|Items à regarder/i)
  })

  it('sert un guide champion manuel avec poste', () => {
    const { reply, meta } = runPoroEngine('Comment jouer Ahri')
    assert.equal(meta.intent, 'guide_manual')
    assert.equal(meta.champion, 'ahri')
    assert.equal(meta.role, 'mid')
    assert.match(reply, /Ahri/)
  })

  it('détecte un poste dans la question', () => {
    const role = detectRoleInText('Comment jouer Zac en jungle ?')
    assert.equal(role?.id, 'jungle')
    const resolved = resolvePreferredRole('Comment jouer Zac en jungle ?', [], {
      id: 'mid',
      label: 'Mid',
    })
    assert.equal(resolved.id, 'jungle')
    assert.equal(resolved.source, 'question')
  })

  it('utilise la mémoire de poste', () => {
    const resolved = resolvePreferredRole('Comment jouer Zac', [
      { kind: 'preference', label: 'preferred_role', value: 'mid' },
    ])
    assert.equal(resolved.id, 'mid')
    assert.equal(resolved.source, 'memory')
  })

  it('détecte un sort QWER / passif', () => {
    assert.equal(detectSpellKey('Que fait le R de Wukong ?'), 'R')
    assert.equal(detectSpellKey('passif de Zac'), 'P')
    assert.equal(detectSpellKey('Ahri W'), 'W')
  })

  it('formate une réponse de sort', () => {
    const text = formatSpellReply(
      {
        name: 'Wukong',
        patch: '16.21.1',
        spells: [{ key: 'R', name: 'Cyclone', description: 'Tourne et fait des dégâts.' }],
      },
      'R',
    )
    assert.match(text, /\[\[champ\|Wukong\]\]/)
    assert.match(text, /\[\[spell\|R — Cyclone\]\]/)
    assert.match(text, /Tourne/)
  })

  it('détecte une query de build champion', () => {
    assert.equal(isChampionBuildQuery('Quels items builds sur Veigar ADC contre Miss Fortune ?'), true)
    assert.equal(isChampionBuildQuery('hello'), false)
  })

  it('choisit Veigar (self) et Miss Fortune (enemy) dans un build', () => {
    const champs = [
      { id: 'MissFortune', name: 'Miss Fortune', tags: ['Marksman'] },
      { id: 'Veigar', name: 'Veigar', tags: ['Mage'] },
    ]
    // Ordre « long nom d’abord » comme findChampionsInCatalog
    const self = pickSelfChampion('Build Veigar ADC contre Miss Fortune', champs)
    assert.equal(self?.id, 'Veigar')
    const enemy = pickEnemyChampion('Build Veigar ADC contre Miss Fortune', champs, self)
    assert.equal(enemy?.id, 'MissFortune')
  })

  it('debrief un match lié (anti-heal / CS / lane / runes)', () => {
    const match = {
      matchId: 'EUW1_1',
      gameDuration: 1800,
      teamKills: 20,
      participant: {
        championId: 45,
        championName: 'Veigar',
        teamId: 100,
        teamPosition: 'MIDDLE',
        win: false,
        kills: 4,
        deaths: 6,
        assists: 8,
        totalMinionsKilled: 180,
        neutralMinionsKilled: 12,
        goldEarned: 11000,
        totalDamageDealtToChampions: 20000,
        totalDamageTaken: 15000,
        visionScore: 18,
        item0: 6655,
        item1: 0,
        item2: 0,
        item3: 0,
        item4: 0,
        item5: 0,
        item6: 0,
        turretKills: 1,
        inhibitorKills: 0,
        summoner1Id: 4,
        summoner2Id: 14,
        perks: {
          primaryStyleId: 8100,
          subStyleId: 8200,
          keystoneId: 8112,
          perkIds: [8112, 8126, 8138, 8135, 8210, 8236],
          statPerks: { offense: 5008, flex: 5008, defense: 5002 },
        },
      },
      participants: [
        {
          teamId: 100,
          championName: 'Veigar',
          teamPosition: 'MIDDLE',
          summoner1Id: 4,
          summoner2Id: 14,
        },
        { teamId: 100, championName: 'Jinx', teamPosition: 'BOTTOM' },
        { teamId: 200, championName: 'Soraka', teamPosition: 'UTILITY' },
        {
          teamId: 200,
          championName: 'Syndra',
          teamPosition: 'MIDDLE',
          championId: 134,
          kills: 7,
          deaths: 3,
          assists: 5,
          totalMinionsKilled: 210,
          neutralMinionsKilled: 8,
          goldEarned: 13000,
          totalDamageDealtToChampions: 24000,
          summoner1Id: 4,
          summoner2Id: 12,
        },
        { teamId: 200, championName: 'Miss Fortune', teamPosition: 'BOTTOM' },
      ],
      teamObjectives: {
        100: { tower: 4, dragon: 1, baron: 0, inhibitor: 0 },
        200: { tower: 7, dragon: 2, baron: 1, inhibitor: 1 },
      },
    }
    const itemsById = new Map([[6655, { name: 'Écho de Luden' }]])
    const runesById = new Map([
      [
        8112,
        {
          id: 8112,
          name: 'Électrocution',
          treeName: 'Domination',
          icon: 'perk-images/Styles/Domination/Electrocute/Electrocute.png',
        },
      ],
    ])
    const summonersByKey = new Map([
      [4, { key: '4', name: 'Flash', image: 'SummonerFlash.png' }],
      [14, { key: '14', name: 'Ignite', image: 'SummonerDot.png' }],
      [12, { key: '12', name: 'Téléportation', image: 'SummonerTeleport.png' }],
    ])
    const champions = [
      { id: 'Soraka', name: 'Soraka', tags: ['Support'] },
      { id: 'MissFortune', name: 'Miss Fortune', tags: ['Marksman'] },
      { id: 'Veigar', name: 'Veigar', tags: ['Mage'] },
      { id: 'Syndra', name: 'Syndra', tags: ['Mage', 'Support'] },
    ]
    const snap = buildPoroMatchSnapshot(match, itemsById, champions, {
      runesById,
      runeTrees: [
        { id: 8100, name: 'Domination' },
        { id: 8200, name: 'Sorcellerie' },
      ],
      summonersByKey,
    })
    assert.ok(snap)
    assert.equal(snap.laneOpponent?.championName, 'Syndra')
    assert.equal(findLaneOpponent(match.participant, match.participants.filter((p) => p.teamId === 200))?.championName, 'Syndra')

    const anti = formatMatchAdviceReply(snap, 'anti-heal était pertinent ?', itemsById)
    assert.match(anti, /pertinent|anti-heal|Soraka/i)
    const cs = formatMatchAdviceReply(snap, 'mon CS ?', itemsById)
    assert.match(cs, /CS\/min/i)

    const full = formatMatchAdviceReply(snap, 'analyse cette partie', itemsById)
    assert.doesNotMatch(full, /\[\[stat\|KDA\|/)
    assert.match(full, /\[\[champ\|Syndra\|134\]\]/)
    assert.match(full, /\[\[tier\|[SABCDE]\]\]/)
    assert.match(full, /\[\[item\|Écho de Luden\|6655\]\]/)
    assert.match(full, /\[\[spell\|Flash\|SummonerFlash\.png\]\]/)
    assert.match(full, /\[\[rune\|Électrocution\|perk-images\//)

    assert.equal(isMatchAdviceQuery("Quels items j'aurais dû build plutôt ?", true), true)
    assert.equal(isMatchAdviceQuery("Quels items j'aurais dû build plutôt ?", false), false)
    const altItems = formatMatchItemAlternatives(snap, itemsById)
    assert.match(altItems, /Tu avais|Build conseillé/i)
    assert.match(altItems, /Veigar|Écho de Luden|\[\[item\|/)
    assert.doesNotMatch(altItems, /Contre assassins \/ burst/)
    const tags = inferEnemyStyleTags(snap)
    assert.ok(tags.includes('heal') || tags.includes('ap') || tags.includes('adc'))
    const hints = getConversationHints([
      { role: 'assistant', content: '…', meta: { intent: 'match_advice' } },
      { role: 'user', content: 'Quels items ?' },
    ])
    assert.equal(hints.hadMatchAdvice, true)

    const lane = formatLaneMatchupReply(snap)
    assert.match(lane, /Syndra/)
    assert.match(lane, /Matchup/i)
    assert.doesNotMatch(lane, /1v1 ·/)

    const runes = formatRuneAdviceReply(snap)
    assert.match(runes, /Électrocution|Electrocution|keystone|Keystone/i)
    assert.match(runes, /Flash/)
    assert.match(runes, /\[\[rune\|Électrocution\|/)

    const assess = assessKeystoneVsLane('Électrocution', ['Tank'], ['Mage'])
    assert.equal(assess.score, -1)

    const laneTxt = formatLaneMatchupReply(snap)
    assert.match(laneTxt, /\[\[tier\|[SABCDE]\]/)

    const easy = rateLaneMatchupTier(
      { gold: 14000, cs: 240, damage: 28000, kda: 5, deaths: 1, tags: ['Mage'] },
      { gold: 9000, cs: 160, damage: 12000, kda: 1, deaths: 8, tags: ['Mage'] },
    )
    assert.ok(['D', 'E'].includes(easy.tier))

    const hard = rateLaneMatchupTier(
      { gold: 8000, cs: 140, damage: 10000, kda: 0.5, deaths: 9, tags: ['Mage'] },
      { gold: 14000, cs: 230, damage: 26000, kda: 6, deaths: 1, tags: ['Assassin'] },
    )
    assert.ok(['A', 'S'].includes(hard.tier))
  })

  it('réutilise le match lié pour un follow-up items (sans redemander le style)', async () => {
    const match = {
      matchId: 'EUW1_follow',
      gameDuration: 1800,
      teamKills: 10,
      participant: {
        championName: 'Orianna',
        championId: 61,
        teamId: 100,
        teamPosition: 'MIDDLE',
        win: true,
        kills: 2,
        deaths: 4,
        assists: 10,
        totalMinionsKilled: 160,
        goldEarned: 10000,
        totalDamageDealtToChampions: 15000,
        item0: 1056,
        summoner1Id: 4,
        summoner2Id: 12,
        perks: { primaryStyleId: 8200, subStyleId: 8100, keystoneId: 8214, perkIds: [8214] },
      },
      participants: [
        { teamId: 100, championName: 'Orianna', championId: 61, teamPosition: 'MIDDLE' },
        { teamId: 200, championName: 'Katarina', championId: 55, teamPosition: 'MIDDLE' },
        { teamId: 200, championName: 'Soraka', championId: 16, teamPosition: 'UTILITY' },
      ],
    }
    const itemsById = new Map([[1056, { name: 'Anneau de Doran' }]])
    const champions = [
      { id: 'Orianna', name: 'Orianna', tags: ['Mage', 'Support'] },
      { id: 'Katarina', name: 'Katarina', tags: ['Assassin', 'Mage'] },
      { id: 'Soraka', name: 'Soraka', tags: ['Support'] },
    ]
    const snap = buildPoroMatchSnapshot(match, itemsById, champions, {
      runesById: new Map([
        [8214, { id: 8214, name: "Invocation d'Aery", icon: 'perk-images/Styles/Sorcery/SummonAery/SummonAery.png' }],
      ]),
      runeTrees: [{ id: 8200, name: 'Sorcellerie' }, { id: 8100, name: 'Domination' }],
      summonersByKey: new Map([
        [4, { name: 'Flash', image: 'SummonerFlash.png' }],
        [12, { name: 'Téléportation', image: 'SummonerTeleport.png' }],
      ]),
    })
    const result = await answerPoroQuery("Quels items j'aurais dû build plutôt ?", {
      runtime: { matchSnapshot: snap, itemsById, champions, patch: '16.1' },
      recentMessages: [{ role: 'assistant', content: 'Analyse…', meta: { intent: 'match_advice' } }],
    })
    assert.equal(result.meta?.intent, 'match_advice')
    assert.doesNotMatch(result.reply, /Dis-moi le \*\*style\*\*/)
    assert.doesNotMatch(result.reply, /Contre assassins \/ burst/)
    assert.match(result.reply, /Tu avais|Build conseillé|Orianna/i)
  })

  it('propose un pick draft depuis la pool vs une compo listée', async () => {
    const {
      parseDraftTeams,
      isDraftPickQuery,
      rankPoolForDraft,
      fitsDraftRole,
      suggestOffPoolPicks,
      topPlayedPool,
      formatDraftPickReply,
    } = await import('./poroDraftPick.js')
    assert.equal(isDraftPickQuery('Quel champion mid contre Yasuo Zed Katarina'), true)
    const champions = [
      { id: 'Ahri', key: 103, name: 'Ahri', tags: ['Mage', 'Assassin'] },
      { id: 'Orianna', key: 61, name: 'Orianna', tags: ['Mage', 'Support'] },
      { id: 'Malphite', key: 54, name: 'Malphite', tags: ['Tank'] },
      { id: 'Yasuo', key: 157, name: 'Yasuo', tags: ['Fighter', 'Assassin'] },
      { id: 'Zed', key: 238, name: 'Zed', tags: ['Assassin'] },
      { id: 'Katarina', key: 55, name: 'Katarina', tags: ['Assassin', 'Mage'] },
      { id: 'Ornn', key: 516, name: 'Ornn', tags: ['Tank', 'Fighter'] },
      { id: 'Lulu', key: 117, name: 'Lulu', tags: ['Support', 'Mage'] },
      { id: 'Leona', key: 89, name: 'Leona', tags: ['Tank', 'Support'] },
      { id: 'Syndra', key: 134, name: 'Syndra', tags: ['Mage', 'Support'] },
      { id: 'Jinx', key: 222, name: 'Jinx', tags: ['Marksman'] },
      { id: 'Annie', key: 1, name: 'Annie', tags: ['Mage'] },
      { id: 'Veigar', key: 45, name: 'Veigar', tags: ['Mage'] },
      { id: 'Viktor', key: 112, name: 'Viktor', tags: ['Mage'] },
    ]
    assert.equal(fitsDraftRole({ tags: ['Tank', 'Support'] }, 'mid'), false)
    assert.equal(fitsDraftRole({ tags: ['Mage', 'Support'] }, 'mid'), true)
    assert.equal(fitsDraftRole({ tags: ['Marksman'] }, 'mid'), false)
    assert.equal(fitsDraftRole({ tags: ['Fighter', 'Mage'] }, 'mid'), false) // Morde
    assert.equal(fitsDraftRole({ tags: ['Assassin', 'Fighter'] }, 'mid'), false) // Yasuo / Ambessa / Camille
    assert.equal(fitsDraftRole({ tags: ['Assassin'] }, 'mid'), true) // Zed
    assert.equal(fitsDraftRole({ tags: ['Mage', 'Assassin'] }, 'mid'), true) // Ahri / Diana
    assert.equal(fitsDraftRole({ tags: ['Fighter', 'Assassin'] }, 'top'), true) // Camille top OK

    const fullPool = [
      { championId: 89, championName: 'Leona', games: 59, winRate: 74, masteryLevel: 7 },
      { championId: 61, championName: 'Orianna', games: 40, winRate: 55, masteryLevel: 7 },
      { championId: 45, championName: 'Veigar', games: 30, winRate: 48, masteryLevel: 6 },
      { championId: 54, championName: 'Malphite', games: 5, winRate: 40, masteryLevel: 4 },
    ]
    const mains = topPlayedPool(fullPool, 3)
    assert.deepEqual(
      mains.map((m) => m.championName),
      ['Leona', 'Orianna', 'Veigar'],
    )

    const parsed = parseDraftTeams(
      'Qui jouer mid avec Ornn Lulu contre Malphite Syndra Jinx bans Ahri',
      champions,
    )
    assert.equal(parsed.role?.id, 'mid')

    const ranked = rankPoolForDraft({
      pool: mains,
      champions,
      allies: parsed.allies,
      enemies: parsed.enemies,
      bans: parsed.bans,
      role: parsed.role,
      limit: 3,
    })
    assert.ok(!ranked.some((r) => r.catalog.id === 'Leona'), 'Leona pas mid')
    assert.ok(ranked.some((r) => r.catalog.id === 'Orianna' || r.catalog.id === 'Veigar'))

    const off = suggestOffPoolPicks({
      champions,
      pool: fullPool,
      allies: parsed.allies,
      enemies: parsed.enemies,
      bans: parsed.bans,
      role: parsed.role,
      excludeIds: ranked.map((r) => r.catalog.id),
      limit: Math.max(2, 5 - ranked.length),
    })
    assert.ok(off.length >= 2)
    assert.ok(off.every((r) => fitsDraftRole(r.catalog, 'mid')))

    const reply = formatDraftPickReply({
      raw: 'Qui jouer au mid avec Ornn Lulu contre Malphite Syndra Jinx ?',
      champions,
      player: { champions: fullPool },
      preferredRole: { id: 'mid', label: 'Mid' },
    })
    assert.match(reply, /5 options|Pick conseillé/i)
    assert.match(reply, /Tes 3 mains/)
    assert.match(reply, /Hors pool/i)
    assert.doesNotMatch(reply, /\[\[champ\|Leona/)
    // Au moins 2 justifs / mentions hors pool + pool
    assert.match(reply, /Dans tes mains :|Hors pool : bon fit/i)
    assert.match(reply, /mage cohérent en Mid/i)

    const result = await answerPoroQuery(
      'Qui jouer au mid avec Ornn Lulu contre Malphite Syndra Jinx ?',
      {
        runtime: {
          champions,
          player: { champions: fullPool },
        },
      },
    )
    assert.equal(result.meta?.intent, 'draft_pick')
    assert.match(result.reply, /Orianna|Veigar|Pick conseillé/i)
  })

  it('mid draft n’envoie pas de bruisers (Ambessa / Camille / Fiora)', async () => {
    const { formatDraftPickReply, fitsDraftRole } = await import('./poroDraftPick.js')
    const champions = [
      { id: 'Ahri', key: 103, name: 'Ahri', tags: ['Mage', 'Assassin'] },
      { id: 'Annie', key: 1, name: 'Annie', tags: ['Mage'] },
      { id: 'Viktor', key: 112, name: 'Viktor', tags: ['Mage'] },
      { id: 'Syndra', key: 134, name: 'Syndra', tags: ['Mage', 'Support'] },
      { id: 'Diana', key: 131, name: 'Diana', tags: ['Mage', 'Assassin'] },
      { id: 'Zed', key: 238, name: 'Zed', tags: ['Assassin'] },
      { id: 'Orianna', key: 61, name: 'Orianna', tags: ['Mage', 'Support'] },
      { id: 'Veigar', key: 45, name: 'Veigar', tags: ['Mage'] },
      { id: 'Malzahar', key: 90, name: 'Malzahar', tags: ['Mage'] },
      { id: 'Ornn', key: 516, name: 'Ornn', tags: ['Tank', 'Fighter'] },
      { id: 'Lulu', key: 117, name: 'Lulu', tags: ['Support', 'Mage'] },
      { id: 'Ambessa', key: 799, name: 'Ambessa', tags: ['Fighter', 'Assassin'] },
      { id: 'Briar', key: 233, name: 'Briar', tags: ['Fighter', 'Assassin'] },
      { id: 'Camille', key: 164, name: 'Camille', tags: ['Fighter', 'Assassin'] },
      { id: 'Fiora', key: 114, name: 'Fiora', tags: ['Fighter', 'Assassin'] },
    ]
    assert.equal(fitsDraftRole({ tags: ['Fighter', 'Assassin'] }, 'mid'), false)
    const reply = formatDraftPickReply({
      raw: 'Qui jouer au mid avec Ornn Lulu contre Orianna, Veigar et Malzahar',
      champions,
      player: {
        champions: [
          { championId: 61, championName: 'Orianna', games: 40, winRate: 55 },
          { championId: 45, championName: 'Veigar', games: 30, winRate: 48 },
          { championId: 90, championName: 'Malzahar', games: 25, winRate: 52 },
        ],
      },
      preferredRole: { id: 'mid', label: 'Mid' },
    })
    assert.match(reply, /Pick conseillé|5 options/i)
    assert.doesNotMatch(reply, /Ambessa|Briar|Camille|Fiora/)
    assert.match(reply, /Ahri|Annie|Viktor|Syndra|Diana|Zed/)
  })

  it('propose un build ordonné avec items marqués', () => {
    const itemsById = new Map([
      [1056, { name: 'Anneau de Doran' }],
      [3020, { name: 'Chaussures de sorcier' }],
      [6653, { name: 'Tourment de Liandry' }],
      [3116, { name: 'Sceptre de Rylai' }],
      [3089, { name: 'Coiffe de Rabadon' }],
      [4629, { name: 'Volonté cosmique' }],
      [3165, { name: 'Morellonomicon' }],
      [3137, { name: 'Fleur de crypte' }],
      [3036, { name: 'Salutations de Dominik' }],
      [3033, { name: 'Rappel mortel' }],
    ])
    assert.equal(pickArchetypeKey(['Mage'], 'adc'), 'mage_adc')
    const reply = buildChampionBuildReply({
      champion: { name: 'Veigar', tags: ['Mage'] },
      role: { id: 'adc', label: 'ADC' },
      enemy: { name: 'Miss Fortune', tags: ['Marksman'] },
      itemsById,
      patch: '16.21.1',
    })
    assert.match(reply, /\[\[champ\|Veigar\]\]/)
    assert.match(reply, /\[\[role\|ADC\]\]/)
    assert.match(reply, /\[\[item\|Tourment de Liandry(?:\|6653)?\]\]/)
    assert.match(reply, /Ordre conseillé/)
  })

  it('utilise la meta mid Storage quand dispo', () => {
    const itemsById = new Map([
      [1056, { name: 'Anneau de Doran' }],
      [3158, { name: 'Bottes de lucidité' }],
      [6655, { name: 'Tempête de lampe' }],
      [4645, { name: 'Flameau sombre' }],
      [3089, { name: 'Coiffe de Rabadon' }],
    ])
    const reply = buildChampionBuildReply({
      champion: { name: 'Orianna', tags: ['Mage', 'Support'], key: 61 },
      role: { id: 'mid', label: 'Mid' },
      itemsById,
      metaPatch: '16.3',
      metaEntry: {
        championId: 61,
        winRate: 51.2,
        games: 680,
        start: [1056, 2003],
        boots: [3158],
        core: [6655, 4645],
        late: [3089],
        skillPriority: 'QWE',
        skillOrder: ['Q', 'W', 'E', 'Q', 'Q', 'R'],
      },
    })
    assert.match(reply, /Build méta/)
    assert.match(reply, /Orianna/)
    assert.match(reply, /QWE/)
    assert.match(reply, /Tempête de lampe|6655/)
    assert.match(reply, /51\.2/)
  })

  it('mémorise une préférence + poste', () => {
    const result = runPoroEngine('Souviens-toi que je main Jinx ADC')
    assert.equal(result.meta.intent, 'remember')
    assert.ok(result.memoriesToUpsert?.length)
    assert.ok(result.memoriesToUpsert.some((m) => /Jinx/i.test(m.value)))
    assert.ok(result.memoriesToUpsert.some((m) => m.label === 'preferred_role'))
  })

  it('parseRememberIntent', () => {
    const mem = parseRememberIntent('Souviens-toi que je préfère les tanks')
    assert.ok(mem)
    assert.equal(mem.primary.kind, 'preference')
  })

  it('mémoire enrichie : style + objectif + poste', () => {
    const mem = parseRememberIntent(
      'Souviens-toi que je joue mid agressif pour grind LP',
    )
    assert.ok(mem)
    assert.ok(mem.memories.some((m) => m.label === 'preferred_role' && m.value === 'mid'))
    assert.ok(mem.memories.some((m) => m.label === 'playstyle' && m.value === 'aggro'))
    assert.ok(mem.memories.some((m) => m.label === 'goal' && /grind/i.test(m.value)))
  })

  it('coach de pool : WR + volume + tilt pause', async () => {
    assert.equal(isPoolCoachQuery('Je stagne mid'), true)
    assert.equal(isPoolCoachQuery('Quel champion mid contre Yasuo'), false)

    const player = {
      totalGames: 40,
      champions: [
        {
          championId: 61,
          championName: 'Orianna',
          games: 20,
          winRate: 58,
          championTags: ['Mage', 'Support'],
        },
        {
          championId: 103,
          championName: 'Ahri',
          games: 12,
          winRate: 55,
          championTags: ['Mage', 'Assassin'],
        },
        {
          championId: 238,
          championName: 'Zed',
          games: 8,
          winRate: 35,
          championTags: ['Assassin'],
        },
      ],
    }
    const reply = formatPoolCoachReply({
      raw: 'Je stagne mid',
      player,
      role: { id: 'mid', label: 'Mid' },
      memories: [
        { label: 'playstyle', value: 'safe' },
        { label: 'goal', value: 'Grind LP' },
      ],
      recentMatches: [
        { participant: { win: false } },
        { participant: { win: false } },
        { participant: { win: false } },
      ],
      champions: [
        { id: 'Orianna', key: 61, name: 'Orianna', tags: ['Mage', 'Support'] },
        { id: 'Ahri', key: 103, name: 'Ahri', tags: ['Mage', 'Assassin'] },
        { id: 'Zed', key: 238, name: 'Zed', tags: ['Assassin'] },
      ],
    })
    assert.match(reply, /Coach de pool/)
    assert.match(reply, /Orianna/)
    assert.match(reply, /pause/i)
    assert.match(reply, /Batterie|Mood|Journal/)

    const { answerPoroQuery } = await import('./poroEngine.js')
    const res = await answerPoroQuery('Je stagne mid', {
      memories: [],
      runtime: {
        player,
        champions: [
          { id: 'Orianna', key: 61, name: 'Orianna', tags: ['Mage', 'Support'] },
          { id: 'Ahri', key: 103, name: 'Ahri', tags: ['Mage', 'Assassin'] },
          { id: 'Zed', key: 238, name: 'Zed', tags: ['Assassin'] },
        ],
        preferredRole: { id: 'mid', label: 'Mid' },
        recentMatches: [
          { participant: { win: false } },
          { participant: { win: false } },
          { participant: { win: false } },
        ],
      },
    })
    assert.equal(res.meta.intent, 'pool_coach')
    assert.match(res.reply, /Orianna/)
  })

  it('quiz + correction', () => {
    const q = pickPoroQuizQuestion(0)
    const start = runPoroEngine('quiz')
    assert.equal(start.meta.intent, 'quiz')
    const good = gradePoroQuizAnswer(q, String(q.answerIndex + 1))
    assert.equal(good.correct, true)
  })

  it('formate l’historique joueur', () => {
    const text = formatPlayerHistoryReply(
      {
        totalGames: 20,
        champions: [
          { championName: 'Ahri', games: 8, winRate: 62.5, playShare: 40 },
          { championName: 'Jinx', games: 5, winRate: 40, playShare: 25 },
        ],
      },
      '16.21.1',
    )
    assert.match(text, /\[\[champ\|Ahri\]\]/)
    assert.match(text, /62\.5/)
    assert.match(text, /16\.21\.1/)
  })
})
