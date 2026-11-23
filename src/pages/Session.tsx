import { useCallback, useEffect, useState } from 'react'
import type { Grade, ReviewRecord } from '../types'
import { getQuestion, CATEGORY_LABELS } from '../data'
import { levelById, stageKey } from '../data/levels'
import { PLACEMENT_PASS, PROGRESSION, type SessionSummary } from '../engine/progress'
import { createStageSession } from '../engine/session'
import { store, useAppState } from '../state/store'
import { navigate } from '../state/router'
import { QuestionView, Txt, correctAnswerText, fullJapanese, speakableText, type AnswerState } from '../components/QuestionView'
import { SpeakButton } from '../components/AudioControls'
import { Button, Card, Ja, ProgressBar, cx, pct } from '../components/ui'

interface Outcome {
  xp: number
  goalReached: boolean
  previousRecord: ReviewRecord | undefined
  combo: number
  isRetry: boolean
}

export function SessionPage() {
  const state = useAppState()
  const active = state.activeSession
  const [answered, setAnswered] = useState<AnswerState | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [rating, setRating] = useState<Grade>('good')
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [summaryTitle, setSummaryTitle] = useState('')
  const [missedIds, setMissedIds] = useState<string[]>([])
  const [confirmQuit, setConfirmQuit] = useState(false)

  // While feedback is shown, the "current" question is the one just answered.
  const index = active ? active.results.length - (answered ? 1 : 0) : 0
  const qid = active?.session.questionIds[index] ?? null
  const question = qid ? getQuestion(qid) : undefined

  const finish = useCallback(() => {
    const a = store.get().activeSession
    const title = a?.session.title ?? ''
    const missed = [...new Set((a?.results ?? []).filter((r) => !r.correct && !r.isRetry).map((r) => r.questionId))]
    const s = store.finishSession()
    if (s) {
      setSummaryTitle(title)
      setMissedIds(missed)
      setSummary(s)
    }
  }, [])

  // Nothing to show (e.g. reloaded on the results screen): go home instead of an empty page.
  useEffect(() => {
    if (!active && !summary) navigate('home')
  }, [active, summary])

  // Session exhausted (e.g. restored after reload on the last question): finish it.
  useEffect(() => {
    if (active && !answered && !qid) finish()
  }, [active, answered, qid, finish])

  // Unknown question id (content removed): skip it safely.
  useEffect(() => {
    if (active && qid && !question && !answered) store.answer(true, '(skipped)')
  }, [active, qid, question, answered])

  const onAnswer = useCallback((correct: boolean, given: string) => {
    const out = store.answer(correct, given)
    if (!out) return
    setAnswered({ correct, given })
    setOutcome({ xp: out.xp, goalReached: out.goalReached, previousRecord: out.previousRecord, combo: out.combo, isRetry: out.isRetry })
    setRating('good')
  }, [])

  const next = useCallback(() => {
    setAnswered(null)
    setOutcome(null)
    const a = store.get().activeSession
    if (a && a.results.length >= a.session.questionIds.length) finish()
  }, [finish])

  useEffect(() => {
    if (!answered) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [answered, next])

  if (summary) return <Summary summary={summary} title={summaryTitle} missedIds={missedIds} onRestart={() => setSummary(null)} />

  if (!active) {
    return (
      <Card className="text-center">
        <p className="mb-4 text-stone-600">当前没有进行中的学习。</p>
        <Button onClick={() => navigate('home')}>回到首页</Button>
      </Card>
    )
  }

  const total = active.session.questionIds.length
  const done = active.results.length
  const changeRating = (g: Grade) => {
    if (!question || !outcome) return
    setRating(g)
    store.regrade(question.id, outcome.previousRecord, g)
  }

  return (
    <div className="mx-auto max-w-2xl pb-28">
      <div className="sticky top-0 z-10 -mx-4 mb-4 bg-stone-50/95 px-4 pt-2 pb-3 backdrop-blur dark:bg-ink-950/95">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => (done ? setConfirmQuit(true) : (store.discardSession(), navigate('home')))} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800" aria-label="退出学习">
            ✕
          </button>
          <ProgressBar value={done / total} label="本次学习进度" />
          <span className="shrink-0 text-sm tabular-nums text-stone-500">
            {Math.min(done + (answered ? 0 : 1), total)}/{total}
          </span>
        </div>
        <p className="mt-1 truncate pl-13 text-xs text-stone-500">{active.session.title}</p>
      </div>

      {confirmQuit && (
        <Card className="mb-4 border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40">
          <p className="mb-3 text-sm">现在结束吗？已经回答的题目和复习记录都会保存。关卡需要完成 {pct(PROGRESSION.minCompletion)} 的题目才会评定。</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setConfirmQuit(false)}>继续学习</Button>
            <Button onClick={() => { setConfirmQuit(false); setAnswered(null); finish() }}>结束并查看结果</Button>
          </div>
        </Card>
      )}

      {question && (
        <Card flush className="p-5 sm:p-6">
          {outcome?.isRetry && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">再试一次：刚才答错的题</p>}
          <QuestionView question={question} order={active.session.optionOrder[question.id] ?? []} answered={answered} onAnswer={onAnswer} />
        </Card>
      )}

      {answered && question && outcome && (
        <Feedback question={question} answered={answered} outcome={outcome} rating={rating} onRate={changeRating} />
      )}

      {answered && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 p-3 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-stone-800 dark:bg-stone-900/95">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <div className={cx('flex-1 font-semibold', answered.correct ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
              {answered.correct ? '正解！' : '不正解'}
              {outcome && outcome.xp > 0 && <span className="anim-pop ml-2 inline-block rounded-full bg-accent-100 px-2 py-0.5 text-sm text-accent-700 dark:bg-accent-700/30 dark:text-accent-200">+{outcome.xp} XP</span>}
            </div>
            <Button className="min-w-32" onClick={next} autoFocus>
              {done >= total ? '查看结果' : '继续'} →
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Feedback({ question: q, answered, outcome, rating, onRate }: { question: NonNullable<ReturnType<typeof getQuestion>>; answered: AnswerState; outcome: Outcome; rating: Grade; onRate: (g: Grade) => void }) {
  const full = fullJapanese(q)
  const speak = speakableText(q)
  const notes = q.format === 'choice' ? Object.entries(q.optionNotes ?? {}).filter(([opt]) => answered.correct || opt !== answered.given) : []
  const pickedNote = q.format === 'choice' && !answered.correct ? q.optionNotes?.[answered.given] : undefined

  return (
    <div className={cx('anim-rise mt-4 space-y-4 rounded-2xl border p-5', answered.correct ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20' : 'border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20')} aria-live="polite">
      {!answered.correct && (
        <div>
          <div className="text-xs font-medium text-stone-500">正确答案</div>
          <div className="mt-0.5 text-lg font-semibold">
            <Txt text={correctAnswerText(q)} />
          </div>
          {q.format === 'order' && answered.given && (
            <div className="mt-1 text-sm text-stone-500">
              你的答案：<Ja className="line-through decoration-red-400">{answered.given}</Ja>
            </div>
          )}
          {pickedNote && <p className="mt-2 rounded-lg bg-white/70 p-2.5 text-sm dark:bg-stone-900/50">你选的「<Txt text={answered.given} />」：{pickedNote}</p>}
        </div>
      )}

      {(full || speak) && (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {full && (
              <p lang="ja" className="whitespace-pre-line text-lg leading-relaxed">
                {full}
              </p>
            )}
            {q.fullTextZh && <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">{q.fullTextZh}</p>}
            {q.type === 'conversation' && q.dialogue && (
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">{q.dialogue.map((l) => l.zh).filter(Boolean).join(' / ')}</p>
            )}
            {q.type === 'fill' && q.chinese && <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">{q.chinese}</p>}
          </div>
          {speak && <SpeakButton text={speak} />}
        </div>
      )}

      {q.type === 'vocab' && q.reading && (
        <p className="text-sm">
          读音：<Ja className="font-medium">{q.reading}</Ja>
        </p>
      )}

      <div>
        <div className="mb-1 text-xs font-semibold text-stone-500">解说</div>
        <p className="text-[15px] leading-relaxed">{q.explanation}</p>
      </div>

      {notes.length > 0 && (
        <details className="group rounded-lg bg-white/60 p-3 text-sm dark:bg-stone-900/40" open={!answered.correct && notes.length > 1}>
          <summary className="cursor-pointer font-medium text-stone-600 dark:text-stone-300">为什么其他选项不对？</summary>
          <ul className="mt-2 space-y-1.5">
            {notes.map(([opt, note]) => (
              <li key={opt}>
                <Txt text={opt} className="font-medium" />：{note}
              </li>
            ))}
          </ul>
        </details>
      )}

      {q.example && (
        <div className="rounded-lg bg-white/60 p-3 text-sm dark:bg-stone-900/40">
          <div className="mb-1 text-xs font-semibold text-stone-500">例句</div>
          <div className="flex items-start gap-1">
            <div className="flex-1">
              <Ja className="text-base">{q.example.ja}</Ja>
              {q.example.reading && <div lang="ja" className="text-xs text-stone-500">{q.example.reading}</div>}
              <div className="mt-0.5 text-stone-600 dark:text-stone-300">{q.example.zh}</div>
            </div>
            <SpeakButton text={q.example.ja.replace(/^[AB]：|\s[AB]：/g, ' ')} />
          </div>
        </div>
      )}

      {!answered.correct && (
        <p className="text-xs text-stone-500">已加入复习：10 分钟后可以复习这道题，之后会按记忆曲线安排。</p>
      )}
      {answered.correct && !outcome.isRetry && (
        <div>
          <div className="mb-1.5 text-xs text-stone-500">这道题对你来说难吗？（影响下次复习时间）</div>
          <div className="flex gap-2" role="group" aria-label="自我评价">
            {(
              [
                ['hard', '有点难'],
                ['good', '正常'],
                ['easy', '很简单'],
              ] as [Grade, string][]
            ).map(([g, label]) => (
              <button
                key={g}
                type="button"
                onClick={() => onRate(g)}
                aria-pressed={rating === g}
                className={cx('min-h-10 flex-1 rounded-lg border text-sm font-medium', rating === g ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900' : 'border-stone-300 bg-white dark:border-stone-700 dark:bg-stone-900')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {outcome.goalReached && <p className="anim-pop rounded-lg bg-accent-100 p-2.5 text-center text-sm font-medium text-accent-700 dark:bg-accent-700/30 dark:text-accent-200">🎯 完成今日目标！+25 XP</p>}
      {outcome.combo >= 5 && outcome.combo % 5 === 0 && <p className="text-center text-sm font-medium text-accent-600">🔥 连续答对 {outcome.combo} 题！</p>}
      <p className="text-[11px] text-stone-400">{CATEGORY_LABELS[q.category].zh} · {q.id}</p>
    </div>
  )
}

function Summary({ summary: s, title, missedIds, onRestart }: { summary: SessionSummary; title: string; missedIds: string[]; onRestart: () => void }) {
  const [showLevelUp, setShowLevelUp] = useState(!!s.levelCompleted)
  const st = s.stage
  const nextKey = s.unlockedStage ? stageKey(s.unlockedStage.level, s.unlockedStage.stage) : s.unlockedLevel ? stageKey(s.unlockedLevel, 1) : null
  const start = (key: string) => {
    store.startSession(createStageSession(key))
    onRestart()
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {showLevelUp && s.levelCompleted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" role="dialog" aria-modal="true" aria-label="升级">
          <div className="anim-pop w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-2xl dark:bg-stone-900">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-accent-500 text-3xl font-bold text-white anim-glow">{s.levelCompleted}</div>
            <h2 className="text-2xl font-bold">
              <Ja>レベルクリア！</Ja>
            </h2>
            <p className="mt-2 text-stone-600 dark:text-stone-300">
              {s.levelCompleted}「<Ja>{levelById(s.levelCompleted).title}</Ja>」全部通关
            </p>
            {s.unlockedLevel && (
              <p className="mt-3 rounded-xl bg-stone-100 p-3 text-sm dark:bg-stone-800">
                已解锁 <span className="font-semibold">{s.unlockedLevel}</span>：<Ja>{levelById(s.unlockedLevel).title}</Ja>（{levelById(s.unlockedLevel).subtitle}）
              </p>
            )}
            <Button className="mt-6 w-full" onClick={() => setShowLevelUp(false)}>
              太好了
            </Button>
          </div>
        </div>
      )}

      <Card className="text-center">
        <p className="text-sm text-stone-500">{title}</p>
        <h1 className="mt-1 text-2xl font-bold">
          {s.placement ? (s.placement.passed ? <Ja>合格！</Ja> : <Ja>もう少し！</Ja>) : st ? (st.passed ? <Ja>ステージクリア！</Ja> : <Ja>もう少し！</Ja>) : <Ja>おつかれさま！</Ja>}
        </h1>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div>
            <div className="text-3xl font-semibold tabular-nums">{s.answered ? pct(s.accuracy) : '—'}</div>
            <div className="text-xs text-stone-500">正确率</div>
          </div>
          <div>
            <div className="text-3xl font-semibold tabular-nums">
              {s.correct}/{s.answered}
            </div>
            <div className="text-xs text-stone-500">答对</div>
          </div>
          <div>
            <div className="anim-pop text-3xl font-semibold text-accent-600 tabular-nums">+{s.xpEarned + s.bonusXp}</div>
            <div className="text-xs text-stone-500">XP</div>
          </div>
        </div>
        {s.bonusXp > 0 && (
          <p className="mt-3 text-sm text-stone-600 dark:text-stone-300">
            含奖励 +{s.bonusXp} XP
            {st?.firstClear && '（首次通关）'}
            {st?.perfect && '（全对）'}
            {s.reviewBonus && '（完成复习）'}
          </p>
        )}
      </Card>

      {s.placement && (
        <Card>
          {s.placement.passed ? (
            <p className="text-sm">
              ✅ 跳级测试通过（{s.placement.correct}/{s.placement.total}，要求 ≥ {pct(PLACEMENT_PASS)}）。{s.placement.target} 已解锁，之前的等级全部算作通关。
            </p>
          ) : (
            <p className="text-sm">
              {s.placement.correct}/{s.placement.total} 题正确，需要 {pct(PLACEMENT_PASS)} 以上才能跳级。答错的题已加入复习。建议从前面的等级开始，或复习后再挑战。
            </p>
          )}
        </Card>
      )}

      {st && (
        <Card>
          {st.passed ? (
            <p className="text-sm">
              ✅ 关卡通过（正确率 {pct(st.accuracy)}，要求 ≥ {pct(PROGRESSION.minAccuracy)}）。
              {s.unlockedStage && <> 已解锁下一关。</>}
            </p>
          ) : st.completion < PROGRESSION.minCompletion ? (
            <p className="text-sm">本次只完成了 {st.answered}/{st.total} 题，需要完成至少 {pct(PROGRESSION.minCompletion)} 才能评定关卡。</p>
          ) : (
            <p className="text-sm">
              正确率 {pct(st.accuracy)}，需要达到 {pct(PROGRESSION.minAccuracy)} 才能通关。答错的题已加入复习，复习后再挑战吧。
            </p>
          )}
        </Card>
      )}

      {missedIds.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">本次答错的题</h2>
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {missedIds.map((id) => {
                const q = getQuestion(id)
                if (!q) return null
                return (
                  <li key={id} className="py-2 text-sm">
                    <div lang="ja" className="truncate text-stone-600 dark:text-stone-300">
                      {q.japanese?.replace('___', '（ ）') ?? q.chinese ?? q.question ?? q.situation ?? q.prompt}
                    </div>
                    <div>
                      正确：<Txt text={correctAnswerText(q)} className="font-medium text-emerald-700 dark:text-emerald-400" />
                    </div>
                  </li>
                )
              })}
          </ul>
        </Card>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        {nextKey && (
          <Button className="flex-1" onClick={() => start(nextKey)}>
            下一关 →
          </Button>
        )}
        {s.placement?.passed && (
          <Button className="flex-1" onClick={() => start(stageKey(s.placement!.target, 1))}>
            开始 {s.placement.target} 第 1 关 →
          </Button>
        )}
        {st && !st.passed && (
          <Button className="flex-1" onClick={() => start(st.key)}>
            再挑战一次
          </Button>
        )}
        <Button variant="secondary" className="flex-1" onClick={() => navigate('home')}>
          回到首页
        </Button>
      </div>
    </div>
  )
}
