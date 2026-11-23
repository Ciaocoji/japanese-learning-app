import type { AppState, Grade, LevelId, Question, ReviewRecord, SessionAnswer, SessionPlan } from '../types'
import { LEVELS, LEVEL_ORDER, parseStageKey, stageKey } from '../data/levels'
import { getQuestion, questionsByStageKey } from '../data'
import { dateKey, daysBetweenKeys } from './dates'
import { DEFAULT_SRS, isDue, newRecord, schedule, type SrsConfig } from './srs'

export const PROGRESSION = {
  /** Share of a stage's questions that must be answered in the session. */
  minCompletion: 0.8,
  /** First-try accuracy on stage questions needed to pass. */
  minAccuracy: 0.7,
}

export const XP = {
  correct: 10,
  /** Correct answer on an item that was neither new nor due (re-practice): small reward only. */
  correctRepeat: 2,
  comboEvery: 5,
  comboBonus: 5,
  stageClear: 30,
  perfectStage: 20,
  reviewSession: 15,
  reviewSessionMin: 5,
  dailyGoal: 25,
  rankSize: 250,
}

// ---------------------------------------------------------------------------
// Unlocking
// ---------------------------------------------------------------------------

export function isStageCompleted(state: AppState, key: string): boolean {
  return state.stages[key]?.completed === true
}

export function isLevelCompleted(state: AppState, level: LevelId): boolean {
  const meta = LEVELS.find((l) => l.id === level)!
  return meta.stages.every((s) => isStageCompleted(state, stageKey(level, s.number)))
}

export function isLevelUnlocked(state: AppState, level: LevelId): boolean {
  const i = LEVEL_ORDER.indexOf(level)
  return i === 0 || isLevelCompleted(state, LEVEL_ORDER[i - 1])
}

export function isStageUnlocked(state: AppState, level: LevelId, stage: number): boolean {
  if (!isLevelUnlocked(state, level)) return false
  return stage === 1 || isStageCompleted(state, stageKey(level, stage - 1))
}

/** The stage the learner should work on next (first unlocked, uncompleted stage). */
export function currentPosition(state: AppState): { level: LevelId; stage: number; allDone: boolean } {
  for (const lvl of LEVELS) {
    for (const s of lvl.stages) {
      if (!isStageCompleted(state, stageKey(lvl.id, s.number))) {
        return { level: lvl.id, stage: s.number, allDone: false }
      }
    }
  }
  return { level: 'N1', stage: 3, allDone: true }
}

export function levelProgress(state: AppState, level: LevelId): { done: number; total: number } {
  const meta = LEVELS.find((l) => l.id === level)!
  const done = meta.stages.filter((s) => isStageCompleted(state, stageKey(level, s.number))).length
  return { done, total: meta.stages.length }
}

export function rankInfo(xp: number) {
  const rank = Math.floor(xp / XP.rankSize) + 1
  const into = xp % XP.rankSize
  return { rank, into, needed: XP.rankSize, toNext: XP.rankSize - into }
}

// ---------------------------------------------------------------------------
// Streak
// ---------------------------------------------------------------------------

export function touchStreak(streak: AppState['streak'], today: string): AppState['streak'] {
  if (streak.lastActiveDate === today) return streak
  let current = 1
  if (streak.lastActiveDate && daysBetweenKeys(streak.lastActiveDate, today) === 1) current = streak.current + 1
  return { current, best: Math.max(streak.best, current), lastActiveDate: today }
}

/** Streak to display: broken if the last active day is before yesterday. */
export function displayStreak(streak: { current: number; lastActiveDate?: string | null; lastDate?: string | null }, now: number): number {
  const last = streak.lastActiveDate ?? streak.lastDate ?? null
  if (!last) return 0
  const gap = daysBetweenKeys(last, dateKey(now))
  return gap <= 1 ? streak.current : 0
}

// ---------------------------------------------------------------------------
// Answering
// ---------------------------------------------------------------------------

export interface AnswerInput {
  questionId: string
  correct: boolean
  given: string
  grade: Grade
  isRetry: boolean
  /** Consecutive correct answers in this session, including this one. */
  combo: number
  now: number
}

