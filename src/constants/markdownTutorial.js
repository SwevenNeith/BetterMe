import { NOTE_TEMPLATE_VARIABLES } from './noteTemplates.js'

/** Clé système du tutoriel Markdown (une note max par utilisateur). */
export const MARKDOWN_TUTORIAL_SYSTEM_KEY = 'markdown-tutorial'

export const MARKDOWN_TUTORIAL_TITLE = 'Tutoriel Markdown'

/** Titre de section Widgets (détecte une version à jour du tutoriel). */
export const MARKDOWN_TUTORIAL_WIDGETS_SECTION_MARKER = '## 12. Widgets interactifs'

export const MARKDOWN_TUTORIAL_TEMPLATE_SECTION_MARKER = '## 14. Templates'

const TEMPLATE_HEADING_RE = /^##\s+\d+\.\s+Templates\b/gm

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
 * @param {string} content
 */
export function countMarkdownTutorialTemplateSections(content) {
  const matches = String(content ?? '').match(TEMPLATE_HEADING_RE)
  return matches?.length ?? 0
}

/**
 * @param {string} content
 */
export function hasMarkdownTutorialTemplateSection(content) {
  return countMarkdownTutorialTemplateSections(content) > 0
}

/**
 * @param {string} content
 */
export function needsMarkdownTutorialUpgrade(content) {
  const raw = String(content ?? '')
  if (!raw.includes(MARKDOWN_TUTORIAL_WIDGETS_SECTION_MARKER)) return true
  if (countMarkdownTutorialTemplateSections(raw) !== 1) return true
  if (!raw.includes(MARKDOWN_TUTORIAL_TEMPLATE_SECTION_MARKER)) return true
  return false
}

/**
 * Ajoute la section Templates à un tutoriel existant si elle manque.
 * @param {string} content
 */
export function appendTemplateSectionToTutorial(content) {
  const raw = String(content ?? '')
  if (hasMarkdownTutorialTemplateSection(raw)) return raw

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

## 12. Widgets interactifs (HTML + JS)

Pour un **vrai programme** dans la note (grille cliquable, quiz, etc.), utilise un bloc de code dont le langage est \`widget\` (extension **Widgets interactifs**).

Le contenu s’exécute dans l’**aperçu**, dans une iframe isolée (sans accès à ton compte BetterMe).

Langages reconnus : \`widget\`, \`interactive\`, \`html-run\`.

### Exemple interactif

Grille de cases colorées : clique pour sélectionner jusqu’à **2** cases ; les cases liées passent en surbrillance.

\`\`\`widget
<style>
  .grid { display: grid; grid-template-columns: repeat(4, 44px); gap: 6px; }
  .cell {
    width: 44px; height: 44px; border-radius: 8px; cursor: pointer;
    border: 2px solid transparent; transition: transform .12s ease, box-shadow .12s ease;
  }
  .cell.hl { box-shadow: 0 0 0 3px #f5d76e; transform: scale(1.04); }
  .cell.sel { border-color: #2c2434; }
  .hint { margin-top: 8px; font-size: 12px; color: #6d5a7e; }
</style>
<div class="grid" id="grid"></div>
<p class="hint" id="hint">Clique une case (max 2 sélectionnées).</p>
<script>
  const colors = ['#e74c3c','#3498db','#2ecc71','#f1c40f','#9b59b6','#e67e22','#1abc9c','#34495e',
                  '#e84393','#0984e3','#00b894','#fdcb6e','#6c5ce7','#d35400','#16a085','#2d3436'];
  const related = {
    0:[1,4],1:[0,2,5],2:[1,3,6],3:[2,7],
    4:[0,5,8],5:[1,4,6,9],6:[2,5,7,10],7:[3,6,11],
    8:[4,9,12],9:[5,8,10,13],10:[6,9,11,14],11:[7,10,15],
    12:[8,13],13:[9,12,14],14:[10,13,15],15:[11,14]
  };
  let selected = [];
  const grid = document.getElementById('grid');
  const hint = document.getElementById('hint');
  const cells = colors.map((color, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'cell';
    el.style.background = color;
    el.dataset.i = String(i);
    grid.appendChild(el);
    return el;
  });
  function paint() {
    cells.forEach((el, i) => {
      el.classList.toggle('sel', selected.includes(i));
      const linked = selected.some((s) => (related[s] || []).includes(i));
      el.classList.toggle('hl', linked && !selected.includes(i));
    });
    hint.textContent = selected.length
      ? 'Sélection : ' + selected.map((i) => i + 1).join(' · ') + ' (max 2)'
      : 'Clique une case (max 2 sélectionnées).';
  }
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.cell');
    if (!btn) return;
    const i = Number(btn.dataset.i);
    const idx = selected.indexOf(i);
    if (idx >= 0) selected.splice(idx, 1);
    else {
      if (selected.length >= 2) selected.shift();
      selected.push(i);
    }
    paint();
  });
  paint();
</script>
\`\`\`

Astuce : regarde le résultat en mode **Aperçu** ou **Split**. Un bloc \`js\` classique reste du code non exécuté.

---

## 13. Astuces d’édition

1. Écris en **mode Édition**, bascule en **Aperçu** pour voir le rendu.
2. Le mode **Split** affiche les deux côte à côte (scroll synchronisé).
3. Organise tes notes dans des **dossiers** (arborescence à gauche).
4. Les dossiers et notes sont triés **par ordre alphabétique** (dossiers d’abord, puis notes).
5. Utilise \`[[Titre de la note]]\` pour créer des hyperliens entre tes notes.
6. Utilise un bloc langage \`widget\` pour des programmes interactifs dans l’aperçu.

---

${buildMarkdownTutorialTemplateSection()}

---

*Bonnes notes !*
`
