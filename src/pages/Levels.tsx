import { LEVELS, stageKey } from '../data/levels'
import { questionsForStage } from '../data'
import { PROGRESSION, isLevelCompleted, isLevelUnlocked, isStageUnlocked, levelProgress } from '../engine/progress'
import { createStageSession } from '../engine/session'
import { useAppState } from '../state/store'
import { Badge, Card, Ja, ProgressBar, cx, pct } from '../components/ui'
import { startSession } from './Home'

export function LevelsPage() {
  const state = useAppState()
  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">
        每关正确率达到 {pct(PROGRESSION.minAccuracy)} 即可通关并解锁下一关；一个等级的所有关卡通关后，解锁下一个等级。
      </p>
      {LEVELS.map((lvl) => {
        const unlocked = isLevelUnlocked(state, lvl.id)
        const completed = isLevelCompleted(state, lvl.id)
        const lp = levelProgress(state, lvl.id)
        return (
          <Card key={lvl.id} className={cx(!unlocked && 'opacity-60')} aria-label={`${lvl.id} ${unlocked ? '' : '（未解锁）'}`}>
            <div className="flex items-start gap-4">
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
                  {!unlocked && <Badge>未解锁</Badge>}
                </div>
                <p className="mt-1 text-sm text-stone-500">{lvl.description}</p>
                <ProgressBar value={lp.done / lp.total} className="mt-3" tone={completed ? 'emerald' : 'accent'} label={`${lvl.id} 进度`} />
              </div>
            </div>
            {unlocked && (
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {lvl.stages.map((s) => {
                  const key = stageKey(lvl.id, s.number)
                  const sp = state.stages[key]
                  const open = isStageUnlocked(state, lvl.id, s.number)
                  const count = questionsForStage(lvl.id, s.number).length
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={!open}
                      onClick={() => startSession(createStageSession(key))}
                      className={cx(
                        'flex min-h-16 flex-col items-start rounded-xl border-2 p-3 text-left transition-colors',
                        sp?.completed ? 'border-emerald-200 bg-emerald-50/60 hover:border-emerald-400 dark:border-emerald-900 dark:bg-emerald-950/30' : open ? 'border-accent-200 bg-accent-50/60 hover:border-accent-400 dark:border-accent-700/50 dark:bg-accent-700/10' : 'cursor-not-allowed border-stone-200 dark:border-stone-800',
                      )}
                      aria-label={`第${s.number}关 ${s.titleZh}${open ? '' : '（未解锁）'}`}
                    >
                      <span className="text-xs text-stone-500">
                        第 {s.number} 关 · {count} 题 {!open && '🔒'}
                      </span>
                      <Ja className="font-medium">{s.title}</Ja>
                      <span className="text-xs text-stone-500">{s.titleZh}</span>
                      {sp && (
                        <span className="mt-1 text-[11px] text-stone-500">
                          最佳 {pct(sp.bestAccuracy)} {sp.perfect ? '⭐' : sp.completed ? '✓' : ''}
                        </span>
                      )}
                    </button>
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
