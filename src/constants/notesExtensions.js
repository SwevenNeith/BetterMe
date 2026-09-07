/**
 * Catalogue des extensions de la page Notes (style plugins Obsidian).
 * @typedef {{
 *   id: string,
 *   name: string,
 *   description: string,
 *   details: string,
 *   defaultEnabled: boolean,
 *   hasSettings?: boolean,
 * }} NotesExtension
 */

/** @type {NotesExtension[]} */
export const NOTES_EXTENSIONS = [
  {
    id: 'wikilinks',
    name: 'Wikilinks',
    description: 'Lie tes notes entre elles avec la syntaxe [[Titre]].',
    details:
      'Active les hyperliens internes type Obsidian.\n\n• Écris [[Nom de la note]] pour créer un lien\n• Ou [[Nom de la note|Libellé]] pour un texte différent\n• Clique le lien dans l’aperçu pour ouvrir la note\n• Les liens vers une note absente apparaissent en rouge et proposent de la créer (si l’extension associée est active)',
    defaultEnabled: true,
  },
  {
    id: 'create-from-missing-link',
    name: 'Créer depuis un lien manquant',
    description: 'Propose de créer une note quand un wikilink pointe vers un titre inexistant.',
    details:
      'Quand tu cliques un lien [[…]] vers une note qui n’existe pas encore, une confirmation s’affiche pour la créer immédiatement dans le dossier courant.\n\nNécessite l’extension Wikilinks.',
    defaultEnabled: true,
  },
  {
    id: 'sync-scroll',
    name: 'Scroll synchronisé',
    description: 'En mode Split, l’édition et l’aperçu défilent ensemble.',
    details:
      'Conserve le comparatif côte à côte :\n\n• Quand tu scrolles dans l’éditeur, l’aperçu suit (et inversement)\n• Quand tu cliques ou déplaces le curseur dans l’éditeur, l’aperçu se place sur la zone correspondante pour suivre tes modifications en direct',
    defaultEnabled: true,
  },
  {
    id: 'auto-save',
    name: 'Sauvegarde automatique',
    description: 'Enregistre la note en cours après une courte pause de frappe.',
    details:
      'Dès que tu modifies le titre ou le contenu, la note est sauvegardée automatiquement après environ 0,7 s d’inactivité.\n\nTu peux toujours forcer l’enregistrement avec le bouton Enregistrer.',
    defaultEnabled: true,
  },
  {
    id: 'tree-search',
    name: 'Recherche dans l’arborescence',
    description: 'Filtre dossiers et notes via le champ Rechercher de la barre latérale.',
    details:
      'Tape quelques lettres pour n’afficher que les dossiers et notes dont le nom contient la requête.\n\nLes dossiers parents restent visibles s’ils contiennent un résultat.',
    defaultEnabled: true,
  },
  {
    id: 'dictionary-hints',
    name: 'Dictionnaire dans les notes',
    description: 'Surligne les mots du dictionnaire et affiche leur définition au survol.',
    details:
      'Les mots présents dans ton dictionnaire personnel (ou liés via une forme alternative) sont soulignés dans l’aperçu.\n\n• Survole un mot pour voir sa définition\n• Clic droit sur une sélection dans l’éditeur : Ajouter au dictionnaire ou Lier à une définition existante',
    defaultEnabled: true,
  },
  {
    id: 'line-breaks',
    name: 'Retours à la ligne souples',
    description: 'Un simple retour à la ligne dans le Markdown devient un saut de ligne à l’écran.',
    details:
      'Avec cette option (style GFM « breaks »), chaque Enter dans l’éditeur produit un retour visuel dans l’aperçu, sans devoir ajouter deux espaces ou une ligne vide.',
    defaultEnabled: true,
  },
  {
    id: 'html-widgets',
    name: 'Widgets interactifs',
    description: 'Exécute des blocs HTML/JS dans l’aperçu (tableaux cliquables, etc.).',
    details:
      'Ajoute des programmes interactifs dans tes notes via un bloc de code spécial :\n\n```widget\n<!-- ton HTML + CSS + JS -->\n```\n\n• Langages reconnus : widget, interactive, html-run\n• Affiché dans l’aperçu dans une iframe isolée (sans accès à ton compte BetterMe)\n• Les blocs ```js / ```html classiques restent du code non exécuté\n\nExemple : grille de cases colorées, clics, surbrillance…',
    defaultEnabled: true,
  },
  {
    id: 'note-status-todos',
    name: 'Statuts de notes',
    description:
      'Ajoute un statut aux notes et synchronise « À traiter » avec les TODO de la semaine.',
    details:
      'Quand cette extension est active :\n\n• Chaque note peut avoir un statut : Aucun, À traiter, Fait\n• Les Daily Notes reçoivent automatiquement le statut « À traiter » à la création\n• Une note « À traiter » apparaît dans les TODO « Cette semaine » (semaine de la mise du statut)\n• Si elle n’est pas faite en fin de semaine, elle est reportée à la semaine suivante\n• Passer une note à « Fait » coche le TODO correspondant',
    defaultEnabled: false,
  },
  {
    id: 'templates',
    name: 'Templates',
    description: 'Pré-remplit automatiquement les nouvelles notes selon des modèles et des règles.',
    details:
      'Crée un dossier Templates (ou choisis un dossier existant) dans lequel tu rédiges tes modèles.\n\n• Définis des règles : par dossier, par titre exact, par mot dans le titre, ou par défaut\n• À la création d’une note, le contenu du modèle correspondant est injecté\n• Toutes les variables ({{titre}}, {{titre-h1}}, {{date}}, etc.) sont listées dans la section **14. Templates** du Tutoriel Markdown\n\nOuvre les paramètres (⚙) après activation pour configurer le dossier et les règles.',
    defaultEnabled: false,
    hasSettings: true,
  },
]

export const NOTES_EXTENSION_IDS = NOTES_EXTENSIONS.map((ext) => ext.id)

/**
 * @returns {Record<string, boolean>}
 */
export function createDefaultNotesExtensionPrefs() {
  return Object.fromEntries(NOTES_EXTENSIONS.map((ext) => [ext.id, ext.defaultEnabled]))
}
