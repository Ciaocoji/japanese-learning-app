import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChoiceQuestion, MatchQuestion, OrderQuestion, Question } from '../types'
import { DEFAULT_PROMPTS, TYPE_LABELS } from '../data'
import { checkOrder } from '../engine/progress'
import { useAppState } from '../state/store'
import { AudioControls, SpeakButton, useCanPlayAudio } from './AudioControls'
import { Badge, Button, Ja, cx } from './ui'

const KANA = /[぀-ヿ]/
/** Tag text with the right language so CJK glyphs render correctly. */
export function Txt({ text, className }: { text: string; className?: string }) {
  return (
    <span lang={KANA.test(text) ? 'ja' : 'zh-CN'} className={className}>
      {text}
    </span>
  )
}

export interface AnswerState {
  given: string
  correct: boolean
}

interface Props {
  question: Question
  order: string[]
  answered: AnswerState | null
  onAnswer: (correct: boolean, given: string) => void
}

export function QuestionView({ question, order, answered, onAnswer }: Props) {
  const label = TYPE_LABELS[question.type]
  return (
    <div className="anim-rise space-y-4" key={question.id}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
          <Ja className="mr-1">{label.ja}</Ja>· {label.zh}
        </Badge>
        <Badge>{question.level}</Badge>
      </div>
      <p className="text-sm font-medium text-stone-600 dark:text-stone-300">{question.prompt ?? DEFAULT_PROMPTS[question.type]}</p>
      <Stem question={question} answered={answered} />
      {question.format === 'choice' && <ChoiceInput q={question} order={order} answered={answered} onAnswer={onAnswer} />}
      {question.format === 'order' && <OrderInput q={question} order={order} answered={answered} onAnswer={onAnswer} />}
      {question.format === 'match' && <MatchInput q={question} order={order} answered={answered} onAnswer={onAnswer} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Question stem (what is being asked)
// ---------------------------------------------------------------------------

function GapText({ text, fill }: { text: string; fill?: string }) {
  const parts = text.split('___')
  if (parts.length === 1) return <>{text}</>
  return (
    <>
      {parts[0]}
      <span className={cx('mx-1 inline-block min-w-12 rounded-md border-b-2 px-2 text-center', fill ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'border-accent-400 bg-accent-50 text-transparent dark:bg-accent-700/20')}>
        {fill ?? '＿'}
      </span>
      {parts[1]}
    </>
  )
}

function Dialogue({ q, fill }: { q: Question; fill?: string }) {
  if (!q.dialogue?.length) return null
  return (
    <div className="space-y-2">
      {q.dialogue.map((line, i) => {
        const right = i % 2 === 1
        return (
          <div key={i} className={cx('flex', right ? 'justify-end' : 'justify-start')}>
            <div className={cx('max-w-[88%] rounded-2xl px-4 py-2.5', right ? 'rounded-br-md bg-indigo-50 dark:bg-indigo-950/60' : 'rounded-bl-md bg-stone-100 dark:bg-stone-800')}>
              <div className="mb-0.5 text-[11px] font-medium text-stone-500">{line.speaker}</div>
              <div lang="ja" className="text-lg leading-relaxed">
                <GapText text={line.text} fill={fill} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Stem({ question: q, answered }: { question: Question; answered: AnswerState | null }) {
  const { settings } = useAppState()
  const canPlay = useCanPlayAudio()
  const correctFill = q.format === 'choice' && answered ? q.correctAnswer : undefined

  switch (q.type) {
    case 'vocab':
      if (q.format === 'match' || !q.japanese) return null
      return (
        <div className="flex flex-col items-center gap-1 rounded-2xl bg-stone-100 py-8 dark:bg-stone-800/60">
          <div className="flex items-center gap-1">
            <Ja className="text-4xl font-semibold tracking-wide sm:text-5xl">{q.japanese}</Ja>
            <SpeakButton text={q.audioText ?? q.reading ?? q.japanese} />
          </div>
          {q.reading && settings.showReading && <Ja className="text-base text-stone-500">{q.reading}</Ja>}
        </div>
      )
    case 'fill':
      return (
        <div className="rounded-2xl bg-stone-100 p-5 dark:bg-stone-800/60">
          <p lang="ja" className="text-2xl leading-relaxed">
            <GapText text={q.japanese ?? ''} fill={correctFill} />
          </p>
          {q.reading && settings.showReading && q.reading !== q.japanese && (
            <p lang="ja" className="mt-1 text-sm text-stone-500">
              {q.reading.replace('___', '（　）')}
            </p>
          )}
          {q.chinese && <p className="mt-3 border-t border-stone-200 pt-3 text-sm text-stone-600 dark:border-stone-700 dark:text-stone-300">{q.chinese}</p>}
        </div>
      )
    case 'conversation':
      return <Dialogue q={q} fill={correctFill} />
    case 'situation':
      return (
        <div className="space-y-3">
          {q.situation && (
            <div className="rounded-xl border border-dashed border-stone-300 bg-white p-3 text-sm text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
              <span className="mr-1 font-semibold">情景：</span>
              {q.situation}
            </div>
          )}
          <Dialogue q={q} />
          {q.question && <p className="font-medium">{q.question}</p>}
        </div>
      )
    case 'listening': {
      const showTranscript = !!answered || !canPlay
      return (
        <div className="space-y-3">
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-indigo-50/60 p-5 dark:bg-indigo-950/30">
            <AudioControls text={q.audioText} url={q.audioUrl} autoPlay={settings.autoPlayAudio} large />
          </div>
          {showTranscript && q.japanese && (
            <div className="rounded-xl bg-stone-100 p-3 dark:bg-stone-800/60">
              <div className="mb-1 text-xs text-stone-500">{answered ? '原文' : '原文（无法播放语音时显示）'}</div>
              <p lang="ja" className="whitespace-pre-line text-base leading-relaxed">
                {q.japanese}
              </p>
            </div>
          )}
          {q.question && <p className="font-medium">{q.question}</p>}
        </div>
      )
    }
    case 'translate':
    case 'build':
      return (
        <div className="rounded-2xl bg-stone-100 p-5 dark:bg-stone-800/60">
          <div className="mb-1 text-xs text-stone-500">中文</div>
          <p lang="zh-CN" className="text-2xl font-medium leading-relaxed">
            {q.chinese}
          </p>
        </div>
      )
  }
}

// ---------------------------------------------------------------------------
// Multiple choice
// ---------------------------------------------------------------------------

function ChoiceInput({ q, order, answered, onAnswer }: { q: ChoiceQuestion; order: string[]; answered: AnswerState | null; onAnswer: Props['onAnswer'] }) {
  const options = order.length ? order : q.options
  const long = options.some((o) => o.length > 12)

  useEffect(() => {
    if (answered) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return
      const n = Number(e.key)
      if (n >= 1 && n <= options.length) {
        const pick = options[n - 1]
        onAnswer(pick === q.correctAnswer, pick)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [answered, options, q.correctAnswer, onAnswer])

  return (
    <div className={cx('grid gap-2.5', long ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')} role="group" aria-label="选项">
      {options.map((opt, i) => {
        const isCorrect = opt === q.correctAnswer
        const isPicked = answered?.given === opt
        const state = !answered ? 'idle' : isCorrect ? 'correct' : isPicked ? 'wrong' : 'dim'
        return (
          <button
            key={opt}
            type="button"
            disabled={!!answered}
            onClick={() => onAnswer(isCorrect, opt)}
            className={cx(
              'group flex min-h-14 w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-base transition-all',
              state === 'idle' && 'border-stone-200 bg-white hover:border-accent-400 hover:bg-accent-50 active:scale-[0.99] dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800',
              state === 'correct' && 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100',
              state === 'wrong' && 'anim-shake border-red-400 bg-red-50 text-red-900 dark:bg-red-950/50 dark:text-red-100',
              state === 'dim' && 'border-stone-200 bg-white opacity-50 dark:border-stone-800 dark:bg-stone-900',
            )}
            aria-label={`选项 ${i + 1}：${opt}`}
          >
            <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold', state === 'correct' ? 'bg-emerald-500 text-white' : state === 'wrong' ? 'bg-red-500 text-white' : 'bg-stone-100 text-stone-500 dark:bg-stone-800')}>
              {state === 'correct' ? '✓' : state === 'wrong' ? '✕' : i + 1}
            </span>
            <Txt text={opt} className="leading-snug" />
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sentence building: tap to add / remove, drag to reorder (desktop)
// ---------------------------------------------------------------------------

function OrderInput({ q, order, answered, onAnswer }: { q: OrderQuestion; order: string[]; answered: AnswerState | null; onAnswer: Props['onAnswer'] }) {
  const tiles = useMemo(() => (order.length ? order : [...q.tiles, ...(q.distractors ?? [])]).map((text, idx) => ({ text, idx })), [order, q])
  const [picked, setPicked] = useState<number[]>([])
  const dragFrom = useRef<{ zone: 'pool' | 'answer'; pos: number; idx: number } | null>(null)

  useEffect(() => setPicked([]), [q.id])

  const available = tiles.filter((t) => !picked.includes(t.idx))
  const sentence = picked.map((i) => tiles[i].text).join('')

  const add = (idx: number, at?: number) => {
    if (answered) return
    setPicked((p) => {
      const without = p.filter((x) => x !== idx)
      const pos = at === undefined ? without.length : Math.min(at, without.length)
      return [...without.slice(0, pos), idx, ...without.slice(pos)]
    })
  }
  const remove = (idx: number) => !answered && setPicked((p) => p.filter((x) => x !== idx))
  const move = (from: number, to: number) =>
    setPicked((p) => {
      const a = p.slice()
      const [x] = a.splice(from, 1)
      a.splice(to, 0, x)
      return a
    })
  const submit = () => onAnswer(checkOrder(q.answers, sentence), sentence)

  return (
    <div className="space-y-4">
      <div
        className={cx(
          'flex min-h-20 flex-wrap content-start items-start gap-2 rounded-2xl border-2 border-dashed p-3 transition-colors',
          answered ? (answered.correct ? 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/30' : 'border-red-300 bg-red-50/60 dark:bg-red-950/30') : 'border-stone-300 dark:border-stone-700',
        )}
        aria-label="你的答案"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const d = dragFrom.current
          if (d?.zone === 'pool') add(d.idx)
          dragFrom.current = null
        }}
      >
        {picked.length === 0 && <span className="self-center px-1 text-sm text-stone-400">点击下方词块组成句子（电脑上也可以拖动）</span>}
        {picked.map((idx, pos) => (
          <button
            key={idx}
            type="button"
            lang="ja"
            draggable={!answered}
            onDragStart={() => (dragFrom.current = { zone: 'answer', pos, idx })}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              const d = dragFrom.current
              if (d?.zone === 'answer') move(d.pos, pos)
              else if (d?.zone === 'pool') add(d.idx, pos)
              dragFrom.current = null
            }}
            onClick={() => remove(idx)}
            disabled={!!answered}
            className="min-h-11 rounded-xl bg-stone-900 px-3.5 text-lg text-white shadow-sm active:scale-95 disabled:cursor-default dark:bg-stone-100 dark:text-stone-900"
            aria-label={`移除「${tiles[idx].text}」`}
          >
            {tiles[idx].text}
          </button>
        ))}
      </div>

      {!answered && (
        <div className="flex flex-wrap gap-2" aria-label="可选词块" onDragOver={(e) => e.preventDefault()} onDrop={() => {
          const d = dragFrom.current
          if (d?.zone === 'answer') remove(d.idx)
          dragFrom.current = null
        }}>
          {available.map((t) => (
            <button
              key={t.idx}
              type="button"
              lang="ja"
              draggable
              onDragStart={() => (dragFrom.current = { zone: 'pool', pos: -1, idx: t.idx })}
              onClick={() => add(t.idx)}
              className="min-h-11 rounded-xl border-2 border-stone-200 bg-white px-3.5 text-lg shadow-sm hover:border-accent-400 active:scale-95 dark:border-stone-700 dark:bg-stone-900"
              aria-label={`添加「${t.text}」`}
            >
              {t.text}
            </button>
          ))}
        </div>
      )}

      {!answered && (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setPicked([])} disabled={!picked.length}>
            清空
          </Button>
          <Button variant="secondary" onClick={() => setPicked((p) => p.slice(0, -1))} disabled={!picked.length} aria-label="撤销最后一个">
            ⌫
          </Button>
          <Button className="flex-1" onClick={submit} disabled={!picked.length}>
            检查答案
          </Button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Matching pairs
// ---------------------------------------------------------------------------

function MatchInput({ q, order, answered, onAnswer }: { q: MatchQuestion; order: string[]; answered: AnswerState | null; onAnswer: Props['onAnswer'] }) {
  const right = order.length ? order : q.pairs.map((p) => p.zh)
  const [selected, setSelected] = useState<string | null>(null)
  const [matched, setMatched] = useState<string[]>([])
  const [wrong, setWrong] = useState<string | null>(null)
  const [mistakes, setMistakes] = useState(0)

  useEffect(() => {
    setMatched([])
    setMistakes(0)
    setSelected(null)
  }, [q.id])

  const done = answered !== null
  const pick = (zh: string) => {
    if (!selected || done) return
    const pair = q.pairs.find((p) => p.ja === selected)!
    if (pair.zh === zh) {
      const next = [...matched, selected]
      setMatched(next)
      setSelected(null)
      if (next.length === q.pairs.length) onAnswer(mistakes === 0, mistakes === 0 ? '全部正确' : `配错 ${mistakes} 次`)
    } else {
      setMistakes((m) => m + 1)
      setWrong(zh)
      setTimeout(() => setWrong(null), 350)
    }
  }
  const isMatchedZh = (zh: string) => done || matched.some((ja) => q.pairs.find((p) => p.ja === ja)?.zh === zh)

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-2.5">
          {q.pairs.map((p) => {
            const ok = done || matched.includes(p.ja)
            return (
              <button
                key={p.ja}
                type="button"
                lang="ja"
                disabled={ok}
                onClick={() => setSelected(p.ja)}
                aria-pressed={selected === p.ja}
                className={cx(
                  'min-h-14 w-full rounded-xl border-2 px-3 text-lg transition-all',
                  ok ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' : selected === p.ja ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950' : 'border-stone-200 bg-white hover:border-indigo-300 dark:border-stone-700 dark:bg-stone-900',
                )}
              >
                {p.ja}
              </button>
            )
          })}
        </div>
        <div className="space-y-2.5">
          {right.map((zh) => {
            const ok = isMatchedZh(zh)
            return (
              <button
                key={zh}
                type="button"
                disabled={ok || !selected}
                onClick={() => pick(zh)}
                className={cx(
                  'min-h-14 w-full rounded-xl border-2 px-3 text-base transition-all',
                  ok ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' : wrong === zh ? 'anim-shake border-red-400 bg-red-50 dark:bg-red-950' : 'border-stone-200 bg-white enabled:hover:border-indigo-300 disabled:opacity-70 dark:border-stone-700 dark:bg-stone-900',
                )}
              >
                <Txt text={zh} />
              </button>
            )
          })}
        </div>
      </div>
      <p className="mt-2 text-xs text-stone-500">{done ? '' : selected ? '现在选择右边对应的意思' : '先点左边的日语，再点右边对应的意思'}{mistakes > 0 && !done ? ` · 已配错 ${mistakes} 次` : ''}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers for feedback
// ---------------------------------------------------------------------------

export function correctAnswerText(q: Question): string {
  if (q.format === 'choice') return q.correctAnswer
  if (q.format === 'order') return q.answers[0]
  return q.pairs.map((p) => `${p.ja} = ${p.zh}`).join('　')
}

/** The complete Japanese sentence / conversation to show (and read aloud) after answering. */
export function fullJapanese(q: Question): string | null {
  if (q.fullText) return q.fullText
  if (q.format === 'choice') {
    if (q.type === 'fill' && q.japanese?.includes('___')) return q.japanese.replace('___', q.correctAnswer)
    if (q.type === 'conversation' && q.dialogue) return q.dialogue.map((l) => `${l.speaker}：${l.text.replace('___', q.correctAnswer)}`).join('\n')
    if (q.type === 'situation' || q.type === 'translate') return KANA.test(q.correctAnswer) ? q.correctAnswer : null
  }
  if (q.format === 'order') return q.answers[0].replace(/(?<![。！？])$/, '。')
  return null
}

export function speakableText(q: Question): string | null {
  if (q.type === 'listening') return q.audioText ?? null
  if (q.type === 'conversation' && q.format === 'choice' && q.dialogue) return q.dialogue.map((l) => l.text.replace('___', q.correctAnswer)).join('　')
  if (q.type === 'vocab' && q.format === 'choice') return q.audioText ?? (q.japanese && KANA.test(q.japanese) ? q.japanese : null)
  return fullJapanese(q)
}
