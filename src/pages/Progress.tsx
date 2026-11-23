import { CATEGORY_LABELS, ALL_QUESTIONS } from '../data'
import { LEVELS } from '../data/levels'
import { addLocalDays, dateKey } from '../engine/dates'
import { categoryAccuracies, reviewStats, MIN_CATEGORY_SAMPLES } from '../engine/analytics'
import { displayStreak, isLevelCompleted, isLevelUnlocked, levelProgress, rankInfo } from '../engine/progress'
import { createPracticeSession, createReviewSession } from '../engine/session'
import { useAppState } from '../state/store'
import { Button, Card, Ja, ProgressBar, SectionTitle, Stat, cx, pct } from '../components/ui'
import { startSession } from './Home'

export function ProgressPage() {
  const state = useAppState()
  const now = Date.now()
  const rank = rankInfo(state.xp)
  const rs = reviewStats(state, now)
  const { ready, pending } = categoryAccuracies(state)
  const days = Array.from({ length: 14 }, (_, i) => {
    const ts = addLocalDays(now, i - 13)
    const k = dateKey(ts)
    return { k, d: new Date(ts), log: state.daily[k] }
  })
  const maxAnswered = Math.max(state.settings.dailyGoal, ...days.map((d) => d.log?.answered ?? 0))

  const practiceFor = (cat: string) => {
    if (cat === 'listening') return startSession(createPracticeSession(state, 'listening', now))
    if (cat === 'translation') return startSession(createPracticeSession(state, 'translate', now))
    return startSession(createReviewSession(state, 'mistakes', now))
  }

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle ja="学習の記録" zh="学习记录" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="总 XP" value={state.xp} tone="accent" />
          <Stat label="连续学习" value={`${displayStreak(state.streak, now)} 天`} hint={`最长 ${state.streak.best} 天`} />
          <Stat label="已学题目" value={`${rs.learned}/${ALL_QUESTIONS.length}`} />
          <Stat label="已掌握" value={rs.mastered} hint="连续答对且间隔 ≥30 天" />
        </div>
        <div className="mt-5">
          <div className="mb-1 flex justify-between text-sm">
            <span>Lv.{rank.rank}</span>
            <span className="text-stone-500">
              {rank.into}/{rank.needed} XP · 下一级还差 {rank.toNext}
            </span>
          </div>
          <ProgressBar value={rank.into / rank.needed} label="XP 里程碑" />
        </div>
      </Card>

      <Card>
        <SectionTitle ja="弱点分析" zh="薄弱项分析" />
        {ready.length === 0 ? (
          <p className="text-sm text-stone-500">数据还不够。每个类别至少需要 {MIN_CATEGORY_SAMPLES} 次作答才会显示正确率，继续学习吧。</p>
        ) : (
          <ul className="space-y-3">
            {ready.map((c, i) => (
              <li key={c.category}>
                <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span>
                    <Ja className="font-medium">{CATEGORY_LABELS[c.category].ja}</Ja> <span className="text-stone-500">{c.label}</span>
                    {i === 0 && c.accuracy < 0.85 && <span className="ml-2 rounded bg-accent-100 px-1.5 py-0.5 text-[11px] text-accent-700 dark:bg-accent-700/30 dark:text-accent-200">最薄弱</span>}
                  </span>
                  <span className="tabular-nums">
                    正答率 {pct(c.accuracy)} <span className="text-xs text-stone-400">({c.attempts} 次)</span>
                  </span>
                </div>
                <ProgressBar value={c.accuracy} tone={c.accuracy < 0.7 ? 'accent' : c.accuracy < 0.85 ? 'indigo' : 'emerald'} label={c.label} />
              </li>
            ))}
          </ul>
        )}
        {pending.length > 0 && <p className="mt-3 text-xs text-stone-400">数据不足（少于 {MIN_CATEGORY_SAMPLES} 次）：{pending.map((c) => CATEGORY_LABELS[c].zh).join('、')}</p>}
        {ready[0] && ready[0].accuracy < 0.85 && (
          <Button variant="secondary" className="mt-4 w-full" onClick={() => practiceFor(ready[0].category)}>
            针对「{ready[0].label}」练习
          </Button>
        )}
      </Card>

      <Card>
        <SectionTitle ja="最近 14 日" zh="最近两周" />
        <div className="flex h-28 items-end gap-1" aria-label="每日答题数">
          {days.map(({ k, d, log }) => {
            const n = log?.answered ?? 0
            const met = n >= state.settings.dailyGoal
            return (
              <div key={k} className="flex flex-1 flex-col items-center gap-1" title={`${k}: ${n} 题`}>
                <div className={cx('w-full rounded-t', met ? 'bg-emerald-500' : n ? 'bg-accent-400' : 'bg-stone-200 dark:bg-stone-800')} style={{ height: `${Math.max(4, (n / maxAnswered) * 88)}px` }} />
                <span className="text-[10px] text-stone-400">{d.getDate()}</span>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-stone-500">绿色 = 完成每日目标（{state.settings.dailyGoal} 题）</p>
      </Card>

      <Card>
        <SectionTitle ja="レベル" zh="等级进度" />
        <ul className="space-y-2.5">
          {LEVELS.map((l) => {
            const lp = levelProgress(state, l.id)
            const done = isLevelCompleted(state, l.id)
            const open = isLevelUnlocked(state, l.id)
            return (
              <li key={l.id} className="flex items-center gap-3 text-sm">
                <span className={cx('w-8 font-semibold', !open && 'text-stone-400')}>{l.id}</span>
                <ProgressBar value={lp.done / lp.total} tone={done ? 'emerald' : 'accent'} label={l.id} />
                <span className="w-16 shrink-0 text-right text-xs text-stone-500">{done ? '已通关' : open ? `${lp.done}/${lp.total}` : '未解锁'}</span>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
