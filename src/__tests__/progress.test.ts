import { beforeEach, describe, expect, it } from 'vitest'
import { createInitialState, loadState, normalizeState, saveState, STORAGE_KEY, getStore, BACKUP_KEY } from '../engine/storage'
import { applyAnswer, completeSession, currentPosition, displayStreak, isLevelCompleted, isLevelUnlocked, isStageUnlocked, skipStage, XP } from '../engine/progress'
import { createDailySession, createPlacementSession, createReviewSession, createStageSession, reviewQueue } from '../engine/session'
import { reviewStats, categoryAccuracies } from '../engine/analytics'
import { getQuestion } from '../data'
import { DAY, MINUTE, dateKey } from '../engine/dates'
import type { AppState, SessionAnswer, SessionPlan } from '../types'

const T0 = new Date(2026, 10, 23, 10, 0).getTime()

/** Play a session answering each question correctly unless its id is in `wrong`. */
function play(state: AppState, plan: SessionPlan, wrong: string[] = [], now = T0) {
  let s: AppState = state
  const results: SessionAnswer[] = []
  const ids = [...plan.questionIds]
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    const isRetry = results.some((r) => r.questionId === id)
    const correct = isRetry || !wrong.includes(id)
    const out = applyAnswer(s, { questionId: id, correct, given: correct ? 'ok' : 'x', grade: correct ? 'good' : 'again', isRetry, combo: 1, now })
    s = out.state
    results.push({ questionId: id, correct, given: '', grade: correct ? 'good' : 'again', xp: out.xp, isRetry })
    if (!correct && plan.allowRetry && !isRetry) ids.push(id)
  }
  return completeSession(s, plan, results, now)
}

describe('progression', () => {
  it('starts at N7 stage 1 with only that stage unlocked', () => {
    const s = createInitialState(T0)
    expect(currentPosition(s)).toMatchObject({ level: 'N7', stage: 1 })
    expect(isStageUnlocked(s, 'N7', 1)).toBe(true)
    expect(isStageUnlocked(s, 'N7', 2)).toBe(false)
    expect(isLevelUnlocked(s, 'N6')).toBe(false)
  })

  it('passing a stage unlocks the next and awards XP once', () => {
    const plan = createStageSession('N7-1')
    const { state, summary } = play(createInitialState(T0), plan)
    expect(summary.stage?.passed).toBe(true)
    expect(summary.stage?.perfect).toBe(true)
    expect(isStageUnlocked(state, 'N7', 2)).toBe(true)
    expect(summary.unlockedStage).toEqual({ level: 'N7', stage: 2 })
    const base = plan.questionIds.length * XP.correct // combo given as 1 in helper → no combo bonus
    expect(state.xp).toBe(base + XP.stageClear + XP.perfectStage)
    // Replay: no stage bonus again, and repeat answers give only the small reward.
    const again = play({ ...state, settings: { ...state.settings, dailyGoal: 999 } }, createStageSession('N7-1'))
    expect(again.summary.bonusXp).toBe(0)
    expect(again.state.xp - state.xp).toBe(plan.questionIds.length * XP.correctRepeat)
  })

  it('failing accuracy (<70%) does not unlock the next stage', () => {
    const plan = createStageSession('N7-1')
    const { state, summary } = play(createInitialState(T0), plan, plan.questionIds.slice(0, 5))
    expect(summary.stage?.accuracy).toBeCloseTo(10 / 15)
    expect(summary.stage?.passed).toBe(false)
    expect(isStageUnlocked(state, 'N7', 2)).toBe(false)
  })

  it('completing all stages of a level unlocks the next level', () => {
    let s = createInitialState(T0)
    let last
    for (const n of [1, 2, 3]) {
      last = play(s, createStageSession(`N7-${n}`))
      s = last.state
    }
    expect(last!.summary.levelCompleted).toBe('N7')
    expect(last!.summary.unlockedLevel).toBe('N6')
    expect(isLevelUnlocked(s, 'N6')).toBe(true)
    expect(currentPosition(s)).toMatchObject({ level: 'N6', stage: 1 })
  })
})

