import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  minutesBetweenHhMm,
  normalizeHhMm,
  parseEdtTimeRange,
  shiftHhMm,
  validatePlannedSlot,
} from './batteryTime.js'

describe('batteryTime', () => {
  it('normalise et décale les horaires', () => {
    assert.equal(normalizeHhMm('9:05:00'), '09:05')
    assert.equal(shiftHhMm('14:00', -30), '13:30')
    assert.equal(shiftHhMm('00:10', -30), '00:00')
  })

  it('parse le format EDT et valide un créneau', () => {
    assert.deepEqual(parseEdtTimeRange('14:00 - 15:30'), {
      start: '14:00',
      end: '15:30',
    })
    assert.equal(validatePlannedSlot('14:00', '15:00'), null)
    assert.match(validatePlannedSlot('14:00', '14:00') || '', /fin/)
  })

  it('calcule la durée entre deux horaires', () => {
    assert.equal(minutesBetweenHhMm('09:00', '10:30'), 90)
    assert.equal(minutesBetweenHhMm('23:00', '00:30'), 90)
  })
})
