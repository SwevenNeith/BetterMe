<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '../lib/supabase.js'
import { BATTERY_ENTRY_KINDS } from '../constants/battery/battery.js'
import { resolveSessionUser } from '../utils/auth/sessionUser.js'
import { getLocalTodayISO } from '../services/common/scheduledReminders.js'
import {
  createBatteryActivity,
  deleteBatteryActivity,
  listBatteryActivities,
  updateBatteryActivity,
} from '../services/battery/batteryActivities.js'
import { addBatteryEntry } from '../services/battery/batteryDays.js'
import { costStyleClass } from '../utils/battery/batteryMath.js'

defineOptions({ name: 'BatteryCatalogView' })

const pageTitle = 'Catalogue'

/** @typedef {'drain'|'restore'} EnergyEffect */

const route = useRoute()
const router = useRouter()

const userId = ref(null)
const isLoading = ref(false)
const loadError = ref('')
const statusMessage = ref('')
const activities = ref([])
const query = ref('')
/** @typedef {'alpha'|'cost-desc'|'cost-asc'} CatalogSort */
/** @type {import('vue').Ref<CatalogSort>} */
const sortMode = ref('alpha')
const newName = ref('')
/** Magnitude toujours positive ; le signe vient de newEffect. */
const newAmount = ref(1)
/** @type {import('vue').Ref<EnergyEffect>} */
const newEffect = ref('drain')
const formError = ref('')
const busyId = ref(null)

const SORT_OPTIONS = [
  { id: 'alpha', label: 'A → Z' },
  { id: 'cost-desc', label: 'Plus coûteuse → moins' },
  { id: 'cost-asc', label: 'Moins coûteuse → plus' },
]

const targetDate = computed(() => {
  const raw = String(route.query.date || '')
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  return getLocalTodayISO()
})

const targetDateLabel = computed(() => {
  try {
    const [y, m, d] = targetDate.value.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
  } catch {
    return targetDate.value
  }
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = q
    ? activities.value.filter((a) => a.name.toLowerCase().includes(q))
    : [...activities.value]

  const byName = (a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'fr', { sensitivity: 'base' })

  if (sortMode.value === 'cost-desc') {
    // Coût signé : +2 (dépense) > −2 (regain) → plus « cher » en premier.
    return list.sort((a, b) => {
      const diff = (Number(b.default_cost) || 0) - (Number(a.default_cost) || 0)
      return diff !== 0 ? diff : byName(a, b)
    })
  }
  if (sortMode.value === 'cost-asc') {
    return list.sort((a, b) => {
      const diff = (Number(a.default_cost) || 0) - (Number(b.default_cost) || 0)
      return diff !== 0 ? diff : byName(a, b)
    })
  }
  return list.sort(byName)
})

/**
 * @param {EnergyEffect} effect
 * @param {number} amount
 */
function toSignedCost(effect, amount) {
  const mag = Math.abs(Math.round(Number(amount) || 0))
  return effect === 'restore' ? -mag : mag
}

function formatCost(n) {
  const v = Number(n) || 0
  if (v > 0) return `−${v}`
  if (v < 0) return `+${Math.abs(v)}`
  return '0'
}

function effectOf(cost) {
  return Number(cost) < 0 ? 'restore' : 'drain'
}

async function loadActivities() {
  if (!userId.value) return
  isLoading.value = true
  loadError.value = ''
  try {
    activities.value = await listBatteryActivities(supabase, userId.value)
  } catch (err) {
    console.error(err)
    loadError.value =
      err?.message?.includes('battery_') || err?.code === '42P01'
        ? 'Tables Batterie introuvables. Exécute scripts/create-battery.sql dans Supabase.'
        : 'Impossible de charger le catalogue.'
  } finally {
    isLoading.value = false
  }
}

async function createItem() {
  formError.value = ''
  if (!newName.value.trim()) {
    formError.value = 'Indique un nom.'
    return
  }
  try {
    await createBatteryActivity(supabase, userId.value, {
      name: newName.value,
      default_cost: toSignedCost(newEffect.value, newAmount.value),
    })
    newName.value = ''
    newAmount.value = 1
    newEffect.value = 'drain'
    await loadActivities()
  } catch (err) {
    formError.value = err?.message || 'Erreur.'
  }
}

