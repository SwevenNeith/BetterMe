/**
 * Base de connaissances V1 de Poro (assistant LoL).
 * Données structurées locales — pas de LLM externe.
 * À enrichir progressivement (guides, tags, quiz).
 */

/** Tags d’équipe / style qui orientent items et picks. */
export const PORO_TEAM_TAGS = [
  { id: 'tank', labels: ['tank', 'tanks', 'frontline'] },
  { id: 'assassin', labels: ['assassin', 'assassins', 'burst'] },
  { id: 'poke', labels: ['poke', 'artillerie', 'siege'] },
  { id: 'heal', labels: ['heal', 'soin', 'soins', 'sustain', 'enchanter'] },
  { id: 'cc', labels: ['cc', 'contrôle', 'controle', 'engage'] },
  { id: 'adc', labels: ['adc', 'crit', 'marksman', 'carry'] },
  { id: 'ap', labels: ['ap', 'mage', 'mages'] },
  { id: 'ad', labels: ['ad', 'bruiser', 'fighter'] },
]

/**
 * Conseils d’items selon tags adverses.
 * `itemIds` = ids Data Dragon (noms FR résolus au runtime).
 * @type {Record<string, { title: string, itemIds: number[], focus: string, tip: string }>}
 */
export const PORO_ITEM_ADVICE_BY_TAG = {
  tank: {
    title: 'Contre tanks / frontline',
    itemIds: [3036, 3153, 3071, 3135, 4633],
    focus: 'Pénétration + dégâts soutenus (pas seulement du burst)',
    tip: 'Priorise la pénétration et le DPS. Évite de stack uniquement de la lethality si tu ne peux pas one-shot.',
  },
  assassin: {
    title: 'Contre assassins / burst',
    itemIds: [3157, 3814, 3053, 3026, 3102],
    focus: 'Survie au all-in (zhonya / spell shield / GA)',
    tip: 'Garde un sort défensif pour le gap closer. Place-toi derrière ta frontline.',
  },
  poke: {
    title: 'Contre poke / siège',
    itemIds: [1054, 3111, 3065, 4401, 3143],
    focus: 'Sustain lane + résistances pour ne pas te faire chipper',
    tip: 'Ne reste pas sous le poke gratuit. Cherche une fenêtre d’engage ou un timing de rappel plus sain.',
  },
  heal: {
    title: 'Contre soins / sustain',
    itemIds: [3165, 6609, 3075, 8010],
    focus: 'Anti-heal (Grievous Wounds) dès que le sustain gêne',
    tip: 'Applique l’anti-heal dès le 1er–2e item situationnel si leurs soins portent les fights.',
  },
  cc: {
    title: 'Contre beaucoup de CC',
    itemIds: [3111, 3139, 3222, 6035],
    focus: 'Tenacity / QSS / purification des contrôles',
    tip: 'Vision + spacing. Un QSS bien timed peut gagner le fight à lui seul.',
  },
  adc: {
    title: 'Contre ADC / crit carry',
    itemIds: [3047, 3143, 3157, 3068],
    focus: 'Armure efficace + accès à la backline',
    tip: 'Le carry scale : engage ciblé ou coupe sa farm en mid-game.',
  },
  ap: {
    title: 'Contre AP / mages',
    itemIds: [3065, 4401, 3102, 3152, 3814],
    focus: 'Résistance magique + spell shield',
    tip: 'Respecte les cooldowns de poke. Un Voile de la banquise bien timed annule souvent le premier engage.',
  },
  ad: {
    title: 'Contre AD / bruisers',
    itemIds: [3047, 3075, 3143, 3742, 3053],
    focus: 'Armure + duel / désengage',
    tip: 'Évite les duels longs sans item défensif. Kite ou trade court selon ton kit.',
  },
}

/**
 * Guides courts « comment jouer » (échantillon V1).
 * @type {Record<string, { name: string, role: string, aliases: string[], summary: string, early: string, mid: string, late: string, mistakes: string[] }>}
 */
