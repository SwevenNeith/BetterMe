<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { supabase } from '../lib/supabase.js'
import { setFilePickerActive, setFileUploadInProgress } from '../composables/useAppTabResume.js'
import {
  listComfortImagesWithUrls,
  uploadComfortImage,
  deleteComfortImage,
  shuffleComfortImages,
} from '../services/comfortImages.js'

const props = defineProps({
  userId: {
    type: String,
    default: null,
  },
})

const isLoading = ref(false)
const isSaving = ref(false)
const errorMessage = ref('')
const images = ref([])
const isEditing = ref(false)
const displayImage = ref(null)
const selectedIds = ref([])
const editPage = ref(0)
const addFileInputRef = ref(null)

const IMAGES_PER_PAGE = 5

const hasImages = computed(() => images.value.length > 0)
const selectedCount = computed(() => selectedIds.value.length)
const hasSelection = computed(() => selectedCount.value > 0)
const totalEditPages = computed(() => Math.max(1, Math.ceil(images.value.length / IMAGES_PER_PAGE)))
const paginatedImages = computed(() => {
  const start = editPage.value * IMAGES_PER_PAGE
  return images.value.slice(start, start + IMAGES_PER_PAGE)
})

function pickRandomDisplayImage() {
  if (!images.value.length) {
    displayImage.value = null
    return
  }
  const shuffled = shuffleComfortImages(images.value)
  displayImage.value = shuffled[0] ?? null
}

