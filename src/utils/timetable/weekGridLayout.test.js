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
  bedtimeMarkerDayIso,
  selectEdtPageEventsForDay,
  sleepMarkersByDay,
  sleepMarkersFromDay,
} from '../../services/battery/batteryHistoryEdt.js'

describe('parseEventHours', () => {
  it('parse une plage HH:MM', () => {
    assert.deepEqual(parseEventHours('09:30 - 11:00'), { start: 9.5, end: 11 })
  })

  it('lit 23:00–00:00 comme une fin à minuit', () => {
    assert.deepEqual(parseEventHours('23:00 - 00:00'), { start: 23, end: 24 })
    assert.deepEqual(parseEventHours('23:00 - 24:00'), { start: 23, end: 24 })
  })

  it('garde 23:00–00:15 en un seul bloc qui dépasse minuit', () => {
    assert.deepEqual(parseEventHours('23:00 - 00:15'), { start: 23, end: 24.25 })
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

  it('affiche la journée entière explicite sans horaire', () => {
    const event = batteryEntryToWeekEvent(
      {
        id: 'a2',
        label: 'Léon',
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

  it('ignore hobbies / activités sans horaire ni journée entière', () => {
    const event = batteryEntryToWeekEvent(
      {
        id: 'a2b',
        label: 'Hobby sans créneau',
        planned_start: null,
        planned_end: null,
        duration_all_day: false,
        cost: 1,
      },
      '2026-03-10',
    )
    assert.equal(event, null)
  })

  it('ne montre pas un hobby même si le lié EDT est all-day (à placer)', () => {
    // linked.allDay = false : les hobbies à placer ne doivent pas forcer la bande
    const events = batteryEntryToWeekEvents(
      {
        id: 'a2c',
        label: 'Peinture',
        planned_start: null,
        planned_end: null,
        duration_all_day: false,
        cost: 1,
      },
      '2026-03-10',
      new Map(),
      new Map([['a2c', { category: 'cat-hobbies', allDay: false }]]),
    )
    assert.equal(events.length, 0)
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

  it('ne garde pas la bande journée entière si le réel a des horaires', () => {
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
    assert.equal(events.length, 1)
    assert.equal(events[0].all_day, false)
    assert.equal(events[0].category, 'cat-social')
    assert.equal(events[0].priority, 'p1')
    assert.equal(events[0].time, '10:30 - 11:30')
  })

  it('prolonge un réel après minuit jusqu’au lendemain', () => {
    const events = batteryEntryToWeekEvents(
      {
        id: 'a6',
        label: 'Vidéo Worlds',
        planned_start: '21:00',
        planned_end: '00:15',
        duration_all_day: true,
        cost: 2,
        priority: 'p3',
      },
      '2026-11-15',
      new Map(),
      new Map([['a6', { category: 'cat-hobbies', allDay: true }]]),
    )
    assert.equal(events.length, 1)
    assert.equal(events[0].all_day, false)
    assert.equal(events[0].date_start, '2026-11-15')
    assert.equal(events[0].date_end, '2026-11-16')
    assert.equal(events[0].time, '21:00 - 00:15')
  })

  it('place 00:30–01:30 du jour Batterie 25 sur l’EDT du 26', () => {
    const events = batteryEntryToWeekEvents(
      {
        id: 'a7',
        label: 'Nuit',
        planned_start: '00:30',
        planned_end: '01:30',
        cost: 1,
        priority: 'p3',
      },
      '2026-11-25',
      new Map(),
      new Map(),
    )
    assert.equal(events.length, 1)
    assert.equal(events[0].date_start, '2026-11-26')
    assert.equal(events[0].date_end, '2026-11-26')
    assert.equal(events[0].time, '00:30 - 01:30')
    assert.equal(events[0]._batteryDay, '2026-11-25')
  })
})

describe('allDayEventsForDay', () => {
  it('masque la journée entière si un créneau du même titre existe ce jour-là', async () => {
    const { allDayEventsForDay } = await import('../../services/battery/batteryHistoryEdt.js')
    const events = [
      {
        id: 'all-1',
        title: 'Vidéo Worlds',
        all_day: true,
        date_start: '2026-11-15',
        date_end: '2026-11-15',
      },
      {
        id: 'timed-1',
        title: 'Vidéo Worlds',
        all_day: false,
        date_start: '2026-11-15',
        date_end: '2026-11-16',
        time: '21:00 - 00:15',
      },
    ]
    assert.equal(allDayEventsForDay(events, '2026-11-15').length, 0)
  })
})

describe('sleepMarkersFromDay', () => {
  it('place couché, réveil et sortie sur le jour, et ignore les horaires vides', () => {
    const markers = sleepMarkersFromDay({
      day_date: '2026-11-24',
      sleep_bedtime: '23:15:00',
      sleep_wake_time: '07:05',
      sleep_out_of_bed_time: null,
    })
    assert.deepEqual(
      markers.map((marker) => [marker.kind, marker.label, marker.time]),
      [
        ['bed', 'couché', '23:15'],
        ['wake', 'réveil', '07:05'],
      ],
    )
  })

  it('dessine un coucher à 23h du 25 sur le 24, et garde le réveil le 25', () => {
    assert.equal(bedtimeMarkerDayIso('2026-11-25', '23:00'), '2026-11-24')
    assert.equal(bedtimeMarkerDayIso('2026-11-25', '00:40'), '2026-11-25')
    const byDay = sleepMarkersByDay([
      {
        day_date: '2026-11-25',
        sleep_bedtime: '23:00',
        sleep_wake_time: '07:10',
        sleep_out_of_bed_time: '07:30',
      },
    ])
    assert.deepEqual(
      (byDay['2026-11-24'] || []).map((marker) => [marker.label, marker.time]),
      [['couché', '23:00']],
    )
    assert.deepEqual(
      (byDay['2026-11-25'] || []).map((marker) => [marker.label, marker.time]),
      [
        ['réveil', '07:10'],
        ['sortie', '07:30'],
      ],
    )
  })
})

describe('selectEdtPageEventsForDay', () => {
  const plannedTimed = [{ id: 'plan-1', title: 'Prévu', time: '09:00 - 10:00' }]
  const plannedAllDay = [
    { id: 'plan-day', title: 'Journée prévue', all_day: true },
    { id: 'bday', title: 'Anniversaire', all_day: true, event_kind: 'birthday', _birthdayOccurrence: true },
  ]
  const actualEvents = [
    {
      id: 'actual-1',
      title: 'Réel',
      date_start: '2026-11-24',
      date_end: '2026-11-24',
      all_day: false,
      time: '11:00 - 12:00',
      _source: 'actual',
    },
  ]

  it('garde le prévu pour aujourd’hui et le futur', () => {
    const today = selectEdtPageEventsForDay({
      dayIso: '2026-11-25',
      todayIso: '2026-11-25',
      plannedTimed,
      plannedAllDay,
      actualEvents,
    })
    assert.equal(today.locked, false)
    assert.equal(today.timed[0].id, 'plan-1')

    const future = selectEdtPageEventsForDay({
      dayIso: '2026-11-26',
      todayIso: '2026-11-25',
      plannedTimed,
      plannedAllDay,
      actualEvents,
    })
    assert.equal(future.locked, false)
    assert.equal(future.allDay.length, 2)
  })

  it('remplace le prévu par le réel dès le lendemain, en gardant les anniversaires', () => {
    const past = selectEdtPageEventsForDay({
      dayIso: '2026-11-24',
      todayIso: '2026-11-25',
      plannedTimed,
      plannedAllDay,
      actualEvents,
    })
    assert.equal(past.locked, true)
    assert.deepEqual(
      past.timed.map((event) => event.title),
      ['Réel'],
    )
    assert.deepEqual(
      past.allDay.map((event) => event.id),
      ['bday'],
    )
  })
})
