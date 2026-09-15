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

async function loadDevices() {
  if (!props.userId) {
    devices.value = []
    return
  }

  isLoading.value = true
  loadError.value = ''
  try {
    devices.value = await listPushDevices(supabase, props.userId)
  } catch (err) {
    console.error(err)
    loadError.value = err.message || 'Impossible de charger les appareils.'
    devices.value = []
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
  <section class="settings-card devices-panel">
    <h2 class="devices-panel__title">Appareils enregistrés</h2>
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

    <ul v-else class="devices-list" aria-label="Liste des appareils">
      <li v-for="device in devices" :key="device.id" class="devices-list__item">
        <div class="devices-list__main">
          <template v-if="editingDeviceId === device.id">
            <label class="devices-list__rename-field">
              <span class="sr-only">Nom de l’appareil</span>
              <input
                :ref="(el) => setRenameInputRef(el, device.id)"
                v-model="editingName"
                type="text"
                class="devices-list__rename-input"
                maxlength="80"
                placeholder="Ex. Téléphone, PC bureau…"
                :disabled="savingRenameId === device.id"
                @keydown="onRenameKeydown($event, device)"
              />
            </label>
            <div class="devices-list__rename-actions">
              <button
                type="button"
                class="btn btn--ghost devices-list__action"
                :disabled="savingRenameId === device.id"
                @click="confirmRename(device)"
              >
                {{ savingRenameId === device.id ? 'Enregistrement…' : 'OK' }}
              </button>
              <button
                type="button"
                class="btn btn--ghost devices-list__action"
                :disabled="savingRenameId === device.id"
                @click="cancelRename"
              >
                Annuler
              </button>
            </div>
          </template>
          <template v-else>
            <div class="devices-list__heading">
              <span class="devices-list__label">{{ device.label }}</span>
              <span
                v-if="device.deviceName && device.deviceName !== device.autoLabel"
                class="devices-list__auto-hint"
              >
                ({{ device.autoLabel }})
              </span>
              <span v-if="device.isCurrent" class="devices-list__badge">Cet appareil</span>
            </div>
            <p v-if="device.seenAtLabel" class="devices-list__meta">
              Dernière sync : {{ device.seenAtLabel }}
            </p>
          </template>
        </div>

        <div v-if="editingDeviceId !== device.id" class="devices-list__actions">
          <button
            type="button"
            class="btn btn--ghost devices-list__action"
            :disabled="deletingId === device.id || Boolean(savingRenameId)"
            @click="startRename(device)"
          >
            Renommer
          </button>
          <button
            type="button"
            class="btn btn--ghost devices-list__action devices-list__action--danger"
            :disabled="deletingId === device.id || Boolean(savingRenameId)"
            @click="onRemoveDevice(device)"
          >
            {{ deletingId === device.id ? 'Retrait…' : 'Retirer' }}
          </button>
        </div>
      </li>
    </ul>

    <p v-if="actionMessage" class="settings-feedback settings-feedback--ok">{{ actionMessage }}</p>
    <p v-if="actionError" class="settings-feedback settings-feedback--error">{{ actionError }}</p>
  </section>
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

.devices-panel__title {
  margin: 0 0 0.35rem;
  font-size: 1.25rem;
  font-weight: 800;
  color: #ad81be;
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
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.devices-list__item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem 0;
  border-top: 1px solid rgba(213, 181, 234, 0.28);
}

.devices-list__item:first-child {
  border-top: none;
  padding-top: 0.15rem;
}

.devices-list__main {
  min-width: 0;
  flex: 1;
}

.devices-list__heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem 0.65rem;
}

.devices-list__label {
  font-weight: 700;
  color: #343a40;
}

.devices-list__auto-hint {
  font-size: 0.82rem;
  font-weight: 600;
  color: #868e96;
}

.devices-list__badge {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #7a5a8c;
  background: rgba(213, 181, 234, 0.28);
  padding: 0.2rem 0.45rem;
  border-radius: 6px;
}

.devices-list__meta {
  margin: 0.35rem 0 0;
  font-size: 0.82rem;
  color: #868e96;
}

.devices-list__actions,
.devices-list__rename-actions {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: flex-end;
  align-items: center;
}

.devices-list__rename-field {
  display: block;
  width: 100%;
  max-width: 22rem;
}

.devices-list__rename-input {
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

.devices-list__rename-input:focus {
  outline: none;
  border-color: #ad81be;
  box-shadow: 0 0 0 3px rgba(173, 129, 190, 0.18);
}

.devices-list__rename-actions {
  margin-top: 0.55rem;
  justify-content: flex-start;
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

.devices-list__action {
  padding: 0.65rem 1.15rem;
  font-size: 0.9rem;
  border-radius: 12px;
}

.devices-list__action--danger {
  background: rgba(192, 57, 43, 0.12);
  color: #c0392b;
  border: 1px solid rgba(192, 57, 43, 0.22);
}

.devices-list__action--danger:hover:not(:disabled) {
  background: rgba(192, 57, 43, 0.18);
  transform: translateY(-1px);
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
  .devices-list__item {
    flex-direction: column;
    align-items: stretch;
  }

  .devices-list__actions {
    justify-content: flex-start;
  }
}

@media (prefers-color-scheme: dark) {
  .settings-card {
    background: rgba(25, 20, 35, 0.65);
    border-color: rgba(213, 181, 234, 0.15);
  }

  .devices-list__label {
    color: #e9ecef;
  }

  .devices-list__item {
    border-top-color: rgba(213, 181, 234, 0.15);
  }

  .devices-panel__hint,
  .devices-panel__status,
  .devices-panel__empty,
  .devices-list__meta,
  .devices-list__auto-hint {
    color: #adb5bd;
  }

  .devices-list__rename-input {
    background: rgba(30, 24, 42, 0.9);
    color: #e9ecef;
    border-color: rgba(213, 181, 234, 0.28);
  }
}
</style>