async function loadImages() {
  if (!props.userId) {
    images.value = []
    displayImage.value = null
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  try {
    images.value = await listComfortImagesWithUrls(supabase, props.userId)
    selectedIds.value = selectedIds.value.filter((id) => images.value.some((img) => img.id === id))
    if (!isEditing.value) {
      pickRandomDisplayImage()
    }
  } catch (err) {
    console.error('comfort images:', err)
    errorMessage.value = err.message || 'Impossible de charger les images.'
    images.value = []
    displayImage.value = null
    selectedIds.value = []
  } finally {
    isLoading.value = false
  }
}

async function resolveUserId() {
  if (props.userId) return props.userId
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

function onFilePickerOpen() {
  setFilePickerActive(true)
}

function onFilePickerClose() {
  setFilePickerActive(false)
}

function triggerAddFilePicker() {
  if (isSaving.value) return
  onFilePickerOpen()
  addFileInputRef.value?.click()
}

function goToEditPage(page) {
  editPage.value = Math.min(Math.max(page, 0), totalEditPages.value - 1)
}

function isSelected(id) {
  return selectedIds.value.includes(id)
}

function toggleSelection(id) {
  if (isSelected(id)) {
    selectedIds.value = selectedIds.value.filter((item) => item !== id)
  } else {
    selectedIds.value = [...selectedIds.value, id]
  }
}

async function onAddFiles(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (!files.length) {
    onFilePickerClose()
    return
  }

  const uid = await resolveUserId()
  if (!uid) {
    errorMessage.value = 'Connecte-toi pour ajouter une image.'
    onFilePickerClose()
    return
  }

  isSaving.value = true
  setFileUploadInProgress(true)
  errorMessage.value = ''
  try {
    for (const file of files) {
      await uploadComfortImage(supabase, uid, file)
    }
    await loadImages()
    if (!isEditing.value) {
      pickRandomDisplayImage()
    }
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Impossible d’ajouter l’image.'
  } finally {
    isSaving.value = false
    setFileUploadInProgress(false)
    onFilePickerClose()
  }
}

async function onDeleteSelected() {
  if (!hasSelection.value) return

  const uid = await resolveUserId()
  if (!uid) {
    errorMessage.value = 'Connecte-toi pour supprimer des images.'
    return
  }

  const count = selectedCount.value
  const label = count > 1 ? `${count} images` : 'cette image'
  if (!window.confirm(`Supprimer ${label} ?`)) return

  isSaving.value = true
  errorMessage.value = ''
  try {
    const toDelete = images.value.filter((img) => isSelected(img.id))
    for (const img of toDelete) {
      await deleteComfortImage(supabase, uid, img)
    }
    selectedIds.value = []
    await loadImages()
    if (editPage.value >= totalEditPages.value) {
      editPage.value = Math.max(0, totalEditPages.value - 1)
    }
    if (!images.value.length) {
      isEditing.value = false
    }
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Impossible de supprimer les images.'
  } finally {
    isSaving.value = false
  }
}

function openEdit() {
  selectedIds.value = []
  editPage.value = 0
  isEditing.value = true
}

function closeEdit() {
  selectedIds.value = []
  editPage.value = 0
  isEditing.value = false
  pickRandomDisplayImage()
}

watch(
  () => props.userId,
  () => {
    void loadImages()
  },
)

onMounted(() => {
  void loadImages()
})
</script>

<template>
  <section class="comfort-images" aria-label="Images de réconfort">
    <div class="comfort-images__card">
      <input
        ref="addFileInputRef"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        class="comfort-images__file-input"
        :disabled="isSaving"
        @pointerdown="onFilePickerOpen"
        @click="onFilePickerOpen"
        @change="onAddFiles"
        @cancel="onFilePickerClose"
      />

      <div v-if="isLoading" class="comfort-images__state">
        <span class="comfort-images__spinner" aria-hidden="true"></span>
        <span>Chargement…</span>
      </div>

      <template v-else-if="isEditing">
        <p v-if="hasImages" class="comfort-images__hint">
          Touche les images à supprimer, puis valide.
        </p>

        <div v-if="!hasImages" class="comfort-images__empty">
          <p>Ajoute une ou plusieurs images qui te font du bien.</p>
        </div>

        <ul v-else class="comfort-images__grid">
          <li
            v-for="img in paginatedImages"
            :key="img.id"
            class="comfort-images__item"
            :class="{ 'comfort-images__item--selected': isSelected(img.id) }"
          >
            <button
              type="button"
              class="comfort-images__select-btn"
              :aria-pressed="isSelected(img.id)"
              :aria-label="
                isSelected(img.id) ? `Désélectionner ${img.nom}` : `Sélectionner ${img.nom}`
              "
              :disabled="isSaving"
              @click="toggleSelection(img.id)"
            >
              <img :src="img.url" :alt="img.nom" class="comfort-images__thumb" loading="lazy" />
              <span v-if="isSelected(img.id)" class="comfort-images__check" aria-hidden="true"
                >✓</span
              >
            </button>
          </li>
        </ul>

        <nav
          v-if="totalEditPages > 1"
          class="comfort-images__pagination"
          aria-label="Pagination des images"
        >
          <button
            type="button"
            class="comfort-images__page-btn"
            :disabled="isSaving || editPage === 0"
            aria-label="Page précédente"
            @click="goToEditPage(editPage - 1)"
          >
            ‹
          </button>
          <span class="comfort-images__page-label">{{ editPage + 1 }} / {{ totalEditPages }}</span>
          <button
            type="button"
            class="comfort-images__page-btn"
            :disabled="isSaving || editPage >= totalEditPages - 1"
            aria-label="Page suivante"
            @click="goToEditPage(editPage + 1)"
          >
            ›
          </button>
        </nav>

        <div class="comfort-images__edit-actions">
          <button
            type="button"
            class="comfort-images__btn comfort-images__btn--danger"
            :disabled="isSaving || !hasSelection"
            @click="onDeleteSelected"
          >
            {{
              isSaving
                ? 'Suppression…'
                : hasSelection
                  ? `Supprimer (${selectedCount})`
                  : 'Supprimer la sélection'
            }}
          </button>

          <button
            type="button"
            class="comfort-images__btn comfort-images__btn--primary"
            :disabled="isSaving"
            @click="triggerAddFilePicker"
          >
            {{ isSaving ? 'Enregistrement…' : 'Ajouter des images' }}
          </button>
        </div>

        <button
          type="button"
          class="comfort-images__manage-link"
          :disabled="isSaving"
          @click="closeEdit"
        >
          Terminer
        </button>
      </template>

      <template v-else>
        <div v-if="displayImage" class="comfort-images__view">
          <button
            type="button"
            class="comfort-images__display comfort-images__display--clickable"
            :disabled="isSaving"
            aria-label="Ajouter des images"
            @click="triggerAddFilePicker"
          >
            <img
              :src="displayImage.url"
              :alt="displayImage.nom"
              class="comfort-images__hero"
              loading="eager"
            />
          </button>
          <button type="button" class="comfort-images__manage-link" @click="openEdit">Gérer</button>
        </div>

        <div v-else class="comfort-images__empty comfort-images__empty--cta">
          <p>Ajoute une image qui te réconforte.</p>
          <button
            type="button"
            class="comfort-images__btn comfort-images__btn--primary"
            :disabled="isSaving"
            @click="triggerAddFilePicker"
          >
            {{ isSaving ? 'Enregistrement…' : 'Parcourir…' }}
          </button>
        </div>
      </template>

      <p v-if="errorMessage" class="comfort-images__error" role="alert">
        {{ errorMessage }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.comfort-images {
  width: 100%;
  min-width: 0;
}

.comfort-images__card {
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.25);
  border-radius: 20px;
  padding: 1rem 1.25rem 1.25rem;
  box-shadow: 0 8px 32px rgba(173, 129, 190, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

@media (prefers-color-scheme: dark) {
  .comfort-images__card {
    background: rgba(25, 20, 35, 0.65);
    border-color: rgba(213, 181, 234, 0.15);
  }
}

.comfort-images__view {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
}

.comfort-images__manage-link {
  padding: 0.15rem 0.4rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: #ad81be;
  background: none;
  border: none;
  opacity: 0.7;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.comfort-images__manage-link:hover:not(:disabled) {
  opacity: 1;
}

.comfort-images__manage-link:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.comfort-images__hint {
  margin: 0;
  text-align: center;
  font-size: 0.78rem;
  font-weight: 600;
  color: #8c98a4;
}

.comfort-images__display {
  width: 100%;
  border-radius: 14px;
  overflow: hidden;
  background: rgba(213, 181, 234, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
}

.comfort-images__display--clickable {
  cursor: pointer;
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.comfort-images__display--clickable:hover:not(:disabled) {
  opacity: 0.92;
}

.comfort-images__display--clickable:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.comfort-images__hero {
  max-width: 100%;
  max-height: min(420px, 65vh);
  width: auto;
  height: auto;
  object-fit: contain;
  display: block;
}

.comfort-images__empty {
  text-align: center;
  color: #8c98a4;
  font-size: 0.9rem;
  font-weight: 600;
  padding: 1.25rem 0.5rem;
  border: 2px dashed rgba(213, 181, 234, 0.35);
  border-radius: 14px;
}

.comfort-images__empty--cta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.comfort-images__empty p {
  margin: 0;
}

.comfort-images__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.65rem;
}

@media (max-width: 520px) {
  .comfort-images__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.comfort-images__pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
}

.comfort-images__page-btn {
  width: 1.75rem;
  height: 1.75rem;
  border: none;
  border-radius: 50%;
  background: rgba(213, 181, 234, 0.2);
  color: #ad81be;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
}

.comfort-images__page-btn:hover:not(:disabled) {
  background: rgba(213, 181, 234, 0.35);
}

.comfort-images__page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.comfort-images__page-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: #8c98a4;
  min-width: 3.5rem;
  text-align: center;
}

.comfort-images__item {
  min-width: 0;
}

.comfort-images__select-btn {
  position: relative;
  display: block;
  width: 100%;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 12px;
  background: none;
  cursor: pointer;
  overflow: hidden;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.comfort-images__item--selected .comfort-images__select-btn {
  border-color: #ad81be;
  box-shadow: 0 0 0 2px rgba(173, 129, 190, 0.25);
}

.comfort-images__select-btn:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.comfort-images__thumb {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  display: block;
}

.comfort-images__check {
  position: absolute;
  top: 0.35rem;
  right: 0.35rem;
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 50%;
  background: #ad81be;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.comfort-images__edit-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
}

.comfort-images__add {
  display: flex;
  justify-content: center;
  cursor: pointer;
}

.comfort-images__add--inline {
  margin-top: 0.15rem;
}

.comfort-images__file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.comfort-images__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.45rem 0.85rem;
  border-radius: 10px;
  font-size: 0.78rem;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    opacity 0.15s ease;
}

.comfort-images__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.comfort-images__btn--primary {
  color: #fff;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  box-shadow: 0 4px 12px rgba(173, 129, 190, 0.25);
}

.comfort-images__btn--danger {
  color: #c0392b;
  background: rgba(192, 57, 43, 0.1);
}

.comfort-images__state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  min-height: 120px;
  color: #8c98a4;
  font-weight: 600;
  font-size: 0.9rem;
}

.comfort-images__spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(213, 181, 234, 0.3);
  border-top-color: #ad81be;
  border-radius: 50%;
  animation: comfort-spin 1s linear infinite;
}

.comfort-images__error {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: #c0392b;
}

@keyframes comfort-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
