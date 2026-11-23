import type { LevelMeta, LevelId } from '../types'

export const LEVEL_ORDER: LevelId[] = ['N7', 'N6', 'N5', 'N4', 'N3', 'N2', 'N1']

export const LEVELS: LevelMeta[] = [
  {
    id: 'N7',
    title: 'はじめの一歩',
    subtitle: '零基础',
    description: '平假名、片假名、问候语、数字和最基础的词汇。（N7、N6 为本应用自定义等级，非 JLPT 官方等级）',
    stages: [
      { number: 1, title: 'ひらがなとあいさつ', titleZh: '平假名与问候' },
      { number: 2, title: 'カタカナと数字', titleZh: '片假名与数字' },
      { number: 3, title: 'はじめての単語', titleZh: '第一批单词' },
    ],
  },
  {
    id: 'N6',
    title: '自己紹介',
    subtitle: '入门',
    description: '基础名词、动词、形容词，能做简单的自我介绍、描述身边的事物。',
    stages: [
      { number: 1, title: '自己紹介', titleZh: '自我介绍' },
      { number: 2, title: '動詞と形容詞', titleZh: '动词与形容词' },
      { number: 3, title: 'もの・場所', titleZh: '物品与地点' },
    ],
  },
  {
    id: 'N5',
    title: '毎日の日本語',
    subtitle: '初级',
    description: '日常句子、助词的基本用法、动词的ます形・て形・ない形。',
    stages: [
      { number: 1, title: '助詞の基本', titleZh: '助词基础' },
      { number: 2, title: '動詞の活用', titleZh: '动词变形' },
      { number: 3, title: '毎日の生活', titleZh: '日常生活' },
    ],
  },
  {
    id: 'N4',
    title: '会話のはじまり',
    subtitle: '初中级',
    description: '日常会话、过去形与否定形、请求与许可、邀约与委婉拒绝。',
    stages: [
      { number: 1, title: '過去と否定', titleZh: '过去形与否定形' },
      { number: 2, title: 'お願いと許可', titleZh: '请求与许可' },
      { number: 3, title: '予定と誘い', titleZh: '计划与邀约' },
    ],
  },
  {
    id: 'N3',
    title: '自然な会話',
    subtitle: '中级',
    description: '表达感情和意见、附和语、在医院・电车・职场等场景中自然交流。',
    stages: [
      { number: 1, title: '気持ちを伝える', titleZh: '表达感受' },
      { number: 2, title: '意見と相づち', titleZh: '意见与附和' },
      { number: 3, title: '場面の会話', titleZh: '场景会话' },
    ],
  },
  {
    id: 'N2',
    title: 'ニュアンス',
    subtitle: '高级',
    description: '敬语与商务日语、近义表达的语感差异、灵活自然的会话。',
    stages: [
      { number: 1, title: '敬語とビジネス', titleZh: '敬语与商务' },
      { number: 2, title: '言葉のニュアンス', titleZh: '语感差异' },
      { number: 3, title: '自然な流れ', titleZh: '自然的会话流' },
    ],
  },
  {
    id: 'N1',
    title: '行間を読む',
    subtitle: '精通',
    description: '言外之意、地道的措辞、日本文化中的沟通方式。',
    stages: [
      { number: 1, title: '言外の意味', titleZh: '言外之意' },
      { number: 2, title: '自然な言い回し', titleZh: '地道的说法' },
      { number: 3, title: '文化とニュアンス', titleZh: '文化与语感' },
    ],
  },
]

export const levelById = (id: LevelId) => LEVELS.find((l) => l.id === id)!

export const stageKey = (level: LevelId, stage: number) => `${level}-${stage}`

export function parseStageKey(key: string): { level: LevelId; stage: number } {
  const [level, stage] = key.split('-')
  return { level: level as LevelId, stage: Number(stage) }
}
