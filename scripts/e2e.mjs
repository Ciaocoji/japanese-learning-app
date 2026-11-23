// End-to-end smoke test of the main learning flows.
// Usage: npm run build && npx vite preview --port 4173 & node scripts/e2e.mjs
// Requires Playwright with Chromium available (require('playwright')).
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/'
const SHOTS = process.env.SHOTS_DIR ?? 'e2e-screenshots'
mkdirSync(SHOTS, { recursive: true })

let failures = 0
const ok = (cond, msg) => {
  if (cond) console.log('  ✓', msg)
  else {
    failures++
    console.log('  ✗', msg)
  }
}
const norm = (s) => s.replace(/[\s　、。，,.！!？?「」…・]/g, '')

function permutations(xs) {
  if (xs.length <= 1) return [xs]
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]))
}

const current = (page) =>
  page.evaluate(() => {
    const s = window.__NQ__
    const id = s.currentQuestionId()
    const a = s.get().activeSession
    return { id, q: id ? s.question(id) : null, order: id ? a.session.optionOrder[id] : null }
  })

async function clickExact(page, selector, text) {
  const clicked = await page.evaluate(
    ([sel, t]) => {
      const b = [...document.querySelectorAll(sel)].find((el) => {
        const span = el.querySelector('span:last-child')
        return (span ? span.textContent : el.textContent).trim() === t && !el.disabled
      })
      if (b) b.click()
      return !!b
    },
    [selector, text],
  )
  if (!clicked) throw new Error(`could not click "${text}" in ${selector}`)
}

/** Answer the current question; returns whether we answered correctly. */
async function answer(page, correct = true) {
  const { q, order } = await current(page)
  if (!q) throw new Error('no current question')
  if (q.format === 'choice') {
    const pick = correct ? q.correctAnswer : order.find((o) => o !== q.correctAnswer)
    await clickExact(page, '[aria-label="选项"] button', pick)
  } else if (q.format === 'order') {
    const seq = permutations(q.tiles).find((p) => norm(p.join('')) === norm(q.answers[0]))
    const tiles = correct ? seq : [...seq].reverse()
    for (const t of tiles) await page.locator(`button[aria-label="添加「${t}」"]`).first().click()
    await page.getByRole('button', { name: '检查答案' }).click()
  } else {
    for (const [i, p] of q.pairs.entries()) {
      await clickExact(page, 'button[lang="ja"]', p.ja)
      if (!correct && i === 0) await clickExact(page, '.grid > div:nth-child(2) button', q.pairs[1].zh)
      await clickExact(page, '.grid > div:nth-child(2) button', p.zh)
    }
  }
  await page.waitForSelector('text=/^(正解！|不正解)/')
  return correct
}

async function next(page) {
  await page.locator('button', { hasText: /^(继续|查看结果) →$/ }).click()
}

async function noOverflow(page, label) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }))
  ok(sw <= iw, `${label}: no horizontal overflow (${sw} ≤ ${iw})`)
}

const browser = await chromium.launch()
const errors = []

// ---------------------------------------------------------------------------
console.log('\n[1] Mobile: first visit, navigation, layout')
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true })
let page = await mobile.newPage()
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.goto(BASE)
await page.waitForSelector('text=今日の学習を始める')
ok(await page.locator('text=N7').first().isVisible(), 'home shows current level N7')
ok(await page.locator('text=数据还不够').isVisible(), 'weakness section explains insufficient data')
await page.screenshot({ path: `${SHOTS}/mobile-home.png`, fullPage: true })
await noOverflow(page, 'home')
for (const [route, label] of [['learn', '学習'], ['levels', 'レベル'], ['review', '復習'], ['progress', '進捗']]) {
  await page.locator('nav[aria-label="底部导航"] button', { hasText: label }).click()
  await page.waitForFunction((r) => location.hash === `#${r}`, route)
  await noOverflow(page, route)
  await page.screenshot({ path: `${SHOTS}/mobile-${route}.png`, fullPage: true })
}
ok(await page.locator('text=数据还不够').isVisible(), 'progress page: insufficient data message')
const smallTargets = await page.evaluate(() => [...document.querySelectorAll('nav[aria-label="底部导航"] button')].filter((b) => b.getBoundingClientRect().height < 44).length)
ok(smallTargets === 0, 'bottom nav buttons are ≥44px tall')