export interface AnswerOutcome {
  state: AppState
  xp: number
  goalReached: boolean
  previousRecord: ReviewRecord | undefined
}

export function applyAnswer(state: AppState, input: AnswerInput, cfg: SrsConfig = DEFAULT_SRS): AnswerOutcome {
  const { questionId, correct, given, grade, isRetry, combo, now } = input
  const q = getQuestion(questionId)
  const prev = state.records[questionId]
  const record = schedule(prev ?? newRecord(questionId, now, cfg), grade, now, cfg)
  record.questionId = questionId

  let xp = 0
  if (correct && !isRetry) {
    const fresh = prev === undefined || isDue(prev, now)
    xp += fresh ? XP.correct : XP.correctRepeat
    if (fresh && combo > 0 && combo % XP.comboEvery === 0) xp += XP.comboBonus
  }

  const today = dateKey(now)
  const day = { ...(state.daily[today] ?? { answered: 0, correct: 0, xp: 0, goalRewarded: false }) }
  if (!isRetry) {
    day.answered += 1
    if (correct) day.correct += 1
  }
  let goalReached = false
  if (!day.goalRewarded && day.answered >= state.settings.dailyGoal) {
    day.goalRewarded = true
    goalReached = true
    xp += XP.dailyGoal
  }
  day.xp += xp

  const categoryStats = { ...state.categoryStats }
  if (q && !isRetry) {
    const c = categoryStats[q.category] ?? { attempts: 0, correct: 0 }
    categoryStats[q.category] = { attempts: c.attempts + 1, correct: c.correct + (correct ? 1 : 0) }
  }

  const recentMistakes = correct
    ? state.recentMistakes
    : [{ questionId, at: now, given }, ...state.recentMistakes.filter((m) => m.questionId !== questionId)].slice(0, 30)

  const wasScheduledReview = prev !== undefined && prev.attempts > 0 && isDue(prev, now) && !isRetry
  const reviewTotals = wasScheduledReview
    ? { attempts: state.reviewTotals.attempts + 1, correct: state.reviewTotals.correct + (correct ? 1 : 0) }
    : state.reviewTotals

  return {
    state: {
      ...state,
      reviewTotals,
      xp: state.xp + xp,
      records: { ...state.records, [questionId]: record },
      categoryStats,
      daily: pruneDaily({ ...state.daily, [today]: day }, today),
      streak: touchStreak(state.streak, today),
      recentMistakes,
    },
    xp,
    goalReached,
    previousRecord: prev,
  }
}

/** Re-grade the latest answer (self-rating hard / easy) from the record snapshot taken before it. */
export function regrade(state: AppState, questionId: string, previous: ReviewRecord | undefined, grade: Grade, now: number, cfg: SrsConfig = DEFAULT_SRS): AppState {
  const record = schedule(previous ?? newRecord(questionId, now, cfg), grade, now, cfg)
  record.questionId = questionId
  return { ...state, records: { ...state.records, [questionId]: record } }
}

function pruneDaily(daily: AppState['daily'], today: string): AppState['daily'] {
  const keys = Object.keys(daily)
  if (keys.length <= 120) return daily
  const out: AppState['daily'] = {}
  for (const k of keys) if (daysBetweenKeys(k, today) <= 90) out[k] = daily[k]
  return out
}

// ---------------------------------------------------------------------------
// Session completion
// ---------------------------------------------------------------------------

export interface StageResult {
  key: string
  answered: number
  total: number
  correct: number
  accuracy: number
  completion: number
  passed: boolean
  firstClear: boolean
  perfect: boolean
}

export interface SessionSummary {
  answered: number
  correct: number
  accuracy: number
  xpEarned: number
  bonusXp: number
  stage?: StageResult
  levelCompleted?: LevelId
  unlockedLevel?: LevelId
  unlockedStage?: { level: LevelId; stage: number }
  reviewBonus: boolean
}

