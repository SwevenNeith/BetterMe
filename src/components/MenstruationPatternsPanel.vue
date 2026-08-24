<script setup>
import { computed, watch } from 'vue'
import { useMenstruationAccordions } from '../composables/useMenstruationAccordions.js'
import {
  PATTERN_TYPE,
  SYMPTOM_LABELS,
  CLUSTER_LABELS,
  SYMPTOM_THRESHOLDS,
} from '../services/menstruationPatternThresholds.js'
import { getSymptomScale } from '../services/reconfortMatching.js'

const props = defineProps({
  patterns: {
    type: Array,
    default: () => [],
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  error: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['refresh'])

const activePatterns = computed(() =>
  (props.patterns ?? []).filter((p) => p.actif !== false),
)

function patternGroupKey(p) {
  if (p.type_pattern === PATTERN_TYPE.COMBINED) {
    return `${p.type_pattern}:${p.cluster ?? ''}`
  }
  if (
    p.type_pattern === PATTERN_TYPE.SIMPLE ||
    p.type_pattern === PATTERN_TYPE.INTENSITY ||
    p.type_pattern === PATTERN_TYPE.DURATION
  ) {
    return `${p.type_pattern}:${p.symptôme ?? ''}:${p.direction ?? ''}`
  }
  return p.id
}

function sortPatternsByWindow(patterns) {
  return [...patterns].sort((a, b) => {
    const aStart = a.jour_relatif_début ?? Number.MAX_SAFE_INTEGER
    const bStart = b.jour_relatif_début ?? Number.MAX_SAFE_INTEGER
    if (aStart !== bStart) return aStart - bStart
    const aEnd = a.jour_relatif_fin ?? aStart
    const bEnd = b.jour_relatif_fin ?? bStart
    return aEnd - bEnd
  })
}

function sortByTitle(groups) {
  return [...groups].sort((a, b) =>
    patternTitle(a.patterns[0]).localeCompare(patternTitle(b.patterns[0]), 'fr', {
      sensitivity: 'base',
    }),
  )
}

function buildGroups(list) {
  const map = new Map()
  for (const pattern of list) {
    const key = patternGroupKey(pattern)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(pattern)
  }
  return sortByTitle(
    [...map.entries()].map(([id, patterns]) => ({
      id,
      patterns: sortPatternsByWindow(patterns),
    })),
  )
}

function patternTitle(p) {
  if (p.type_pattern === PATTERN_TYPE.COMBINED) {
    return CLUSTER_LABELS[p.cluster] ?? p.cluster ?? 'Cluster'
  }
  return SYMPTOM_LABELS[p.symptôme] ?? p.symptôme ?? 'Symptôme'
}

function formatRelativeWindow(p) {
  if (p.jour_relatif_début == null || p.jour_relatif_fin == null) return ''
  if (p.jour_relatif_début === p.jour_relatif_fin) {
    return `le J-${p.jour_relatif_début}`
  }
  return `entre le J-${p.jour_relatif_début} et le J-${p.jour_relatif_fin}`
}

function joinWindows(windows) {
  if (!windows.length) return ''
  if (windows.length === 1) return `${windows[0]} du cycle`
  const head = windows.slice(0, -1).join(', ')
  return `${head} et ${windows[windows.length - 1]} du cycle`
}

function formatThresholdRelation(symptomKey) {
  const rule = SYMPTOM_THRESHOLDS[symptomKey]
  if (!rule) return 'au-delà du seuil habituel'
  if (rule.kind === 'bool') return 'présent'
  const scale = getSymptomScale(symptomKey)
  const fraction = scale?.max != null ? `${rule.value}/${scale.max}` : String(rule.value)
  if (rule.kind === 'gte') return `supérieur ou égal à ${fraction}`
  if (rule.kind === 'lte') return `inférieur ou égal à ${fraction}`
  return 'au-delà du seuil habituel'
}

function formatDays(value) {
  if (value == null || Number.isNaN(Number(value))) return ''
  return `${Math.round(Number(value))} j`
}

function formatScaleValue(value, symptomKey) {
  if (value == null || Number.isNaN(Number(value))) return ''
  const n = Number(value)
  const shown = Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',')
  const scale = getSymptomScale(symptomKey)
  return scale?.max != null ? `${shown}/${scale.max}` : shown
}

function formatPatternStats(patterns) {
  const first = patterns[0]
  const ratio = Math.round((first.ratio_répétition ?? 0) * 100)
  const cycles = `${first.cycles_détectés}/${first.cycles_total} cycles`
  return `${ratio} %, ${cycles}`
}

function patternDescription(patterns) {
  const list = Array.isArray(patterns) ? patterns : [patterns]
  const p = list[0]
  const stats = formatPatternStats(list)
  const title = patternTitle(p)

  if (p.type_pattern === PATTERN_TYPE.SIMPLE) {
    const windows = list.map(formatRelativeWindow).filter(Boolean)
    const windowPart = windows.length ? ` ${joinWindows(windows)}` : ''
    const relation = formatThresholdRelation(p.symptôme)
    return `${title} est souvent ${relation}${windowPart} (${stats}).`
  }

  if (p.type_pattern === PATTERN_TYPE.INTENSITY) {
    const relation = formatThresholdRelation(p.symptôme)
    const dir = p.direction === 'hausse' ? 'plus intense' : 'moins intense'
    const current = formatScaleValue(p.intensité_moyenne, p.symptôme)
    const baseline = formatScaleValue(p.durée_moyenne, p.symptôme)
    if (current && baseline) {
      return `${title} est souvent ${relation}, ${dir} que d’habitude sur ce cycle (${current} contre ~${baseline} d’habitude).`
    }
    if (current) {
      return `${title} est souvent ${relation}, ${dir} que d’habitude sur ce cycle (${current}).`
    }
    return `${title} est souvent ${relation}, ${dir} que d’habitude sur ce cycle.`
  }

  if (p.type_pattern === PATTERN_TYPE.DURATION) {
    const relation = formatThresholdRelation(p.symptôme)
    const longer = p.direction === 'hausse'
    const dir = longer ? 'plus longtemps' : 'moins longtemps'
    const currentDays = formatDays(p.durée_moyenne)
    const baselineDays = formatDays(p.intensité_moyenne)
    if (currentDays && baselineDays) {
      const delta = Math.abs(
        Math.round(Number(p.durée_moyenne)) - Math.round(Number(p.intensité_moyenne)),
      )
      return `${title} est souvent ${relation} ${dir} que d’habitude (${currentDays}, soit ${delta} j de ${longer ? 'plus' : 'moins'} que ~${baselineDays}).`
    }
    if (currentDays) {
      return `${title} est souvent ${relation} ${dir} que d’habitude (${currentDays}).`
    }
    return `${title} est souvent ${relation} ${dir} que d’habitude.`
  }

  if (p.type_pattern === PATTERN_TYPE.COMBINED) {
    const windows = list.map(formatRelativeWindow).filter(Boolean)
    const windowPart = windows.length ? ` ${joinWindows(windows)}` : ''
    return `Plusieurs symptômes apparaissent ensemble${windowPart} (${stats}).`
  }

  const ratio = Math.round((p.ratio_répétition ?? 0) * 100)
  const cycles = `${p.cycles_détectés}/${p.cycles_total} cycles`
  return `${ratio} % · ${cycles}`
}

function splitByDirection(groups) {
  const hausse = []
  const baisse = []
  const other = []
  for (const group of groups) {
    const dir = group.patterns[0]?.direction
    if (dir === 'hausse') hausse.push(group)
    else if (dir === 'baisse') baisse.push(group)
    else other.push(group)
  }
  return { hausse, baisse, other }
}

const categorySections = computed(() => {
  const byType = {
    [PATTERN_TYPE.SIMPLE]: [],
    [PATTERN_TYPE.COMBINED]: [],
    [PATTERN_TYPE.DURATION]: [],
    [PATTERN_TYPE.INTENSITY]: [],
  }

  for (const pattern of activePatterns.value) {
    const bucket = byType[pattern.type_pattern]
    if (bucket) bucket.push(pattern)
  }

  const sections = []

  const recurrence = buildGroups(byType[PATTERN_TYPE.SIMPLE])
  if (recurrence.length) {
    sections.push({
      id: 'recurrence',
      title: 'Récurrence',
      hint: 'Symptômes qui reviennent souvent aux mêmes moments du cycle.',
      kind: 'flat',
      groups: recurrence,
      count: recurrence.length,
    })
  }

  const clusters = buildGroups(byType[PATTERN_TYPE.COMBINED])
  if (clusters.length) {
    sections.push({
      id: 'cluster',
      title: 'Clusters',
      hint: 'Plusieurs symptômes qui apparaissent ensemble.',
      kind: 'flat',
      groups: clusters,
      count: clusters.length,
    })
  }

  const durationGroups = buildGroups(byType[PATTERN_TYPE.DURATION])
  if (durationGroups.length) {
    const { hausse, baisse, other } = splitByDirection(durationGroups)
    const subgroups = []
    if (hausse.length) {
      subgroups.push({
        id: 'duration-up',
        title: 'Plus longtemps que d’habitude',
        tone: 'up',
        groups: hausse,
      })
    }
    if (baisse.length) {
      subgroups.push({
        id: 'duration-down',
        title: 'Moins longtemps que d’habitude',
        tone: 'down',
        groups: baisse,
      })
    }
    if (other.length) {
      subgroups.push({
        id: 'duration-other',
        title: 'Autres',
        tone: 'neutral',
        groups: other,
      })
    }
    sections.push({
      id: 'duration',
      title: 'Durée',
      hint: 'Symptômes qui durent plus ou moins longtemps que d’habitude.',
      kind: 'split',
      subgroups,
      count: durationGroups.length,
    })
  }

  const intensityGroups = buildGroups(byType[PATTERN_TYPE.INTENSITY])
  if (intensityGroups.length) {
    const { hausse, baisse, other } = splitByDirection(intensityGroups)
    const subgroups = []
    if (hausse.length) {
      subgroups.push({
        id: 'intensity-up',
        title: 'Plus intense que d’habitude',
        tone: 'up',
        groups: hausse,
      })
    }
    if (baisse.length) {
      subgroups.push({
        id: 'intensity-down',
        title: 'Moins intense que d’habitude',
        tone: 'down',
        groups: baisse,
      })
    }
    if (other.length) {
      subgroups.push({
        id: 'intensity-other',
        title: 'Autres',
        tone: 'neutral',
        groups: other,
      })
    }
    sections.push({
      id: 'intensity',
      title: 'Intensité',
      hint: 'Écarts d’intensité par rapport à ta moyenne habituelle.',
      kind: 'split',
      subgroups,
      count: intensityGroups.length,
    })
  }

  return sections
})

const { isOpen: isAccordionOpen, toggle, ensureDefaults } = useMenstruationAccordions()

watch(
  categorySections,
  (sections) => {
    if (sections.some((section) => section.id === 'recurrence')) {
      ensureDefaults({ hasRecurrence: true })
    }
  },
  { immediate: true },
)

function isSectionOpen(id) {
  return isAccordionOpen('pattern', id)
}

function toggleSection(id) {
  toggle('pattern', id)
}
</script>

<template>
  <section class="patterns-panel" aria-labelledby="patterns-panel-title">
    <header class="patterns-panel__head">
      <div class="patterns-panel__head-text">
        <h3 id="patterns-panel-title" class="patterns-panel__title">Tes tendances</h3>
        <p class="patterns-panel__hint">
          Patterns détectés à partir de tes saisies (répétition sur plusieurs cycles).
        </p>
      </div>
      <button type="button" class="patterns-panel__refresh" :disabled="isLoading" @click="emit('refresh')">
        Actualiser
      </button>
    </header>

    <p v-if="error" class="patterns-panel__error">{{ error }}</p>
    <p v-else-if="isLoading" class="patterns-panel__loading">Analyse en cours…</p>
    <p v-else-if="!activePatterns.length" class="patterns-panel__empty">
      Pas encore assez de données pour dégager des tendances (au moins 2 cycles avec symptômes).
    </p>

    <div v-else class="patterns-panel__sections">
      <section
        v-for="section in categorySections"
        :key="section.id"
        class="patterns-accordion"
        :class="{ 'patterns-accordion--open': isSectionOpen(section.id) }"
      >
        <button
          type="button"
          class="patterns-accordion__toggle"
          :aria-expanded="isSectionOpen(section.id)"
          :aria-controls="`patterns-section-${section.id}`"
          @click="toggleSection(section.id)"
        >
          <span class="patterns-accordion__toggle-main">
            <span class="patterns-accordion__chevron" aria-hidden="true">›</span>
            <span class="patterns-accordion__title">{{ section.title }}</span>
            <span class="patterns-accordion__count">{{ section.count }}</span>
          </span>
          <span class="patterns-accordion__hint">{{ section.hint }}</span>
        </button>

        <div
          v-show="isSectionOpen(section.id)"
          :id="`patterns-section-${section.id}`"
          class="patterns-accordion__body"
        >
          <template v-if="section.kind === 'flat'">
            <ul class="patterns-panel__list">
              <li v-for="group in section.groups" :key="group.id" class="patterns-panel__item">
                <strong class="patterns-panel__item-title">{{ patternTitle(group.patterns[0]) }}</strong>
                <p class="patterns-panel__item-desc">{{ patternDescription(group.patterns) }}</p>
              </li>
            </ul>
          </template>

          <template v-else>
            <div
              v-for="subgroup in section.subgroups"
              :key="subgroup.id"
              class="patterns-subgroup"
              :class="`patterns-subgroup--${subgroup.tone}`"
            >
              <h4 class="patterns-subgroup__title">{{ subgroup.title }}</h4>
              <ul class="patterns-panel__list">
                <li v-for="group in subgroup.groups" :key="group.id" class="patterns-panel__item">
                  <strong class="patterns-panel__item-title">{{ patternTitle(group.patterns[0]) }}</strong>
                  <p class="patterns-panel__item-desc">{{ patternDescription(group.patterns) }}</p>
                </li>
              </ul>
            </div>
          </template>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.patterns-panel {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(213, 181, 234, 0.35);
}

.patterns-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.85rem;
  margin-bottom: 1rem;
}

