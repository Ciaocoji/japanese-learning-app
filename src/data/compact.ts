import type { Category, DialogueLine, Example, LevelId, Question } from '../types'

/**
 * Compact authoring helpers for large question sets.
 * Every question still gets an explicit, stable id and a Chinese explanation.
 */

type Diff = 1 | 2 | 3 | 4 | 5

interface Common {
  id: string
  explanation: string
  difficulty?: Diff
  subcategory?: string
  prompt?: string
  tags?: string[]
  v?: string[] // vocabularyIds
  g?: string[] // grammarIds
  notes?: Record<string, string>
  example?: Example
}

interface Choice extends Common {
  options: string[]
  answer: string
}

/** Dialogue as [speaker, text, zh?] tuples. */
type Line = [string, string, string?]

const lines = (d: Line[]): DialogueLine[] => d.map(([speaker, text, zh]) => ({ speaker, text, ...(zh ? { zh } : {}) }))

function base(c: Common) {
  return {
    id: c.id,
    explanation: c.explanation,
    ...(c.difficulty ? { difficulty: c.difficulty } : {}),
    ...(c.subcategory ? { subcategory: c.subcategory } : {}),
    ...(c.prompt ? { prompt: c.prompt } : {}),
    ...(c.tags ? { tags: c.tags } : {}),
    ...(c.v ? { vocabularyIds: c.v } : {}),
    ...(c.g ? { grammarIds: c.g } : {}),
    ...(c.example ? { example: c.example } : {}),
  }
}

function choice(c: Choice) {
  return { ...base(c), format: 'choice' as const, options: c.options, correctAnswer: c.answer, ...(c.notes ? { optionNotes: c.notes } : {}) }
}

type Draft = Record<string, unknown> & { id: string }

/** Vocabulary: Japanese word/phrase → choose the Chinese meaning. */
export const vocab = (c: Choice & { japanese: string; reading?: string; category?: Category }): Draft => ({
  ...choice(c),
  type: 'vocab',
  category: c.category ?? 'vocabulary',
  japanese: c.japanese,
  audioText: c.reading ?? c.japanese,
  ...(c.reading ? { reading: c.reading } : {}),
})

/** Fill-in-the-blank: sentence with "___". */
export const fill = (c: Choice & { japanese: string; chinese?: string; category?: Category }): Draft => ({
  ...choice(c),
  type: 'fill',
  category: c.category ?? 'grammar',
  japanese: c.japanese,
  ...(c.chinese ? { chinese: c.chinese } : {}),
})

/** Conversation gap: exactly one "___" in the dialogue. */
export const conv = (c: Choice & { dialogue: Line[]; category?: Category }): Draft => ({
  ...choice(c),
  type: 'conversation',
  category: c.category ?? 'conversation',
  dialogue: lines(c.dialogue),
})

/** Situational response. */
export const situ = (c: Choice & { situation: string; dialogue?: Line[]; question?: string }): Draft => ({
  ...choice(c),
  type: 'situation',
  category: 'conversation',
  situation: c.situation,
  ...(c.dialogue ? { dialogue: lines(c.dialogue) } : {}),
  ...(c.question ? { question: c.question } : {}),
})

/**
 * Listening. `script` lines are "A：…" style; the transcript keeps speakers,
 * the spoken text drops them and pauses between turns.
 */
export const listen = (c: Choice & { script: string[]; question: string }): Draft => ({
  ...choice(c),
  type: 'listening',
  category: 'listening',
  prompt: c.prompt ?? (c.script.length > 1 ? '听对话，回答问题' : '听音频，回答问题'),
  japanese: c.script.join('\n'),
  audioText: c.script.map((l) => l.replace(/^[^：]{1,6}：/, '')).join('……'),
  question: c.question,
})

/** Chinese → Japanese, multiple choice. */
export const trans = (c: Choice & { chinese: string }): Draft => ({
  ...choice(c),
  type: 'translate',
  category: 'translation',
  chinese: c.chinese,
})

/** Sentence building with tiles (type "build", or "translate" when `asTranslation`). */
export const build = (c: Common & { chinese: string; tiles: string[]; answers?: string[]; distractors?: string[]; asTranslation?: boolean }): Draft => ({
  ...base(c),
  type: c.asTranslation ? 'translate' : 'build',
  format: 'order',
  category: c.asTranslation ? 'translation' : 'structure',
  prompt: c.prompt ?? (c.asTranslation ? '用词块翻译成日语' : '把词块排列成正确的句子'),
  chinese: c.chinese,
  tiles: c.tiles,
  answers: c.answers ?? [c.tiles.join('')],
  ...(c.distractors ? { distractors: c.distractors } : {}),
})

/** Attach level / stage and a default difficulty. */
export function compactStage(level: LevelId, stage: number, defaultDifficulty: Diff, drafts: Draft[]): Question[] {
  return drafts.map((d) => ({ difficulty: defaultDifficulty, ...d, level, stage }) as unknown as Question)
}
