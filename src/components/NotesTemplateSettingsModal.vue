<script setup>
import { computed, ref, watch } from 'vue'
import { supabase } from '../lib/supabase.js'
import { NOTE_TEMPLATE_FOLDER_SOURCES, NOTE_TEMPLATE_RULE_TYPES } from '../constants/noteTemplates.js'
import { ensureNoteTemplatesFolder } from '../services/noteFolders.js'
import { labelForTemplateRuleType } from '../services/noteTemplateExtension.js'
import { flattenFolderOptions } from '../utils/notesTree.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  prefs: {
    type: Object,
    required: true,
  },
  folders: {
    type: Array,
    default: () => [],
  },
  notes: {
    type: Array,
    default: () => [],
  },
  userId: {
    type: String,
    required: true,
  },
})

const emit = defineEmits(['close', 'save'])

const draftFolderName = ref('')
const draftFolderSource = ref('create')
const draftExistingFolderId = ref(null)
const draftRules = ref([])
const isSaving = ref(false)
const errorMessage = ref('')

const folderOptions = computed(() => flattenFolderOptions(props.folders))

const folderSourceOptions = computed(() => NOTE_TEMPLATE_FOLDER_SOURCES)

const draftTemplatesFolderId = computed(() => {
  if (draftFolderSource.value === 'existing') return draftExistingFolderId.value
  return props.prefs?.folderId ?? null
})

const templateNotes = computed(() => {
  const folderId = draftTemplatesFolderId.value
  if (!folderId) return []
  return props.notes
    .filter((note) => (note.folder_id ?? null) === folderId)
    .slice()
    .sort((a, b) => String(a.title).localeCompare(String(b.title), 'fr', { sensitivity: 'base' }))
})

const templateOptions = computed(() =>
  templateNotes.value.map((note) => ({
    id: note.id,
    label: note.title,
  })),
)

const ruleTypeOptions = computed(() => NOTE_TEMPLATE_RULE_TYPES)

const varTitreExample = '{{titre}}'
const varDateExample = '{{date}}'

function resetDraft() {
  draftFolderName.value = props.prefs?.folderName ?? 'Templates'
  draftFolderSource.value = props.prefs?.folderSource === 'existing' ? 'existing' : 'create'
  draftExistingFolderId.value =
    props.prefs?.folderSource === 'existing' ? props.prefs?.folderId ?? null : null
  draftRules.value = (props.prefs?.rules ?? []).map((rule) => ({ ...rule }))
  errorMessage.value = ''
  isSaving.value = false
}

function addRule(type) {
  const templateNoteId = templateOptions.value[0]?.id ?? ''
  draftRules.value = [
    ...draftRules.value,
    {
      id: crypto.randomUUID(),
      type,
      folderId: folderOptions.value.find((item) => item.id)?.id ?? null,
      pattern: '',
      templateNoteId,
    },
  ]
}

function removeRule(ruleId) {
  draftRules.value = draftRules.value.filter((rule) => rule.id !== ruleId)
}

function updateRule(ruleId, patch) {
  draftRules.value = draftRules.value.map((rule) =>
    rule.id === ruleId ? { ...rule, ...patch } : rule,
  )
}

function ruleSummary(rule) {
  if (rule.type === 'folder') {
    const folder = props.folders.find((item) => item.id === rule.folderId)
    return folder ? `Dossier « ${folder.name} »` : 'Dossier non choisi'
  }
  if (rule.type === 'title-exact') {
    return rule.pattern ? `Titre = « ${rule.pattern} »` : 'Titre exact non défini'
  }
  if (rule.type === 'title-contains') {
    return rule.pattern ? `Titre contient « ${rule.pattern} »` : 'Texte non défini'
  }
  return 'Toutes les nouvelles notes'
}