// ---------------------------------------------------------------------------
console.log('\n[2] Stage N7-1: one wrong answer, rest correct')
await page.locator('nav[aria-label="底部导航"] button', { hasText: 'ホーム' }).click()
await page.getByRole('button', { name: '今日の学習を始める' }).click()
await page.waitForFunction(() => location.hash === '#session')
const xp0 = await page.evaluate(() => window.__NQ__.get().xp)
const first = await current(page)
ok(first.q.level === 'N7' && first.q.stage === 1, `session starts with N7-1 (${first.id})`)
await answer(page, false)
ok(await page.locator('text=不正解').isVisible(), 'incorrect feedback shown')
ok(await page.locator('text=正确答案').isVisible(), 'correct answer displayed after a mistake')
ok(await page.locator('text=解说').isVisible(), 'Chinese explanation displayed')
await page.screenshot({ path: `${SHOTS}/mobile-feedback-wrong.png`, fullPage: true })
const rec = await page.evaluate((id) => window.__NQ__.get().records[id], first.id)
ok(rec && rec.incorrect === 1 && rec.nextReview - rec.lastAnswered === 10 * 60 * 1000, 'missed question scheduled for review in 10 minutes')
await next(page)
let sawOrder = false
let sawMatch = false
for (let i = 0; i < 30; i++) {
  const c = await current(page)
  if (!c.id) break
  if (c.q.format === 'order') sawOrder = true
  if (c.q.format === 'match') sawMatch = true
  await answer(page, true)
  if (i === 0) {
    ok(await page.locator('text=正解！').isVisible(), 'correct feedback shown')
    await page.screenshot({ path: `${SHOTS}/mobile-feedback-correct.png`, fullPage: true })
  }
  await next(page)
}
ok(sawOrder, 'sentence-building puzzle solved by tapping (no drag needed)')
ok(sawMatch, 'matching question solved by tapping')
await page.waitForSelector('text=ステージクリア！')
await page.screenshot({ path: `${SHOTS}/mobile-summary.png`, fullPage: true })
const s1 = await page.evaluate(() => window.__NQ__.get())
ok(s1.stages['N7-1']?.completed === true, 'stage N7-1 completed (9/10 = 90%)')
ok(s1.xp > xp0, `XP increased (${xp0} → ${s1.xp})`)
ok(s1.xp === 90 + 30 + 5, `XP = 9×10 + 30 stage bonus + 5 combo bonus (got ${s1.xp})`)

// ---------------------------------------------------------------------------
console.log('\n[3] Persistence after reload')
await page.reload()
await page.waitForSelector('text=今日の学習を始める')
const s2 = await page.evaluate(() => window.__NQ__.get())
ok(s2.xp === s1.xp, 'XP survives reload')
ok(s2.stages['N7-1']?.completed, 'stage progress survives reload')
ok(Object.keys(s2.records).length === 10, 'review history (10 records) survives reload')
ok(await page.locator('text=第 2 关').first().isVisible(), 'home now points to stage 2')

// ---------------------------------------------------------------------------
console.log('\n[4] Resume a session after reload mid-way')
await page.getByRole('button', { name: '今日の学習を始める' }).click()
await answer(page, true)
await next(page)
await answer(page, true)
await page.reload()
await page.waitForSelector('[aria-label="退出学习"]')
const resumed = await page.evaluate(() => window.__NQ__.get().activeSession.results.length)
ok(resumed === 2, `reload mid-session keeps the 2 answered questions (got ${resumed})`)
ok(await page.locator('text=3/10').isVisible(), 'reload continues at question 3/10')
await page.goto(BASE)
await page.waitForSelector('text=继续上次的学习')
ok(true, 'home offers to resume the interrupted session')
await page.getByRole('button', { name: '继续', exact: true }).click()
await page.waitForSelector('[aria-label="退出学习"]')
// finish stage 2 correctly
for (let i = 0; i < 30; i++) {
  const c = await current(page)
  if (!c.id) break
  await answer(page, true)
  await next(page)
}
await page.waitForSelector('text=/ステージクリア！|おつかれさま/')
ok((await page.evaluate(() => window.__NQ__.get().stages['N7-2']?.completed)) === true, 'stage N7-2 completed after resume')

