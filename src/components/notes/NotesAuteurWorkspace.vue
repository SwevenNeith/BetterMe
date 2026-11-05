<script setup>
import { computed, ref, watch } from 'vue'
import {
  AUTEUR_NOTE_MODULES,
  AUTEUR_STRUCTURE_MODELS,
  AUTEUR_WORLD_MODULES,
  isNoteExcludedFromAuteurModule,
} from '../../constants/notes/auteurModules.js'
import { AUTEUR_RELATION_COLORS, createDefaultAuteurWorld } from '../../constants/notes/auteurWorld.js'
import { detectRepetitions, sortRepetitionFindings } from '../../utils/notes/auteurRepetitions.js'
import { analyzeStyle } from '../../utils/notes/auteurStyle.js'
import { lookupSynonyms, preserveCase } from '../../utils/notes/auteurSynonyms.js'
import {
  buildGenealogyTree,
  buildRelationGraph,
  detectGenealogyIssues,
} from '../../utils/notes/auteurGenealogy.js'
import {
  collectTimelineItems,
  detectTimelineIssues,
  sortTimelineItems,
} from '../../utils/notes/auteurTimeline.js'
import { buildPlotSceneGrid, detectPlotIssues, plotStatusSummary } from '../../utils/notes/auteurPlots.js'
import {
  analyzeStructureProgress,
  countWordsMarkdown,
  getStructureModel,
} from '../../utils/notes/auteurStructure.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** note = panneau latéral ; world = vue coffre */
  variant: { type: String, default: 'note' },
  /** aside | page */
  layout: { type: String, default: 'aside' },
  noteId: { type: String, default: null },
  noteTitle: { type: String, default: '' },
  content: { type: String, default: '' },
  selection: { type: String, default: '' },
  noteExcluded: { type: Boolean, default: false },
  auteurPrefs: { type: Object, required: true },
  auteurWorld: { type: Object, default: () => createDefaultAuteurWorld() },
  enabledModules: { type: Object, default: () => ({}) },
  notes: { type: Array, default: () => [] },
  /** Style CSS du coffre actif (variables --notes-vault-*). */
  themeStyle: { type: Object, default: null },
})

const hasVaultTheme = computed(
  () => Boolean(props.themeStyle && Object.keys(props.themeStyle).length),
)

const emit = defineEmits([
  'close',
  'update:world',
  'jump-to',
  'replace-word',
  'open-synonyms',
  'create-character-note',
])

const activeTab = ref('repetitions')

const modulePool = computed(() =>
  props.variant === 'world' ? AUTEUR_WORLD_MODULES : AUTEUR_NOTE_MODULES,
)

const availableTabs = computed(() =>
  modulePool.value
    .filter((m) => props.enabledModules?.[m.id])
    .map((m) => ({
      id: m.id,
      name: m.name,
      shortName: m.shortName || m.name,
      description: m.description,
    })),
)

watch(
  availableTabs,
  (tabs) => {
    if (!tabs.length) return
    if (!tabs.some((t) => t.id === activeTab.value)) activeTab.value = tabs[0].id
  },
  { immediate: true },
)

const headerTitle = computed(() =>
  props.variant === 'world' ? 'Monde narratif' : props.noteTitle || 'Note',
)

const headerEyebrow = computed(() =>
  props.variant === 'world' ? 'Auteur · coffre' : 'Auteur · note',
)

const characterNames = computed(() => {
  const names = []
  for (const c of props.auteurWorld?.characters || []) {
    names.push(c.name, ...(c.aliases || []))
  }
  return names.filter(Boolean)
})

const ignoreWords = computed(() => {
  const global = props.auteurWorld?.ignoreWords?.global || []
  const local =
    props.noteId && props.auteurWorld?.ignoreWords?.byNote?.[props.noteId]
      ? props.auteurWorld.ignoreWords.byNote[props.noteId]
      : []
  return [...global, ...local]
})

const analysisText = computed(() => {
  const sel = String(props.selection || '').trim()
  return sel || props.content || ''
})

const repetitionResult = computed(() => {
  if (!props.enabledModules?.repetitions) return null
  const r = props.auteurPrefs?.repetitions || {}
  return detectRepetitions({
    text: props.content || '',
    scope: r.scope || 'paragraph',
    windowSize: r.windowSize || 50,
    ignoreDialogues: Boolean(r.ignoreDialogues),
    detectAnaphora: r.detectAnaphora !== false,
    detectPhrases: r.detectPhrases !== false,
    characterNames: characterNames.value,
    ignoreWords: ignoreWords.value,
    groupVariants: true,
  })
})

const repetitionList = computed(() => {
  if (!repetitionResult.value) return []
  return sortRepetitionFindings(
    repetitionResult.value.findings,
    props.auteurPrefs?.repetitions?.sortBy || 'proximity',
  )
})

const styleResult = computed(() => {
  if (!props.enabledModules?.style) return null
  return analyzeStyle(analysisText.value, props.auteurPrefs?.style || {}, {
    adverbExceptions: props.auteurWorld?.styleExtras?.adverbExceptions || [],
    fillers: props.auteurWorld?.styleExtras?.fillers || [],
  })
})