function validateDraft() {
  if (draftFolderSource.value === 'create') {
    if (!draftFolderName.value.trim()) {
      errorMessage.value = 'Indiquez un nom pour le dossier Templates.'
      return false
    }
  } else if (!draftExistingFolderId.value) {
    errorMessage.value = 'Sélectionnez un dossier existant.'
    return false
  }

  for (const rule of draftRules.value) {
    if (!rule.templateNoteId) {
      errorMessage.value = 'Chaque règle doit référencer un modèle.'
      return false
    }
    if (rule.type === 'folder' && !rule.folderId) {
      errorMessage.value = 'Sélectionnez un dossier pour chaque règle « Dans un dossier ».'
      return false
    }
    if ((rule.type === 'title-exact' || rule.type === 'title-contains') && !String(rule.pattern ?? '').trim()) {
      errorMessage.value = 'Indiquez un texte pour les règles sur le titre.'
      return false
    }
  }

  const defaultCount = draftRules.value.filter((rule) => rule.type === 'default').length
  if (defaultCount > 1) {
    errorMessage.value = 'Une seule règle « Par défaut » est autorisée.'
    return false
  }

  errorMessage.value = ''
  return true
}

async function save() {
  if (!validateDraft()) return

  isSaving.value = true
  errorMessage.value = ''

  try {
    let folder

    if (draftFolderSource.value === 'existing') {
      folder = props.folders.find((item) => item.id === draftExistingFolderId.value)
      if (!folder) throw new Error('Dossier introuvable.')
    } else {
      folder = await ensureNoteTemplatesFolder(
        supabase,
        props.userId,
        draftFolderName.value.trim(),
      )
    }

    emit('save', {
      folderSource: draftFolderSource.value,
      folderName: folder.name,
      folderId: folder.id,
      rules: draftRules.value.map((rule) => ({
        id: rule.id,
        type: rule.type,
        folderId: rule.type === 'folder' ? rule.folderId : null,
        pattern:
          rule.type === 'title-exact' || rule.type === 'title-contains'
            ? String(rule.pattern ?? '').trim()
            : '',
        templateNoteId: rule.templateNoteId,
      })),
      folder,
    })
    emit('close')
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Impossible d’enregistrer les paramètres.'
  } finally {
    isSaving.value = false
  }
}

