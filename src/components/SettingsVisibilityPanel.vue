<script setup>
import { ref, computed, watch } from 'vue'
import { supabase } from '../lib/supabase.js'
import { APP_MAIN_PAGES, APP_PAGE_IDS } from '../constants/appPages.js'
import {
  DASHBOARD_WIDGETS,
  DASHBOARD_WIDGET_IDS,
  DASHBOARD_DESKTOP_ZONES,
} from '../constants/dashboardWidgets.js'
import DashboardVisibilityWidgetRow from './DashboardVisibilityWidgetRow.vue'
import {
  loadPageVisibility,
  savePageVisibility,
  getPageDisplayLabel,
  mergePageVisibility,
} from '../services/pageVisibility.js'
import {
  loadDashboardVisibility,
  saveDashboardVisibility,
  mergeDashboardVisibility,
  getDashboardLayout,
  moveDesktopWidget,
  moveMobileWidgetInGroups,
  extractMobileWidgetToOwnGroup,
} from '../services/dashboardVisibility.js'

const DASHBOARD_WIDGET_PAGE_IDS = {
  [DASHBOARD_WIDGET_IDS.TODO]: APP_PAGE_IDS.TODO,
  [DASHBOARD_WIDGET_IDS.TIMETABLE]: APP_PAGE_IDS.TIMETABLE,
  [DASHBOARD_WIDGET_IDS.HABITS]: APP_PAGE_IDS.HABIT,
  [DASHBOARD_WIDGET_IDS.MENSTRUATION]: APP_PAGE_IDS.MENSTRUATION,
  [DASHBOARD_WIDGET_IDS.PROJECTS]: APP_PAGE_IDS.PROJETS,
  [DASHBOARD_WIDGET_IDS.DICTIONARY_WORD]: APP_PAGE_IDS.DICTIONNAIRE,
  [DASHBOARD_WIDGET_IDS.READING_IN_PROGRESS]: APP_PAGE_IDS.LECTURE,
  [DASHBOARD_WIDGET_IDS.NOTES_GRAPH]: APP_PAGE_IDS.NOTES,
  [DASHBOARD_WIDGET_IDS.DAILY_NOTE]: APP_PAGE_IDS.NOTES,
}

const props = defineProps({
  userId: {
    type: String,
    default: null,
  },
})

const COLLAPSIBLE = {
  PAGES: 'pages',
  DASHBOARD: 'dashboard',
}

const expandedSections = ref({
  [COLLAPSIBLE.PAGES]: false,
  [COLLAPSIBLE.DASHBOARD]: false,
})

const isLoading = ref(false)
const isSaving = ref(false)
const loadError = ref('')
const saveError = ref('')
const saveMessage = ref('')
const pageVisibility = ref(mergePageVisibility(null))
const dashboardVisibility = ref(mergeDashboardVisibility(null))
const editingPageId = ref(null)
const editingLabel = ref('')

const dragState = ref({
  widgetId: null,
  fromZone: null,
  overZone: null,
  overWidgetId: null,
  overGroupIndex: null,
})

const pagesForList = computed(() =>
  APP_MAIN_PAGES.map((page) => ({
    ...page,
    visible: pageVisibility.value[page.id]?.visible !== false,
    displayLabel: getPageDisplayLabel(page.id, pageVisibility.value, page.defaultLabel),
  })),
)

const dashboardWidgetsForList = computed(() =>
  DASHBOARD_WIDGETS.map((widget) => {
    const pageId = DASHBOARD_WIDGET_PAGE_IDS[widget.id]
    return {
      ...widget,
      visible: dashboardVisibility.value[widget.id]?.visible !== false,
      displayLabel: pageId
        ? getPageDisplayLabel(pageId, pageVisibility.value, widget.defaultLabel)
        : widget.defaultLabel,
    }
  }),
)

const dashboardWidgetMap = computed(() =>
  Object.fromEntries(dashboardWidgetsForList.value.map((widget) => [widget.id, widget])),
)

const dashboardLayout = computed(() => getDashboardLayout(dashboardVisibility.value))

function orderedDashboardWidgets(ids) {
  return ids.map((id) => dashboardWidgetMap.value[id]).filter(Boolean)
}

const dashboardMobileGroups = computed(() => dashboardLayout.value.mobileGroups ?? [])

const dashboardTopWidgets = computed(() =>
  orderedDashboardWidgets(dashboardLayout.value.desktop.top),
)

