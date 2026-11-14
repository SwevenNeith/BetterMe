import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildWeekDays,
  formatDateToLocalISO,
  parseEventHours,
  positionEventsForDay,
} from './weekGridLayout.js'
import {
  batteryEntryToWeekEvent,
  batteryEntryToWeekEvents,
} from '../../services/battery/batteryHistoryEdt.js'

describe('parseEventHours', () => {
  it('parse une plage HH:MM', () => {
    assert.deepEqual(parseEventHours('09:30 - 11:00'), { start: 9.5, end: 11 })
  })
})

describe('positionEventsForDay', () => {
  it('place un événement sur la grille', () => {
    const [ev] = positionEventsForDay([{ id: '1', time: '10:00 - 11:00' }], { hourHeight: 60 })
    assert.equal(ev.start, 10)
    assert.equal(ev.end, 11)
    assert.equal(ev.positionStyle.top, '600px')
    assert.equal(ev.positionStyle.height, '57px')
  })
})

describe('buildWeekDays', () => {
  it('commence un lundi', () => {
    const days = buildWeekDays(new Date(2026, 2, 11)) // mercredi
    assert.equal(formatDateToLocalISO(days[0].date), '2026-03-09')
    assert.equal(formatDateToLocalISO(days[6].date), '2026-03-15')
    assert.equal(days[0].name, 'Lundi')
  })
})

describe('batteryEntryToWeekEvent', () => {
  it('utilise le créneau prévu pour le réel', () => {
    const event = batteryEntryToWeekEvent(
      {
        id: 'a1',
        label: 'Sport',
        planned_start: '18:00',
        planned_end: '19:00',
        cost: 2,
        activity_id: null,
      },
      '2026-03-10',
    )
    assert.equal(event.all_day, false)
    assert.equal(event.time, '18:00 - 19:00')
    assert.equal(event.title, 'Sport')
    assert.equal(event.cost, 2)
  })

  it('affiche la journée entière sans horaire sur l’EDT réel', () => {
    const event = batteryEntryToWeekEvent(
      {
        id: 'a2',
        label: 'Hobby',
        planned_start: null,
        planned_end: null,
        duration_all_day: true,
        cost: 1,
        priority: 'p2',
      },
      '2026-03-10',
    )
    assert.equal(event.all_day, true)
    assert.equal(event.time, null)
    assert.equal(event.priority, 'p2')
  })

  it('ignore les activités sans horaire ni journée entière', () => {
    const event = batteryEntryToWeekEvent(
      {
        id: 'a2b',
        label: 'Sans créneau',
        planned_start: null,
        planned_end: null,
        duration_all_day: false,
        cost: 1,
      },
      '2026-03-10',
    )
    assert.equal(event, null)
  })

  it('dérive la fin depuis la durée', () => {
    const event = batteryEntryToWeekEvent(
      {
        id: 'a3',
        label: 'Focus',
        planned_start: '09:00',
        planned_end: null,
        duration_minutes: 90,
        cost: 3,
      },
      '2026-03-10',
    )
    assert.equal(event.time, '09:00 - 10:30')
  })

  it('reprend la catégorie EDT liée pour le réel', () => {
    const categoryByActualId = new Map([['a4', 'cat-travail']])
    const event = batteryEntryToWeekEvent(
      {
        id: 'a4',
        label: 'Léon',
        duration_all_day: true,
        cost: 1,
        activity_id: null,
      },
      '2026-11-13',
      new Map(),
      categoryByActualId,
    )
    assert.equal(event.category, 'cat-travail')
    assert.equal(event.all_day, true)
  })

  it('garde la bande journée entière avec catégorie même si horaires réels', () => {
    const meta = new Map([
      ['a5', { category: 'cat-social', allDay: true }],
    ])
    const events = batteryEntryToWeekEvents(
      {
        id: 'a5',
        label: 'Léon',
        planned_start: '10:30',
        planned_end: '11:30',
        duration_all_day: false,
        cost: 1,
        priority: 'p1',
      },
      '2026-11-13',
      new Map(),
      meta,
    )
    assert.equal(events.length, 2)
    assert.equal(events[0].all_day, false)
    assert.equal(events[0].category, 'cat-social')
    assert.equal(events[1].all_day, true)
    assert.equal(events[1].category, 'cat-social')
    assert.equal(events[1].priority, 'p1')
  })
})
