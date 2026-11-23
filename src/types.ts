// ---------------------------------------------------------------------------
// Content model
// ---------------------------------------------------------------------------

export type LevelId = 'N7' | 'N6' | 'N5' | 'N4' | 'N3' | 'N2' | 'N1'

/** Learning mode (what the exercise is about, shown to the learner). */
export type QuestionType =
  | 'vocab' // A: 単語クイズ
  | 'fill' // B: 穴埋め
  | 'build' // C: 文作りパズル
  | 'conversation' // D: 会話の穴埋め
  | 'situation' // E: 場面で答える
  | 'listening' // F: リスニング
  | 'translate' // G: 中→日

/** Interaction format (how the learner answers). */
export type AnswerFormat = 'choice' | 'order' | 'match'

/** Skill category used for weakness analysis. */
export type Category =
  | 'vocabulary'
  | 'kana'
  | 'grammar'
  | 'particle'
  | 'conjugation'
  | 'structure'
  | 'conversation'
  | 'listening'
  | 'translation'

export interface DialogueLine {
  speaker: string
  /** Japanese line. Use "___" for the gap in conversation questions. */
  text: string
  zh?: string
}

export interface Example {
  ja: string
  reading?: string
  zh: string
}

interface BaseQuestion {
  /** Stable, unique id. Never derived from text. Review history is keyed on this. */
  id: string
  level: LevelId
  stage: number
  type: QuestionType
  format: AnswerFormat
  category: Category
  subcategory?: string
  difficulty: 1 | 2 | 3 | 4 | 5
  /** Instruction line shown above the question (Chinese). Defaults per type. */
  prompt?: string
  /** Main Japanese text (word / sentence with ___ / stem). */
  japanese?: string
  /** Kana reading of the Japanese text (furigana alternative). */
  reading?: string
  /** Chinese text: meaning, or the source sentence for translation. */
  chinese?: string
  /** Situation description in Chinese (situation mode). */
  situation?: string
  dialogue?: DialogueLine[]
  /** Question asked about the audio / dialogue. */
  question?: string
  /** Text spoken by TTS. If absent, no audio for this question. */
  audioText?: string
  /** Optional recorded audio file; preferred over TTS when present. */
  audioUrl?: string
  /** Chinese explanation shown after answering. */
  explanation: string
  /** Why each wrong option is wrong (keyed by option text). */
  optionNotes?: Record<string, string>
  example?: Example
  /** Full sentence / conversation shown after answering. */
  fullText?: string
  fullTextZh?: string
  tags?: string[]
  vocabularyIds?: string[]
  grammarIds?: string[]
}

export interface ChoiceQuestion extends BaseQuestion {
  format: 'choice'
  options: string[]
  /** The correct option *text* (not an index), so shuffling can never break it. */
  correctAnswer: string
}

export interface OrderQuestion extends BaseQuestion {
  format: 'order'
  tiles: string[]
  /** Extra tiles that do not belong in the answer. */
  distractors?: string[]
  /** Accepted answers as joined strings (punctuation / spaces ignored when checking). */
  answers: string[]
}

export interface MatchPair {
  ja: string
  zh: string
}

export interface MatchQuestion extends BaseQuestion {
  format: 'match'
  pairs: MatchPair[]
}

export type Question = ChoiceQuestion | OrderQuestion | MatchQuestion

export interface StageMeta {
  number: number
  title: string
  titleZh: string
}

export interface LevelMeta {
  id: LevelId
  title: string
  subtitle: string
  description: string
  stages: StageMeta[]
}

// ---------------------------------------------------------------------------
// Learning state
// ---------------------------------------------------------------------------

export type Grade = 'again' | 'hard' | 'good' | 'easy'

export type ReviewStatus = 'learning' | 'review' | 'mastered'

export interface ReviewRecord {
  questionId: string
  attempts: number
  correct: number
  incorrect: number
  /** Consecutive correct answers. */
  streak: number
  /** Times the item was forgotten after having been recalled at least once. */
  lapses: number
  lastAnswered: number
  lastIncorrect: number | null
  lastReview: number | null
  nextReview: number
  /** Current interval in days (fractional for sub-day steps). */
  interval: number
  /** Ease factor (SM-2 style), 1.3 – 3.0. */
  ease: number
  status: ReviewStatus
}

export interface StageProgress {
  attempts: number
  bestAccuracy: number
  completed: boolean
  perfect: boolean
  lastPlayed: number
}

export interface CategoryStat {
  attempts: number
  correct: number
}

export interface Settings {
  dailyGoal: number
  showReading: boolean
  speechRate: number
  voiceURI: string | null
  theme: 'system' | 'light' | 'dark'
  autoPlayAudio: boolean
}

export interface DailyLog {
  answered: number
  correct: number
  xp: number
  goalRewarded: boolean
}

export interface RecentMistake {
  questionId: string
  at: number
  given: string
}

export interface SavedSession {
  session: SessionPlan
  index: number
  results: SessionAnswer[]
  savedAt: number
  startedAt?: number
}

export interface AppState {
  version: number
  xp: number
  stages: Record<string, StageProgress>
  records: Record<string, ReviewRecord>
  categoryStats: Partial<Record<Category, CategoryStat>>
  /** Keyed by local date YYYY-MM-DD. Pruned to recent days. */
  daily: Record<string, DailyLog>
  streak: { current: number; best: number; lastActiveDate: string | null }
  reviewStreak: { current: number; best: number; lastDate: string | null }
  recentMistakes: RecentMistake[]
  /** Outcomes of scheduled reviews (item was due when answered) — used for retention. */
  reviewTotals: { attempts: number; correct: number }
  settings: Settings
  activeSession: SavedSession | null
  createdAt: number
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export type SessionKind = 'stage' | 'review' | 'daily' | 'practice'

export interface SessionPlan {
  kind: SessionKind
  title: string
  questionIds: string[]
  /** For stage/daily sessions: the stage the session advances. */
  stageKey?: string
  /** Question ids that count toward stage completion. */
  stageQuestionIds?: string[]
  /** Option order per question, fixed at session creation (survives reload). */
  optionOrder: Record<string, string[]>
  /** Allow one in-session retry of missed review questions. */
  allowRetry: boolean
  retried?: string[]
}

export interface SessionAnswer {
  questionId: string
  correct: boolean
  given: string
  grade: Grade
  xp: number
  isRetry: boolean
}
