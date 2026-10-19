<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  createTierListItem,
  createTierListTier,
  normalizeTierColor,
  normalizeTierListData,
  tierColorAtIndex,
} from '../../utils/notes/noteTierLists.js'

const props = defineProps({
  modelValue: {
    type: Object,
    required: true,
  },
  theme: {
    type: Object,
    default: () => ({
      boardBg: '#2a2438',
      controlsBg: '#1a1524',
      poolBg: '#322a42',
      border: '#4a3f5c',
      labelText: '#111111',
    }),
  },
  readonly: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue'])

const data = ref(normalizeTierListData(props.modelValue))
const draftLabel = ref('')
const tierMenu = ref(null)
/** @type {import('vue').Ref<string | null>} */
const editingTierId = ref(null)
const renameDraft = ref('')
const rootEl = ref(null)
/** @type {import('vue').Ref<null | { itemId: string, from: string }>} */
const dragging = ref(null)
const dropTarget = ref(null)

watch(
  () => props.modelValue,
  (next) => {
    data.value = normalizeTierListData(next)
  },
  { deep: true },
)

const rootStyle = computed(() => ({
  '--ntl-board': props.theme?.boardBg || '#2a2438',
  '--ntl-controls': props.theme?.controlsBg || '#1a1524',
  '--ntl-pool': props.theme?.poolBg || '#322a42',
  '--ntl-border': props.theme?.border || '#4a3f5c',
  '--ntl-label-text': props.theme?.labelText || '#111111',
}))

function commit(next) {
  const normalized = normalizeTierListData(next)
  data.value = normalized
  emit('update:modelValue', normalized)
}

function findItemLocation(itemId) {
  const poolIndex = data.value.pool.findIndex((item) => item.id === itemId)
  if (poolIndex >= 0) return { kind: 'pool', index: poolIndex, tierId: null }
  for (const tier of data.value.tiers) {
    const index = tier.items.findIndex((item) => item.id === itemId)
    if (index >= 0) return { kind: 'tier', index, tierId: tier.id }
  }
  return null
}

function removeItemById(itemId) {
  const next = normalizeTierListData(data.value)
  next.pool = next.pool.filter((item) => item.id !== itemId)
  next.tiers = next.tiers.map((tier) => ({
    ...tier,
    items: tier.items.filter((item) => item.id !== itemId),
  }))
  return next
}

/**
 * @param {string} itemId
 * @param {'pool' | string} target  pool ou tierId
 * @param {number} [atIndex]
 */
function moveItem(itemId, target, atIndex = null) {
  if (props.readonly) return
  const location = findItemLocation(itemId)
  if (!location) return

  let item = null
  if (location.kind === 'pool') item = data.value.pool[location.index]
  else {
    const tier = data.value.tiers.find((entry) => entry.id === location.tierId)
    item = tier?.items[location.index] ?? null
  }
  if (!item) return

  const next = removeItemById(itemId)
  if (target === 'pool') {
    const idx = atIndex == null ? next.pool.length : Math.max(0, Math.min(atIndex, next.pool.length))
    next.pool.splice(idx, 0, item)
  } else {
    const tier = next.tiers.find((entry) => entry.id === target)
    if (!tier) return
    const idx = atIndex == null ? tier.items.length : Math.max(0, Math.min(atIndex, tier.items.length))
    tier.items.splice(idx, 0, item)
  }
  commit(next)
}

function addFromInput() {
  if (props.readonly) return
  const label = draftLabel.value.trim()
  if (!label) return
  const item = createTierListItem(label)
  if (!item) return
  const next = normalizeTierListData(data.value)
  next.pool = [...next.pool, item]
  draftLabel.value = ''
  commit(next)
}

function onDraftKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault()
    addFromInput()
  }
}

function deleteItem(itemId) {
  if (props.readonly) return
  commit(removeItemById(itemId))
}

function moveTier(tierId, direction) {
  if (props.readonly) return
  const next = normalizeTierListData(data.value)
  const index = next.tiers.findIndex((tier) => tier.id === tierId)
  if (index < 0) return
  const target = index + direction
  if (target < 0 || target >= next.tiers.length) return
  const copy = [...next.tiers]
  const [row] = copy.splice(index, 1)
  copy.splice(target, 0, row)
  next.tiers = copy
  commit(next)
}

