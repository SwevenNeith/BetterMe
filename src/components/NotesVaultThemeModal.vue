<script setup>
import { computed, ref, watch } from 'vue'
import ColorPickerField from './ColorPickerField.vue'
import EmojiPickerField from './EmojiPickerField.vue'
import {
  NOTE_VAULT_DEFAULT_ACCENT,
  NOTE_VAULT_DEFAULT_GRADIENT,
  NOTE_VAULT_DEFAULT_ICON,
  NOTE_VAULT_DEFAULT_PRIMARY,
  NOTE_VAULT_DEFAULT_SURFACE,
  deriveVaultAccentFromPrimary,
  deriveVaultGradientFromPrimary,
  deriveVaultSurfaceFromAccent,
  hexToRgb,
  normalizeVaultHex,
  normalizeVaultIcon,
  normalizeVaultTheme,
  rgbToHex,
  vaultThemeStyle,
} from '../constants/noteVaults.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  mode: { type: String, default: 'create' },
  vault: { type: Object, default: null },
})

const emit = defineEmits(['close', 'save'])

const name = ref('')
const vaultIcon = ref(NOTE_VAULT_DEFAULT_ICON)
const primaryColor = ref(NOTE_VAULT_DEFAULT_PRIMARY)
const accentColor = ref(NOTE_VAULT_DEFAULT_ACCENT)
const surfaceColor = ref(NOTE_VAULT_DEFAULT_SURFACE)
const gradientColor = ref(NOTE_VAULT_DEFAULT_GRADIENT)
const autoPalette = ref(true)
const errorMessage = ref('')
const isSaving = ref(false)

const primaryRgb = ref({ r: 173, g: 129, b: 190 })
const accentRgb = ref({ r: 213, g: 181, b: 234 })
const surfaceRgb = ref({ r: 244, g: 240, b: 250 })
const gradientRgb = ref({ r: 149, g: 209, b: 170 })

const isEditMode = computed(() => props.mode === 'edit')
const modalTitle = computed(() =>
  isEditMode.value ? 'Personnaliser le thème' : 'Nouveau coffre',
)
const submitLabel = computed(() => (isEditMode.value ? 'Enregistrer' : 'Créer le coffre'))

const previewStyle = computed(() =>
  vaultThemeStyle({
    color: primaryColor.value,
    accent_color: accentColor.value,
    surface_color: surfaceColor.value,
    gradient_color: gradientColor.value,
  }),
)

function syncRgbFromHex(target, hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return
  target.r = rgb.r
  target.g = rgb.g
  target.b = rgb.b
}

function applyDerivedPalette() {
  if (!autoPalette.value) return
  const accent = deriveVaultAccentFromPrimary(primaryColor.value)
  accentColor.value = accent
  syncRgbFromHex(accentRgb.value, accent)
  const surface = deriveVaultSurfaceFromAccent(accent)
  surfaceColor.value = surface
  syncRgbFromHex(surfaceRgb.value, surface)
  const gradient = deriveVaultGradientFromPrimary(primaryColor.value)
  gradientColor.value = gradient
  syncRgbFromHex(gradientRgb.value, gradient)
}

function applyPrimaryHex(hex) {
  const next = normalizeVaultHex(hex, NOTE_VAULT_DEFAULT_PRIMARY)
  primaryColor.value = next
  syncRgbFromHex(primaryRgb.value, next)
  applyDerivedPalette()
}

function applyAccentHex(hex) {
  autoPalette.value = false
  const next = normalizeVaultHex(hex, NOTE_VAULT_DEFAULT_ACCENT)
  accentColor.value = next
  syncRgbFromHex(accentRgb.value, next)
}

function applySurfaceHex(hex) {
  autoPalette.value = false
  const next = normalizeVaultHex(hex, NOTE_VAULT_DEFAULT_SURFACE)
  surfaceColor.value = next
  syncRgbFromHex(surfaceRgb.value, next)
}

function applyGradientHex(hex) {
  autoPalette.value = false
  const next = normalizeVaultHex(hex, NOTE_VAULT_DEFAULT_GRADIENT)
  gradientColor.value = next
  syncRgbFromHex(gradientRgb.value, next)
}

function onPrimaryRgbInput() {
  autoPalette.value = false
  const next = rgbToHex(primaryRgb.value.r, primaryRgb.value.g, primaryRgb.value.b)
  const normalized = normalizeVaultHex(next, NOTE_VAULT_DEFAULT_PRIMARY)
  primaryColor.value = normalized
  syncRgbFromHex(primaryRgb.value, normalized)
}

