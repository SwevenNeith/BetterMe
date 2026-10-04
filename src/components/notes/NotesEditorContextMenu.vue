<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import {
  TEXT_COLOR_PRESETS,
  normalizeHex,
} from '../../utils/common/richNoteTextColors.js'
import {
  configureEmojiPickerElement,
  FRENCH_EMOJI_DATA,
  loadEmojiPickerElement,
} from '../../composables/useEmojiPickerElement.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  /** editor | preview | sidebar */
  source: { type: String, default: 'editor' },
  selectedText: { type: String, default: '' },
  word: { type: String, default: '' },
  noteId: { type: String, default: '' },
  hasHighlight: { type: Boolean, default: false },
  dictionaryHitLabel: { type: String, default: '' },
  rabbitHoleEnabled: { type: Boolean, default: false },
  canPaste: { type: Boolean, default: false },
  spellcheck: {
    type: Object,
    default: null,
  },
  textColorPresets: {
    type: Array,
    default: () => TEXT_COLOR_PRESETS.slice(0, 20),
  },
  highlightColorPresets: {
    type: Array,
    default: () => [
      '#fff3a3',
      '#ffe599',
      '#f9cb9c',
      '#f4cccc',
      '#d9ead3',
      '#cfe2f3',
      '#d9d2e9',
      '#ead1dc',
      '#efefef',
      '#ffff00',
    ],
  },
})

const emit = defineEmits([
  'close',
  'wiki-link',
  'external-link',
  'search',
  'extract',
  'format',
  'block',
  'insert',
  'cut',
  'copy',
  'paste',
  'paste-plain',
  'select-all',
  'highlight',
  'erase-highlight',
  'dictionary-add',
  'dictionary-link',
  'rabbit-hole',
  'dashboard-pin',
  'open-tab',
  'spell-suggestion',
  'color',
  'emoji',
])

/** @type {import('vue').Ref<null | 'format' | 'paragraph' | 'insert' | 'text-color' | 'highlight-color' | 'emoji'>} */
const openSubmenu = ref(null)
const menuEl = ref(null)
const emojiPickerRef = ref(null)
const emojiPickerReady = ref(false)
const emojiPickerLoading = ref(false)
const menuLeft = ref(0)
const menuTop = ref(0)
const menuMaxHeight = ref(560)

const hasSelection = computed(() => Boolean(String(props.selectedText ?? '').trim()))
const isEditor = computed(() => props.source === 'editor')
const isSidebar = computed(() => props.source === 'sidebar')
const searchLabel = computed(() => {
  const text = String(props.selectedText ?? '').trim()
  if (!text) return 'Rechercher'
  const short = text.length > 28 ? `${text.slice(0, 25)}…` : text
  return `Rechercher « ${short} »`
})

const VIEWPORT_MARGIN = 8

function fitMenuInViewport() {
  if (typeof window === 'undefined') return
  const el = menuEl.value
  const margin = VIEWPORT_MARGIN
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Hauteur max = tout l’espace vertical utile (évite le bas coupé hors écran)
  menuMaxHeight.value = Math.max(180, vh - margin * 2)

  const width = el?.offsetWidth || 280
  const height = el ? Math.min(el.scrollHeight, menuMaxHeight.value) : 320

  let left = Number(props.x) || 0
  let top = Number(props.y) || 0

  if (left + width > vw - margin) left = vw - width - margin
  if (left < margin) left = margin

  if (top + height > vh - margin) top = vh - height - margin
  if (top < margin) top = margin

  menuLeft.value = Math.round(left)
  menuTop.value = Math.round(top)
}

async function repositionMenu() {
  await nextTick()
  fitMenuInViewport()
  // 2e passe après paint (scrollHeight plus fiable)
  await nextTick()
  requestAnimationFrame(() => fitMenuInViewport())
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      openSubmenu.value = null
      return
    }
    menuLeft.value = props.x
    menuTop.value = props.y
    void repositionMenu()
  },
)

watch(
  () => [props.x, props.y, props.spellcheck, openSubmenu.value, props.selectedText, props.word],
  () => {
    if (!props.open) return
    void repositionMenu()
  },
)

function toggleSubmenu(id) {
  openSubmenu.value = openSubmenu.value === id ? null : id
}

function run(eventName, payload) {
  emit(eventName, payload)
}

function onFormat(kind) {
  run('format', kind)
}

function onBlock(kind) {
  run('block', kind)
}

function onInsert(kind) {
  run('insert', kind)
}

