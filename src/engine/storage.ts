import type { AppState, Settings } from '../types'

export const STORAGE_KEY = 'nihongo-quest:state'
export const BACKUP_KEY = 'nihongo-quest:corrupt-backup'
export const CURRENT_VERSION = 1

export const DEFAULT_SETTINGS: Settings = {
  dailyGoal: 20,
  showReading: true,
  speechRate: 0.9,
  voiceURI: null,
  theme: 'system',
  autoPlayAudio: false,
}

export function createInitialState(now: number = Date.now()): AppState {
  return {
    version: CURRENT_VERSION,
    xp: 0,
    stages: {},
    records: {},
    categoryStats: {},
    daily: {},
    streak: { current: 0, best: 0, lastActiveDate: null },
    reviewStreak: { current: 0, best: 0, lastDate: null },
    recentMistakes: [],
    reviewTotals: { attempts: 0, correct: 0 },
    settings: { ...DEFAULT_SETTINGS },
    activeSession: null,
    createdAt: now,
  }
}

// ---------------------------------------------------------------------------
// Safe storage wrapper — localStorage may be unavailable (private mode,
// blocked cookies, embedded frames). Falls back to in-memory storage.
// ---------------------------------------------------------------------------

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const memoryStore = (): KeyValueStore => {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  }
}

let fallback: KeyValueStore | null = null

export function getStore(): { store: KeyValueStore; persistent: boolean } {
  try {
    const ls = globalThis.localStorage
    const probe = '__nq_probe__'
    ls.setItem(probe, '1')
    ls.removeItem(probe)
    return { store: ls, persistent: true }
  } catch {
    fallback ??= memoryStore()
    return { store: fallback, persistent: false }
  }
}

// ---------------------------------------------------------------------------
// Migrations: each entry upgrades from version N to N+1.
// ---------------------------------------------------------------------------

type Migration = (s: Record<string, unknown>) => Record<string, unknown>
const MIGRATIONS: Record<number, Migration> = {
  // 0 → 1: pre-release shape without a version field.
  0: (s) => ({ ...s, version: 1 }),
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Validate and normalise loaded data. Unknown / malformed fields are replaced by
 * defaults rather than failing the whole load, so a single bad field never wipes history.
 */
export function normalizeState(raw: unknown, now: number = Date.now()): AppState {
  if (!isObj(raw)) throw new Error('state is not an object')
  let s: Record<string, unknown> = { ...raw }
  let v = typeof s.version === 'number' ? s.version : 0
  if (v > CURRENT_VERSION) throw new Error(`state version ${v} is newer than app version ${CURRENT_VERSION}`)
  while (v < CURRENT_VERSION) {
    const m = MIGRATIONS[v]
    if (!m) throw new Error(`no migration from version ${v}`)
    s = m(s)
    v += 1
  }
  const base = createInitialState(now)
  const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d)

  const records: AppState['records'] = {}
  if (isObj(s.records)) {
    for (const [id, r] of Object.entries(s.records)) {
      if (!isObj(r) || typeof r.nextReview !== 'number') continue
      records[id] = {
        questionId: id,
        attempts: num(r.attempts, 0),
        correct: num(r.correct, 0),
        incorrect: num(r.incorrect, 0),
        streak: num(r.streak, 0),
        lapses: num(r.lapses, 0),
        lastAnswered: num(r.lastAnswered, now),
        lastIncorrect: typeof r.lastIncorrect === 'number' ? r.lastIncorrect : null,
        lastReview: typeof r.lastReview === 'number' ? r.lastReview : null,
        nextReview: r.nextReview,
        interval: num(r.interval, 0),
        ease: num(r.ease, 2.5),
        status: r.status === 'review' || r.status === 'mastered' ? r.status : 'learning',
      }
    }
  }

  const settings: Settings = { ...DEFAULT_SETTINGS, ...(isObj(s.settings) ? (s.settings as Partial<Settings>) : {}) }
  const streak = isObj(s.streak) ? (s.streak as AppState['streak']) : base.streak
  const reviewStreak = isObj(s.reviewStreak) ? (s.reviewStreak as AppState['reviewStreak']) : base.reviewStreak

  return {
    version: CURRENT_VERSION,
    xp: Math.max(0, num(s.xp, 0)),
    stages: isObj(s.stages) ? (s.stages as AppState['stages']) : {},
    records,
    categoryStats: isObj(s.categoryStats) ? (s.categoryStats as AppState['categoryStats']) : {},
    daily: isObj(s.daily) ? (s.daily as AppState['daily']) : {},
    streak: { current: num(streak.current, 0), best: num(streak.best, 0), lastActiveDate: typeof streak.lastActiveDate === 'string' ? streak.lastActiveDate : null },
    reviewStreak: { current: num(reviewStreak.current, 0), best: num(reviewStreak.best, 0), lastDate: typeof reviewStreak.lastDate === 'string' ? reviewStreak.lastDate : null },
    recentMistakes: Array.isArray(s.recentMistakes) ? (s.recentMistakes as AppState['recentMistakes']).filter((m) => isObj(m) && typeof m.questionId === 'string') : [],
    reviewTotals: isObj(s.reviewTotals) ? { attempts: num(s.reviewTotals.attempts, 0), correct: num(s.reviewTotals.correct, 0) } : { attempts: 0, correct: 0 },
    settings,
    activeSession: isObj(s.activeSession) && isObj((s.activeSession as Record<string, unknown>).session) ? (s.activeSession as unknown as AppState['activeSession']) : null,
    createdAt: num(s.createdAt, now),
  }
}

export type LoadResult = { state: AppState; notice: 'ok' | 'fresh' | 'recovered' | 'no-storage' }

export function loadState(now: number = Date.now()): LoadResult {
  const { store, persistent } = getStore()
  let raw: string | null = null
  try {
    raw = store.getItem(STORAGE_KEY)
  } catch {
    raw = null
  }
  if (raw === null) return { state: createInitialState(now), notice: persistent ? 'fresh' : 'no-storage' }
  try {
    return { state: normalizeState(JSON.parse(raw), now), notice: persistent ? 'ok' : 'no-storage' }
  } catch {
    // Keep the corrupted payload so nothing is silently destroyed.
    try {
      store.setItem(BACKUP_KEY, raw)
    } catch {
      /* ignore */
    }
    return { state: createInitialState(now), notice: 'recovered' }
  }
}

export function saveState(state: AppState): boolean {
  const { store } = getStore()
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export function clearState(): void {
  const { store } = getStore()
  try {
    store.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