const dashboardLeftWidgets = computed(() =>
  orderedDashboardWidgets(dashboardLayout.value.desktop.left),
)

const dashboardRightWidgets = computed(() =>
  orderedDashboardWidgets(dashboardLayout.value.desktop.right),
)

const dashboardBottomWidgets = computed(() =>
  orderedDashboardWidgets(dashboardLayout.value.desktop.bottom),
)

function toggleSection(section) {
  expandedSections.value[section] = !expandedSections.value[section]
}

async function loadSettings() {
  if (!props.userId) return

  isLoading.value = true
  loadError.value = ''
  try {
    const [pages, dashboard] = await Promise.all([
      loadPageVisibility(supabase, props.userId),
      loadDashboardVisibility(supabase, props.userId),
    ])
    pageVisibility.value = pages
    dashboardVisibility.value = dashboard
  } catch (err) {
    console.error(err)
    loadError.value = err.message || 'Impossible de charger la visibilité des pages.'
    pageVisibility.value = mergePageVisibility(null)
    dashboardVisibility.value = mergeDashboardVisibility(null)
  } finally {
    isLoading.value = false
  }
}

async function persist() {
  if (!props.userId || isSaving.value) return

  isSaving.value = true
  saveError.value = ''
  saveMessage.value = ''
  try {
    await savePageVisibility(supabase, props.userId, pageVisibility.value)
    saveMessage.value = 'Enregistré.'
    setTimeout(() => {
      saveMessage.value = ''
    }, 2500)
  } catch (err) {
    console.error(err)
    saveError.value = err.message || 'Erreur lors de la sauvegarde.'
  } finally {
    isSaving.value = false
  }
}

async function persistDashboard() {
  if (!props.userId || isSaving.value) return

  isSaving.value = true
  saveError.value = ''
  saveMessage.value = ''
  try {
    await saveDashboardVisibility(supabase, props.userId, dashboardVisibility.value)
    saveMessage.value = 'Enregistré.'
    setTimeout(() => {
      saveMessage.value = ''
    }, 2500)
  } catch (err) {
    console.error(err)
    saveError.value = err.message || 'Erreur lors de la sauvegarde.'
  } finally {
    isSaving.value = false
  }
}

async function onToggleDashboardVisible(widgetId, visible) {
  dashboardVisibility.value = {
    ...dashboardVisibility.value,
    [widgetId]: {
      ...dashboardVisibility.value[widgetId],
      visible,
    },
  }
  await persistDashboard()
}

async function applyLayout(nextLayout) {
  dashboardVisibility.value = {
    ...dashboardVisibility.value,
    layout: nextLayout,
  }
  await persistDashboard()
}

function onWidgetDragStart(widgetId, fromZone, event) {
  if (fromZone === 'mobile' && widgetId === DASHBOARD_WIDGET_IDS.COMFORT) {
    event.preventDefault()
    return
  }
  if (fromZone === 'mobile-group' && widgetId === DASHBOARD_WIDGET_IDS.COMFORT) {
    event.preventDefault()
    return
  }
  dragState.value = {
    widgetId,
    fromZone,
    overZone: fromZone,
    overWidgetId: widgetId,
    overGroupIndex: null,
  }
  try {
    event.dataTransfer?.setData(
      'text/plain',
      JSON.stringify({ widgetId, fromZone }),
    )
    event.dataTransfer.effectAllowed = 'move'
  } catch {
    /* ignore */
  }
}

function onWidgetDragOver(zone, widgetId, event) {
  if (!dragState.value.widgetId) return
  event.preventDefault()
  try {
    event.dataTransfer.dropEffect = 'move'
  } catch {
    /* ignore */
  }
  dragState.value = {
    ...dragState.value,
    overZone: zone,
    overWidgetId: widgetId ?? null,
    overGroupIndex: null,
  }
}

function onGroupDragOver(groupIndex, widgetId, event) {
  if (!dragState.value.widgetId) return
  event.preventDefault()
  try {
    event.dataTransfer.dropEffect = 'move'
  } catch {
    /* ignore */
  }
  dragState.value = {
    ...dragState.value,
    overZone: 'mobile-group',
    overWidgetId: widgetId ?? null,
    overGroupIndex: groupIndex,
  }
}

