import{An as e,K as t,S as n,W as r,_ as i,b as a,g as o,h as s,k as c,lt as l,m as u,ot as d,xr as f,y as p}from"./index-CHBasWx2.js";var m=`note_templates`,h=`Templates`,g=[{token:`titre`,aliases:[`title`],label:`Titre`,description:`Titre saisi à la création de la note (texte brut).`,example:`{{titre}}`,category:`titre`},{token:`titre-h1`,aliases:[`title-h1`,`titre-1`],label:`Titre niveau 1`,description:`Équivaut à écrire # suivi du titre.`,example:`{{titre-h1}}`,category:`titre`},{token:`titre-h2`,aliases:[`title-h2`,`titre-2`],label:`Titre niveau 2`,description:`Équivaut à ## suivi du titre.`,example:`{{titre-h2}}`,category:`titre`},{token:`titre-h3`,aliases:[`title-h3`,`titre-3`],label:`Titre niveau 3`,description:`Équivaut à ### suivi du titre.`,example:`{{titre-h3}}`,category:`titre`},{token:`titre-h4`,aliases:[`title-h4`,`titre-4`],label:`Titre niveau 4`,description:`Équivaut à #### suivi du titre.`,example:`{{titre-h4}}`,category:`titre`},{token:`titre-h5`,aliases:[`title-h5`,`titre-5`],label:`Titre niveau 5`,description:`Équivaut à ##### suivi du titre.`,example:`{{titre-h5}}`,category:`titre`},{token:`titre-h6`,aliases:[`title-h6`,`titre-6`],label:`Titre niveau 6`,description:`Équivaut à ###### suivi du titre.`,example:`{{titre-h6}}`,category:`titre`},{token:`date`,label:`Date complète`,description:`Date du jour en français (ex. lundi 31 août 2026).`,example:`{{date}}`,category:`date`},{token:`date-courte`,aliases:[`date_courte`,`date-short`],label:`Date courte`,description:`Format JJ/MM/AAAA.`,example:`{{date-courte}}`,category:`date`},{token:`date-iso`,aliases:[`date_iso`],label:`Date ISO`,description:`Format AAAA-MM-JJ (pratique pour les noms de fichiers).`,example:`{{date-iso}}`,category:`date`},{token:`jour`,aliases:[`day`],label:`Jour`,description:`Jour du mois sur deux chiffres (01–31).`,example:`{{jour}}`,category:`date`},{token:`mois`,aliases:[`month`],label:`Mois`,description:`Mois sur deux chiffres (01–12).`,example:`{{mois}}`,category:`date`},{token:`annee`,aliases:[`year`],label:`Année`,description:`Année sur quatre chiffres.`,example:`{{annee}}`,category:`date`},{token:`heure`,aliases:[`time`],label:`Heure`,description:`Heure locale HH:MM.`,example:`{{heure}}`,category:`heure`},{token:`heure-complete`,aliases:[`heure_complete`,`time-full`],label:`Heure complète`,description:`Heure avec secondes HH:MM:SS.`,example:`{{heure-complete}}`,category:`heure`}],ee=[{id:`create`,label:`Créer un dossier`,hint:`Un nouveau dossier sera créé (ou mis à jour) avec le nom choisi.`},{id:`existing`,label:`Dossier existant`,hint:`Utilise un dossier déjà présent dans ton arborescence.`}],_=[{type:`folder`,label:`Dans un dossier`,hint:`Appliqué quand une note est créée dans le dossier choisi.`},{type:`title-exact`,label:`Titre exact`,hint:`Appliqué quand le titre de la nouvelle note correspond exactement.`},{type:`title-contains`,label:`Titre contient…`,hint:`Appliqué quand le titre contient le texte indiqué.`},{type:`default`,label:`Par défaut`,hint:`Utilisé si aucune autre règle ne correspond.`}];function v(){return{folderName:h,folderId:null,folderSource:`create`,rules:[]}}var y=`markdown-tutorial`,te=`Tutoriel Markdown`,ne=`## 14. Templates`,re=/^##\s+\d+\.\s+Templates\b/gm;function ie(){let e=[{label:`Titres`,category:`titre`},{label:`Dates`,category:`date`},{label:`Heures`,category:`heure`}],t=`${ne} (extension Notes)

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