function onAccentRgbInput() {
  applyAccentHex(rgbToHex(accentRgb.value.r, accentRgb.value.g, accentRgb.value.b))
}

function onSurfaceRgbInput() {
  applySurfaceHex(rgbToHex(surfaceRgb.value.r, surfaceRgb.value.g, surfaceRgb.value.b))
}

function onGradientRgbInput() {
  applyGradientHex(rgbToHex(gradientRgb.value.r, gradientRgb.value.g, gradientRgb.value.b))
}

function regeneratePalette() {
  autoPalette.value = true
  applyDerivedPalette()
}

function resetDefaultTheme() {
  autoPalette.value = true
  vaultIcon.value = NOTE_VAULT_DEFAULT_ICON
  primaryColor.value = NOTE_VAULT_DEFAULT_PRIMARY
  accentColor.value = NOTE_VAULT_DEFAULT_ACCENT
  surfaceColor.value = NOTE_VAULT_DEFAULT_SURFACE
  gradientColor.value = NOTE_VAULT_DEFAULT_GRADIENT
  syncRgbFromHex(primaryRgb.value, primaryColor.value)
  syncRgbFromHex(accentRgb.value, accentColor.value)
  syncRgbFromHex(surfaceRgb.value, surfaceColor.value)
  syncRgbFromHex(gradientRgb.value, gradientColor.value)
}

function onColorHexInput(fieldId, event) {
  const value = event.target.value
  if (fieldId === 'primary') applyPrimaryHex(value)
  else if (fieldId === 'accent') applyAccentHex(value)
  else if (fieldId === 'surface') applySurfaceHex(value)
  else applyGradientHex(value)
}

function colorValueById(fieldId) {
  if (fieldId === 'primary') return primaryColor.value
  if (fieldId === 'accent') return accentColor.value
  if (fieldId === 'surface') return surfaceColor.value
  return gradientColor.value
}

function setColorById(fieldId, value) {
  if (fieldId === 'primary') applyPrimaryHex(value)
  else if (fieldId === 'accent') applyAccentHex(value)
  else if (fieldId === 'surface') applySurfaceHex(value)
  else applyGradientHex(value)
}

const colorFields = [
  {
    id: 'primary',
    title: 'Principale',
    hint: 'Boutons, icônes, graphe',
    rgb: primaryRgb,
    onRgbInput: onPrimaryRgbInput,
  },
  {
    id: 'accent',
    title: 'Accent',
    hint: 'Sidebar, onglets',
    rgb: accentRgb,
    onRgbInput: onAccentRgbInput,
  },
  {
    id: 'surface',
    title: 'Surface',
    hint: 'Fond page & éditeur',
    rgb: surfaceRgb,
    onRgbInput: onSurfaceRgbInput,
  },
  {
    id: 'gradient',
    title: 'Dégradé',
    hint: 'Vue globale, cartes',
    rgb: gradientRgb,
    onRgbInput: onGradientRgbInput,
  },
]

watch(primaryColor, (value) => {
  syncRgbFromHex(primaryRgb.value, value)
  applyDerivedPalette()
})

watch(accentColor, (value) => {
  syncRgbFromHex(accentRgb.value, value)
})

watch(surfaceColor, (value) => {
  syncRgbFromHex(surfaceRgb.value, value)
})

watch(gradientColor, (value) => {
  syncRgbFromHex(gradientRgb.value, value)
})

watch(autoPalette, (enabled) => {
  if (enabled) applyDerivedPalette()
})

function reset() {
  errorMessage.value = ''
  isSaving.value = false
  autoPalette.value = !isEditMode.value

  if (isEditMode.value && props.vault) {
    const theme = normalizeVaultTheme(props.vault)
    name.value = props.vault.name ?? ''
    vaultIcon.value = normalizeVaultIcon(props.vault.icon)
    primaryColor.value = theme.color
    accentColor.value = theme.accent
    surfaceColor.value = theme.surface
    gradientColor.value = theme.gradient
  } else {
    name.value = ''
    vaultIcon.value = NOTE_VAULT_DEFAULT_ICON
    primaryColor.value = NOTE_VAULT_DEFAULT_PRIMARY
    accentColor.value = NOTE_VAULT_DEFAULT_ACCENT
    surfaceColor.value = NOTE_VAULT_DEFAULT_SURFACE
    gradientColor.value = NOTE_VAULT_DEFAULT_GRADIENT
  }

  syncRgbFromHex(primaryRgb.value, primaryColor.value)
  syncRgbFromHex(accentRgb.value, accentColor.value)
  syncRgbFromHex(surfaceRgb.value, surfaceColor.value)
  syncRgbFromHex(gradientRgb.value, gradientColor.value)
}

