import { useEffect, useState, useSyncExternalStore } from 'react'
import { getAudio } from '../audio/audio'
import { store, useAppState } from '../state/store'
import { cx } from './ui'

function useAudioStatus() {
  const audio = getAudio()
  return useSyncExternalStore(audio.subscribe.bind(audio), () => audio.status(), () => 'unsupported' as const)
}

const SPEEDS = [
  { rate: 0.6, label: '慢速' },
  { rate: 0.9, label: '正常' },
  { rate: 1.1, label: '较快' },
]

export function AudioControls({ text, url, autoPlay = false, large = false }: { text?: string; url?: string; autoPlay?: boolean; large?: boolean }) {
  const status = useAudioStatus()
  const { settings } = useAppState()
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [plays, setPlays] = useState(0)
  const canPlay = !!url || status === 'ready'

  const play = async (rate = settings.speechRate) => {
    setError(null)
    setPlaying(true)
    try {
      await getAudio().play({ text, url, rate })
      setPlays((n) => n + 1)
    } catch {
      setError('播放失败。你的设备可能没有日语语音，可以先阅读文字继续学习。')
    } finally {
      setPlaying(false)
    }
  }

  useEffect(() => {
    if (autoPlay && canPlay) void play()
    return () => getAudio().stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, url])

  if (!text && !url) return null

  if (!canPlay) {
    return (
      <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" role="status">
        {status === 'loading'
          ? '正在加载语音……'
          : status === 'unsupported'
            ? '当前浏览器不支持语音合成。听力题会显示文字，你可以继续学习。'
            : '没有找到日语语音。可以在系统设置中添加日语语音（如 iOS「设置 › 辅助功能 › 朗读内容 › 声音」）。现在会显示文字，你可以继续学习。'}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => play()}
        className={cx(
          'inline-flex items-center gap-2 rounded-full bg-indigo-600 font-medium text-white shadow-sm hover:bg-indigo-700 active:scale-95',
          large ? 'min-h-14 px-6 text-base' : 'min-h-11 px-4 text-sm',
          playing && 'anim-glow',
        )}
        aria-label={plays ? '重新播放' : '播放音频'}
      >
        <svg viewBox="0 0 24 24" className={large ? 'h-6 w-6' : 'h-5 w-5'} fill="currentColor" aria-hidden>
          {plays ? <path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z" /> : <path d="M8 5v14l11-7z" />}
        </svg>
        {playing ? '播放中…' : plays ? '再听一遍' : '播放'}
      </button>
      <div className="flex rounded-full border border-stone-200 p-0.5 dark:border-stone-700" role="group" aria-label="语速">
        {SPEEDS.map((s) => (
          <button
            key={s.rate}
            type="button"
            onClick={() => {
              store.updateSettings({ speechRate: s.rate })
              void play(s.rate)
            }}
            className={cx(
              'min-h-10 rounded-full px-3 text-xs font-medium',
              Math.abs(settings.speechRate - s.rate) < 0.01 ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900' : 'text-stone-600 dark:text-stone-300',
            )}
            aria-pressed={Math.abs(settings.speechRate - s.rate) < 0.01}
          >
            {s.label}
          </button>
        ))}
      </div>
      {error && <p className="w-full text-xs text-amber-700 dark:text-amber-300">{error}</p>}
    </div>
  )
}

export function useCanPlayAudio(): boolean {
  return useAudioStatus() === 'ready'
}

/** Small speaker icon to hear a word/sentence. */
export function SpeakButton({ text, className }: { text: string; className?: string }) {
  const status = useAudioStatus()
  const { settings } = useAppState()
  if (status !== 'ready') return null
  return (
    <button
      type="button"
      onClick={() => void getAudio().play({ text, rate: settings.speechRate }).catch(() => {})}
      className={cx('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950', className)}
      aria-label="朗读"
      title="朗读"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z" />
      </svg>
    </button>
  )
}
