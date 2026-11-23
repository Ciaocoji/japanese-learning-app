import type { AppState, Category, Question, QuestionType, ReviewRecord, SessionPlan } from '../types'
import { ALL_QUESTIONS, GRAMMAR_CATEGORIES, getQuestion, questionsByStageKey, TYPE_LABELS } from '../data'
import { levelById, parseStageKey, stageKey } from '../data/levels'
import { buildReviewQueue, isWeak } from './srs'
import { currentPosition, isLevelUnlocked, isStageUnlocked } from './progress'

export type Rng = () => number

export function shuffle<T>(arr: readonly T[], rng: Rng = Math.random): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Fix the presentation order of options / tiles for each question (stored with the session). */
export function buildOptionOrder(ids: string[], rng: Rng = Math.random): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const id of ids) {
    const q = getQuestion(id)
    if (!q) continue
    if (q.format === 'choice') out[id] = shuffle(q.options, rng)
    else if (q.format === 'order') {
      let tiles = shuffle([...q.tiles, ...(q.distractors ?? [])], rng)
      // Avoid presenting the tiles already in the correct order.
      if (tiles.join('') === q.tiles.join('') && tiles.length > 1) tiles = [...tiles.slice(1), tiles[0]]
      out[id] = tiles
    } else out[id] = shuffle(q.pairs.map((p) => p.zh), rng)
  }
  return out
}

function plan(kind: SessionPlan['kind'], title: string, ids: string[], extra: Partial<SessionPlan> = {}, rng?: Rng): SessionPlan {
  const unique = [...new Set(ids)].filter((id) => getQuestion(id))
  return { kind, title, questionIds: unique, optionOrder: buildOptionOrder(unique, rng), allowRetry: kind !== 'stage', retried: [], ...extra }
}

export function createStageSession(key: string, rng?: Rng): SessionPlan {
  const { level, stage } = parseStageKey(key)
  const meta = levelById(level).stages.find((s) => s.number === stage)
  const ids = questionsByStageKey(key).map((q) => q.id)
  return plan('stage', `${level} · ${meta?.titleZh ?? `第${stage}关`}`, ids, { stageKey: key, stageQuestionIds: ids }, rng)
}

export type ReviewFilter = 'all' | 'vocabulary' | 'grammar' | 'conversation' | 'listening' | 'mistakes'

export const REVIEW_FILTERS: { id: ReviewFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'vocabulary', label: '词汇' },
  { id: 'grammar', label: '语法' },
  { id: 'conversation', label: '会话' },
  { id: 'listening', label: '听力' },
  { id: 'mistakes', label: '错题' },
]

export function matchesFilter(q: Question | undefined, r: ReviewRecord, filter: ReviewFilter): boolean {
  if (!q) return false
  switch (filter) {
    case 'all':
      return true
    case 'vocabulary':
      return q.category === 'vocabulary' || q.category === 'kana'
    case 'grammar':
      return (GRAMMAR_CATEGORIES as Category[]).includes(q.category)
    case 'conversation':
      return q.category === 'conversation' || q.type === 'situation' || q.type === 'conversation'
    case 'listening':
      return q.category === 'listening' || q.type === 'listening'
    case 'mistakes':
      return r.incorrect > 0
  }
}

export const REVIEW_SESSION_SIZE = 15

/**
 * Review queue for a filter. Due items come first in priority order. The "mistakes"
 * filter also pulls in weak items that are not yet due, so learners can drill them.
 */
export function reviewQueue(state: AppState, filter: ReviewFilter, now: number, limit = REVIEW_SESSION_SIZE): string[] {
  const f = (r: ReviewRecord) => matchesFilter(getQuestion(r.questionId), r, filter)
  const due = buildReviewQueue(state.records, now, { filter: f })
  if (filter === 'mistakes' && due.length < limit) {
    const extra = Object.values(state.records)
      .filter((r) => !due.includes(r.questionId) && f(r) && isWeak(r))
      .sort((a, b) => b.incorrect - a.incorrect || (b.lastIncorrect ?? 0) - (a.lastIncorrect ?? 0))
      .map((r) => r.questionId)
    return [...due, ...extra].slice(0, limit)
  }
  return due.slice(0, limit)
}

export function createReviewSession(state: AppState, filter: ReviewFilter, now: number, rng?: Rng): SessionPlan | null {
  const ids = reviewQueue(state, filter, now)
  if (!ids.length) return null
  const label = REVIEW_FILTERS.find((f) => f.id === filter)?.label ?? ''
  return plan('review', filter === 'all' ? '复习' : `复习 · ${label}`, ids, {}, rng)
}

export const DAILY_REVIEW_LIMIT = 8

/** Today's recommended session: due reviews first (warm-up), then the current stage. */
export function createDailySession(state: AppState, now: number, rng?: Rng): SessionPlan {
  const reviews = reviewQueue(state, 'all', now, DAILY_REVIEW_LIMIT)
  const pos = currentPosition(state)
  if (pos.allDone) {
    const extra = reviewQueue(state, 'mistakes', now, REVIEW_SESSION_SIZE)
    const ids = [...new Set([...reviews, ...extra])]
    if (ids.length) return plan('daily', '今日の学習', ids, {}, rng)
    // Everything learned and nothing due: a mixed practice of the hardest content.
    return plan('daily', '今日の学習', shuffle(ALL_QUESTIONS.filter((q) => q.level === 'N1'), rng).slice(0, 10).map((q) => q.id), {}, rng)
  }
  const key = stageKey(pos.level, pos.stage)
  const stageIds = questionsByStageKey(key).map((q) => q.id)
  const reviewIds = reviews.filter((id) => !stageIds.includes(id))
  const meta = levelById(pos.level).stages.find((s) => s.number === pos.stage)
  return plan('daily', `今日の学習 · ${pos.level} ${meta?.titleZh ?? ''}`, [...reviewIds, ...stageIds], { stageKey: key, stageQuestionIds: stageIds }, rng)
}

/** Practice one learning mode across unlocked content: unseen first, then weak, then the rest. */
export function createPracticeSession(state: AppState, type: QuestionType, now: number, rng?: Rng, size = 10): SessionPlan | null {
  const pool = ALL_QUESTIONS.filter((q) => q.type === type && isStageUnlocked(state, q.level, q.stage) && isLevelUnlocked(state, q.level))
  if (!pool.length) return null
  const unseen = shuffle(pool.filter((q) => !state.records[q.id]), rng)
  const weak = pool.filter((q) => state.records[q.id] && isWeak(state.records[q.id]))
  const rest = shuffle(pool.filter((q) => state.records[q.id] && !isWeak(state.records[q.id])), rng)
  const ids = [...weak, ...unseen, ...rest].slice(0, size).map((q) => q.id)
  void now
  return plan('practice', `${TYPE_LABELS[type].zh}练习`, ids, {}, rng)
}

export function countPracticeAvailable(state: AppState, type: QuestionType): number {
  return ALL_QUESTIONS.filter((q) => q.type === type && isStageUnlocked(state, q.level, q.stage)).length
}