async function renameItem(activity, event) {
  const name = String(event.target.value || '').trim()
  if (!name || name === activity.name) {
    event.target.value = activity.name
    return
  }
  try {
    await updateBatteryActivity(supabase, userId.value, activity.id, { name })
    await loadActivities()
  } catch (err) {
    console.error(err)
    event.target.value = activity.name
    formError.value = err?.message || 'Impossible de renommer.'
  }
}

async function removeItem(activity) {
  try {
    await deleteBatteryActivity(supabase, userId.value, activity.id)
    await loadActivities()
  } catch (err) {
    console.error(err)
  }
}

async function addToDay(activity, kind) {
  if (!userId.value || busyId.value) return
  busyId.value = activity.id
  statusMessage.value = ''
  try {
    await addBatteryEntry(supabase, userId.value, targetDate.value, {
      label: activity.name,
      cost: activity.default_cost,
      kind,
      activity_id: activity.id,
    })
    statusMessage.value =
      kind === BATTERY_ENTRY_KINDS.PLANNED
        ? `« ${activity.name} » planifié pour ${targetDateLabel.value}`
        : `« ${activity.name} » ajouté au réel`
  } catch (err) {
    console.error(err)
    statusMessage.value = err?.message || 'Erreur'
  } finally {
    busyId.value = null
  }
}

function goBack() {
  router.push({
    name: 'battery',
    query: { date: targetDate.value },
  })
}

onMounted(async () => {
  document.title = `${pageTitle} · BetterMe`
  const user = await resolveSessionUser()
  if (!user) return
  userId.value = user.id
  await loadActivities()
})
</script>

<template>
  <div class="catalog-page">
    <div class="bg-blob bg-blob--a" aria-hidden="true" />
    <div class="bg-blob bg-blob--b" aria-hidden="true" />

    <header class="page-header">
      <button type="button" class="page-back" @click="goBack">← Batterie</button>
      <h1 class="page-title">{{ pageTitle }}</h1>
      <p class="page-subtitle">
        Activités réutilisables · planifier pour
        <strong class="date-em">{{ targetDateLabel }}</strong>
      </p>
    </header>

    <p v-if="statusMessage" class="flash flash--ok">{{ statusMessage }}</p>
    <p v-if="loadError" class="flash flash--error">{{ loadError }}</p>
    <p v-else-if="isLoading" class="flash">Chargement…</p>

    <template v-else>
      <section class="panel create-panel">
        <h2 class="panel__title">Nouvelle activité</h2>
        <form class="create-form" @submit.prevent="createItem">
          <input v-model="newName" type="text" placeholder="Nom de l’activité" required />
          <div class="effect-toggle" role="group" aria-label="Effet sur l’énergie">
            <button
              type="button"
              class="effect-toggle__btn effect-toggle__btn--drain"
              :class="{ 'is-active': newEffect === 'drain' }"
              @click="newEffect = 'drain'"
            >
              Dépense
            </button>
            <button
              type="button"
              class="effect-toggle__btn effect-toggle__btn--restore"
              :class="{ 'is-active': newEffect === 'restore' }"
              @click="newEffect = 'restore'"
            >
              Regain
            </button>
          </div>
          <input
            v-model.number="newAmount"
            type="number"
            min="0"
            step="1"
            title="Points d’énergie"
            aria-label="Points d’énergie"
          />
          <button type="submit" class="primary-btn">Ajouter</button>
        </form>
        <p v-if="formError" class="flash flash--error">{{ formError }}</p>
        <p class="hint">
          Choisis Dépense ou Regain, puis les points à la création. Ensuite tu peux renommer ou
          supprimer ; le coût par défaut évolue tout seul via les activités réelles du jour (même
          coût pendant 2 semaines d’affilée).
        </p>
      </section>

      <section class="panel list-panel">
        <div class="list-panel__head">
          <h2 class="panel__title">Mes activités</h2>
          <div class="list-panel__tools">
            <label class="sort-field">
              <span class="sort-field__label">Tri</span>
              <select v-model="sortMode" class="sort-select" aria-label="Trier les activités">
                <option v-for="opt in SORT_OPTIONS" :key="opt.id" :value="opt.id">
                  {{ opt.label }}
                </option>
              </select>
            </label>
            <input v-model="query" type="search" class="search" placeholder="Rechercher…" />
          </div>
        </div>

        <ul class="list">
          <li
            v-for="activity in filtered"
            :key="activity.id"
            class="item"
            :class="`item--${costStyleClass(activity.default_cost)}`"
          >
            <div class="item__top">
              <input
                class="item__name-input"
                type="text"
                :value="activity.name"
                aria-label="Nom de l’activité"
                title="Renommer"
                @change="renameItem(activity, $event)"
              />
              <span
                class="item__badge"
                :class="`item__badge--${costStyleClass(activity.default_cost)}`"
                :title="
                  effectOf(activity.default_cost) === 'restore'
                    ? 'Regain (coût par défaut)'
                    : 'Dépense (coût par défaut)'
                "
              >
                {{ formatCost(activity.default_cost) }}
              </span>
            </div>

            <div class="item__actions">
              <button
                type="button"
                class="action-btn action-btn--plan"
                :disabled="busyId === activity.id"
                @click="addToDay(activity, BATTERY_ENTRY_KINDS.PLANNED)"
              >
                Planifier
              </button>
              <button
                type="button"
                class="action-btn action-btn--actual"
                :disabled="busyId === activity.id"
                @click="addToDay(activity, BATTERY_ENTRY_KINDS.ACTUAL)"
              >
                Réel
              </button>
              <button
                type="button"
                class="icon-btn"
                aria-label="Supprimer"
                @click="removeItem(activity)"
              >
                ×
              </button>
            </div>
          </li>
          <li v-if="!filtered.length" class="empty">Aucune activité</li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.catalog-page {
  position: relative;
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
  overflow: hidden;
}

