<script setup>
/* eslint-disable vue/no-mutating-props --
 * `form` est un objet réactif partagé fourni par le parent (mode create).
 * `coverFileInputRef` est un ref du parent relié à l’input fichier.
 */
import { nextTick, ref, watch } from 'vue'
import ReadingBookSheet from './ReadingBookSheet.vue'
import ReadingHalfRating from './ReadingHalfRating.vue'
import ReadingCollectionCombobox from './ReadingCollectionCombobox.vue'
import ReadingSpoilSection from './ReadingSpoilSection.vue'
import {
  formatExtraTagsInput,
  formatFrenchDate,
  formatRatingLabel,
  getBookGenre,
} from '../utils/readingBookForm.js'

const props = defineProps({
  /** 'create' = formulaire d'ajout ; 'sheet' = fiche popup avec édition inline */
  mode: {
    type: String,
    default: 'create',
    validator: (v) => ['create', 'sheet'].includes(v),
  },
  book: {
    type: Object,
    default: null,
  },
  form: {
    type: Object,
    default: null,
  },
  collections: {
    type: Array,
    default: () => [],
  },
  /** Champ actuellement en édition inline (sheet) */
  editingField: {
    type: String,
    default: null,
  },
  draft: {
    type: [String, Number],
    default: '',
  },
  coverPreview: {
    type: String,
    default: '',
  },
  inline: {
    type: Boolean,
    default: false,
  },
  /** Affiche la fiche en pleine largeur (page dédiée). */
  page: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  showCoverControls: {
    type: Boolean,
    default: false,
  },
  coverFileInputRef: {
    type: Object,
    default: null,
  },
  spoilChapters: {
    type: Array,
    default: () => [],
  },
  spoilSaving: {
    type: Boolean,
    default: false,
  },
  spoilError: {
    type: String,
    default: '',
  },
})

const emit = defineEmits([
  'switch-image-mode',
  'cover-file-change',
  'trigger-cover-picker',
  'image-url-input',
  'start-edit',
  'commit-edit',
  'cancel-edit',
  'update:draft',
  'rating-change',
  'is-saga-change',
  'collection-created',
  'delete-spoil-chapter',
])

const fieldInputRef = ref(null)

const MULTILINE_FIELDS = new Set(['comments', 'quote'])

watch(
  () => props.editingField,
  async (field) => {
    if (!field || field === 'rating' || field === 'cover') return
    await nextTick()
    fieldInputRef.value?.focus?.()
    if (typeof fieldInputRef.value?.select === 'function' && !MULTILINE_FIELDS.has(field)) {
      fieldInputRef.value.select()
    }
  },
)

function displayValue(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function isEditing(field) {
  return props.mode === 'sheet' && props.editingField === field
}

function startEdit(field) {
  if (props.mode !== 'sheet' || props.disabled) return
  emit('start-edit', field)
}

function commitEdit() {
  emit('commit-edit')
}

function cancelEdit() {
  emit('cancel-edit')
}

function onDraftInput(event) {
  emit('update:draft', event.target.value)
}

function onFieldKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    cancelEdit()
    return
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    commitEdit()
  }
}

function onRatingChange(value) {
  emit('rating-change', value)
}

function onIsSagaChange(event) {
  emit('is-saga-change', Boolean(event?.target?.checked))
}

function fieldClass(field) {
  return {
    'reading-fiche-value--clickable': props.mode === 'sheet' && !props.disabled,
    'reading-fiche-value--editing': isEditing(field),
  }
}
</script>