function onKeydown(event) {
  if (!props.open) return
  if (event.key === 'Escape') emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      resetDraft()
      window.addEventListener('keydown', onKeydown)
    } else {
      window.removeEventListener('keydown', onKeydown)
    }
  },
)
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="notes-tpl" role="dialog" aria-modal="true" aria-label="Paramètres Templates">
      <div class="notes-tpl__overlay" @click="emit('close')" />
      <div class="notes-tpl__card">
        <header class="notes-tpl__header">
          <div>
            <h2 class="notes-tpl__title">Extension Templates</h2>
            <p class="notes-tpl__subtitle">
              Crée des modèles dans un dossier dédié, puis définis des règles pour pré-remplir
              automatiquement les nouvelles notes.
            </p>
          </div>
          <button type="button" class="notes-tpl__close" aria-label="Fermer" @click="emit('close')">
            ×
          </button>
        </header>

        <section class="notes-tpl__section">
          <h3 class="notes-tpl__section-title">Dossier Templates</h3>
          <p class="notes-tpl__hint">
            Toutes tes notes modèles vivent dans ce dossier. Crée-en un nouveau ou sélectionne un
            dossier déjà présent dans l’arborescence.
          </p>

          <div class="notes-tpl__mode-row">
            <label
              v-for="option in folderSourceOptions"
              :key="option.id"
              class="notes-tpl__mode"
              :class="{ 'notes-tpl__mode--active': draftFolderSource === option.id }"
            >
              <input
                v-model="draftFolderSource"
                type="radio"
                name="template-folder-source"
                :value="option.id"
                :disabled="isSaving"
              />
              <span class="notes-tpl__mode-label">{{ option.label }}</span>
              <span class="notes-tpl__mode-hint">{{ option.hint }}</span>
            </label>
          </div>

          <label v-if="draftFolderSource === 'create'" class="notes-tpl__field">
            <span class="notes-tpl__label">Nom du nouveau dossier</span>
            <input
              v-model="draftFolderName"
              type="text"
              class="notes-tpl__input"
              maxlength="120"
              placeholder="Templates"
              :disabled="isSaving"
            />
          </label>

          <label v-else class="notes-tpl__field">
            <span class="notes-tpl__label">Dossier existant</span>
            <select
              v-model="draftExistingFolderId"
              class="notes-tpl__select"
              :disabled="isSaving"
            >
              <option :value="null">Choisir un dossier…</option>
              <option
                v-for="folder in folderOptions.filter((item) => item.id)"
                :key="folder.id"
                :value="folder.id"
              >
                {{ folder.label }}
              </option>
            </select>
          </label>
        </section>

        <section class="notes-tpl__section">
          <div class="notes-tpl__section-head">
            <h3 class="notes-tpl__section-title">Modèles disponibles</h3>
            <span class="notes-tpl__count">{{ templateNotes.length }}</span>
          </div>
          <p class="notes-tpl__hint">
            Crée des notes dans le dossier Templates depuis l’arborescence : leur contenu servira de
            modèle. Les variables disponibles (<code>{{ varTitreExample }}</code>,
            <code>{{ varDateExample }}</code>, etc.) sont documentées dans la section
            <strong>13. Templates</strong> du Tutoriel Markdown.
          </p>
          <ul v-if="templateNotes.length" class="notes-tpl__templates">
            <li v-for="note in templateNotes" :key="note.id" class="notes-tpl__template-item">
              <span class="notes-tpl__template-title">{{ note.title }}</span>
              <span class="notes-tpl__template-preview">
                {{ String(note.content_md ?? '').replace(/\s+/g, ' ').trim().slice(0, 72) || '—' }}
              </span>
            </li>
          </ul>
          <p v-else class="notes-tpl__empty">
            Aucun modèle pour l’instant.
            <template v-if="draftFolderSource === 'existing' && !draftExistingFolderId">
              Sélectionne d’abord un dossier.
            </template>
            <template v-else>
              Enregistre la configuration, puis ajoute des notes dans le dossier Templates.
            </template>
          </p>
        </section>

        <section class="notes-tpl__section">
          <div class="notes-tpl__section-head">
            <h3 class="notes-tpl__section-title">Règles d’application</h3>
            <div class="notes-tpl__add-row">
              <button
                v-for="option in ruleTypeOptions"
                :key="option.type"
                type="button"
                class="notes-tpl__add-btn"
                :disabled="isSaving || !templateOptions.length"
                :title="option.hint"
                @click="addRule(option.type)"
              >
                + {{ option.label }}
              </button>
            </div>
          </div>
          <p class="notes-tpl__hint">
            Priorité : titre exact → titre contient → dossier → par défaut. Les notes créées dans le
            dossier Templates ne sont jamais pré-remplies.
          </p>

          <ul v-if="draftRules.length" class="notes-tpl__rules">
            <li v-for="rule in draftRules" :key="rule.id" class="notes-tpl__rule">
              <div class="notes-tpl__rule-head">
                <span class="notes-tpl__rule-badge">{{ labelForTemplateRuleType(rule.type) }}</span>
                <span class="notes-tpl__rule-summary">{{ ruleSummary(rule) }}</span>
                <button
                  type="button"
                  class="notes-tpl__rule-remove"
                  :disabled="isSaving"
                  aria-label="Supprimer la règle"
                  @click="removeRule(rule.id)"
                >
                  ×
                </button>
              </div>

              <div class="notes-tpl__rule-fields">
                <label v-if="rule.type === 'folder'" class="notes-tpl__field notes-tpl__field--grow">
                  <span class="notes-tpl__label">Dossier cible</span>
                  <select
                    class="notes-tpl__select"
                    :value="rule.folderId ?? ''"
                    :disabled="isSaving"
                    @change="updateRule(rule.id, { folderId: $event.target.value || null })"
                  >
                    <option value="">Choisir…</option>
                    <option
                      v-for="folder in folderOptions.filter((item) => item.id)"
                      :key="folder.id"
                      :value="folder.id"
                    >
                      {{ folder.label }}
                    </option>
                  </select>
                </label>

                <label
                  v-else-if="rule.type === 'title-exact' || rule.type === 'title-contains'"
                  class="notes-tpl__field notes-tpl__field--grow"
                >
                  <span class="notes-tpl__label">
                    {{ rule.type === 'title-exact' ? 'Titre exact' : 'Texte contenu dans le titre' }}
                  </span>
                  <input
                    class="notes-tpl__input"
                    type="text"
                    maxlength="200"
                    :value="rule.pattern"
                    :disabled="isSaving"
                    @input="updateRule(rule.id, { pattern: $event.target.value })"
                  />
                </label>

                <label class="notes-tpl__field notes-tpl__field--grow">
                  <span class="notes-tpl__label">Modèle à appliquer</span>
                  <select
                    class="notes-tpl__select"
                    :value="rule.templateNoteId"
                    :disabled="isSaving || !templateOptions.length"
                    @change="updateRule(rule.id, { templateNoteId: $event.target.value })"
                  >
                    <option value="">Choisir…</option>
                    <option v-for="template in templateOptions" :key="template.id" :value="template.id">
                      {{ template.label }}
                    </option>
                  </select>
                </label>
              </div>
            </li>
          </ul>

          <p v-else class="notes-tpl__empty">Aucune règle. Ajoute-en une pour automatiser la création.</p>
        </section>

        <p v-if="errorMessage" class="notes-tpl__error">{{ errorMessage }}</p>

        <footer class="notes-tpl__footer">
          <button type="button" class="notes-tpl__btn" :disabled="isSaving" @click="emit('close')">
            Annuler
          </button>
          <button
            type="button"
            class="notes-tpl__btn notes-tpl__btn--primary"
            :disabled="isSaving"
            @click="save"
          >
            {{ isSaving ? 'Enregistrement…' : 'Enregistrer' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.notes-tpl__overlay {
  position: fixed;
  inset: 0;
  background: rgba(40, 25, 55, 0.38);
  z-index: 110;
}

.notes-tpl__card {
  position: fixed;
  z-index: 111;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(640px, calc(100vw - 2rem));
  max-height: min(88vh, 760px);
  overflow: auto;
  background: #fff;
  border-radius: 16px;
  padding: 1.15rem 1.25rem 1.1rem;
  box-shadow: 0 18px 48px rgba(60, 30, 80, 0.2);
  border: 1px solid #e6ddf2;
}

.notes-tpl__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.notes-tpl__title {
  margin: 0;
  font-size: 1.15rem;
  color: #3b2a4a;
}

.notes-tpl__subtitle {
  margin: 0.3rem 0 0;
  font-size: 0.84rem;
  line-height: 1.45;
  color: #6d5a7e;
}

.notes-tpl__close {
  border: none;
  background: transparent;
  color: #6d5a7e;
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.1rem 0.35rem;
}

.notes-tpl__section {
  margin-top: 0.9rem;
  padding-top: 0.9rem;
  border-top: 1px solid #ece4f6;
}

.notes-tpl__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.notes-tpl__section-title {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 700;
  color: #3b2a4a;
}

.notes-tpl__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.4rem;
  height: 1.4rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: rgba(149, 209, 170, 0.25);
  color: #2f6b45;
  font-size: 0.72rem;
  font-weight: 800;
}

.notes-tpl__hint {
  margin: 0.4rem 0 0;
  font-size: 0.8rem;
  line-height: 1.45;
  color: #6d5a7e;
}

.notes-tpl__hint code {
  font-size: 0.78rem;
  background: rgba(213, 181, 234, 0.2);
  padding: 0.05rem 0.3rem;
  border-radius: 4px;
}

.notes-tpl__mode-row {
  display: grid;
  gap: 0.45rem;
  margin-top: 0.55rem;
}

.notes-tpl__mode {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.15rem 0.55rem;
  align-items: start;
  padding: 0.55rem 0.65rem;
  border-radius: 10px;
  border: 1px solid #e6ddf2;
  background: #faf7fd;
  cursor: pointer;
}

.notes-tpl__mode--active {
  border-color: #c9a8e4;
  background: rgba(213, 181, 234, 0.16);
  box-shadow: 0 0 0 2px rgba(173, 129, 190, 0.12);
}

.notes-tpl__mode input {
  margin-top: 0.15rem;
}

.notes-tpl__mode-label {
  font-size: 0.84rem;
  font-weight: 700;
  color: #3b2a4a;
}

.notes-tpl__mode-hint {
  grid-column: 2;
  font-size: 0.76rem;
  line-height: 1.4;
  color: #7a6888;
}

.notes-tpl__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-top: 0.55rem;
}

