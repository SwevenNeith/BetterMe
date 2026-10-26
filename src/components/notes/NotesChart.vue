<script setup>
import { computed } from 'vue'
import {
  buildBarChartGeometry,
  buildLineChartGeometry,
  buildPieChartGeometry,
  normalizeChartColor,
  normalizeNoteChartData,
} from '../../utils/notes/noteCharts.js'

defineOptions({ name: 'NotesChart' })

const props = defineProps({
  modelValue: { type: Object, required: true },
  readonly: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const chart = computed(() => normalizeNoteChartData(props.modelValue))

const bar = computed(() =>
  chart.value.type === 'bar' ? buildBarChartGeometry(chart.value) : null,
)
const line = computed(() =>
  chart.value.type === 'line' ? buildLineChartGeometry(chart.value) : null,
)
const pie = computed(() =>
  chart.value.type === 'pie' ? buildPieChartGeometry(chart.value) : null,
)

function patch(partial) {
  if (props.readonly) return
  emit('update:modelValue', normalizeNoteChartData({ ...chart.value, ...partial }))
}

function setType(type) {
  patch({ type })
}

function setTitle(event) {
  patch({ title: event.target.value })
}

function setLabel(index, event) {
  const labels = [...chart.value.labels]
  labels[index] = event.target.value
  patch({ labels })
}

function setSeriesName(si, event) {
  const series = chart.value.series.map((s, i) =>
    i === si ? { ...s, name: event.target.value } : s,
  )
  patch({ series })
}

function setSeriesColor(si, event) {
  const series = chart.value.series.map((s, i) =>
    i === si ? { ...s, color: normalizeChartColor(event.target.value, i) } : s,
  )
  patch({ series })
}

function setCell(si, li, event) {
  const raw = event.target.value
  const n = Number(String(raw).replace(',', '.'))
  const series = chart.value.series.map((s, i) => {
    if (i !== si) return s
    const values = [...s.values]
    values[li] = Number.isFinite(n) ? n : 0
    return { ...s, values }
  })
  patch({ series })
}

function addCategory() {
  const labels = [...chart.value.labels, `Cat. ${chart.value.labels.length + 1}`]
  const series = chart.value.series.map((s) => ({
    ...s,
    values: [...s.values, 0],
  }))
  patch({ labels, series })
}

function removeCategory() {
  if (chart.value.labels.length <= 1) return
  const labels = chart.value.labels.slice(0, -1)
  const series = chart.value.series.map((s) => ({
    ...s,
    values: s.values.slice(0, labels.length),
  }))
  patch({ labels, series })
}

function addSeries() {
  if (chart.value.series.length >= 8) return
  const index = chart.value.series.length
  patch({
    series: [
      ...chart.value.series,
      {
        name: `Série ${index + 1}`,
        values: chart.value.labels.map(() => 0),
        color: normalizeChartColor(null, index),
      },
    ],
  })
}

function removeSeries() {
  if (chart.value.series.length <= 1) return
  patch({ series: chart.value.series.slice(0, -1) })
}
</script>

<template>
  <figure class="notes-chart" :class="{ 'notes-chart--readonly': readonly }">
    <figcaption v-if="readonly" class="notes-chart__title">{{ chart.title }}</figcaption>
    <input
      v-else
      class="notes-chart__title-input"
      type="text"
      :value="chart.title"
      maxlength="80"
      aria-label="Titre du graphique"
      @change="setTitle"
    />

    <div v-if="!readonly" class="notes-chart__types" role="group" aria-label="Type de graphique">
      <button
        type="button"
        class="notes-chart__type"
        :class="{ 'notes-chart__type--on': chart.type === 'bar' }"
        @click="setType('bar')"
      >
        Barres
      </button>
      <button
        type="button"
        class="notes-chart__type"
        :class="{ 'notes-chart__type--on': chart.type === 'line' }"
        @click="setType('line')"
      >
        Courbes
      </button>
      <button
        type="button"
        class="notes-chart__type"
        :class="{ 'notes-chart__type--on': chart.type === 'pie' }"
        @click="setType('pie')"
      >
        Camembert
      </button>
    </div>

    <svg
      v-if="bar"
      class="notes-chart__svg"
      :viewBox="`0 0 ${bar.width} ${bar.height}`"
      role="img"
      :aria-label="chart.title"
    >
      <line
        :x1="bar.padL"
        :y1="bar.padT + bar.innerH"
        :x2="bar.width - 12"
        :y2="bar.padT + bar.innerH"
        class="notes-chart__axis"
      />
      <rect
        v-for="(b, i) in bar.bars"
        :key="`b-${i}`"
        :x="b.x"
        :y="b.y"
        :width="b.w"
        :height="Math.max(0, b.h)"
        :fill="b.color"
        rx="2"
      >
        <title>{{ b.seriesName }} · {{ b.label }} : {{ b.value }}</title>
      </rect>
      <text
        v-for="(lp, i) in bar.labelPoints"
        :key="`bl-${i}`"
        :x="lp.x"
        :y="lp.y"
        class="notes-chart__label"
        text-anchor="middle"
      >
        {{ lp.text }}
      </text>
    </svg>

    <svg
      v-else-if="line"
      class="notes-chart__svg"
      :viewBox="`0 0 ${line.width} ${line.height}`"
      role="img"
      :aria-label="chart.title"
    >
      <path
        v-for="(s, i) in line.seriesPaths"
        :key="`lp-${i}`"
        :d="s.path"
        fill="none"
        :stroke="s.color"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <template v-for="(s, si) in line.seriesPaths" :key="`ld-${si}`">
        <circle
          v-for="(p, pi) in s.points"
          :key="`ld-${si}-${pi}`"
          :cx="p.x"
          :cy="p.y"
          r="3.2"
          :fill="s.color"
        >
          <title>{{ s.name }} : {{ p.value }}</title>
        </circle>
      </template>
      <text
        v-for="(lp, i) in line.labelPoints"
        :key="`ll-${i}`"
        :x="lp.x"
        :y="lp.y"
        class="notes-chart__label"
        text-anchor="middle"
      >
        {{ lp.text }}
      </text>
    </svg>

    <div v-else-if="pie" class="notes-chart__pie-wrap">
      <svg
        class="notes-chart__svg notes-chart__svg--pie"
        :viewBox="`0 0 ${pie.size} ${pie.size}`"
        role="img"
        :aria-label="chart.title"
      >
        <path
          v-for="(slice, i) in pie.slices"
          :key="`p-${i}`"
          v-show="slice.path"
          :d="slice.path"
          :fill="slice.color"
        >
          <title>{{ slice.label }} : {{ slice.value }} ({{ slice.percent.toFixed(0) }}%)</title>
        </path>
      </svg>
      <ul class="notes-chart__legend">
        <li v-for="(slice, i) in pie.slices" :key="`pl-${i}`">
          <span class="notes-chart__swatch" :style="{ background: slice.color }" />
          {{ slice.label }} · {{ slice.percent.toFixed(0) }}%
        </li>
      </ul>
    </div>

    <ul v-if="chart.type !== 'pie' && chart.series.length" class="notes-chart__legend">
      <li v-for="(s, i) in chart.series" :key="`leg-${i}`">
        <span class="notes-chart__swatch" :style="{ background: s.color }" />
        {{ s.name }}
      </li>
    </ul>

    <div v-if="!readonly" class="notes-chart__grid-wrap">
      <table class="notes-chart__grid">
        <thead>
          <tr>
            <th scope="col">Série</th>
            <th v-for="(label, li) in chart.labels" :key="`th-${li}`" scope="col">
              <input
                class="notes-chart__cell notes-chart__cell--head"
                type="text"
                :value="label"
                maxlength="40"
                :aria-label="`Catégorie ${li + 1}`"
                @change="setLabel(li, $event)"
              />
            </th>
            <th v-if="chart.type !== 'pie'" scope="col" class="notes-chart__th-color">Couleur</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(s, si) in chart.series" :key="`row-${si}`">
            <th scope="row">
              <input
                class="notes-chart__cell notes-chart__cell--head"
                type="text"
                :value="s.name"
                maxlength="60"
                :aria-label="`Nom série ${si + 1}`"
                @change="setSeriesName(si, $event)"
              />
            </th>
            <td v-for="(val, li) in s.values.slice(0, chart.labels.length)" :key="`c-${si}-${li}`">
              <input
                class="notes-chart__cell"
                type="number"
                step="any"
                :value="val"
                :aria-label="`${s.name} · ${chart.labels[li]}`"
                @change="setCell(si, li, $event)"
              />
            </td>
            <td v-if="chart.type !== 'pie'" class="notes-chart__td-color">
              <input
                type="color"
                class="notes-chart__color"
                :value="s.color"
                :aria-label="`Couleur ${s.name}`"
                @input="setSeriesColor(si, $event)"
              />
            </td>
          </tr>
        </tbody>
      </table>
      <div class="notes-chart__grid-actions">
        <button type="button" class="notes-chart__mini" @click="addCategory">+ Catégorie</button>
        <button
          type="button"
          class="notes-chart__mini"
          :disabled="chart.labels.length <= 1"
          @click="removeCategory"
        >
          − Catégorie
        </button>
        <button
          v-if="chart.type !== 'pie'"
          type="button"
          class="notes-chart__mini"
          :disabled="chart.series.length >= 8"
          @click="addSeries"
        >
          + Série
        </button>
        <button
          v-if="chart.type !== 'pie'"
          type="button"
          class="notes-chart__mini"
          :disabled="chart.series.length <= 1"
          @click="removeSeries"
        >
          − Série
        </button>
      </div>
      <p class="notes-chart__hint">Camembert : utilise la 1ʳᵉ série. Les données sont sauvegardées dans le Markdown.</p>
    </div>
  </figure>
</template>

<style scoped>
.notes-chart {
  margin: 0.75rem 0;
  padding: 0.85rem 0.9rem;
  border-radius: 14px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.55);
}

.notes-chart__title {
  margin: 0 0 0.45rem;
  font-weight: 800;
  font-size: 0.98rem;
  color: #2c3e50;
}

.notes-chart__title-input {
  display: block;
  width: 100%;
  max-width: 28rem;
  margin: 0 0 0.45rem;
  border: 1px solid rgba(213, 181, 234, 0.45);
  border-radius: 8px;
  padding: 0.35rem 0.55rem;
  font: inherit;
  font-weight: 800;
  font-size: 0.98rem;
  color: #2c3e50;
  background: rgba(255, 255, 255, 0.85);
  box-sizing: border-box;
}

.notes-chart__types {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.55rem;
}

.notes-chart__type {
  border: 1px solid rgba(213, 181, 234, 0.4);
  background: rgba(255, 255, 255, 0.7);
  border-radius: 999px;
  padding: 0.25rem 0.65rem;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  color: #5e4a6c;
}

.notes-chart__type--on {
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  border-color: transparent;
  color: #fff;
}

.notes-chart__svg {
  width: 100%;
  max-width: 480px;
  height: auto;
  display: block;
}

.notes-chart__axis {
  stroke: rgba(90, 74, 102, 0.35);
  stroke-width: 1;
}

.notes-chart__label {
  fill: #6c757d;
  font-size: 10px;
  font-weight: 650;
}

.notes-chart__pie-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  align-items: center;
}

