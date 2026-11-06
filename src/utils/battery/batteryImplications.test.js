import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  aggregatedSubtreeCost,
  groupEntriesByImplication,
  sumPlannedCostsWithoutDoubleCount,
  wouldCreateImplicationCycle,
  buildImplicationForestRows,
} from './batteryImplications.js'

describe('batteryImplications', () => {
  it('groupe parent / enfants et ignore le double-compte', () => {
    const entries = [
      { id: 'a', label: 'RDV', cost: 2, planned_start: '14:00', priority: 'p1', sort_order: 0 },
      {
        id: 'b',
        label: 'Transport',
        cost: 1,
        planned_start: '13:30',
        priority: 'p2',
        sort_order: 1,
        implied_by_entry_id: 'a',
      },
      { id: 'c', label: 'Hobby', cost: 3, planned_start: null, priority: 'p4', sort_order: 2 },
    ]

    const { roots, childrenByParent, orphanImplied } = groupEntriesByImplication(entries)
    assert.equal(roots.length, 2)
    assert.equal(orphanImplied.length, 0)
    assert.equal(childrenByParent.get('a')?.length, 1)
    assert.equal(aggregatedSubtreeCost(entries[0], childrenByParent), 3)
    assert.equal(sumPlannedCostsWithoutDoubleCount(entries), 6)
  })

  it('agrège les liaisons imbriquées', () => {
    const entries = [
      { id: 'a', cost: 2, sort_order: 0 },
      { id: 'b', cost: 1, implied_by_entry_id: 'a', sort_order: 1 },
      { id: 'c', cost: 1, implied_by_entry_id: 'b', sort_order: 2 },
    ]
    const { childrenByParent } = groupEntriesByImplication(entries)
    assert.equal(aggregatedSubtreeCost(entries[0], childrenByParent), 4)
    assert.equal(buildImplicationForestRows(entries).length, 3)
    assert.equal(wouldCreateImplicationCycle(entries, 'c', 'a'), true)
    assert.equal(wouldCreateImplicationCycle(entries, 'a', 'c'), false)
  })

  it('compte les orphelins sans parent', () => {
    const entries = [
      {
        id: 'x',
        label: 'Orphelin',
        cost: 2,
        implied_by_entry_id: 'missing',
        planned_start: '10:00',
      },
    ]
    assert.equal(sumPlannedCostsWithoutDoubleCount(entries), 2)
  })

  it('ordonne les enfants par sort_order (DnD), pas par horaire', () => {
    const entries = [
      { id: 'a', cost: 1, sort_order: 0, planned_start: '12:00' },
      {
        id: 'c',
        cost: 1,
        implied_by_entry_id: 'a',
        sort_order: 2,
        planned_start: '09:00',
      },
      {
        id: 'b',
        cost: 1,
        implied_by_entry_id: 'a',
        sort_order: 1,
        planned_start: '15:00',
      },
    ]
    const rows = buildImplicationForestRows(entries)
    assert.deepEqual(
      rows.map((r) => r.entry.id),
      ['a', 'b', 'c'],
    )
  })
})