.notes-tpl__field--grow {
  flex: 1;
  min-width: 0;
}

.notes-tpl__label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #8b6fa0;
}

.notes-tpl__input,
.notes-tpl__select {
  width: 100%;
  padding: 0.5rem 0.65rem;
  border-radius: 10px;
  border: 1px solid #dfd0ef;
  background: #faf7fd;
  font-size: 0.86rem;
  color: #3b2a4a;
}

.notes-tpl__templates {
  list-style: none;
  margin: 0.65rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.4rem;
  max-height: 8rem;
  overflow: auto;
}

.notes-tpl__template-item {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  padding: 0.5rem 0.6rem;
  border-radius: 10px;
  border: 1px solid #e6ddf2;
  background: #faf7fd;
}

.notes-tpl__template-title {
  font-size: 0.84rem;
  font-weight: 700;
  color: #3b2a4a;
}

.notes-tpl__template-preview {
  font-size: 0.76rem;
  color: #7a6888;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notes-tpl__add-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.notes-tpl__add-btn {
  padding: 0.28rem 0.55rem;
  border-radius: 999px;
  border: 1px solid #d8c4ea;
  background: rgba(213, 181, 234, 0.14);
  color: #6d4f84;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
}

.notes-tpl__add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.notes-tpl__rules {
  list-style: none;
  margin: 0.65rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}