export function evaluateStage(plan: SessionPlan, results: SessionAnswer[]): StageResult | undefined {
  if (!plan.stageKey || !plan.stageQuestionIds?.length) return undefined
  const ids = new Set(plan.stageQuestionIds)
  const firsts = results.filter((r) => !r.isRetry && ids.has(r.questionId))
  const answered = new Set(firsts.map((r) => r.questionId)).size
  const correct = firsts.filter((r) => r.correct).length
  const total = ids.size
  const accuracy = answered ? correct / answered : 0
  const completion = answered / total
  const passed = completion >= PROGRESSION.minCompletion && accuracy >= PROGRESSION.minAccuracy
  return { key: plan.stageKey, answered, total, correct, accuracy, completion, passed, firstClear: false, perfect: answered === total && correct === total }
}

export function completeSession(state: AppState, plan: SessionPlan, results: SessionAnswer[], now: number): { state: AppState; summary: SessionSummary } {
  const firsts = results.filter((r) => !r.isRetry)
  const correct = firsts.filter((r) => r.correct).length
  const xpEarned = results.reduce((a, r) => a + r.xp, 0)
  let bonus = 0
  let next = { ...state, activeSession: null }
  const summary: SessionSummary = {
    answered: firsts.length,
    correct,
    accuracy: firsts.length ? correct / firsts.length : 0,
    xpEarned,
    bonusXp: 0,
    reviewBonus: false,
  }

  const stage = evaluateStage(plan, results)
  if (stage) {
    const prev = state.stages[stage.key]
    const wasCompleted = prev?.completed === true
    const wasPerfect = prev?.perfect === true
    const { level } = parseStageKey(stage.key)
    const levelWasCompleted = isLevelCompleted(state, level)
    stage.firstClear = stage.passed && !wasCompleted
    if (stage.firstClear) bonus += XP.stageClear
    if (stage.perfect && !wasPerfect) bonus += XP.perfectStage
    next = {
      ...next,
      stages: {
        ...next.stages,
        [stage.key]: {
          attempts: (prev?.attempts ?? 0) + 1,
          bestAccuracy: Math.max(prev?.bestAccuracy ?? 0, stage.accuracy),
          completed: wasCompleted || stage.passed,
          perfect: wasPerfect || stage.perfect,
          lastPlayed: now,
        },
      },
    }
    summary.stage = stage
    if (stage.firstClear) {
      const s = parseStageKey(stage.key)
      if (!levelWasCompleted && isLevelCompleted(next, level)) {
        summary.levelCompleted = level
        const idx = LEVEL_ORDER.indexOf(level)
        if (idx < LEVEL_ORDER.length - 1) summary.unlockedLevel = LEVEL_ORDER[idx + 1]
      } else if (isStageUnlocked(next, s.level, s.stage + 1)) {
        summary.unlockedStage = { level: s.level, stage: s.stage + 1 }
      }
    }
  }

  // Review bonus: a real review session, not an empty one.
  const reviewed = firsts.filter((r) => !plan.stageQuestionIds?.includes(r.questionId))
  if ((plan.kind === 'review' || plan.kind === 'daily') && reviewed.length >= XP.reviewSessionMin) {
    bonus += XP.reviewSession
    summary.reviewBonus = true
    const today = dateKey(now)
    const rs = next.reviewStreak
    if (rs.lastDate !== today) {
      const current = rs.lastDate && daysBetweenKeys(rs.lastDate, today) === 1 ? rs.current + 1 : 1
      next = { ...next, reviewStreak: { current, best: Math.max(rs.best, current), lastDate: today } }
    }
  }

  if (bonus > 0) {
    const today = dateKey(now)
    const day = next.daily[today] ?? { answered: 0, correct: 0, xp: 0, goalRewarded: false }
    next = { ...next, xp: next.xp + bonus, daily: { ...next.daily, [today]: { ...day, xp: day.xp + bonus } } }
  }
  summary.bonusXp = bonus
  return { state: next, summary }
}

// ---------------------------------------------------------------------------
// Answer checking
// ---------------------------------------------------------------------------

export function normalizeAnswer(s: string): string {
  return s.replace(/[\s　、。，,.！!？?「」…・]/g, '')
}

export function checkOrder(answers: string[], given: string): boolean {
  const g = normalizeAnswer(given)
  return answers.some((a) => normalizeAnswer(a) === g)
}

export function isChoiceCorrect(q: Question, given: string): boolean {
  return q.format === 'choice' && q.correctAnswer === given
}

export function stageQuestionIds(key: string): string[] {
  return questionsByStageKey(key).map((q) => q.id)
}