.bg-blob {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  z-index: 0;
}

.bg-blob--a {
  width: 400px;
  height: 400px;
  top: -120px;
  right: -80px;
  background: radial-gradient(circle, rgba(213, 181, 234, 0.32) 0%, transparent 70%);
}

.bg-blob--b {
  width: 320px;
  height: 320px;
  bottom: 12%;
  left: -90px;
  background: radial-gradient(circle, rgba(143, 162, 212, 0.2) 0%, transparent 70%);
}

.page-header,
.panel,
.flash {
  position: relative;
  z-index: 1;
}

.page-header {
  margin-bottom: 1.25rem;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  text-align: center;
}

.page-back {
  display: inline-block;
  align-self: flex-start;
  margin-bottom: 0.65rem;
  padding: 0.25rem 0;
  border: none;
  background: transparent;
  color: #6b4f7c;
  font: inherit;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
}

.page-back:hover {
  color: #3d2f4a;
}

.page-title {
  margin: 0;
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  letter-spacing: -0.5px;
}

.page-subtitle {
  margin: 0.5rem auto 0;
  max-width: 560px;
  color: #6c757d;
  font-size: 1rem;
  line-height: 1.45;
}

.date-em {
  color: #ad81be;
  font-weight: 700;
  text-transform: capitalize;
}

.panel {
  width: 100%;
  background: rgba(255, 255, 255, 0.68);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 18px;
  padding: 1.15rem 1.15rem 1.3rem;
  margin-bottom: 1rem;
  box-sizing: border-box;
}

.panel__title {
  margin: 0 0 0.75rem;
  font-size: 1.1rem;
  font-weight: 800;
  color: #2c3e50;
}

.create-form {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) auto 5rem 7.5rem;
  gap: 0.5rem;
  margin-bottom: 0.65rem;
  align-items: stretch;
}

.create-form input,
.search {
  border: 1px solid rgba(213, 181, 234, 0.45);
  border-radius: 10px;
  padding: 0.55rem 0.7rem;
  background: rgba(255, 255, 255, 0.9);
  color: #2c3e50;
  font: inherit;
  box-sizing: border-box;
}

.effect-toggle {
  display: inline-flex;
  padding: 0.2rem;
  border-radius: 10px;
  background: rgba(213, 181, 234, 0.14);
  border: 1px solid rgba(213, 181, 234, 0.3);
  gap: 0.15rem;
}

.effect-toggle__btn {
  border: none;
  border-radius: 8px;
  padding: 0.4rem 0.7rem;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  color: #6c757d;
  background: transparent;
  cursor: pointer;
  white-space: nowrap;
}