// ---------------------------------------------------------------------------
console.log('\n[5] Spaced repetition: due items appear in review, intervals change')
await page.goto(BASE + '#review')
await page.waitForSelector('text=最近的错题')
ok((await page.locator('text=你的答案：').count()) === 1, 'the one missed question is listed under recent mistakes')
// Time travel: move every record's schedule 2 days into the past.
await page.evaluate(() => {
  const s = window.__NQ__.get()
  const records = Object.fromEntries(Object.entries(s.records).map(([k, r]) => [k, { ...r, nextReview: r.nextReview - 3 * 86400000, lastAnswered: r.lastAnswered - 3 * 86400000, lastIncorrect: r.lastIncorrect && r.lastIncorrect - 3 * 86400000 }]))
  window.__NQ__.replace({ ...s, records })
})
await page.reload()
await page.waitForSelector('text=现在可复习')
const due = await page.evaluate(() => Object.values(window.__NQ__.get().records).filter((r) => r.nextReview <= Date.now()).length)
ok(due >= 20, `after 3 days, ${due} questions are due`)
ok(await page.locator('text=已逾期').first().isVisible(), 'overdue count shown')
await page.screenshot({ path: `${SHOTS}/mobile-review-due.png`, fullPage: true })
await page.locator('button', { hasText: /^开始复习/ }).click()
const reviewPlan = await page.evaluate(() => window.__NQ__.get().activeSession.session)
ok(reviewPlan.kind === 'review' && reviewPlan.questionIds.length === 15, 'review session capped at 15 questions')
ok(reviewPlan.questionIds[0] === first.id, 'previously missed question is prioritised first')
const before = await page.evaluate(() => window.__NQ__.get().records)
// first: correct; second: wrong (should be retried once at the end)
const r1 = await current(page)
await answer(page, true)
await next(page)
const r2 = await current(page)
await answer(page, false)
await next(page)
let retries = 0
for (let i = 0; i < 40; i++) {
  const c = await current(page)
  if (!c.id) break
  if (c.id === r2.id) retries++
  await answer(page, true)
  await next(page)
}
await page.waitForSelector('text=おつかれさま！')
const after = await page.evaluate(() => window.__NQ__.get())
ok(retries === 1, `missed review item re-asked exactly once in the session (got ${retries})`)
ok(after.records[r1.id].interval > before[r1.id].interval, `correct review grows interval (${before[r1.id].interval} → ${after.records[r1.id].interval} d)`)
ok(after.records[r2.id].streak === 1 && after.records[r2.id].interval === 1, 'missed-then-relearned item restarts at 1 day')
ok(after.reviewStreak.current === 1, 'review streak recorded')
await page.reload()
ok((await page.evaluate(() => window.__NQ__.get().records))[r1.id].interval === after.records[r1.id].interval, 'review schedule survives reload')

// ---------------------------------------------------------------------------
console.log('\n[6] Weakness analysis with enough data')
await page.goto(BASE + '#progress')
await page.waitForSelector('text=薄弱项分析')
ok(await page.locator('text=正答率').first().isVisible(), 'category accuracy shown once data exists')
await page.screenshot({ path: `${SHOTS}/mobile-progress-data.png`, fullPage: true })

await mobile.close()

// ---------------------------------------------------------------------------
console.log('\n[7] Audio: no voices → graceful fallback; mocked Japanese voice → play / replay / speed')
const noVoice = await browser.newContext({ viewport: { width: 390, height: 844 } })
await noVoice.addInitScript(() => {
  localStorage.setItem('nihongo-quest:state', JSON.stringify({ version: 1, xp: 0, stages: {}, records: {}, settings: {} }))
})
page = await noVoice.newPage()
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(BASE)
await page.evaluate(() => {
  const s = window.__NQ__
  s.startSession({ kind: 'practice', title: 'listen', questionIds: ['n7-1-07'], optionOrder: { 'n7-1-07': s.question('n7-1-07').options }, allowRetry: false })
  location.hash = '#session'
})
await page.waitForTimeout(2000)
const fallbackShown = await page.locator('text=/没有找到日语语音|不支持语音合成/').isVisible()
ok(fallbackShown, 'missing Japanese voice → clear message')
ok(await page.locator('text=原文（无法播放语音时显示）').isVisible(), 'transcript shown so the learner can continue')
await answer(page, true)
ok(true, 'listening question still answerable without audio')
await noVoice.close()

const withVoice = await browser.newContext({ viewport: { width: 1280, height: 860 } })
await withVoice.addInitScript(() => {
  const spoken = []
  window.__spoken = spoken
  const voice = { voiceURI: 'ja-test', name: 'Test Japanese', lang: 'ja-JP', localService: true, default: true }
  const listeners = {}
  Object.defineProperty(window, 'speechSynthesis', {
    value: {
      getVoices: () => [voice],
      speak: (u) => {
        spoken.push({ text: u.text, rate: u.rate, lang: u.lang, voice: u.voice && u.voice.name })
        setTimeout(() => u.onend && u.onend(), 50)
      },
      cancel: () => {},
      addEventListener: (t, f) => (listeners[t] = f),
    },
  })
  window.SpeechSynthesisUtterance = function (text) {
    this.text = text
  }
})
page = await withVoice.newPage()
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(BASE)
await page.waitForSelector('text=今日の学習を始める')
await page.screenshot({ path: `${SHOTS}/desktop-home.png`, fullPage: true })
await noOverflow(page, 'desktop home')
await page.evaluate(() => {
  const s = window.__NQ__
  s.startSession({ kind: 'practice', title: 'listen', questionIds: ['n4-3-06'], optionOrder: { 'n4-3-06': s.question('n4-3-06').options }, allowRetry: false })
  location.hash = '#session'
})
await page.getByRole('button', { name: '播放音频' }).click()
await page.waitForTimeout(200)
await page.getByRole('button', { name: '重新播放' }).click()
await page.waitForTimeout(200)
await page.locator('[aria-label="语速"] button', { hasText: '慢速' }).click()
await page.waitForTimeout(200)
const spoken = await page.evaluate(() => window.__spoken)
ok(spoken.length === 3, `play, replay and slow playback each spoke (${spoken.length})`)
ok(spoken.every((s) => s.lang === 'ja-JP' && s.voice === 'Test Japanese'), 'Japanese voice selected')
ok(spoken[2].rate === 0.6 && spoken[0].rate === 0.9, `speed control applied (${spoken.map((s) => s.rate).join(', ')})`)
ok(!(await page.locator('text=原文').isVisible()), 'transcript hidden before answering (audio-first)')
await page.screenshot({ path: `${SHOTS}/desktop-listening.png`, fullPage: true })
await answer(page, true)
ok(await page.locator('text=原文').first().isVisible(), 'transcript revealed after answering')