function onZoneDragOver(zone, event) {
  if (!dragState.value.widgetId) return
  event.preventDefault()
  try {
    event.dataTransfer.dropEffect = 'move'
  } catch {
    /* ignore */
  }
  if (dragState.value.overZone !== zone || dragState.value.overWidgetId) {
    dragState.value = {
      ...dragState.value,
      overZone: zone,
      overWidgetId: null,
      overGroupIndex: null,
    }
  }
}

function onWidgetDragEnd() {
  dragState.value = {
    widgetId: null,
    fromZone: null,
    overZone: null,
    overWidgetId: null,
    overGroupIndex: null,
  }
}

async function onDesktopDrop(targetZone, beforeWidgetId, event) {
  event.preventDefault()
  event.stopPropagation()

  let sourceId = dragState.value.widgetId
  if (!sourceId) {
    try {
      const raw = event.dataTransfer?.getData('text/plain')
      const parsed = raw ? JSON.parse(raw) : null
      sourceId = parsed?.widgetId ?? null
    } catch {
      sourceId = null
    }
  }

  onWidgetDragEnd()
  if (!sourceId || !Object.values(DASHBOARD_DESKTOP_ZONES).includes(targetZone)) return

  const nextLayout = moveDesktopWidget(
    dashboardLayout.value,
    sourceId,
    targetZone,
    beforeWidgetId,
  )
  await applyLayout(nextLayout)
}

async function onGroupDrop(targetGroupIndex, beforeWidgetId, event) {
  event.preventDefault()
  event.stopPropagation()

  let sourceId = dragState.value.widgetId
  if (!sourceId) {
    try {
      const raw = event.dataTransfer?.getData('text/plain')
      const parsed = raw ? JSON.parse(raw) : null
      sourceId = parsed?.widgetId ?? null
    } catch {
      sourceId = null
    }
  }

  onWidgetDragEnd()
  if (!sourceId || sourceId === DASHBOARD_WIDGET_IDS.COMFORT) return
  if (!Number.isInteger(targetGroupIndex) || targetGroupIndex < 0) return

  const nextLayout = moveMobileWidgetInGroups(
    dashboardLayout.value,
    sourceId,
    targetGroupIndex,
    beforeWidgetId,
  )
  await applyLayout(nextLayout)
}

async function onExtractToOwnPage(widgetId) {
  if (!widgetId || widgetId === DASHBOARD_WIDGET_IDS.COMFORT || isSaving.value) return
  const nextLayout = extractMobileWidgetToOwnGroup(dashboardLayout.value, widgetId)
  await applyLayout(nextLayout)
}

function groupWidgets(ids) {
  return orderedDashboardWidgets(ids)
}

function canExtractWidget(group, widgetId) {
  return group.length > 1 && widgetId !== DASHBOARD_WIDGET_IDS.COMFORT
}

function isDragging(widgetId) {
  return dragState.value.widgetId === widgetId
}

function isDropTarget(zone, widgetId) {
  return (
    Boolean(dragState.value.widgetId) &&
    dragState.value.widgetId !== widgetId &&
    dragState.value.overZone === zone &&
    dragState.value.overWidgetId === widgetId
  )
}

function isGroupDropTarget(groupIndex, widgetId = null) {
  return (
    Boolean(dragState.value.widgetId) &&
    dragState.value.overZone === 'mobile-group' &&
    dragState.value.overGroupIndex === groupIndex &&
    dragState.value.overWidgetId === widgetId
  )
}

function isZoneDropTarget(zone) {
  return (
    Boolean(dragState.value.widgetId) &&
    dragState.value.overZone === zone &&
    !dragState.value.overWidgetId
  )
}

async function onToggleVisible(pageId, visible) {
  pageVisibility.value = {
    ...pageVisibility.value,
    [pageId]: {
      ...pageVisibility.value[pageId],
      visible,
    },
  }
  await persist()
}

function startRename(page) {
  editingPageId.value = page.id
  editingLabel.value = page.displayLabel
}

function cancelRename() {
  editingPageId.value = null
  editingLabel.value = ''
}

async function confirmRename(pageId) {
  const trimmed = editingLabel.value.trim()
  const defaultPage = APP_MAIN_PAGES.find((p) => p.id === pageId)
  const label = !trimmed || trimmed === defaultPage?.defaultLabel ? null : trimmed

  pageVisibility.value = {
    ...pageVisibility.value,
    [pageId]: {
      ...pageVisibility.value[pageId],
      label,
    },
  }

  editingPageId.value = null
  editingLabel.value = ''
  await persist()
}