const synonymQuery = ref('')
const synonymResult = ref(null)

function runSynonymLookup(word) {
  const q = String(word || synonymQuery.value || '').trim()
  if (!q) return
  synonymQuery.value = q
  synonymResult.value = lookupSynonyms(q)
}

function applySynonym(syn) {
  const original = synonymResult.value?.query || synonymQuery.value
  emit('replace-word', { from: original, to: preserveCase(original, syn) })
}

const treeFocus = ref(null)
const relationDate = ref('')

const genealogy = computed(() => {
  if (!props.enabledModules?.genealogy) return null
  return buildGenealogyTree({
    characters: props.auteurWorld.characters,
    relations: props.auteurWorld.relations,
    focusId: treeFocus.value || props.auteurPrefs?.genealogy?.focusCharacterId,
    ancestorGens: props.auteurPrefs?.genealogy?.ancestorGens ?? 3,
    descendantGens: props.auteurPrefs?.genealogy?.descendantGens ?? 3,
  })
})

const genealogyIssues = computed(() =>
  props.enabledModules?.genealogy
    ? detectGenealogyIssues(props.auteurWorld.characters, props.auteurWorld.relations)
    : [],
)

const relationGraph = computed(() => {
  if (!props.enabledModules?.genealogy) return null
  return buildRelationGraph({
    characters: props.auteurWorld.characters,
    relations: props.auteurWorld.relations,
    atDate: relationDate.value || null,
    layouts: props.auteurWorld.layouts?.graph || {},
  })
})

const timelineItems = computed(() => {
  if (!props.enabledModules?.timeline) return []
  const items = collectTimelineItems(props.auteurWorld)
  return sortTimelineItems(items, props.auteurPrefs?.timeline?.storyOrder || 'histoire')
})

const timelineIssues = computed(() =>
  props.enabledModules?.timeline
    ? detectTimelineIssues(props.auteurWorld, timelineItems.value)
    : [],
)

const plotSummary = computed(() =>
  props.enabledModules?.plots ? plotStatusSummary(props.auteurWorld.plots) : null,
)

const plotGrid = computed(() =>
  props.enabledModules?.plots
    ? buildPlotSceneGrid(props.auteurWorld.plots, props.auteurWorld.structure?.scenes || [])
    : null,
)

const plotIssues = computed(() =>
  props.enabledModules?.plots
    ? detectPlotIssues(
        props.auteurWorld.plots,
        props.auteurWorld.structure?.scenes || [],
      )
    : [],
)

const structureModel = computed(() =>
  getStructureModel(
    props.auteurWorld.structure?.modelId || 'three-acts',
    props.auteurWorld.structure?.customSteps,
  ),
)

const wordCounts = computed(() => {
  /** @type {Record<string, number>} */
  const map = {}
  for (const n of props.notes || []) {
    if (isNoteExcludedFromAuteurModule(props.auteurPrefs, 'structure', n)) continue
    map[n.id] = countWordsMarkdown(n.content_md || '')
  }
  return map
})

const structureProgress = computed(() =>
  props.enabledModules?.structure
    ? analyzeStructureProgress(
        props.auteurWorld.structure?.scenes || [],
        structureModel.value,
        wordCounts.value,
      )
    : null,
)

const newCharacterName = ref('')
const newEventTitle = ref('')
const newPlotTitle = ref('')
const newSceneTitle = ref('')
const viewMode = ref('tree')

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function patchWorld(mutator) {
  const next = structuredClone(props.auteurWorld)
  mutator(next)
  emit('update:world', next)
}

function addCharacter() {
  const name = newCharacterName.value.trim()
  if (!name) return
  patchWorld((w) => {
    w.characters.push({
      id: uid('char'),
      name,
      aliases: [],
      camp: '',
      birth: null,
      death: null,
      summary: '',
      ghost: false,
      noteId: null,
    })
  })
  newCharacterName.value = ''
}

function addRelation(fromId, toId, type = 'family', subtype = 'parent') {
  if (!fromId || !toId || fromId === toId) return
  patchWorld((w) => {
    w.relations.push({
      id: uid('rel'),
      fromId,
      toId,
      type,
      subtype,
      ended: false,
      validFrom: null,
      validTo: null,
      label: subtype || type,
    })
  })
}

function materializeGhost(ghostId, name) {
  patchWorld((w) => {
    const existing = w.characters.find((c) => c.id === ghostId)
    if (existing) {
      existing.ghost = false
      existing.name = name || existing.name || ghostId
    } else {
      w.characters.push({
        id: ghostId,
        name: name || ghostId,
        aliases: [],
        ghost: false,
      })
    }
  })
  emit('create-character-note', { id: ghostId, name: name || ghostId })
}

function ignoreWord(word, forever = false) {
  const norm = String(word || '').toLocaleLowerCase('fr')
  if (!norm) return
  patchWorld((w) => {
    if (forever) {
      if (!w.ignoreWords.global.includes(norm)) w.ignoreWords.global.push(norm)
    } else if (props.noteId) {
      if (!w.ignoreWords.byNote[props.noteId]) w.ignoreWords.byNote[props.noteId] = []
      if (!w.ignoreWords.byNote[props.noteId].includes(norm)) {
        w.ignoreWords.byNote[props.noteId].push(norm)
      }
    }
  })
}

