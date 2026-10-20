import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BATTERY_BASE_DEFAULT,
  calibrationSignalForDay,
  carryoverFromPreviousDay,
  computeDayBudget,
  costIntensity,
  costStyleClass,
  formatMinutesAsHm,
  gaugeColor,
  hoursBetweenTimes,
  learnedDefaultFromTwoWeeks,
  lieInBucket,
  lieInMinutes,
  morningDelta,
  remainingEnergy,
  sleepDelta,
  sumEntryCosts,
  weekStartIso,
  weeklyBaseAdjustment,
} from './batteryMath.js'

describe('batteryMath', () => {
  it('applique les deltas matin / sommeil', () => {
    assert.equal(morningDelta(1), -3)
    assert.equal(morningDelta(2), -1)
    assert.equal(morningDelta(3), 0)
    assert.equal(morningDelta(5), 2)
    assert.equal(sleepDelta('bad'), -2)
    assert.equal(sleepDelta('ok'), 0)
    assert.equal(sleepDelta('good'), 1)
  })

  it('calcule le budget comme dans l’exemple (base 10, réveil 2, mauvaise nuit, report −1 → 6)', () => {
    assert.equal(
      computeDayBudget({
        base: 10,
        morningEnergy: 2,
        sleepQuality: 'bad',
        carryover: -1,
      }),
      6,
    )
  })

  it('report : moitié du dépassement arrondie, plafond −3, pas de bonus', () => {
    assert.equal(carryoverFromPreviousDay(10, 12), -1)
    assert.equal(carryoverFromPreviousDay(10, 16), -3)
    assert.equal(carryoverFromPreviousDay(10, 20), -3)
    assert.equal(carryoverFromPreviousDay(10, 8), 0)
    assert.equal(carryoverFromPreviousDay(10, 10), 0)
  })

  it('somme et restant', () => {
    assert.equal(sumEntryCosts([{ cost: 2 }, { cost: -1 }, { cost: 3 }]), 4)
    assert.equal(remainingEnergy(10, 4), 6)
  })

  it('couleur de jauge', () => {
    assert.equal(gaugeColor(10, 2), 'green')
    assert.equal(gaugeColor(10, 7), 'orange')
    assert.equal(gaugeColor(10, 9), 'red')
    assert.equal(gaugeColor(10, 12), 'red')
  })

  it('signaux de recalibrage du soir', () => {
    assert.equal(calibrationSignalForDay(10, 9, 'left'), 1)
    assert.equal(calibrationSignalForDay(10, 9, 'just'), 0)
    assert.equal(calibrationSignalForDay(10, 8, 'empty'), -1)
    assert.equal(calibrationSignalForDay(10, 5, 'left'), 0)
    assert.equal(calibrationSignalForDay(10, 12, 'empty'), 0)
  })

  it('ajustement hebdomadaire de la base', () => {
    assert.equal(weeklyBaseAdjustment([1, 1, 1, 0, 0]), 1)
    assert.equal(weeklyBaseAdjustment([-1, -1, -1, 0]), -1)
    assert.equal(weeklyBaseAdjustment([1, 1, 1, -1]), 0)
    assert.equal(weeklyBaseAdjustment([1, 1, 0, 0]), 0)
  })

  it('apprend le défaut après 2 semaines consécutives au même coût réel', () => {
    // Semaine du lun 2026-03-09 et lun 2026-03-16
    const usages = [
      { day_date: '2026-03-17', cost: 4 },
      { day_date: '2026-03-19', cost: 4 },
      { day_date: '2026-03-10', cost: 4 },
      { day_date: '2026-03-12', cost: 4 },
    ]
    assert.equal(weekStartIso('2026-03-17'), '2026-03-16')
    assert.equal(weekStartIso('2026-03-10'), '2026-03-09')
    assert.equal(learnedDefaultFromTwoWeeks(usages, 2), 4)
    assert.equal(learnedDefaultFromTwoWeeks(usages, 4), null)

    // Coûts mixtes dans une semaine → pas d’update
    assert.equal(
      learnedDefaultFromTwoWeeks(
        [
          { day_date: '2026-03-17', cost: 4 },
          { day_date: '2026-03-18', cost: 3 },
          { day_date: '2026-03-10', cost: 4 },
        ],
        2,
      ),
      null,
    )

    // Une seule semaine → pas d’update
    assert.equal(
      learnedDefaultFromTwoWeeks(
        [
          { day_date: '2026-03-17', cost: 4 },
          { day_date: '2026-03-18', cost: 4 },
        ],
        2,
      ),
      null,
    )
  })

  it('classe d’intensité selon |coût|', () => {
    assert.equal(costIntensity(1), 1)
    assert.equal(costIntensity(-3), 3)
    assert.equal(costIntensity(9), 5)
    assert.equal(costStyleClass(1), 'drain-1')
    assert.equal(costStyleClass(-4), 'restore-4')
    assert.equal(costStyleClass(0), 'neutral')
  })

  it('calcule durée de sommeil et écart réveil → sortie du lit', () => {
    assert.equal(hoursBetweenTimes('23:00', '07:00'), 8)
    assert.equal(hoursBetweenTimes('00:30', '07:00'), 6.5)
    assert.equal(lieInMinutes('07:00', '09:00'), 120)
    assert.equal(lieInMinutes('07:00', '07:15'), 15)
    assert.equal(formatMinutesAsHm(120), '2 h')
    assert.equal(formatMinutesAsHm(75), '1 h 15 min')
    assert.equal(lieInBucket(10), 'short')
    assert.equal(lieInBucket(30), 'medium')
    assert.equal(lieInBucket(60), 'long')
    assert.equal(lieInBucket(120), 'very_long')
  })

  it('utilise la base par défaut', () => {
    assert.equal(computeDayBudget({}), BATTERY_BASE_DEFAULT)
  })
})
