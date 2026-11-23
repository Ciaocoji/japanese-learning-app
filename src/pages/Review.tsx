import { useState } from 'react'
import { getQuestion, CATEGORY_LABELS } from '../data'
import { reviewStats } from '../engine/analytics'
import { displayStreak } from '../engine/progress'
import { REVIEW_FILTERS, createReviewSession, reviewQueue, type ReviewFilter } from '../engine/session'
import { useAppState } from '../state/store'
import { Button, Card, Ja, SectionTitle, Stat, cx, pct } from '../components/ui'
import { Txt, correctAnswerText } from '../components/QuestionView'
import { startSession } from './Home'

function relativeTime(ts: number, now: number): string {
  const diff = ts - now
  const abs = Math.abs(diff)
  const m = Math.round(abs / 60000)
  const h = Math.round(abs / 3600000)
  const d = Math.round(abs / 86400000)
  const unit = m < 60 ? `${m} 分钟` : h < 24 ? `${h} 小时` : `${d} 天`
  return diff <= 0 ? `${unit}前到期` : `${unit}后`
}

export function ReviewPage() {
  const state = useAppState()
  const now = Date.now()
  const [filter, setFilter] = useState<ReviewFilter>('all')
  const rs = reviewStats(state, now)
  const queue = reviewQueue(state, filter, now, 1000)
  const upcoming = Object.values(state.records)
    .filter((r) => r.nextReview > now && getQuestion(r.questionId))
    .sort((a, b) => a.nextReview - b.nextReview)
    .slice(0, 5)

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle ja="復習" zh="复习" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="现在可复习" value={rs.dueNow} tone={rs.dueNow ? 'accent' : undefined} />
          <Stat label="今日到期" value={rs.dueToday} />
          <Stat label="已逾期" value={rs.overdue} tone={rs.overdue ? 'warn' : undefined} />
          <Stat label="复习连续天数" value={displayStreak(state.reviewStreak, now)} />
          <Stat label="薄弱词汇" value={rs.weakVocabulary} />
          <Stat label="薄弱语法" value={rs.weakGrammar} />
          <Stat label="总正确率" value={rs.accuracy === null ? '—' : pct(rs.accuracy)} />
          <Stat label="复习记忆保持率" value={rs.retention === null ? '—' : pct(rs.retention)} hint={rs.retention === null ? '需要更多复习数据' : undefined} />
        </div>
        <p className="mt-4 text-xs leading-relaxed text-stone-500">
          复习时间根据你的答题情况安排：答对后间隔逐渐延长（1 → 3 → 7 → 14 → 30 天……），答错会在 10 分钟后重新出现，并缩短之后的间隔。这是参考记忆研究设计的实用复习计划，并不能精确预测你何时会忘记。
        </p>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="复习范围">
          {REVIEW_FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              type="button"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cx('min-h-10 rounded-full px-4 text-sm font-medium', filter === f.id ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900' : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300')}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="mb-3 text-sm text-stone-600 dark:text-stone-300">
          {filter === 'mistakes' ? `错题练习：${queue.length} 题（包括还没到期的薄弱题）` : `该范围内到期的题：${queue.length} 题`}
        </p>
        <Button className="w-full" disabled={!queue.length} onClick={() => startSession(createReviewSession(state, filter, now))}>
          {queue.length ? `开始复习（本次最多 ${Math.min(queue.length, 15)} 题）` : '这个范围暂时没有需要复习的题'}
        </Button>
      </Card>

      <Card>
        <SectionTitle ja="最近のミス" zh="最近的错题" />
        {state.recentMistakes.length === 0 ? (
          <p className="text-sm text-stone-500">还没有错题。答错的题会自动记录在这里，并安排复习。</p>
        ) : (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {state.recentMistakes.slice(0, 12).map((m) => {
              const q = getQuestion(m.questionId)
              const r = state.records[m.questionId]
              if (!q) return null
              return (
                <li key={m.questionId} className="py-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div lang="ja" className="min-w-0 flex-1 truncate font-medium">
                      {q.japanese?.replace('___', '（ ）') ?? q.chinese ?? q.question ?? q.situation ?? q.prompt}
                    </div>
                    <span className="shrink-0 text-xs text-stone-400">
                      {q.level} · {CATEGORY_LABELS[q.category].zh}
                    </span>
                  </div>
                  <div className="mt-0.5 text-stone-600 dark:text-stone-300">
                    你的答案：<Txt text={m.given} className="text-red-600 dark:text-red-400" /> → 正确：<Txt text={correctAnswerText(q)} className="text-emerald-700 dark:text-emerald-400" />
                  </div>
                  {r && (
                    <div className="mt-0.5 text-xs text-stone-400">
                      错 {r.incorrect} 次 / 共 {r.attempts} 次 · 下次复习：{relativeTime(r.nextReview, now)}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {upcoming.length > 0 && (
        <Card>
          <SectionTitle ja="次の復習" zh="接下来的复习" />
          <ul className="space-y-1.5 text-sm">
            {upcoming.map((r) => {
              const q = getQuestion(r.questionId)!
              return (
                <li key={r.questionId} className="flex justify-between gap-2">
                  <Ja className="truncate">{q.japanese?.replace('___', '（ ）') ?? q.chinese ?? q.question ?? q.prompt}</Ja>
                  <span className="shrink-0 text-xs text-stone-500">
                    {relativeTime(r.nextReview, now)} · 间隔 {r.interval >= 1 ? `${r.interval} 天` : '10 分钟'}
                  </span>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
