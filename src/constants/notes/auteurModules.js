/**
 * Suite « Auteur » — modules (sous-extensions) et préférences.
 */

/** @typedef {'repetitions'|'genealogy'|'timeline'|'style'|'synonyms'|'plots'|'structure'} AuteurModuleId */
/** @typedef {'note'|'world'} AuteurModuleScope */

/**
 * @type {{
 *   id: AuteurModuleId,
 *   name: string,
 *   shortName: string,
 *   description: string,
 *   details: string,
 *   defaultEnabled: boolean,
 *   scope: AuteurModuleScope,
 * }[]}
 */
export const AUTEUR_MODULES = [
  {
    id: 'repetitions',
    name: 'Détecteur de répétitions',
    shortName: 'Répétitions',
    description: 'Signale les mots trop proches dans le texte.',
    details:
      'Souligne les répétitions selon la portée choisie (phrase, paragraphe, fenêtre de mots).\n\nIgnore les mots-outils, les noms propres et les personnages des fiches. Propose synonymes et exceptions (dialogues, anaphores).',
    defaultEnabled: false,
    scope: 'note',
  },
  {
    id: 'style',
    name: 'Analyse du style',
    shortName: 'Style',
    description: 'Indicateurs d’écriture sans jugement (seuils réglables).',
    details:
      'Longueur des phrases, rythme, adverbes en -ment, passif possible, mots de remplissage.\n\nFonctionne sur la note ou une sélection.',
    defaultEnabled: false,
    scope: 'note',
  },
  {
    id: 'synonyms',
    name: 'Dictionnaire de synonymes',
    shortName: 'Synonymes',
    description: 'Synonymes hors-ligne à partir d’un mot sélectionné.',
    details:
      'Fenêtre locale (thésaurus embarqué). Remplacement en un clic en conservant la majuscule.\n\nSe relie au détecteur de répétitions. Les formes conjuguées partent de la forme de base.',
    defaultEnabled: false,
    scope: 'note',
  },
  {
    id: 'genealogy',
    name: 'Arbre & relations',
    shortName: 'Arbre',
    description: 'Arbre généalogique et graphe de relations depuis les fiches.',
    details:
      'Deux vues : arbre (générations, unions, adoptions) et graphe (alliés, ennemis, amours…).\n\nAccessible au niveau du coffre (pas lié à une note). Détecte les incohérences d’âge / de parenté.',
    defaultEnabled: false,
    scope: 'world',
  },
  {
    id: 'timeline',
    name: 'Frise chronologique',
    shortName: 'Frise',
    description: 'Place événements, naissances et décès sur une ligne de temps.',
    details:
      'Calendrier personnalisable, couloirs par personnage ou arc.\n\nVue coffre : vérifie présence avant naissance, doubles lieux, dépendances.',
    defaultEnabled: false,
    scope: 'world',
  },
  {
    id: 'plots',
    name: 'Suivi des intrigues',
    shortName: 'Intrigues',
    description: 'Fils narratifs, jalons et alertes de promesses oubliées.',
    details:
      'Tableau par statut, grille fil × scènes.\n\nVue coffre ; dépend du plan pour l’ordre des scènes.',
    defaultEnabled: false,
    scope: 'world',
  },
  {
    id: 'structure',
    name: 'Plan et structure',
    shortName: 'Plan',
    description: 'Modèles d’histoire, scènes et avancement.',
    details:
      'Trois actes, voyage du héros, schéma quinaire…\n\nVue coffre : structure, scènes rattachées, objectifs de mots.',
    defaultEnabled: false,
    scope: 'world',
  },
]

export const AUTEUR_NOTE_MODULES = AUTEUR_MODULES.filter((m) => m.scope === 'note')
export const AUTEUR_WORLD_MODULES = AUTEUR_MODULES.filter((m) => m.scope === 'world')

export const AUTEUR_MODULE_IDS = AUTEUR_MODULES.map((m) => m.id)

export const AUTEUR_EXTENSION_ID = 'auteur'

export const AUTEUR_REPETITION_SCOPES = [
  { id: 'sentence', label: 'Dans la phrase' },
  { id: 'paragraph', label: 'Dans le paragraphe' },
  { id: 'window', label: 'Fenêtre de mots' },
]

