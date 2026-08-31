import{Cn as e,Dn as t,Kt as n,Ln as r,Nn as i,Sn as a,an as o,bn as s,cn as c,dn as l,sn as u,un as d,vn as f,xn as ee,zn as p}from"./index-BHyxIdKK.js";var m=`note_templates`,h=`Templates`,g=[{token:`titre`,aliases:[`title`],label:`Titre`,description:`Titre saisi à la création de la note (texte brut).`,example:`{{titre}}`,category:`titre`},{token:`titre-h1`,aliases:[`title-h1`,`titre-1`],label:`Titre niveau 1`,description:`Équivaut à écrire # suivi du titre.`,example:`{{titre-h1}}`,category:`titre`},{token:`titre-h2`,aliases:[`title-h2`,`titre-2`],label:`Titre niveau 2`,description:`Équivaut à ## suivi du titre.`,example:`{{titre-h2}}`,category:`titre`},{token:`titre-h3`,aliases:[`title-h3`,`titre-3`],label:`Titre niveau 3`,description:`Équivaut à ### suivi du titre.`,example:`{{titre-h3}}`,category:`titre`},{token:`titre-h4`,aliases:[`title-h4`,`titre-4`],label:`Titre niveau 4`,description:`Équivaut à #### suivi du titre.`,example:`{{titre-h4}}`,category:`titre`},{token:`titre-h5`,aliases:[`title-h5`,`titre-5`],label:`Titre niveau 5`,description:`Équivaut à ##### suivi du titre.`,example:`{{titre-h5}}`,category:`titre`},{token:`titre-h6`,aliases:[`title-h6`,`titre-6`],label:`Titre niveau 6`,description:`Équivaut à ###### suivi du titre.`,example:`{{titre-h6}}`,category:`titre`},{token:`date`,label:`Date complète`,description:`Date du jour en français (ex. lundi 31 août 2026).`,example:`{{date}}`,category:`date`},{token:`date-courte`,aliases:[`date_courte`,`date-short`],label:`Date courte`,description:`Format JJ/MM/AAAA.`,example:`{{date-courte}}`,category:`date`},{token:`date-iso`,aliases:[`date_iso`],label:`Date ISO`,description:`Format AAAA-MM-JJ (pratique pour les noms de fichiers).`,example:`{{date-iso}}`,category:`date`},{token:`jour`,aliases:[`day`],label:`Jour`,description:`Jour du mois sur deux chiffres (01–31).`,example:`{{jour}}`,category:`date`},{token:`mois`,aliases:[`month`],label:`Mois`,description:`Mois sur deux chiffres (01–12).`,example:`{{mois}}`,category:`date`},{token:`annee`,aliases:[`year`],label:`Année`,description:`Année sur quatre chiffres.`,example:`{{annee}}`,category:`date`},{token:`heure`,aliases:[`time`],label:`Heure`,description:`Heure locale HH:MM.`,example:`{{heure}}`,category:`heure`},{token:`heure-complete`,aliases:[`heure_complete`,`time-full`],label:`Heure complète`,description:`Heure avec secondes HH:MM:SS.`,example:`{{heure-complete}}`,category:`heure`}],_=[{id:`create`,label:`Créer un dossier`,hint:`Un nouveau dossier sera créé (ou mis à jour) avec le nom choisi.`},{id:`existing`,label:`Dossier existant`,hint:`Utilise un dossier déjà présent dans ton arborescence.`}],v=[{type:`folder`,label:`Dans un dossier`,hint:`Appliqué quand une note est créée dans le dossier choisi.`},{type:`title-exact`,label:`Titre exact`,hint:`Appliqué quand le titre de la nouvelle note correspond exactement.`},{type:`title-contains`,label:`Titre contient…`,hint:`Appliqué quand le titre contient le texte indiqué.`},{type:`default`,label:`Par défaut`,hint:`Utilisé si aucune autre règle ne correspond.`}];function y(){return{folderName:h,folderId:null,folderSource:`create`,rules:[]}}var b=`markdown-tutorial`,x=`Tutoriel Markdown`,S=`## 13. Templates`;function C(){let e=[{label:`Titres`,category:`titre`},{label:`Dates`,category:`date`},{label:`Heures`,category:`heure`}],t=`${S} (extension Notes)

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

`,t.trimEnd()}function w(e){let t=String(e??``);if(t.includes(`## 13. Templates`))return t;let n=C(),r=`*Bonnes notes !*`;return t.includes(r)?t.replace(r,`${n}\n\n---\n\n${r}`):`${t.trim()}\n\n---\n\n${n}\n`}var T=`# Tutoriel Markdown

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

${C()}

---

*Bonnes notes !*
`,E=`notes`,D=`notes_seed_state`,O=`id, user_id, folder_id, title, content_md, system_key, created_at, updated_at`;function k(e){return{id:e.id,user_id:e.user_id,folder_id:e.folder_id??null,title:String(e.title??``).trim()||`Sans titre`,content_md:e.content_md??``,system_key:e.system_key??null,created_at:e.created_at??null,updated_at:e.updated_at??e.created_at??null}}async function A(e,t){let{data:n,error:r}=await e.from(E).select(O).eq(`user_id`,t).order(`title`,{ascending:!0});if(r)throw r;return(n??[]).map(k)}async function j(e,t,n){if(!t||!n)return null;let{data:r,error:i}=await e.from(E).select(O).eq(`id`,n).eq(`user_id`,t).maybeSingle();if(i)throw i;return r?k(r):null}async function M(e,t,n={}){if(!t)throw Error(`Utilisateur non connecté.`);let r=String(n?.title??``).trim()||`Nouvelle note`,i=String(n?.contentMd??n?.content_md??``),a=new Date().toISOString(),o={user_id:t,folder_id:n?.folderId??n?.folder_id??null,title:r,content_md:i,created_at:a,updated_at:a},s=n?.systemKey??n?.system_key??null;s&&(o.system_key=s);let{data:c,error:l}=await e.from(E).insert(o).select(O).single();if(l)throw l;return k(c)}async function N(e,t,n,r){if(!t||!n)throw Error(`Note invalide.`);let i={updated_at:new Date().toISOString()};if(r?.title!==void 0){let e=String(r.title??``).trim();if(!e)throw Error(`Le titre est requis.`);i.title=e}(r?.contentMd!==void 0||r?.content_md!==void 0)&&(i.content_md=String(r.contentMd??r.content_md??``)),(r?.folderId!==void 0||r?.folder_id!==void 0)&&(i.folder_id=r.folderId??r.folder_id??null);let{data:a,error:o}=await e.from(E).update(i).eq(`id`,n).eq(`user_id`,t).select(O).single();if(o)throw o;return k(a)}async function P(e,t,n,r=null){if(!t||!n)throw Error(`Note invalide.`);let i=r?.system_key??null;i===void 0&&(i=(await j(e,t,n))?.system_key??null);let{error:a}=await e.from(E).delete().eq(`id`,n).eq(`user_id`,t);if(a)throw a;i===`markdown-tutorial`&&await I(e,t)}async function F(e,t){let{data:n,error:r}=await e.from(D).select(`markdown_tutorial_removed`).eq(`user_id`,t).maybeSingle();if(r)throw r;return!!n?.markdown_tutorial_removed}async function I(e,t){let n=new Date().toISOString(),{error:r}=await e.from(D).upsert({user_id:t,markdown_tutorial_removed:!0,updated_at:n},{onConflict:`user_id`});if(r)throw r}async function L(e,t){if(!t)return null;let{data:n,error:r}=await e.from(E).select(O).eq(`user_id`,t).eq(`system_key`,b).maybeSingle();if(r)throw r;if(n){let r=k(n),i=!r.content_md.includes(`Liens entre notes`),a=!r.content_md.includes(S);return!i&&!a?r:i?await N(e,t,r.id,{title:x,contentMd:T}):await N(e,t,r.id,{title:x,contentMd:w(r.content_md)})}if(await F(e,t))return null;try{return await M(e,t,{title:x,contentMd:T,folderId:null,systemKey:b})}catch(n){if(String(n?.code)===`23505`||String(n?.message??``).includes(`duplicate`)){let{data:n}=await e.from(E).select(O).eq(`user_id`,t).eq(`system_key`,b).maybeSingle();return n?k(n):null}throw n}}function R(e){let t=[],n=String(e??``);n=n.replace(/```[\s\S]*?```/g,e=>(t.push(e),`\0CODE${t.length-1}\0`)),n=n.replace(/`[^`\n]+`/g,e=>(t.push(e),`\0CODE${t.length-1}\0`));let r=[];return n.replace(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g,(e,t)=>{let n=String(t??``).trim();return n&&r.push(n),e}),r}function z(e){let t=Array.isArray(e)?e:[],n=new Map;for(let e of t){let t=String(e?.title??``).trim().toLowerCase();t&&!n.has(t)&&n.set(t,e)}let r=t.map(e=>({id:e.id,title:String(e.title??``).trim()||`Sans titre`})),i=new Set,a=[];for(let e of t){let t=R(e.content_md??``);for(let r of t){let t=n.get(r.toLowerCase());if(!t?.id||t.id===e.id)continue;let o=`${e.id<t.id?e.id:t.id}::${e.id<t.id?t.id:e.id}`;i.has(o)||(i.add(o),a.push({source:e.id,target:t.id}))}}return{nodes:r,edges:a}}var B={key:0,class:`notes-graph__header`},V={class:`notes-graph__meta`},H=[`viewBox`,`width`,`height`],U=[`x1`,`y1`,`x2`,`y2`],W=[`onMouseenter`,`onClick`],G=[`cx`,`cy`,`r`],K=[`cx`,`cy`,`r`],te=[`x`,`y`],ne={key:0,class:`notes-graph__empty`},re=n({__name:`NotesGraphView`,props:{active:{type:Boolean,default:!1},notes:{type:Array,default:()=>[]},selectedNoteId:{type:String,default:null},compact:{type:Boolean,default:!1}},emits:[`select-note`],setup(n,{emit:m}){let h=n,g=m,_=i(null),v=i(800),y=i(560),b=i(null),x=i([]),S=i([]),C=0,w=!1,T=null,E=u(()=>{let{nodes:e,edges:t}=z(h.notes);return{nodeCount:e.length,edgeCount:t.length}}),D=u(()=>{let e=new Map;for(let t of x.value)e.set(t.id,t);return e}),O=u(()=>S.value.map(e=>{let t=D.value.get(e.source),n=D.value.get(e.target);return!t||!n?null:{key:`${e.source}-${e.target}`,source:t,target:n}}).filter(Boolean));function k(){let e=_.value;if(!e)return;let t=e.getBoundingClientRect(),n=h.compact?200:280;v.value=Math.max(h.compact?240:320,Math.floor(t.width)),y.value=Math.max(n,Math.floor(t.height)||n)}function A(){let{nodes:e,edges:t}=z(h.notes),n=v.value,r=y.value,i=n/2,a=r/2;x.value=e.map((t,o)=>{let s=o/Math.max(e.length,1)*Math.PI*2,c=Math.min(n,r)*.28;return{id:t.id,title:t.title,x:i+Math.cos(s)*c+(Math.random()-.5)*24,y:a+Math.sin(s)*c+(Math.random()-.5)*24,vx:0,vy:0}}),S.value=t.map(e=>({...e}))}function j(){let e=x.value,t=S.value,n=e.length;if(!n)return;let r=v.value,i=y.value,a=r/2,o=i/2;for(let t=0;t<n;t+=1)for(let r=t+1;r<n;r+=1){let n=e[t],i=e[r],a=n.x-i.x,o=n.y-i.y,s=Math.hypot(a,o)||.01;s<.01&&(a=(Math.random()-.5)*.5,o=(Math.random()-.5)*.5,s=Math.hypot(a,o));let c=900/(s*s),l=a/s*c,u=o/s*c;if(n.vx+=l,n.vy+=u,i.vx-=l,i.vy-=u,s<56){let e=(56-s)*.05;n.vx+=a/s*e,n.vy+=o/s*e,i.vx-=a/s*e,i.vy-=o/s*e}}let s=new Map(e.map(e=>[e.id,e]));for(let e of t){let t=s.get(e.source),n=s.get(e.target);if(!t||!n)continue;let r=n.x-t.x,i=n.y-t.y,a=Math.hypot(r,i)||.01,o=(a-140)*.02,c=r/a*o,l=i/a*o;t.vx+=c,t.vy+=l,n.vx-=c,n.vy-=l}for(let t of e)t.vx+=(a-t.x)*.004,t.vy+=(o-t.y)*.004,t.vx*=.82,t.vy*=.82,t.x+=t.vx,t.y+=t.vy,t.x=Math.min(r-28,Math.max(28,t.x)),t.y=Math.min(i-28,Math.max(28,t.y))}function M(){w&&(j(),C=requestAnimationFrame(M))}function N(){P(),k(),A(),w=!0,C=requestAnimationFrame(M)}function P(){w=!1,C&&=(cancelAnimationFrame(C),0)}function F(e){e&&g(`select-note`,e)}function I(e){return e===h.selectedNoteId?9:e===b.value?8:6}return t(()=>h.active,async e=>{e?(await f(),N(),_.value&&typeof ResizeObserver<`u`&&(T?.disconnect(),T=new ResizeObserver(()=>{k()}),T.observe(_.value))):(T?.disconnect(),T=null,P(),b.value=null)},{immediate:!0}),t(()=>h.notes,()=>{h.active&&(k(),A())},{deep:!0}),s(async()=>{h.active&&(await f(),N())}),ee(()=>{T?.disconnect(),P()}),(t,i)=>(a(),l(`div`,{class:r([`notes-graph`,{"notes-graph--compact":n.compact}]),"aria-label":`Vue globale des notes`},[n.compact?d(``,!0):(a(),l(`header`,B,[c(`div`,null,[i[1]||=c(`h2`,{class:`notes-graph__title`},`Vue globale`,-1),c(`p`,V,p(E.value.nodeCount)+` note`+p(E.value.nodeCount>1?`s`:``)+` · `+p(E.value.edgeCount)+` lien`+p(E.value.edgeCount>1?`s`:``),1)])])),c(`div`,{ref_key:`viewportEl`,ref:_,class:`notes-graph__viewport`},[(a(),l(`svg`,{class:`notes-graph__svg`,viewBox:`0 0 ${v.value} ${y.value}`,width:v.value,height:y.value,role:`img`,"aria-label":`Graphe des notes et hyperliens`},[(a(!0),l(o,null,e(O.value,e=>(a(),l(`line`,{key:e.key,x1:e.source.x,y1:e.source.y,x2:e.target.x,y2:e.target.y,class:`notes-graph__link`},null,8,U))),128)),(a(!0),l(o,null,e(x.value,e=>(a(),l(`g`,{key:e.id,class:r([`notes-graph__node`,{"notes-graph__node--active":e.id===n.selectedNoteId,"notes-graph__node--hover":e.id===b.value}]),onMouseenter:t=>b.value=e.id,onMouseleave:i[0]||=e=>b.value=null,onClick:t=>F(e.id)},[c(`circle`,{cx:e.x,cy:e.y,r:I(e.id)+10,class:`notes-graph__hit`},null,8,G),c(`circle`,{cx:e.x,cy:e.y,r:I(e.id),class:`notes-graph__dot`},null,8,K),e.id===b.value||e.id===n.selectedNoteId||x.value.length<=18?(a(),l(`text`,{key:0,x:e.x,y:e.y+I(e.id)+14,class:`notes-graph__label`},p(e.title),9,te)):d(``,!0)],42,W))),128))],8,H)),x.value.length?d(``,!0):(a(),l(`p`,ne,`Aucune note à afficher.`))],512)],2))}},[[`__scopeId`,`data-v-10a2ffff`]]),q=`daily_notes`,ie=`Daily Notes`,ae=`daily_note:`;function oe(e=new Date){return`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,`0`)}-${String(e.getDate()).padStart(2,`0`)}`}function se(e=new Date){return`${ae}${oe(e)}`}function ce(e=new Date){return e.toLocaleDateString(`fr-FR`,{day:`numeric`,month:`long`,year:`numeric`})}function le(e){let t=String(e??``);if(!t.startsWith(`daily_note:`))return null;let n=t.slice(11);return/^\d{4}-\d{2}-\d{2}$/.test(n)?n:null}var J=`note_folders`,Y=`id, user_id, parent_id, name, system_key, created_at, updated_at`;function X(e){return e?.code===`PGRST204`&&typeof e.message==`string`&&e.message.includes(`'system_key'`)}function Z(e){return{id:e.id,user_id:e.user_id,parent_id:e.parent_id??null,name:String(e.name??``).trim(),system_key:e.system_key??null,created_at:e.created_at??null,updated_at:e.updated_at??e.created_at??null}}async function ue(e,t){let{data:n,error:r}=await e.from(J).select(Y).eq(`user_id`,t).order(`name`,{ascending:!0});if(r){if(X(r)){let n=await e.from(J).select(`id, user_id, parent_id, name, created_at, updated_at`).eq(`user_id`,t).order(`name`,{ascending:!0});if(n.error)throw n.error;return(n.data??[]).map(e=>Z({...e,system_key:null}))}throw r}return(n??[]).map(Z)}async function Q(e,t,n){if(!t)throw Error(`Utilisateur non connecté.`);let r=String(n?.name??``).trim();if(!r)throw Error(`Le nom du dossier est requis.`);let i=new Date().toISOString(),a={user_id:t,parent_id:n?.parentId||n?.parent_id||null,name:r,created_at:i,updated_at:i},o=n?.systemKey??n?.system_key??null;o&&(a.system_key=o);let{data:s,error:c}=await e.from(J).insert(a).select(Y).single();if(c)throw X(c)?Error(`Colonne note_folders.system_key absente. Exécute scripts/migrate-note-folders-system-key.sql dans Supabase.`):c;return Z(s)}async function $(e,t,n,r){if(!t||!n)throw Error(`Dossier invalide.`);let i={updated_at:new Date().toISOString()};if(r?.name!==void 0){let e=String(r.name??``).trim();if(!e)throw Error(`Le nom du dossier est requis.`);i.name=e}(r?.parentId!==void 0||r?.parent_id!==void 0)&&(i.parent_id=r.parentId??r.parent_id??null);let{data:a,error:o}=await e.from(J).update(i).eq(`id`,n).eq(`user_id`,t).select(Y).single();if(o){if(X(o)){let r=await e.from(J).update(i).eq(`id`,n).eq(`user_id`,t).select(`id, user_id, parent_id, name, created_at, updated_at`).single();if(r.error)throw r.error;return Z({...r.data,system_key:null})}throw o}return Z(a)}async function de(e,t,n){if(!t||!n)throw Error(`Dossier invalide.`);let{error:r}=await e.from(J).delete().eq(`id`,n).eq(`user_id`,t);if(r)throw r}async function fe(e,t){if(!t)throw Error(`Utilisateur non connecté.`);let{data:n,error:r}=await e.from(J).select(Y).eq(`user_id`,t).eq(`system_key`,q).maybeSingle();if(r)throw X(r)?Error(`Colonne note_folders.system_key absente. Exécute scripts/migrate-note-folders-system-key.sql dans Supabase.`):r;if(n)return Z(n);try{return await Q(e,t,{name:ie,parentId:null,systemKey:q})}catch(n){if(String(n?.code)===`23505`||String(n?.message??``).includes(`duplicate`)){let{data:n}=await e.from(J).select(Y).eq(`user_id`,t).eq(`system_key`,q).maybeSingle();if(n)return Z(n)}throw n}}async function pe(e,t,n=h){if(!t)throw Error(`Utilisateur non connecté.`);let r=String(n??``).trim()||`Templates`,{data:i,error:a}=await e.from(J).select(Y).eq(`user_id`,t).eq(`system_key`,m).maybeSingle();if(a)throw X(a)?Error(`Colonne note_folders.system_key absente. Exécute scripts/migrate-note-folders-system-key.sql dans Supabase.`):a;if(i){let n=Z(i);return n.name===r?n:$(e,t,n.id,{name:r})}try{return await Q(e,t,{name:r,parentId:null,systemKey:m})}catch(n){if(String(n?.code)===`23505`||String(n?.message??``).includes(`duplicate`)){let{data:n}=await e.from(J).select(Y).eq(`user_id`,t).eq(`system_key`,m).maybeSingle();if(n)return Z(n)}throw n}}export{N as _,ue as a,g as b,se as c,re as d,M as f,A as g,j as h,pe as i,ce as l,L as m,de as n,$ as o,P as p,fe as r,q as s,Q as t,le as u,_ as v,y as x,v as y};