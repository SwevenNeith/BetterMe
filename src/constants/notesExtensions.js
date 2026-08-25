/**
 * Catalogue des extensions de la page Notes (style plugins Obsidian).
 * @typedef {{
 *   id: string,
 *   name: string,
 *   description: string,
 *   details: string,
 *   defaultEnabled: boolean,
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
      'Conserve le comparatif côte à côte : quand tu scrolles dans l’éditeur Markdown, l’aperçu suit (et inversement), proportionnellement à la hauteur du contenu.',
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
    id: 'line-breaks',
    name: 'Retours à la ligne souples',
    description: 'Un simple retour à la ligne dans le Markdown devient un saut de ligne à l’écran.',
    details:
      'Avec cette option (style GFM « breaks »), chaque Enter dans l’éditeur produit un retour visuel dans l’aperçu, sans devoir ajouter deux espaces ou une ligne vide.',
    defaultEnabled: true,
  },
]

export const NOTES_EXTENSION_IDS = NOTES_EXTENSIONS.map((ext) => ext.id)

/**
 * @returns {Record<string, boolean>}
 */
export function createDefaultNotesExtensionPrefs() {
  return Object.fromEntries(NOTES_EXTENSIONS.map((ext) => [ext.id, ext.defaultEnabled]))
}
