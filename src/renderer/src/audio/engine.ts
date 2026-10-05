import { onFrame } from '@/lib/ticker'

/**
 * Smoothed, volume-independent audio levels in 0..1, refreshed every frame while something is playing.
 * Shaders and canvases read this object directly instead of going through React.
 */
export const levels = { bass: 0, mid: 0, treble: 0, level: 0, beat: 0 }

const FFT = 2048

class AudioEngine {
  readonly el = new Audio()
  /** Raw spectrum, 0..255 per bin. */
  readonly spectrum = new Uint8Array(FFT / 2)
  private ctx: AudioContext | null = null
  private gain: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private volume = 1
  private bassAvg = 0
  private stopFrames: (() => void) | null = null

  constructor() {
    this.el.crossOrigin = 'anonymous'
    this.el.preload = 'auto'
    this.el.addEventListener('play', () => this.start())
  }

  /** Built on first play: element → analyser (pre-volume, so visuals don't shrink when it's quiet) → gain → speakers. */
  private graph(): void {
    if (this.ctx) return
    this.ctx = new AudioContext({ latencyHint: 'playback' })
    const source = this.ctx.createMediaElementSource(this.el)
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = FFT
    this.analyser.smoothingTimeConstant = 0.72
    this.gain = this.ctx.createGain()
    this.gain.gain.value = this.volume
    source.connect(this.analyser)
    source.connect(this.gain)
    this.gain.connect(this.ctx.destination)
  }

  private start(): void {
    this.graph()
    void this.ctx?.resume()
    this.stopFrames ??= onFrame((dt) => this.update(dt))
  }

  private band(from: number, to: number): number {
    let sum = 0
    for (let i = from; i < to; i++) sum += this.spectrum[i]
    return sum / ((to - from) * 255)
  }

  private update(dt: number): void {
    const playing = !this.el.paused
    if (playing && this.analyser) this.analyser.getByteFrequencyData(this.spectrum)
    else this.spectrum.fill(0)

    // ~23 Hz per bin at 48 kHz.
    const bass = playing ? this.band(1, 7) : 0
    const mid = playing ? this.band(7, 60) : 0
    const treble = playing ? this.band(60, 320) : 0
    const ease = (current: number, target: number): number => current + (target - current) * Math.min(1, dt * (target > current ? 26 : 7))
    levels.bass = ease(levels.bass, bass)
    levels.mid = ease(levels.mid, Math.min(1, mid * 1.5))
    levels.treble = ease(levels.treble, Math.min(1, treble * 2.4))
    levels.level = ease(levels.level, Math.min(1, bass * 0.5 + mid * 0.7 + treble * 0.6))

    // A beat is bass jumping clear of its own recent average.
    this.bassAvg += (bass - this.bassAvg) * Math.min(1, dt * 2.5)
    if (bass > 0.35 && bass > this.bassAvg * 1.22) levels.beat = 1
    else levels.beat = Math.max(0, levels.beat - dt * 3.6)

    if (!playing && levels.level < 0.002 && levels.beat === 0) {
      levels.bass = levels.mid = levels.treble = levels.level = 0
      this.stopFrames?.()
      this.stopFrames = null
    }
  }

  load(url: string): void {
    this.el.src = url
  }

  play(): Promise<void> {
    return this.el.play().catch(() => {
      // Rejected because another load() interrupted it, or the file is unplayable; the 'error' event covers the latter.
    })
  }

  pause(): void {
    this.el.pause()
  }

  setVolume(value: number, muted: boolean): void {
    // Squared: equal slider steps should sound like equal loudness steps.
    this.volume = muted ? 0 : value * value
    if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02)
  }
}

export const engine = new AudioEngine()
