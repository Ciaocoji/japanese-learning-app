import type { SessionPlan } from '../types'
import { TYPE_LABELS, getQuestion } from '../data'
import { levelById } from '../data/levels'
import { dateKey } from '../engine/dates'
import { currentPosition, displayStreak, levelProgress, rankInfo } from '../engine/progress'
import { createDailySession, createReviewSession, createPracticeSession } from '../engine/session'
import { reviewStats, weakestCategory, categoryAccuracies } from '../engine/analytics'
import { store, useAppState } from '../state/store'
import { navigate } from '../state/router'
import { Button, Card, Ja, ProgressBar, SectionTitle, Stat, pct } from '../components/ui'
import type { QuestionType } from '../types'

export function startSession(plan: SessionPlan | null) {
  if (!plan || !plan.questionIds.length) return
  store.startSession(plan)
  navigate('session')
}

export function HomePage() {
  const state = useAppState()
  const now = Date.now()
  const pos = currentPosition(state)
  const level = levelById(pos.level)
  const stageMeta = level.stages.find((s) => s.number === pos.stage)!
  const lp = levelProgress(state, pos.level)
  const rank = rankInfo(state.xp)
  const today = state.daily[dateKey(now)]
  const answeredToday = today?.answered ?? 0
  const goal = state.settings.dailyGoal
  const streak = displayStreak(state.streak, now)
  const rs = reviewStats(state, now)
  const weakest = weakestCategory(state)
  const { ready } = categoryAccuracies(state)
  const active = state.activeSession
  const activeAnswered = active?.results.length ?? 0

  const recommendation = (() => {
    if (rs.overdue > 0) return { text: `有 ${rs.overdue} 道题已经过了复习时间，先复习能最有效地防止遗忘。`, cta: '先复习', action: () => startSession(createReviewSession(state, 'all', now)) }
    if (weakest && rs.weakQuestions >= 3) {
      const map: Partial<Record<string, QuestionType>> = { listening: 'listening', translation: 'translate', conversation: 'conversation' }
      const t = map[weakest.category]
      if (t) return { text: `你的「${weakest.label}」正确率只有 ${pct(weakest.accuracy)}，建议做一组专项练习。`, cta: `${weakest.label}练习`, action: () => startSession(createPracticeSession(state, t, now)) }
      return { text: `你的「${weakest.label}」正确率只有 ${pct(weakest.accuracy)}，建议先复习错题。`, cta: '复习错题', action: () => startSession(createReviewSession(state, 'mistakes', now)) }
    }
    if (pos.allDone) return { text: '所有等级都已通关！保持复习，巩固记忆。', cta: '复习', action: () => startSession(createReviewSession(state, 'all', now)) }
    return { text: `继续 ${pos.level} 第 ${pos.stage} 关「${stageMeta.titleZh}」。`, cta: '开始这一关', action: () => navigate('levels') }
  })()

  return (
    <div className="space-y-5">
      {active && activeAnswered < active.session.questionIds.length && (
        <Card className="flex flex-col gap-3 border-indigo-200 bg-indigo-50 sm:flex-row sm:items-center dark:border-indigo-900 dark:bg-indigo-950/40">
          <div className="flex-1">
            <div className="font-semibold">继续上次的学习</div>
            <div className="text-sm text-stone-600 dark:text-stone-300">
              {active.session.title} · 已完成 {activeAnswered}/{active.session.questionIds.length}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => store.finishSession()}>结束</Button>
            <Button onClick={() => navigate('session')}>继续</Button>
          </div>
        </Card>
      )}

      {/* Hero: where you are + the one main action */}
      <Card flush className="overflow-hidden">
        <div className="bg-gradient-to-br from-stone-900 to-stone-700 p-5 text-white sm:p-6 dark:from-stone-800 dark:to-stone-900">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs tracking-widest text-stone-300 uppercase">当前等级</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-bold">{pos.level}</span>
                <Ja className="text-lg">{level.title}</Ja>
              </div>
              <div className="mt-1 text-sm text-stone-300">
                {pos.allDone ? '全部通关' : <>第 {pos.stage} 关 · <Ja>{stageMeta.title}</Ja>（{stageMeta.titleZh}）</>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-semibold">🔥 {streak}</div>
              <div className="text-xs text-stone-300">连续学习天数</div>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-stone-300">
              <span>等级进度 {lp.done}/{lp.total} 关</span>
              <span>Lv.{rank.rank} · 还差 {rank.toNext} XP</span>
            </div>
            <ProgressBar value={lp.done / lp.total} label="等级进度" className="bg-white/20" />
          </div>
          <Button className="mt-5 min-h-14 w-full text-lg" onClick={() => startSession(createDailySession(state, now))}>
            <Ja>今日の学習を始める</Ja>
          </Button>
          <p className="mt-2 text-center text-xs text-stone-300">
            {rs.dueNow > 0 ? `先复习 ${Math.min(rs.dueNow, 8)} 道到期题，再继续新内容` : '继续当前关卡的新内容'}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 p-4 sm:p-5">
          <Stat label="总 XP" value={state.xp} tone="accent" />
          <div>
            <Stat label={`今日 ${answeredToday}/${goal} 题`} value={pct(Math.min(1, answeredToday / goal))} tone={answeredToday >= goal ? 'good' : undefined} />
            <ProgressBar value={answeredToday / goal} tone="emerald" className="mt-1.5" label="今日目标" />
          </div>
          <Stat label="已学题目" value={rs.learned} />
        </div>
      </Card>

      {rs.learned === 0 && !active && (
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <div className="font-semibold">已经学过日语？</div>
            <p className="text-sm text-stone-600 dark:text-stone-300">不用从零开始。在「等级」页面做跳级测试，或直接跳过太简单的关卡。</p>
          </div>
          <Button variant="secondary" onClick={() => navigate('levels')}>
            跳级测试
          </Button>
        </Card>
      )}

      {/* Review */}
      <Card>
        <SectionTitle ja="復習" zh="复习" right={<button className="text-sm text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => navigate('review')}>详情 →</button>} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="今日到期" value={rs.dueToday} />
          <Stat label="已逾期" value={rs.overdue} tone={rs.overdue ? 'warn' : undefined} />
          <Stat label="薄弱词汇" value={rs.weakVocabulary} />
          <Stat label="薄弱语法" value={rs.weakGrammar} />
        </div>
        <Button className="mt-4 w-full" variant={rs.dueNow ? 'primary' : 'secondary'} disabled={!rs.dueNow} onClick={() => startSession(createReviewSession(state, 'all', now))}>
          {rs.dueNow ? `开始复习（${rs.dueNow} 题）` : rs.learned ? '暂时没有需要复习的题 ✓' : '答过题后，这里会安排复习'}
        </Button>
      </Card>

      {/* Recommendation */}
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <div className="text-xs font-semibold tracking-wide text-accent-600 uppercase">推荐</div>
          <p className="mt-1 text-sm">{recommendation.text}</p>
        </div>
        <Button variant="secondary" onClick={recommendation.action}>{recommendation.cta}</Button>
      </Card>

      {/* Weakness summary */}
      <Card>
        <SectionTitle ja="弱点分析" zh="薄弱项" right={<button className="text-sm text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => navigate('progress')}>全部 →</button>} />
        {ready.length === 0 ? (
          <p className="text-sm text-stone-500">数据还不够。每个类别至少答 5 题后，这里会显示你的正确率和薄弱项。</p>
        ) : (
          <ul className="space-y-2.5">
            {ready.slice(0, 3).map((c) => (
              <li key={c.category}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{c.label}</span>
                  <span className="tabular-nums text-stone-500">{pct(c.accuracy)}</span>
                </div>
                <ProgressBar value={c.accuracy} tone={c.accuracy < 0.7 ? 'accent' : 'emerald'} label={c.label} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Modes */}
      <Card>
        <SectionTitle ja="学習モード" zh="学习模式" right={<button className="text-sm text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => navigate('learn')}>全部 →</button>} />
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {(Object.keys(TYPE_LABELS) as QuestionType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => startSession(createPracticeSession(state, t, now))}
              className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border border-stone-200 p-2 hover:border-accent-400 hover:bg-accent-50 dark:border-stone-800 dark:hover:bg-stone-800"
            >
              <Ja className="text-xl font-semibold">{TYPE_LABELS[t].icon}</Ja>
              <span className="text-center text-xs leading-tight text-stone-600 dark:text-stone-300">{TYPE_LABELS[t].zh}</span>
            </button>
          ))}
        </div>
      </Card>

      {state.recentMistakes.length > 0 && (
        <Card>
          <SectionTitle ja="最近のミス" zh="最近的错题" />
          <ul className="divide-y divide-stone-100 text-sm dark:divide-stone-800">
            {state.recentMistakes.slice(0, 3).map((m) => {
              const q = getQuestion(m.questionId)
              if (!q) return null
              return (
                <li key={m.questionId} className="flex justify-between gap-2 py-2">
                  <span lang="ja" className="truncate">{q.japanese?.replace('___', '（ ）') ?? q.chinese ?? q.question ?? q.prompt}</span>
                  <span className="shrink-0 text-xs text-stone-400">{q.level}</span>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
