import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildTierListFence,
  createDefaultTierList,
  extractNoteTierLists,
  normalizeTierListData,
  replaceNoteTierListAt,
  resolveTierListTheme,
  tierColorAtIndex,
} from './noteTierLists.js'

describe('createDefaultTierList', () => {
  it('crée 4 tiers S–C', () => {
    const data = createDefaultTierList()
    assert.equal(data.tiers.length, 4)
    assert.deepEqual(
      data.tiers.map((tier) => tier.name),
      ['S', 'A', 'B', 'C'],
    )
    assert.equal(data.pool.length, 0)
  })
})

describe('extractNoteTierLists', () => {
  it('extrait les fences et laisse des placeholders', () => {
    const md = 'Intro\n\n```tierlist\n{"version":1,"tiers":[{"name":"S","color":"#ff7f7f","items":[]}],"pool":[]}\n```\n\nFin'
    const { text, tierLists } = extractNoteTierLists(md)
    assert.equal(tierLists.length, 1)
    assert.equal(tierLists[0].tiers[0].name, 'S')
    assert.match(text, /notes-tierlist-widget/)
    assert.doesNotMatch(text, /```tierlist/)
  })
})

describe('replaceNoteTierListAt', () => {
  it('met à jour le JSON de la fence', () => {
    const fence = buildTierListFence(createDefaultTierList())
    const md = `Hello\n\n${fence}\n`
    const next = normalizeTierListData(createDefaultTierList())
    next.pool.push({ id: 'i_test', label: 'Zed' })
    const result = replaceNoteTierListAt(md, 0, next)
    assert.equal(result.changed, true)
    assert.match(result.content, /Zed/)
    assert.equal(extractNoteTierLists(result.content).tierLists[0].pool[0].label, 'Zed')
  })
})

describe('tierColorAtIndex', () => {
  it('continue le dégradé au-delà de C (pas de retour au rouge)', () => {
    assert.equal(tierColorAtIndex(0), '#ff7f7f')
    assert.equal(tierColorAtIndex(3), '#ffff7f')
    assert.equal(tierColorAtIndex(4), '#bfff7f')
    assert.notEqual(tierColorAtIndex(4), tierColorAtIndex(0))
  })
})

describe('resolveTierListTheme', () => {
  it('adapte le plateau à la surface du coffre', () => {
    const theme = resolveTierListTheme({
      '--notes-vault-main-bg': '#f4f0fa',
      '--notes-vault-accent': '#d5b5ea',
      '--notes-vault-color': '#ad81be',
    })
    assert.match(theme.boardBg, /^#/)
    assert.match(theme.controlsBg, /^#/)
  })

  it('fournit un thème hors coffre', () => {
    const theme = resolveTierListTheme(null)
    assert.equal(theme.boardBg, '#2a2438')
  })
})