function onPickColor(kind, color) {
  const hex = normalizeHex(color)
  if (!hex) return
  run('color', { kind, color: hex })
}

async function openEmojiPicker() {
  if (openSubmenu.value === 'emoji') {
    openSubmenu.value = null
    return
  }
  openSubmenu.value = 'emoji'
  if (emojiPickerReady.value) {
    await nextTick()
    configureEmojiPickerElement(emojiPickerRef.value)
    void repositionMenu()
    return
  }
  emojiPickerLoading.value = true
  try {
    await loadEmojiPickerElement()
    emojiPickerReady.value = true
    await nextTick()
    configureEmojiPickerElement(emojiPickerRef.value)
    void repositionMenu()
  } finally {
    emojiPickerLoading.value = false
  }
}

function onEmojiClick(event) {
  const unicode = String(event?.detail?.unicode ?? '').trim()
  if (!unicode) return
  run('emoji', unicode)
}
</script>

<template>
  <div
    v-if="open"
    ref="menuEl"
    class="notes-ctx"
    role="menu"
    :style="{
      top: `${menuTop}px`,
      left: `${menuLeft}px`,
      maxHeight: `${menuMaxHeight}px`,
    }"
    @contextmenu.prevent
  >
    <!-- Sidebar -->
    <template v-if="isSidebar">
      <button
        v-if="noteId"
        type="button"
        class="notes-ctx__item"
        role="menuitem"
        @mousedown.prevent
        @click="run('open-tab')"
      >
        <span class="notes-ctx__ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v7H3V3h7"/></svg>
        </span>
        <span class="notes-ctx__label">Ouvrir dans un nouvel onglet</span>
      </button>
      <button
        type="button"
        class="notes-ctx__item"
        role="menuitem"
        @mousedown.prevent
        @click="run('dashboard-pin')"
      >
        <span class="notes-ctx__ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        </span>
        <span class="notes-ctx__label">Mettre sur le Dashboard</span>
      </button>
    </template>

    <!-- Editor / preview -->
    <template v-else>
      <template v-if="spellcheck">
        <p v-if="spellcheck.loading" class="notes-ctx__hint">Vérification…</p>
        <template v-else-if="spellcheck.suggestions?.length">
          <p v-if="spellcheck.message" class="notes-ctx__hint">{{ spellcheck.message }}</p>
          <button
            v-for="suggestion in spellcheck.suggestions"
            :key="`spell-${suggestion}`"
            type="button"
            class="notes-ctx__item notes-ctx__item--accent"
            role="menuitem"
            @mousedown.prevent
            @click="run('spell-suggestion', suggestion)"
          >
            <span class="notes-ctx__ico" aria-hidden="true">✓</span>
            <span class="notes-ctx__label">{{ suggestion }}</span>
          </button>
          <div class="notes-ctx__sep" />
        </template>
      </template>

      <template v-if="isEditor && hasSelection">
        <button
          type="button"
          class="notes-ctx__item"
          role="menuitem"
          @mousedown.prevent
          @click="run('wiki-link')"
        >
          <span class="notes-ctx__ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          </span>
          <span class="notes-ctx__label">Ajouter un lien</span>
        </button>
        <button
          type="button"
          class="notes-ctx__item"
          role="menuitem"
          @mousedown.prevent
          @click="run('external-link')"
        >
          <span class="notes-ctx__ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </span>
          <span class="notes-ctx__label">Ajouter un lien externe</span>
        </button>

        <div class="notes-ctx__sep" />

        <button
          type="button"
          class="notes-ctx__item"
          role="menuitem"
          @mousedown.prevent
          @click="run('search')"
        >
          <span class="notes-ctx__ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <span class="notes-ctx__label">{{ searchLabel }}</span>
        </button>
        <button
          type="button"
          class="notes-ctx__item"
          role="menuitem"
          @mousedown.prevent
          @click="run('extract')"
        >
          <span class="notes-ctx__ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3v12"/><circle cx="6" cy="18" r="3"/><path d="M6 8c6 0 8 2 10 6"/><circle cx="18" cy="17" r="3"/></svg>
          </span>
          <span class="notes-ctx__label">Extraire la sélection actuelle…</span>
        </button>

        <div class="notes-ctx__row">
          <button
            type="button"
            class="notes-ctx__item"
            :class="{ 'notes-ctx__item--open': openSubmenu === 'format' }"
            role="menuitem"
            aria-haspopup="true"
            @mousedown.prevent
            @click="toggleSubmenu('format')"
          >
            <span class="notes-ctx__ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 11-6 6 3 3L21 5"/><path d="m14 6 4 4"/></svg>
            </span>
            <span class="notes-ctx__label">Formater</span>
            <span class="notes-ctx__chevron">›</span>
          </button>
          <div v-if="openSubmenu === 'format'" class="notes-ctx__flyout" role="menu">
            <button type="button" class="notes-ctx__item" @mousedown.prevent @click="onFormat('bold')"><strong>Gras</strong></button>
            <button type="button" class="notes-ctx__item" @mousedown.prevent @click="onFormat('italic')"><em>Italique</em></button>
            <button type="button" class="notes-ctx__item" @mousedown.prevent @click="onFormat('underline')"><span style="text-decoration:underline">Souligné</span></button>
            <button type="button" class="notes-ctx__item" @mousedown.prevent @click="onFormat('strike')"><span style="text-decoration:line-through">Barré</span></button>
            <button type="button" class="notes-ctx__item" @mousedown.prevent @click="toggleSubmenu('text-color')">Couleur du texte ›</button>
            <button type="button" class="notes-ctx__item" @mousedown.prevent @click="toggleSubmenu('highlight-color')">Couleur de surlignage ›</button>
          </div>
        </div>

        <div v-if="openSubmenu === 'text-color'" class="notes-ctx__swatches">
          <button
            v-for="color in textColorPresets"
            :key="`t-${color}`"
            type="button"
            class="notes-ctx__swatch"
            :style="{ backgroundColor: color }"
            :title="color"
            @mousedown.prevent
            @click="onPickColor('color', color)"
          />
        </div>
        <div v-if="openSubmenu === 'highlight-color'" class="notes-ctx__swatches">
          <button
            v-for="color in highlightColorPresets"
            :key="`h-${color}`"
            type="button"
            class="notes-ctx__swatch"
            :style="{ backgroundColor: color }"
            :title="color"
            @mousedown.prevent
            @click="onPickColor('highlight', color)"
          />
        </div>

        <div class="notes-ctx__row">
          <button
            type="button"
            class="notes-ctx__item"
            :class="{ 'notes-ctx__item--open': openSubmenu === 'paragraph' }"
            role="menuitem"
            @mousedown.prevent
            @click="toggleSubmenu('paragraph')"
          >
            <span class="notes-ctx__ico" aria-hidden="true">¶</span>
            <span class="notes-ctx__label">Paragraphe</span>
            <span class="notes-ctx__chevron">›</span>
          </button>
          <div v-if="openSubmenu === 'paragraph'" class="notes-ctx__flyout" role="menu">
            <button type="button" class="notes-ctx__item" @mousedown.prevent @click="onBlock('paragraph')">Paragraphe</button>
            <button type="button" class="notes-ctx__item" @mousedown.prevent @click="onBlock('h1')">Titre 1</button>
            <button type="button" class="notes-ctx__item" @mousedown.prevent @click="onBlock('h2')">Titre 2</button>
            <button type="button" class="notes-ctx__item" @mousedown.prevent @click="onBlock('h3')">Titre 3</button>
            <button type="button" class="notes-ctx__item" @mousedown.prevent @click="onBlock('quote')">Citation</button>
          </div>
        </div>

        <div class="notes-ctx__row">
          <button
            type="button"
            class="notes-ctx__item"
            :class="{ 'notes-ctx__item--open': openSubmenu === 'insert' }"
            role="menuitem"
            @mousedown.prevent
            @click="toggleSubmenu('insert')"
          >
            <span class="notes-ctx__ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </span>
            <span class="notes-ctx__label">Insérer</span>
            <span class="notes-ctx__chevron">›</span>
          </button>
          <div v-if="openSubmenu === 'insert'" class="notes-ctx__flyout" role="menu">
            <button type="button" class="notes-ctx__item" @mousedown.prevent @click="onBlock('bullet')">Liste à puces</button>
            <button type="button" class="notes-ctx__item" @mousedown.prevent @click="onBlock('number')">Liste numérotée</button>
            <button type="button" class="notes-ctx__item" @mousedown.prevent @click="onBlock('task')">Case à cocher</button>
            <button type="button" class="notes-ctx__item" @mousedown.prevent @click="onInsert('hr')">Séparateur</button>
            <button type="button" class="notes-ctx__item" @mousedown.prevent @click="onInsert('code')">Bloc de code</button>
            <button type="button" class="notes-ctx__item" @mousedown.prevent @click="onInsert('table')">Tableau</button>
          </div>
        </div>

        <div class="notes-ctx__sep" />
      </template>

      <button
        v-if="isEditor"
        type="button"
        class="notes-ctx__item"
        :disabled="!hasSelection"
        role="menuitem"
        @mousedown.prevent
        @click="run('cut')"
      >
        <span class="notes-ctx__ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
        </span>
        <span class="notes-ctx__label">Couper</span>
      </button>
      <button
        type="button"
        class="notes-ctx__item"
        :disabled="!hasSelection"
        role="menuitem"
        @mousedown.prevent
        @click="run('copy')"
      >
        <span class="notes-ctx__ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </span>
        <span class="notes-ctx__label">Copier</span>
      </button>
      <button
        v-if="isEditor"
        type="button"
        class="notes-ctx__item"
        :disabled="!canPaste"
        role="menuitem"
        @mousedown.prevent
        @click="run('paste')"
      >
        <span class="notes-ctx__ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
        </span>
        <span class="notes-ctx__label">Coller</span>
      </button>
      <button
        v-if="isEditor"
        type="button"
        class="notes-ctx__item"
        :disabled="!canPaste"
        role="menuitem"
        @mousedown.prevent
        @click="run('paste-plain')"
      >
        <span class="notes-ctx__ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 14h6M10 11h4M10 17h4"/></svg>
        </span>
        <span class="notes-ctx__label">Coller en texte brut</span>
      </button>
      <button
        v-if="isEditor"
        type="button"
        class="notes-ctx__item"
        role="menuitem"
        @mousedown.prevent
        @click="run('select-all')"
      >
        <span class="notes-ctx__ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
        </span>
        <span class="notes-ctx__label">Tout sélectionner</span>
      </button>

      <template v-if="isEditor">
        <div class="notes-ctx__sep" />
        <button
          type="button"
          class="notes-ctx__item"
          :class="{ 'notes-ctx__item--open': openSubmenu === 'emoji' }"
          role="menuitem"
          aria-haspopup="true"
          @mousedown.prevent
          @click="openEmojiPicker"
        >
          <span class="notes-ctx__ico" aria-hidden="true">😀</span>
          <span class="notes-ctx__label">Émoji</span>
          <span class="notes-ctx__chevron">›</span>
        </button>
        <div v-if="openSubmenu === 'emoji'" class="notes-ctx__emoji-panel" @mousedown.stop>
          <p v-if="emojiPickerLoading || !emojiPickerReady" class="notes-ctx__hint">
            Chargement des emojis…
          </p>
          <emoji-picker
            v-else
            ref="emojiPickerRef"
            class="notes-ctx__emoji-picker"
            locale="fr"
            :data-source="FRENCH_EMOJI_DATA"
            @emoji-click="onEmojiClick"
          />
          <p class="notes-ctx__hint">Astuce : tape aussi <code>:sourire:</code> dans la note.</p>
        </div>
      </template>

      <template v-if="isEditor && hasSelection">
        <div class="notes-ctx__sep" />
        <button
          type="button"
          class="notes-ctx__item"
          role="menuitem"
          @mousedown.prevent
          @click="run('highlight')"
        >
          <span class="notes-ctx__ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 11-6 6 3 3L21 5"/><path d="m14 6 4 4"/></svg>
          </span>
          <span class="notes-ctx__label">Surligner</span>
        </button>
        <button
          type="button"
          class="notes-ctx__item"
          :disabled="!hasHighlight"
          role="menuitem"
          @mousedown.prevent
          @click="run('erase-highlight')"
        >
          <span class="notes-ctx__ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 11-6 6 3 3L21 5"/><line x1="3" y1="3" x2="21" y2="21"/></svg>
          </span>
          <span class="notes-ctx__label">Effacer le surlignage</span>
        </button>
      </template>

      <template v-if="word">
        <div class="notes-ctx__sep" />
        <p v-if="dictionaryHitLabel" class="notes-ctx__hint">Déjà connu : {{ dictionaryHitLabel }}</p>
        <button
          type="button"
          class="notes-ctx__item"
          role="menuitem"
          @mousedown.prevent
          @click="run('dictionary-add')"
        >
          <span class="notes-ctx__ico" aria-hidden="true">+</span>
          <span class="notes-ctx__label">Ajouter une définition</span>
        </button>
        <button
          type="button"
          class="notes-ctx__item"
          role="menuitem"
          @mousedown.prevent
          @click="run('dictionary-link')"
        >
          <span class="notes-ctx__ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          </span>
          <span class="notes-ctx__label">Lier à une définition</span>
        </button>
      </template>

      <div class="notes-ctx__sep" />
      <button
        v-if="rabbitHoleEnabled && hasSelection"
        type="button"
        class="notes-ctx__item"
        role="menuitem"
        @mousedown.prevent
        @click="run('rabbit-hole')"
      >
        <span class="notes-ctx__ico" aria-hidden="true">◎</span>
        <span class="notes-ctx__label">Ajouter au Rabbit Hole</span>
      </button>
      <button
        type="button"
        class="notes-ctx__item"
        role="menuitem"
        @mousedown.prevent
        @click="run('dashboard-pin')"
      >
        <span class="notes-ctx__ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        </span>
        <span class="notes-ctx__label">{{ hasSelection ? 'Mettre la sélection sur le Dashboard' : 'Mettre sur le Dashboard' }}</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.notes-ctx {
  position: fixed;
  z-index: 1100;
  box-sizing: border-box;
  min-width: 260px;
  max-width: min(340px, calc(100vw - 1rem));
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0.35rem;
  padding-bottom: 0.45rem;
  border-radius: 10px;
  background: #f7f4ef;
  border: 1px solid #e4ddd2;
  box-shadow: 0 12px 36px rgba(40, 30, 20, 0.16);
  color: #3a342c;
  font-size: 0.88rem;
}

