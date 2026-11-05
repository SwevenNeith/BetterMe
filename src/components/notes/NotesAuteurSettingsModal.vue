<script setup>
import { computed, ref, watch } from 'vue'
import {
  AUTEUR_MODULES,
  AUTEUR_NOTE_MODULES,
  AUTEUR_REPETITION_SCOPES,
  AUTEUR_WORLD_MODULES,
  createDefaultAuteurPrefs,
  createEmptyAuteurExclusion,
  mergeAuteurPrefs,
} from '../../constants/notes/auteurModules.js'
import { flattenFolderOptions } from '../../utils/notes/notesTree.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  prefs: { type: Object, default: () => createDefaultAuteurPrefs() },
  extensionPrefs: { type: Object, default: () => ({}) },
  folders: { type: Array, default: () => [] },
  notes: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'save'])

const draft = ref(createDefaultAuteurPrefs())
const moduleToggles = ref({})
const exclusionModule = ref('style')
const errorMessage = ref('')

const scopes = AUTEUR_REPETITION_SCOPES
const noteModules = AUTEUR_NOTE_MODULES
const worldModules = AUTEUR_WORLD_MODULES

const folderOptions = computed(() => flattenFolderOptions(props.folders))

const noteOptions = computed(() =>
  [...(props.notes || [])]
    .slice()
    .sort((a, b) => String(a.title).localeCompare(String(b.title), 'fr', { sensitivity: 'base' }))
    .map((n) => ({ id: n.id, label: n.title || 'Sans titre' })),
)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    draft.value = mergeAuteurPrefs(props.prefs)
    moduleToggles.value = Object.fromEntries(
      AUTEUR_MODULES.map((m) => [
        m.id,
        props.extensionPrefs?.[`auteur-${m.id}`] === true ||
          draft.value.modules?.[m.id] === true,
      ]),
    )
    const firstOn =
      AUTEUR_MODULES.find((m) => moduleToggles.value[m.id])?.id || 'style'
    exclusionModule.value = firstOn
    errorMessage.value = ''
  },
)

const currentExclusion = computed({
  get() {
    if (!draft.value.exclusions[exclusionModule.value]) {
      draft.value.exclusions[exclusionModule.value] = createEmptyAuteurExclusion()
    }
    return draft.value.exclusions[exclusionModule.value]
  },
  set() {},
})

function toggleFolderExclusion(folderId, checked) {
  const ex = currentExclusion.value
  const set = new Set(ex.folderIds || [])
  if (checked) set.add(folderId)
  else set.delete(folderId)
  ex.folderIds = [...set]
}

function toggleNoteExclusion(noteId, checked) {
  const ex = currentExclusion.value
  const set = new Set(ex.noteIds || [])
  if (checked) set.add(noteId)
  else set.delete(noteId)
  ex.noteIds = [...set]
}

function isFolderExcluded(folderId) {
  return (currentExclusion.value.folderIds || []).includes(folderId)
}

function isNoteExcluded(noteId) {
  return (currentExclusion.value.noteIds || []).includes(noteId)
}

