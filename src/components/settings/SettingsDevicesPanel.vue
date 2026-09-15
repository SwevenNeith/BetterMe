<script setup>
import { nextTick, ref, watch } from 'vue'
import { supabase } from '../../lib/supabase.js'
import {
  deletePushDevice,
  listPushDevices,
  renamePushDevice,
} from '../../services/settings/pushDevices.js'

const props = defineProps({
  userId: {
    type: String,
    default: null,
  },
})

const emit = defineEmits(['count-change'])

const devices = ref([])
const isLoading = ref(false)
const loadError = ref('')
const actionError = ref('')
const actionMessage = ref('')
const deletingId = ref(null)
const savingRenameId = ref(null)
const editingDeviceId = ref(null)
const editingName = ref('')
const renameInputRef = ref(null)
const expandedDevices = ref({})

function emitCount(count = devices.value.length) {
  emit('count-change', count)
}

function isDeviceExpanded(deviceId) {
  return Boolean(expandedDevices.value[deviceId])
}

function toggleDevice(deviceId) {
  if (editingDeviceId.value === deviceId) return
  expandedDevices.value = {
    ...expandedDevices.value,
    [deviceId]: !expandedDevices.value[deviceId],
  }
}

async function loadDevices() {
  if (!props.userId) {
    devices.value = []
    expandedDevices.value = {}
    emitCount(0)
    return
  }

  isLoading.value = true
  loadError.value = ''
  try {
    devices.value = await listPushDevices(supabase, props.userId)
    const ids = new Set(devices.value.map((device) => device.id))
    const nextExpanded = {}
    for (const [id, open] of Object.entries(expandedDevices.value)) {
      if (ids.has(id) && open) nextExpanded[id] = true
    }
    expandedDevices.value = nextExpanded
    emitCount(devices.value.length)
  } catch (err) {
    console.error(err)
    loadError.value = err.message || 'Impossible de charger les appareils.'
    devices.value = []
    emitCount(0)
  } finally {
    isLoading.value = false
  }
}

function clearActionMessageSoon() {
  setTimeout(() => {
    actionMessage.value = ''
  }, 2500)
}

function setRenameInputRef(el, deviceId) {
  if (editingDeviceId.value === deviceId) {
    renameInputRef.value = el
  }
}

async function startRename(device) {
  if (!device?.id || savingRenameId.value || deletingId.value) return
  editingDeviceId.value = device.id
  editingName.value = device.deviceName || device.label || ''
  actionError.value = ''
  await nextTick()
  renameInputRef.value?.focus?.()
  renameInputRef.value?.select?.()
}

function cancelRename() {
  editingDeviceId.value = null
  editingName.value = ''
}

async function confirmRename(device) {
  if (!props.userId || !device?.id || savingRenameId.value) return

  savingRenameId.value = device.id
  actionError.value = ''
  actionMessage.value = ''
  try {
    await renamePushDevice(supabase, props.userId, device.id, editingName.value)
    editingDeviceId.value = null
    editingName.value = ''
    actionMessage.value = 'Nom enregistré.'
    await loadDevices()
    clearActionMessageSoon()
  } catch (err) {
    console.error(err)
    actionError.value = err.message || 'Impossible de renommer cet appareil.'
  } finally {
    savingRenameId.value = null
  }
}

function onRenameKeydown(event, device) {
  if (event.key === 'Enter') {
    event.preventDefault()
    void confirmRename(device)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancelRename()
  }
}

async function onRemoveDevice(device) {
  if (!props.userId || !device?.id || deletingId.value || savingRenameId.value) return

  const label = device.isCurrent ? 'cet appareil (notifications locales)' : `« ${device.label} »`
  if (!window.confirm(`Retirer ${label} de la liste des appareils enregistrés ?`)) return

  deletingId.value = device.id
  actionError.value = ''
  actionMessage.value = ''
  if (editingDeviceId.value === device.id) cancelRename()
  try {
    await deletePushDevice(supabase, props.userId, device.id, { endpoint: device.endpoint })
    actionMessage.value = 'Appareil retiré.'
    await loadDevices()
    clearActionMessageSoon()
  } catch (err) {
    console.error(err)
    actionError.value = err.message || 'Impossible de retirer cet appareil.'
  } finally {
    deletingId.value = null
  }
}