/**
 * @returns {{ noteIds: string[], folderIds: string[] }}
 */
export function createEmptyAuteurExclusion() {
  return { noteIds: [], folderIds: [] }
}

export function createDefaultAuteurPrefs() {
  return {
    modules: Object.fromEntries(AUTEUR_MODULES.map((m) => [m.id, m.defaultEnabled])),
    /** Exclusions par module : notes et dossiers ignorés. */
    exclusions: Object.fromEntries(
      AUTEUR_MODULE_IDS.map((id) => [id, createEmptyAuteurExclusion()]),
    ),
    repetitions: {
      scope: 'paragraph',
      windowSize: 50,
      ignoreDialogues: false,
      detectAnaphora: true,
      detectPhrases: true,
      sortBy: 'proximity',
    },
    style: {
      longSentenceWords: 40,
      adverbDensityPer100: 3,
      fillerDensityPer100: 4,
      highlightAdverbs: true,
      highlightPassive: true,
      highlightFillers: true,
      showVocab: true,
      showDialogueShare: true,
    },
    genealogy: {
      focusCharacterId: null,
      ancestorGens: 3,
      descendantGens: 3,
    },
    timeline: {
      zoom: 'year',
      laneMode: 'none',
      storyOrder: 'histoire',
      filterCharacterId: null,
    },
  }
}

/**
 * @param {import('./auteurWorld.js').AuteurPrefs|null|undefined} prefs
 * @param {AuteurModuleId} moduleId
 * @param {{ id?: string|null, folder_id?: string|null }|null|undefined} note
 */
export function isNoteExcludedFromAuteurModule(prefs, moduleId, note) {
  if (!note?.id) return false
  const ex = prefs?.exclusions?.[moduleId]
  if (!ex) return false
  if ((ex.noteIds || []).includes(note.id)) return true
  const folderId = note.folder_id ?? null
  if (folderId && (ex.folderIds || []).includes(folderId)) return true
  return false
}

/**
 * @param {unknown} raw
 * @returns {import('./auteurWorld.js').AuteurPrefs}
 */
export function mergeAuteurPrefs(raw) {
  const defaults = createDefaultAuteurPrefs()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults
  const src = /** @type {Record<string, unknown>} */ (raw)
  const modules = { ...defaults.modules }
  if (src.modules && typeof src.modules === 'object' && !Array.isArray(src.modules)) {
    for (const id of AUTEUR_MODULE_IDS) {
      if (typeof src.modules[id] === 'boolean') modules[id] = src.modules[id]
    }
  }
  /** @type {Record<string, { noteIds: string[], folderIds: string[] }>} */
  const exclusions = { ...defaults.exclusions }
  if (src.exclusions && typeof src.exclusions === 'object' && !Array.isArray(src.exclusions)) {
    for (const id of AUTEUR_MODULE_IDS) {
      const rawEx = src.exclusions[id]
      if (!rawEx || typeof rawEx !== 'object') continue
      exclusions[id] = {
        noteIds: Array.isArray(rawEx.noteIds) ? rawEx.noteIds.map(String) : [],
        folderIds: Array.isArray(rawEx.folderIds) ? rawEx.folderIds.map(String) : [],
      }
    }
  }

  return {
    modules,
    exclusions,
    repetitions: {
      ...defaults.repetitions,
      ...(typeof src.repetitions === 'object' && src.repetitions && !Array.isArray(src.repetitions)
        ? src.repetitions
        : {}),
    },
    style: {
      ...defaults.style,
      ...(typeof src.style === 'object' && src.style && !Array.isArray(src.style) ? src.style : {}),
    },
    genealogy: {
      ...defaults.genealogy,
      ...(typeof src.genealogy === 'object' && src.genealogy && !Array.isArray(src.genealogy)
        ? src.genealogy
        : {}),
    },
    timeline: {
      ...defaults.timeline,
      ...(typeof src.timeline === 'object' && src.timeline && !Array.isArray(src.timeline)
        ? src.timeline
        : {}),
    },
  }
}