.effect-toggle__btn--drain.is-active {
  background: rgba(232, 160, 192, 0.55);
  color: #9a3d5c;
  box-shadow: 0 1px 4px rgba(196, 92, 92, 0.12);
}

.effect-toggle__btn--restore.is-active {
  background: rgba(149, 209, 170, 0.55);
  color: #2f6b4a;
  box-shadow: 0 1px 4px rgba(90, 158, 120, 0.12);
}

.primary-btn,
.action-btn {
  border: none;
  border-radius: 10px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.primary-btn {
  background: #ad81be;
  color: #fff;
  padding: 0 0.75rem;
  min-height: 2.5rem;
}

.hint {
  margin: 0;
  font-size: 0.85rem;
  color: #8a9098;
  line-height: 1.4;
}

.list-panel__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.list-panel__head .panel__title {
  margin: 0;
}

.list-panel__tools {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.55rem;
  flex: 1;
  justify-content: flex-end;
  min-width: 0;
}

.sort-field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.sort-field__label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #8a9098;
}

.sort-select,
.search {
  width: min(280px, 100%);
}

.sort-select {
  border: 1px solid rgba(213, 181, 234, 0.45);
  border-radius: 10px;
  padding: 0.55rem 0.7rem;
  background: rgba(255, 255, 255, 0.9);
  color: #2c3e50;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  box-sizing: border-box;
  cursor: pointer;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0.75rem;
}

.item {
  display: grid;
  gap: 0.65rem;
  padding: 0.9rem;
  border-radius: 14px;
  border: 1.5px solid rgba(213, 181, 234, 0.28);
  background: rgba(213, 181, 234, 0.1);
  transition: border-color 0.15s ease, background 0.15s ease;
}

.item--neutral {
  background: rgba(213, 181, 234, 0.1);
  border-color: rgba(213, 181, 234, 0.28);
}

/* Dépense : rose de plus en plus soutenu (1 → 5) */
.item--drain-1 {
  background: rgba(250, 230, 238, 0.85);
  border-color: rgba(232, 160, 192, 0.4);
}
.item--drain-2 {
  background: rgba(244, 200, 218, 0.7);
  border-color: rgba(232, 160, 192, 0.55);
}
.item--drain-3 {
  background: rgba(232, 160, 192, 0.45);
  border-color: rgba(217, 120, 160, 0.65);
}
.item--drain-4 {
  background: rgba(212, 120, 150, 0.4);
  border-color: rgba(196, 92, 120, 0.7);
}
.item--drain-5 {
  background: rgba(180, 70, 100, 0.38);
  border-color: rgba(160, 50, 80, 0.75);
}

/* Regain : vert de plus en plus soutenu (1 → 5) */
.item--restore-1 {
  background: rgba(232, 245, 236, 0.9);
  border-color: rgba(149, 209, 170, 0.4);
}
.item--restore-2 {
  background: rgba(200, 232, 210, 0.75);
  border-color: rgba(149, 209, 170, 0.55);
}
.item--restore-3 {
  background: rgba(149, 209, 170, 0.45);
  border-color: rgba(90, 170, 120, 0.65);
}
.item--restore-4 {
  background: rgba(90, 170, 120, 0.4);
  border-color: rgba(60, 140, 95, 0.7);
}
.item--restore-5 {
  background: rgba(45, 120, 80, 0.4);
  border-color: rgba(35, 100, 65, 0.75);
}

.item__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.item__name-input {
  flex: 1;
  min-width: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 0.35rem 0.45rem;
  background: rgba(255, 255, 255, 0.55);
  font: inherit;
  font-weight: 700;
  color: #2c3e50;
}

.item__name-input:hover,
.item__name-input:focus {
  border-color: rgba(213, 181, 234, 0.55);
  background: rgba(255, 255, 255, 0.92);
  outline: none;
}

.item__badge {
  flex-shrink: 0;
  font-size: 0.82rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
}

.item__badge--neutral {
  background: rgba(173, 129, 190, 0.2);
  color: #6c757d;
}