// Desktop drag-and-drop on a sentence puzzle
await page.evaluate(() => {
  const s = window.__NQ__
  s.discardSession()
  const q = s.question('n6-2-08')
  s.startSession({ kind: 'practice', title: 'build', questionIds: ['n6-2-08'], optionOrder: { 'n6-2-08': ['勉強します', '日本語を', '毎日'] }, allowRetry: false })
  location.hash = '#session'
  void q
})
await page.waitForSelector('button[aria-label="添加「毎日」"]')
for (const t of ['毎日', '日本語を', '勉強します']) await page.dragAndDrop(`button[aria-label="添加「${t}」"]`, '[aria-label="你的答案"]')
const built = await page.evaluate(() => [...document.querySelectorAll('[aria-label="你的答案"] button')].map((b) => b.textContent).join(''))
ok(built === '毎日日本語を勉強します', `drag-and-drop builds the sentence (${built})`)
await page.getByRole('button', { name: '检查答案' }).click()
ok(await page.locator('text=正解！').isVisible(), 'dragged answer accepted')
await page.screenshot({ path: `${SHOTS}/desktop-build.png`, fullPage: true })
await withVoice.close()

// ---------------------------------------------------------------------------
console.log('\n[8] Corrupted storage / unavailable storage')
const corrupt = await browser.newContext()
await corrupt.addInitScript(() => {
  if (!sessionStorage.getItem('seeded')) {
    localStorage.setItem('nihongo-quest:state', '{"version":1, broken json')
    sessionStorage.setItem('seeded', '1')
  }
})
page = await corrupt.newPage()
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(BASE)
await page.waitForSelector('text=今日の学習を始める')
ok(await page.locator('text=已损坏').isVisible(), 'corrupted data → notice, app still works')
ok((await page.evaluate(() => localStorage.getItem('nihongo-quest:corrupt-backup'))) === '{"version":1, broken json', 'corrupted payload backed up')
await corrupt.close()

const blocked = await browser.newContext()
await blocked.addInitScript(() => {
  Object.defineProperty(window, 'localStorage', { get() { throw new Error('SecurityError') } })
})
page = await blocked.newPage()
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(BASE)
await page.waitForSelector('text=今日の学習を始める')
ok(await page.locator('text=无法保存数据').isVisible(), 'localStorage unavailable → warning, app still works')
await page.getByRole('button', { name: '今日の学習を始める' }).click()
await answer(page, true)
ok(true, 'can learn without storage')
await blocked.close()

// ---------------------------------------------------------------------------
console.log('\n[9] Reset progress requires confirmation')
const reset = await browser.newContext({ viewport: { width: 390, height: 844 } })
page = await reset.newPage()
await page.goto(BASE)
await page.evaluate(() => window.__NQ__.replace({ ...window.__NQ__.get(), xp: 500 }))
await page.goto(BASE + '#prefs')
await page.getByRole('button', { name: '重置全部学习进度…' }).click()
ok(await page.getByRole('button', { name: '确认删除' }).isDisabled(), 'delete disabled until confirmation typed')
await page.getByLabel('输入重置确认').fill('重置')
await page.getByRole('button', { name: '确认删除' }).click()
ok((await page.evaluate(() => window.__NQ__.get().xp)) === 0, 'progress reset after confirmation')
await page.screenshot({ path: `${SHOTS}/mobile-settings.png`, fullPage: true })
await reset.close()

await browser.close()
ok(errors.length === 0, `no uncaught page errors${errors.length ? ': ' + errors.join(' | ') : ''}`)
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll e2e checks passed')
process.exit(failures ? 1 : 0)
