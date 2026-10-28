import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  batteryStartBucket,
  completionRatePercent,
  entryDrainCost,
  sumEntryDrainCosts,
} from './batteryMath.js'
import {
  buildRealizationInsights,
  formatCompletionRate,
} from './batteryInsights.js'
import { resolvePlanReviewDayIso } from '../../services/battery/batteryDays.js'

describe('completionRatePercent', () => {
  it('renvoie null sans plan (dépense)', () => {
    assert.equal(completionRatePercent([]), null)
    assert.equal(
      completionRatePercent([{ kind: 'planned', cost: -1, completed_actual_id: null }]),
      null,
    )
  })

  it('calcule fait ÷ prévu en %', () => {
    const entries = [
      { kind: 'planned', cost: 4, completed_actual_id: 'a1' },
      { kind: 'planned', cost: 6, completed_actual_id: null },
      { kind: 'actual', cost: 4 },
    ]
    assert.equal(completionRatePercent(entries), 40)
  })
})

describe('entryDrainCost / buckets', () => {
  it('ignore les regains', () => {
    assert.equal(entryDrainCost({ cost: -2 }), 0)
    assert.equal(sumEntryDrainCosts([{ cost: 2 }, { cost: -1 }, { cost: 0.5 }]), 2.5)
  })

  it('classe la batterie de départ', () => {
    assert.equal(batteryStartBucket(6), 'low')
    assert.equal(batteryStartBucket(7), 'mid')
    assert.equal(batteryStartBucket(9), 'mid')
    assert.equal(batteryStartBucket(10), 'high')
  })
})

describe('buildRealizationInsights', () => {
  it('ignore les jours sans plan et calcule les indicateurs', () => {
    const history = [
      {
        day_date: '2026-10-01',
        computed_budget: 5,
        entries: [
          { kind: 'planned', cost: 4, completed_actual_id: 'x', skip_reason: null },
          { kind: 'planned', cost: 1, completed_actual_id: null, skip_reason: 'no_desire' },
        ],
      },
      {
        day_date: '2026-10-02',
        computed_budget: 12,
        entries: [{ kind: 'actual', cost: 3 }],
      },
      {
        day_date: '2026-10-03',
        computed_budget: 8,
        entries: [
          { kind: 'planned', cost: 10, completed_actual_id: 'y', skip_reason: null },
        ],
      },
    ]

    const insights = buildRealizationInsights(history)
    assert.equal(insights.sampleDays, 2)
    assert.equal(insights.avgCompletionRate, 90) // (80 + 100) / 2
    assert.equal(insights.desireDeferralRate, Math.round((1 / 15) * 1000) / 10)
    const desire = insights.reasonShares.find((r) => r.id === 'no_desire')
    assert.equal(desire?.cost, 1)
    assert.equal(insights.completionByStartBucket.find((b) => b.id === 'low')?.avgRate, 80)
    assert.equal(insights.completionByStartBucket.find((b) => b.id === 'mid')?.avgRate, 100)
  })

  it('formatCompletionRate affiche un tiret si vide', () => {
    assert.equal(formatCompletionRate(null), '—')
    assert.equal(formatCompletionRate(40), '40 %')
  })
})

describe('resolvePlanReviewDayIso', () => {
  it('cible aujourd’hui à partir de 23h, sinon la veille', () => {
    const late = new Date(2026, 10, 25, 23, 10, 0)
    const early = new Date(2026, 10, 25, 10, 0, 0)
    assert.equal(resolvePlanReviewDayIso(late), '2026-11-25')
    assert.equal(resolvePlanReviewDayIso(early), '2026-11-24')
  })
})