`;for(let n of e){let e=g.filter(e=>e.category===n.category);t+=`#### ${n.label}\n\n`,t+=`| Variable | Description |
| --- | --- |
`;for(let n of e){let e=n.aliases?.length>0?` Alias : ${n.aliases.map(e=>`\`{{${e}}}\``).join(`, `)}.`:``;t+=`| \`${n.example}\` | ${n.description}${e} |\n`}t+=`
`}return t+=`> Les notes créées **dans** le dossier Templates ne sont jamais pré-remplies : ce sont tes sources de modèles.

`,t.trimEnd()}function ae(e){return String(e??``).match(re)?.length??0}function oe(e){let t=String(e??``);return!t.includes(`## 12. Widgets interactifs`)||ae(t)!==1||!t.includes(`## 14. Templates`)}var se=`# Tutoriel Markdown

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
<\/script>
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

${ie()}

---

*Bonnes notes !*
`,b={NONE:``,A_TRAITER:`a_traiter`,FAIT:`fait`},ce=[{id:b.NONE,label:`Aucun`},{id:b.A_TRAITER,label:`À traiter`},{id:b.FAIT,label:`Fait`}];b.A_TRAITER,b.FAIT;var le=`note-status-todos`;function x(e){let t=String(e??``).trim();return t===b.A_TRAITER||t===b.FAIT?t:b.NONE}var S=`notes`,ue=`notes_seed_state`,C=`id, user_id, folder_id, title, content_md, system_key, vault_id, status, status_set_at, todo_item_id, created_at, updated_at`,w=`id, user_id, folder_id, title, content_md, system_key, vault_id, created_at, updated_at`;function T(e){return e?.code===`PGRST204`&&typeof e.message==`string`&&(e.message.includes(`'status'`)||e.message.includes(`'status_set_at'`)||e.message.includes(`'todo_item_id'`))}function E(e){return{id:e.id,user_id:e.user_id,folder_id:e.folder_id??null,title:String(e.title??``).trim()||`Sans titre`,content_md:e.content_md??``,system_key:e.system_key??null,vault_id:e.vault_id??null,status:x(e.status),status_set_at:e.status_set_at??null,todo_item_id:e.todo_item_id??null,created_at:e.created_at??null,updated_at:e.updated_at??e.created_at??null}}async function D(e,t){let n=await t(C);if(!n.error)return n;if(T(n.error)){let e=await t(w);if(e.error)throw e.error;return e}throw n.error}async function de(e,t){let{data:n,error:r}=await D(e,n=>e.from(S).select(n).eq(`user_id`,t).order(`title`,{ascending:!0}));if(r)throw r;return(n??[]).map(E)}async function O(e,t,n){if(!t||!n)return null;let{data:r,error:i}=await D(e,r=>e.from(S).select(r).eq(`id`,n).eq(`user_id`,t).maybeSingle());if(i)throw i;return r?E(r):null}async function fe(e,t,n={}){if(!t)throw Error(`Utilisateur non connecté.`);let r=String(n?.title??``).trim()||`Nouvelle note`,i=String(n?.contentMd??n?.content_md??``),a=new Date().toISOString(),o=x(n?.status),s={user_id:t,folder_id:n?.folderId??n?.folder_id??null,title:r,content_md:i,created_at:a,updated_at:a},c=n?.systemKey??n?.system_key??null;c&&(s.system_key=c);let l=n?.vaultId??n?.vault_id??null;l&&(s.vault_id=l),o&&(s.status=o,s.status_set_at=n?.statusSetAt??n?.status_set_at??(o===`a_traiter`?a:null));let u=await e.from(S).insert(s).select(C).single();if(u.error&&T(u.error)&&(delete s.status,delete s.status_set_at,u=await e.from(S).insert(s).select(w).single()),u.error)throw u.error;return E(u.data)}async function k(e,t,n,r){if(!t||!n)throw Error(`Note invalide.`);let i={updated_at:new Date().toISOString()};if(r?.title!==void 0){let e=String(r.title??``).trim();if(!e)throw Error(`Le titre est requis.`);i.title=e}if((r?.contentMd!==void 0||r?.content_md!==void 0)&&(i.content_md=String(r.contentMd??r.content_md??``)),(r?.folderId!==void 0||r?.folder_id!==void 0)&&(i.folder_id=r.folderId??r.folder_id??null),r?.status!==void 0){let e=x(r.status);i.status=e||null,r?.statusSetAt!==void 0||r?.status_set_at!==void 0?i.status_set_at=r.statusSetAt??r.status_set_at??null:e||(i.status_set_at=null)}else (r?.statusSetAt!==void 0||r?.status_set_at!==void 0)&&(i.status_set_at=r.statusSetAt??r.status_set_at??null);(r?.todoItemId!==void 0||r?.todo_item_id!==void 0)&&(i.todo_item_id=r.todoItemId??r.todo_item_id??null);let a=await e.from(S).update(i).eq(`id`,n).eq(`user_id`,t).select(C).single();if(a.error&&T(a.error)){let r={...i};delete r.status,delete r.status_set_at,delete r.todo_item_id,a=await e.from(S).update(r).eq(`id`,n).eq(`user_id`,t).select(w).single()}if(a.error)throw a.error;return E(a.data)}async function pe(e,t,n,r=null){if(!t||!n)throw Error(`Note invalide.`);let i=r?.system_key??null;i===void 0&&(i=(await O(e,t,n))?.system_key??null);let{error:a}=await e.from(S).delete().eq(`id`,n).eq(`user_id`,t);if(a)throw a;i===`markdown-tutorial`&&await he(e,t)}async function me(e,t){let{data:n,error:r}=await e.from(ue).select(`markdown_tutorial_removed`).eq(`user_id`,t).maybeSingle();if(r)throw r;return!!n?.markdown_tutorial_removed}async function he(e,t){let n=new Date().toISOString(),{error:r}=await e.from(ue).upsert({user_id:t,markdown_tutorial_removed:!0,updated_at:n},{onConflict:`user_id`});if(r)throw r}async function ge(e,t){if(!t)return null;let{data:n,error:r}=await D(e,n=>e.from(S).select(n).eq(`user_id`,t).eq(`system_key`,y).maybeSingle());if(r)throw r;if(n){let r=E(n);return oe(r.content_md)?await k(e,t,r.id,{title:te,contentMd:se}):r}if(await me(e,t))return null;try{return await fe(e,t,{title:te,contentMd:se,folderId:null,systemKey:y})}catch(n){if(String(n?.code)===`23505`||String(n?.message??``).includes(`duplicate`)){let{data:n}=await D(e,n=>e.from(S).select(n).eq(`user_id`,t).eq(`system_key`,y).maybeSingle());return n?E(n):null}throw n}}var A=`root`,j=`#ad81be`,_e=`#d5b5ea`,ve=`#f4f0fa`,ye=`#95d1aa`,be=`🗄️`;function xe(e){return String(e??``).trim()||`🗄️`}function M(e,t=j){let n=String(e??``).trim();if(!n)return t;let r=n.startsWith(`#`)?n:`#${n}`;if(/^#[0-9a-fA-F]{6}$/.test(r))return r.toLowerCase();if(/^#[0-9a-fA-F]{3}$/.test(r)){let e=r.slice(1);return`#${e[0]}${e[0]}${e[1]}${e[1]}${e[2]}${e[2]}`.toLowerCase()}return t}function N(e){let t=M(e,``);if(!t)return null;let n=Number.parseInt(t.slice(1),16);return Number.isNaN(n)?null:{r:n>>16&255,g:n>>8&255,b:n&255}}function P(e){let t=Math.round(Number(e));return Number.isNaN(t)?0:Math.min(255,Math.max(0,t))}function F(e,t,n){return`#${P(e).toString(16).padStart(2,`0`)}${P(t).toString(16).padStart(2,`0`)}${P(n).toString(16).padStart(2,`0`)}`}function Se(e,t){let n=N(e);return n?F(n.r+(255-n.r)*t,n.g+(255-n.g)*t,n.b+(255-n.b)*t):e}function Ce(e){return Se(e,.42)}function we(e){return Se(e,.72)}function Te(e){let t=N(e);return t?F(t.r*.55+149*.45,t.g*.55+209*.45,t.b*.55+170*.45):ye}function Ee(e){let t=M(e?.color,j),n=M(e?.accent_color??e?.accentColor,Ce(t));return{color:t,accent:n,surface:M(e?.surface_color??e?.surfaceColor,we(n)),gradient:M(e?.gradient_color??e?.gradientColor,Te(t))}}function I(e){return e?String(e):A}function De(e){if(!e)return{};let{color:t,accent:n,surface:r,gradient:i}=Ee(e);return{"--notes-vault-color":t,"--notes-vault-accent":n,"--notes-vault-surface":r,"--notes-vault-gradient":i,"--notes-vault-on-color":`#ffffff`,"--notes-vault-text":`#3b2a4a`,"--notes-vault-text-muted":`#6d5a7e`,"--notes-vault-page-bg":`color-mix(in srgb, ${n} 18%, ${r})`,"--notes-vault-sidebar-bg":`color-mix(in srgb, ${n} 32%, ${r})`,"--notes-vault-main-bg":`color-mix(in srgb, ${n} 14%, ${r})`,"--notes-vault-header-bg":`color-mix(in srgb, ${n} 38%, ${r})`,"--notes-vault-tabs-bg":`color-mix(in srgb, ${n} 45%, ${r})`,"--notes-vault-border":`color-mix(in srgb, ${t} 28%, #e6ddf2)`,"--notes-vault-border-strong":`color-mix(in srgb, ${t} 42%, #d5c4e6)`,"--notes-vault-btn-bg":t,"--notes-vault-btn-text":`#ffffff`,"--notes-vault-icon":t,"--notes-vault-icon-active":`color-mix(in srgb, ${t} 72%, #244438)`,"--notes-vault-icon-hover-bg":`color-mix(in srgb, ${n} 55%, white)`,"--notes-vault-input-bg":`#ffffff`,"--notes-vault-mode-bg":`color-mix(in srgb, ${n} 40%, ${r})`,"--notes-vault-mode-active":`color-mix(in srgb, ${i} 55%, ${t} 45%)`,"--notes-vault-graph-header-bg":`color-mix(in srgb, ${n} 38%, ${r})`,"--notes-vault-graph-bg":`radial-gradient(ellipse 80% 70% at 50% 40%, color-mix(in srgb, ${n} 45%, transparent) 0%, transparent 60%),radial-gradient(ellipse 70% 65% at 72% 78%, color-mix(in srgb, ${i} 38%, transparent) 0%, transparent 55%),linear-gradient(160deg, ${r} 0%, color-mix(in srgb, ${i} 22%, ${r}) 52%, color-mix(in srgb, ${n} 30%, ${r}) 100%)`,"--notes-vault-graph-link":t,"--notes-vault-graph-node":`color-mix(in srgb, ${t} 82%, #7a528f)`,"--notes-vault-graph-node-stroke":`color-mix(in srgb, ${t} 65%, #3b2a4a)`,"--notes-vault-graph-node-active":t,"--notes-vault-graph-node-active-stroke":`color-mix(in srgb, ${t} 55%, #3b2a4a)`}}var L=[{id:`wikilinks`,name:`Wikilinks`,description:`Lie tes notes entre elles avec la syntaxe [[Titre]].`,details:`Active les hyperliens internes type Obsidian.

• Écris [[Nom de la note]] pour créer un lien
• Ou [[Nom de la note|Libellé]] pour un texte différent
• Clique le lien dans l’aperçu pour ouvrir la note
• Les liens vers une note absente apparaissent en rouge et proposent de la créer (si l’extension associée est active)`,defaultEnabled:!0},{id:`create-from-missing-link`,name:`Créer depuis un lien manquant`,description:`Propose de créer une note quand un wikilink pointe vers un titre inexistant.`,details:`Quand tu cliques un lien [[…]] vers une note qui n’existe pas encore, une confirmation s’affiche pour la créer immédiatement dans le dossier courant.

Nécessite l’extension Wikilinks.`,defaultEnabled:!0},{id:`sync-scroll`,name:`Scroll synchronisé`,description:`En mode Split, l’édition et l’aperçu défilent ensemble.`,details:`Conserve le comparatif côte à côte :

• Quand tu scrolles dans l’éditeur, l’aperçu suit (et inversement)
• Quand tu cliques ou déplaces le curseur dans l’éditeur, l’aperçu se place sur la zone correspondante pour suivre tes modifications en direct`,defaultEnabled:!0},{id:`auto-save`,name:`Sauvegarde automatique`,description:`Enregistre la note en cours après une courte pause de frappe.`,details:`Dès que tu modifies le titre ou le contenu, la note est sauvegardée automatiquement après environ 0,7 s d’inactivité.

Tu peux toujours forcer l’enregistrement avec le bouton Enregistrer.`,defaultEnabled:!0},{id:`tree-search`,name:`Recherche dans l’arborescence`,description:`Filtre dossiers et notes via le champ Rechercher de la barre latérale.`,details:`Tape quelques lettres pour n’afficher que les dossiers et notes dont le nom contient la requête.

Les dossiers parents restent visibles s’ils contiennent un résultat.`,defaultEnabled:!0},{id:`dictionary-hints`,name:`Dictionnaire dans les notes`,description:`Surligne les mots du dictionnaire et affiche leur définition au survol.`,details:`Les mots présents dans ton dictionnaire personnel (ou liés via une forme alternative) sont soulignés dans l’aperçu.

• Survole un mot pour voir sa définition
• Clic droit sur une sélection dans l’éditeur : Ajouter au dictionnaire ou Lier à une définition existante`,defaultEnabled:!0},{id:`line-breaks`,name:`Retours à la ligne souples`,description:`Un simple retour à la ligne dans le Markdown devient un saut de ligne à l’écran.`,details:`Avec cette option (style GFM « breaks »), chaque Enter dans l’éditeur produit un retour visuel dans l’aperçu, sans devoir ajouter deux espaces ou une ligne vide.`,defaultEnabled:!0},{id:`html-widgets`,name:`Widgets interactifs`,description:`Exécute des blocs HTML/JS dans l’aperçu (tableaux cliquables, etc.).`,details:"Ajoute des programmes interactifs dans tes notes via un bloc de code spécial :\n\n```widget\n<!-- ton HTML + CSS + JS -->\n```\n\n• Langages reconnus : widget, interactive, html-run\n• Affiché dans l’aperçu dans une iframe isolée (sans accès à ton compte BetterMe)\n• Les blocs ```js / ```html classiques restent du code non exécuté\n\nExemple : grille de cases colorées, clics, surbrillance…",defaultEnabled:!0},{id:`note-status-todos`,name:`Statuts de notes`,description:`Ajoute un statut aux notes et synchronise « À traiter » avec les TODO de la semaine.`,details:`Quand cette extension est active :

• Chaque note peut avoir un statut : Aucun, À traiter, Fait
• Les Daily Notes reçoivent automatiquement le statut « À traiter » à la création
• Une note « À traiter » apparaît dans les TODO « Cette semaine » (semaine de la mise du statut)
• Si elle n’est pas faite en fin de semaine, elle est reportée à la semaine suivante
• Passer une note à « Fait » coche le TODO correspondant`,defaultEnabled:!1},{id:`templates`,name:`Templates`,description:`Pré-remplit automatiquement les nouvelles notes selon des modèles et des règles.`,details:`Crée un dossier Templates (ou choisis un dossier existant) dans lequel tu rédiges tes modèles.

• Définis des règles : par dossier, par titre exact, par mot dans le titre, ou par défaut
• À la création d’une note, le contenu du modèle correspondant est injecté
• Toutes les variables ({{titre}}, {{titre-h1}}, {{date}}, etc.) sont listées dans la section **14. Templates** du Tutoriel Markdown

Ouvre les paramètres (⚙) après activation pour configurer le dossier et les règles.`,defaultEnabled:!1,hasSettings:!0}];L.map(e=>e.id);function R(){return Object.fromEntries(L.map(e=>[e.id,e.defaultEnabled]))}function z(e){let t=R();if(!e||typeof e!=`object`||Array.isArray(e))return t;let n={...t};for(let t of L)typeof e[t.id]==`boolean`&&(n[t.id]=e[t.id]);return n}function B(e,t){return typeof e?.[t]==`boolean`?e[t]:L.find(e=>e.id===t)?.defaultEnabled!==!1}var Oe=new Set(_.map(e=>e.type));function V(e){let t=v();if(!e||typeof e!=`object`||Array.isArray(e))return t;let n=e;return{folderName:typeof n.folderName==`string`&&n.folderName.trim()?n.folderName.trim():t.folderName,folderId:typeof n.folderId==`string`?n.folderId:null,folderSource:n.folderSource===`existing`||n.folderSource===`create`?n.folderSource:t.folderSource,rules:ke(n.rules)}}function ke(e){if(!Array.isArray(e))return[];let t=[];for(let n of e){if(!n||typeof n!=`object`)continue;let e=n,r=e.type;if(typeof r!=`string`||!Oe.has(r))continue;let i=String(e.templateNoteId??``).trim();if(!i)continue;let a={id:typeof e.id==`string`&&e.id?e.id:crypto.randomUUID(),type:r,templateNoteId:i,folderId:null,pattern:``};if(r===`folder`){let t=e.folderId??e.folder_id;if(typeof t!=`string`||!t)continue;a.folderId=t}else if(r===`title-exact`||r===`title-contains`){let t=String(e.pattern??``).trim();if(!t)continue;a.pattern=t}t.push(a)}return t}function H(e,t){let n=e.find(e=>e.id===t);return n?String(n.content_md??n.contentMd??``):``}function Ae(e=new Date){return`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,`0`)}-${String(e.getDate()).padStart(2,`0`)}`}function je(e={}){let t=String(e.title??``).trim(),n=e.date instanceof Date?e.date:new Date,r={titre:t,title:t,date:n.toLocaleDateString(`fr-FR`,{weekday:`long`,day:`numeric`,month:`long`,year:`numeric`}),"date-courte":n.toLocaleDateString(`fr-FR`),date_courte:n.toLocaleDateString(`fr-FR`),"date-short":n.toLocaleDateString(`fr-FR`),"date-iso":Ae(n),date_iso:Ae(n),jour:String(n.getDate()).padStart(2,`0`),day:String(n.getDate()).padStart(2,`0`),mois:String(n.getMonth()+1).padStart(2,`0`),month:String(n.getMonth()+1).padStart(2,`0`),annee:String(n.getFullYear()),year:String(n.getFullYear()),heure:n.toLocaleTimeString(`fr-FR`,{hour:`2-digit`,minute:`2-digit`}),time:n.toLocaleTimeString(`fr-FR`,{hour:`2-digit`,minute:`2-digit`}),"heure-complete":n.toLocaleTimeString(`fr-FR`,{hour:`2-digit`,minute:`2-digit`,second:`2-digit`}),heure_complete:n.toLocaleTimeString(`fr-FR`,{hour:`2-digit`,minute:`2-digit`,second:`2-digit`}),"time-full":n.toLocaleTimeString(`fr-FR`,{hour:`2-digit`,minute:`2-digit`,second:`2-digit`})};for(let e=1;e<=6;e+=1){let n=t?`${`#`.repeat(e)} ${t}`:``;r[`titre-h${e}`]=n,r[`title-h${e}`]=n,r[`titre-${e}`]=n,r[`title-${e}`]=n}for(let e of g){let t=e.token.toLowerCase();t in r||(r[t]=``);for(let n of e.aliases??[]){let e=n.toLowerCase();!(e in r)&&t in r&&(r[e]=r[t])}}return r}function U(e,t={}){let n=je(t);return String(e??``).replace(/\{\{\s*([a-z0-9_-]+)\s*\}\}/gi,(e,t)=>{let r=String(t??``).toLowerCase();return r in n?n[r]:e})}function Me(e,t,n={}){let r=e?.folderId??null,i=n.folderId??null,a=String(n.title??``).trim();if(r&&i===r)return``;let o=a.toLowerCase(),s=e?.rules??[];for(let e of s.filter(e=>e.type===`title-exact`))if(e.pattern?.toLowerCase()===o)return U(H(t,e.templateNoteId),{title:a});for(let e of s.filter(e=>e.type===`title-contains`)){let n=e.pattern?.toLowerCase()??``;if(n&&o.includes(n))return U(H(t,e.templateNoteId),{title:a})}for(let e of s.filter(e=>e.type===`folder`))if(e.folderId&&e.folderId===i)return U(H(t,e.templateNoteId),{title:a});for(let e of s.filter(e=>e.type===`default`))return U(H(t,e.templateNoteId),{title:a});return``}function Ne(e){return _.find(t=>t.type===e)?.label??e}var Pe=`settings`,W=`notes_vault_settings`,G=`notes_extensions`,K=`notes_template_prefs`;function Fe(e,t=W){return e?.code===`PGRST204`&&typeof e.message==`string`&&e.message.includes(`'${t}'`)}function q(){return{extensions:R(),templatePrefs:v()}}function J(e){let t={};if(!e||typeof e!=`object`||Array.isArray(e))return t[A]=q(),t;let n=e;for(let[e,r]of Object.entries(n)){if(!r||typeof r!=`object`||Array.isArray(r))continue;let n=r;t[e]={extensions:z(n.extensions),templatePrefs:V(n.templatePrefs)}}return t.root||(t[A]=q()),t}async function Y(t,n){await e(n);let{data:r,error:i}=await t.from(Pe).select(`${W}, ${G}, ${K}`).eq(`user_id`,n).maybeSingle();if(i){if(Fe(i))return console.warn(`Colonne ${W} absente. Exécute scripts/migrate-settings-notes-vault-settings.sql dans Supabase.`),{store:J(null),migrated:!1};throw i}if(r?.[W]!=null)return{store:J(r[W]),migrated:!1};let a=J(null);return r?.[G]!=null&&(a[A].extensions=z(r[G])),r?.[K]!=null&&(a[A].templatePrefs=V(r[K])),{store:a,migrated:!0}}async function X(t,n,r){if(!n)return r;await e(n);let{error:i}=await t.from(Pe).update({[W]:r}).eq(`user_id`,n);if(i)throw Fe(i)?Error(`Colonne ${W} absente. Exécute scripts/migrate-settings-notes-vault-settings.sql dans Supabase.`):i;return r}async function Ie(e,t,n=null){if(!t)return R();let{store:r,migrated:i}=await Y(e,t),a=I(n);if(r[a]||(r[a]=q()),i)try{await X(e,t,r)}catch(e){console.warn(`Migration notes_vault_settings impossible:`,e)}return r[a].extensions}async function Le(e,t,n,r){let{store:i}=await Y(e,t),a=I(n);return i[a]||(i[a]=q()),i[a].extensions=z(r),await X(e,t,i),i[a].extensions}async function Re(e,t,n=null){if(!t)return v();let{store:r,migrated:i}=await Y(e,t),a=I(n);if(r[a]||(r[a]=q()),i)try{await X(e,t,r)}catch(e){console.warn(`Migration notes_vault_settings impossible:`,e)}return r[a].templatePrefs}async function ze(e,t,n,r){let{store:i}=await Y(e,t),a=I(n);return i[a]||(i[a]=q()),i[a].templatePrefs=V(r),await X(e,t,i),i[a].templatePrefs}async function Be(e,t,n){let{store:r}=await Y(e,t),i=I(n);return r[i]||(r[i]=q(),await X(e,t,r)),r[i]}async function Ve(e,t,n){let{store:r}=await Y(e,t),i=I(n);r[i]&&(delete r[i],await X(e,t,r))}function Z(e){let t=String(e?.message??``);return e?.code===`PGRST204`&&(t.includes(`'note_id'`)||t.includes(`'todo_item_id'`)||t.includes(`'status'`))}function Q(e){return`Note - ${String(e??``).trim()||`Sans titre`}`}async function $(e,t,n=null){if(!t)return!1;try{return B(await Ie(e,t,n??null),le)}catch(e){return console.error(`note status prefs:`,e),!1}}function He(e){return d(String(e?.status_set_at??``).slice(0,10))||d(String(e?.created_at??``).slice(0,10))||f()}async function Ue(e,t,r,i){try{await k(e,t,r,{todoItemId:i})}catch(e){if(!Z(e))throw e}if(i)try{await n(e,t,i,{note_id:r})}catch(e){if(!Z(e))throw e}}async function We(e,t,n,a){if(!t||!n?.id)return n;let o=r(a||He(n)),s=Q(n.title),c=null;n.todo_item_id&&(c=(await i(e,t)).find(e=>e.id===n.todo_item_id)??null),c||=(await i(e,t)).find(e=>e.note_id===n.id)??null;try{c=c?await p(e,t,c.id,{nom:s,description:c.description||``,frequence:l.WEEK_GOAL,date_echeance:o,heure:c.heure,is_promesse:!!c.is_promesse,quantite_cible:c.quantite_cible,reminder:!!c.reminder,reminder_time:c.reminder_time,note_id:n.id}):await u(e,t,{nom:s,description:``,frequence:l.WEEK_GOAL,date_echeance:o,is_promesse:!1,note_id:n.id})}catch(e){if(Z(e))return console.warn(`Colonnes note↔todo absentes. Exécute scripts/migrate-notes-status-todos.sql`),n;throw e}return await Ue(e,t,n.id,c.id),{...n,todo_item_id:c.id}}async function Ge(e,t,n,o,c={}){if(!t||!n?.id||!c.skipEnabledCheck&&!await $(e,t,n.vault_id??null))return n;let l=x(n.status),u=x(o),p={status:u||null};u===b.A_TRAITER&&l!==b.A_TRAITER?p.statusSetAt=new Date().toISOString():u===b.A_TRAITER?u===b.A_TRAITER&&n.status_set_at&&(p.statusSetAt=n.status_set_at):u||(p.statusSetAt=null);let m=await k(e,t,n.id,p);if(m={...n,...m},u===b.A_TRAITER)return m=await We(e,t,m),m;let h=null,g=await i(e,t);if(m.todo_item_id&&(h=g.find(e=>e.id===m.todo_item_id)??null),h||=g.find(e=>e.note_id===m.id)??null,u===b.FAIT&&h){let n=d(h.date_echeance)||r(f());return await a(e,t,h,n,!0),m}return!u&&h?(await s(e,t,h.id),m=await k(e,t,m.id,{todoItemId:null}),{...m,todo_item_id:null}):m}async function Ke(e,n){if(!n)return{rolled:0,completed:0};let a=[];try{a=await de(e,n)}catch(e){if(Z(e))return{rolled:0,completed:0};throw e}let s=a.filter(e=>x(e.status)===b.A_TRAITER);if(!s.length)return{rolled:0,completed:0};let u=new Map;async function m(t){let r=t||`root`;if(u.has(r))return u.get(r);let i=await $(e,n,t);return u.set(r,i),i}let h=await i(e,n),g=r(f()),ee=c(await o(e,n,r(d(new Date(Date.now()-1344*60*60*1e3).toISOString().slice(0,10))||g),g)),_=0,v=0;for(let r of s){if(!await m(r.vault_id??null))continue;let i=r.todo_item_id&&h.find(e=>e.id===r.todo_item_id)||h.find(e=>e.note_id===r.id)||null;if(!i){await We(e,n,r,g),_+=1;continue}if(i.frequence!==l.WEEK_GOAL)continue;let a=d(i.date_echeance);if(a){if(a>=g){let t=Q(r.title);i.nom!==t&&await p(e,n,i.id,{nom:t,description:i.description||``,frequence:l.WEEK_GOAL,date_echeance:a,heure:i.heure,is_promesse:!!i.is_promesse,quantite_cible:i.quantite_cible,reminder:!!i.reminder,reminder_time:i.reminder_time,note_id:r.id});continue}if(t(i,a,ee)){await k(e,n,r.id,{status:b.FAIT,statusSetAt:r.status_set_at}),v+=1;continue}await p(e,n,i.id,{nom:Q(r.title??i.nom),description:i.description||``,frequence:l.WEEK_GOAL,date_echeance:g,heure:i.heure,is_promesse:!!i.is_promesse,quantite_cible:i.quantite_cible,reminder:!!i.reminder,reminder_time:i.reminder_time,note_id:r.id}),_+=1}}return{rolled:_,completed:v}}async function qe(e,t,n,r){if(!t||!n?.note_id)return null;try{let i=await O(e,t,n.note_id);return!i||!await $(e,t,i.vault_id??null)?null:r?await k(e,t,i.id,{status:b.FAIT,statusSetAt:i.status_set_at}):x(i.status)===b.FAIT?await k(e,t,i.id,{status:b.A_TRAITER,statusSetAt:i.status_set_at||new Date().toISOString()}):i}catch(e){if(Z(e))return null;throw e}}async function Je(e,t,n){if(!t||!n?.id||!n.todo_item_id||x(n.status)!==b.A_TRAITER)return;let r=(await i(e,t)).find(e=>e.id===n.todo_item_id);if(!r)return;let a=Q(n.title);r.nom!==a&&await p(e,t,r.id,{nom:a,description:r.description||``,frequence:r.frequence||l.WEEK_GOAL,date_echeance:r.date_echeance,heure:r.heure,is_promesse:!!r.is_promesse,quantite_cible:r.quantite_cible,reminder:!!r.reminder,reminder_time:r.reminder_time,note_id:n.id})}export{F as A,le as B,Ce as C,M as D,N as E,O as F,v as G,m as H,de as I,k as L,fe as M,pe as N,xe as O,ge as P,b as R,ve as S,we as T,ee as U,h as V,_ as W,R as _,qe as a,be as b,Re as c,ze as d,Ne as f,L as g,z as h,Je as i,De as j,Ee as k,Ve as l,B as m,$ as n,Be as o,Me as p,Ke as r,Ie as s,Ge as t,Le as u,_e as v,Te as w,j as x,ye as y,ce as z};