<template>
  <ReadingBookSheet :edit="mode === 'create'" :inline="inline" :page="page" :show-spoil="mode === 'sheet'">
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>

    <template v-if="$slots.alert" #alert>
      <slot name="alert" />
    </template>

    <template #cover>
      <template v-if="mode === 'sheet'">
        <button
          type="button"
          class="reading-fiche-cover-btn"
          title="Modifier la couverture"
          :disabled="disabled"
          @click="startEdit('cover')"
        >
          <img
            v-if="
              (isEditing('cover') && (coverPreview || book?.coverUrl)) ||
              (!isEditing('cover') && book?.coverUrl)
            "
            :src="isEditing('cover') ? coverPreview || book?.coverUrl : book?.coverUrl"
            :alt="`Couverture de ${book?.title}`"
            class="reading-fiche-cover"
          />
          <div v-else class="reading-fiche-cover reading-fiche-cover--placeholder">
            <span>couverture du livre</span>
          </div>
        </button>
      </template>
      <template v-else>
        <div v-if="coverPreview" class="reading-fiche-cover-wrap">
          <img :src="coverPreview" alt="Aperçu couverture" class="reading-fiche-cover" />
        </div>
        <div v-else class="reading-fiche-cover reading-fiche-cover--placeholder">
          <span>couverture du livre</span>
        </div>
      </template>
    </template>

    <template #info>
      <!-- Titre -->
      <div class="reading-fiche-field">
        <span class="reading-fiche-label">Titre :</span>
        <template v-if="mode === 'create'">
          <input
            v-model="form.title"
            type="text"
            class="reading-fiche-input"
            maxlength="200"
            required
            autofocus
          />
        </template>
        <template v-else-if="isEditing('title')">
          <input
            ref="fieldInputRef"
            :value="draft"
            type="text"
            class="reading-fiche-input"
            maxlength="200"
            :disabled="disabled"
            @input="onDraftInput"
            @keydown="onFieldKeydown"
            @blur="commitEdit"
          />
        </template>
        <button
          v-else
          type="button"
          class="reading-fiche-value"
          :class="fieldClass('title')"
          @click="startEdit('title')"
        >
          {{ book?.title || '—' }}
        </button>
      </div>

      <!-- Auteur -->
      <div class="reading-fiche-field">
        <span class="reading-fiche-label">Auteur :</span>
        <template v-if="mode === 'create'">
          <input v-model="form.author" type="text" class="reading-fiche-input" maxlength="200" />
        </template>
        <template v-else-if="isEditing('author')">
          <input
            ref="fieldInputRef"
            :value="draft"
            type="text"
            class="reading-fiche-input"
            maxlength="200"
            :disabled="disabled"
            @input="onDraftInput"
            @keydown="onFieldKeydown"
            @blur="commitEdit"
          />
        </template>
        <button
          v-else
          type="button"
          class="reading-fiche-value"
          :class="fieldClass('author')"
          @click="startEdit('author')"
        >
          {{ book?.author || '—' }}
        </button>
      </div>

      <!-- Collection + Série -->
      <div class="reading-fiche-row reading-fiche-row--collection">
        <div class="reading-fiche-field reading-fiche-field--collection">
          <span class="reading-fiche-label">Collection :</span>
          <template v-if="mode === 'create'">
            <ReadingCollectionCombobox
              v-model="form.collection"
              :collections="collections"
              :disabled="disabled"
            />
          </template>
          <template v-else-if="isEditing('collection')">
            <ReadingCollectionCombobox
              :model-value="String(draft ?? '')"
              :collections="collections"
              :disabled="disabled"
              autofocus
              @update:model-value="(value) => emit('update:draft', value)"
              @commit="
                (value) => {
                  emit('update:draft', value)
                  emit('commit-edit')
                }
              "
              @cancel="emit('cancel-edit')"
            />
          </template>
          <button
            v-else
            type="button"
            class="reading-fiche-value"
            :class="fieldClass('collection')"
            @click="startEdit('collection')"
          >
            {{ book?.collection || '—' }}
          </button>
        </div>

        <label class="reading-fiche-saga">
          <input
            v-if="mode === 'create'"
            v-model="form.isSaga"
            type="checkbox"
            class="reading-fiche-saga__input"
            :disabled="disabled"
          />
          <input
            v-else
            type="checkbox"
            class="reading-fiche-saga__input"
            :checked="Boolean(book?.is_saga)"
            :disabled="disabled"
            @change="onIsSagaChange"
          />
          <span class="reading-fiche-saga__label">Série</span>
        </label>
      </div>

      <!-- Dates + note : popup uniquement -->
      <template v-if="mode === 'sheet'">
        <div class="reading-fiche-row reading-fiche-row--dates">
          <div class="reading-fiche-field">
            <span class="reading-fiche-label">Date de début :</span>
            <template v-if="isEditing('dateStart')">
              <input
                ref="fieldInputRef"
                :value="draft"
                type="date"
                class="reading-fiche-input"
                :disabled="disabled"
                @input="onDraftInput"
                @keydown="onFieldKeydown"
                @change="commitEdit"
                @blur="commitEdit"
              />
            </template>
            <button
              v-else
              type="button"
              class="reading-fiche-value"
              :class="fieldClass('dateStart')"
              @click="startEdit('dateStart')"
            >
              {{ formatFrenchDate(book?.date_start) }}
            </button>
          </div>
          <div class="reading-fiche-field">
            <span class="reading-fiche-label">Date de fin :</span>
            <template v-if="isEditing('dateEnd')">
              <input
                ref="fieldInputRef"
                :value="draft"
                type="date"
                class="reading-fiche-input"
                :disabled="disabled"
                @input="onDraftInput"
                @keydown="onFieldKeydown"
                @change="commitEdit"
                @blur="commitEdit"
              />
            </template>
            <button
              v-else
              type="button"
              class="reading-fiche-value"
              :class="fieldClass('dateEnd')"
              @click="startEdit('dateEnd')"
            >
              {{ formatFrenchDate(book?.date_end) }}
            </button>
          </div>
        </div>

        <div class="reading-fiche-field">
          <span class="reading-fiche-label">Note :</span>
          <ReadingHalfRating
            :model-value="book?.rating"
            :disabled="disabled"
            @update:model-value="onRatingChange"
          />
          <span v-if="book?.rating != null" class="reading-fiche-form-hint">{{
            formatRatingLabel(book.rating)
          }}</span>
        </div>
      </template>
    </template>

    <template v-if="showCoverControls || isEditing('cover')" #cover-controls>
      <div class="reading-fiche-cover-edit">
        <span class="reading-fiche-label">Couverture :</span>
        <div class="reading-fiche-image-mode">
          <button
            v-if="mode === 'sheet'"
            type="button"
            class="reading-fiche-mode-btn"
            :class="{ 'reading-fiche-mode-btn--active': form?.imageMode === 'keep' }"
            :disabled="disabled"
            @click="emit('switch-image-mode', 'keep')"
          >
            Conserver
          </button>
          <button
            type="button"
            class="reading-fiche-mode-btn"
            :class="{ 'reading-fiche-mode-btn--active': form?.imageMode === 'upload' }"
            :disabled="disabled"
            @click="emit('switch-image-mode', 'upload')"
          >
            Téléverser
          </button>
          <button
            type="button"
            class="reading-fiche-mode-btn"
            :class="{ 'reading-fiche-mode-btn--active': form?.imageMode === 'url' }"
            :disabled="disabled"
            @click="emit('switch-image-mode', 'url')"
          >
            URL
          </button>
        </div>

        <div v-if="form?.imageMode === 'upload'" class="reading-fiche-upload">
          <input
            :ref="
              (el) => {
                if (coverFileInputRef) coverFileInputRef.value = el
              }
            "
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            class="reading-fiche-file-input"
            @change="emit('cover-file-change', $event)"
          />
          <button
            type="button"
            class="reading-fiche-upload-btn"
            :disabled="disabled"
            @click="emit('trigger-cover-picker')"
          >
            Choisir une image
          </button>
        </div>

        <input
          v-else-if="form?.imageMode === 'url'"
          v-model="form.imageUrl"
          type="url"
          class="reading-fiche-input"
          placeholder="https://exemple.com/couverture.jpg"
          :disabled="disabled"
          @input="emit('image-url-input')"
          @keydown="onFieldKeydown"
          @blur="mode === 'sheet' ? commitEdit() : null"
        />

        <div v-if="mode === 'sheet'" class="reading-fiche-form-actions" style="margin-top: 0.5rem">
          <button
            type="button"
            class="reading-fiche-save-btn"
            :disabled="disabled"
            @mousedown.prevent
            @click="commitEdit"
          >
            Valider
          </button>
          <button
            type="button"
            class="reading-fiche-cancel-btn"
            :disabled="disabled"
            @mousedown.prevent
            @click="cancelEdit"
          >
            Annuler
          </button>
        </div>
      </div>
    </template>

    <template #about>
      <template v-if="mode === 'create'">
        <div class="reading-fiche-about-grid">
          <label class="reading-fiche-edit-field">
            <span class="reading-fiche-label">Genre :</span>
            <input
              v-model="form.genre"
              type="text"
              class="reading-fiche-input"
              maxlength="80"
              placeholder="Ex: Fantasy"
            />
          </label>
          <label class="reading-fiche-edit-field">
            <span class="reading-fiche-label">Pages :</span>
            <input
              v-model="form.pages"
              type="number"
              min="1"
              class="reading-fiche-input"
              placeholder="Ex: 320"
            />
          </label>
          <label class="reading-fiche-edit-field">
            <span class="reading-fiche-label">Année :</span>
            <input
              v-model="form.publicationYear"
              type="number"
              min="0"
              max="2100"
              class="reading-fiche-input"
              placeholder="Ex: 2020"
            />
          </label>
        </div>
        <label class="reading-fiche-edit-field" style="margin-top: 0.65rem">
          <span class="reading-fiche-label">Autres mots clés :</span>
          <input
            v-model="form.extraTags"
            type="text"
            class="reading-fiche-input"
            maxlength="400"
            placeholder="classique, dystopie"
          />
        </label>
      </template>

      <template v-else>
        <div class="reading-fiche-about-grid">
          <div class="reading-fiche-field">
            <span class="reading-fiche-label">Genre :</span>
            <template v-if="isEditing('genre')">
              <input
                ref="fieldInputRef"
                :value="draft"
                type="text"
                class="reading-fiche-input"
                maxlength="80"
                :disabled="disabled"
                @input="onDraftInput"
                @keydown="onFieldKeydown"
                @blur="commitEdit"
              />
            </template>
            <button
              v-else
              type="button"
              class="reading-fiche-value"
              :class="fieldClass('genre')"
              @click="startEdit('genre')"
            >
              {{ getBookGenre(book) || '—' }}
            </button>
          </div>
          <div class="reading-fiche-field">
            <span class="reading-fiche-label">Pages :</span>
            <template v-if="isEditing('pages')">
              <input
                ref="fieldInputRef"
                :value="draft"
                type="number"
                min="1"
                class="reading-fiche-input"
                :disabled="disabled"
                @input="onDraftInput"
                @keydown="onFieldKeydown"
                @blur="commitEdit"
              />
            </template>
            <button
              v-else
              type="button"
              class="reading-fiche-value"
              :class="fieldClass('pages')"
              @click="startEdit('pages')"
            >
              {{ book?.pages ?? '—' }}
            </button>
          </div>
          <div class="reading-fiche-field">
            <span class="reading-fiche-label">Année :</span>
            <template v-if="isEditing('publicationYear')">
              <input
                ref="fieldInputRef"
                :value="draft"
                type="number"
                min="0"
                max="2100"
                class="reading-fiche-input"
                :disabled="disabled"
                @input="onDraftInput"
                @keydown="onFieldKeydown"
                @blur="commitEdit"
              />
            </template>
            <button
              v-else
              type="button"
              class="reading-fiche-value"
              :class="fieldClass('publicationYear')"
              @click="startEdit('publicationYear')"
            >
              {{ book?.publication_year ?? '—' }}
            </button>
          </div>
        </div>

        <div class="reading-fiche-field" style="margin-top: 0.65rem">
          <span class="reading-fiche-label">Autres mots clés :</span>
          <template v-if="isEditing('extraTags')">
            <input
              ref="fieldInputRef"
              :value="draft"
              type="text"
              class="reading-fiche-input"
              maxlength="400"
              :disabled="disabled"
              @input="onDraftInput"
              @keydown="onFieldKeydown"
              @blur="commitEdit"
            />
          </template>
          <button
            v-else
            type="button"
            class="reading-fiche-value"
            :class="fieldClass('extraTags')"
            @click="startEdit('extraTags')"
          >
            {{ formatExtraTagsInput(book) || '—' }}
          </button>
        </div>
      </template>
    </template>

    <template #comments>
      <template v-if="mode === 'create'">
        <textarea
          v-model="form.comments"
          class="reading-fiche-textarea"
          rows="5"
          maxlength="5000"
          placeholder="Tes impressions, ce qui t'a marqué…"
        />
      </template>
      <template v-else-if="isEditing('comments')">
        <textarea
          ref="fieldInputRef"
          :value="draft"
          class="reading-fiche-textarea"
          rows="5"
          maxlength="5000"
          :disabled="disabled"
          @input="onDraftInput"
          @keydown="onFieldKeydown"
          @blur="commitEdit"
        />
      </template>
      <button
        v-else
        type="button"
        class="reading-fiche-value reading-fiche-value--multiline reading-fiche-value--block"
        :class="[
          fieldClass('comments'),
          { 'reading-fiche-value--empty': !displayValue(book?.comments) },
        ]"
        @click="startEdit('comments')"
      >
        {{ displayValue(book?.comments) || '' }}
      </button>
    </template>

    <template #spoil>
      <ReadingSpoilSection
        :book-id="book?.id"
        :chapters="spoilChapters"
        :disabled="disabled"
        :is-saving="spoilSaving"
        :error-message="spoilError"
        @delete-chapter="(id) => emit('delete-spoil-chapter', id)"
      />
    </template>

    <template #quote>
      <template v-if="mode === 'create'">
        <textarea
          v-model="form.quote"
          class="reading-fiche-textarea"
          rows="4"
          maxlength="2000"
          placeholder="Une citation marquante…"
        />
      </template>
      <template v-else-if="isEditing('quote')">
        <textarea
          ref="fieldInputRef"
          :value="draft"
          class="reading-fiche-textarea"
          rows="4"
          maxlength="2000"
          :disabled="disabled"
          @input="onDraftInput"
          @keydown="onFieldKeydown"
          @blur="commitEdit"
        />
      </template>
      <button
        v-else
        type="button"
        class="reading-fiche-value reading-fiche-value--multiline reading-fiche-value--block"
        :class="[fieldClass('quote'), { 'reading-fiche-value--empty': !displayValue(book?.quote) }]"
        @click="startEdit('quote')"
      >
        {{ displayValue(book?.quote) || '' }}
      </button>
    </template>

    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </ReadingBookSheet>