export const PORO_CHAMPION_GUIDES = {
  ahri: {
    name: 'Ahri',
    role: 'Mid',
    aliases: ['ahri'],
    summary: 'Mage mobile : poke avec Q, setup charme (E), all-in avec ult pour finir.',
    early: 'Farm safe, poke au Q quand l’adversaire last-hit. Ne force pas E sans vision.',
    mid: 'Roam bot/top après shove. Ult pour reposition, pas pour engager tête baissée.',
    late: 'Cherche le charme sur le carry. Garde 1–2 charges d’ult pour sortir du fight.',
    mistakes: ['Ult dans 5 sans vision', 'Overstay après un kill', 'Ignorer le side wave'],
  },
  jinx: {
    name: 'Jinx',
    role: 'ADC',
    aliases: ['jinx'],
    summary: 'Hypercarry : scale, wave clear rockets, reset sur kills.',
    early: 'Farm propre, respecte les all-ins. Utilise les rockets pour poke sous conditions.',
    mid: 'Push + herald/dragon setup. Positionne-toi pour reset (pas trop en avant).',
    late: 'DPS max en backline. Ne chase pas sans flash si l’équipe n’a plus de CC.',
    mistakes: ['Trop agressive pré-2 items', 'Pas de control wards', 'Chase sans vision'],
  },
  thresh: {
    name: 'Thresh',
    role: 'Support',
    aliases: ['thresh'],
    summary: 'Support engage/peel : hook, lanterne, flay pour setup ou sauvetage.',
    early: 'Hook sur last-hit adverse. Lanterne pour secure ou roam jungler.',
    mid: 'Vision deep + roam mid. Flay pour annuler dashes.',
    late: 'Peel ton ADC en priorité sauf engage évident sur carry adverse.',
    mistakes: ['Hook greed sans follow-up', 'Lanterne mal placée', 'Ignorer la vision'],
  },
  leeSin: {
    name: 'Lee Sin',
    role: 'Jungle',
    aliases: ['lee', 'lee sin', 'leesin'],
    summary: 'Jungler early-game : ganks forts, invade, impact avant que les carries scalent.',
    early: 'Full clear ou gank level 3 selon path. Ward hop pour inattendus.',
    mid: 'Cherche Herald / objectifs. Ne farm pas passivement si ta bot est derrière.',
    late: 'Tu tombes en late : joue utility (kick, vision) plutôt que carry.',
    mistakes: ['Force trop de 1v2', 'Skip objectifs après un kill', 'Stay trop longtemps en late'],
  },
  darius: {
    name: 'Darius',
    role: 'Top',
    aliases: ['darius'],
    summary: 'Juggernaut : stacks de saignement, all-in après pull / slow.',
    early: 'Trade court avec Q heal sur bord. Respecte les ranges de poke.',
    mid: 'TP bot pour snowball. Force les side waves.',
    late: 'Tu es une frontline menaçante : engage si ton équipe peut follow, sinon zone.',
    mistakes: ['Q manqué = trade perdu', 'Chase trop loin', 'Ignorer anti-heal adverse'],
  },
  lux: {
    name: 'Lux',
    role: 'Mid / Support',
    aliases: ['lux'],
    summary: 'Poke + snare : contrôle la wave, punch ultime sur cibles immobilisées.',
    early: 'Poke E, snare pour setup. Ne spam pas mana.',
    mid: 'Roam avec ult global-ish timing. Ward river.',
    late: 'Ult pour execute / wave. Reste derrière — tu es squishy.',
    mistakes: ['Ult sans snare', 'Glass cannon sans vision', 'Overpush solo'],
  },
}

/**
 * Questions de quiz V1.
 * @type {{ id: string, question: string, choices: string[], answerIndex: number, explain: string, tags: string[] }[]}
 */
