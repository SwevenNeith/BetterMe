import { NOTE_TEMPLATE_VARIABLES } from './noteTemplates.js'

/** Clé système du tutoriel Markdown (une note max par utilisateur). */
export const MARKDOWN_TUTORIAL_SYSTEM_KEY = 'markdown-tutorial'

export const MARKDOWN_TUTORIAL_TITLE = 'Tutoriel Markdown'

export const MARKDOWN_TUTORIAL_TEMPLATE_SECTION_MARKER = '## 13. Templates'

/**
 * Section Templates pour le tutoriel Markdown (générée depuis NOTE_TEMPLATE_VARIABLES).
 */
export function buildMarkdownTutorialTemplateSection() {
  const groups = [
    { label: 'Titres', category: 'titre' },
    { label: 'Dates', category: 'date' },
    { label: 'Heures', category: 'heure' },
  ]

  let section = `${MARKDOWN_TUTORIAL_TEMPLATE_SECTION_MARKER} (extension Notes)

L’extension **Templates** pré-remplit automatiquement les nouvelles notes à partir de modèles.
Active-la dans les extensions Notes, configure ton dossier Templates, puis insère ces variables dans tes modèles.
Elles sont remplacées à la création de la note.

### Syntaxe

Utilise la forme \`{{nom-de-la-variable}}\` (doubles accolades).

### Exemple de modèle

\`\`\`md
{{titre-h1}}

**Date :** {{date}}
**Heure :** {{heure}}

## Notes
-
\`\`\`

### Variables disponibles

`

  for (const group of groups) {
    const items = NOTE_TEMPLATE_VARIABLES.filter((item) => item.category === group.category)
    section += `#### ${group.label}\n\n`
    section += '| Variable | Description |\n| --- | --- |\n'
    for (const variable of items) {
      const aliasHint =
        variable.aliases?.length > 0
          ? ` Alias : ${variable.aliases.map((alias) => `\`{{${alias}}}\``).join(', ')}.`
          : ''
      section += `| \`${variable.example}\` | ${variable.description}${aliasHint} |\n`
    }
    section += '\n'
  }

  section += `> Les notes créées **dans** le dossier Templates ne sont jamais pré-remplies : ce sont tes sources de modèles.

`

  return section.trimEnd()
}

/**
 * Ajoute la section Templates à un tutoriel existant si elle manque.
 * @param {string} content
 */
export function appendTemplateSectionToTutorial(content) {
  const raw = String(content ?? '')
  if (raw.includes(MARKDOWN_TUTORIAL_TEMPLATE_SECTION_MARKER)) return raw

  const section = buildMarkdownTutorialTemplateSection()
  const footer = '*Bonnes notes !*'
  if (raw.includes(footer)) {
    return raw.replace(footer, `${section}\n\n---\n\n${footer}`)
  }

  return `${raw.trim()}\n\n---\n\n${section}\n`
}

/**
 * Contenu du tutoriel Markdown (GFM + syntaxe courante type Obsidian).
 */
export const MARKDOWN_TUTORIAL_CONTENT = `# Tutoriel Markdown

Bienvenue ! Cette note présente les commandes Markdown utilisables dans BetterMe.
Tu peux la modifier, la déplacer ou la **supprimer** : dans ce cas, elle ne sera pas recréée automatiquement.

---

## 1. Titres

\`\`\`md
# Titre niveau 1
## Titre niveau 2
### Titre niveau 3
#### Titre niveau 4
##### Titre niveau 5
###### Titre niveau 6
\`\`\`

### Titre niveau 3 (exemple rendu)
#### Titre niveau 4
##### Titre niveau 5

---

## 2. Emphase

| Syntaxe | Rendu |
| --- | --- |
| \`*italique*\` ou \`_italique_\` | *italique* |
| \`**gras**\` ou \`__gras__\` | **gras** |
| \`***gras italique***\` | ***gras italique*** |
| \`~~barré~~\` | ~~barré~~ |

---

## 3. Listes

### À puces

- Élément A
- Élément B
  - Sous-élément B1
  - Sous-élément B2
- Élément C

### Numérotées

1. Premier
2. Deuxième
3. Troisième

### Tâches (cases à cocher)

- [x] Tâche terminée
- [ ] Tâche à faire
- [ ] Autre tâche

---

## 4. Citations

> Une citation sur une ligne.
>
> Une deuxième ligne dans le même bloc.
>
> — Auteur

---

## 5. Code

Code en ligne : \`const x = 1\`

Bloc de code :

\`\`\`js
function salut(nom) {
  return \`Bonjour, \${nom} !\`
}
\`\`\`

\`\`\`python
def salut(nom):
    return f"Bonjour, {nom} !"
\`\`\`

---

## 6. Liens et images

Lien : [BetterMe](https://example.com)

Lien avec titre : [Documentation](https://example.com "Infobulle")

Image (syntaxe) :

\`\`\`md
![Texte alternatif](https://via.placeholder.com/320x120.png?text=Image)
\`\`\`

---

## 7. Séparateurs horizontaux

Trois tirets, astérisques ou underscores :

\`\`\`md
---
***
___
\`\`\`

---

## 8. Tableaux

| Colonne A | Colonne B | Colonne C |
| --- | :---: | ---: |
| Gauche | Centre | Droite |
| Pomme | Banane | Cerise |
| 1 | 2 | 3 |

Alignement : \`:---\` gauche, \`:---:\` centre, \`---:\` droite.

---

## 9. Échappement

Pour afficher un caractère spécial : \\\\*pas italique\\\\*, \\\\# pas un titre.

---

## 10. Liens entre notes (hyperliens internes)

Comme dans Obsidian, tu peux lier une note à une autre avec des doubles crochets.
Le titre doit correspondre **exactement** (sans tenir compte de la casse).

\`\`\`md
[[Tutoriel Markdown]]
[[Tutoriel Markdown|Ouvrir le tutoriel]]
[[Note qui n'existe pas]]
\`\`\`

Exemples rendus :

- Lien vers cette note : [[Tutoriel Markdown]]
- Lien avec libellé : [[Tutoriel Markdown|Revenir au tutoriel]]
- Lien vers une note absente (affiché en style « manquant ») : [[Ma future note]]

Astuce : clique le lien dans l’**Aperçu** (ou le panneau aperçu en Split) pour ouvrir la note liée.

---

## 11. HTML simple (supporté selon sanitisation)

Tu peux aussi utiliser quelques balises HTML sûres, par exemple :

\`\`\`html
<sub>indice</sub> et <sup>exposant</sup>
\`\`\`

Exemple : H<sub>2</sub>O et x<sup>2</sup>

---

## 12. Astuces d’édition

1. Écris en **mode Édition**, bascule en **Aperçu** pour voir le rendu.
2. Le mode **Split** affiche les deux côte à côte (scroll synchronisé).
3. Organise tes notes dans des **dossiers** (arborescence à gauche).
4. Les dossiers et notes sont triés **par ordre alphabétique** (dossiers d’abord, puis notes).
5. Utilise \`[[Titre de la note]]\` pour créer des hyperliens entre tes notes.

---

${buildMarkdownTutorialTemplateSection()}

---

*Bonnes notes !*
`