watch(
  () => props.userId,
  () => {
    cancelRename()
    void loadDevices()
  },
  { immediate: true },
)

defineExpose({ reload: loadDevices })
</script>

<template>
  <div class="devices-panel">
    <p class="devices-panel__hint">
      Navigateurs et téléphones abonnés aux notifications push pour ton compte. Seul ton compte
      peut voir cette liste.
    </p>

    <p v-if="isLoading" class="devices-panel__status">Chargement…</p>
    <p v-else-if="loadError" class="settings-feedback settings-feedback--error">{{ loadError }}</p>
    <p v-else-if="!devices.length" class="devices-panel__empty">
      Aucun appareil enregistré pour le moment. Active les notifications sur un appareil pour
      l’ajouter ici.
    </p>

    <div v-else class="devices-list" aria-label="Liste des appareils">
      <section
        v-for="(device, deviceIndex) in devices"
        :key="device.id"
        class="settings-card settings-card--collapsible"
        :class="{ 'settings-card--spaced': deviceIndex > 0 }"
      >
        <div class="device-card__header">
          <template v-if="editingDeviceId === device.id">
            <div class="device-card__rename">
              <label class="device-card__rename-field">
                <span class="sr-only">Nom de l’appareil</span>
                <input
                  :ref="(el) => setRenameInputRef(el, device.id)"
                  v-model="editingName"
                  type="text"
                  class="device-card__rename-input"
                  maxlength="80"
                  placeholder="Ex. Téléphone, PC bureau…"
                  :disabled="savingRenameId === device.id"
                  @keydown="onRenameKeydown($event, device)"
                />
              </label>
              <div class="device-card__actions">
                <button
                  type="button"
                  class="btn btn--ghost device-card__action"
                  :disabled="savingRenameId === device.id"
                  @click="confirmRename(device)"
                >
                  {{ savingRenameId === device.id ? 'Enregistrement…' : 'OK' }}
                </button>
                <button
                  type="button"
                  class="btn btn--ghost device-card__action"
                  :disabled="savingRenameId === device.id"
                  @click="cancelRename"
                >
                  Annuler
                </button>
              </div>
            </div>
          </template>

          <template v-else>
            <button
              type="button"
              class="card-toggle"
              :aria-expanded="isDeviceExpanded(device.id)"
              :aria-controls="`settings-device-${device.id}`"
              @click="toggleDevice(device.id)"
            >
              <div class="device-card__title-wrap">
                <h2 class="card-toggle__title">{{ device.label }}</h2>
                <span
                  v-if="device.deviceName && device.deviceName !== device.autoLabel"
                  class="device-card__auto-hint"
                >
                  ({{ device.autoLabel }})
                </span>
                <span v-if="device.isCurrent" class="device-card__badge">Cet appareil</span>
              </div>
              <span
                class="card-toggle__chevron"
                :class="{ 'card-toggle__chevron--open': isDeviceExpanded(device.id) }"
                aria-hidden="true"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </button>

            <div class="device-card__actions">
              <button
                type="button"
                class="btn btn--ghost device-card__action"
                :disabled="deletingId === device.id || Boolean(savingRenameId)"
                @click="startRename(device)"
              >
                Renommer
              </button>
              <button
                type="button"
                class="btn btn--ghost device-card__action device-card__action--danger"
                :disabled="deletingId === device.id || Boolean(savingRenameId)"
                @click="onRemoveDevice(device)"
              >
                {{ deletingId === device.id ? 'Retrait…' : 'Retirer' }}
              </button>
            </div>
          </template>
        </div>

        <div
          v-show="isDeviceExpanded(device.id) && editingDeviceId !== device.id"
          :id="`settings-device-${device.id}`"
          class="card-body"
        >
          <!-- Contenu appareil à venir -->
        </div>
      </section>
    </div>

    <p v-if="actionMessage" class="settings-feedback settings-feedback--ok">{{ actionMessage }}</p>
    <p v-if="actionError" class="settings-feedback settings-feedback--error">{{ actionError }}</p>
  </div>
</template>

