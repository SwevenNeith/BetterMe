import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { detectRepetitions } from './auteurRepetitions.js'
import { lookupSynonyms, preserveCase } from './auteurSynonyms.js'
import { analyzeStyle } from './auteurStyle.js'

describe('auteurRepetitions', () => {
  it('détecte une répétition proche et ignore les mots-outils', () => {
    const text =
      'L’homme marcha dans la rue. Puis l’homme marcha encore près de la maison.'
    const result = detectRepetitions({
      text,
      scope: 'paragraph',
      characterNames: [],
      ignoreWords: [],
    })
    const labels = result.findings.map((f) => f.label.toLowerCase())
    assert.ok(labels.some((l) => l.includes('homme') || l.includes('march')))
    assert.ok(!result.findings.some((f) => ['le', 'la', 'de', 'dans'].includes(f.key)))
  })

  it('ignore les noms de personnages', () => {
    const text = 'Orianna sourit. Plus loin, Orianna reprit la parole.'
    const result = detectRepetitions({
      text,
      scope: 'paragraph',
      characterNames: ['Orianna'],
    })
    assert.ok(!result.findings.some((f) => f.key.includes('orianna')))
  })
})

describe('auteurSynonyms', () => {
  it('lemmatise une forme conjuguée', () => {
    const hit = lookupSynonyms('marchait')
    assert.equal(hit.lemma, 'marcher')
    assert.equal(hit.found, true)
    assert.ok(hit.notice)
  })

  it('preserve la majuscule', () => {
    assert.equal(preserveCase('Maison', 'demeure'), 'Demeure')
  })
})

describe('auteurStyle', () => {
  it('compte les bases et évite les faux adverbes', () => {
    const r = analyzeStyle(
      'Elle est fatiguée en ce moment. Ils aiment vraiment ce sentiment très fort.',
    )
    assert.ok(r.wordCount > 5)
    assert.ok(!r.adverbs.some((a) => ['moment', 'sentiment', 'aiment'].includes(a.word.toLowerCase())))
    assert.ok(r.adverbs.some((a) => a.word.toLowerCase() === 'vraiment'))
  })
})