function onRenameKeydown(event, pageId) {
  if (event.key === 'Enter') {
    event.preventDefault()
    void confirmRename(pageId)
  } else if (event.key === 'Escape') {
    cancelRename()
  }
}

watch(
  () => props.userId,
  (id) => {
    if (id) void loadSettings()
  },
  { immediate: true },
)
</script>

<template>
  <section class="settings-card settings-card--collapsible">
      <button
        type="button"
        class="card-toggle"
        :aria-expanded="expandedSections[COLLAPSIBLE.PAGES]"
        aria-controls="settings-section-visibility-pages"
        @click="toggleSection(COLLAPSIBLE.PAGES)"
      >
        <h2 class="card-toggle__title">Pages</h2>
        <span
          class="card-toggle__chevron"
          :class="{ 'card-toggle__chevron--open': expandedSections[COLLAPSIBLE.PAGES] }"
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

      <div
        v-show="expandedSections[COLLAPSIBLE.PAGES]"
        id="settings-section-visibility-pages"
        class="card-body"
      >
        <p class="card-body__desc">
          Affiche ou masque les pages dans le menu, et renomme leur libellé si tu le souhaites.
        </p>

        <p v-if="isLoading" class="visibility-state">Chargement…</p>
        <p v-else-if="loadError" class="settings-feedback settings-feedback--error" role="alert">
          {{ loadError }}
        </p>

        <ul v-else class="visibility-pages-list" aria-label="Pages principales">
          <li v-for="page in pagesForList" :key="page.id" class="visibility-page-row">
            <label class="visibility-page-check" :title="page.visible ? 'Masquer la page' : 'Afficher la page'">
              <input
                type="checkbox"
                class="visibility-page-check__input"
                :checked="page.visible"
                :disabled="isSaving"
                :aria-label="`${page.visible ? 'Masquer' : 'Afficher'} ${page.displayLabel}`"
                @change="onToggleVisible(page.id, $event.target.checked)"
              />
            </label>

            <div class="visibility-page-main">
              <template v-if="editingPageId === page.id">
                <input
                  v-model="editingLabel"
                  type="text"
                  class="visibility-page-rename-input"
                  :aria-label="`Nouveau nom pour ${page.defaultLabel}`"
                  :disabled="isSaving"
                  @keydown="onRenameKeydown($event, page.id)"
                />
                <div class="visibility-page-rename-actions">
                  <button
                    type="button"
                    class="btn btn--ghost visibility-page-rename-btn"
                    :disabled="isSaving"
                    @click="confirmRename(page.id)"
                  >
                    OK
                  </button>
                  <button
                    type="button"
                    class="btn btn--ghost visibility-page-rename-btn"
                    :disabled="isSaving"
                    @click="cancelRename"
                  >
                    Annuler
                  </button>
                </div>
              </template>
              <template v-else>
                <span class="visibility-page-label">{{ page.displayLabel }}</span>
                <span
                  v-if="page.displayLabel !== page.defaultLabel"
                  class="visibility-page-default-hint"
                >
                  ({{ page.defaultLabel }})
                </span>
              </template>
            </div>

            <button
              v-if="editingPageId !== page.id"
              type="button"
              class="visibility-page-edit"
              :disabled="isSaving"
              :aria-label="`Renommer ${page.displayLabel}`"
              @click="startRename(page)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          </li>
        </ul>

        <p v-if="saveError" class="settings-feedback settings-feedback--error" role="alert">
          {{ saveError }}
        </p>
        <p v-if="saveMessage" class="settings-feedback settings-feedback--ok">{{ saveMessage }}</p>
      </div>
    </section>

    <section class="settings-card settings-card--spaced settings-card--collapsible">
      <button
        type="button"
        class="card-toggle"
        :aria-expanded="expandedSections[COLLAPSIBLE.DASHBOARD]"
        aria-controls="settings-section-visibility-dashboard"
        @click="toggleSection(COLLAPSIBLE.DASHBOARD)"
      >
        <h2 class="card-toggle__title">Dashboard</h2>
        <span
          class="card-toggle__chevron"
          :class="{ 'card-toggle__chevron--open': expandedSections[COLLAPSIBLE.DASHBOARD] }"
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

      <div
        v-show="expandedSections[COLLAPSIBLE.DASHBOARD]"
        id="settings-section-visibility-dashboard"
        class="card-body"
      >
        <p class="card-body__desc">
          Affiche ou masque chaque bloc, et glisse-les pour choisir leur place sur le tableau de
          bord (colonnes à gauche / droite, bandeaux centraux en haut ou en bas sur ordinateur ;
          ordre du carrousel sur téléphone).
        </p>

        <p v-if="isLoading" class="visibility-state">Chargement…</p>
        <p v-else-if="loadError" class="settings-feedback settings-feedback--error" role="alert">
          {{ loadError }}
        </p>

        <template v-else>
          <!-- Desktop : disposition miroir du dashboard -->
          <div class="dashboard-visibility-grid" aria-label="Blocs du dashboard (ordinateur)">
            <div
              class="dashboard-visibility-col dashboard-visibility-col--full"
              :class="{ 'dashboard-visibility-col--drop': isZoneDropTarget(DASHBOARD_DESKTOP_ZONES.TOP) }"
              @dragover="onZoneDragOver(DASHBOARD_DESKTOP_ZONES.TOP, $event)"
              @drop="onDesktopDrop(DASHBOARD_DESKTOP_ZONES.TOP, null, $event)"
            >
              <p class="dashboard-visibility-zone-label">Centre · haut</p>
              <ul class="visibility-pages-list">
                <DashboardVisibilityWidgetRow
                  v-for="widget in dashboardTopWidgets"
                  :key="`top-${widget.id}`"
                  :widget="widget"
                  :disabled="isSaving"
                  draggable
                  :dragging="isDragging(widget.id)"
                  :drop-target="isDropTarget(DASHBOARD_DESKTOP_ZONES.TOP, widget.id)"
                  @toggle="onToggleDashboardVisible"
                  @dragstart="onWidgetDragStart(widget.id, DASHBOARD_DESKTOP_ZONES.TOP, $event)"
                  @dragover="onWidgetDragOver(DASHBOARD_DESKTOP_ZONES.TOP, widget.id, $event)"
                  @drop="onDesktopDrop(DASHBOARD_DESKTOP_ZONES.TOP, widget.id, $event)"
                  @dragend="onWidgetDragEnd"
                />
                <li
                  v-if="!dashboardTopWidgets.length"
                  class="dashboard-visibility-empty"
                >
                  Dépose un bloc ici
                </li>
              </ul>
            </div>

            <div
              class="dashboard-visibility-col dashboard-visibility-col--left"
              :class="{ 'dashboard-visibility-col--drop': isZoneDropTarget(DASHBOARD_DESKTOP_ZONES.LEFT) }"
              @dragover="onZoneDragOver(DASHBOARD_DESKTOP_ZONES.LEFT, $event)"
              @drop="onDesktopDrop(DASHBOARD_DESKTOP_ZONES.LEFT, null, $event)"
            >
              <p class="dashboard-visibility-zone-label">Colonne gauche</p>
              <ul class="visibility-pages-list">
                <DashboardVisibilityWidgetRow
                  v-for="widget in dashboardLeftWidgets"
                  :key="`left-${widget.id}`"
                  :widget="widget"
                  :disabled="isSaving"
                  draggable
                  :dragging="isDragging(widget.id)"
                  :drop-target="isDropTarget(DASHBOARD_DESKTOP_ZONES.LEFT, widget.id)"
                  @toggle="onToggleDashboardVisible"
                  @dragstart="onWidgetDragStart(widget.id, DASHBOARD_DESKTOP_ZONES.LEFT, $event)"
                  @dragover="onWidgetDragOver(DASHBOARD_DESKTOP_ZONES.LEFT, widget.id, $event)"
                  @drop="onDesktopDrop(DASHBOARD_DESKTOP_ZONES.LEFT, widget.id, $event)"
                  @dragend="onWidgetDragEnd"
                />
                <li
                  v-if="!dashboardLeftWidgets.length"
                  class="dashboard-visibility-empty"
                >
                  Dépose un bloc ici
                </li>
              </ul>
            </div>

            <div
              class="dashboard-visibility-col dashboard-visibility-col--right"
              :class="{ 'dashboard-visibility-col--drop': isZoneDropTarget(DASHBOARD_DESKTOP_ZONES.RIGHT) }"
              @dragover="onZoneDragOver(DASHBOARD_DESKTOP_ZONES.RIGHT, $event)"
              @drop="onDesktopDrop(DASHBOARD_DESKTOP_ZONES.RIGHT, null, $event)"
            >
              <p class="dashboard-visibility-zone-label">Colonne droite</p>
              <ul class="visibility-pages-list">
                <DashboardVisibilityWidgetRow
                  v-for="widget in dashboardRightWidgets"
                  :key="`right-${widget.id}`"
                  :widget="widget"
                  :disabled="isSaving"
                  draggable
                  :dragging="isDragging(widget.id)"
                  :drop-target="isDropTarget(DASHBOARD_DESKTOP_ZONES.RIGHT, widget.id)"
                  @toggle="onToggleDashboardVisible"
                  @dragstart="onWidgetDragStart(widget.id, DASHBOARD_DESKTOP_ZONES.RIGHT, $event)"
                  @dragover="onWidgetDragOver(DASHBOARD_DESKTOP_ZONES.RIGHT, widget.id, $event)"
                  @drop="onDesktopDrop(DASHBOARD_DESKTOP_ZONES.RIGHT, widget.id, $event)"
                  @dragend="onWidgetDragEnd"
                />
                <li
                  v-if="!dashboardRightWidgets.length"
                  class="dashboard-visibility-empty"
                >
                  Dépose un bloc ici
                </li>
              </ul>
            </div>

            <div
              class="dashboard-visibility-col dashboard-visibility-col--full"
              :class="{ 'dashboard-visibility-col--drop': isZoneDropTarget(DASHBOARD_DESKTOP_ZONES.BOTTOM) }"
              @dragover="onZoneDragOver(DASHBOARD_DESKTOP_ZONES.BOTTOM, $event)"
              @drop="onDesktopDrop(DASHBOARD_DESKTOP_ZONES.BOTTOM, null, $event)"
            >
              <p class="dashboard-visibility-zone-label">Centre · bas</p>
              <ul class="visibility-pages-list">
                <DashboardVisibilityWidgetRow
                  v-for="widget in dashboardBottomWidgets"
                  :key="`bottom-${widget.id}`"
                  :widget="widget"
                  :disabled="isSaving"
                  draggable
                  :dragging="isDragging(widget.id)"
                  :drop-target="isDropTarget(DASHBOARD_DESKTOP_ZONES.BOTTOM, widget.id)"
                  @toggle="onToggleDashboardVisible"
                  @dragstart="onWidgetDragStart(widget.id, DASHBOARD_DESKTOP_ZONES.BOTTOM, $event)"
                  @dragover="onWidgetDragOver(DASHBOARD_DESKTOP_ZONES.BOTTOM, widget.id, $event)"
                  @drop="onDesktopDrop(DASHBOARD_DESKTOP_ZONES.BOTTOM, widget.id, $event)"
                  @dragend="onWidgetDragEnd"
                />
                <li
                  v-if="!dashboardBottomWidgets.length"
                  class="dashboard-visibility-empty"
                >
                  Dépose un bloc ici
                </li>
              </ul>
            </div>
          </div>

          <!-- Mobile (visible ≤768px via CSS) : groupes de pages du carrousel -->
          <div class="dashboard-visibility-mobile">
            <p class="dashboard-visibility-zone-label">Pages sur téléphone</p>
            <p class="dashboard-visibility-mobile-hint">
              Regroupe plusieurs blocs sur une même page en les glissant dans le même groupe.
              L’image de réconfort reste en tête de la première page.
            </p>

            <div
              v-for="(group, groupIndex) in dashboardMobileGroups"
              :key="`mobile-group-${groupIndex}`"
              class="dashboard-visibility-group"
              :class="{
                'dashboard-visibility-group--drop': isGroupDropTarget(groupIndex, null),
              }"
              @dragover="onGroupDragOver(groupIndex, null, $event)"
              @drop="onGroupDrop(groupIndex, null, $event)"
            >
              <p class="dashboard-visibility-group-label">Page {{ groupIndex + 1 }}</p>
              <div
                v-for="widget in groupWidgets(group)"
                :key="`mobile-group-${groupIndex}-${widget.id}`"
                class="dashboard-visibility-group-item"
              >
                <ul class="dashboard-visibility-group-item-list">
                  <DashboardVisibilityWidgetRow
                    :widget="widget"
                    :disabled="isSaving"
                    :draggable="widget.id !== DASHBOARD_WIDGET_IDS.COMFORT"
                    :dragging="isDragging(widget.id)"
                    :drop-target="isGroupDropTarget(groupIndex, widget.id)"
                    @toggle="onToggleDashboardVisible"
                    @dragstart="onWidgetDragStart(widget.id, 'mobile-group', $event)"
                    @dragover="onGroupDragOver(groupIndex, widget.id, $event)"
                    @drop="onGroupDrop(groupIndex, widget.id, $event)"
                    @dragend="onWidgetDragEnd"
                  />
                </ul>
                <button
                  v-if="canExtractWidget(group, widget.id)"
                  type="button"
                  class="dashboard-visibility-extract-btn"
                  :disabled="isSaving"
                  title="Mettre seul sur une nouvelle page"
                  @click="onExtractToOwnPage(widget.id)"
                >
                  Seul
                </button>
              </div>
            </div>

            <div
              class="dashboard-visibility-new-page"
              :class="{
                'dashboard-visibility-new-page--drop': isGroupDropTarget(
                  dashboardMobileGroups.length,
                  null,
                ),
              }"
              @dragover="onGroupDragOver(dashboardMobileGroups.length, null, $event)"
              @drop="onGroupDrop(dashboardMobileGroups.length, null, $event)"
            >
              Déposer ici pour une nouvelle page
            </div>
          </div>
        </template>

        <p v-if="saveError" class="settings-feedback settings-feedback--error" role="alert">
          {{ saveError }}
        </p>
        <p v-if="saveMessage" class="settings-feedback settings-feedback--ok">{{ saveMessage }}</p>
      </div>
    </section>
