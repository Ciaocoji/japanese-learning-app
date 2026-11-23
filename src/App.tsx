import { Component, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { store, useAppState } from './state/store'
import { navigate, useRoute, type Route } from './state/router'
import { displayStreak } from './engine/progress'
import { HomePage } from './pages/Home'
import { LearnPage } from './pages/Learn'
import { LevelsPage } from './pages/Levels'
import { ReviewPage } from './pages/Review'
import { ProgressPage } from './pages/Progress'
import { SettingsPage } from './pages/Settings'
import { SessionPage } from './pages/Session'
import { Button, Card, Ja, cx } from './components/ui'
import { reviewStats } from './engine/analytics'

const NAV: { route: Route; ja: string; zh: string; icon: string }[] = [
  { route: 'home', ja: 'ホーム', zh: '首页', icon: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
  { route: 'learn', ja: '学習', zh: '学习', icon: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zm2 14h13v2H6z' },
  { route: 'levels', ja: 'レベル', zh: '等级', icon: 'M4 20h4V10H4zm6 0h4V4h-4zm6 0h4v-7h-4z' },
  { route: 'review', ja: '復習', zh: '复习', icon: 'M12 4V1L8 5l4 4V6a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z' },
  { route: 'progress', ja: '進捗', zh: '进度', icon: 'M3 17l6-6 4 4 8-8v4h2V3h-8v2h4l-6 6-4-4-8 8z' },
]

function useTheme() {
  const { settings } = useAppState()
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const apply = () => {
      // A host-provided data-theme (e.g. the artifact viewer) counts as the "system" choice.
      const host = document.documentElement.getAttribute('data-theme')
      const systemDark = host ? host === 'dark' : !!mq?.matches
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    mq?.addEventListener?.('change', apply)
    return () => mq?.removeEventListener?.('change', apply)
  }, [settings.theme])
}

function Notice() {
  const notice = useSyncExternalStore(store.subscribe, store.loadNotice)
  if (notice === 'ok' || notice === 'fresh') return null
  const msg = notice === 'recovered' ? '保存的学习数据已损坏，已重新开始（原数据已备份在浏览器中）。' : '当前浏览器无法保存数据（可能是隐私模式），刷新后进度会丢失。'
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100" role="alert">
      <span className="flex-1">{msg}</span>
      <button className="text-amber-700 underline" onClick={() => store.dismissNotice()}>知道了</button>
    </div>
  )
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <Card className="mx-auto mt-10 max-w-md text-center">
        <p className="mb-2 font-semibold">出了点问题</p>
        <p className="mb-4 text-sm text-stone-500">页面遇到错误，学习记录不会丢失。</p>
        <Button
          onClick={() => {
            store.discardSession()
            this.setState({ error: null })
            navigate('home')
          }}
        >
          回到首页
        </Button>
      </Card>
    )
  }
}

export default function App() {
  useTheme()
  const route = useRoute()
  const state = useAppState()
  const now = Date.now()
  const due = reviewStats(state, now).dueNow
  const inSession = route === 'session'
  // Remount the session page only when a *new* session starts (not when one finishes,
  // so the results screen survives).
  const sessionKey = useRef(0)
  if (state.activeSession?.startedAt) sessionKey.current = state.activeSession.startedAt

  const page = {
    home: <HomePage />,
    learn: <LearnPage />,
    levels: <LevelsPage />,
    review: <ReviewPage />,
    progress: <ProgressPage />,
    settings: <SettingsPage />,
    session: <SessionPage key={sessionKey.current} />,
  }[route]

  return (
    <div className="min-h-dvh md:flex">
      {!inSession && (
        <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-stone-200 bg-white p-4 md:flex dark:border-stone-800 dark:bg-stone-900">
          <button onClick={() => navigate('home')} className="mb-6 flex items-center gap-2 px-2 text-left">
            <span className="h-7 w-7 rounded-lg bg-stone-900 p-1.5 dark:bg-stone-100"><span className="block h-full w-full rounded-full bg-accent-500" /></span>
            <span className="font-semibold">Nihongo Quest</span>
          </button>
          <nav className="flex flex-col gap-1" aria-label="侧边导航">
            {NAV.map((n) => (
              <button key={n.route} onClick={() => navigate(n.route)} aria-current={route === n.route ? 'page' : undefined} className={cx('flex min-h-11 items-center gap-3 rounded-xl px-3 text-left', route === n.route ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900' : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800')}>
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden><path d={n.icon} /></svg>
                <span className="flex-1"><Ja>{n.ja}</Ja> <span className="text-xs opacity-60">{n.zh}</span></span>
                {n.route === 'review' && due > 0 && <span className="rounded-full bg-accent-500 px-1.5 text-xs text-white">{due}</span>}
              </button>
            ))}
          </nav>
          <div className="mt-auto space-y-1 px-2 text-sm text-stone-500">
            <div>🔥 {displayStreak(state.streak, now)} 天 · {state.xp} XP</div>
            <button onClick={() => navigate('settings')} className={cx('min-h-10 hover:text-stone-900 dark:hover:text-stone-100', route === 'settings' && 'font-semibold text-stone-900 dark:text-stone-100')}>⚙ 设置</button>
          </div>
        </aside>
      )}

      <div className="min-w-0 flex-1">
        {!inSession && (
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-stone-200 bg-stone-50/90 px-4 py-3 backdrop-blur md:hidden dark:border-stone-800 dark:bg-ink-950/90">
            <button onClick={() => navigate('home')} className="flex items-center gap-2 font-semibold">
              <span className="h-6 w-6 rounded-md bg-stone-900 p-1 dark:bg-stone-100"><span className="block h-full w-full rounded-full bg-accent-500" /></span>
              Nihongo Quest
            </button>
            <div className="flex items-center gap-1 text-sm">
              <span className="px-2 tabular-nums">🔥 {displayStreak(state.streak, now)}</span>
              <span className="px-2 tabular-nums text-accent-600">{state.xp} XP</span>
              <button onClick={() => navigate('settings')} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-stone-200 dark:hover:bg-stone-800" aria-label="设置">⚙</button>
            </div>
          </header>
        )}
        <main className={cx('mx-auto w-full max-w-3xl px-4 py-4 sm:py-6', !inSession && 'pb-28 md:pb-8')}>
          <Notice />
          <ErrorBoundary>{page}</ErrorBoundary>
        </main>
      </div>

      {!inSession && (
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-stone-800 dark:bg-stone-900/95" aria-label="底部导航">
          {NAV.map((n) => (
            <button key={n.route} onClick={() => navigate(n.route)} aria-current={route === n.route ? 'page' : undefined} className={cx('relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px]', route === n.route ? 'text-accent-600' : 'text-stone-500')}>
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden><path d={n.icon} /></svg>
              <Ja>{n.ja}</Ja>
              {n.route === 'review' && due > 0 && <span className="absolute top-1.5 right-[calc(50%-20px)] min-w-5 rounded-full bg-accent-500 px-1 text-[10px] leading-5 text-white">{due}</span>}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
