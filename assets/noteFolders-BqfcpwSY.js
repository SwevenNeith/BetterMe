import{Cn as e,Dn as t,Kt as n,Ln as r,Nn as i,Sn as a,an as o,bn as s,cn as c,dn as l,sn as u,un as d,vn as f,xn as p,zn as m}from"./index-BHG-UM9O.js";var h=`markdown-tutorial`,g=`Tutoriel Markdown`,_=`# Tutoriel Markdown

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

*Bonnes notes !*
`,v=`notes`,y=`notes_seed_state`,b=`id, user_id, folder_id, title, content_md, system_key, created_at, updated_at`;function x(e){return{id:e.id,user_id:e.user_id,folder_id:e.folder_id??null,title:String(e.title??``).trim()||`Sans titre`,content_md:e.content_md??``,system_key:e.system_key??null,created_at:e.created_at??null,updated_at:e.updated_at??e.created_at??null}}async function S(e,t){let{data:n,error:r}=await e.from(v).select(b).eq(`user_id`,t).order(`title`,{ascending:!0});if(r)throw r;return(n??[]).map(x)}async function C(e,t,n){if(!t||!n)return null;let{data:r,error:i}=await e.from(v).select(b).eq(`id`,n).eq(`user_id`,t).maybeSingle();if(i)throw i;return r?x(r):null}async function w(e,t,n={}){if(!t)throw Error(`Utilisateur non connecté.`);let r=String(n?.title??``).trim()||`Nouvelle note`,i=String(n?.contentMd??n?.content_md??``),a=new Date().toISOString(),o={user_id:t,folder_id:n?.folderId??n?.folder_id??null,title:r,content_md:i,created_at:a,updated_at:a},s=n?.systemKey??n?.system_key??null;s&&(o.system_key=s);let{data:c,error:l}=await e.from(v).insert(o).select(b).single();if(l)throw l;return x(c)}async function T(e,t,n,r){if(!t||!n)throw Error(`Note invalide.`);let i={updated_at:new Date().toISOString()};if(r?.title!==void 0){let e=String(r.title??``).trim();if(!e)throw Error(`Le titre est requis.`);i.title=e}(r?.contentMd!==void 0||r?.content_md!==void 0)&&(i.content_md=String(r.contentMd??r.content_md??``)),(r?.folderId!==void 0||r?.folder_id!==void 0)&&(i.folder_id=r.folderId??r.folder_id??null);let{data:a,error:o}=await e.from(v).update(i).eq(`id`,n).eq(`user_id`,t).select(b).single();if(o)throw o;return x(a)}async function E(e,t,n,r=null){if(!t||!n)throw Error(`Note invalide.`);let i=r?.system_key??null;i===void 0&&(i=(await C(e,t,n))?.system_key??null);let{error:a}=await e.from(v).delete().eq(`id`,n).eq(`user_id`,t);if(a)throw a;i===`markdown-tutorial`&&await O(e,t)}async function D(e,t){let{data:n,error:r}=await e.from(y).select(`markdown_tutorial_removed`).eq(`user_id`,t).maybeSingle();if(r)throw r;return!!n?.markdown_tutorial_removed}async function O(e,t){let n=new Date().toISOString(),{error:r}=await e.from(y).upsert({user_id:t,markdown_tutorial_removed:!0,updated_at:n},{onConflict:`user_id`});if(r)throw r}async function k(e,t){if(!t)return null;let{data:n,error:r}=await e.from(v).select(b).eq(`user_id`,t).eq(`system_key`,h).maybeSingle();if(r)throw r;if(n){let r=x(n);return r.content_md.includes(`Liens entre notes`)?r:await T(e,t,r.id,{title:g,contentMd:_})}if(await D(e,t))return null;try{return await w(e,t,{title:g,contentMd:_,folderId:null,systemKey:h})}catch(n){if(String(n?.code)===`23505`||String(n?.message??``).includes(`duplicate`)){let{data:n}=await e.from(v).select(b).eq(`user_id`,t).eq(`system_key`,h).maybeSingle();return n?x(n):null}throw n}}function A(e){let t=[],n=String(e??``);n=n.replace(/```[\s\S]*?```/g,e=>(t.push(e),`\0CODE${t.length-1}\0`)),n=n.replace(/`[^`\n]+`/g,e=>(t.push(e),`\0CODE${t.length-1}\0`));let r=[];return n.replace(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g,(e,t)=>{let n=String(t??``).trim();return n&&r.push(n),e}),r}function j(e){let t=Array.isArray(e)?e:[],n=new Map;for(let e of t){let t=String(e?.title??``).trim().toLowerCase();t&&!n.has(t)&&n.set(t,e)}let r=t.map(e=>({id:e.id,title:String(e.title??``).trim()||`Sans titre`})),i=new Set,a=[];for(let e of t){let t=A(e.content_md??``);for(let r of t){let t=n.get(r.toLowerCase());if(!t?.id||t.id===e.id)continue;let o=`${e.id<t.id?e.id:t.id}::${e.id<t.id?t.id:e.id}`;i.has(o)||(i.add(o),a.push({source:e.id,target:t.id}))}}return{nodes:r,edges:a}}var M={key:0,class:`notes-graph__header`},N={class:`notes-graph__meta`},P=[`viewBox`,`width`,`height`],F=[`x1`,`y1`,`x2`,`y2`],I=[`onMouseenter`,`onClick`],L=[`cx`,`cy`,`r`],R=[`cx`,`cy`,`r`],z=[`x`,`y`],B={key:0,class:`notes-graph__empty`},V=n({__name:`NotesGraphView`,props:{active:{type:Boolean,default:!1},notes:{type:Array,default:()=>[]},selectedNoteId:{type:String,default:null},compact:{type:Boolean,default:!1}},emits:[`select-note`],setup(n,{emit:h}){let g=n,_=h,v=i(null),y=i(800),b=i(560),x=i(null),S=i([]),C=i([]),w=0,T=!1,E=null,D=u(()=>{let{nodes:e,edges:t}=j(g.notes);return{nodeCount:e.length,edgeCount:t.length}}),O=u(()=>{let e=new Map;for(let t of S.value)e.set(t.id,t);return e}),k=u(()=>C.value.map(e=>{let t=O.value.get(e.source),n=O.value.get(e.target);return!t||!n?null:{key:`${e.source}-${e.target}`,source:t,target:n}}).filter(Boolean));function A(){let e=v.value;if(!e)return;let t=e.getBoundingClientRect(),n=g.compact?200:280;y.value=Math.max(g.compact?240:320,Math.floor(t.width)),b.value=Math.max(n,Math.floor(t.height)||n)}function V(){let{nodes:e,edges:t}=j(g.notes),n=y.value,r=b.value,i=n/2,a=r/2;S.value=e.map((t,o)=>{let s=o/Math.max(e.length,1)*Math.PI*2,c=Math.min(n,r)*.28;return{id:t.id,title:t.title,x:i+Math.cos(s)*c+(Math.random()-.5)*24,y:a+Math.sin(s)*c+(Math.random()-.5)*24,vx:0,vy:0}}),C.value=t.map(e=>({...e}))}function H(){let e=S.value,t=C.value,n=e.length;if(!n)return;let r=y.value,i=b.value,a=r/2,o=i/2;for(let t=0;t<n;t+=1)for(let r=t+1;r<n;r+=1){let n=e[t],i=e[r],a=n.x-i.x,o=n.y-i.y,s=Math.hypot(a,o)||.01;s<.01&&(a=(Math.random()-.5)*.5,o=(Math.random()-.5)*.5,s=Math.hypot(a,o));let c=900/(s*s),l=a/s*c,u=o/s*c;if(n.vx+=l,n.vy+=u,i.vx-=l,i.vy-=u,s<56){let e=(56-s)*.05;n.vx+=a/s*e,n.vy+=o/s*e,i.vx-=a/s*e,i.vy-=o/s*e}}let s=new Map(e.map(e=>[e.id,e]));for(let e of t){let t=s.get(e.source),n=s.get(e.target);if(!t||!n)continue;let r=n.x-t.x,i=n.y-t.y,a=Math.hypot(r,i)||.01,o=(a-140)*.02,c=r/a*o,l=i/a*o;t.vx+=c,t.vy+=l,n.vx-=c,n.vy-=l}for(let t of e)t.vx+=(a-t.x)*.004,t.vy+=(o-t.y)*.004,t.vx*=.82,t.vy*=.82,t.x+=t.vx,t.y+=t.vy,t.x=Math.min(r-28,Math.max(28,t.x)),t.y=Math.min(i-28,Math.max(28,t.y))}function U(){T&&(H(),w=requestAnimationFrame(U))}function W(){G(),A(),V(),T=!0,w=requestAnimationFrame(U)}function G(){T=!1,w&&=(cancelAnimationFrame(w),0)}function K(e){e&&_(`select-note`,e)}function q(e){return e===g.selectedNoteId?9:e===x.value?8:6}return t(()=>g.active,async e=>{e?(await f(),W(),v.value&&typeof ResizeObserver<`u`&&(E?.disconnect(),E=new ResizeObserver(()=>{A()}),E.observe(v.value))):(E?.disconnect(),E=null,G(),x.value=null)},{immediate:!0}),t(()=>g.notes,()=>{g.active&&(A(),V())},{deep:!0}),s(async()=>{g.active&&(await f(),W())}),p(()=>{E?.disconnect(),G()}),(t,i)=>(a(),l(`div`,{class:r([`notes-graph`,{"notes-graph--compact":n.compact}]),"aria-label":`Vue globale des notes`},[n.compact?d(``,!0):(a(),l(`header`,M,[c(`div`,null,[i[1]||=c(`h2`,{class:`notes-graph__title`},`Vue globale`,-1),c(`p`,N,m(D.value.nodeCount)+` note`+m(D.value.nodeCount>1?`s`:``)+` · `+m(D.value.edgeCount)+` lien`+m(D.value.edgeCount>1?`s`:``),1)])])),c(`div`,{ref_key:`viewportEl`,ref:v,class:`notes-graph__viewport`},[(a(),l(`svg`,{class:`notes-graph__svg`,viewBox:`0 0 ${y.value} ${b.value}`,width:y.value,height:b.value,role:`img`,"aria-label":`Graphe des notes et hyperliens`},[(a(!0),l(o,null,e(k.value,e=>(a(),l(`line`,{key:e.key,x1:e.source.x,y1:e.source.y,x2:e.target.x,y2:e.target.y,class:`notes-graph__link`},null,8,F))),128)),(a(!0),l(o,null,e(S.value,e=>(a(),l(`g`,{key:e.id,class:r([`notes-graph__node`,{"notes-graph__node--active":e.id===n.selectedNoteId,"notes-graph__node--hover":e.id===x.value}]),onMouseenter:t=>x.value=e.id,onMouseleave:i[0]||=e=>x.value=null,onClick:t=>K(e.id)},[c(`circle`,{cx:e.x,cy:e.y,r:q(e.id)+10,class:`notes-graph__hit`},null,8,L),c(`circle`,{cx:e.x,cy:e.y,r:q(e.id),class:`notes-graph__dot`},null,8,R),e.id===x.value||e.id===n.selectedNoteId||S.value.length<=18?(a(),l(`text`,{key:0,x:e.x,y:e.y+q(e.id)+14,class:`notes-graph__label`},m(e.title),9,z)):d(``,!0)],42,I))),128))],8,P)),S.value.length?d(``,!0):(a(),l(`p`,B,`Aucune note à afficher.`))],512)],2))}},[[`__scopeId`,`data-v-10a2ffff`]]),H=`daily_notes`,U=`Daily Notes`,W=`daily_note:`;function G(e=new Date){return`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,`0`)}-${String(e.getDate()).padStart(2,`0`)}`}function K(e=new Date){return`${W}${G(e)}`}function q(e=new Date){return e.toLocaleDateString(`fr-FR`,{day:`numeric`,month:`long`,year:`numeric`})}function J(e){let t=String(e??``);if(!t.startsWith(`daily_note:`))return null;let n=t.slice(11);return/^\d{4}-\d{2}-\d{2}$/.test(n)?n:null}var Y=`note_folders`,X=`id, user_id, parent_id, name, system_key, created_at, updated_at`;function Z(e){return e?.code===`PGRST204`&&typeof e.message==`string`&&e.message.includes(`'system_key'`)}function Q(e){return{id:e.id,user_id:e.user_id,parent_id:e.parent_id??null,name:String(e.name??``).trim(),system_key:e.system_key??null,created_at:e.created_at??null,updated_at:e.updated_at??e.created_at??null}}async function ee(e,t){let{data:n,error:r}=await e.from(Y).select(X).eq(`user_id`,t).order(`name`,{ascending:!0});if(r){if(Z(r)){let n=await e.from(Y).select(`id, user_id, parent_id, name, created_at, updated_at`).eq(`user_id`,t).order(`name`,{ascending:!0});if(n.error)throw n.error;return(n.data??[]).map(e=>Q({...e,system_key:null}))}throw r}return(n??[]).map(Q)}async function $(e,t,n){if(!t)throw Error(`Utilisateur non connecté.`);let r=String(n?.name??``).trim();if(!r)throw Error(`Le nom du dossier est requis.`);let i=new Date().toISOString(),a={user_id:t,parent_id:n?.parentId||n?.parent_id||null,name:r,created_at:i,updated_at:i},o=n?.systemKey??n?.system_key??null;o&&(a.system_key=o);let{data:s,error:c}=await e.from(Y).insert(a).select(X).single();if(c)throw Z(c)?Error(`Colonne note_folders.system_key absente. Exécute scripts/migrate-note-folders-system-key.sql dans Supabase.`):c;return Q(s)}async function te(e,t,n,r){if(!t||!n)throw Error(`Dossier invalide.`);let i={updated_at:new Date().toISOString()};if(r?.name!==void 0){let e=String(r.name??``).trim();if(!e)throw Error(`Le nom du dossier est requis.`);i.name=e}(r?.parentId!==void 0||r?.parent_id!==void 0)&&(i.parent_id=r.parentId??r.parent_id??null);let{data:a,error:o}=await e.from(Y).update(i).eq(`id`,n).eq(`user_id`,t).select(X).single();if(o){if(Z(o)){let r=await e.from(Y).update(i).eq(`id`,n).eq(`user_id`,t).select(`id, user_id, parent_id, name, created_at, updated_at`).single();if(r.error)throw r.error;return Q({...r.data,system_key:null})}throw o}return Q(a)}async function ne(e,t,n){if(!t||!n)throw Error(`Dossier invalide.`);let{error:r}=await e.from(Y).delete().eq(`id`,n).eq(`user_id`,t);if(r)throw r}async function re(e,t){if(!t)throw Error(`Utilisateur non connecté.`);let{data:n,error:r}=await e.from(Y).select(X).eq(`user_id`,t).eq(`system_key`,H).maybeSingle();if(r)throw Z(r)?Error(`Colonne note_folders.system_key absente. Exécute scripts/migrate-note-folders-system-key.sql dans Supabase.`):r;if(n)return Q(n);try{return await $(e,t,{name:U,parentId:null,systemKey:H})}catch(n){if(String(n?.code)===`23505`||String(n?.message??``).includes(`duplicate`)){let{data:n}=await e.from(Y).select(X).eq(`user_id`,t).eq(`system_key`,H).maybeSingle();if(n)return Q(n)}throw n}}export{te as a,q as c,w as d,E as f,T as g,S as h,ee as i,J as l,C as m,ne as n,H as o,k as p,re as r,K as s,$ as t,V as u};