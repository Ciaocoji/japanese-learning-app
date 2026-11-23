import { useState } from 'react'
import { LEVELS, LEVEL_ORDER, stageKey } from '../data/levels'
import { questionsForStage } from '../data'
import { PLACEMENT_PASS, PROGRESSION, isLevelCompleted, isLevelUnlocked, isStageUnlocked, levelProgress } from '../engine/progress'
import { PLACEMENT_PER_STAGE, createPlacementSession, createStageSession } from '../engine/session'
import { store, useAppState } from '../state/store'
import { Badge, Button, Card, Ja, ProgressBar, cx, pct } from '../components/ui'
import { startSession } from './Home'

export function LevelsPage() {
  const state = useAppState()
  const [confirmSkip, setConfirmSkip] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">
        每关正确率达到 {pct(PROGRESSION.minAccuracy)} 即可通关并解锁下一关；一个等级的所有关卡通关后，解锁下一个等级。
        已经有基础？可以对未解锁的等级做「跳级测试」，或者直接跳过某一关。
      </p>
      {LEVELS.map((lvl) => {
        const unlocked = isLevelUnlocked(state, lvl.id)
        const completed = isLevelCompleted(state, lvl.id)
        const lp = levelProgress(state, lvl.id)
        const prev = LEVEL_ORDER[LEVEL_ORDER.indexOf(lvl.id) - 1]
        return (
          <Card key={lvl.id} aria-label={`${lvl.id}${unlocked ? '' : '（未解锁）'}`}>
            <div className={cx('flex items-start gap-4', !unlocked && 'opacity-60')}>
              <div className={cx('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold', completed ? 'bg-emerald-500 text-white' : unlocked ? 'bg-accent-500 text-white' : 'bg-stone-200 text-stone-500 dark:bg-stone-800')}>
                {lvl.id}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">
                    <Ja>{lvl.title}</Ja>
                  </h2>
                  <Badge>{lvl.subtitle}</Badge>
                  {completed && <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">已通关</Badge>}
                  {!unlocked && <Badge>🔒 未解锁</Badge>}
                </div>
                <p className="mt-1 text-sm text-stone-500">{lvl.description}</p>
                <ProgressBar value={lp.done / lp.total} className="mt-3" tone={completed ? 'emerald' : 'accent'} label={`${lvl.id} 进度`} />
              </div>
            </div>

            {!unlocked && prev && (
              <div className="mt-4 flex flex-col gap-2 rounded-xl bg-stone-100 p-3 sm:flex-row sm:items-center dark:bg-stone-800/60">
                <p className="flex-1 text-sm text-stone-600 dark:text-stone-300">
                  跳级测试：从 {prev} 出 {PLACEMENT_PER_STAGE * 3} 道较难的题，答对 {pct(PLACEMENT_PASS)} 以上即直接解锁 {lvl.id}（之前的等级全部算作通关）。
                </p>
                <Button variant="secondary" onClick={() => startSession(createPlacementSession(lvl.id))}>
                  跳级测试
                </Button>
              </div>
            )}

            {unlocked && (
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {lvl.stages.map((s) => {
                  const key = stageKey(lvl.id, s.number)
                  const sp = state.stages[key]
                  const open = isStageUnlocked(state, lvl.id, s.number)
                  const count = questionsForStage(lvl.id, s.number).length
                  const canSkip = open && !sp?.completed
                  return (
                    <div
                      key={key}
                      className={cx(
                        'flex flex-col rounded-xl border-2 transition-colors',
                        sp?.completed ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30' : open ? 'border-accent-200 bg-accent-50/60 dark:border-accent-700/50 dark:bg-accent-700/10' : 'border-stone-200 dark:border-stone-800',
                      )}
                    >
                      <button
                        type="button"
                        disabled={!open}
                        onClick={() => startSession(createStageSession(key))}
                        className="flex min-h-16 flex-1 flex-col items-start rounded-xl p-3 text-left enabled:hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-60 dark:enabled:hover:bg-stone-800/40"
                        aria-label={`第${s.number}关 ${s.titleZh}${open ? '' : '（未解锁）'}`}
                      >
                        <span className="text-xs text-stone-500">
                          第 {s.number} 关 · {count} 题 {!open && '🔒'}
                        </span>
                        <Ja className="font-medium">{s.title}</Ja>
                        <span className="text-xs text-stone-500">{s.titleZh}</span>
                        {sp?.skipped && !sp.attempts ? (
                          <span className="mt-1 text-[11px] text-stone-500">已跳过</span>
                        ) : (
                          sp && (
                            <span className="mt-1 text-[11px] text-stone-500">
                              最佳 {pct(sp.bestAccuracy)} {sp.perfect ? '⭐' : sp.completed ? '✓' : ''}
                            </span>
                          )
                        )}
                      </button>
                      {canSkip &&
                        (confirmSkip === key ? (
                          <div className="space-y-2 border-t border-accent-200 p-3 text-xs dark:border-accent-700/40">
                            <p>跳过后直接解锁下一关，不获得 XP，题目也不会进入复习。确定吗？</p>
                            <div className="flex gap-2">
                              <button type="button" className="min-h-9 flex-1 rounded-lg border border-stone-300 bg-white dark:border-stone-700 dark:bg-stone-900" onClick={() => setConfirmSkip(null)}>
                                取消
                              </button>
                              <button
                                type="button"
                                className="min-h-9 flex-1 rounded-lg bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                                onClick={() => {
                                  store.skipStage(key)
                                  setConfirmSkip(null)
                                }}
                              >
                                跳过
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setConfirmSkip(key)} className="min-h-10 border-t border-accent-200 text-xs text-stone-500 hover:text-stone-900 dark:border-accent-700/40 dark:hover:text-stone-100" aria-label={`跳过第${s.number}关`}>
                            跳过这一关 ›
                          </button>
                        ))}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
