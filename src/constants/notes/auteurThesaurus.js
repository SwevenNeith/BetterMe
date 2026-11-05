/**
 * Thésaurus FR embarqué (extrait libre — formes de base).
 * Extensible ; pas d’appel réseau.
 */

/** @type {Record<string, { senses: { gloss: string, synonyms: string[] }[], antonyms?: string[], definition?: string }>} */
export const AUTEUR_THESAURUS = {
  marcher: {
    definition: 'Se déplacer à pied.',
    senses: [
      { gloss: 'se déplacer', synonyms: ['avancer', 'cheminer', 'aller', 'se diriger', 'progresser'] },
      { gloss: 'fonctionner', synonyms: ['fonctionner', 'opérer', 'touruler'] },
    ],
    antonyms: ['s’arrêter', 'stationner', 'rester'],
  },
  beau: {
    definition: 'Qui plaît à la vue ou à l’esprit.',
    senses: [
      { gloss: 'apparence', synonyms: ['joli', 'magnifique', 'splendide', 'élégant', 'ravissant'] },
      { gloss: 'qualité morale', synonyms: ['noble', 'généreux', 'admirable'] },
    ],
    antonyms: ['laid', 'affreux', 'vilain'],
  },
  maison: {
    definition: 'Bâtiment d’habitation.',
    senses: [
      { gloss: 'habitation', synonyms: ['demeure', 'foyer', 'logis', 'habitation', 'pavillon'] },
      { gloss: 'lignée', synonyms: ['famille', 'dynastie', 'lignée'] },
    ],
  },
  regarder: {
    definition: 'Porter la vue sur.',
    senses: [
      { gloss: 'voir', synonyms: ['observer', 'contempler', 'examiner', 'scruter', 'fixer'] },
    ],
    antonyms: ['ignorer', 'détourner'],
  },
  dire: {
    definition: 'Exprimer par la parole.',
    senses: [
      { gloss: 'exprimer', synonyms: ['affirmer', 'déclarer', 'annoncer', 'prononcer', 'exprimer'] },
      { gloss: 'raconter', synonyms: ['raconter', 'narrar', 'relater', 'conter'] },
    ],
  },
  peur: {
    definition: 'Sentiment face à un danger.',
    senses: [
      { gloss: 'crainte', synonyms: ['crainte', 'effroi', 'terreur', 'angoisse', 'appréhension'] },
    ],
    antonyms: ['courage', 'audace', 'sérénité'],
  },
  amour: {
    definition: 'Sentiment d’affection profonde.',
    senses: [
      { gloss: 'affection', synonyms: ['affection', 'tendresse', 'passion', 'attachement'] },
    ],
    antonyms: ['haine', 'indifférence'],
  },
  sombre: {
    definition: 'Peu éclairé ; triste.',
    senses: [
      { gloss: 'obscur', synonyms: ['obscur', 'ténébreux', 'noir', 'ombragé'] },
      { gloss: 'humeur', synonyms: ['morose', 'mélancolique', 'triste', 'lugubre'] },
    ],
    antonyms: ['clair', 'lumineux', 'joyeux'],
  },
  rapidement: {
    definition: 'Avec vitesse.',
    senses: [{ gloss: 'vite', synonyms: ['vite', 'promptement', 'soudainement', 'immédiatement'] }],
    antonyms: ['lentement', 'doucement'],
  },
  chose: {
    definition: 'Objet indéterminé.',
    senses: [
      { gloss: 'objet', synonyms: ['objet', 'élément', 'affaire', 'entité'] },
      { gloss: 'sujet', synonyms: ['sujet', 'question', 'thème'] },
    ],
  },
  homme: {
    definition: 'Être humain de sexe masculin ; être humain.',
    senses: [
      { gloss: 'personne', synonyms: ['individu', 'personne', 'être', 'humain'] },
      { gloss: 'masculin', synonyms: ['garçon', 'monsieur', 'mec'] },
    ],
  },
  femme: {
    definition: 'Être humain de sexe féminin.',
    senses: [
      { gloss: 'personne', synonyms: ['personne', 'dame', 'demoiselle'] },
    ],
  },
  grand: {
    definition: 'De taille ou d’importance élevée.',
    senses: [
      { gloss: 'taille', synonyms: ['vaste', 'immense', 'spacieux', 'haut'] },
      { gloss: 'importance', synonyms: ['important', 'majeur', 'considérable'] },
    ],
    antonyms: ['petit', 'minuscule'],
  },
  petit: {
    definition: 'De faible taille.',
    senses: [
      { gloss: 'taille', synonyms: ['minuscule', 'réduit', 'étroit', 'court'] },
    ],
    antonyms: ['grand', 'immense'],
  },
  commencer: {
    definition: 'Entrer dans le début de.',
    senses: [
      { gloss: 'débuter', synonyms: ['débuter', 'entamer', 'entreprendre', 'amorcer', 'ouvrir'] },
    ],
    antonyms: ['finir', 'achever', 'terminer'],
  },
  finir: {
    definition: 'Mener à son terme.',
    senses: [
      { gloss: 'achever', synonyms: ['achever', 'terminer', 'conclure', 'clore'] },
    ],
    antonyms: ['commencer', 'débuter'],
  },
}

/** Lemmatisation très approximative → clé thésaurus. */
export const AUTEUR_LEMMA_HINTS = {
  marchait: 'marcher',
  marchais: 'marcher',
  marchant: 'marcher',
  marche: 'marcher',
  marchons: 'marcher',
  belles: 'beau',
  belle: 'beau',
  beaux: 'beau',
  bel: 'beau',
  regardait: 'regarder',
  regardent: 'regarder',
  dit: 'dire',
  disait: 'dire',
  dire: 'dire',
  peurs: 'peur',
  amours: 'amour',
  hommes: 'homme',
  femmes: 'femme',
  grande: 'grand',
  grandes: 'grand',
  grands: 'grand',
  petite: 'petit',
  petites: 'petit',
  petits: 'petit',
  commence: 'commencer',
  commençait: 'commencer',
  finit: 'finir',
  finissait: 'finir',
  maisons: 'maison',
  rapidement: 'rapidement',
  choses: 'chose',
}
