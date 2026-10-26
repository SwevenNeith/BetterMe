import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  estimateWorkoutDurationMin,
  exerciseMatchesEquipment,
  generateWorkoutSelection,
  normalizeWgerExercise,
  pickPreferredTranslation,
  scoreExerciseForGenerator,
} from './wgerExercise.js'

describe('pickPreferredTranslation', () => {
  it('prefers French over English', () => {
    const { languageId, translation } = pickPreferredTranslation({
      translations: [
        { language: 2, name: 'Squat' },
        { language: 12, name: 'Squat barre' },
      ],
    })
    assert.equal(languageId, 12)
    assert.equal(translation.name, 'Squat barre')
  })
})

describe('normalizeWgerExercise', () => {
  it('maps a Wger exerciseinfo payload', () => {
    const ex = normalizeWgerExercise({
      id: 42,
      category: { id: 1, name: 'Legs' },
      muscles: [{ id: 10, name: 'Quadriceps femoris', name_en: 'Quads' }],
      muscles_secondary: [],
      equipment: [{ id: 1, name: 'Barbell' }],
      images: [{ is_main: true, image: 'https://example.com/a.jpg' }],
      translations: [{ language: 2, name: 'Back Squat', description: '<p>Down</p>', description_source: 'Down' }],
    })
    assert.equal(ex.id, 42)
    assert.equal(ex.name, 'Back Squat')
    assert.equal(ex.categoryName, 'Jambes')
    assert.equal(ex.muscles[0].name, 'Quadriceps')
    assert.equal(ex.equipment[0].name, 'Barre')
    assert.deepEqual(ex.equipmentIds, [1])
    assert.equal(ex.imageUrl, 'https://example.com/a.jpg')
  })
})

describe('exerciseMatchesEquipment', () => {
  it('allows bodyweight always', () => {
    assert.equal(
      exerciseMatchesEquipment({ equipmentIds: [7] }, [7, 3]),
      true,
    )
  })
  it('rejects missing equipment', () => {
    assert.equal(
      exerciseMatchesEquipment({ equipmentIds: [1] }, [3, 7]),
      false,
    )
  })
})

describe('generateWorkoutSelection', () => {
  it('is deterministic and respects count', () => {
    const candidates = [
      { id: 1, muscleIds: [10], variationGroup: 'a' },
      { id: 2, muscleIds: [10], variationGroup: 'a' },
      { id: 3, muscleIds: [4], variationGroup: 'b' },
      { id: 4, muscleIds: [1], variationGroup: 'c' },
    ]
    const a = generateWorkoutSelection(candidates, { muscleIds: [10, 4], count: 2 })
    const b = generateWorkoutSelection(candidates, { muscleIds: [10, 4], count: 2 })
    assert.deepEqual(
      a.exercises.map((e) => e.id),
      b.exercises.map((e) => e.id),
    )
    assert.equal(a.exercises.length, 2)
    // Same variation group should not both be picked first
    assert.notEqual(a.exercises[0].variationGroup, a.exercises[1]?.variationGroup)
  })
})

describe('score + duration', () => {
  it('scores favorites higher', () => {
    const base = scoreExerciseForGenerator({ id: 5, muscleIds: [10] }, { muscleIds: [10] })
    const fav = scoreExerciseForGenerator(
      { id: 5, muscleIds: [10] },
      { muscleIds: [10], favoriteWgerIds: [5] },
    )
    assert.ok(fav > base)
  })
  it('estimates duration', () => {
    const min = estimateWorkoutDurationMin([
      { target_sets: 3, rest_seconds: 60 },
      { target_sets: 3, rest_seconds: 60 },
    ])
    assert.ok(min >= 5)
  })
})