function jumpToOffset(start) {
  emit('jump-to', { start })
}

function addEvent() {
  const title = newEventTitle.value.trim()
  if (!title) return
  patchWorld((w) => {
    w.events.push({
      id: uid('ev'),
      title,
      start: null,
      end: null,
      characterIds: [],
      place: null,
      themes: [],
      dependsOn: [],
      storyOrder: (w.events.length || 0) + 1,
      noteId: null,
      arc: null,
    })
  })
  newEventTitle.value = ''
}

function addPlot() {
  const title = newPlotTitle.value.trim()
  if (!title) return
  patchWorld((w) => {
    w.plots.push({
      id: uid('plot'),
      title,
      kind: 'subplot',
      status: 'open',
      description: '',
      characterIds: [],
      beats: [],
    })
  })
  newPlotTitle.value = ''
}

function addScene() {
  const title = newSceneTitle.value.trim()
  if (!title) return
  const scenes = props.auteurWorld.structure?.scenes || []
  patchWorld((w) => {
    if (!w.structure) w.structure = { modelId: 'three-acts', scenes: [], wordGoal: 80000 }
    w.structure.scenes.push({
      id: uid('scene'),
      title,
      noteId: props.noteId,
      stepId: structureModel.value.steps?.[0]?.id || null,
      chapter: null,
      status: 'idea',
      wordCount: countWordsMarkdown(props.content || ''),
      order: scenes.length,
    })
  })
  newSceneTitle.value = ''
}

function setStructureModel(modelId) {
  patchWorld((w) => {
    if (!w.structure) w.structure = { modelId, scenes: [], wordGoal: 80000 }
    w.structure.modelId = modelId
  })
}

const draftParent = ref('')
const draftChild = ref('')

function linkParentChild() {
  addRelation(draftParent.value, draftChild.value, 'family', 'parent')
  draftParent.value = ''
  draftChild.value = ''
}

watch(
  () => props.open,
  (open) => {
    if (open && props.selection) runSynonymLookup(props.selection)
  },
)
</script>