function addTier(afterTierId = null) {
  if (props.readonly) return
  const next = normalizeTierListData(data.value)
  let insertIndex = next.tiers.length
  if (afterTierId) {
    const index = next.tiers.findIndex((entry) => entry.id === afterTierId)
    if (index >= 0) insertIndex = index + 1
  }
  const tier = createTierListTier({
    name: String.fromCharCode(65 + Math.min(insertIndex, 25)),
    color: tierColorAtIndex(insertIndex),
  })
  next.tiers.splice(insertIndex, 0, tier)
  commit(next)
  closeTierMenu()
}

function deleteTier(tierId) {
  if (props.readonly) return
  if (data.value.tiers.length <= 1) return
  const next = normalizeTierListData(data.value)
  const removed = next.tiers.find((tier) => tier.id === tierId)
  next.tiers = next.tiers.filter((tier) => tier.id !== tierId)
  if (removed?.items?.length) {
    next.pool = [...next.pool, ...removed.items]
  }
  commit(next)
  closeTierMenu()
}

function focusRenameInput(tierId) {
  const input = rootEl.value?.querySelector?.(
    `.notes-tierlist__rename-input[data-tier-id="${CSS.escape(tierId)}"]`,
  )
  if (!(input instanceof HTMLInputElement)) return false
  input.focus()
  input.select()
  return document.activeElement === input
}

async function startRenameTier(tierId) {
  if (props.readonly) return
  const tier = data.value.tiers.find((entry) => entry.id === tierId)
  if (!tier) return
  closeTierMenu()
  editingTierId.value = tierId
  renameDraft.value = tier.name
  await nextTick()
  if (focusRenameInput(tierId)) return
  await nextTick()
  requestAnimationFrame(() => {
    focusRenameInput(tierId)
  })
}

function cancelRenameTier() {
  editingTierId.value = null
  renameDraft.value = ''
}

function commitRenameTier() {
  const tierId = editingTierId.value
  if (!tierId) return
  const name = String(renameDraft.value ?? '').trim().slice(0, 40)
  cancelRenameTier()
  if (!name) return
  const next = normalizeTierListData(data.value)
  const target = next.tiers.find((entry) => entry.id === tierId)
  if (!target || target.name === name) return
  target.name = name
  commit(next)
}

function onRenameKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault()
    commitRenameTier()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancelRenameTier()
  }
}

function recolorTier(tierId, color) {
  if (props.readonly) return
  const hex = normalizeTierColor(color)
  if (!hex) return
  const next = normalizeTierListData(data.value)
  const target = next.tiers.find((entry) => entry.id === tierId)
  if (!target) return
  target.color = hex
  commit(next)
}

function pickTierColor(tierId) {
  if (props.readonly) return
  const tier = data.value.tiers.find((entry) => entry.id === tierId)
  if (!tier) return
  const nextColor = window.prompt('Couleur du tier (hex, ex. #ff7f7f) :', tier.color)
  if (nextColor == null) return
  recolorTier(tierId, nextColor)
  closeTierMenu()
}

function openTierMenu(event, tierId) {
  if (props.readonly) return
  event.preventDefault()
  event.stopPropagation()
  tierMenu.value = {
    tierId,
    x: event.clientX,
    y: event.clientY,
  }
}

function closeTierMenu() {
  tierMenu.value = null
}

function onDocPointerDown(event) {
  if (!tierMenu.value) return
  const target = event.target
  if (target instanceof Element && target.closest('.notes-tierlist__menu')) return
  closeTierMenu()
}

function onDocKeydown(event) {
  if (event.key === 'Escape') {
    if (editingTierId.value) {
      cancelRenameTier()
      return
    }
    closeTierMenu()
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown, true)
  document.addEventListener('keydown', onDocKeydown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  document.removeEventListener('keydown', onDocKeydown)
})

