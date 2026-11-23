import type { Category, LevelId, Question, QuestionType } from '../types'
import { n7 } from './content/n7'
import { n6 } from './content/n6'
import { n5 } from './content/n5'
import { n4 } from './content/n4'
import { n3 } from './content/n3'
import { n2 } from './content/n2'
import { n1 } from './content/n1'
import { n4Extra } from './content/n4-extra'
import { n3Extra } from './content/n3-extra'
import { n2Extra } from './content/n2-extra'
import { n1Extra } from './content/n1-extra'
import { stageKey } from './levels'

export const ALL_QUESTIONS: Question[] = [...n7, ...n6, ...n5, ...n4, ...n4Extra, ...n3, ...n3Extra, ...n2, ...n2Extra, ...n1, ...n1Extra]

export const QUESTION_MAP: Map<string, Question> = new Map(ALL_QUESTIONS.map((q) => [q.id, q]))

export const getQuestion = (id: string) => QUESTION_MAP.get(id)

export function questionsForStage(level: LevelId, stage: number): Question[] {
  return ALL_QUESTIONS.filter((q) => q.level === level && q.stage === stage)
}

export function questionsByStageKey(key: string): Question[] {
  return ALL_QUESTIONS.filter((q) => stageKey(q.level, q.stage) === key)
}

export const TYPE_LABELS: Record<QuestionType, { ja: string; zh: string; icon: string; desc: string }> = {
  vocab: { ja: '単語', zh: '词汇', icon: '字', desc: '看日语选意思、配对、辨析易混词' },
  fill: { ja: '穴埋め', zh: '填空', icon: '空', desc: '选出句子里缺少的助词、变形或表达' },
  build: { ja: '文作り', zh: '组句', icon: '並', desc: '把打乱的词块排成自然的句子' },
  conversation: { ja: '会話', zh: '对话填空', icon: '話', desc: '在真实对话中补全最自然的一句' },
  situation: { ja: '場面', zh: '情景应答', icon: '場', desc: '便利店、医院、职场……选出得体的回应' },
  listening: { ja: '聞き取り', zh: '听力', icon: '聴', desc: '先听再答，可调语速、可重播' },
  translate: { ja: '中→日', zh: '中译日', icon: '訳', desc: '把中文翻译成地道的日语' },
}

export const CATEGORY_LABELS: Record<Category, { ja: string; zh: string }> = {
  vocabulary: { ja: '単語', zh: '词汇' },
  kana: { ja: '仮名', zh: '假名' },
  grammar: { ja: '文法', zh: '语法' },
  particle: { ja: '助詞', zh: '助词' },
  conjugation: { ja: '活用', zh: '动词/形容词变形' },
  structure: { ja: '文の構造', zh: '句子结构' },
  conversation: { ja: '会話', zh: '会话' },
  listening: { ja: 'リスニング', zh: '听力' },
  translation: { ja: '翻訳', zh: '翻译' },
}

/** Categories grouped as "grammar" for the weak-grammar counter. */
export const GRAMMAR_CATEGORIES: Category[] = ['grammar', 'particle', 'conjugation', 'structure']

export const DEFAULT_PROMPTS: Record<QuestionType, string> = {
  vocab: '选择正确的意思',
  fill: '选择填入空格的最佳选项',
  build: '把词块排列成正确的句子',
  conversation: '选择最自然的一句补全对话',
  situation: '选择最合适的回应',
  listening: '先听音频，再回答问题',
  translate: '选择最自然的日语翻译',
}