describe('review flow', () => {
  it('wrong answers enter the review queue, appear when due, and intervals grow on success', () => {
    const plan = createStageSession('N7-1')
    const missed = plan.questionIds[0]
    const { state } = play(createInitialState(T0), plan, [missed])
    const rec = state.records[missed]
    expect(rec.incorrect).toBe(1)
    expect(rec.nextReview).toBe(T0 + 10 * MINUTE)
    expect(state.recentMistakes[0].questionId).toBe(missed)
    // Not due right away, due after 10 minutes.
    expect(reviewQueue(state, 'all', T0)).not.toContain(missed)
    expect(reviewQueue(state, 'all', T0 + 11 * MINUTE)[0]).toBe(missed)
    expect(reviewQueue(state, 'mistakes', T0)).toContain(missed) // mistakes drill ignores due date

    const later = T0 + 11 * MINUTE
    const review = createReviewSession(state, 'all', later)!
    expect(review.questionIds).toEqual([missed])
    const r1 = play(state, review, [], later)
    expect(r1.state.records[missed].interval).toBe(1)
    const day2 = r1.state.records[missed].nextReview + MINUTE
    const r2 = play(r1.state, createReviewSession(r1.state, 'all', day2)!, [], day2)
    expect(r2.state.records[missed].interval).toBe(3)
    // Wrong again → back to 10 minutes and a single in-session retry.
    const day5 = r2.state.records[missed].nextReview + MINUTE
    const plan3 = createReviewSession(r2.state, 'all', day5)!
    const r3 = play(r2.state, plan3, [missed], day5)
    expect(r3.state.records[missed].attempts).toBe(r2.state.records[missed].attempts + 2) // miss + one retry only
    expect(r3.state.records[missed].interval).toBe(1)
  })

  it('daily session mixes due reviews before the current stage', () => {
    const plan = createStageSession('N7-1')
    const missed = plan.questionIds.slice(0, 2)
    const { state } = play(createInitialState(T0), plan, missed) // 80% → passed
    const daily = createDailySession(state, T0 + 15 * MINUTE)
    expect(daily.questionIds.slice(0, 2).sort()).toEqual([...missed].sort())
    expect(daily.stageKey).toBe('N7-2')
    expect(daily.stageQuestionIds).toHaveLength(15)
    expect(daily.questionIds).toHaveLength(17)
  })

  it('stats: due / overdue / weak counts', () => {
    const plan = createStageSession('N7-3')
    const { state } = play(createInitialState(T0), plan, plan.questionIds.slice(0, 3))
    const st = reviewStats(state, T0 + 3 * DAY)
    expect(st.overdue).toBe(plan.questionIds.length)
    expect(st.weakQuestions).toBe(3)
    expect(st.weakVocabulary).toBeGreaterThan(0)
    expect(categoryAccuracies(state).ready.length).toBeGreaterThan(0)
  })
})

describe('streak', () => {
  it('counts consecutive local days and breaks after a gap', () => {
    let s = createInitialState(T0)
    const id = 'n7-1-06'
    for (const d of [0, 1, 2]) s = applyAnswer(s, { questionId: id, correct: true, given: '', grade: 'good', isRetry: false, combo: 1, now: T0 + d * DAY }).state
    expect(s.streak.current).toBe(3)
    expect(displayStreak(s.streak, T0 + 3 * DAY)).toBe(3)
    expect(displayStreak(s.streak, T0 + 4 * DAY)).toBe(0)
    s = applyAnswer(s, { questionId: id, correct: true, given: '', grade: 'good', isRetry: false, combo: 1, now: T0 + 5 * DAY }).state
    expect(s.streak.current).toBe(1)
    expect(s.streak.best).toBe(3)
    expect(s.daily[dateKey(T0 + 5 * DAY)].answered).toBe(1)
  })

  it('awards the daily goal bonus once', () => {
    let s = createInitialState(T0)
    s.settings.dailyGoal = 3
    const ids = ['n7-1-06', 'n7-1-07', 'n7-1-08', 'n7-1-10']
    let bonusCount = 0
    for (const id of ids) {
      const out = applyAnswer(s, { questionId: id, correct: true, given: '', grade: 'good', isRetry: false, combo: 1, now: T0 })
      if (out.goalReached) bonusCount++
      s = out.state
    }
    expect(bonusCount).toBe(1)
  })
})