</template>

<style scoped>
.reading-fiche-cover-btn {
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.reading-fiche-value {
  display: block;
  width: 100%;
  text-align: left;
  font: inherit;
  background: transparent;
  border: none;
  border-bottom: 1px dashed rgba(173, 129, 190, 0.55);
  padding: 0.3rem 0;
  color: #2c2434;
  cursor: default;
}

.reading-fiche-value--clickable {
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s ease;
}

.reading-fiche-value--clickable:hover {
  background: rgba(213, 181, 234, 0.2);
}

.reading-fiche-value--block {
  width: 100%;
}

.reading-fiche-value--multiline {
  --lined-h: 1.75rem;
  border-bottom: none;
  white-space: pre-wrap;
  word-break: break-word;
  min-height: calc(var(--lined-h) * 3);
  line-height: var(--lined-h);
  font-size: 0.95rem;
  padding: 0;
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(var(--lined-h) - 1px),
    rgba(173, 129, 190, 0.38) calc(var(--lined-h) - 1px),
    rgba(173, 129, 190, 0.38) var(--lined-h)
  );
  background-size: 100% var(--lined-h);
  background-position: left top;
  background-attachment: local;
}

.reading-fiche-value--empty {
  color: transparent;
  font-style: normal;
}

@media (prefers-color-scheme: dark) {
  .reading-fiche-value {
    color: #f0e8f8;
    border-bottom-color: rgba(173, 129, 190, 0.45);
  }

  .reading-fiche-value--multiline {
    background-image: repeating-linear-gradient(
      to bottom,
      transparent 0,
      transparent calc(var(--lined-h) - 1px),
      rgba(173, 129, 190, 0.28) calc(var(--lined-h) - 1px),
      rgba(173, 129, 190, 0.28) var(--lined-h)
    );
  }

  .reading-fiche-value--clickable:hover {
    background: rgba(173, 129, 190, 0.22);
  }
}
</style>
