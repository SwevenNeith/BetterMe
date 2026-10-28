import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BATTERY_SOURCE_TYPES } from '../../constants/battery/battery.js'
import {
  activeDurationPresetId,
  durationFromTimetableEvent,
  durationOverridePayload,
  formatBatteryDuration,
  formatDurationMinutesLabel,
  minutesFromTimetableTimeRange,
  normalizeDurationMinutes,
  resolveBatteryDuration,
  stampDurationFromResolved,
} from './batteryDuration.js'
import {
  activityDurationStats,
  avgSpentByActivityDuration,
  describeAvgSpentByActivityDuration,
} from './batteryInsights.js'

describe('batteryDuration', () => {
  it('parse la plage horaire EDT en minutes', () => {
    assert.equal(minutesFromTimetableTimeRange('09:00 - 10:15'), 75)
    assert.equal(minutesFromTimetableTimeRange('23:00 - 01:00'), 120)
    assert.equal(minutesFromTimetableTimeRange(''), null)
  })

  it('détecte les évènements journée entière', () => {
    assert.deepEqual(durationFromTimetableEvent({ all_day: true }), {
      minutes: null,
      allDay: true,
    })
    assert.deepEqual(durationFromTimetableEvent({ all_day: false, time: '14:00 - 15:30' }), {
      minutes: 90,
      allDay: false,
    })
  })

  it('priorise la surcharge Batterie, puis l’EDT, sinon null', () => {
    const edt = { minutes: 60, allDay: false }
    const override = resolveBatteryDuration(
      {
        has_duration_override: true,
        duration_minutes: 30,
        duration_all_day: false,
        source_type: BATTERY_SOURCE_TYPES.TIMETABLE,
      },
      edt,
    )
    assert.equal(override.source, 'override')
    assert.equal(override.minutes, 30)
    assert.equal(override.overriddenFromEdt, true)

    const fromEdt = resolveBatteryDuration(
      {
        has_duration_override: false,
        source_type: BATTERY_SOURCE_TYPES.TIMETABLE,
      },
      edt,
    )
    assert.equal(fromEdt.source, 'edt')
    assert.equal(fromEdt.minutes, 60)

    const empty = resolveBatteryDuration({ has_duration_override: false }, null)
    assert.equal(empty.source, 'none')
    assert.equal(empty.minutes, null)
  })

  it('suit l’EDT quand il n’y a pas de surcharge Batterie', () => {
    const before = resolveBatteryDuration(
      { has_duration_override: false, source_type: BATTERY_SOURCE_TYPES.TIMETABLE },
      { minutes: 45, allDay: false },
    )
    assert.equal(before.minutes, 45)

    const afterEdtChange = resolveBatteryDuration(
      { has_duration_override: false, source_type: BATTERY_SOURCE_TYPES.TIMETABLE },
      { minutes: 90, allDay: false },
    )
    assert.equal(afterEdtChange.minutes, 90)

    const withOverride = resolveBatteryDuration(
      {
        has_duration_override: true,
        duration_minutes: 30,
        duration_all_day: false,
        source_type: BATTERY_SOURCE_TYPES.TIMETABLE,
      },
      { minutes: 90, allDay: false },
    )
    assert.equal(withOverride.minutes, 30)
  })

  it('formate et expose un preset custom si besoin', () => {
    assert.equal(formatDurationMinutesLabel(75), '1 h 15')
    assert.equal(formatDurationMinutesLabel(180), '+2 h')
    assert.equal(formatDurationMinutesLabel(180, { compactOver2h: false }), '3 h')
    assert.equal(formatBatteryDuration({ allDay: true }), 'Journée entière')
    assert.equal(
      activeDurationPresetId({ minutes: 75, allDay: false }),
      'custom:75',
    )
    assert.equal(activeDurationPresetId({ minutes: 60, allDay: false }), '60')
    assert.equal(activeDurationPresetId({ minutes: 180, allDay: false }), 'over_2h')
    assert.deepEqual(durationOverridePayload('over_2h'), {
      has_duration_override: true,
      duration_minutes: 150,
      duration_all_day: false,
    })
    assert.deepEqual(durationOverridePayload('reset'), {
      has_duration_override: false,
      duration_minutes: null,
      duration_all_day: false,
    })
    assert.equal(normalizeDurationMinutes(0), null)
    assert.deepEqual(stampDurationFromResolved({ minutes: 30, allDay: false, source: 'edt' }), {
      has_duration_override: true,
      duration_minutes: 30,
      duration_all_day: false,
    })
  })
})

describe('activityDurationStats', () => {
  it('exclut journée entière / null de l’intensité et exige 3 occurrences', () => {
    const history = [
      {
        entries: [
          {
            kind: 'actual',
            label: 'Réunion',
            activity_id: 'a1',
            cost: 2,
            duration_minutes: 60,
            duration_all_day: false,
          },
          {
            kind: 'actual',
            label: 'Réunion',
            activity_id: 'a1',
            cost: 4,
            duration_minutes: 120,
            duration_all_day: false,
          },
        ],
      },
      {
        entries: [
          {
            kind: 'actual',
            label: 'Réunion',
            activity_id: 'a1',
            cost: 3,
            duration_minutes: null,
            duration_all_day: true,
          },
        ],
      },
    ]

    const [row] = activityDurationStats(history, { minSamples: 3 })
    assert.equal(row.count, 3)
    assert.equal(row.numericDurationCount, 2)
    assert.equal(row.enoughData, true)
    assert.equal(row.enoughDurationData, false)
    assert.equal(row.avgDurationMinutes, null)
    assert.equal(row.avgIntensityPerHour, null)
    assert.equal(row.avgCost, 3)
    assert.equal(row.costMin, 2)
    assert.equal(row.costMax, 4)
  })

  it('calcule intensité moyenne quand assez de durées numériques', () => {
    const entries = [60, 60, 120].map((minutes, i) => ({
      kind: 'actual',
      label: 'Sport',
      activity_id: 's1',
      cost: 2,
      duration_minutes: minutes,
      duration_all_day: false,
      _i: i,
    }))
    const [row] = activityDurationStats([{ entries }], { minSamples: 3 })
    assert.equal(row.enoughDurationData, true)
    assert.equal(row.avgDurationMinutes, 80)
    // coûts/h : 2, 2, 1 → moyenne 1.7
    assert.equal(row.avgIntensityPerHour, 1.7)
  })
})

describe('avgSpentByActivityDuration', () => {
  it('compare le coût moyen par tranche de durée', () => {
    const history = [
      {
        entries: [
          { kind: 'actual', cost: 1, duration_minutes: 20, duration_all_day: false },
          { kind: 'actual', cost: 1, duration_minutes: 15, duration_all_day: false },
          { kind: 'actual', cost: 4, duration_minutes: 75, duration_all_day: false },
          { kind: 'actual', cost: 5, duration_minutes: 80, duration_all_day: false },
          { kind: 'actual', cost: 2, duration_minutes: 150, duration_all_day: false },
        ],
      },
    ]
    const averages = avgSpentByActivityDuration(history)
    assert.equal(averages.sampleCount, 5)
    assert.equal(averages.under_30, 1)
    assert.equal(averages['60_90'], 4.5)
    const phrase = describeAvgSpentByActivityDuration(averages)
    assert.match(phrase, /1 h – 1 h 30/)
  })
})