<template>
  <aside
    v-if="open"
    class="auteur-ws"
    :class="{
      'auteur-ws--page': layout === 'page',
      'auteur-ws--world': variant === 'world',
      'auteur-ws--vault': hasVaultTheme,
    }"
    :style="themeStyle || undefined"
    aria-label="Espace Auteur"
  >
    <header class="auteur-ws__head">
      <div>
        <p class="auteur-ws__eyebrow">{{ headerEyebrow }}</p>
        <h2 class="auteur-ws__title">{{ headerTitle }}</h2>
      </div>
      <button type="button" class="auteur-ws__close" aria-label="Fermer" @click="emit('close')">×</button>
    </header>

    <p v-if="!availableTabs.length" class="auteur-ws__empty">
      Aucun module actif. Ouvre les paramètres de l’extension Auteur pour en activer.
    </p>

    <p v-else-if="variant === 'note' && noteExcluded" class="auteur-ws__empty">
      Cette note est exclue des outils Auteur (templates, fiches…). Modifie les exclusions dans les
      paramètres.
    </p>

    <div v-else class="auteur-ws__shell">
      <nav class="auteur-ws__nav" aria-label="Modules Auteur">
        <button
          v-for="tab in availableTabs"
          :key="tab.id"
          type="button"
          class="auteur-ws__nav-item"
          :class="{ 'auteur-ws__nav-item--on': activeTab === tab.id }"
          :title="tab.description"
          @click="activeTab = tab.id"
        >
          <span class="auteur-ws__nav-name">{{ tab.shortName }}</span>
          <span class="auteur-ws__nav-desc">{{ tab.description }}</span>
        </button>
      </nav>

      <div class="auteur-ws__body">
      <!-- Répétitions -->
      <section v-if="activeTab === 'repetitions' && repetitionResult" class="auteur-ws__section">
        <div class="auteur-ws__toolbar">
          <span class="auteur-ws__meta">{{ repetitionList.length }} mot(s) répétés</span>
        </div>
        <ul class="auteur-ws__list">
          <li v-for="item in repetitionList" :key="item.key" class="auteur-ws__card">
            <div class="auteur-ws__card-head">
              <button type="button" class="auteur-ws__link" @click="jumpToOffset(item.occurrences[0]?.start)">
                <span class="sev" :class="`sev--${item.severity}`" />
                <strong>{{ item.label }}</strong>
                <span>×{{ item.count }} · Δ{{ item.minDistance }}</span>
              </button>
              <div class="auteur-ws__card-actions">
                <button type="button" @click="runSynonymLookup(item.label); activeTab = 'synonyms'">
                  Synonymes
                </button>
                <button type="button" @click="ignoreWord(item.label, false)">Ignorer (note)</button>
                <button type="button" @click="ignoreWord(item.label, true)">Toujours</button>
              </div>
            </div>
          </li>
        </ul>
        <div v-if="repetitionResult.anaphora?.length" class="auteur-ws__sub">
          <h3>Anaphores</h3>
          <p v-for="(a, i) in repetitionResult.anaphora" :key="i">
            « {{ a.word }} » ×{{ a.count }}
          </p>
        </div>
        <div v-if="repetitionResult.phrases?.length" class="auteur-ws__sub">
          <h3>Expressions</h3>
          <p v-for="p in repetitionResult.phrases.slice(0, 8)" :key="p.phrase">
            {{ p.phrase }} ×{{ p.count }}
          </p>
        </div>
      </section>

      <!-- Style -->
      <section v-else-if="activeTab === 'style' && styleResult" class="auteur-ws__section">
        <p class="auteur-ws__meta">
          {{ styleResult.wordCount }} mots · {{ styleResult.sentenceCount }} phrases · ~
          {{ styleResult.readingMinutes }} min
          <span v-if="selection"> · sélection</span>
        </p>
        <div class="auteur-ws__kpis">
          <div><span>Moy. phrase</span><strong>{{ styleResult.avgSentenceLength }}</strong></div>
          <div><span>Max</span><strong>{{ styleResult.maxSentenceLength }}</strong></div>
          <div><span>Adverbes</span><strong>{{ styleResult.adverbs.length }}</strong></div>
          <div><span>Passif ?</span><strong>{{ styleResult.passive.length }}</strong></div>
        </div>
        <div class="auteur-ws__rhythm" aria-hidden="true">
          <span
            v-for="(len, i) in styleResult.sentenceLengths"
            :key="i"
            class="auteur-ws__bar"
            :style="{ height: `${Math.min(100, len * 2)}%` }"
            :title="`${len} mots`"
          />
        </div>
        <ul class="auteur-ws__alerts">
          <li v-for="a in styleResult.alerts" :key="a.id" :class="`alert--${a.severity}`">
            {{ a.message }}
          </li>
        </ul>
        <div v-if="auteurPrefs.style?.showVocab" class="auteur-ws__sub">
          <h3>Mots fréquents</h3>
          <p>{{ styleResult.topWords.map((w) => `${w.word} (${w.count})`).join(' · ') || '—' }}</p>
          <p v-if="styleResult.readability != null">Lisibilité ≈ {{ styleResult.readability }}/100</p>
          <p v-if="auteurPrefs.style?.showDialogueShare">
            Dialogue ≈ {{ Math.round(styleResult.dialogueShare * 100) }} %
          </p>
        </div>
        <p class="auteur-ws__hint">
          Le « passif possible » est une suggestion heuristique (être + participe), pas une certitude.
        </p>
      </section>

      <!-- Synonymes -->
      <section v-else-if="activeTab === 'synonyms'" class="auteur-ws__section">
        <form class="auteur-ws__syn-form" @submit.prevent="runSynonymLookup()">
          <input v-model="synonymQuery" type="text" placeholder="Mot à chercher…" />
          <button type="submit">Chercher</button>
        </form>
        <p v-if="synonymResult?.notice" class="auteur-ws__hint">{{ synonymResult.notice }}</p>
        <p v-if="synonymResult && !synonymResult.found" class="auteur-ws__empty">
          Pas d’entrée pour « {{ synonymResult.lemma }} » dans le thésaurus embarqué.
        </p>
        <template v-if="synonymResult?.found">
          <p v-if="synonymResult.definition"><em>{{ synonymResult.definition }}</em></p>
          <div v-for="(sense, i) in synonymResult.senses" :key="i" class="auteur-ws__sub">
            <h3>{{ sense.gloss }}</h3>
            <div class="auteur-ws__chips">
              <button
                v-for="syn in sense.synonyms"
                :key="syn"
                type="button"
                @click="applySynonym(syn)"
              >
                {{ syn }}
              </button>
            </div>
          </div>
          <div v-if="synonymResult.antonyms?.length" class="auteur-ws__sub">
            <h3>Antonymes</h3>
            <p>{{ synonymResult.antonyms.join(', ') }}</p>
          </div>
        </template>
      </section>

      <!-- Généalogie / relations -->
      <section v-else-if="activeTab === 'genealogy'" class="auteur-ws__section">
        <div class="auteur-ws__segment" role="group" aria-label="Vue généalogie">
          <button
            type="button"
            class="auteur-ws__segment-btn"
            :class="{ 'auteur-ws__segment-btn--on': viewMode === 'tree' }"
            @click="viewMode = 'tree'"
          >
            Arbre
          </button>
          <button
            type="button"
            class="auteur-ws__segment-btn"
            :class="{ 'auteur-ws__segment-btn--on': viewMode === 'graph' }"
            @click="viewMode = 'graph'"
          >
            Relations
          </button>
        </div>

        <div class="auteur-ws__form-row">
          <input v-model="newCharacterName" type="text" placeholder="Nouveau personnage…" />
          <button type="button" class="auteur-ws__action" @click="addCharacter">Ajouter</button>
        </div>

        <div class="auteur-ws__form-row">
          <select v-model="draftParent">
            <option value="">Parent…</option>
            <option v-for="c in auteurWorld.characters" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <select v-model="draftChild">
            <option value="">Enfant…</option>
            <option v-for="c in auteurWorld.characters" :key="`c-${c.id}`" :value="c.id">
              {{ c.name }}
            </option>
          </select>
          <button type="button" class="auteur-ws__action" @click="linkParentChild">Lier</button>
        </div>

        <ul v-if="genealogyIssues.length" class="auteur-ws__alerts">
          <li v-for="issue in genealogyIssues" :key="issue.id" :class="`alert--${issue.severity === 'error' ? 'warn' : 'info'}`">
            {{ issue.message }}
            <button
              v-if="issue.id.startsWith('ghost-')"
              type="button"
              @click="materializeGhost(issue.characterIds[0])"
            >
              Créer la fiche
            </button>
          </li>
        </ul>

        <div v-if="viewMode === 'tree' && genealogy" class="auteur-tree">
          <label>
            Centre
            <select v-model="treeFocus">
              <option :value="null">Auto</option>
              <option v-for="c in auteurWorld.characters" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </label>
          <div v-for="level in genealogy.levels" :key="level.level" class="auteur-tree__row">
            <span class="auteur-tree__lv">G{{ level.level }}</span>
            <button
              v-for="node in level.nodes"
              :key="node.id"
              type="button"
              class="auteur-tree__node"
              :class="{ 'auteur-tree__node--ghost': node.ghost }"
              :title="node.summary || node.name"
            >
              {{ node.name }}
            </button>
          </div>
        </div>

        <div v-else-if="relationGraph" class="auteur-graph">
          <label>
            À la date (année)
            <input v-model="relationDate" type="text" placeholder="ex. 1842" />
          </label>
          <svg class="auteur-graph__svg" viewBox="0 0 640 360">
            <line
              v-for="e in relationGraph.edges"
              :key="e.id"
              :x1="relationGraph.nodes.find((n) => n.id === e.from)?.x || 0"
              :y1="relationGraph.nodes.find((n) => n.id === e.from)?.y || 0"
              :x2="relationGraph.nodes.find((n) => n.id === e.to)?.x || 0"
              :y2="relationGraph.nodes.find((n) => n.id === e.to)?.y || 0"
              :stroke="AUTEUR_RELATION_COLORS[e.type] || '#748ffc'"
              :stroke-dasharray="e.ended ? '4 4' : undefined"
              stroke-width="2"
            />
            <g v-for="n in relationGraph.nodes" :key="n.id">
              <circle
                :cx="n.x"
                :cy="n.y"
                :r="n.size / 2"
                class="auteur-graph__node"
                :class="{ 'auteur-graph__node--ghost': n.ghost }"
                stroke-width="1.5"
              >
                <title>{{ n.name }} — {{ n.summary || 'Pas de résumé' }}</title>
              </circle>
              <text
                class="auteur-graph__label"
                :x="n.x"
                :y="n.y + n.size / 2 + 12"
                text-anchor="middle"
                font-size="10"
              >
                {{ n.name }}
              </text>
            </g>
          </svg>
          <p class="auteur-ws__hint">
            Vert alliés · rouge ennemis · rose amours · gris famille. Pointillés = relation terminée.
          </p>
        </div>
      </section>

      <!-- Frise -->
      <section v-else-if="activeTab === 'timeline'" class="auteur-ws__section">
        <div class="auteur-ws__form-row">
          <input v-model="newEventTitle" type="text" placeholder="Nouvel événement…" />
          <button type="button" @click="addEvent">Ajouter</button>
        </div>
        <ul v-if="timelineIssues.length" class="auteur-ws__alerts">
          <li v-for="issue in timelineIssues" :key="issue.id" :class="`alert--${issue.severity === 'error' ? 'warn' : 'info'}`">
            {{ issue.message }}
          </li>
        </ul>
        <ol class="auteur-ws__timeline">
          <li v-for="item in timelineItems" :key="item.id">
            <time>{{ item.start || '—' }}</time>
            <div>
              <strong>{{ item.title }}</strong>
              <span v-if="item.place"> · {{ item.place }}</span>
              <span v-if="item.ages" class="auteur-ws__meta">
                · âges
                {{
                  Object.entries(item.ages)
                    .map(([id, age]) => {
                      const c = auteurWorld.characters.find((x) => x.id === id)
                      return `${c?.name || id} ${age}a`
                    })
                    .join(', ')
                }}
              </span>
            </div>
          </li>
        </ol>
        <p v-if="!timelineItems.length" class="auteur-ws__empty">
          Ajoute des personnages (naissances/décès) ou des événements.
        </p>
      </section>

      <!-- Intrigues -->
      <section v-else-if="activeTab === 'plots'" class="auteur-ws__section">
        <div v-if="plotSummary" class="auteur-ws__kpis">
          <div><span>Ouverts</span><strong>{{ plotSummary.open }}</strong></div>
          <div><span>En cours</span><strong>{{ plotSummary.active }}</strong></div>
          <div><span>Résolus</span><strong>{{ plotSummary.resolved }}</strong></div>
          <div><span>Volontaires</span><strong>{{ plotSummary['intentionally-open'] }}</strong></div>
        </div>
        <div class="auteur-ws__form-row">
          <input v-model="newPlotTitle" type="text" placeholder="Nouveau fil…" />
          <button type="button" @click="addPlot">Ajouter</button>
        </div>
        <ul v-if="plotIssues.length" class="auteur-ws__alerts">
          <li v-for="issue in plotIssues" :key="issue.id" class="alert--info">{{ issue.message }}</li>
        </ul>
        <div v-if="plotGrid" class="auteur-ws__grid-wrap">
          <table class="auteur-ws__grid">
            <thead>
              <tr>
                <th>Fil</th>
                <th v-for="s in plotGrid.scenes" :key="s.id">{{ s.title }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in plotGrid.rows" :key="row.plot.id">
                <th>{{ row.plot.title }}</th>
                <td v-for="(cell, i) in row.cells" :key="i">
                  <span v-if="cell" class="beat" :class="`beat--${cell}`">{{ cell[0] }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="auteur-ws__hint">O = ouverture, A = avance, R = résolution (à lier via les jalons du monde).</p>
      </section>

      <!-- Structure -->
      <section v-else-if="activeTab === 'structure' && structureProgress" class="auteur-ws__section">
        <label>
          Modèle
          <select
            :value="auteurWorld.structure?.modelId || 'three-acts'"
            @change="setStructureModel($event.target.value)"
          >
            <option v-for="m in AUTEUR_STRUCTURE_MODELS" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
        </label>
        <p class="auteur-ws__meta">
          {{ structureProgress.totalWords }} mots · objectif
          {{ auteurWorld.structure?.wordGoal || 80000 }} ·
          {{ structureProgress.sceneCount }} scènes
        </p>
        <div class="auteur-ws__form-row">
          <input v-model="newSceneTitle" type="text" placeholder="Nouvelle scène (note liée)…" />
          <button type="button" @click="addScene">Ajouter</button>
        </div>
        <ul class="auteur-ws__list">
          <li v-for="block in structureProgress.byStep" :key="block.step.id" class="auteur-ws__card">
            <strong>{{ block.step.name }}</strong>
            <span>
              {{ block.pctActual }} % (cible {{ block.pctTarget }} %)
              <em v-if="Math.abs(block.delta) >= 8"> · écart {{ block.delta > 0 ? '+' : '' }}{{ block.delta }}</em>
            </span>
            <p class="auteur-ws__hint">{{ block.step.blurb }}</p>
            <p v-for="q in block.step.questions || []" :key="q" class="auteur-ws__hint">→ {{ q }}</p>
            <ul>
              <li v-for="s in block.scenes" :key="s.id">{{ s.title }} ({{ s.wordCount || 0 }} mots)</li>
            </ul>
          </li>
        </ul>
      </section>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.auteur-ws {
  width: min(400px, 100%);
  border-left: 1px solid var(--notes-vault-border, #eadff2);
  background: var(--notes-vault-main-bg, #fbf8fc);
  color: var(--notes-vault-main-text, #3b2a4a);
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: 100%;
}
.auteur-ws--page {
  width: 100%;
  border-left: none;
  background: var(--notes-vault-main-bg, #faf7fd);
  max-height: none;
  height: 100%;
}
.auteur-ws__head {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--notes-vault-border, #eadff2);
  background: var(--notes-vault-header-bg, #f3ebf9);
  flex-shrink: 0;
}
.auteur-ws__eyebrow {
  margin: 0;
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--notes-vault-main-text-muted, #8b6fa3);
}
.auteur-ws__title {
  margin: 0.1rem 0 0;
  font-size: 1.1rem;
  color: var(--notes-vault-title-main, var(--notes-vault-color, #3b2a4a));
}
.auteur-ws__close {
  border: none;
  background: transparent;
  font-size: 1.3rem;
  cursor: pointer;
  color: var(--notes-vault-main-text-muted, #6d5a7e);
  border-radius: 8px;
  width: 2rem;
  height: 2rem;
}
.auteur-ws__close:hover {
  background: var(--notes-vault-selection-hover, #efe6f7);
  color: var(--notes-vault-color, #ad81be);
}
.auteur-ws__shell {
  display: flex;
  flex: 1;
  min-height: 0;
}
.auteur-ws--page .auteur-ws__shell {
  flex-direction: row;
}
.auteur-ws:not(.auteur-ws--page) .auteur-ws__shell {
  flex-direction: column;
}
.auteur-ws__nav {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--notes-vault-border, #eadff2);
  flex-shrink: 0;
}
.auteur-ws--page .auteur-ws__nav {
  width: 220px;
  border-bottom: none;
  border-right: 1px solid var(--notes-vault-border, #eadff2);
  background: var(--notes-vault-sidebar-bg, #f6f0fa);
  overflow: auto;
}
.auteur-ws:not(.auteur-ws--page) .auteur-ws__nav {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.auteur-ws__nav-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 10px;
  padding: 0.55rem 0.7rem;
  cursor: pointer;
  text-align: left;
  color: var(--notes-vault-main-text-muted, #5a4a68);
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.auteur-ws:not(.auteur-ws--page) .auteur-ws__nav-item {
  flex: 1 1 calc(50% - 0.4rem);
  min-width: 140px;
}
.auteur-ws__nav-item:hover {
  background: var(--notes-vault-selection-hover, #efe6f7);
  color: var(--notes-vault-color, #ad81be);
}
.auteur-ws__nav-item--on {
  background: var(--notes-vault-input-bg, #fff);
  border-color: var(--notes-vault-border-strong, #d4c0e6);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--notes-vault-color, #ad81be) 12%, transparent);
  color: var(--notes-vault-main-text, #3b2a4a);
}
.auteur-ws__nav-name {
  font-size: 0.86rem;
  font-weight: 650;
}
.auteur-ws__nav-desc {
  font-size: 0.72rem;
  color: var(--notes-vault-main-text-muted, #8b6fa3);
  line-height: 1.25;
}
.auteur-ws:not(.auteur-ws--page) .auteur-ws__nav-desc {
  display: none;
}
.auteur-ws__body {
  overflow: auto;
  padding: 0.85rem 1rem 1.25rem;
  flex: 1;
  min-width: 0;
  background: var(--notes-vault-main-bg, transparent);
}
.auteur-ws__segment {
  display: inline-flex;
  padding: 0.2rem;
  gap: 0.15rem;
  background: var(--notes-vault-mode-bg, #efe6f7);
  border-radius: 10px;
  border: 1px solid var(--notes-vault-border-strong, #e0d0ee);
}
.auteur-ws__segment-btn {
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 0.35rem 0.85rem;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--notes-vault-main-text-muted, #6d5a7e);
  cursor: pointer;
}
.auteur-ws__segment-btn--on {
  background: var(--notes-vault-mode-active, #fff);
  color: var(--notes-vault-mode-active-text, var(--notes-vault-main-text, #3b2a4a));
  box-shadow: 0 1px 2px color-mix(in srgb, var(--notes-vault-color, #ad81be) 14%, transparent);
}
.auteur-ws__action {
  border: 1px solid var(--notes-vault-border-strong, #d5c4e6) !important;
  background: var(--notes-vault-input-bg, #fff) !important;
  color: var(--notes-vault-input-text, #3b2a4a) !important;
  border-radius: 8px !important;
  padding: 0.35rem 0.7rem !important;
  font: inherit !important;
  font-size: 0.8rem !important;
  font-weight: 600;
  cursor: pointer;
}
.auteur-ws__action:hover {
  background: var(--notes-vault-selection-hover, #f3ebf9) !important;
  border-color: var(--notes-vault-color, #ad81be) !important;
  color: var(--notes-vault-color, #ad81be) !important;
}
.auteur-ws__section {
  display: grid;
  gap: 0.65rem;
}
.auteur-ws__toolbar,
.auteur-ws__form-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  align-items: center;
}
.auteur-ws__form-row input,
.auteur-ws__form-row select,
.auteur-ws__toolbar select,
.auteur-ws__syn-form input,
.auteur-ws__section > label select,
.auteur-tree label select {
  border: 1px solid var(--notes-vault-border-strong, #d5c4e6);
  border-radius: 8px;
  padding: 0.35rem 0.5rem;
  font: inherit;
  font-size: 0.82rem;
  flex: 1;
  min-width: 0;
  background: var(--notes-vault-input-bg, #fff);
  color: var(--notes-vault-input-text, #3b2a4a);
}
.auteur-ws__form-row > button:not(.auteur-ws__action),
.auteur-ws__syn-form button,
.auteur-ws__card-actions button,
.auteur-ws__chips button {
  border: 1px solid var(--notes-vault-border-strong, #d5c4e6);
  background: var(--notes-vault-input-bg, #fff);
  border-radius: 8px;
  padding: 0.32rem 0.6rem;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  color: var(--notes-vault-input-text, #3b2a4a);
}
.auteur-ws__form-row > button:not(.auteur-ws__action):hover,
.auteur-ws__syn-form button:hover,
.auteur-ws__card-actions button:hover,
.auteur-ws__chips button:hover {
  background: var(--notes-vault-selection-hover, #f3ebf9);
  border-color: var(--notes-vault-color, #ad81be);
  color: var(--notes-vault-color, #ad81be);
}
.auteur-ws__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.4rem;
}
.auteur-ws__card {
  border: 1px solid var(--notes-vault-border, #eadff2);
  border-radius: 10px;
  padding: 0.45rem 0.55rem;
  background: var(--notes-vault-input-bg, #fff);
}
.auteur-ws__card-head {
  display: grid;
  gap: 0.35rem;
}
.auteur-ws__link {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
  text-align: left;
  color: var(--notes-vault-main-text, #3b2a4a);
  font-size: 0.85rem;
}
.sev {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fab005;
}
.sev--high {
  background: #e03131;
}
.sev--medium {
  background: #f08c00;
}
.sev--low {
  background: #82c91e;
}
.auteur-ws__card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.auteur-ws__meta {
  font-size: 0.78rem;
  color: var(--notes-vault-main-text-muted, #6d5a7e);
}
.auteur-ws__kpis {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.4rem;
}
.auteur-ws__kpis div {
  background: var(--notes-vault-input-bg, #fff);
  border: 1px solid var(--notes-vault-border, #eadff2);
  border-radius: 10px;
  padding: 0.4rem 0.5rem;
}
.auteur-ws__kpis span {
  display: block;
  font-size: 0.7rem;
  color: var(--notes-vault-main-text-muted, #8b6fa3);
}
.auteur-ws__kpis strong {
  font-size: 1rem;
  color: var(--notes-vault-main-text, #3b2a4a);
}
.auteur-ws__rhythm {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 56px;
  padding: 0.25rem;
  background: var(--notes-vault-input-bg, #fff);
  border-radius: 8px;
  border: 1px solid var(--notes-vault-border, #eadff2);
}
.auteur-ws__bar {
  flex: 1;
  min-width: 3px;
  background: linear-gradient(
    180deg,
    var(--notes-vault-color, #ad81be),
    var(--notes-vault-gradient, #8fa2d4)
  );
  border-radius: 2px 2px 0 0;
}
.auteur-ws__alerts {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.3rem;
}
.auteur-ws__alerts li {
  font-size: 0.8rem;
  padding: 0.4rem 0.5rem;
  border-radius: 8px;
  background: #fff4e6;
  color: #9c5b16;
}
.alert--warn {
  background: #fff0f0 !important;
  color: #a61e1e !important;
}
.alert--info {
  background: #eef3ff !important;
  color: #3b5bdb !important;
}
.auteur-ws__sub h3 {
  margin: 0 0 0.25rem;
  font-size: 0.85rem;
}
.auteur-ws__hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--notes-vault-main-text-muted, #8b6fa3);
}
.auteur-ws__empty {
  margin: 0.5rem 0;
  font-size: 0.85rem;
  color: var(--notes-vault-main-text-muted, #6d5a7e);
}
.auteur-ws__syn-form {
  display: flex;
  gap: 0.35rem;
}
.auteur-ws__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.auteur-tree__row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
  margin: 0.35rem 0;
}
.auteur-tree__lv {
  font-size: 0.7rem;
  color: var(--notes-vault-main-text-muted, #8b6fa3);
  width: 2rem;
}
.auteur-tree__node {
  border: 1px solid var(--notes-vault-border-strong, #dccfe8);
  background: var(--notes-vault-input-bg, #fff);
  color: var(--notes-vault-input-text, #3b2a4a);
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
  font-size: 0.78rem;
  cursor: pointer;
}
.auteur-tree__node:hover {
  border-color: var(--notes-vault-color, #ad81be);
  color: var(--notes-vault-color, #ad81be);
}
.auteur-tree__node--ghost {
  border-style: dashed;
  color: var(--notes-vault-main-text-muted, #868e96);
}
.auteur-graph__svg {
  width: 100%;
  background: var(--notes-vault-graph-bg, var(--notes-vault-input-bg, #fff));
  border-radius: 10px;
  border: 1px solid var(--notes-vault-border, #eadff2);
}
.auteur-graph__node {
  fill: var(--notes-vault-graph-node, var(--notes-vault-accent, #adb5bd));
  stroke: var(--notes-vault-graph-node-stroke, var(--notes-vault-color, #495057));
}
.auteur-graph__node--ghost {
  fill: color-mix(in srgb, var(--notes-vault-main-bg, #f5f5f5) 70%, #adb5bd);
  stroke-dasharray: 3 2;
}
.auteur-graph__label {
  fill: var(--notes-vault-graph-label, var(--notes-vault-main-text, #3b2a4a));
}
.auteur-ws__timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}
.auteur-ws__timeline li {
  display: grid;
  grid-template-columns: 4.5rem 1fr;
  gap: 0.4rem;
  font-size: 0.82rem;
}
.auteur-ws__timeline time {
  color: var(--notes-vault-main-text-muted, #8b6fa3);
  font-variant-numeric: tabular-nums;
}
.auteur-ws__grid-wrap {
  overflow: auto;
}
.auteur-ws__grid {
  border-collapse: collapse;
  font-size: 0.72rem;
  width: 100%;
}
.auteur-ws__grid th,
.auteur-ws__grid td {
  border: 1px solid var(--notes-vault-table-border, var(--notes-vault-border, #eadff2));
  padding: 0.2rem 0.3rem;
  text-align: center;
}
.auteur-ws__grid th {
  background: var(--notes-vault-table-header-bg, var(--notes-vault-header-bg, #f3ebf9));
  color: var(--notes-vault-table-header-text, var(--notes-vault-main-text, #3b2a4a));
}
.beat {
  display: inline-block;
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 4px;
  line-height: 1.1rem;
  text-transform: uppercase;
  font-weight: 700;
}
.beat--open {
  background: #d3f9d8;
}
.beat--advance {
  background: #fff3bf;
}
.beat--resolve {
  background: #d0ebff;
}
</style>
