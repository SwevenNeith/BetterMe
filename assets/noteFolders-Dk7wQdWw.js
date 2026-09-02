import{Bn as e,Cn as t,Fn as n,Jt as r,Sn as i,Tn as a,Vn as o,bn as s,fn as c,kn as l,ln as u,pn as d,sn as ee,un as f,wn as p,zn as te}from"./index-DectFbR2.js";var m=`note_templates`,h=`Templates`,g=[{token:`titre`,aliases:[`title`],label:`Titre`,description:`Titre saisi à la création de la note (texte brut).`,example:`{{titre}}`,category:`titre`},{token:`titre-h1`,aliases:[`title-h1`,`titre-1`],label:`Titre niveau 1`,description:`Équivaut à écrire # suivi du titre.`,example:`{{titre-h1}}`,category:`titre`},{token:`titre-h2`,aliases:[`title-h2`,`titre-2`],label:`Titre niveau 2`,description:`Équivaut à ## suivi du titre.`,example:`{{titre-h2}}`,category:`titre`},{token:`titre-h3`,aliases:[`title-h3`,`titre-3`],label:`Titre niveau 3`,description:`Équivaut à ### suivi du titre.`,example:`{{titre-h3}}`,category:`titre`},{token:`titre-h4`,aliases:[`title-h4`,`titre-4`],label:`Titre niveau 4`,description:`Équivaut à #### suivi du titre.`,example:`{{titre-h4}}`,category:`titre`},{token:`titre-h5`,aliases:[`title-h5`,`titre-5`],label:`Titre niveau 5`,description:`Équivaut à ##### suivi du titre.`,example:`{{titre-h5}}`,category:`titre`},{token:`titre-h6`,aliases:[`title-h6`,`titre-6`],label:`Titre niveau 6`,description:`Équivaut à ###### suivi du titre.`,example:`{{titre-h6}}`,category:`titre`},{token:`date`,label:`Date complète`,description:`Date du jour en français (ex. lundi 31 août 2026).`,example:`{{date}}`,category:`date`},{token:`date-courte`,aliases:[`date_courte`,`date-short`],label:`Date courte`,description:`Format JJ/MM/AAAA.`,example:`{{date-courte}}`,category:`date`},{token:`date-iso`,aliases:[`date_iso`],label:`Date ISO`,description:`Format AAAA-MM-JJ (pratique pour les noms de fichiers).`,example:`{{date-iso}}`,category:`date`},{token:`jour`,aliases:[`day`],label:`Jour`,description:`Jour du mois sur deux chiffres (01–31).`,example:`{{jour}}`,category:`date`},{token:`mois`,aliases:[`month`],label:`Mois`,description:`Mois sur deux chiffres (01–12).`,example:`{{mois}}`,category:`date`},{token:`annee`,aliases:[`year`],label:`Année`,description:`Année sur quatre chiffres.`,example:`{{annee}}`,category:`date`},{token:`heure`,aliases:[`time`],label:`Heure`,description:`Heure locale HH:MM.`,example:`{{heure}}`,category:`heure`},{token:`heure-complete`,aliases:[`heure_complete`,`time-full`],label:`Heure complète`,description:`Heure avec secondes HH:MM:SS.`,example:`{{heure-complete}}`,category:`heure`}],ne=[{id:`create`,label:`Créer un dossier`,hint:`Un nouveau dossier sera créé (ou mis à jour) avec le nom choisi.`},{id:`existing`,label:`Dossier existant`,hint:`Utilise un dossier déjà présent dans ton arborescence.`}],_=[{type:`folder`,label:`Dans un dossier`,hint:`Appliqué quand une note est créée dans le dossier choisi.`},{type:`title-exact`,label:`Titre exact`,hint:`Appliqué quand le titre de la nouvelle note correspond exactement.`},{type:`title-contains`,label:`Titre contient…`,hint:`Appliqué quand le titre contient le texte indiqué.`},{type:`default`,label:`Par défaut`,hint:`Utilisé si aucune autre règle ne correspond.`}];function v(){return{folderName:h,folderId:null,folderSource:`create`,rules:[]}}var y=`markdown-tutorial`,b=`Tutoriel Markdown`,x=`## 13. Templates`;function S(){let e=[{label:`Titres`,category:`titre`},{label:`Dates`,category:`date`},{label:`Heures`,category:`heure`}],t=`${x} (extension Notes)

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

`,t.trimEnd()}function C(e){let t=String(e??``);if(t.includes(`## 13. Templates`))return t;let n=S(),r=`*Bonnes notes !*`;return t.includes(r)?t.replace(r,`${n}\n\n---\n\n${r}`):`${t.trim()}\n\n---\n\n${n}\n`}var w=`# Tutoriel Markdown

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

${S()}

---

*Bonnes notes !*
`,T=`notes`,E=`notes_seed_state`,D=`id, user_id, folder_id, title, content_md, system_key, vault_id, created_at, updated_at`;function O(e){return{id:e.id,user_id:e.user_id,folder_id:e.folder_id??null,title:String(e.title??``).trim()||`Sans titre`,content_md:e.content_md??``,system_key:e.system_key??null,vault_id:e.vault_id??null,created_at:e.created_at??null,updated_at:e.updated_at??e.created_at??null}}async function k(e,t){let{data:n,error:r}=await e.from(T).select(D).eq(`user_id`,t).order(`title`,{ascending:!0});if(r)throw r;return(n??[]).map(O)}async function A(e,t,n){if(!t||!n)return null;let{data:r,error:i}=await e.from(T).select(D).eq(`id`,n).eq(`user_id`,t).maybeSingle();if(i)throw i;return r?O(r):null}async function j(e,t,n={}){if(!t)throw Error(`Utilisateur non connecté.`);let r=String(n?.title??``).trim()||`Nouvelle note`,i=String(n?.contentMd??n?.content_md??``),a=new Date().toISOString(),o={user_id:t,folder_id:n?.folderId??n?.folder_id??null,title:r,content_md:i,created_at:a,updated_at:a},s=n?.systemKey??n?.system_key??null;s&&(o.system_key=s);let c=n?.vaultId??n?.vault_id??null;c&&(o.vault_id=c);let{data:l,error:u}=await e.from(T).insert(o).select(D).single();if(u)throw u;return O(l)}async function M(e,t,n,r){if(!t||!n)throw Error(`Note invalide.`);let i={updated_at:new Date().toISOString()};if(r?.title!==void 0){let e=String(r.title??``).trim();if(!e)throw Error(`Le titre est requis.`);i.title=e}(r?.contentMd!==void 0||r?.content_md!==void 0)&&(i.content_md=String(r.contentMd??r.content_md??``)),(r?.folderId!==void 0||r?.folder_id!==void 0)&&(i.folder_id=r.folderId??r.folder_id??null);let{data:a,error:o}=await e.from(T).update(i).eq(`id`,n).eq(`user_id`,t).select(D).single();if(o)throw o;return O(a)}async function N(e,t,n,r=null){if(!t||!n)throw Error(`Note invalide.`);let i=r?.system_key??null;i===void 0&&(i=(await A(e,t,n))?.system_key??null);let{error:a}=await e.from(T).delete().eq(`id`,n).eq(`user_id`,t);if(a)throw a;i===`markdown-tutorial`&&await re(e,t)}async function P(e,t){let{data:n,error:r}=await e.from(E).select(`markdown_tutorial_removed`).eq(`user_id`,t).maybeSingle();if(r)throw r;return!!n?.markdown_tutorial_removed}async function re(e,t){let n=new Date().toISOString(),{error:r}=await e.from(E).upsert({user_id:t,markdown_tutorial_removed:!0,updated_at:n},{onConflict:`user_id`});if(r)throw r}async function F(e,t){if(!t)return null;let{data:n,error:r}=await e.from(T).select(D).eq(`user_id`,t).eq(`system_key`,y).maybeSingle();if(r)throw r;if(n){let r=O(n),i=!r.content_md.includes(`Liens entre notes`),a=!r.content_md.includes(x);return!i&&!a?r:i?await M(e,t,r.id,{title:b,contentMd:w}):await M(e,t,r.id,{title:b,contentMd:C(r.content_md)})}if(await P(e,t))return null;try{return await j(e,t,{title:b,contentMd:w,folderId:null,systemKey:y})}catch(n){if(String(n?.code)===`23505`||String(n?.message??``).includes(`duplicate`)){let{data:n}=await e.from(T).select(D).eq(`user_id`,t).eq(`system_key`,y).maybeSingle();return n?O(n):null}throw n}}var ie=`root`,I=`#ad81be`,ae=`#d5b5ea`,oe=`#f4f0fa`,se=`#95d1aa`,ce=`🗄️`;function L(e){return String(e??``).trim()||`🗄️`}function R(e,t=I){let n=String(e??``).trim();if(!n)return t;let r=n.startsWith(`#`)?n:`#${n}`;if(/^#[0-9a-fA-F]{6}$/.test(r))return r.toLowerCase();if(/^#[0-9a-fA-F]{3}$/.test(r)){let e=r.slice(1);return`#${e[0]}${e[0]}${e[1]}${e[1]}${e[2]}${e[2]}`.toLowerCase()}return t}function z(e){let t=R(e,``);if(!t)return null;let n=Number.parseInt(t.slice(1),16);return Number.isNaN(n)?null:{r:n>>16&255,g:n>>8&255,b:n&255}}function B(e){let t=Math.round(Number(e));return Number.isNaN(t)?0:Math.min(255,Math.max(0,t))}function V(e,t,n){return`#${B(e).toString(16).padStart(2,`0`)}${B(t).toString(16).padStart(2,`0`)}${B(n).toString(16).padStart(2,`0`)}`}function le(e,t){let n=z(e);return n?V(n.r+(255-n.r)*t,n.g+(255-n.g)*t,n.b+(255-n.b)*t):e}function ue(e){return le(e,.42)}function de(e){return le(e,.72)}function fe(e){let t=z(e);return t?V(t.r*.55+149*.45,t.g*.55+209*.45,t.b*.55+170*.45):se}function H(e){let t=R(e?.color,I),n=R(e?.accent_color??e?.accentColor,ue(t));return{color:t,accent:n,surface:R(e?.surface_color??e?.surfaceColor,de(n)),gradient:R(e?.gradient_color??e?.gradientColor,fe(t))}}function pe(e){return e?String(e):ie}function me(e){if(!e)return{};let{color:t,accent:n,surface:r,gradient:i}=H(e);return{"--notes-vault-color":t,"--notes-vault-accent":n,"--notes-vault-surface":r,"--notes-vault-gradient":i,"--notes-vault-on-color":`#ffffff`,"--notes-vault-text":`#3b2a4a`,"--notes-vault-text-muted":`#6d5a7e`,"--notes-vault-page-bg":`color-mix(in srgb, ${n} 18%, ${r})`,"--notes-vault-sidebar-bg":`color-mix(in srgb, ${n} 32%, ${r})`,"--notes-vault-main-bg":`color-mix(in srgb, ${n} 14%, ${r})`,"--notes-vault-header-bg":`color-mix(in srgb, ${n} 38%, ${r})`,"--notes-vault-tabs-bg":`color-mix(in srgb, ${n} 45%, ${r})`,"--notes-vault-border":`color-mix(in srgb, ${t} 28%, #e6ddf2)`,"--notes-vault-border-strong":`color-mix(in srgb, ${t} 42%, #d5c4e6)`,"--notes-vault-btn-bg":t,"--notes-vault-btn-text":`#ffffff`,"--notes-vault-icon":t,"--notes-vault-icon-active":`color-mix(in srgb, ${t} 72%, #244438)`,"--notes-vault-icon-hover-bg":`color-mix(in srgb, ${n} 55%, white)`,"--notes-vault-input-bg":`#ffffff`,"--notes-vault-mode-bg":`color-mix(in srgb, ${n} 40%, ${r})`,"--notes-vault-mode-active":`color-mix(in srgb, ${i} 55%, ${t} 45%)`,"--notes-vault-graph-header-bg":`color-mix(in srgb, ${n} 38%, ${r})`,"--notes-vault-graph-bg":`radial-gradient(ellipse 80% 70% at 50% 40%, color-mix(in srgb, ${n} 45%, transparent) 0%, transparent 60%),radial-gradient(ellipse 70% 65% at 72% 78%, color-mix(in srgb, ${i} 38%, transparent) 0%, transparent 55%),linear-gradient(160deg, ${r} 0%, color-mix(in srgb, ${i} 22%, ${r}) 52%, color-mix(in srgb, ${n} 30%, ${r}) 100%)`,"--notes-vault-graph-link":t,"--notes-vault-graph-node":`color-mix(in srgb, ${t} 82%, #7a528f)`,"--notes-vault-graph-node-stroke":`color-mix(in srgb, ${t} 65%, #3b2a4a)`,"--notes-vault-graph-node-active":t,"--notes-vault-graph-node-active-stroke":`color-mix(in srgb, ${t} 55%, #3b2a4a)`}}var U=`note_vaults`,W=[`surface_color`,`gradient_color`,`icon`];function he(e){return e?.code===`PGRST205`||typeof e?.message==`string`&&e.message.includes(`'note_vaults'`)}function G(e){let t=typeof e?.message==`string`?e.message:``;if(!t)return null;for(let e of W)if(t.includes(e)||t.includes(`'${e}'`)||t.includes(`"${e}"`))return e;return null}function K(e=new Set){return[`id`,`user_id`,`name`,`color`,`accent_color`,...W.filter(t=>!e.has(t)),`sort_order`,`created_at`,`updated_at`].join(`, `)}function q(e,t){let n={id:e.id,user_id:e.user_id,name:String(e.name??``).trim(),color:e.color??`#AD81BE`,accent_color:e.accent_color??`#D5B5EA`,surface_color:e.surface_color??null,gradient_color:e.gradient_color??null,icon:L(e.icon),sort_order:Number(e.sort_order??0),created_at:e.created_at??null,updated_at:e.updated_at??e.created_at??null};return t?.icon!==void 0&&(n.icon=L(t.icon)),(t?.surfaceColor!==void 0||t?.surface_color!==void 0)&&(n.surface_color=t.surfaceColor??t.surface_color??n.surface_color),(t?.gradientColor!==void 0||t?.gradient_color!==void 0)&&(n.gradient_color=t.gradientColor??t.gradient_color??n.gradient_color),n}async function ge(e,t){let n=new Set;for(let r=0;r<W.length+1;r+=1){let{data:r,error:i}=await e.from(U).select(K(n)).eq(`user_id`,t).order(`sort_order`,{ascending:!0}).order(`name`,{ascending:!0});if(!i)return(r??[]).map(e=>q(e));if(he(i))return console.warn(`Table note_vaults absente. Exécute scripts/create-note-vaults.sql dans Supabase.`),[];let a=G(i);if(!a||n.has(a))throw i;n.add(a),a===`icon`&&console.warn(`Colonne note_vaults.icon absente. Exécute scripts/create-note-vaults.sql dans Supabase.`),(a===`surface_color`||a===`gradient_color`)&&console.warn(`Colonnes thème note_vaults absentes. Exécute scripts/create-note-vaults.sql dans Supabase.`)}return[]}function _e(e,{includeName:t=!0}={}){let n={};if(t){let t=String(e?.name??``).trim();if(!t)throw Error(`Le nom du coffre est requis.`);n.name=t}else if(e?.name!==void 0){let t=String(e.name??``).trim();if(!t)throw Error(`Le nom du coffre est requis.`);n.name=t}return e?.icon!==void 0&&(n.icon=L(e.icon)),e?.color!==void 0&&(n.color=e.color),(e?.accentColor!==void 0||e?.accent_color!==void 0)&&(n.accent_color=e.accentColor??e.accent_color),(e?.surfaceColor!==void 0||e?.surface_color!==void 0)&&(n.surface_color=e.surfaceColor??e.surface_color),(e?.gradientColor!==void 0||e?.gradient_color!==void 0)&&(n.gradient_color=e.gradientColor??e.gradient_color),n}async function ve(e,t,n,r,i){let a=new Set,o=new Set,s={...r,updated_at:new Date().toISOString()};for(let r=0;r<W.length*2+2;r+=1){let r={...s};for(let e of o)delete r[e];let{data:c,error:l}=await e.from(U).update(r).eq(`id`,n).eq(`user_id`,t).select(K(a)).single();if(!l)return q(c,i);let u=G(l);if(!u)throw l;if(u in r&&!o.has(u)){o.add(u),u===`icon`&&console.warn(`Colonne note_vaults.icon absente. Exécute scripts/migrate-note-vaults-icon.sql dans Supabase.`);continue}if(!a.has(u)){a.add(u);continue}throw l}throw Error(`Impossible de mettre à jour le coffre.`)}async function ye(e,t,n){if(!t)throw Error(`Utilisateur non connecté.`);let r=new Date().toISOString(),i={user_id:t,..._e(n),sort_order:Number(n?.sortOrder??n?.sort_order??0),created_at:r,updated_at:r},a=new Set,o=new Set;for(let t=0;t<W.length*2+2;t+=1){let t={...i};for(let e of o)delete t[e];let{data:r,error:s}=await e.from(U).insert(t).select(K(a)).single();if(!s)return q(r,n);if(he(s))throw Error(`Table note_vaults absente. Exécute scripts/create-note-vaults.sql dans Supabase.`);let c=G(s);if(!c)throw s;if(c in t&&!o.has(c)){o.add(c),c===`icon`&&console.warn(`Colonne note_vaults.icon absente. Exécute scripts/migrate-note-vaults-icon.sql dans Supabase.`);continue}if(!a.has(c)){a.add(c);continue}throw s}throw Error(`Impossible de créer le coffre.`)}async function be(e,t,n,r){if(!t||!n)throw Error(`Coffre invalide.`);let i=_e(r,{includeName:!1});if(!Object.keys(i).length)throw Error(`Aucune modification à enregistrer.`);return ve(e,t,n,i,r)}async function xe(e,t,n){if(!t||!n)throw Error(`Coffre invalide.`);let{error:r}=await e.from(U).delete().eq(`id`,n).eq(`user_id`,t);if(r)throw r}function Se(e){let t=[],n=String(e??``);n=n.replace(/```[\s\S]*?```/g,e=>(t.push(e),`\0CODE${t.length-1}\0`)),n=n.replace(/`[^`\n]+`/g,e=>(t.push(e),`\0CODE${t.length-1}\0`));let r=[];return n.replace(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g,(e,t)=>{let n=String(t??``).trim();return n&&r.push(n),e}),r}function Ce(e){let t=Array.isArray(e)?e:[],n=new Map;for(let e of t){let t=String(e?.title??``).trim().toLowerCase();t&&!n.has(t)&&n.set(t,e)}let r=t.map(e=>({id:e.id,title:String(e.title??``).trim()||`Sans titre`})),i=new Set,a=[];for(let e of t){let t=Se(e.content_md??``);for(let r of t){let t=n.get(r.toLowerCase());if(!t?.id||t.id===e.id)continue;let o=`${e.id<t.id?e.id:t.id}::${e.id<t.id?t.id:e.id}`;i.has(o)||(i.add(o),a.push({source:e.id,target:t.id}))}}return{nodes:r,edges:a}}var we={key:0,class:`notes-graph__header`},Te={class:`notes-graph__meta`},Ee=[`viewBox`,`width`,`height`],De=[`x1`,`y1`,`x2`,`y2`],Oe=[`onMouseenter`,`onClick`],ke=[`cx`,`cy`,`r`],Ae=[`cx`,`cy`,`r`],je=[`x`,`y`],Me={key:0,class:`notes-graph__empty`},Ne=r({__name:`NotesGraphView`,props:{active:{type:Boolean,default:!1},notes:{type:Array,default:()=>[]},selectedNoteId:{type:String,default:null},compact:{type:Boolean,default:!1},themeStyle:{type:Object,default:null}},emits:[`select-note`],setup(r,{emit:m}){let h=r,g=u(()=>!!(h.themeStyle&&Object.keys(h.themeStyle).length)),ne=m,_=n(null),v=n(800),y=n(560),b=n(null),x=n([]),S=n([]),C=0,w=!1,T=null,E=u(()=>{let{nodes:e,edges:t}=Ce(h.notes);return{nodeCount:e.length,edgeCount:t.length}}),D=u(()=>{let e=new Map;for(let t of x.value)e.set(t.id,t);return e}),O=u(()=>S.value.map(e=>{let t=D.value.get(e.source),n=D.value.get(e.target);return!t||!n?null:{key:`${e.source}-${e.target}`,source:t,target:n}}).filter(Boolean));function k(){let e=_.value;if(!e)return;let t=e.getBoundingClientRect(),n=h.compact?200:280;v.value=Math.max(h.compact?240:320,Math.floor(t.width)),y.value=Math.max(n,Math.floor(t.height)||n)}function A(){let{nodes:e,edges:t}=Ce(h.notes),n=v.value,r=y.value,i=n/2,a=r/2;x.value=e.map((t,o)=>{let s=o/Math.max(e.length,1)*Math.PI*2,c=Math.min(n,r)*.28;return{id:t.id,title:t.title,x:i+Math.cos(s)*c+(Math.random()-.5)*24,y:a+Math.sin(s)*c+(Math.random()-.5)*24,vx:0,vy:0}}),S.value=t.map(e=>({...e}))}function j(){let e=x.value,t=S.value,n=e.length;if(!n)return;let r=v.value,i=y.value,a=r/2,o=i/2;for(let t=0;t<n;t+=1)for(let r=t+1;r<n;r+=1){let n=e[t],i=e[r],a=n.x-i.x,o=n.y-i.y,s=Math.hypot(a,o)||.01;s<.01&&(a=(Math.random()-.5)*.5,o=(Math.random()-.5)*.5,s=Math.hypot(a,o));let c=900/(s*s),l=a/s*c,u=o/s*c;if(n.vx+=l,n.vy+=u,i.vx-=l,i.vy-=u,s<56){let e=(56-s)*.05;n.vx+=a/s*e,n.vy+=o/s*e,i.vx-=a/s*e,i.vy-=o/s*e}}let s=new Map(e.map(e=>[e.id,e]));for(let e of t){let t=s.get(e.source),n=s.get(e.target);if(!t||!n)continue;let r=n.x-t.x,i=n.y-t.y,a=Math.hypot(r,i)||.01,o=(a-140)*.02,c=r/a*o,l=i/a*o;t.vx+=c,t.vy+=l,n.vx-=c,n.vy-=l}for(let t of e)t.vx+=(a-t.x)*.004,t.vy+=(o-t.y)*.004,t.vx*=.82,t.vy*=.82,t.x+=t.vx,t.y+=t.vy,t.x=Math.min(r-28,Math.max(28,t.x)),t.y=Math.min(i-28,Math.max(28,t.y))}function M(){w&&(j(),C=requestAnimationFrame(M))}function N(){P(),k(),A(),w=!0,C=requestAnimationFrame(M)}function P(){w=!1,C&&=(cancelAnimationFrame(C),0)}function re(e){e&&ne(`select-note`,e)}function F(e){return e===h.selectedNoteId?9:e===b.value?8:6}return l(()=>h.active,async e=>{e?(await s(),N(),_.value&&typeof ResizeObserver<`u`&&(T?.disconnect(),T=new ResizeObserver(()=>{k()}),T.observe(_.value))):(T?.disconnect(),T=null,P(),b.value=null)},{immediate:!0}),l(()=>h.notes,()=>{h.active&&(k(),A())},{deep:!0}),i(async()=>{h.active&&(await s(),N())}),t(()=>{T?.disconnect(),P()}),(t,n)=>(p(),d(`div`,{class:te([`notes-graph`,{"notes-graph--compact":r.compact,"notes-graph--themed":g.value}]),style:e(r.themeStyle||void 0),"aria-label":`Vue globale des notes`},[r.compact?c(``,!0):(p(),d(`header`,we,[f(`div`,null,[n[1]||=f(`h2`,{class:`notes-graph__title`},`Vue globale`,-1),f(`p`,Te,o(E.value.nodeCount)+` note`+o(E.value.nodeCount>1?`s`:``)+` · `+o(E.value.edgeCount)+` lien`+o(E.value.edgeCount>1?`s`:``),1)])])),f(`div`,{ref_key:`viewportEl`,ref:_,class:`notes-graph__viewport`},[(p(),d(`svg`,{class:`notes-graph__svg`,viewBox:`0 0 ${v.value} ${y.value}`,width:v.value,height:y.value,role:`img`,"aria-label":`Graphe des notes et hyperliens`},[(p(!0),d(ee,null,a(O.value,e=>(p(),d(`line`,{key:e.key,x1:e.source.x,y1:e.source.y,x2:e.target.x,y2:e.target.y,class:`notes-graph__link`},null,8,De))),128)),(p(!0),d(ee,null,a(x.value,e=>(p(),d(`g`,{key:e.id,class:te([`notes-graph__node`,{"notes-graph__node--active":e.id===r.selectedNoteId,"notes-graph__node--hover":e.id===b.value}]),onMouseenter:t=>b.value=e.id,onMouseleave:n[0]||=e=>b.value=null,onClick:t=>re(e.id)},[f(`circle`,{cx:e.x,cy:e.y,r:F(e.id)+10,class:`notes-graph__hit`},null,8,ke),f(`circle`,{cx:e.x,cy:e.y,r:F(e.id),class:`notes-graph__dot`},null,8,Ae),e.id===b.value||e.id===r.selectedNoteId||x.value.length<=18?(p(),d(`text`,{key:0,x:e.x,y:e.y+F(e.id)+14,class:`notes-graph__label`},o(e.title),9,je)):c(``,!0)],42,Oe))),128))],8,Ee)),x.value.length?c(``,!0):(p(),d(`p`,Me,`Aucune note à afficher.`))],512)],6))}},[[`__scopeId`,`data-v-3d9560d8`]]),J=`daily_notes`,Pe=`Daily Notes`,Fe=`daily_note:`;function Ie(e=new Date){return`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,`0`)}-${String(e.getDate()).padStart(2,`0`)}`}function Le(e=new Date){return`${Fe}${Ie(e)}`}function Re(e=new Date){return e.toLocaleDateString(`fr-FR`,{day:`numeric`,month:`long`,year:`numeric`})}function ze(e){let t=String(e??``);if(!t.startsWith(`daily_note:`))return null;let n=t.slice(11);return/^\d{4}-\d{2}-\d{2}$/.test(n)?n:null}var Y=`note_folders`,X=`id, user_id, parent_id, name, system_key, vault_id, created_at, updated_at`;function Z(e){return e?.code===`PGRST204`&&typeof e.message==`string`&&e.message.includes(`'system_key'`)}function Be(e){return e?.code===`PGRST204`&&typeof e.message==`string`&&e.message.includes(`'vault_id'`)}function Q(e){return{id:e.id,user_id:e.user_id,parent_id:e.parent_id??null,name:String(e.name??``).trim(),system_key:e.system_key??null,vault_id:e.vault_id??null,created_at:e.created_at??null,updated_at:e.updated_at??e.created_at??null}}async function Ve(e,t){let{data:n,error:r}=await e.from(Y).select(X).eq(`user_id`,t).order(`name`,{ascending:!0});if(r){if(Be(r)||Z(r)){let n=await e.from(Y).select(`id, user_id, parent_id, name, created_at, updated_at`).eq(`user_id`,t).order(`name`,{ascending:!0});if(n.error)throw n.error;return(n.data??[]).map(e=>Q({...e,system_key:null,vault_id:null}))}throw r}return(n??[]).map(Q)}async function $(e,t,n){if(!t)throw Error(`Utilisateur non connecté.`);let r=String(n?.name??``).trim();if(!r)throw Error(`Le nom du dossier est requis.`);let i=new Date().toISOString(),a={user_id:t,parent_id:n?.parentId||n?.parent_id||null,name:r,created_at:i,updated_at:i},o=n?.systemKey??n?.system_key??null;o&&(a.system_key=o);let s=n?.vaultId??n?.vault_id??null;s&&(a.vault_id=s);let{data:c,error:l}=await e.from(Y).insert(a).select(X).single();if(l)throw Z(l)?Error(`Colonne note_folders.system_key absente. Exécute scripts/migrate-note-folders-system-key.sql dans Supabase.`):l;return Q(c)}async function He(e,t,n,r){if(!t||!n)throw Error(`Dossier invalide.`);let i={updated_at:new Date().toISOString()};if(r?.name!==void 0){let e=String(r.name??``).trim();if(!e)throw Error(`Le nom du dossier est requis.`);i.name=e}(r?.parentId!==void 0||r?.parent_id!==void 0)&&(i.parent_id=r.parentId??r.parent_id??null);let{data:a,error:o}=await e.from(Y).update(i).eq(`id`,n).eq(`user_id`,t).select(X).single();if(o){if(Z(o)){let r=await e.from(Y).update(i).eq(`id`,n).eq(`user_id`,t).select(`id, user_id, parent_id, name, created_at, updated_at`).single();if(r.error)throw r.error;return Q({...r.data,system_key:null})}throw o}return Q(a)}async function Ue(e,t,n){if(!t||!n)throw Error(`Dossier invalide.`);let{error:r}=await e.from(Y).delete().eq(`id`,n).eq(`user_id`,t);if(r)throw r}async function We(e,t){if(!t)throw Error(`Utilisateur non connecté.`);let{data:n,error:r}=await e.from(Y).select(X).eq(`user_id`,t).eq(`system_key`,J).maybeSingle();if(r)throw Z(r)?Error(`Colonne note_folders.system_key absente. Exécute scripts/migrate-note-folders-system-key.sql dans Supabase.`):r;if(n)return Q(n);try{return await $(e,t,{name:Pe,parentId:null,systemKey:J})}catch(n){if(String(n?.code)===`23505`||String(n?.message??``).includes(`duplicate`)){let{data:n}=await e.from(Y).select(X).eq(`user_id`,t).eq(`system_key`,J).maybeSingle();if(n)return Q(n)}throw n}}async function Ge(e,t,n=h,r=null){if(!t)throw Error(`Utilisateur non connecté.`);let i=String(n??``).trim()||`Templates`,a=e.from(Y).select(X).eq(`user_id`,t).eq(`system_key`,m);a=r?a.eq(`vault_id`,r):a.is(`vault_id`,null);let{data:o,error:s}=await a.maybeSingle();if(s)throw Z(s)?Error(`Colonne note_folders.system_key absente. Exécute scripts/migrate-note-folders-system-key.sql dans Supabase.`):s;if(o){let n=Q(o);return n.name===i?n:He(e,t,n.id,{name:i})}try{return await $(e,t,{name:i,parentId:null,systemKey:m,vaultId:r})}catch(n){if(String(n?.code)===`23505`||String(n?.message??``).includes(`duplicate`)){let n=e.from(Y).select(X).eq(`user_id`,t).eq(`system_key`,m);n=r?n.eq(`vault_id`,r):n.is(`vault_id`,null);let{data:i}=await n.maybeSingle();if(i)return Q(i)}throw n}}export{pe as A,g as B,fe as C,L as D,R as E,A as F,k as I,M as L,j as M,N,H as O,F as P,ne as R,ue as S,z as T,v as V,se as _,Ve as a,oe as b,Le as c,Ne as d,ye as f,ae as g,be as h,Ge as i,me as j,V as k,Re as l,ge as m,Ue as n,He as o,xe as p,We as r,J as s,$ as t,ze as u,ce as v,de as w,ie as x,I as y,_ as z};