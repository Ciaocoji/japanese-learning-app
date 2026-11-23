import type { QuestionType } from '../types'
import { ALL_QUESTIONS, TYPE_LABELS } from '../data'
import { levelById, stageKey } from '../data/levels'
import { currentPosition } from '../engine/progress'
import { countPracticeAvailable, createPracticeSession, createStageSession } from '../engine/session'
import { useAppState } from '../state/store'
import { Button, Card, Ja, SectionTitle } from '../components/ui'
import { startSession } from './Home'

export function LearnPage() {
  const state = useAppState()
  const now = Date.now()
  const pos = currentPosition(state)
  const stage = levelById(pos.level).stages.find((s) => s.number === pos.stage)!

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle ja="続きから" zh="继续学习" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <div className="text-sm text-stone-500">{pos.level} · 第 {pos.stage} 关</div>
            <div className="text-lg font-semibold">
              <Ja>{stage.title}</Ja> <span className="text-base font-normal text-stone-500">{stage.titleZh}</span>
            </div>
          </div>
          <Button onClick={() => startSession(createStageSession(stageKey(pos.level, pos.stage)))}>{pos.allDone ? '再练最后一关' : '开始这一关'}</Button>
        </div>
      </Card>

      <div>
        <SectionTitle ja="学習モード" zh="按模式练习" />
        <p className="mb-3 text-sm text-stone-500">从已解锁的内容中出题：优先你的薄弱题，其次是没做过的题。</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(TYPE_LABELS) as QuestionType[]).map((t) => {
            const label = TYPE_LABELS[t]
            const available = countPracticeAvailable(state, t)
            const total = ALL_QUESTIONS.filter((q) => q.type === t).length
            return (
              <Card key={t} className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-stone-900 text-xl font-semibold text-white dark:bg-stone-100 dark:text-stone-900">
                  <Ja>{label.icon}</Ja>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">
                    <Ja>{label.ja}</Ja> <span className="text-sm font-normal text-stone-500">{label.zh}</span>
                  </div>
                  <div className="text-xs text-stone-500">{label.desc}</div>
                  <div className="mt-0.5 text-[11px] text-stone-400">
                    可练习 {available}/{total} 题
                  </div>
                </div>
                <Button variant="secondary" disabled={!available} onClick={() => startSession(createPracticeSession(state, t, now))} aria-label={`开始${label.zh}练习`}>
                  练习
                </Button>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
