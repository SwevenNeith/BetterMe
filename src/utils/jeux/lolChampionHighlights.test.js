import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_RANKED_RESET_DATE,
  rankedResetDateToSec,
  validateRankedResetDate,
} from '../../constants/jeux/lolRankedReset.js'
import {
  candidateNewMatchIds,
  computeChampionHighlights,
  computeSyncProgress,
  isMatchInRankedWindow,
  isValidGame,
  mergeMatchIds,
  needsLolMatchSync,
  newestCountedHistoryMatchMs,
} from './lolChampionHighlights.js'

const PUUID = 'player-1'
const RESET = DEFAULT_RANKED_RESET_DATE
const RESET_SEC = rankedResetDateToSec(RESET)

function match({
  matchId = 'm1',
  offsetSec = 3600,
  duration = 1200,
  championId = 1,
  championName = 'Annie',
  win = true,
  earlySurrender = false,
  queueId = 420,
  gameCreation,
} = {}) {
  const created = gameCreation ?? (RESET_SEC + offsetSec) * 1000
  return {
    matchId,
    gameCreation: created,
    gameDuration: duration,
    queueId,
    participant: {
      puuid: PUUID,
      championId,
      championName,
      win,
      gameEndedInEarlySurrender: earlySurrender,
    },
  }
}

describe('validateRankedResetDate', () => {
  it('refuse une date future ou invalide', () => {
    assert.equal(
      validateRankedResetDate('2099-01-01', { nowMs: Date.parse('2026-06-01T12:00:00Z') }).ok,
      false,
    )
    assert.equal(validateRankedResetDate('08/01/2026').ok, false)
  })
})

describe('isValidGame', () => {
  it('durée 299 exclue, 300 incluse ; early surrender exclu', () => {
    assert.equal(isValidGame(match({ duration: 299 }), PUUID), false)
    assert.equal(isValidGame(match({ duration: 300 }), PUUID), true)
    assert.equal(isValidGame(match({ duration: 900, earlySurrender: true }), PUUID), false)
  })

  it('exclut les files hors liste (ex. ARAM 450) même si présentes dans l’API', () => {
    assert.equal(isValidGame(match({ queueId: 450, duration: 1200 }), PUUID), false)
    assert.equal(isValidGame(match({ queueId: 440 }), PUUID), true)
    assert.equal(isValidGame(match({ queueId: 400 }), PUUID), true)
    assert.equal(isValidGame(match({ queueId: 480 }), PUUID), true)
    assert.equal(isValidGame(match({ queueId: 700 }), PUUID), true)
  })
})

describe('mergeMatchIds', () => {
  it('fusionne et dédoublonne les IDs de plusieurs files', () => {
    assert.deepEqual(
      mergeMatchIds(['EUW1_1', 'EUW1_2'], ['EUW1_2', 'EUW1_3'], ['EUW1_1']),
      ['EUW1_1', 'EUW1_2', 'EUW1_3'],
    )
  })
})

describe('needsLolMatchSync', () => {
  it('skip sync si table à jour et historique pas plus récent', () => {
    assert.equal(
      needsLolMatchSync({
        syncComplete: true,
        historyNewestMs: 1_000,
        storedNewestMs: 1_000,
      }),
      false,
    )
    assert.equal(
      needsLolMatchSync({
        syncComplete: true,
        historyNewestMs: 900,
        storedNewestMs: 1_000,
      }),
      false,
    )
  })

  it('sync si backfill incomplet ou historique plus récent', () => {
    assert.equal(
      needsLolMatchSync({
        syncComplete: false,
        historyNewestMs: 1_000,
        storedNewestMs: 1_000,
      }),
      true,
    )
    assert.equal(
      needsLolMatchSync({
        syncComplete: true,
        historyNewestMs: 2_000,
        storedNewestMs: 1_000,
      }),
      true,
    )
  })

  it('newestCountedHistoryMatchMs ignore ARAM', () => {
    assert.equal(
      newestCountedHistoryMatchMs([
        { queueId: 450, gameCreation: 9_000 },
        { queueId: 420, gameCreation: 1_000 },
        { queueId: 440, gameCreation: 3_000 },
      ]),
      3_000,
    )
  })

  it('candidateNewMatchIds ne garde que les files comptées plus récentes', () => {
    assert.deepEqual(
      candidateNewMatchIds(
        [
          { matchId: 'old', queueId: 420, gameCreation: 500 },
          { matchId: 'aram', queueId: 450, gameCreation: 9_000 },
          { matchId: 'new', queueId: 440, gameCreation: 2_000 },
        ],
        1_000,
      ),
      ['new'],
    )
  })
})