describe('storage', () => {
  beforeEach(() => getStore().store.removeItem(STORAGE_KEY))

  it('round-trips state', () => {
    const s = applyAnswer(createInitialState(T0), { questionId: 'n7-1-06', correct: false, given: 'x', grade: 'again', isRetry: false, combo: 0, now: T0 }).state
    saveState(s)
    const loaded = loadState(T0).state
    expect(loaded.records['n7-1-06']).toEqual(s.records['n7-1-06'])
    expect(loaded.recentMistakes).toEqual(s.recentMistakes)
  })

  it('recovers from corrupted JSON and keeps a backup', () => {
    getStore().store.setItem(STORAGE_KEY, '{not json')
    const res = loadState(T0)
    expect(res.notice).toBe('recovered')
    expect(res.state.xp).toBe(0)
    expect(getStore().store.getItem(BACKUP_KEY)).toBe('{not json')
  })

  it('normalises partially broken data without losing valid records', () => {
    const s = normalizeState({ version: 1, xp: 'lots', records: { 'n7-1-06': { nextReview: 5, attempts: 2 }, bad: 7 }, settings: { dailyGoal: 30 } }, T0)
    expect(s.xp).toBe(0)
    expect(s.records['n7-1-06'].attempts).toBe(2)
    expect(s.records.bad).toBeUndefined()
    expect(s.settings.dailyGoal).toBe(30)
    expect(s.settings.showReading).toBe(true)
  })

  it('migrates unversioned data', () => {
    const s = normalizeState({ xp: 40 }, T0)
    expect(s.version).toBe(1)
    expect(s.xp).toBe(40)
  })

  it('records survive content lookups by stable id', () => {
    expect(getQuestion('n7-3-01')?.japanese).toBe('手紙')
  })
})

describe('skipping', () => {
  it('skipping a stage unlocks the next one without XP', () => {
    const s0 = createInitialState(T0)
    const s1 = skipStage(s0, 'N7-1', T0)
    expect(s1.stages['N7-1']).toMatchObject({ completed: true, skipped: true })
    expect(isStageUnlocked(s1, 'N7', 2)).toBe(true)
    expect(s1.xp).toBe(0)
    // Locked stages cannot be skipped.
    expect(skipStage(s0, 'N7-3', T0)).toBe(s0)
  })

  it('placement test: 12 questions from the level below, harder ones first', () => {
    const plan = createPlacementSession('N5')!
    expect(plan.kind).toBe('placement')
    expect(plan.allowRetry).toBe(false)
    expect(plan.questionIds).toHaveLength(12)
    expect(plan.questionIds.every((id) => id.startsWith('n6-'))).toBe(true)
    expect(createPlacementSession('N7')).toBeNull()
  })

  it('passing the placement test (≥80%) unlocks the target and completes earlier levels', () => {
    const plan = createPlacementSession('N5')!
    const { state, summary } = play(createInitialState(T0), plan, plan.questionIds.slice(0, 2)) // 10/12
    expect(summary.placement).toMatchObject({ target: 'N5', passed: true })
    expect(isLevelCompleted(state, 'N7')).toBe(true)
    expect(isLevelCompleted(state, 'N6')).toBe(true)
    expect(isLevelUnlocked(state, 'N5')).toBe(true)
    expect(currentPosition(state)).toMatchObject({ level: 'N5', stage: 1 })
  })

  it('failing the placement test (<80%) unlocks nothing', () => {
    const plan = createPlacementSession('N5')!
    const { state, summary } = play(createInitialState(T0), plan, plan.questionIds.slice(0, 3)) // 9/12
    expect(summary.placement?.passed).toBe(false)
    expect(isLevelUnlocked(state, 'N5')).toBe(false)
    expect(Object.keys(state.stages)).toHaveLength(0)
  })
})
