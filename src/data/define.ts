import type { LevelId, Question } from '../types'

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type QuestionDraft = DistributiveOmit<Question, 'level' | 'stage'>

/** Attach level / stage to a list of question drafts. IDs stay explicit and stable. */
export function stage(level: LevelId, stageNo: number, drafts: QuestionDraft[]): Question[] {
  return drafts.map((d) => ({ ...d, level, stage: stageNo }) as Question)
}
