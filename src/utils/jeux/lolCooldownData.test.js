import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyHaste,
  canUseCosmicInsight,
  summonerSpellHaste,
  ultimateBaseCooldown,
  ultimateRankFromLevel,
} from './lolCooldownData.js'

describe('applyHaste', () => {
  it('formule base × 100 / (100 + haste)', () => {
    assert.equal(applyHaste(300, 0), 300)
    assert.equal(applyHaste(100, 100), 50)
    assert.equal(applyHaste(140, 10), 140 * 100 / 110)
  })
})

describe('ultimateRankFromLevel', () => {
  const ahriR = { maxrank: 3, cooldown: [140, 120, 100] }

  it('rang standard 6 / 11 / 16', () => {
    assert.equal(ultimateRankFromLevel(5, ahriR).rank, 0)
    assert.equal(ultimateRankFromLevel(5, ahriR).available, false)
    assert.equal(ultimateRankFromLevel(6, ahriR).rank, 1)
    assert.equal(ultimateRankFromLevel(11, ahriR).rank, 2)
    assert.equal(ultimateRankFromLevel(16, ahriR).rank, 3)
    assert.equal(ultimateRankFromLevel(18, ahriR).atypical, false)
  })

  it('ultime maxrank 1 → atypique, rang 1', () => {
    const jayceR = { maxrank: 1, cooldown: [6] }
    const r = ultimateRankFromLevel(1, jayceR)
    assert.equal(r.rank, 1)
    assert.equal(r.atypical, true)
    assert.ok(r.warning)
  })

  it('ultime maxrank 6 → atypique avec avertissement', () => {
    const udyrR = { maxrank: 6, cooldown: [1, 1, 1, 1, 1, 1] }
    const r = ultimateRankFromLevel(9, udyrR)
    assert.equal(r.atypical, true)
    assert.ok(r.rank >= 1 && r.rank <= 6)
  })
})

describe('ultimateBaseCooldown', () => {
  it('lit le tableau cooldown au rang', () => {
    const spell = { cooldown: [140, 120, 100] }
    assert.equal(ultimateBaseCooldown(spell, 1), 140)
    assert.equal(ultimateBaseCooldown(spell, 2), 120)
    assert.equal(ultimateBaseCooldown(spell, 3), 100)
    assert.equal(ultimateBaseCooldown(spell, 0), null)
  })
})

describe('summonerSpellHaste', () => {
  it('bottes lucidité + Cosmic Insight', () => {
    assert.equal(summonerSpellHaste({ bootsId: '3158' }), 10)
    assert.equal(
      summonerSpellHaste({ bootsId: '3158', cosmicInsight: true }),
      28,
    )
    assert.equal(summonerSpellHaste({ bootsId: '3171', cosmicInsight: true }), 38)
  })

  it('Cosmic Insight seulement si Inspiration', () => {
    assert.equal(canUseCosmicInsight(8300), true)
    assert.equal(canUseCosmicInsight(8000), false)
  })
})
