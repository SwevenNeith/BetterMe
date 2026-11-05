/**
 * Monde narratif Auteur (personnages, relations, événements, intrigues, plan).
 */

/**
 * @typedef {object} AuteurPrefs
 * @property {Record<string, boolean>} modules
 * @property {object} repetitions
 * @property {object} style
 * @property {object} genealogy
 * @property {object} timeline
 */

/**
 * @typedef {object} AuteurCharacter
 * @property {string} id
 * @property {string} name
 * @property {string[]} [aliases]
 * @property {string} [camp]
 * @property {string|null} [birth] ISO-like or calendar string
 * @property {string|null} [death]
 * @property {string} [summary]
 * @property {boolean} [ghost]
 * @property {string|null} [noteId]
 */

/**
 * @typedef {object} AuteurRelation
 * @property {string} id
 * @property {string} fromId
 * @property {string} toId
 * @property {'family'|'ally'|'enemy'|'love'|'other'} type
 * @property {string} [subtype] parent|child|spouse|sibling|adopted|…
 * @property {boolean} [ended]
 * @property {string|null} [validFrom]
 * @property {string|null} [validTo]
 * @property {string} [label]
 */

/**
 * @typedef {object} AuteurEvent
 * @property {string} id
 * @property {string} title
 * @property {string|null} [start]
 * @property {string|null} [end]
 * @property {string[]} [characterIds]
 * @property {string|null} [place]
 * @property {string[]} [themes]
 * @property {string[]} [dependsOn]
 * @property {number|null} [storyOrder]
 * @property {string|null} [noteId]
 * @property {string} [arc]
 */

/**
 * @typedef {object} AuteurPlot
 * @property {string} id
 * @property {string} title
 * @property {'main'|'subplot'|'mystery'|'character'|'chekhov'|'other'} kind
 * @property {'open'|'active'|'resolved'|'intentionally-open'} status
 * @property {string} [description]
 * @property {string[]} [characterIds]
 * @property {{ id: string, sceneId: string, role: 'open'|'advance'|'resolve', label?: string }[]} beats
 */

/**
 * @typedef {object} AuteurScene
 * @property {string} id
 * @property {string} title
 * @property {string|null} [noteId]
 * @property {string|null} [stepId]
 * @property {string|null} [chapter]
 * @property {'idea'|'outline'|'draft'|'revised'|'done'} [status]
 * @property {number} [wordCount]
 * @property {number} [order]
 */

/**
 * @returns {object}
 */
export function createDefaultAuteurWorld() {
  return {
    calendar: {
      mode: 'ymd',
      eraName: '',
      yearZeroLabel: '0',
      months: [
        { name: 'Janvier', days: 31 },
        { name: 'Février', days: 28 },
        { name: 'Mars', days: 31 },
        { name: 'Avril', days: 30 },
        { name: 'Mai', days: 31 },
        { name: 'Juin', days: 30 },
        { name: 'Juillet', days: 31 },
        { name: 'Août', days: 31 },
        { name: 'Septembre', days: 30 },
        { name: 'Octobre', days: 31 },
        { name: 'Novembre', days: 30 },
        { name: 'Décembre', days: 31 },
      ],
    },
    characters: /** @type {AuteurCharacter[]} */ ([]),
    relations: /** @type {AuteurRelation[]} */ ([]),
    events: /** @type {AuteurEvent[]} */ ([]),
    plots: /** @type {AuteurPlot[]} */ ([]),
    structure: {
      modelId: 'three-acts',
      customSteps: null,
      scenes: /** @type {AuteurScene[]} */ ([]),
      wordGoal: 80000,
    },
    layouts: {
      tree: {},
      graph: {},
    },
    ignoreWords: {
      global: /** @type {string[]} */ ([]),
      byNote: /** @type {Record<string, string[]>} */ ({}),
    },
    styleExtras: {
      adverbExceptions: /** @type {string[]} */ ([]),
      fillers: /** @type {string[]} */ ([]),
    },
  }
}

/**
 * @param {unknown} raw
 */
