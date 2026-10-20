import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  enumerateTimetableEventDays,
  shouldSyncTimetableToBattery,
  shouldSyncTodoToBattery,
} from './batterySourceSync.js'
import { TODO_FREQUENCY } from '../../constants/todo/todoOptions.js'
import { TIMETABLE_EVENT_KIND } from '../../utils/timetable/anniversaryMath.js'

describe('batterySourceSync', () => {
  it('synchronise uniquement les TODO ponctuels', () => {
    assert.equal(shouldSyncTodoToBattery({ frequence: TODO_FREQUENCY.ONE_OFF }), true)
    assert.equal(shouldSyncTodoToBattery({ frequence: TODO_FREQUENCY.WEEK_GOAL }), false)
    assert.equal(shouldSyncTodoToBattery({ frequence: TODO_FREQUENCY.DAILY }), false)
    assert.equal(shouldSyncTodoToBattery({ frequence: TODO_FREQUENCY.WEEKLY }), false)
  })

  it('exclut les anniversaires et les objectifs « Cette semaine »', () => {
    assert.equal(shouldSyncTimetableToBattery({ event_kind: null }), true)
    assert.equal(
      shouldSyncTimetableToBattery({ event_kind: TIMETABLE_EVENT_KIND.BIRTHDAY }),
      false,
    )
    assert.equal(
      shouldSyncTimetableToBattery({ event_kind: null }, TODO_FREQUENCY.WEEK_GOAL),
      false,
    )
  })

  it('énumère les jours d’un événement multi-jours', () => {
    assert.deepEqual(
      enumerateTimetableEventDays({ date_start: '2026-10-20', date_end: '2026-10-22' }),
      ['2026-10-20', '2026-10-21', '2026-10-22'],
    )
    assert.deepEqual(enumerateTimetableEventDays({ date_start: '2026-10-20' }), ['2026-10-20'])
  })
})