function onKeydown(event) {
  if (!props.open) return
  if (event.key === 'Escape') emit('close')
}

watch(
  () => [props.open, props.mode, props.vault?.id],
  ([open]) => {
    if (open) reset()
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
)

function submit() {
  const trimmed = name.value.trim()
  if (!trimmed) {
    errorMessage.value = 'Indiquez un nom pour le coffre.'
    return
  }
  isSaving.value = true
  emit('save', {
    vaultId: isEditMode.value ? props.vault?.id : undefined,
    name: trimmed,
    icon: normalizeVaultIcon(vaultIcon.value),
    color: normalizeVaultHex(primaryColor.value, NOTE_VAULT_DEFAULT_PRIMARY),
    accentColor: normalizeVaultHex(accentColor.value, NOTE_VAULT_DEFAULT_ACCENT),
    surfaceColor: normalizeVaultHex(surfaceColor.value, NOTE_VAULT_DEFAULT_SURFACE),
    gradientColor: normalizeVaultHex(gradientColor.value, NOTE_VAULT_DEFAULT_GRADIENT),
  })
  isSaving.value = false
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="notes-vault-modal-overlay" @click.self="emit('close')">
      <div class="notes-vault-modal" role="dialog" aria-labelledby="notes-vault-modal-title">
        <header class="notes-vault-modal__header">
          <h2 id="notes-vault-modal-title" class="notes-vault-modal__title">{{ modalTitle }}</h2>
          <button type="button" class="notes-vault-modal__close" aria-label="Fermer" @click="emit('close')">
            ×
          </button>
        </header>

        <form class="notes-vault-modal__body" @submit.prevent="submit">
          <div class="notes-vault-modal__identity">
            <div class="notes-vault-modal__icon-field">
              <span class="notes-vault-modal__label">Icône</span>
              <EmojiPickerField v-model="vaultIcon" compact :clearable="false" />
            </div>
            <label class="notes-vault-modal__name-field">
              <span class="notes-vault-modal__label">Nom</span>
              <input
                v-model="name"
                type="text"
                class="notes-vault-modal__input"
                maxlength="80"
                placeholder="Mon projet, Mes cours…"
                autofocus
              />
            </label>
          </div>

          <div class="notes-vault-modal__palette-actions">
            <label class="notes-vault-modal__auto">
              <input v-model="autoPalette" type="checkbox" />
              Auto
            </label>
            <button type="button" class="notes-vault-modal__action" @click="regeneratePalette">
              Régénérer
            </button>
            <button type="button" class="notes-vault-modal__action" @click="resetDefaultTheme">
              Thème par défaut
            </button>
          </div>

          <div class="notes-vault-modal__colors">
            <section
              v-for="field in colorFields"
              :key="field.id"
              class="notes-vault-modal__color-block"
            >
              <div class="notes-vault-modal__color-head">
                <h3 class="notes-vault-modal__color-title">{{ field.title }}</h3>
                <p class="notes-vault-modal__color-hint">{{ field.hint }}</p>
              </div>
              <div
                class="notes-vault-modal__color-controls"
                :class="{
                  'notes-vault-modal__color-controls--locked':
                    field.id !== 'primary' && autoPalette,
                }"
              >
                <ColorPickerField
                  :model-value="colorValueById(field.id)"
                  compact
                  @update:model-value="setColorById(field.id, $event)"
                />
                <input
                  :value="colorValueById(field.id)"
                  type="text"
                  class="notes-vault-modal__hex-input"
                  maxlength="7"
                  spellcheck="false"
                  autocomplete="off"
                  :disabled="field.id !== 'primary' && autoPalette"
                  @input="onColorHexInput(field.id, $event)"
                />
                <div class="notes-vault-modal__rgb">
                  <input
                    v-model.number="field.rgb.r"
                    type="number"
                    min="0"
                    max="255"
                    class="notes-vault-modal__rgb-input"
                    aria-label="Rouge"
                    :disabled="field.id !== 'primary' && autoPalette"
                    @input="field.onRgbInput"
                  />
                  <input
                    v-model.number="field.rgb.g"
                    type="number"
                    min="0"
                    max="255"
                    class="notes-vault-modal__rgb-input"
                    aria-label="Vert"
                    :disabled="field.id !== 'primary' && autoPalette"
                    @input="field.onRgbInput"
                  />
                  <input
                    v-model.number="field.rgb.b"
                    type="number"
                    min="0"
                    max="255"
                    class="notes-vault-modal__rgb-input"
                    aria-label="Bleu"
                    :disabled="field.id !== 'primary' && autoPalette"
                    @input="field.onRgbInput"
                  />
                </div>
              </div>
            </section>
          </div>

          <div class="notes-vault-modal__preview" :style="previewStyle">
            <div class="notes-vault-modal__preview-sidebar">
              <span class="notes-vault-modal__preview-pill">Coffre</span>
              <span class="notes-vault-modal__preview-name">
                <span class="notes-vault-modal__preview-icon" aria-hidden="true">
                  {{ normalizeVaultIcon(vaultIcon) }}
                </span>
                {{ name.trim() || 'Mon coffre' }}
              </span>
            </div>
            <div class="notes-vault-modal__preview-main">
              <div class="notes-vault-modal__preview-graph" aria-hidden="true" />
              <button type="button" class="notes-vault-modal__preview-btn">Bouton</button>
              <span class="notes-vault-modal__preview-note">Aperçu éditeur + dégradé graphe</span>
            </div>
          </div>

          <p v-if="errorMessage" class="notes-vault-modal__error">{{ errorMessage }}</p>

          <footer class="notes-vault-modal__footer">
            <button type="button" class="notes-vault-modal__btn" @click="emit('close')">Annuler</button>
            <button
              type="submit"
              class="notes-vault-modal__btn notes-vault-modal__btn--primary"
              :style="{ background: primaryColor, borderColor: 'transparent' }"
              :disabled="isSaving"
            >
              {{ submitLabel }}
            </button>
          </footer>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.notes-vault-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(20, 24, 32, 0.45);
  backdrop-filter: blur(4px);
}

