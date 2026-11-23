import { describe, expect, it } from 'vitest'
import { DEFAULT_SRS, buildReviewQueue, isDue, isOverdue, isWeak, newRecord, schedule } from '../engine/srs'
import { DAY, MINUTE, addLocalDays, startOfDay } from '../engine/dates'
import type { ReviewRecord } from '../types'

const T0 = new Date(2026, 10, 23, 14, 30).getTime() // local time, 14:30

const run = (grades: Parameters<typeof schedule>[1][], start = T0) => {
  let r: ReviewRecord = newRecord('q', start)
  let now = start
  const intervals: number[] = []
  for (const g of grades) {
    r = schedule(r, g, now)
    intervals.push(r.interval)
    now = r.nextReview
  }
  return { r, intervals }
}

describe('SRS scheduling', () => {
  it('follows the 1 → 3 → 7 → 14 → 30 day ladder for good answers', () => {
    const { intervals } = run(['good', 'good', 'good', 'good', 'good'])
    expect(intervals).toEqual([1, 3, 7, 14, 30])
  })

  it('extends beyond the ladder by the ease factor', () => {
    const { intervals } = run(['good', 'good', 'good', 'good', 'good', 'good'])
    expect(intervals[5]).toBe(Math.round(30 * DEFAULT_SRS.initialEase))
  })

  it('day intervals become due at local midnight of the target day', () => {
    const r = schedule(newRecord('q', T0), 'good', T0)
    expect(r.nextReview).toBe(addLocalDays(T0, 1))
    expect(r.nextReview).toBe(startOfDay(r.nextReview))
    expect(isDue(r, T0 + 9 * 60 * MINUTE)).toBe(false) // 23:30 same day
    expect(isDue(r, addLocalDays(T0, 1) + 1)).toBe(true)
  })

  it('an incorrect answer schedules a 10-minute relearn and resets the streak', () => {
    const { r: learned } = run(['good', 'good', 'good'])
    const now = learned.nextReview
    const r = schedule(learned, 'again', now)
    expect(r.streak).toBe(0)
    expect(r.lapses).toBe(1)
    expect(r.nextReview).toBe(now + 10 * MINUTE)
    expect(r.ease).toBeCloseTo(DEFAULT_SRS.initialEase - 0.2)
    expect(isWeak(r)).toBe(true)
    // Relearning restarts the ladder.
    expect(schedule(r, 'good', r.nextReview).interval).toBe(1)
  })

  it('hard gives 1 day for new items and grows slowly for mature ones', () => {
    expect(schedule(newRecord('q', T0), 'hard', T0).interval).toBe(1)
    const { r } = run(['good', 'good', 'good']) // interval 7
    expect(schedule(r, 'hard', r.nextReview).interval).toBe(8)
  })

  it('easy grows faster than good', () => {
    const good = schedule(newRecord('q', T0), 'good', T0)
    const easy = schedule(newRecord('q', T0), 'easy', T0)
    expect(easy.interval).toBeGreaterThan(good.interval)
  })

  it('ease never goes below the minimum', () => {
    let r = newRecord('q', T0)
    for (let i = 0; i < 20; i++) r = schedule(r, 'again', T0 + i * MINUTE)
    expect(r.ease).toBe(DEFAULT_SRS.minEase)
  })

  it('is deterministic', () => {
    expect(run(['good', 'again', 'hard', 'easy']).r).toEqual(run(['good', 'again', 'hard', 'easy']).r)
  })

  it('counts statistics', () => {
    const { r } = run(['again', 'good', 'good', 'again'])
    expect(r.attempts).toBe(4)
    expect(r.correct).toBe(2)
    expect(r.incorrect).toBe(2)
    expect(r.lapses).toBe(1)
  })

  it('marks overdue items before today', () => {
    const r = schedule(newRecord('q', T0), 'good', T0)
    expect(isOverdue(r, r.nextReview + 2 * DAY)).toBe(true)
    expect(isOverdue(r, r.nextReview + 1000)).toBe(false)
  })
})

describe('review queue', () => {
  it('prioritises overdue, then recent mistakes, then due today; excludes not-due', () => {
    const now = T0
    const mk = (id: string, p: Partial<ReviewRecord>): ReviewRecord => ({ ...newRecord(id, now - 30 * DAY), attempts: 3, correct: 3, ...p })
    const records = {
      dueToday: mk('dueToday', { nextReview: startOfDay(now) }),
      overdue: mk('overdue', { nextReview: startOfDay(now) - 3 * DAY }),
      recentMiss: mk('recentMiss', { nextReview: now - MINUTE, incorrect: 1, correct: 2, lastIncorrect: now - 20 * MINUTE }),
      future: mk('future', { nextReview: now + DAY }),
    }
    expect(buildReviewQueue(records, now)).toEqual(['overdue', 'recentMiss', 'dueToday'])
    expect(buildReviewQueue(records, now, { limit: 1 })).toEqual(['overdue'])
  })
})