.patterns-panel__title {
  margin: 0 0 0.35rem;
  font-size: 1.1rem;
  font-weight: 800;
  color: #ad81be;
}

.patterns-panel__hint,
.patterns-panel__empty,
.patterns-panel__loading,
.patterns-panel__error {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.45;
  color: #6c757d;
}

.patterns-panel__empty,
.patterns-panel__loading,
.patterns-panel__error {
  margin-bottom: 0.75rem;
}

.patterns-panel__error {
  color: #c0392b;
}

.patterns-panel__refresh {
  flex-shrink: 0;
  padding: 0.45rem 0.85rem;
  border: 1px solid rgba(173, 129, 190, 0.5);
  border-radius: 10px;
  background: transparent;
  color: #ad81be;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}

.patterns-panel__refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.patterns-panel__sections {
  display: grid;
  gap: 0.65rem;
}

.patterns-accordion {
  border-radius: 14px;
  border: 1px solid rgba(173, 129, 190, 0.28);
  background: rgba(255, 255, 255, 0.55);
  overflow: hidden;
}

.patterns-accordion--open {
  border-color: rgba(173, 129, 190, 0.42);
  background: rgba(213, 181, 234, 0.1);
}

.patterns-accordion__toggle {
  width: 100%;
  display: grid;
  gap: 0.2rem;
  padding: 0.8rem 0.95rem;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: inherit;
}

.patterns-accordion__toggle-main {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.patterns-accordion__chevron {
  display: inline-flex;
  width: 1rem;
  color: #ad81be;
  font-size: 1.1rem;
  font-weight: 700;
  transform: rotate(0deg);
  transition: transform 0.15s ease;
}

.patterns-accordion--open .patterns-accordion__chevron {
  transform: rotate(90deg);
}

.patterns-accordion__title {
  font-size: 0.95rem;
  font-weight: 800;
  color: #6b4f7c;
}

.patterns-accordion__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.35rem;
  height: 1.35rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: rgba(173, 129, 190, 0.22);
  color: #6b4f7c;
  font-size: 0.72rem;
  font-weight: 800;
}

.patterns-accordion__hint {
  padding-left: 1.45rem;
  font-size: 0.78rem;
  color: #8b7a96;
  line-height: 1.35;
}

.patterns-accordion__body {
  padding: 0 0.85rem 0.85rem;
}

.patterns-subgroup + .patterns-subgroup {
  margin-top: 0.75rem;
}

.patterns-subgroup__title {
  margin: 0 0 0.45rem;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #8b7a96;
}

.patterns-subgroup--up .patterns-subgroup__title {
  color: #9a5f78;
}

.patterns-subgroup--down .patterns-subgroup__title {
  color: #5f7a8a;
}

.patterns-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.patterns-panel__item {
  padding: 0.7rem 0.8rem;
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(173, 129, 190, 0.2);
}

.patterns-subgroup--up .patterns-panel__item {
  border-color: rgba(173, 129, 190, 0.28);
  background: linear-gradient(135deg, rgba(213, 181, 234, 0.18), rgba(255, 255, 255, 0.82));
}

.patterns-subgroup--down .patterns-panel__item {
  border-color: rgba(114, 160, 152, 0.28);
  background: linear-gradient(135deg, rgba(114, 160, 152, 0.12), rgba(255, 255, 255, 0.82));
}

.patterns-panel__item-title {
  display: block;
  margin: 0 0 0.25rem;
  font-size: 0.92rem;
  color: #2c3e50;
}

.patterns-panel__item-desc {
  margin: 0;
  font-size: 0.84rem;
  color: #5a6268;
  line-height: 1.45;
}

@media (prefers-color-scheme: dark) {
  .patterns-panel {
    border-top-color: rgba(213, 181, 234, 0.2);
  }

  .patterns-panel__hint,
  .patterns-panel__empty,
  .patterns-panel__loading,
  .patterns-accordion__hint {
    color: #adb5bd;
  }

  .patterns-accordion {
    background: rgba(40, 32, 52, 0.55);
    border-color: rgba(213, 181, 234, 0.22);
  }

  .patterns-accordion--open {
    background: rgba(61, 47, 74, 0.55);
  }

  .patterns-accordion__title,
  .patterns-accordion__count {
    color: #e8dcf5;
  }

  .patterns-accordion__count {
    background: rgba(173, 129, 190, 0.28);
  }

  .patterns-panel__item {
    background: rgba(42, 36, 56, 0.85);
    border-color: rgba(213, 181, 234, 0.18);
  }

  .patterns-subgroup--up .patterns-panel__item {
    background: linear-gradient(135deg, rgba(173, 129, 190, 0.22), rgba(42, 36, 56, 0.9));
  }

  .patterns-subgroup--down .patterns-panel__item {
    background: linear-gradient(135deg, rgba(114, 160, 152, 0.18), rgba(42, 36, 56, 0.9));
  }

  .patterns-panel__item-title {
    color: #f0e8f8;
  }

  .patterns-panel__item-desc {
    color: #c8c0d0;
  }

  .patterns-subgroup__title {
    color: #c5b8d2;
  }
}
</style>