function onItemDragStart(event, itemId, from) {
  if (props.readonly) return
  dragging.value = { itemId, from }
  event.dataTransfer?.setData('text/plain', itemId)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onItemDragEnd() {
  dragging.value = null
  dropTarget.value = null
}

function onZoneDragOver(event, targetKey) {
  if (props.readonly || !dragging.value) return
  event.preventDefault()
  dropTarget.value = targetKey
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

function onZoneDragLeave(targetKey) {
  if (dropTarget.value === targetKey) dropTarget.value = null
}

function onZoneDrop(event, target, atIndex = null) {
  if (props.readonly) return
  event.preventDefault()
  const itemId = dragging.value?.itemId || event.dataTransfer?.getData('text/plain')
  dropTarget.value = null
  dragging.value = null
  if (!itemId) return
  moveItem(itemId, target, atIndex)
}

const activeTierMenu = computed(() => {
  if (!tierMenu.value) return null
  return data.value.tiers.find((tier) => tier.id === tierMenu.value.tierId) || null
})

const COLOR_PRESETS = [
  '#ff7f7f',
  '#ffbf7f',
  '#ffdf7f',
  '#ffff7f',
  '#bfff7f',
  '#7fff7f',
  '#7fffff',
  '#7fbfff',
  '#7f7fff',
  '#ff7fff',
  '#bf7fbf',
  '#ffffff',
]
</script>

<template>
  <div ref="rootEl" class="notes-tierlist" :style="rootStyle" @contextmenu.stop>
    <div class="notes-tierlist__board" role="list">
      <div
        v-for="(tier, tierIndex) in data.tiers"
        :key="tier.id"
        class="notes-tierlist__row"
        role="listitem"
      >
        <div
          v-if="editingTierId === tier.id"
          class="notes-tierlist__label notes-tierlist__label-edit"
          :style="{ backgroundColor: tier.color, color: 'var(--ntl-label-text)' }"
        >
          <input
            v-model="renameDraft"
            type="text"
            class="notes-tierlist__rename-input"
            :data-tier-id="tier.id"
            maxlength="40"
            aria-label="Nom du tier"
            @keydown="onRenameKeydown"
            @blur="commitRenameTier"
          />
        </div>
        <button
          v-else
          type="button"
          class="notes-tierlist__label"
          :style="{ backgroundColor: tier.color, color: 'var(--ntl-label-text)' }"
          :title="readonly ? tier.name : 'Clic droit pour modifier'"
          :disabled="readonly"
          @contextmenu="openTierMenu($event, tier.id)"
          @click="!readonly && openTierMenu($event, tier.id)"
        >
          <span class="notes-tierlist__label-text">{{ tier.name }}</span>
        </button>

        <div
          class="notes-tierlist__lane"
          :class="{ 'notes-tierlist__lane--active': dropTarget === `tier:${tier.id}` }"
          @dragover="onZoneDragOver($event, `tier:${tier.id}`)"
          @dragleave="onZoneDragLeave(`tier:${tier.id}`)"
          @drop="onZoneDrop($event, tier.id)"
        >
          <div
            v-for="item in tier.items"
            :key="item.id"
            class="notes-tierlist__item"
            :draggable="!readonly"
            @dragstart="onItemDragStart($event, item.id, tier.id)"
            @dragend="onItemDragEnd"
          >
            <span class="notes-tierlist__item-label">{{ item.label }}</span>
            <button
              v-if="!readonly"
              type="button"
              class="notes-tierlist__item-remove"
              title="Retirer"
              @click.stop="deleteItem(item.id)"
            >
              ×
            </button>
          </div>
          <p v-if="!tier.items.length" class="notes-tierlist__empty">Glisse un élément ici</p>
        </div>

        <div v-if="!readonly" class="notes-tierlist__controls">
          <button
            type="button"
            class="notes-tierlist__ctrl"
            title="Options du tier"
            @click="openTierMenu($event, tier.id)"
          >
            ⚙
          </button>
          <button
            type="button"
            class="notes-tierlist__ctrl"
            title="Monter"
            :disabled="tierIndex === 0"
            @click="moveTier(tier.id, -1)"
          >
            ▴
          </button>
          <button
            type="button"
            class="notes-tierlist__ctrl"
            title="Descendre"
            :disabled="tierIndex === data.tiers.length - 1"
            @click="moveTier(tier.id, 1)"
          >
            ▾
          </button>
        </div>
      </div>
    </div>

    <div class="notes-tierlist__pool-wrap">
      <div
        class="notes-tierlist__pool"
        :class="{ 'notes-tierlist__pool--active': dropTarget === 'pool' }"
        @dragover="onZoneDragOver($event, 'pool')"
        @dragleave="onZoneDragLeave('pool')"
        @drop="onZoneDrop($event, 'pool')"
      >
        <div
          v-for="item in data.pool"
          :key="item.id"
          class="notes-tierlist__item notes-tierlist__item--pool"
          :draggable="!readonly"
          @dragstart="onItemDragStart($event, item.id, 'pool')"
          @dragend="onItemDragEnd"
        >
          <span class="notes-tierlist__item-label">{{ item.label }}</span>
          <button
            v-if="!readonly"
            type="button"
            class="notes-tierlist__item-remove"
            title="Supprimer"
            @click.stop="deleteItem(item.id)"
          >
            ×
          </button>
        </div>
        <p v-if="!data.pool.length" class="notes-tierlist__pool-hint">
          Réserve — ajoute un élément puis glisse-le dans un tier
        </p>
      </div>

      <form v-if="!readonly" class="notes-tierlist__add" @submit.prevent="addFromInput">
        <input
          v-model="draftLabel"
          type="text"
          class="notes-tierlist__input"
          maxlength="120"
          placeholder="Ajouter un élément…"
          @keydown="onDraftKeydown"
        />
        <button type="submit" class="notes-tierlist__add-btn" :disabled="!draftLabel.trim()">
          Ajouter
        </button>
        <button type="button" class="notes-tierlist__add-btn notes-tierlist__add-btn--ghost" @click="addTier()">
          + Tier
        </button>
      </form>
    </div>

    <Teleport to="body">
      <div
        v-if="tierMenu && activeTierMenu"
        class="notes-tierlist__menu"
        role="menu"
        :style="{ top: `${tierMenu.y}px`, left: `${tierMenu.x}px` }"
        @contextmenu.prevent
      >
        <p class="notes-tierlist__menu-title">Tier « {{ activeTierMenu.name }} »</p>
        <button
          type="button"
          class="notes-tierlist__menu-item"
          role="menuitem"
          @mousedown.prevent
          @click="startRenameTier(activeTierMenu.id)"
        >
          Renommer
        </button>
        <button type="button" class="notes-tierlist__menu-item" role="menuitem" @click="pickTierColor(activeTierMenu.id)">
          Couleur personnalisée…
        </button>
        <div class="notes-tierlist__swatches">
          <button
            v-for="color in COLOR_PRESETS"
            :key="color"
            type="button"
            class="notes-tierlist__swatch"
            :class="{ 'notes-tierlist__swatch--active': activeTierMenu.color === color }"
            :style="{ backgroundColor: color }"
            :title="color"
            @click="recolorTier(activeTierMenu.id, color); closeTierMenu()"
          />
        </div>
        <button type="button" class="notes-tierlist__menu-item" role="menuitem" @click="addTier(activeTierMenu.id)">
          Ajouter un tier en dessous
        </button>
        <button
          type="button"
          class="notes-tierlist__menu-item notes-tierlist__menu-item--danger"
          role="menuitem"
          :disabled="data.tiers.length <= 1"
          @click="deleteTier(activeTierMenu.id)"
        >
          Supprimer le tier
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.notes-tierlist {
  margin: 0.85em 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--ntl-border);
  background: var(--ntl-board);
  color: #f2eef8;
  font-size: 0.92rem;
  user-select: none;
}

.notes-tierlist__board {
  display: flex;
  flex-direction: column;
}

.notes-tierlist__row {
  display: grid;
  grid-template-columns: minmax(4.75rem, 7.5rem) minmax(0, 1fr) 2.1rem;
  min-height: 3.1rem;
  border-bottom: 1px solid #000;
}

.notes-tierlist__label {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0.4rem 0.35rem;
  border: none;
  border-right: 1px solid #000;
  font: inherit;
  font-weight: 800;
  font-size: 1.05rem;
  letter-spacing: 0.01em;
  cursor: pointer;
  line-height: 1.2;
  text-align: center;
  min-width: 0;
  box-sizing: border-box;
}

.notes-tierlist__label-text {
  display: block;
  width: 100%;
  white-space: normal;
  overflow-wrap: break-word;
  word-break: normal;
  hyphens: none;
}

.notes-tierlist__label:disabled {
  cursor: default;
}

.notes-tierlist__label-edit {
  cursor: text;
  padding: 0.25rem;
}

.notes-tierlist__rename-input {
  width: 100%;
  min-width: 0;
  border: 1px solid rgba(0, 0, 0, 0.28);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.92);
  color: #111;
  font: inherit;
  font-weight: 800;
  font-size: 0.95rem;
  line-height: 1.2;
  text-align: center;
  padding: 0.2rem 0.15rem;
  box-sizing: border-box;
}