export const PORO_QUIZ_BANK = [
  {
    id: 'q1',
    question: 'Contre une équipe très « sustain / soins », quel type d’effet prioriser ?',
    choices: ['Anti-heal (Grievous Wounds)', 'Uniquement lethality', 'Uniquement mana', 'Ignore items, full AP'],
    answerIndex: 0,
    explain: 'L’anti-heal réduit fortement les soins et le vamp — crucial vs Soraka, Aatrox, WW, etc.',
    tags: ['items', 'heal'],
  },
  {
    id: 'q2',
    question: 'Tu joues ADC hypercarry (ex. Jinx). En late game, où te placer idéalement ?',
    choices: ['Premier engage en face', 'Backline derrière ta frontline', 'Solo side sans vision', 'Jungle adverse AFK farm'],
    answerIndex: 1,
    explain: 'Les hypercarries gagnent en DPS s’ils restent en vie : spacing + peel > hero plays.',
    tags: ['macro', 'adc'],
  },
  {
    id: 'q3',
    question: 'Beaucoup de CC ennemi (Malphite, Leona…). Quelle stat / item aide souvent ?',
    choices: ['Crit uniquement', 'Tenacity / QSS / Mercure', 'Plus de mana', 'Ignore le CC'],
    answerIndex: 1,
    explain: 'Tenacity et QSS/Mercure réduisent l’impact des chaînes de CC.',
    tags: ['items', 'cc'],
  },
  {
    id: 'q4',
    question: 'Tu as un avantage early en jungle (Lee Sin). Que viser en priorité ?',
    choices: ['Farmer passivement jusqu’au 30 min', 'Objectifs (Herald/Dragon) + ganks snowball', 'FF 15', 'Full clear sans gank jamais'],
    answerIndex: 1,
    explain: 'Les junglers early convertissent l’avance en objectifs et pression de map.',
    tags: ['jungle', 'macro'],
  },
  {
    id: 'q5',
    question: 'Avant un engage risqué sans vision, le réflexe le plus sûr est…',
    choices: ['Flash in anyway', 'Ward / vision + info sur CDs adverses', 'Afk sous tour', 'Vendre tous les items'],
    answerIndex: 1,
    explain: 'La vision et le tracking des cooldowns évitent les int gratuit.',
    tags: ['vision', 'macro'],
  },
]

export const PORO_WELCOME = `Salut, moi c’est **Poro** — ton assistant LoL sur BetterMe.

Je peux t’aider à :
• **Builds** pour **ton** champion vs la compo (pas juste des catégories)
• **Guides** + **sorts** (ex. « R de Wukong »)
• **Debrief** d’une partie ouverte (tier de lane S→E, farm, runes, items)
• **Pick / draft** : « quel champion avec … contre … » (croisé avec **ton pool**)
• **Coach de pool / climb** : « je stagne mid », pause si session tilt
• **Mémoire** riche (poste, mains, style, objectif) + **quiz**

Ouvre un match dans la liste LoL pour lier le contexte. **Effacer** remet la discussion à zéro.`

export const PORO_HELP = `Exemples :
• « Build Veigar ADC contre Miss Fortune »
• « Quels items j’aurais dû build ? » (après analyse d’une partie)
• « Quel champion mid contre Yasuo Zed Katarina »
• « Qui jouer avec Ornn Lulu contre Malphite Syndra Jinx »
• « Draft ADC bans Aphelios Zeri, contre Ashe Nautilus »
• « Comment jouer Zac en jungle ? »
• « Analyse cette partie » / « Matchup lane » / « ma rune ? »
• « Je stagne mid » / « coach pool » / « session perdue »
• « Souviens-toi que je joue mid agressif pour grind LP »
• « Souviens-toi que je main Orianna Ahri » / « Qu’est-ce que tu retiens sur moi ? »
• « Quiz »

Couleurs : items dorés, sorts cyan, champions rose, postes verts.
Builds / picks / coach = heuristiques Data Dragon + ton historique (pas un scrape u.gg).
Le **matchup lane** (tier S→E) porte sur la **partie ouverte**, pas une liste counters méta.`