describe('computeSyncProgress', () => {
  it('un remake examiné (non stocké) ne bloque pas done', () => {
    const listedIds = ['ok', 'remake', 'db']
    const existingIds = new Set(['db'])
    // examiné remake + ok (2) ; db déjà en base → remaining 0
    const progress = computeSyncProgress({
      listedIds,
      existingIds,
      examinedThisRun: 2,
      listingComplete: true,
    })
    assert.equal(progress.toExamine.length, 2)
    assert.equal(progress.remaining, 0)
    assert.equal(progress.done, true)
  })

  it('remaining > 0 tant que des IDs listés ne sont pas examinés', () => {
    const progress = computeSyncProgress({
      listedIds: ['a', 'b', 'c'],
      existingIds: new Set(),
      examinedThisRun: 1,
    })
    assert.equal(progress.remaining, 2)
    assert.equal(progress.done, false)
  })
})

describe('fenêtre + agrégation', () => {
  it('exclut avant reset, inclut après ; +91 jours OK dans la saison', () => {
    const before = match({ matchId: 'b', offsetSec: -1 })
    const after = match({ matchId: 'a', offsetSec: 1 })
    const day91 = match({ matchId: 'd91', offsetSec: 91 * 86400 })
    assert.equal(isMatchInRankedWindow(before.gameCreation, RESET_SEC), false)
    assert.equal(isMatchInRankedWindow(after.gameCreation, RESET_SEC), true)

    const { totalGames } = computeChampionHighlights([before, after, day91], {
      puuid: PUUID,
      rankedResetSec: RESET_SEC,
    })
    assert.equal(totalGames, 2)
  })

  it('40 valides / 10 champ / 6 wins → pick 25 % WR 60 % ; files mélangées', () => {
    const matches = [
      match({ matchId: 'remake', duration: 120, championId: 157 }),
      match({ matchId: 'ff', earlySurrender: true, championId: 157 }),
      match({ matchId: 'aram', queueId: 450, championId: 157 }),
    ]
    const queues = [420, 440, 400, 480, 700]
    for (let i = 0; i < 30; i += 1) {
      matches.push(
        match({
          matchId: `o-${i}`,
          offsetSec: 1000 + i,
          championId: 1,
          win: true,
          queueId: queues[i % queues.length],
        }),
      )
    }
    for (let i = 0; i < 10; i += 1) {
      matches.push(
        match({
          matchId: `y-${i}`,
          offsetSec: 5000 + i,
          championId: 157,
          win: i < 6,
          queueId: queues[i % queues.length],
        }),
      )
    }

    const { totalGames, champions } = computeChampionHighlights(matches, {
      puuid: PUUID,
      rankedResetSec: RESET_SEC,
    })
    assert.equal(totalGames, 40)
    const yasuo = champions.find((c) => c.championId === 157)
    assert.equal(yasuo.playShare, 25)
    assert.equal(yasuo.winRate, 60)
    assert.equal(yasuo.games, 10)
  })

  it('départage top : plus de games, puis wins, puis championId', () => {
    const matches = [
      match({ matchId: 'a1', championId: 2, win: true }),
      match({ matchId: 'a2', championId: 2, win: false }),
      match({ matchId: 'b1', championId: 1, win: true }),
      match({ matchId: 'b2', championId: 1, win: true }),
      match({ matchId: 'c1', championId: 3, win: true }),
    ]
    const { champions } = computeChampionHighlights(matches, {
      puuid: PUUID,
      rankedResetSec: RESET_SEC,
      limit: 3,
    })
    assert.deepEqual(
      champions.map((c) => c.championId),
      [1, 2, 3],
    )
  })
})