export function mergeAuteurWorld(raw) {
  const defaults = createDefaultAuteurWorld()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults
  const src = /** @type {Record<string, any>} */ (raw)
  return {
    calendar: {
      ...defaults.calendar,
      ...(src.calendar && typeof src.calendar === 'object' ? src.calendar : {}),
      months: Array.isArray(src.calendar?.months) ? src.calendar.months : defaults.calendar.months,
    },
    characters: Array.isArray(src.characters) ? src.characters : [],
    relations: Array.isArray(src.relations) ? src.relations : [],
    events: Array.isArray(src.events) ? src.events : [],
    plots: Array.isArray(src.plots) ? src.plots : [],
    structure: {
      ...defaults.structure,
      ...(src.structure && typeof src.structure === 'object' ? src.structure : {}),
      scenes: Array.isArray(src.structure?.scenes) ? src.structure.scenes : [],
    },
    layouts: {
      tree: src.layouts?.tree && typeof src.layouts.tree === 'object' ? src.layouts.tree : {},
      graph: src.layouts?.graph && typeof src.layouts.graph === 'object' ? src.layouts.graph : {},
    },
    ignoreWords: {
      global: Array.isArray(src.ignoreWords?.global) ? src.ignoreWords.global : [],
      byNote:
        src.ignoreWords?.byNote && typeof src.ignoreWords.byNote === 'object'
          ? src.ignoreWords.byNote
          : {},
    },
    styleExtras: {
      adverbExceptions: Array.isArray(src.styleExtras?.adverbExceptions)
        ? src.styleExtras.adverbExceptions
        : [],
      fillers: Array.isArray(src.styleExtras?.fillers) ? src.styleExtras.fillers : [],
    },
  }
}

/** Mots-outils FR (ignorés par le détecteur de répétitions). */
export const AUTEUR_STOPWORDS_FR = new Set(
  `
a à afin ai aie aient aies ait alors après as assez au aucun aucune
aussi aussitôt autour autre autres aux avaient avais avait avant avec
avez aviez avions avoir avons ayant ayez ayons bon car ce ceci cela
celle celles celui celui-ci celui-là celà cependant certain certaine
certaines certains ces cet cette ceux ceux-ci ceux-là chacun chacune
chez ci combien comme comment concernant contre d dans de des du dès
déjà demain depuis desquelles desquels deux devoir devrait devraient
devrait devoirs dire dit dois doit donc dont duquel déjà elle elles
en encore enfin entre ensuite es est et étaient étais était étant etc
êtes étiez étions être eu eue eues euh eûmes eurent eus eut eûtes eux
faire fais fait faites ferai fera feront font furent fus fut fûtes
grâce haut hors ici il ils j je jusqu juste l la là laquelle le lequel
les lesquelles lesquels leur leurs lui ma mais me même mêmes merci
mes moi moins mon moyennant ne ni non nos notre nous nouveau nouveaux
nul nulle on ont ou où oui par parce parfois parmi pas pendant peu
peut peuvent peux plus plusieurs plutôt pour pourquoi pourtant
pourrait pouvaient pouvait pouvoir près presque puis puisque qu
quand quant que quel quelle quelles quels qui quiconque quoi quoique
sa sans sauf se sera seraient serais serait serez seriez serions
serons seront ses si sien sienne siennes siens soi soit sommes son
sont sous souvent soyez soyons suis sur t ta tandis tant te tel
telle telles tels tes toi ton toujours tous tout toute toutes très
trop tu un une uns unes vers voici voilà vos votre vous y
`.trim().split(/\s+/),
)

/** Remplissage (style) — distinct des mots-outils. */
export const AUTEUR_DEFAULT_FILLERS = [
  'très',
  'vraiment',
  'assez',
  'juste',
  'simplement',
  'chose',
  'trucs',
  'truc',
  'en fait',
  'genre',
  'un peu',
  'plutôt',
  'clairement',
  'évidemment',
  'carrément',
  'littéralement',
]

/** Faux adverbes en -ment. */
export const AUTEUR_ADVERB_EXCEPTIONS = [
  'moment',
  'moments',
  'vêtement',
  'vêtements',
  'sentiment',
  'sentiments',
  'document',
  'documents',
  'instrument',
  'instruments',
  'parlement',
  'parlements',
  'firmament',
  'ciment',
  'ciments',
  'aiment',
  'aiment',
  'comment',
  'souvent',
]

export const AUTEUR_RELATION_COLORS = {
  ally: '#2f9e44',
  enemy: '#e03131',
  love: '#e64980',
  family: '#868e96',
  other: '#748ffc',
}