.notes-vault-modal {
  width: min(460px, 100%);
  max-height: min(90vh, 720px);
  overflow: auto;
  border-radius: 14px;
  border: 1px solid rgba(173, 129, 190, 0.35);
  background: linear-gradient(180deg, #fffefb 0%, #faf6ff 100%);
  box-shadow: 0 18px 50px rgba(92, 62, 112, 0.2);
}

.notes-vault-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 0.9rem 0.35rem;
}

.notes-vault-modal__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: #3d2f4a;
}

.notes-vault-modal__close {
  border: none;
  background: transparent;
  font-size: 1.5rem;
  line-height: 1;
  color: #8b7a96;
  cursor: pointer;
}

.notes-vault-modal__body {
  padding: 0.35rem 0.9rem 0.9rem;
}

.notes-vault-modal__identity {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  margin-bottom: 0.55rem;
}

.notes-vault-modal__icon-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex-shrink: 0;
}

.notes-vault-modal__name-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
  min-width: 0;
}

.notes-vault-modal__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.55rem;
}

.notes-vault-modal__label {
  font-size: 0.78rem;
  font-weight: 650;
  color: #5a4a68;
}

.notes-vault-modal__input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.42rem 0.55rem;
  border: 1px solid rgba(173, 129, 190, 0.35);
  border-radius: 8px;
  font-size: 0.88rem;
  color: #2c2434;
  background: #fff;
}

.notes-vault-modal__palette-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
  margin-bottom: 0.55rem;
}

.notes-vault-modal__auto {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.72rem;
  color: #6d5a7e;
  cursor: pointer;
  margin-right: auto;
}

.notes-vault-modal__action {
  border: 1px solid rgba(173, 129, 190, 0.35);
  border-radius: 7px;
  padding: 0.22rem 0.45rem;
  font-size: 0.68rem;
  font-weight: 650;
  color: #5a4a68;
  background: #fff;
  cursor: pointer;
}

.notes-vault-modal__colors {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.45rem;
}

