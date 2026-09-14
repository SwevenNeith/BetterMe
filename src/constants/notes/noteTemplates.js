/** Clé système du dossier des modèles (survit au renommage). */
export const NOTE_TEMPLATES_FOLDER_SYSTEM_KEY = 'note_templates'

/** Nom par défaut à la création (peut être renommé ensuite). */
export const NOTE_TEMPLATES_FOLDER_DEFAULT_NAME = 'Templates'

/** @typedef {'create' | 'existing'} NoteTemplateFolderSource */

/**
 * Variables insérables dans le contenu d’un modèle (syntaxe {{nom}}).
 * @type {Array<{
 *   token: string,
 *   aliases?: string[],
 *   label: string,
 *   description: string,
 *   example: string,
 *   category: 'titre' | 'date' | 'heure',
 * }>}
 */
export const NOTE_TEMPLATE_VARIABLES = [
  {
    token: 'titre',
    aliases: ['title'],
    label: 'Titre',
    description: 'Titre saisi à la création de la note (texte brut).',
    example: '{{titre}}',
    category: 'titre',
  },
  {
    token: 'titre-h1',
    aliases: ['title-h1', 'titre-1'],
    label: 'Titre niveau 1',
    description: 'Équivaut à écrire # suivi du titre.',
    example: '{{titre-h1}}',
    category: 'titre',
  },
  {
    token: 'titre-h2',
    aliases: ['title-h2', 'titre-2'],
    label: 'Titre niveau 2',
    description: 'Équivaut à ## suivi du titre.',
    example: '{{titre-h2}}',
    category: 'titre',
  },
  {
    token: 'titre-h3',
    aliases: ['title-h3', 'titre-3'],
    label: 'Titre niveau 3',
    description: 'Équivaut à ### suivi du titre.',
    example: '{{titre-h3}}',
    category: 'titre',
  },
  {
    token: 'titre-h4',
    aliases: ['title-h4', 'titre-4'],
    label: 'Titre niveau 4',
    description: 'Équivaut à #### suivi du titre.',
    example: '{{titre-h4}}',
    category: 'titre',
  },
  {
    token: 'titre-h5',
    aliases: ['title-h5', 'titre-5'],
    label: 'Titre niveau 5',
    description: 'Équivaut à ##### suivi du titre.',
    example: '{{titre-h5}}',
    category: 'titre',
  },
  {
    token: 'titre-h6',
    aliases: ['title-h6', 'titre-6'],
    label: 'Titre niveau 6',
    description: 'Équivaut à ###### suivi du titre.',
    example: '{{titre-h6}}',
    category: 'titre',
  },
  {
    token: 'date',
    label: 'Date complète',
    description: 'Date du jour en français (ex. lundi 31 août 2026).',
    example: '{{date}}',
    category: 'date',
  },
  {
    token: 'date-courte',
    aliases: ['date_courte', 'date-short'],
    label: 'Date courte',
    description: 'Format JJ/MM/AAAA.',
    example: '{{date-courte}}',
    category: 'date',
  },
  {
    token: 'date-iso',
    aliases: ['date_iso'],
    label: 'Date ISO',
    description: 'Format AAAA-MM-JJ (pratique pour les noms de fichiers).',
    example: '{{date-iso}}',
    category: 'date',
  },
  {
    token: 'jour',
    aliases: ['day'],
    label: 'Jour',
    description: 'Jour du mois sur deux chiffres (01–31).',
    example: '{{jour}}',
    category: 'date',
  },
  {
    token: 'mois',
    aliases: ['month'],
    label: 'Mois',
    description: 'Mois sur deux chiffres (01–12).',
    example: '{{mois}}',
    category: 'date',
  },
  {
    token: 'annee',
    aliases: ['year'],
    label: 'Année',
    description: 'Année sur quatre chiffres.',
    example: '{{annee}}',
    category: 'date',
  },
  {
    token: 'heure',
    aliases: ['time'],
    label: 'Heure',
    description: 'Heure locale HH:MM.',
    example: '{{heure}}',
    category: 'heure',
  },
  {
    token: 'heure-complete',
    aliases: ['heure_complete', 'time-full'],
    label: 'Heure complète',
    description: 'Heure avec secondes HH:MM:SS.',
    example: '{{heure-complete}}',
    category: 'heure',
  },
]

/** @type {Array<{ id: NoteTemplateFolderSource, label: string, hint: string }>} */
export const NOTE_TEMPLATE_FOLDER_SOURCES = [
  {
    id: 'create',
    label: 'Créer un dossier',
    hint: 'Un nouveau dossier sera créé (ou mis à jour) avec le nom choisi.',
  },
  {
    id: 'existing',
    label: 'Dossier existant',
    hint: 'Utilise un dossier déjà présent dans ton arborescence.',
  },
]

/** @typedef {'folder' | 'title-exact' | 'title-contains' | 'default'} NoteTemplateRuleType */

/** @type {Array<{ type: NoteTemplateRuleType, label: string, hint: string }>} */
export const NOTE_TEMPLATE_RULE_TYPES = [
  {
    type: 'folder',
    label: 'Dans un dossier',
    hint: 'Appliqué quand une note est créée dans le dossier choisi.',
  },
  {
    type: 'title-exact',
    label: 'Titre exact',
    hint: 'Appliqué quand le titre de la nouvelle note correspond exactement.',
  },
  {
    type: 'title-contains',
    label: 'Titre contient…',
    hint: 'Appliqué quand le titre contient le texte indiqué.',
  },
  {
    type: 'default',
    label: 'Par défaut',
    hint: 'Utilisé si aucune autre règle ne correspond.',
  },
]

/**
 * @typedef {{
 *   id: string,
 *   type: NoteTemplateRuleType,
 *   folderId?: string | null,
 *   pattern?: string,
 *   templateNoteId: string,
 * }} NoteTemplateRule
 */

/**
 * @typedef {{
 *   folderName: string,
 *   folderId: string | null,
 *   folderSource?: NoteTemplateFolderSource,
 *   rules: NoteTemplateRule[],
 * }} NoteTemplatePrefs
 */

/**
 * @returns {NoteTemplatePrefs}
 */
export function createDefaultNoteTemplatePrefs() {
  return {
    folderName: NOTE_TEMPLATES_FOLDER_DEFAULT_NAME,
    folderId: null,
    folderSource: 'create',
    rules: [],
  }
}
