import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  extractNoteSearchSnippets,
  resolveSearchOccurrence,
} from './noteSearchSnippets.js'

describe('extractNoteSearchSnippets', () => {
  it('renvoie des extraits avec positions', () => {
    const text = 'Intro.\nLe dragon est fort.\nAutre ligne.\nEncore un dragon ici.'
    const snippets = extractNoteSearchSnippets(text, 'dragon', { limit: 2, radius: 20 })
    assert.equal(snippets.length, 2)
    assert.match(snippets[0].text, /dragon/i)
    assert.equal(text.slice(snippets[0].start, snippets[0].end).toLowerCase(), 'dragon')
    assert.equal(text.slice(snippets[1].start, snippets[1].end).toLowerCase(), 'dragon')
  })

  it('ne renvoie rien sans requête', () => {
    assert.deepEqual(extractNoteSearchSnippets('hello', ''), [])
  })
})

describe('resolveSearchOccurrence', () => {
  it('retrouve l’occurrence préférée', () => {
    const text = 'aaa dragon bbb dragon'
    const hit = resolveSearchOccurrence(text, 'dragon', 4)
    assert.deepEqual(hit, { start: 4, end: 10 })
  })
})
