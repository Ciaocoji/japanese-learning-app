import type { Grade, ReviewRecord } from '../types'
import { DAY, MINUTE, addLocalDays, startOfDay } from './dates'

/**
 * Simplified SM-2 style scheduler.
 *
 * This is a practical review schedule inspired by memory research (spacing effect),
 * not a model that predicts the exact moment a learner forgets something.
 *
 * Successful recalls follow a ladder (1 → 3 → 7 → 14 → 30 days), after which the
 * interval grows by the item's ease factor. Mistakes reset the item to a short
 * relearning step and lower its ease, so repeatedly-missed items come back more often.
 */
export interface SrsConfig {
  /** Interval ladder in days for the 1st, 2nd, 3rd … successful recall. */
  ladder: number[]
  /** Relearning delay after a mistake, in minutes. */
  againMinutes: number
  /** Interval for "hard" when the item is new or relearning, in days. */
  hardMinDays: number
  hardMultiplier: number
  /** How many ladder steps an "easy" answer skips ahead (in addition to the normal step). */
  easyBonusSteps: number
  easyMultiplier: number
  initialEase: number
  minEase: number
  maxEase: number
  easeAgainDelta: number
  easeHardDelta: number
  easeEasyDelta: number
  maxIntervalDays: number
  /** Consecutive correct answers + interval needed to call an item "mastered". */
  masteredStreak: number
  masteredInterval: number
}

export const DEFAULT_SRS: SrsConfig = {
  ladder: [1, 3, 7, 14, 30],
  againMinutes: 10,
  hardMinDays: 1,
  hardMultiplier: 1.2,
  easyBonusSteps: 1,
  easyMultiplier: 1.3,
  initialEase: 2.5,
  minEase: 1.3,
  maxEase: 3.0,
  easeAgainDelta: -0.2,
  easeHardDelta: -0.15,
  easeEasyDelta: 0.15,
  maxIntervalDays: 365,
  masteredStreak: 5,
  masteredInterval: 30,
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function newRecord(questionId: string, now: number, cfg: SrsConfig = DEFAULT_SRS): ReviewRecord {
  return {
    questionId,
    attempts: 0,
    correct: 0,
    incorrect: 0,
    streak: 0,
    lapses: 0,
    lastAnswered: now,
    lastIncorrect: null,
    lastReview: null,
    nextReview: now,
    interval: 0,
    ease: cfg.initialEase,
    status: 'learning',
  }
}

/** Interval (days) for the given number of consecutive successful recalls. */
export function ladderInterval(successCount: number, prevInterval: number, ease: number, cfg: SrsConfig): number {
  if (successCount <= 0) return cfg.ladder[0]
  if (successCount <= cfg.ladder.length) return cfg.ladder[successCount - 1]
  return Math.max(prevInterval + 1, Math.round(prevInterval * ease))
}

/**
 * Apply an answer to a record and return the updated record (pure function).
 * `prev` may be undefined for a question answered for the first time.
 */
export function schedule(
  prev: ReviewRecord | undefined,
  grade: Grade,
  now: number,
  cfg: SrsConfig = DEFAULT_SRS,
): ReviewRecord {
  const base = prev ? { ...prev } : newRecord('', now, cfg)
  const r: ReviewRecord = { ...base, questionId: prev?.questionId ?? base.questionId }
  const wasSeen = prev !== undefined && prev.attempts > 0
  r.attempts += 1
  r.lastAnswered = now
  if (wasSeen) r.lastReview = now

  if (grade === 'again') {
    r.incorrect += 1
    if (prev && prev.streak > 0) r.lapses += 1
    r.streak = 0
    r.lastIncorrect = now
    r.ease = clamp(r.ease + cfg.easeAgainDelta, cfg.minEase, cfg.maxEase)
    r.interval = cfg.againMinutes / (24 * 60)
    r.nextReview = now + cfg.againMinutes * MINUTE
    r.status = 'learning'
    return r
  }

  r.correct += 1
  let days: number
  if (grade === 'hard') {
    r.streak += 1
    r.ease = clamp(r.ease + cfg.easeHardDelta, cfg.minEase, cfg.maxEase)
    days = r.interval < 1 ? cfg.hardMinDays : Math.max(cfg.hardMinDays, Math.round(r.interval * cfg.hardMultiplier))
  } else if (grade === 'good') {
    r.streak += 1
    days = ladderInterval(r.streak, r.interval, r.ease, cfg)
  } else {
    r.streak += 1 + cfg.easyBonusSteps
    r.ease = clamp(r.ease + cfg.easeEasyDelta, cfg.minEase, cfg.maxEase)
    days = Math.round(ladderInterval(r.streak, r.interval, r.ease, cfg) * cfg.easyMultiplier)
  }
  days = clamp(days, 1, cfg.maxIntervalDays)
  r.interval = days
  // Day-based intervals become due at local midnight of the target day, so
  // "due today" matches the learner's calendar instead of the clock time.
  r.nextReview = addLocalDays(now, days)
  r.status = r.streak >= cfg.masteredStreak && days >= cfg.masteredInterval ? 'mastered' : 'review'
  return r
}

export function isDue(r: ReviewRecord, now: number): boolean {
  return r.nextReview <= now
}

export function isOverdue(r: ReviewRecord, now: number): boolean {
  return r.nextReview < startOfDay(now)
}

/** Weak: missed recently / repeatedly and not yet re-stabilised. */
export function isWeak(r: ReviewRecord): boolean {
  if (r.incorrect === 0) return false
  if (r.streak >= 3) return false
  const accuracy = r.correct / Math.max(1, r.attempts)
  return r.streak === 0 || r.lapses >= 1 || accuracy < 0.7
}

/**
 * Priority score for the review queue (higher first):
 *  1. overdue  2. recently missed  3. repeated mistakes  4. low accuracy  5. due today
 */
export function reviewPriority(r: ReviewRecord, now: number): number {
  let score = 0
  if (isOverdue(r, now)) score += 1000 + Math.min(500, ((startOfDay(now) - r.nextReview) / DAY) * 10)
  if (r.lastIncorrect !== null && now - r.lastIncorrect < 2 * DAY) score += 400
  score += Math.min(5, r.incorrect) * 40 + r.lapses * 20
  const accuracy = r.correct / Math.max(1, r.attempts)
  score += (1 - accuracy) * 100
  return score
}

/** Due question ids ordered by priority (stable tie-break by id). */
export function buildReviewQueue(
  records: Record<string, ReviewRecord>,
  now: number,
  opts: { limit?: number; filter?: (r: ReviewRecord) => boolean } = {},
): string[] {
  const due = Object.values(records).filter((r) => isDue(r, now) && (!opts.filter || opts.filter(r)))
  due.sort((a, b) => reviewPriority(b, now) - reviewPriority(a, now) || a.questionId.localeCompare(b.questionId))
  return due.slice(0, opts.limit ?? due.length).map((r) => r.questionId)
}

/** Map a quiz answer to an SRS grade. Wrong answers are always "again". */
export function gradeFor(correct: boolean, selfRating?: 'hard' | 'good' | 'easy'): Grade {
  if (!correct) return 'again'
  return selfRating ?? 'good'
}