.notes-tierlist__rename-input:focus {
  outline: 2px solid rgba(0, 0, 0, 0.35);
  outline-offset: 0;
}

.notes-tierlist__lane {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.45rem;
  min-height: 3.1rem;
  background: var(--ntl-board);
  transition: background 0.12s ease;
}

.notes-tierlist__lane--active,
.notes-tierlist__pool--active {
  background: color-mix(in srgb, var(--ntl-board) 70%, #ffffff 30%);
}

.notes-tierlist__empty {
  margin: 0;
  font-size: 0.78rem;
  opacity: 0.45;
  pointer-events: none;
}

.notes-tierlist__controls {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 0;
  background: var(--ntl-controls);
  border-left: 1px solid #000;
}

.notes-tierlist__ctrl {
  flex: 1;
  border: none;
  background: transparent;
  color: #f5f0fa;
  font-size: 0.72rem;
  line-height: 1;
  padding: 0.15rem 0;
  cursor: pointer;
}

.notes-tierlist__ctrl:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
}

.notes-tierlist__ctrl:disabled {
  opacity: 0.3;
  cursor: default;
}

.notes-tierlist__item {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  max-width: 100%;
  padding: 0.28rem 0.45rem;
  border-radius: 4px;
  background: #ece6f4;
  color: #1a1524;
  font-weight: 600;
  font-size: 0.82rem;
  cursor: grab;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.2);
}

