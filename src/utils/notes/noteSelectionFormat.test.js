import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  adjustNoteLineIndent,
  applyBlockFormat,
  formatNoteListLine,
  handleNoteListEnter,
  parseNoteListLine,
} from './noteSelectionFormat.js'

describe('parseNoteListLine', () => {
  it('détecte puces / numéros / tâches avec indentation', () => {
    assert.equal(parseNoteListLine('- a').type, 'bullet')
    assert.equal(parseNoteListLine('  - a').indent, '  ')
    assert.equal(parseNoteListLine('1. a').type, 'number')
    assert.equal(parseNoteListLine('- [ ] a').type, 'task')
    assert.equal(parseNoteListLine('- [x] a').checked, true)
    assert.equal(parseNoteListLine('hello').isList, false)
  })
})

describe('adjustNoteLineIndent', () => {
  it('Tab indente une ligne de liste', () => {
    const r = adjustNoteLineIndent('- item', 0, 6, 'indent')
    assert.equal(r.content, '  - item')
    assert.equal(r.changed, true)
  })

  it('Shift+Tab désindente', () => {
    const r = adjustNoteLineIndent('  - item', 0, 8, 'outdent')
    assert.equal(r.content, '- item')
    assert.equal(r.changed, true)
  })

  it('indente plusieurs lignes', () => {
    const text = '- a\n- b'
    const r = adjustNoteLineIndent(text, 0, text.length, 'indent')
    assert.equal(r.content, '  - a\n  - b')
  })
})

describe('handleNoteListEnter', () => {
  it('continue une liste au même niveau', () => {
    const r = handleNoteListEnter('- hello', 7)
    assert.equal(r.changed, true)
    assert.equal(r.content, '- hello\n- ')
  })

  it('conserve l’indentation imbriquée', () => {
    const r = handleNoteListEnter('  - nested', 10)
    assert.equal(r.content, '  - nested\n  - ')
  })

  it('item vide désindente', () => {
    const r = handleNoteListEnter('  - ', 4)
    assert.equal(r.content, '- ')
  })

  it('item vide niveau 0 sort de la liste', () => {
    const r = handleNoteListEnter('- ', 2)
    assert.equal(r.content, '')
  })
})

describe('applyBlockFormat', () => {
  it('conserve l’indentation existante', () => {
    const r = applyBlockFormat('  texte', 0, 7, 'bullet')
    assert.equal(r.content, '  - texte')
  })

  it('formatNoteListLine reconstruit une tâche', () => {
    assert.equal(
      formatNoteListLine({ indent: '  ', type: 'task', bare: 'todo', checked: false }),
      '  - [ ] todo',
    )
  })
})
