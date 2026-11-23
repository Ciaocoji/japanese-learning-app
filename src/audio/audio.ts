/**
 * Audio layer.
 *
 * Playback goes through `AudioService`, so the browser TTS implementation can be swapped
 * for recorded native audio or an external TTS service later without touching the UI.
 * Recorded files (question.audioUrl) are always preferred over synthesized speech.
 *
 * Note: browser speech synthesis is a convenience, not a substitute for native recordings —
 * pitch accent and intonation may be unnatural depending on the device's voice.
 */

export interface VoiceInfo {
  id: string
  name: string
  lang: string
  local: boolean
}

export interface PlayRequest {
  text?: string
  url?: string
  rate?: number
}

export type AudioStatus = 'unsupported' | 'loading' | 'ready' | 'no-japanese-voice'

export interface AudioService {
  status(): AudioStatus
  voices(): VoiceInfo[]
  setVoice(id: string | null): void
  play(req: PlayRequest): Promise<void>
  stop(): void
  subscribe(fn: () => void): () => void
}

const isJapanese = (lang: string) => /^ja([-_]|$)/i.test(lang)

class BrowserAudioService implements AudioService {
  private synth: SpeechSynthesis | null = null
  private jaVoices: SpeechSynthesisVoice[] = []
  private voiceId: string | null = null
  private loaded = false
  private listeners = new Set<() => void>()
  private audioEl: HTMLAudioElement | null = null

  constructor() {
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined') {
        this.synth = window.speechSynthesis
        this.refresh()
        // Voices load asynchronously in Chrome; Safari may never fire the event.
        this.synth.addEventListener?.('voiceschanged', () => this.refresh())
        setTimeout(() => {
          this.loaded = true
          this.refresh()
        }, 1500)
      }
    } catch {
      this.synth = null
    }
  }

  private refresh() {
    if (!this.synth) return
    try {
      const all = this.synth.getVoices()
      if (all.length) this.loaded = true
      this.jaVoices = all.filter((v) => isJapanese(v.lang))
    } catch {
      this.jaVoices = []
    }
    this.emit()
  }

  private emit() {
    this.listeners.forEach((fn) => fn())
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn)
    return () => void this.listeners.delete(fn)
  }

  status(): AudioStatus {
    if (!this.synth) return 'unsupported'
    if (this.jaVoices.length) return 'ready'
    return this.loaded ? 'no-japanese-voice' : 'loading'
  }

  voices(): VoiceInfo[] {
    return this.jaVoices.map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang, local: v.localService }))
  }

  setVoice(id: string | null) {
    this.voiceId = id
  }

  private pickVoice(): SpeechSynthesisVoice | undefined {
    if (this.voiceId) {
      const v = this.jaVoices.find((x) => x.voiceURI === this.voiceId)
      if (v) return v
    }
    // Prefer ja-JP, then local voices (lower latency, work offline).
    return (
      this.jaVoices.find((v) => /ja-JP/i.test(v.lang) && v.localService) ??
      this.jaVoices.find((v) => /ja-JP/i.test(v.lang)) ??
      this.jaVoices[0]
    )
  }

  async play({ text, url, rate = 1 }: PlayRequest): Promise<void> {
    this.stop()
    if (url) {
      try {
        this.audioEl = new Audio(url)
        this.audioEl.playbackRate = rate
        await this.audioEl.play()
        return
      } catch {
        // fall through to TTS
      }
    }
    if (!text || !this.synth) throw new Error('audio-unavailable')
    const synth = this.synth
    return new Promise<void>((resolve, reject) => {
      try {
        const u = new SpeechSynthesisUtterance(text)
        u.lang = 'ja-JP'
        const voice = this.pickVoice()
        if (voice) u.voice = voice
        u.rate = Math.min(2, Math.max(0.3, rate))
        u.onend = () => resolve()
        u.onerror = (e) => (e.error === 'interrupted' || e.error === 'canceled' ? resolve() : reject(new Error(e.error)))
        synth.speak(u)
      } catch (e) {
        reject(e)
      }
    })
  }

  stop() {
    try {
      this.synth?.cancel()
    } catch {
      /* ignore */
    }
    if (this.audioEl) {
      this.audioEl.pause()
      this.audioEl = null
    }
  }
}

let instance: AudioService | null = null

export function getAudio(): AudioService {
  instance ??= new BrowserAudioService()
  return instance
}

/** Replace the audio backend (e.g. recorded audio / cloud TTS, or a test double). */
export function setAudioService(svc: AudioService) {
  instance = svc
}