/** Modèles de structure narrative. */
export const AUTEUR_STRUCTURE_MODELS = [
  {
    id: 'three-acts',
    name: 'Trois actes',
    steps: [
      {
        id: 'act1',
        name: 'Acte I — Exposition',
        pct: 25,
        blurb: 'Monde, héros, incident déclencheur.',
        questions: ['Que veut le personnage ?', 'Qu’est-ce qui brise le quotidien ?'],
      },
      {
        id: 'act2',
        name: 'Acte II — Confrontation',
        pct: 50,
        blurb: 'Obstacles, milieu, point bas.',
        questions: ['Quels obstacles montent ?', 'Quel point de non-retour ?'],
      },
      {
        id: 'act3',
        name: 'Acte III — Résolution',
        pct: 25,
        blurb: 'Climax et dénouement.',
        questions: ['Comment le conflit se résout-il ?', 'Que change le monde ?'],
      },
    ],
  },
  {
    id: 'heros-journey',
    name: 'Voyage du héros',
    steps: [
      { id: 'ordinary', name: 'Monde ordinaire', pct: 10, blurb: 'La vie avant l’appel.', questions: ['Quel est le confort du héros ?'] },
      { id: 'call', name: 'Appel à l’aventure', pct: 10, blurb: 'L’invitation au départ.', questions: ['Qui / quoi appelle ?'] },
      { id: 'refusal', name: 'Refus / mentor', pct: 10, blurb: 'Hésitation puis aide.', questions: ['Pourquoi refuse-t-il ?'] },
      { id: 'threshold', name: 'Seuil', pct: 10, blurb: 'Entrée dans le monde spécial.', questions: ['Quel premier test ?'] },
      { id: 'trials', name: 'Épreuves', pct: 20, blurb: 'Alliés, ennemis, apprentissages.', questions: ['Quelles leçons ?'] },
      { id: 'ordeal', name: 'Épreuve centrale', pct: 15, blurb: 'Mort / renaissance symbolique.', questions: ['Que risque-t-il de perdre ?'] },
      { id: 'reward', name: 'Récompense', pct: 10, blurb: 'Ce qui est gagné.', questions: ['Quel objet / savoir ?'] },
      { id: 'road-back', name: 'Chemin du retour', pct: 8, blurb: 'Poursuite / conséquence.', questions: ['Qui le poursuit ?'] },
      { id: 'return', name: 'Retour transformé', pct: 7, blurb: 'Élixir pour le monde ordinaire.', questions: ['Que ramène-t-il ?'] },
    ],
  },
  {
    id: 'quinaire',
    name: 'Schéma quinaire',
    steps: [
      { id: 'situation', name: 'Situation initiale', pct: 15, blurb: 'État stable.', questions: ['Qui, où, quand ?'] },
      { id: 'perturbation', name: 'Perturbation', pct: 15, blurb: 'Élément perturbateur.', questions: ['Qu’est-ce qui change ?'] },
      { id: 'action', name: 'Péripéties', pct: 40, blurb: 'Actions pour résoudre.', questions: ['Quelles tentatives ?'] },
      { id: 'resolution', name: 'Dénouement', pct: 15, blurb: 'Issue du conflit.', questions: ['Qui gagne / perd ?'] },
      { id: 'finale', name: 'Situation finale', pct: 15, blurb: 'Nouvel équilibre.', questions: ['Quel monde après ?'] },
    ],
  },
  {
    id: 'kishotenketsu',
    name: 'Kishōtenketsu',
    steps: [
      { id: 'ki', name: 'Ki — Introduction', pct: 25, blurb: 'Présentation.', questions: ['Que pose-t-on ?'] },
      { id: 'sho', name: 'Shō — Développement', pct: 25, blurb: 'Développement sans conflit forcé.', questions: ['Comment ça s’approfondit ?'] },
      { id: 'ten', name: 'Ten — Twist', pct: 25, blurb: 'Tournant inattendu.', questions: ['Quel écart ?'] },
      { id: 'ketsu', name: 'Ketsu — Conclusion', pct: 25, blurb: 'Réconciliation des fils.', questions: ['Comment tout se relie ?'] },
    ],
  },
]
