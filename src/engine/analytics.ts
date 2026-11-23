import type { AppState, Category } from '../types'
import { CATEGORY_LABELS, GRAMMAR_CATEGORIES, getQuestion } from '../data'
import { isDue, isOverdue, isWeak } from './srs'
import { endOfDay } from './dates'

/** Minimum answers in a category before we show its accuracy. */
export const MIN_CATEGORY_SAMPLES = 5

export interface CategoryAccuracy {
  category: Category
  label: string
  attempts: number
  accuracy: number
}

export function categoryAccuracies(state: AppState): { ready: CategoryAccuracy[]; pending: Category[] } {
  const ready: CategoryAccuracy[] = []
  const pending: Category[] = []
  for (const cat of Object.keys(CATEGORY_LABELS) as Category[]) {
    const s = state.categoryStats[cat]
    if (s && s.attempts >= MIN_CATEGORY_SAMPLES) {
      ready.push({ category: cat, label: CATEGORY_LABELS[cat].zh, attempts: s.attempts, accuracy: s.correct / s.attempts })
    } else if (s && s.attempts > 0) pending.push(cat)
  }
  ready.sort((a, b) => a.accuracy - b.accuracy)
  return { ready, pending }
}

export interface ReviewStats {
  /** Available right now (includes overdue). */
  dueNow: number
  /** Scheduled for today (not overdue), some may become available later today. */
  dueToday: number
  /** Scheduled before today and still not reviewed. */
  overdue: number
  weakVocabulary: number
  weakGrammar: number
  weakQuestions: number
  learned: number
  mastered: number
  accuracy: number | null
  retention: number | null
}

export function reviewStats(state: AppState, now: number): ReviewStats {
  const records = Object.values(state.records)
  let dueNow = 0
  let dueToday = 0
  let overdue = 0
  let weakQuestions = 0
  let mastered = 0
  let attempts = 0
  let correct = 0
  const weakVocab = new Set<string>()
  const weakGrammar = new Set<string>()
  for (const r of records) {
    const q = getQuestion(r.questionId)
    if (!q) continue // content removed: keep the record but ignore it
    if (isDue(r, now)) dueNow++
    if (isOverdue(r, now)) overdue++
    else if (r.nextReview <= endOfDay(now)) dueToday++
    if (r.status === 'mastered') mastered++
    attempts += r.attempts
    correct += r.correct
    if (isWeak(r)) {
      weakQuestions++
      if (q.category === 'vocabulary' || q.category === 'kana') (q.vocabularyIds?.length ? q.vocabularyIds : [q.id]).forEach((v) => weakVocab.add(v))
      if (GRAMMAR_CATEGORIES.includes(q.category)) (q.grammarIds?.length ? q.grammarIds : [q.id]).forEach((g) => weakGrammar.add(g))
      else q.grammarIds?.forEach((g) => weakGrammar.add(g))
    }
  }
  return {
    dueNow,
    dueToday,
    overdue,
    weakVocabulary: weakVocab.size,
    weakGrammar: weakGrammar.size,
    weakQuestions,
    learned: records.length,
    mastered,
    accuracy: attempts >= MIN_CATEGORY_SAMPLES ? correct / attempts : null,
    retention: state.reviewTotals.attempts >= MIN_CATEGORY_SAMPLES ? state.reviewTotals.correct / state.reviewTotals.attempts : null,
  }
}

export function weakestCategory(state: AppState): CategoryAccuracy | null {
  const { ready } = categoryAccuracies(state)
  const w = ready[0]
  return w && w.accuracy < 0.85 ? w : null
}
