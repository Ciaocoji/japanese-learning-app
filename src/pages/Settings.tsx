import { useState, useSyncExternalStore } from 'react'
import { getAudio } from '../audio/audio'
import { getStore } from '../engine/storage'
import { store, useAppState } from '../state/store'
import { navigate } from '../state/router'
import { Button, Card, SectionTitle, cx } from '../components/ui'
import type { Settings } from '../types'

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="font-medium">{label}</div>
        {hint && <div className="text-xs text-stone-500">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="inline-flex rounded-xl bg-stone-100 p-1 dark:bg-stone-800" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.v)} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)} className={cx('min-h-10 rounded-lg px-3 text-sm font-medium', value === o.v ? 'bg-white shadow-sm dark:bg-stone-950' : 'text-stone-500')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cx('relative h-8 w-14 rounded-full transition-colors', checked ? 'bg-accent-500' : 'bg-stone-300 dark:bg-stone-700')}>
      <span className={cx('absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform', checked && 'translate-x-6')} />
    </button>
  )
}

export function SettingsPage() {
  const { settings } = useAppState()
  const audio = getAudio()
  const status = useSyncExternalStore(audio.subscribe.bind(audio), () => audio.status())
  const voices = audio.voices()
  const [confirm, setConfirm] = useState(false)
  const [text, setText] = useState('')
  const set = (patch: Partial<Settings>) => store.updateSettings(patch)
  const persistent = getStore().persistent

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle ja="設定" zh="设置" />
        <div className="divide-y divide-stone-100 dark:divide-stone-800">
          <Row label="每日目标" hint="每天要回答的题数">
            <Segmented label="每日目标" value={settings.dailyGoal} onChange={(v) => set({ dailyGoal: v })} options={[10, 20, 30, 50].map((v) => ({ v, label: `${v}` }))} />
          </Row>
          <Row label="显示假名读音" hint="在汉字下方显示平假名">
            <Toggle label="显示假名读音" checked={settings.showReading} onChange={(v) => set({ showReading: v })} />
          </Row>
          <Row label="外观">
            <Segmented label="外观" value={settings.theme} onChange={(v) => set({ theme: v })} options={[{ v: 'system', label: '跟随系统' }, { v: 'light', label: '浅色' }, { v: 'dark', label: '深色' }]} />
          </Row>
        </div>
      </Card>

      <Card>
        <SectionTitle ja="音声" zh="语音" />
        <p className="mb-2 text-xs text-stone-500">语音由浏览器的语音合成生成，发音和语调可能与真人有差异，仅供参考。</p>
        <div className="divide-y divide-stone-100 dark:divide-stone-800">
          <Row label="状态">
            <span className={cx('text-sm', status === 'ready' ? 'text-emerald-600' : 'text-amber-600')}>
              {status === 'ready' ? `可用（${voices.length} 个日语语音）` : status === 'loading' ? '加载中…' : status === 'unsupported' ? '浏览器不支持' : '未找到日语语音'}
            </span>
          </Row>
          {voices.length > 0 && (
            <Row label="日语语音">
              <select className="min-h-11 max-w-64 rounded-xl border border-stone-300 bg-white px-3 dark:border-stone-700 dark:bg-stone-900" value={settings.voiceURI ?? ''} onChange={(e) => set({ voiceURI: e.target.value || null })} aria-label="选择日语语音">
                <option value="">自动选择</option>
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </Row>
          )}
          <Row label="语速">
            <Segmented label="语速" value={settings.speechRate} onChange={(v) => set({ speechRate: v })} options={[{ v: 0.6, label: '慢速' }, { v: 0.9, label: '正常' }, { v: 1.1, label: '较快' }]} />
          </Row>
          <Row label="听力题自动播放">
            <Toggle label="听力题自动播放" checked={settings.autoPlayAudio} onChange={(v) => set({ autoPlayAudio: v })} />
          </Row>
          {status === 'ready' && (
            <Row label="试听">
              <Button variant="secondary" onClick={() => void audio.play({ text: 'こんにちは。日本語の勉強、がんばりましょう。', rate: settings.speechRate }).catch(() => {})}>
                ▶ 试听
              </Button>
            </Row>
          )}
        </div>
      </Card>

      <Card>
        <SectionTitle ja="データ" zh="数据" />
        <p className="text-sm text-stone-600 dark:text-stone-300">
          {persistent ? '学习记录保存在本浏览器中（无需登录）。清除浏览器数据会删除记录。' : '⚠️ 当前浏览器无法使用本地存储（可能是隐私模式），关闭页面后记录将丢失。'}
        </p>
        {!confirm ? (
          <Button variant="secondary" className="mt-4 text-red-600" onClick={() => setConfirm(true)}>
            重置全部学习进度…
          </Button>
        ) : (
          <div className="mt-4 space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
            <p className="text-sm">这将删除所有 XP、关卡进度、复习记录和错题，且无法恢复。请输入「重置」确认。</p>
            <input value={text} onChange={(e) => setText(e.target.value)} className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 dark:border-stone-700 dark:bg-stone-900" aria-label="输入重置确认" placeholder="重置" />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { setConfirm(false); setText('') }}>取消</Button>
              <Button variant="danger" disabled={text.trim() !== '重置'} onClick={() => { store.resetAll(); setConfirm(false); setText(''); navigate('home') }}>
                确认删除
              </Button>
            </div>
          </div>
        )}
      </Card>
      <p className="text-center text-xs text-stone-400">Nihongo Quest v1.0 · N7、N6 为本应用自定义等级，非 JLPT 官方等级</p>
    </div>
  )
}
