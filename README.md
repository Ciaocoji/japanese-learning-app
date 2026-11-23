# Nihongo Quest

面向中文母语者的游戏化日语学习 Web 应用 —— 从零基础（N7）到精通（N1）。
A gamified Japanese learning web app for Chinese-speaking learners. No backend, no login, no API keys.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build on :4173
```

## Test

```bash
npm test                                   # unit tests: SRS, progression, storage, content integrity
npm run build && npx vite preview --port 4173 &
npm run e2e                                # browser end-to-end flows (needs Playwright + Chromium)
```

## What's inside

- **7 levels × 3 stages × 10 questions = 210 hand-written questions** (N7, N6 are custom levels, not official JLPT).
- **7 learning modes**: vocabulary (choice + matching), fill-in-the-blank, sentence-building puzzle (tap *or* drag),
  conversation gap, situational response, listening (browser TTS), Chinese → Japanese (choice + tiles).
- **Spaced repetition** (`src/engine/srs.ts`): simplified SM-2. Ladder 1 → 3 → 7 → 14 → 30 days, then × ease.
  Wrong = relearn in 10 min, ease ↓, streak reset. Self-rating hard / good / easy after correct answers.
  Day intervals fall due at local midnight. Pure + deterministic, all parameters in `DEFAULT_SRS`.
- **Review queue** prioritised: overdue → recent mistakes → repeated mistakes → low accuracy → due today.
  Max 15 per session; a missed item is re-asked at most once per session.
- **Weakness analysis** per category, shown only after ≥ 5 answers.
- **Progression**: stage passes at ≥ 80 % completion and ≥ 70 % first-try accuracy (`PROGRESSION` in `progress.ts`).
  XP for correct answers (reduced for re-practising non-due items), combos, first clear, perfect, review session, daily goal.
- **Persistence**: versioned LocalStorage with migrations, field-level validation, corrupted-data backup,
  in-memory fallback when storage is blocked. Sessions resume after reload.

## Structure

```
src/data/content/n7.ts … n1.ts   question content (stable ids like n5-2-03; review history keys on these)
src/data/levels.ts               level / stage metadata
src/engine/                      srs, progress (XP, unlocking, sessions), session builders, analytics, storage
src/audio/audio.ts               AudioService interface + browser SpeechSynthesis implementation
src/state/                       store (single source of truth, persisted on change) + hash router
src/pages, src/components        UI
```

Adding content: append questions with new ids to a level file. Never reuse or renumber an existing id.
Recorded audio: set `audioUrl` on a question — it is preferred over TTS automatically.