.notes-chart__svg--pie {
  max-width: 200px;
}

.notes-chart__legend {
  list-style: none;
  margin: 0.55rem 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem 0.85rem;
  font-size: 0.8rem;
  font-weight: 650;
  color: #5a4a66;
}

.notes-chart__swatch {
  display: inline-block;
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 3px;
  margin-right: 0.3rem;
  vertical-align: -0.05rem;
}

.notes-chart__grid-wrap {
  margin-top: 0.75rem;
  overflow-x: auto;
}

.notes-chart__grid {
  border-collapse: collapse;
  font-size: 0.78rem;
  min-width: 100%;
}

.notes-chart__grid th,
.notes-chart__grid td {
  border: 1px solid rgba(213, 181, 234, 0.4);
  padding: 0.15rem;
  background: rgba(255, 255, 255, 0.65);
}

.notes-chart__cell {
  width: 4.2rem;
  max-width: 6rem;
  border: none;
  background: transparent;
  font: inherit;
  padding: 0.3rem 0.35rem;
  text-align: center;
  box-sizing: border-box;
}

.notes-chart__cell--head {
  width: 5.5rem;
  font-weight: 700;
  text-align: left;
}

.notes-chart__th-color,
.notes-chart__td-color {
  width: 2.4rem;
  text-align: center;
}

