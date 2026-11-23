import { describe, expect, it } from 'vitest'
import { ALL_QUESTIONS } from '../data'
import { LEVELS } from '../data/levels'
import { normalizeAnswer } from '../engine/progress'
import { buildOptionOrder } from '../engine/session'

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs]
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]))
}

describe('content integrity', () => {
  it('has at least 210 questions', () => {
    expect(ALL_QUESTIONS.length).toBeGreaterThanOrEqual(210)
  })

  it('uses unique, well-formed ids', () => {
    const ids = ALL_QUESTIONS.map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const q of ALL_QUESTIONS) {
      expect(q.id).toMatch(new RegExp(`^${q.level.toLowerCase()}-${q.stage}-\\d{2}$`))
    }
  })

  it('every level has ≥3 stages with ≥10 questions and ≥5 question types', () => {
    for (const lvl of LEVELS) {
      expect(lvl.stages.length).toBeGreaterThanOrEqual(3)
      const lq = ALL_QUESTIONS.filter((q) => q.level === lvl.id)
      expect(new Set(lq.map((q) => q.type)).size).toBeGreaterThanOrEqual(5)
      for (const s of lvl.stages) {
        expect(lq.filter((q) => q.stage === s.number).length).toBeGreaterThanOrEqual(10)
      }
    }
  })

  it('every question has a Chinese explanation', () => {
    for (const q of ALL_QUESTIONS) expect(q.explanation.length, q.id).toBeGreaterThan(15)
  })

  it('choice questions: unique options, correct answer present, notes reference real options', () => {
    for (const q of ALL_QUESTIONS) {
      if (q.format !== 'choice') continue
      expect(new Set(q.options).size, q.id).toBe(q.options.length)
      expect(q.options.length, q.id).toBeGreaterThanOrEqual(3)
      expect(q.options, q.id).toContain(q.correctAnswer)
    }
    const bad = ALL_QUESTIONS.flatMap((q) =>
      q.format === 'choice' ? Object.keys(q.optionNotes ?? {}).filter((k) => !q.options.includes(k) || k === q.correctAnswer).map((k) => `${q.id}: ${k}`) : [],
    )
    expect(bad).toEqual([])
  })

  it('gap questions contain exactly one gap', () => {
    for (const q of ALL_QUESTIONS) {
      if (q.type === 'fill' && q.japanese?.includes('___')) expect(q.japanese.split('___').length, q.id).toBe(2)
      if (q.type === 'conversation') {
        const gaps = (q.dialogue ?? []).reduce((n, l) => n + l.text.split('___').length - 1, 0)
        expect(gaps, q.id).toBe(1)
      }
    }
  })

  it('order questions: every accepted answer is buildable from all real tiles', () => {
    for (const q of ALL_QUESTIONS) {
      if (q.format !== 'order') continue
      const built = new Set(permutations(q.tiles).map((p) => normalizeAnswer(p.join(''))))
      for (const a of q.answers) expect(built.has(normalizeAnswer(a)), `${q.id}: ${a}`).toBe(true)
      for (const d of q.distractors ?? []) expect(q.tiles, q.id).not.toContain(d)
    }
  })

  it('match questions have unique sides', () => {
    for (const q of ALL_QUESTIONS) {
      if (q.format !== 'match') continue
      expect(new Set(q.pairs.map((p) => p.ja)).size).toBe(q.pairs.length)
      expect(new Set(q.pairs.map((p) => p.zh)).size).toBe(q.pairs.length)
    }
  })

  it('N7–N5 stages have at least 15 questions', () => {
    for (const lvl of ['N7', 'N6', 'N5'])
      for (const st of [1, 2, 3]) expect(ALL_QUESTIONS.filter((q) => q.level === lvl && q.stage === st).length, `${lvl}-${st}`).toBeGreaterThanOrEqual(15)
  })

  it('N4–N1 stages have at least 40 questions', () => {
    for (const lvl of ['N4', 'N3', 'N2', 'N1'])
      for (const st of [1, 2, 3]) expect(ALL_QUESTIONS.filter((q) => q.level === lvl && q.stage === st).length, `${lvl}-${st}`).toBeGreaterThanOrEqual(40)
  })

  it('has no romaji-reading drills (kana → latin letters)', () => {
    const latinOnly = (t: string) => /^[a-z]+$/i.test(t)
    const bad = ALL_QUESTIONS.filter(
      (q) => (q.format === 'choice' && q.options.every(latinOnly)) || (q.format === 'match' && q.pairs.every((p) => latinOnly(p.zh))),
    ).map((q) => q.id)
    expect(bad).toEqual([])
  })

  it('listening questions have audio text', () => {
    for (const q of ALL_QUESTIONS) if (q.type === 'listening') expect(q.audioText, q.id).toBeTruthy()
  })

  it('option shuffling never changes the answer key', () => {
    let seed = 42
    const rng = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
    for (let round = 0; round < 20; round++) {
      const order = buildOptionOrder(ALL_QUESTIONS.map((q) => q.id), rng)
      for (const q of ALL_QUESTIONS) {
        const o = order[q.id]
        if (q.format === 'choice') {
          expect([...o].sort()).toEqual([...q.options].sort())
          expect(o).toContain(q.correctAnswer)
        } else if (q.format === 'order') {
          expect([...o].sort()).toEqual([...q.tiles, ...(q.distractors ?? [])].sort())
        } else {
          expect([...o].sort()).toEqual(q.pairs.map((p) => p.zh).sort())
        }
      }
    }
  })
})