.notes-tierlist__item:active {
  cursor: grabbing;
}

.notes-tierlist__item-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 14rem;
}

.notes-tierlist__item-remove {
  border: none;
  background: transparent;
  color: #6a5a7a;
  font-size: 0.95rem;
  line-height: 1;
  padding: 0 0.1rem;
  cursor: pointer;
}

.notes-tierlist__item-remove:hover {
  color: #b02040;
}

.notes-tierlist__pool-wrap {
  border-top: 1px solid #000;
  background: var(--ntl-pool);
  padding: 0.55rem 0.65rem 0.7rem;
}

.notes-tierlist__pool {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  min-height: 2.4rem;
  margin-bottom: 0.5rem;
  padding: 0.35rem;
  border-radius: 6px;
  border: 1px dashed rgba(255, 255, 255, 0.18);
  transition: background 0.12s ease;
}

.notes-tierlist__pool-hint {
  margin: 0;
  font-size: 0.78rem;
  opacity: 0.55;
}

.notes-tierlist__add {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.notes-tierlist__input {
  flex: 1 1 10rem;
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.28);
  color: #f5f0fa;
  padding: 0.4rem 0.55rem;
  font: inherit;
}

.notes-tierlist__input::placeholder {
  color: rgba(245, 240, 250, 0.45);
}

.notes-tierlist__add-btn {
  border: none;
  border-radius: 6px;
  background: #ece6f4;
  color: #1a1524;
  font: inherit;
  font-weight: 650;
  padding: 0.4rem 0.7rem;
  cursor: pointer;
}

.notes-tierlist__add-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.notes-tierlist__add-btn--ghost {
  background: transparent;
  color: #f5f0fa;
  border: 1px solid rgba(255, 255, 255, 0.22);
}

.notes-tierlist__menu {
  position: fixed;
  z-index: 1200;
  min-width: 220px;
  max-width: min(300px, calc(100vw - 1rem));
  padding: 0.35rem;
  border-radius: 10px;
  background: #f7f4ef;
  border: 1px solid #e4ddd2;
  box-shadow: 0 12px 36px rgba(40, 30, 20, 0.18);
  color: #3a342c;
  font-size: 0.86rem;
}

.notes-tierlist__menu-title {
  margin: 0.25rem 0.5rem 0.4rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: #7a7164;
}

.notes-tierlist__menu-item {
  display: block;
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

.notes-tierlist__menu-item:hover:not(:disabled) {
  background: #ebe4d8;
}

.notes-tierlist__menu-item:disabled {
  opacity: 0.4;
  cursor: default;
}

.notes-tierlist__menu-item--danger {
  color: #a02840;
}

.notes-tierlist__swatches {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 0.25rem;
  padding: 0.2rem 0.45rem 0.45rem;
}

.notes-tierlist__swatch {
  aspect-ratio: 1;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 4px;
  padding: 0;
  cursor: pointer;
}

.notes-tierlist__swatch--active {
  outline: 2px solid #5b3d7a;
  outline-offset: 1px;
}

@media (max-width: 640px) {
  .notes-tierlist__row {
    grid-template-columns: minmax(4.2rem, 6.5rem) minmax(0, 1fr) 1.8rem;
  }

  .notes-tierlist__label {
    font-size: 0.95rem;
  }
}
</style>