.item__badge--drain-1,
.item__badge--drain-2 {
  background: rgba(232, 160, 192, 0.35);
  color: #9a3d5c;
}
.item__badge--drain-3 {
  background: rgba(217, 120, 160, 0.45);
  color: #8a2d4c;
}
.item__badge--drain-4,
.item__badge--drain-5 {
  background: rgba(180, 70, 100, 0.55);
  color: #5c1830;
}

.item__badge--restore-1,
.item__badge--restore-2 {
  background: rgba(149, 209, 170, 0.35);
  color: #2f6b4a;
}
.item__badge--restore-3 {
  background: rgba(90, 170, 120, 0.45);
  color: #1e5a38;
}
.item__badge--restore-4,
.item__badge--restore-5 {
  background: rgba(45, 120, 80, 0.55);
  color: #0f3d28;
}

.item__actions {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 0.45rem;
  align-items: stretch;
}

.action-btn {
  min-height: 2.35rem;
  padding: 0 0.75rem;
  font-size: 0.88rem;
  width: 100%;
}

.action-btn--plan {
  background: rgba(143, 162, 212, 0.4);
  color: #3d4f8a;
}

.action-btn--actual {
  background: rgba(149, 209, 170, 0.45);
  color: #2f6b4a;
}

.action-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.icon-btn {
  border: none;
  background: transparent;
  color: #c45c5c;
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.45rem;
  border-radius: 8px;
  min-width: 2.35rem;
}

.icon-btn:hover {
  background: rgba(196, 92, 92, 0.1);
}

.empty {
  grid-column: 1 / -1;
  color: #8a9098;
  font-size: 0.9rem;
  padding: 0.5rem 0;
}

.flash {
  margin: 0 0 0.85rem;
  font-size: 0.92rem;
  color: #6c757d;
  text-align: center;
}

.flash--ok {
  color: #5a9e78;
  font-weight: 600;
}

.flash--error {
  color: #c45c5c;
  font-weight: 600;
}

@media (max-width: 720px) {
  .create-form {
    grid-template-columns: 1fr;
  }

  .list-panel__tools {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
  }

  .sort-select,
  .search {
    width: 100%;
  }

  .list {
    grid-template-columns: 1fr;
  }
}

@media (prefers-color-scheme: dark) {
  .page-title,
  .panel__title,
  .item__name-input {
    color: #f0e8f8;
  }

  .item__name-input {
    background: rgba(35, 30, 48, 0.55);
  }

  .item__name-input:hover,
  .item__name-input:focus {
    background: rgba(35, 30, 48, 0.85);
    border-color: rgba(213, 181, 234, 0.35);
  }

  .page-back {
    color: #c9b0d8;
  }

  .page-back:hover {
    color: #f0e8f8;
  }

  .page-subtitle,
  .hint,
  .empty,
  .flash {
    color: #adb5bd;
  }

  .panel,
  .create-form input,
  .search,
  .sort-select {
    background: rgba(35, 30, 48, 0.78);
    border-color: rgba(213, 181, 234, 0.22);
    color: #f0e8f8;
  }

  .sort-field__label {
    color: #adb5bd;
  }

  .item--neutral {
    background: rgba(173, 129, 190, 0.12);
  }

  .item--drain-1 { background: rgba(232, 160, 192, 0.1); }
  .item--drain-2 { background: rgba(232, 160, 192, 0.16); }
  .item--drain-3 { background: rgba(232, 160, 192, 0.24); }
  .item--drain-4 { background: rgba(196, 92, 120, 0.28); }
  .item--drain-5 { background: rgba(160, 50, 80, 0.32); }

  .item--restore-1 { background: rgba(149, 209, 170, 0.1); }
  .item--restore-2 { background: rgba(149, 209, 170, 0.16); }
  .item--restore-3 { background: rgba(149, 209, 170, 0.24); }
  .item--restore-4 { background: rgba(60, 140, 95, 0.28); }
  .item--restore-5 { background: rgba(35, 100, 65, 0.32); }

  .item__badge--drain-4,
  .item__badge--drain-5 {
    color: #f5c4d4;
  }

  .item__badge--restore-4,
  .item__badge--restore-5 {
    color: #b8e0c4;
  }

  .effect-toggle__btn--drain.is-active {
    color: #f5c4d4;
  }

  .effect-toggle__btn--restore.is-active {
    color: #b8e0c4;
  }
}
</style>
