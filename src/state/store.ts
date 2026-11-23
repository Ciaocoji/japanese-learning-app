import { useSyncExternalStore } from 'react'
import type { AppState, Grade, ReviewRecord, SessionAnswer, SessionPlan, Settings } from '../types'
import { clearState, createInitialState, loadState, saveState, type LoadResult } from '../engine/storage'
import { applyAnswer, completeSession, regrade, skipStage, type SessionSummary } from '../engine/progress'
import { getAudio } from '../audio/audio'
import { getQuestion } from '../data'

type Listener = () => void

let state: AppState
let loadNotice: LoadResult['notice'] = 'fresh'
let saveFailed = false
const listeners = new Set<Listener>()

function init() {
  const res = loadState()
  state = res.state
  loadNotice = res.notice
  getAudio().setVoice(state.settings.voiceURI)
}
init()

function setState(next: AppState) {
  state = next
  saveFailed = !saveState(state)
  listeners.forEach((l) => l())
}

export const store = {
  get: () => state,
  subscribe(l: Listener) {
    listeners.add(l)
    return () => void listeners.delete(l)
  },
  loadNotice: () => loadNotice,
  saveFailed: () => saveFailed,
  dismissNotice() {
    loadNotice = 'ok'
    listeners.forEach((l) => l())
  },

  startSession(plan: SessionPlan) {
    setState({ ...state, activeSession: { session: plan, index: 0, results: [], savedAt: Date.now(), startedAt: Date.now() } })
  },

  /** Current question id of the active session, or null when finished. */
  currentQuestionId(): string | null {
    const a = state.activeSession
    if (!a) return null
    return a.session.questionIds[a.results.length] ?? null
  },

  answer(correct: boolean, given: string, now = Date.now()) {
    const a = state.activeSession
    if (!a) return null
    const questionId = a.session.questionIds[a.results.length]
    if (!questionId) return null
    const isRetry = a.results.some((r) => r.questionId === questionId)
    let combo = 0
    if (correct) {
      combo = 1
      for (let i = a.results.length - 1; i >= 0 && a.results[i].correct && !a.results[i].isRetry; i--) combo++
    }
    const grade: Grade = correct ? 'good' : 'again'
    const out = applyAnswer(state, { questionId, correct, given, grade, isRetry, combo, now })
    const result: SessionAnswer = { questionId, correct, given, grade, xp: out.xp, isRetry }
    const session = { ...a.session }
    // One in-session retry for missed items (never endless repetition).
    if (!correct && session.allowRetry && !isRetry && !(session.retried ?? []).includes(questionId)) {
      session.questionIds = [...session.questionIds, questionId]
      session.retried = [...(session.retried ?? []), questionId]
    }
    setState({ ...out.state, activeSession: { ...a, session, index: a.results.length + 1, results: [...a.results, result], savedAt: now } })
    return { ...out, combo, isRetry }
  },

  /** Self-rating after a correct answer (hard / easy) — reschedules from the pre-answer snapshot. */
  regrade(questionId: string, previous: ReviewRecord | undefined, grade: Grade, now = Date.now()) {
    let next = regrade(state, questionId, previous, grade, now)
    const a = next.activeSession
    if (a && a.results.length) {
      const results = a.results.slice()
      const last = results[results.length - 1]
      if (last.questionId === questionId) results[results.length - 1] = { ...last, grade }
      next = { ...next, activeSession: { ...a, results } }
    }
    setState(next)
  },

  finishSession(now = Date.now()): SessionSummary | null {
    const a = state.activeSession
    if (!a) return null
    const { state: next, summary } = completeSession(state, a.session, a.results, now)
    setState(next)
    return summary
  },

  skipStage(key: string, now = Date.now()) {
    setState(skipStage(state, key, now))
  },

  discardSession() {
    setState({ ...state, activeSession: null })
  },

  updateSettings(patch: Partial<Settings>) {
    if ('voiceURI' in patch) getAudio().setVoice(patch.voiceURI ?? null)
    setState({ ...state, settings: { ...state.settings, ...patch } })
  },

  resetAll() {
    clearState()
    const fresh = createInitialState()
    fresh.settings = { ...state.settings }
    setState(fresh)
  },

  /** Test / debug hook: replace state wholesale. */
  replace(next: AppState) {
    setState(next)
  },
}

export function useAppState(): AppState {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}

// Expose for e2e testing and debugging in the browser console.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __NQ__: unknown }).__NQ__ = { ...store, question: getQuestion }
}