.notes-tpl__rule {
  border: 1px solid #e6ddf2;
  border-radius: 12px;
  padding: 0.6rem 0.65rem;
  background: #faf7fd;
}

.notes-tpl__rule-head {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-bottom: 0.45rem;
}

.notes-tpl__rule-badge {
  flex-shrink: 0;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  background: rgba(149, 209, 170, 0.28);
  color: #2f6b45;
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.notes-tpl__rule-summary {
  flex: 1;
  min-width: 0;
  font-size: 0.8rem;
  font-weight: 650;
  color: #5a4a68;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notes-tpl__rule-remove {
  flex-shrink: 0;
  width: 1.5rem;
  height: 1.5rem;
  border: none;
  border-radius: 6px;
  background: rgba(192, 57, 43, 0.1);
  color: #b03a2e;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
}

.notes-tpl__rule-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.notes-tpl__empty {
  margin: 0.55rem 0 0;
  font-size: 0.82rem;
  color: #8c98a4;
}

.notes-tpl__error {
  margin: 0.75rem 0 0;
  color: #c0392b;
  font-size: 0.84rem;
  font-weight: 600;
}

.notes-tpl__footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
  padding-top: 0.85rem;
  border-top: 1px solid #ece4f6;
}

.notes-tpl__btn {
  padding: 0.5rem 0.9rem;
  border-radius: 10px;
  border: none;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  background: rgba(213, 181, 234, 0.2);
  color: #5c6b7a;
}

.notes-tpl__btn--primary {
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
}

.notes-tpl__btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