.notes-ctx__hint {
  margin: 0.2rem 0.55rem 0.35rem;
  font-size: 0.76rem;
  color: #7a7164;
}

.notes-ctx__sep {
  height: 1px;
  margin: 0.28rem 0.4rem;
  background: #e5ddd0;
}

.notes-ctx__row {
  position: relative;
}

.notes-ctx__item {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 0.42rem 0.55rem;
  border-radius: 6px;
  font: inherit;
  color: inherit;
  cursor: pointer;
}

.notes-ctx__item:hover,
.notes-ctx__item--open {
  background: #ebe4d8;
}

.notes-ctx__item:disabled {
  opacity: 0.45;
  cursor: default;
}

.notes-ctx__item:disabled:hover {
  background: transparent;
}

.notes-ctx__item--accent {
  font-weight: 650;
  color: #5b3d7a;
}

.notes-ctx__ico {
  width: 1.05rem;
  height: 1.05rem;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #5c5348;
  font-size: 0.95rem;
  font-weight: 700;
}

.notes-ctx__ico svg {
  width: 100%;
  height: 100%;
  display: block;
}

.notes-ctx__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notes-ctx__chevron {
  color: #9a9082;
  font-size: 1.1rem;
  line-height: 1;
}

.notes-ctx__flyout {
  margin: 0.1rem 0 0.25rem 1.6rem;
  padding: 0.15rem;
  border-radius: 8px;
  background: #fffdf9;
  border: 1px solid #e4ddd2;
}