<style scoped>
.sr-only {
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

.devices-panel__hint,
.devices-panel__status,
.devices-panel__empty {
  margin: 0 0 1rem;
  font-size: 0.92rem;
  line-height: 1.45;
  color: #6c757d;
}

.devices-list {
  display: flex;
  flex-direction: column;
}

.settings-card {
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.25);
  border-radius: 20px;
  padding: 1.5rem;
  box-shadow: 0 8px 32px rgba(173, 129, 190, 0.08);
}

.settings-card--spaced {
  margin-top: 1rem;
}

.device-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1rem;
  flex-wrap: wrap;
}

.card-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex: 1;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.device-card__title-wrap {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.65rem;
  min-width: 0;
}

.card-toggle__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 800;
  color: #ad81be;
}

.card-toggle:hover .card-toggle__title {
  color: #9a6dad;
}

.device-card__auto-hint {
  font-size: 0.82rem;
  font-weight: 600;
  color: #868e96;
}

.device-card__badge {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #7a5a8c;
  background: rgba(213, 181, 234, 0.28);
  padding: 0.2rem 0.45rem;
  border-radius: 6px;
}

.card-toggle__chevron {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 8px;
  color: #ad81be;
  background: rgba(213, 181, 234, 0.15);
  transition:
    transform 0.2s ease,
    background 0.2s ease;
}

.card-toggle:hover .card-toggle__chevron {
  background: rgba(213, 181, 234, 0.28);
}

.card-toggle__chevron svg {
  width: 1.1rem;
  height: 1.1rem;
}

.card-toggle__chevron--open {
  transform: rotate(180deg);
}

.card-body {
  margin-top: 1.25rem;
  padding-top: 1.25rem;
  border-top: 1px solid rgba(213, 181, 234, 0.25);
  min-height: 0;
}

.device-card__rename {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
}

.device-card__rename-field {
  flex: 1;
  min-width: 11rem;
  max-width: 22rem;
}

.device-card__rename-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(213, 181, 234, 0.45);
  border-radius: 12px;
  padding: 0.65rem 0.85rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: #343a40;
  background: rgba(255, 255, 255, 0.85);
}

.device-card__rename-input:focus {
  outline: none;
  border-color: #ad81be;
  box-shadow: 0 0 0 3px rgba(173, 129, 190, 0.18);
}

.device-card__actions {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: flex-end;
  align-items: center;
}

.btn {
  border: none;
  border-radius: 12px;
  padding: 0.65rem 1.15rem;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn--ghost {
  background: rgba(213, 181, 234, 0.2);
  color: #ad81be;
}

.btn--ghost:hover:not(:disabled) {
  background: rgba(213, 181, 234, 0.32);
  transform: translateY(-1px);
}

.btn--ghost:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

.device-card__action {
  padding: 0.65rem 1.15rem;
  font-size: 0.9rem;
  border-radius: 12px;
}

.device-card__action--danger {
  background: rgba(192, 57, 43, 0.12);
  color: #c0392b;
  border: 1px solid rgba(192, 57, 43, 0.22);
}

.device-card__action--danger:hover:not(:disabled) {
  background: rgba(192, 57, 43, 0.18);
  transform: translateY(-1px);
}

.settings-feedback {
  margin: 0.85rem 0 0;
  font-size: 0.9rem;
}

.settings-feedback--ok {
  color: #2f9e44;
}

.settings-feedback--error {
  color: #c92a2a;
}

@media (max-width: 640px) {
  .device-card__header {
    align-items: stretch;
  }

  .device-card__actions {
    width: 100%;
    justify-content: flex-start;
  }
}

@media (prefers-color-scheme: dark) {
  .settings-card {
    background: rgba(25, 20, 35, 0.65);
    border-color: rgba(213, 181, 234, 0.15);
  }

  .devices-panel__hint,
  .devices-panel__status,
  .devices-panel__empty,
  .device-card__auto-hint {
    color: #adb5bd;
  }

  .card-body {
    border-top-color: rgba(213, 181, 234, 0.15);
  }

  .device-card__rename-input {
    background: rgba(30, 24, 42, 0.9);
    color: #e9ecef;
    border-color: rgba(213, 181, 234, 0.28);
  }
}
</style>