</template>

<style scoped>
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
  margin-top: 1.5rem;
}

.card-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
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
  border-top: 1px solid rgba(213, 181, 234, 0.2);
}

.card-body__desc {
  margin: 0 0 1.25rem;
  font-size: 0.9rem;
  color: #6c757d;
  line-height: 1.45;
}

.settings-feedback {
  margin: 1rem 0 0;
  font-size: 0.9rem;
  font-weight: 600;
}

.settings-feedback--error {
  color: #c0392b;
}

.settings-feedback--ok {
  color: #27ae60;
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

.btn--ghost:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.visibility-state {
  margin: 0;
  color: #8c98a4;
  font-weight: 600;
}

:deep(.visibility-pages-list) {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

:deep(.visibility-page-row) {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.55rem 0.65rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.25);
  background: rgba(255, 255, 255, 0.5);
}

:deep(.visibility-page-check) {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  cursor: pointer;
}

:deep(.visibility-page-check__input) {
  width: 1.1rem;
  height: 1.1rem;
  accent-color: #ad81be;
  cursor: pointer;
}

:deep(.visibility-page-main) {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.5rem;
}

:deep(.visibility-page-label) {
  font-size: 0.95rem;
  font-weight: 700;
  color: #2c3e50;
}

:deep(.visibility-page-default-hint) {
  font-size: 0.78rem;
  font-weight: 600;
  color: #95a5a6;
}

:deep(.visibility-page-rename-input) {
  flex: 1;
  min-width: 0;
  padding: 0.45rem 0.65rem;
  border: 1px solid rgba(213, 181, 234, 0.45);
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #2c3e50;
  background: rgba(255, 255, 255, 0.9);
}

:deep(.visibility-page-rename-input:focus) {
  outline: none;
  border-color: #ad81be;
  box-shadow: 0 0 0 3px rgba(173, 129, 190, 0.2);
}

:deep(.visibility-page-rename-actions) {
  display: flex;
  gap: 0.25rem;
}

:deep(.visibility-page-rename-btn) {
  padding: 0.35rem 0.55rem;
  font-size: 0.78rem;
}

:deep(.visibility-page-edit) {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #ad81be;
  cursor: pointer;
  transition: background 0.15s ease;
}

:deep(.visibility-page-edit svg) {
  width: 1rem;
  height: 1rem;
}

:deep(.visibility-page-edit:hover:not(:disabled)) {
  background: rgba(213, 181, 234, 0.2);
}

:deep(.visibility-page-edit:disabled) {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Dashboard visibility layout (miroir du dashboard) */
.dashboard-visibility-grid {
  display: none;
}

.dashboard-visibility-mobile {
  display: block;
}

.dashboard-visibility-mobile-hint {
  margin: 0 0 0.75rem;
  font-size: 0.82rem;
  line-height: 1.4;
  color: #6c757d;
}

.dashboard-visibility-group {
  margin-bottom: 0.75rem;
  padding: 0.55rem;
  border-radius: 14px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.4);
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}

.dashboard-visibility-group--drop {
  border-color: rgba(173, 129, 190, 0.55);
  background: rgba(213, 181, 234, 0.14);
}

.dashboard-visibility-group-label {
  margin: 0 0 0.4rem;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #ad81be;
}

.dashboard-visibility-group-item {
  display: flex;
  align-items: stretch;
  gap: 0.35rem;
  margin-bottom: 0.35rem;
}

.dashboard-visibility-group-item-list {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dashboard-visibility-extract-btn {
  flex-shrink: 0;
  align-self: center;
  padding: 0.35rem 0.5rem;
  border: none;
  border-radius: 8px;
  background: rgba(213, 181, 234, 0.22);
  color: #8c6a9e;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
}

.dashboard-visibility-extract-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.dashboard-visibility-new-page {
  margin-top: 0.25rem;
  padding: 0.85rem 0.75rem;
  border-radius: 14px;
  border: 1px dashed rgba(173, 129, 190, 0.45);
  background: rgba(213, 181, 234, 0.08);
  color: #8c98a4;
  font-size: 0.82rem;
  font-weight: 650;
  text-align: center;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
}

.dashboard-visibility-new-page--drop {
  border-color: rgba(173, 129, 190, 0.7);
  background: rgba(213, 181, 234, 0.2);
  color: #ad81be;
}

.dashboard-visibility-zone-label {
  margin: 0 0 0.45rem;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #ad81be;
}

.dashboard-visibility-empty {
  list-style: none;
  margin: 0;
  padding: 0.7rem 0.75rem;
  border-radius: 12px;
  border: 1px dashed rgba(173, 129, 190, 0.4);
  background: rgba(213, 181, 234, 0.08);
  color: #8c98a4;
  font-size: 0.82rem;
  font-weight: 600;
  text-align: center;
}

.dashboard-visibility-col {
  min-height: 3.5rem;
  padding: 0.55rem;
  border-radius: 14px;
  border: 1px solid transparent;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}

.dashboard-visibility-col--drop {
  border-color: rgba(173, 129, 190, 0.55);
  background: rgba(213, 181, 234, 0.12);
}

@media (min-width: 769px) {
  .dashboard-visibility-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem 1.25rem;
    align-items: start;
  }

  .dashboard-visibility-mobile {
    display: none;
  }

  .dashboard-visibility-col--full {
    grid-column: 1 / -1;
  }

  .dashboard-visibility-col :deep(.visibility-pages-list) {
    height: 100%;
  }
}

:deep(.dashboard-visibility-row) {
  width: 100%;
}

@media (prefers-color-scheme: dark) {
  .settings-card {
    background: rgba(25, 20, 35, 0.65);
    border-color: rgba(213, 181, 234, 0.15);
  }

  .card-body {
    border-top-color: rgba(213, 181, 234, 0.12);
  }

  .card-body__desc,
  .visibility-state,
  .dashboard-visibility-mobile-hint {
    color: #adb5bd;
  }

  .card-toggle__chevron {
    background: rgba(213, 181, 234, 0.1);
  }

  .card-toggle:hover .card-toggle__chevron {
    background: rgba(213, 181, 234, 0.2);
  }

  :deep(.visibility-page-row) {
    background: rgba(25, 20, 35, 0.5);
    border-color: rgba(213, 181, 234, 0.15);
  }

  :deep(.visibility-page-label) {
    color: #f0e8f8;
  }

  :deep(.visibility-page-rename-input) {
    color: #f0e8f8;
    background: rgba(25, 20, 35, 0.6);
    border-color: rgba(213, 181, 234, 0.25);
  }

  .dashboard-visibility-empty {
    border-color: rgba(213, 181, 234, 0.28);
    background: rgba(213, 181, 234, 0.06);
    color: #adb5bd;
  }

  .dashboard-visibility-group {
    background: rgba(25, 20, 35, 0.45);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .dashboard-visibility-new-page {
    border-color: rgba(213, 181, 234, 0.35);
    background: rgba(213, 181, 234, 0.06);
    color: #adb5bd;
  }

  .dashboard-visibility-col--drop {
    background: rgba(213, 181, 234, 0.1);
  }
}
</style>
