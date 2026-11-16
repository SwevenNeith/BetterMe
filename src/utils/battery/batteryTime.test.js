import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  batterySlotToEdtDateRange,
  minutesBetweenHhMm,
  normalizeHhMm,
  parseEdtTimeRange,
  shiftHhMm,
  sliceEventTimeForDay,
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
    assert.equal(validatePlannedSlot('23:00', '00:00'), null)
    assert.equal(validatePlannedSlot('23:00', '01:00'), null)
    assert.match(validatePlannedSlot('14:00', '14:00') || '', /fin/)
  })

  it('calcule la durée entre deux horaires', () => {
    assert.equal(minutesBetweenHhMm('09:00', '10:30'), 90)
    assert.equal(minutesBetweenHhMm('23:00', '00:00'), 60)
    assert.equal(minutesBetweenHhMm('23:00', '00:30'), 90)
  })

  it('prolonge un créneau après minuit sur le jour suivant', () => {
    const untilMidnight = {
      date_start: '2026-11-24',
      time: '23:00 - 00:00',
      all_day: false,
    }
    assert.equal(sliceEventTimeForDay(untilMidnight, '2026-11-24'), '23:00 - 24:00')
    assert.equal(sliceEventTimeForDay(untilMidnight, '2026-11-25'), null)

    const pastMidnight = {
      date_start: '2026-11-24',
      time: '21:00 - 00:15',
      all_day: false,
    }
    assert.equal(sliceEventTimeForDay(pastMidnight, '2026-11-24'), '21:00 - 24:00')
    assert.equal(sliceEventTimeForDay(pastMidnight, '2026-11-25'), '00:00 - 00:15')

    const withDateEnd = {
      date_start: '2026-11-24',
      date_end: '2026-11-25',
      time: '21:00 - 00:15',
      all_day: false,
    }
    assert.equal(sliceEventTimeForDay(withDateEnd, '2026-11-24'), '21:00 - 24:00')
    assert.equal(sliceEventTimeForDay(withDateEnd, '2026-11-25'), '00:00 - 00:15')
  })

  it('mappe seulement l’après-minuit vers le jour calendaire suivant', () => {
    assert.deepEqual(batterySlotToEdtDateRange('2026-11-25', '00:30', '01:30'), {
      date_start: '2026-11-26',
      date_end: '2026-11-26',
      time: '00:30 - 01:30',
    })
    assert.deepEqual(batterySlotToEdtDateRange('2026-11-25', '11:00', '12:00'), {
      date_start: '2026-11-25',
      date_end: '2026-11-25',
      time: '11:00 - 12:00',
    })
    assert.deepEqual(batterySlotToEdtDateRange('2026-11-25', '21:00', '00:15'), {
      date_start: '2026-11-25',
      date_end: '2026-11-26',
      time: '21:00 - 00:15',
    })
    assert.deepEqual(batterySlotToEdtDateRange('2026-11-25', '14:00', '15:00'), {
      date_start: '2026-11-25',
      date_end: '2026-11-25',
      time: '14:00 - 15:00',
    })
    // Réveil à 11h : 10h est encore « nuit » → 26 ; 11h = réveil → 25
    assert.equal(
      batterySlotToEdtDateRange('2026-11-25', '10:00', '10:30', '11:00').date_start,
      '2026-11-26',
    )
    assert.equal(
      batterySlotToEdtDateRange('2026-11-25', '11:00', '12:00', '11:00').date_start,
      '2026-11-25',
    )
  })
})
