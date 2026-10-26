import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildNoteChartFence,
  createDefaultNoteChart,
  extractNoteCharts,
  normalizeNoteChartData,
  replaceNoteChartAt,
  buildBarChartGeometry,
  buildPieChartGeometry,
} from './noteCharts.js'

describe('createDefaultNoteChart', () => {
  it('crée un graphique barres avec une série', () => {
    const data = createDefaultNoteChart()
    assert.equal(data.type, 'bar')
    assert.equal(data.series.length, 1)
    assert.equal(data.labels.length, 4)
  })
})

describe('extractNoteCharts', () => {
  it('extrait les fences et laisse des placeholders', () => {
    const md =
      'Intro\n\n```chart\n{"version":1,"type":"line","title":"Test","labels":["A"],"series":[{"name":"S","values":[1],"color":"#ad81be"}]}\n```\n\nFin'
    const { text, charts } = extractNoteCharts(md)
    assert.equal(charts.length, 1)
    assert.equal(charts[0].type, 'line')
    assert.equal(charts[0].title, 'Test')
    assert.match(text, /notes-chart-widget/)
    assert.doesNotMatch(text, /```chart/)
  })
})

describe('replaceNoteChartAt', () => {
  it('met à jour le JSON de la fence', () => {
    const fence = buildNoteChartFence(createDefaultNoteChart())
    const md = `Hello\n\n${fence}\n`
    const next = normalizeNoteChartData(createDefaultNoteChart())
    next.title = 'Progression'
    next.type = 'pie'
    const result = replaceNoteChartAt(md, 0, next)
    assert.equal(result.changed, true)
    assert.match(result.content, /Progression/)
    assert.equal(extractNoteCharts(result.content).charts[0].type, 'pie')
  })
})

describe('geometry', () => {
  it('produit des barres et des parts de camembert', () => {
    const data = createDefaultNoteChart()
    const bar = buildBarChartGeometry(data)
    assert.ok(bar.bars.length > 0)
    const pie = buildPieChartGeometry(data)
    assert.equal(pie.slices.length, data.labels.length)
  })
})