function onSave() {
  const nextPrefs = mergeAuteurPrefs({
    ...draft.value,
    modules: { ...moduleToggles.value },
  })
  const nextExt = { ...props.extensionPrefs }
  for (const m of AUTEUR_MODULES) {
    nextExt[`auteur-${m.id}`] = Boolean(moduleToggles.value[m.id])
  }
  emit('save', { auteurPrefs: nextPrefs, extensionPrefs: nextExt })
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="auteur-settings"
      role="dialog"
      aria-modal="true"
      aria-label="Paramètres Auteur"
    >
      <div class="auteur-settings__overlay" @click="emit('close')" />
      <div class="auteur-settings__card">
        <header class="auteur-settings__header">
          <div>
            <h2 class="auteur-settings__title">Auteur — modules</h2>
            <p class="auteur-settings__sub">
              Les outils « note » s’ouvrent depuis une note. Les outils « monde » depuis le coffre.
            </p>
          </div>
          <button type="button" class="auteur-settings__close" aria-label="Fermer" @click="emit('close')">
            ×
          </button>
        </header>

        <h3 class="auteur-settings__group-title">Sur une note</h3>
        <ul class="auteur-settings__modules">
          <li v-for="mod in noteModules" :key="mod.id">
            <label class="auteur-settings__mod">
              <input v-model="moduleToggles[mod.id]" type="checkbox" />
              <span>
                <strong>{{ mod.name }}</strong>
                <small>{{ mod.description }}</small>
              </span>
            </label>
          </li>
        </ul>

        <h3 class="auteur-settings__group-title">Au niveau du coffre</h3>
        <ul class="auteur-settings__modules">
          <li v-for="mod in worldModules" :key="mod.id">
            <label class="auteur-settings__mod">
              <input v-model="moduleToggles[mod.id]" type="checkbox" />
              <span>
                <strong>{{ mod.name }}</strong>
                <small>{{ mod.description }}</small>
              </span>
            </label>
          </li>
        </ul>

        <section class="auteur-settings__block">
          <h3>Exclusions</h3>
          <p class="auteur-settings__hint">
            Dossiers ou notes ignorés par un module (ex. Templates, fiches personnages pour le style).
          </p>
          <label>
            Module
            <select v-model="exclusionModule">
              <option v-for="m in AUTEUR_MODULES" :key="m.id" :value="m.id">{{ m.name }}</option>
            </select>
          </label>
          <div class="auteur-settings__exclude">
            <div>
              <p class="auteur-settings__exclude-title">Dossiers exclus</p>
              <label
                v-for="opt in folderOptions"
                :key="opt.id || 'root'"
                class="auteur-settings__check"
              >
                <input
                  type="checkbox"
                  :disabled="!opt.id"
                  :checked="opt.id ? isFolderExcluded(opt.id) : false"
                  @change="toggleFolderExclusion(opt.id, $event.target.checked)"
                />
                {{ opt.label }}
              </label>
              <p v-if="!folderOptions.filter((o) => o.id).length" class="auteur-settings__hint">
                Aucun dossier dans ce contexte.
              </p>
            </div>
            <div>
              <p class="auteur-settings__exclude-title">Notes exclues</p>
              <div class="auteur-settings__notes-scroll">
                <label
                  v-for="opt in noteOptions"
                  :key="opt.id"
                  class="auteur-settings__check"
                >
                  <input
                    type="checkbox"
                    :checked="isNoteExcluded(opt.id)"
                    @change="toggleNoteExclusion(opt.id, $event.target.checked)"
                  />
                  {{ opt.label }}
                </label>
              </div>
              <p v-if="!noteOptions.length" class="auteur-settings__hint">Aucune note.</p>
            </div>
          </div>
        </section>

        <section v-if="moduleToggles.repetitions" class="auteur-settings__block">
          <h3>Répétitions</h3>
          <label>
            Portée
            <select v-model="draft.repetitions.scope">
              <option v-for="s in scopes" :key="s.id" :value="s.id">{{ s.label }}</option>
            </select>
          </label>
          <label v-if="draft.repetitions.scope === 'window'">
            Fenêtre (mots)
            <input v-model.number="draft.repetitions.windowSize" type="number" min="5" max="500" />
          </label>
          <label class="auteur-settings__check">
            <input v-model="draft.repetitions.ignoreDialogues" type="checkbox" />
            Ignorer les dialogues
          </label>
          <label class="auteur-settings__check">
            <input v-model="draft.repetitions.detectAnaphora" type="checkbox" />
            Repérer les anaphores en début de phrase
          </label>
          <label class="auteur-settings__check">
            <input v-model="draft.repetitions.detectPhrases" type="checkbox" />
            Expressions de 2–3 mots
          </label>
        </section>

        <section v-if="moduleToggles.style" class="auteur-settings__block">
          <h3>Style — seuils</h3>
          <label>
            Phrase longue (≥ mots)
            <input v-model.number="draft.style.longSentenceWords" type="number" min="15" max="120" />
          </label>
          <label>
            Adverbes / 100 mots
            <input v-model.number="draft.style.adverbDensityPer100" type="number" min="1" max="20" step="0.5" />
          </label>
          <label>
            Remplissage / 100 mots
            <input v-model.number="draft.style.fillerDensityPer100" type="number" min="1" max="20" step="0.5" />
          </label>
        </section>

        <p v-if="errorMessage" class="auteur-settings__error">{{ errorMessage }}</p>

        <footer class="auteur-settings__footer">
          <button type="button" class="auteur-settings__btn" @click="emit('close')">Annuler</button>
          <button type="button" class="auteur-settings__btn auteur-settings__btn--primary" @click="onSave">
            Enregistrer
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.auteur-settings__overlay {
  position: fixed;
  inset: 0;
  background: rgba(40, 25, 55, 0.35);
  z-index: 110;
}
.auteur-settings__card {
  position: fixed;
  z-index: 111;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(620px, calc(100vw - 2rem));
  max-height: min(88vh, 780px);
  overflow: auto;
  background: #fff;
  border-radius: 14px;
  padding: 1.1rem 1.2rem 1.2rem;
  box-shadow: 0 16px 40px rgba(60, 30, 80, 0.18);
}
.auteur-settings__header {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}
.auteur-settings__title {
  margin: 0;
  font-size: 1.15rem;
  color: #3b2a4a;
}
.auteur-settings__sub {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: #6d5a7e;
}
.auteur-settings__close {
  border: none;
  background: transparent;
  font-size: 1.35rem;
  cursor: pointer;
  color: #6d5a7e;
}
.auteur-settings__group-title {
  margin: 0.35rem 0 0.45rem;
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #8b6fa3;
}
.auteur-settings__modules {
  list-style: none;
  margin: 0 0 0.85rem;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}
.auteur-settings__mod {
  display: flex;
  gap: 0.65rem;
  align-items: flex-start;
  padding: 0.55rem 0.65rem;
  border: 1px solid #eadff2;
  border-radius: 10px;
  cursor: pointer;
}
.auteur-settings__mod strong {
  display: block;
  color: #3b2a4a;
  font-size: 0.92rem;
}
.auteur-settings__mod small {
  color: #6d5a7e;
  font-size: 0.8rem;
}
.auteur-settings__block {
  border-top: 1px solid #f0e6f6;
  padding-top: 0.75rem;
  margin-bottom: 0.75rem;
  display: grid;
  gap: 0.45rem;
}
.auteur-settings__block h3 {
  margin: 0 0 0.25rem;
  font-size: 0.95rem;
  color: #3b2a4a;
}
.auteur-settings__block label {
  display: grid;
  gap: 0.2rem;
  font-size: 0.82rem;
  color: #5a4a68;
}
.auteur-settings__block input,
.auteur-settings__block select {
  border: 1px solid #dccfe8;
  border-radius: 8px;
  padding: 0.35rem 0.5rem;
}
.auteur-settings__check {
  display: flex !important;
  align-items: center;
  gap: 0.45rem;
  grid-template-columns: none !important;
}
.auteur-settings__hint {
  margin: 0;
  font-size: 0.78rem;
  color: #8b6fa3;
}
.auteur-settings__exclude {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
.auteur-settings__exclude-title {
  margin: 0 0 0.35rem;
  font-size: 0.8rem;
  font-weight: 650;
  color: #3b2a4a;
}
.auteur-settings__notes-scroll {
  max-height: 160px;
  overflow: auto;
  border: 1px solid #eadff2;
  border-radius: 8px;
  padding: 0.35rem 0.45rem;
  display: grid;
  gap: 0.25rem;
}
.auteur-settings__footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.auteur-settings__btn {
  border: 1px solid #dccfe8;
  background: #fff;
  border-radius: 8px;
  padding: 0.4rem 0.85rem;
  cursor: pointer;
  color: #3b2a4a;
}
.auteur-settings__btn--primary {
  background: #7b5ea7;
  border-color: #7b5ea7;
  color: #fff;
}
.auteur-settings__error {
  color: #b42318;
  font-size: 0.85rem;
}
@media (max-width: 640px) {
  .auteur-settings__exclude {
    grid-template-columns: 1fr;
  }
}
</style>