.notes-chart__color {
  width: 1.6rem;
  height: 1.4rem;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.notes-chart__grid-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.45rem;
}

.notes-chart__mini {
  border: 1px solid rgba(213, 181, 234, 0.4);
  background: rgba(255, 255, 255, 0.75);
  border-radius: 999px;
  padding: 0.22rem 0.6rem;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  color: #5e4a6c;
}

.notes-chart__mini:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.notes-chart__hint {
  margin: 0.4rem 0 0;
  font-size: 0.72rem;
  color: #7a6a88;
}

@media (prefers-color-scheme: dark) {
  .notes-chart {
    background: rgba(35, 30, 48, 0.75);
    border-color: rgba(213, 181, 234, 0.22);
  }
  .notes-chart__title,
  .notes-chart__title-input {
    color: #f0e8f8;
  }
  .notes-chart__title-input {
    background: #2a2438;
    border-color: rgba(213, 181, 234, 0.3);
  }
  .notes-chart__label {
    fill: #c9b8d8;
  }
  .notes-chart__legend,
  .notes-chart__hint {
    color: #c9b8d8;
  }
  .notes-chart__type:not(.notes-chart__type--on),
  .notes-chart__mini {
    background: #2a2438;
    color: #e9d5f5;
  }
  .notes-chart__grid th,
  .notes-chart__grid td {
    background: rgba(42, 36, 56, 0.85);
    border-color: rgba(213, 181, 234, 0.25);
  }
  .notes-chart__cell {
    color: #f0e8f8;
  }
}
</style>
