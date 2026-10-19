import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { filterWikiSuggestions, findOpenWikiQuery } from './noteWikiAutocomplete.js'

describe('findOpenWikiQuery', () => {
  it('détecte [[ en cours', () => {
    const r = findOpenWikiQuery('Voir [[Tut', 10)
    assert.equal(r.query, 'Tut')
    assert.equal(r.start, 5)
  })

  it('ignore un lien déjà fermé', () => {
    assert.equal(findOpenWikiQuery('Voir [[A]] suite', 16), null)
  })
})

describe('filterWikiSuggestions', () => {
  const notes = [
    { id: '1', title: 'Tutoriel Markdown' },
    { id: '2', title: 'Daily' },
    { id: '3', title: 'Tutorial JS' },
  ]

  it('filtre et priorise le préfixe', () => {
    const list = filterWikiSuggestions(notes, 'tut', null, 5)
    assert.equal(list.length, 2)
    assert.ok(list.every((n) => n.title.toLowerCase().startsWith('tut')))
    assert.equal(list.some((n) => n.title === 'Daily'), false)
  })
})