.notes-ctx__swatches {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 0.2rem;
  padding: 0.25rem 0.45rem 0.45rem 1.6rem;
}

.notes-ctx__swatch {
  width: 100%;
  aspect-ratio: 1;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 4px;
  cursor: pointer;
  padding: 0;
}

.notes-ctx__swatch:hover {
  outline: 2px solid #8e6aa8;
  outline-offset: 1px;
}

.notes-ctx__emoji-panel {
  margin: 0.15rem 0 0.35rem;
  padding: 0.25rem;
  border-radius: 8px;
  background: #fffdf9;
  border: 1px solid #e4ddd2;
}

.notes-ctx__emoji-picker {
  width: 100%;
  height: 280px;
}

.notes-ctx__emoji-panel code {
  font-size: 0.78em;
  background: rgba(0, 0, 0, 0.06);
  padding: 0.05rem 0.25rem;
  border-radius: 4px;
}

@media (prefers-color-scheme: dark) {
  .notes-ctx {
    background: #2a2433;
    border-color: rgba(213, 181, 234, 0.22);
    color: #f0e8f8;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35);
  }

  .notes-ctx__hint {
    color: #b8a8c8;
  }

  .notes-ctx__sep {
    background: rgba(213, 181, 234, 0.18);
  }

  .notes-ctx__item:hover,
  .notes-ctx__item--open {
    background: rgba(213, 181, 234, 0.14);
  }

  .notes-ctx__ico {
    color: #c5b8d2;
  }

  .notes-ctx__flyout {
    background: #322a3e;
    border-color: rgba(213, 181, 234, 0.22);
  }

  .notes-ctx__emoji-panel {
    background: #322a3e;
    border-color: rgba(213, 181, 234, 0.22);
  }

  .notes-ctx__emoji-panel code {
    background: rgba(255, 255, 255, 0.08);
  }
}
</style>