@media (min-width: 420px) {
  .notes-vault-modal__colors {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.notes-vault-modal__color-block {
  margin: 0;
  padding: 0.45rem 0.5rem;
  border: 1px solid rgba(173, 129, 190, 0.2);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.45);
}

.notes-vault-modal__color-head {
  margin-bottom: 0.35rem;
}

.notes-vault-modal__color-title {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 750;
  color: #3d2f4a;
}

.notes-vault-modal__color-hint {
  margin: 0.1rem 0 0;
  font-size: 0.65rem;
  color: #8b7a96;
  line-height: 1.25;
}

.notes-vault-modal__color-controls {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  gap: 0.3rem 0.35rem;
  align-items: center;
}

.notes-vault-modal__color-controls--locked {
  opacity: 0.65;
  pointer-events: none;
}

.notes-vault-modal__color-controls :deep(.color-picker-field) {
  grid-row: span 2;
}

.notes-vault-modal__hex-input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.28rem 0.4rem;
  border: 1px solid rgba(173, 129, 190, 0.35);
  border-radius: 7px;
  font: inherit;
  font-size: 0.72rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: #fff;
  color: #2c2434;
}

.notes-vault-modal__rgb {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.25rem;
}

.notes-vault-modal__rgb-input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.24rem 0.2rem;
  border: 1px solid rgba(173, 129, 190, 0.35);
  border-radius: 7px;
  font: inherit;
  font-size: 0.72rem;
  background: #fff;
  color: #2c2434;
  text-align: center;
}

.notes-vault-modal__rgb-input:disabled,
.notes-vault-modal__hex-input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.notes-vault-modal__preview {
  display: grid;
  grid-template-columns: 0.85fr 1.5fr;
  gap: 0;
  min-height: 4.75rem;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--notes-vault-border-strong, #d5c4e6);
  margin: 0.55rem 0 0.6rem;
}

.notes-vault-modal__preview-sidebar {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.65rem 0.7rem;
  background: var(--notes-vault-sidebar-bg, #faf7ff);
  border-right: 1px solid var(--notes-vault-border, #e6ddf2);
}

.notes-vault-modal__preview-pill {
  align-self: flex-start;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--notes-vault-btn-text, #fff);
  background: var(--notes-vault-color, #ad81be);
}

.notes-vault-modal__preview-name {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--notes-vault-text, #3b2a4a);
  min-width: 0;
}

.notes-vault-modal__preview-icon {
  font-size: 0.72rem;
  line-height: 1;
  flex-shrink: 0;
}

.notes-vault-modal__preview-main {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.55rem 0.65rem;
  background: var(--notes-vault-main-bg, #faf7fd);
}

.notes-vault-modal__preview-graph {
  height: 1.6rem;
  border-radius: 6px;
  background: var(--notes-vault-graph-bg);
  border: 1px solid var(--notes-vault-border, #e6ddf2);
}

.notes-vault-modal__preview-btn {
  align-self: flex-start;
  border: none;
  border-radius: 8px;
  padding: 0.28rem 0.55rem;
  font-size: 0.75rem;
  font-weight: 650;
  color: var(--notes-vault-btn-text, #fff);
  background: var(--notes-vault-btn-bg, #ad81be);
  cursor: default;
}

.notes-vault-modal__preview-note {
  font-size: 0.68rem;
  color: var(--notes-vault-text-muted, #6d5a7e);
}

.notes-vault-modal__error {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  color: #c0392b;
}

.notes-vault-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.notes-vault-modal__btn {
  padding: 0.45rem 0.85rem;
  border-radius: 8px;
  border: 1px solid rgba(173, 129, 190, 0.35);
  background: #fff;
  color: #3d2f4a;
  font-size: 0.9rem;
  cursor: pointer;
}

.notes-vault-modal__btn--primary {
  color: #fff;
  font-weight: 650;
}

@media (prefers-color-scheme: dark) {
  .notes-vault-modal {
    background: linear-gradient(180deg, #2a2438 0%, #1f1a2c 100%);
    border-color: rgba(213, 181, 234, 0.28);
  }

  .notes-vault-modal__title,
  .notes-vault-modal__color-title {
    color: #f0e8f8;
  }

  .notes-vault-modal__label,
  .notes-vault-modal__color-hint,
  .notes-vault-modal__auto {
    color: #c5b8d2;
  }

  .notes-vault-modal__input,
  .notes-vault-modal__btn,
  .notes-vault-modal__rgb-input,
  .notes-vault-modal__hex-input,
  .notes-vault-modal__action {
    background: rgba(35, 30, 48, 0.95);
    border-color: rgba(173, 129, 190, 0.4);
    color: #f0e8f8;
  }
}
</style>
