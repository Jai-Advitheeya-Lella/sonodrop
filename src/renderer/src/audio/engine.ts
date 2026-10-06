import type { OutputDevice } from '@shared/types'
import { onFrame } from '@/lib/ticker'
import { feed, FEED_SIZE, levels, transport } from './levels'
import { createRouter, SPEAKER_DEFAULTS, type Router, type SpeakerSettings } from './router'
// A real file, never an inlined data: URL — the content security policy only lets scripts load from the app itself.
import tapUrl from './tap.worklet.js?url&no-inline'

const FFT = 2048

/** Centre frequencies of the ten equaliser bands, an octave apart. */
export const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
export const EQ_RANGE = 12

export interface EqSettings {
  on: boolean
  /** dB per band, -EQ_RANGE..EQ_RANGE */
  gains: number[]
  /** dB */
  preamp: number
  /** Pull the whole signal down by the largest boost so a boosted band can't clip. */
  guard: boolean
  preset: string
}

export const EQ_FLAT: EqSettings = { on: false, gains: EQ_BANDS.map(() => 0), preamp: 0, guard: true, preset: 'flat' }

/** Build the ten filters of the equaliser in any audio context: shelves at the ends, bells between. */
export function createEqFilters(ctx: BaseAudioContext): BiquadFilterNode[] {
  return EQ_BANDS.map((frequency, i) => {
    const filter = ctx.createBiquadFilter()
    if (i === 0) {
      filter.type = 'lowshelf'
      filter.frequency.value = 45
    } else if (i === EQ_BANDS.length - 1) {
      filter.type = 'highshelf'
      filter.frequency.value = 11300
    } else {
      filter.type = 'peaking'
      filter.frequency.value = frequency
      filter.Q.value = 1.41
    }
    return filter
  })
}

/** The gain (dB) applied before the filters. */
export function eqPreamp(eq: EqSettings): number {
  return eq.on ? eq.preamp - (eq.guard ? Math.max(0, ...eq.gains) : 0) : 0
}

let cachedDeviceRate = 0

/** The sample rate the system mixer runs the output device at. */
export function deviceRate(): number {
  if (!cachedDeviceRate) {
    const probe = new AudioContext()
    cachedDeviceRate = probe.sampleRate
    void probe.close()
  }
  return cachedDeviceRate
}

/** Everything about the output that needs a fresh audio graph when it changes. */
export interface OutputPlan {
  /** Sample rate of the graph; null follows the device. */
  rate: number | null
  /** Send the finished audio straight to the sound server in this layout, instead of through the built-in (stereo) output. */
  direct: { map: string[] } | null
  /** Channels in the file being played. */
  sourceChannels: number
  speakers: SpeakerSettings
}

const STEREO_PLAN: OutputPlan = { rate: null, direct: null, sourceChannels: 2, speakers: SPEAKER_DEFAULTS }

/** The parts of a plan that can't be changed on a running graph. */
const shape = (p: OutputPlan): string =>
  JSON.stringify([p.rate, p.direct?.map, p.direct ? [p.sourceChannels > 2 ? p.sourceChannels : 2, p.speakers.mode, p.speakers.sub, p.speakers.cutMains] : 0])

/** The direct output buffers a little before the speakers get it; the visuals wait the same amount. */
const DIRECT_LATENCY = 0.14

/** Decide how to play, given the device, the settings and the file. */
export function planOutput(options: {
  rate: number | null
  device: OutputDevice | null
  canDirect: boolean
  speakers: SpeakerSettings
  sourceChannels: number
}): OutputPlan {
  const { rate, device, canDirect, speakers, sourceChannels } = options
  let direct: OutputPlan['direct'] = null
  if (device && canDirect) {
    const surround = device.channels > 2 && speakers.mode !== 'stereo'
    // The built-in output always converts to the device's rate; going direct keeps the rate that was asked for.
    const offRate = rate !== null && rate !== device.rate
    if (surround) direct = { map: device.map }
    else if (offRate) direct = { map: device.channels <= 2 ? device.map : ['front-left', 'front-right'] }
  }
  return { rate, direct, sourceChannels, speakers }
}

/**
 * Playback and analysis.
 *
 *   <audio> → preamp → 10 EQ filters ─┬→ analyser (visuals; before volume, so they don't shrink when it's quiet)
 *                                     └→ volume ─┬→ built-in output (stereo)
 *                                                └→ router → tap → main process → sound server (surround / other rates)
 *
 * The audio element and context are replaced when the plan changes shape, so listeners are
 * registered through on() and survive the swap.
 */
class AudioEngine {
  el = this.createElement()
  private ctx: AudioContext | null = null
  private volumeNode: GainNode | null = null
  private preampNode: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private filters: BiquadFilterNode[] = []
  private readonly handlers: [string, EventListener][] = []
  private readonly spectrum = new Uint8Array(FFT / 2)
  private readonly wave = new Uint8Array(FFT)
  private bandEdges: number[] = []
  private plan: OutputPlan = STEREO_PLAN
  private router: Router | null = null
  private volume = 1
  private eq: EqSettings = EQ_FLAT
  private bassAvg = 0
  private stopFrames: (() => void) | null = null

  private createElement(): HTMLAudioElement {
    const el = new Audio()
    el.crossOrigin = 'anonymous'
    el.preload = 'auto'
    el.addEventListener('play', () => this.start())
    const track = (): void => {
      transport.playing = !el.paused
      transport.progress = el.duration > 0 ? el.currentTime / el.duration : 0
    }
    for (const type of ['play', 'pause', 'timeupdate', 'seeked', 'emptied']) el.addEventListener(type, track)
    return el
  }

  /** Like el.addEventListener, but carried over to the replacement element when the engine is rebuilt. */
  on(type: string, handler: EventListener): void {
    this.handlers.push([type, handler])
    this.el.addEventListener(type, handler)
  }

  /** Whether applying this plan would need a new audio graph (and so a reload of the current track). */
  needsRebuild(plan: OutputPlan): boolean {
    return shape(plan) !== shape(this.plan)
  }

  /**
   * Apply an output plan. Returns true when the engine had to be rebuilt,
   * in which case whatever was loaded is gone and must be loaded again.
   */
  configure(plan: OutputPlan): boolean {
    const rebuild = this.needsRebuild(plan)
    this.plan = plan
    if (!rebuild) {
      this.router?.tune(plan.speakers)
      return false
    }
    for (const [type, handler] of this.handlers) this.el.removeEventListener(type, handler)
    this.el.pause()
    this.el.removeAttribute('src')
    this.el.load()
    void this.ctx?.close()
    if (this.router) window.sono.audio.closeSink()
    this.ctx = this.volumeNode = this.preampNode = this.analyser = this.router = null
    this.filters = []
    this.el = this.createElement()
    for (const [type, handler] of this.handlers) this.el.addEventListener(type, handler)
    return true
  }

  private graph(): void {
    if (this.ctx) return
    const { rate, direct, sourceChannels, speakers } = this.plan
    try {
      this.ctx = new AudioContext({ latencyHint: 'playback', ...(rate ? { sampleRate: rate } : {}) })
    } catch {
      // A rate the platform refuses: fall back to the device's own.
      this.ctx = new AudioContext({ latencyHint: 'playback' })
    }
    const ctx = this.ctx
    const source = ctx.createMediaElementSource(this.el)
    this.preampNode = ctx.createGain()
    this.filters = createEqFilters(ctx)
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = FFT
    this.analyser.smoothingTimeConstant = 0.72
    this.volumeNode = ctx.createGain()
    this.volumeNode.gain.value = this.volume

    let node: AudioNode = source.connect(this.preampNode)
    for (const filter of this.filters) node = node.connect(filter)
    node.connect(this.volumeNode)

    if (direct) {
      const map = direct.map
      this.router = createRouter(ctx, this.volumeNode, sourceChannels, map, speakers)
      const spec = { rate: ctx.sampleRate, channels: map.length, map }
      void ctx.audioWorklet.addModule(tapUrl).then(() => {
        if (this.ctx !== ctx || !this.router) return
        const tap = new AudioWorkletNode(ctx, 'sono-tap', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: map.length,
          channelCountMode: 'explicit',
          channelInterpretation: 'discrete',
          // About 20 ms a chunk, in whole render quanta.
          processorOptions: { channels: map.length, chunk: 128 * Math.max(1, Math.round((ctx.sampleRate * 0.02) / 128)) }
        })
        this.router.output.connect(tap)
        // The tap makes no sound itself; a muted link to the built-in output keeps the graph's clock tied to the device.
        const silent = ctx.createGain()
        silent.gain.value = 0
        tap.connect(silent).connect(ctx.destination)
        // One end of a channel goes to the audio thread, the other (via the preload) to the main process.
        const channel = new MessageChannel()
        tap.port.postMessage({ port: channel.port1 }, [channel.port1])
        window.postMessage({ sonoSink: spec }, '*', [channel.port2])
      }).catch((err) => {
        // Better stereo than silence.
        console.error('[audio] direct output unavailable, falling back to the built-in output', err)
        if (this.ctx === ctx) this.volumeNode?.connect(ctx.destination)
      })
      const wait = ctx.createDelay(1)
      wait.delayTime.value = DIRECT_LATENCY
      node.connect(wait).connect(this.analyser)
    } else {
      this.volumeNode.connect(ctx.destination)
      node.connect(this.analyser)
    }
    this.applyEq(0)

    const hzPerBin = ctx.sampleRate / FFT
    this.bandEdges = Array.from({ length: FEED_SIZE + 1 }, (_, i) => Math.max(1, Math.round((30 * (16000 / 30) ** (i / FEED_SIZE)) / hzPerBin)))
  }

  private start(): void {
    this.graph()
    void this.ctx?.resume()
    this.stopFrames ??= onFrame((dt) => this.update(dt))
  }

  private applyEq(smoothing = 0.03): void {
    if (!this.ctx || !this.preampNode) return
    const now = this.ctx.currentTime
    const set = (param: AudioParam, value: number): void => {
      if (smoothing) param.setTargetAtTime(value, now, smoothing)
      else param.value = value
    }
    this.filters.forEach((filter, i) => set(filter.gain, this.eq.on ? (this.eq.gains[i] ?? 0) : 0))
    set(this.preampNode.gain, 10 ** (eqPreamp(this.eq) / 20))
  }

  setEq(eq: EqSettings): void {
    this.eq = eq
    this.applyEq()
  }

  /** Average of the spectrum between two frequencies, 0..1. */
  private band(fromHz: number, toHz: number): number {
    const hzPerBin = (this.ctx?.sampleRate ?? 48000) / FFT
    const from = Math.max(1, Math.round(fromHz / hzPerBin))
    const to = Math.max(from + 1, Math.round(toHz / hzPerBin))
    let sum = 0
    for (let i = from; i < to; i++) sum += this.spectrum[i]
    return sum / ((to - from) * 255)
  }

  private update(dt: number): void {
    const playing = !this.el.paused
    if (playing && this.analyser) {
      this.analyser.getByteFrequencyData(this.spectrum)
      this.analyser.getByteTimeDomainData(this.wave)
    } else {
      this.spectrum.fill(0)
      this.wave.fill(128)
    }

    for (let b = 0; b < FEED_SIZE; b++) {
      let peak = 0
      for (let i = this.bandEdges[b] ?? 1; i < Math.max((this.bandEdges[b] ?? 1) + 1, this.bandEdges[b + 1] ?? 2); i++) peak = Math.max(peak, this.spectrum[i])
      feed[b] = peak
    }
    // Start the waveform at a rising zero crossing so it stands still instead of jittering sideways.
    let start = 0
    for (let i = 1; i < FFT / 2; i++) {
      if (this.wave[i - 1] < 128 && this.wave[i] >= 128) {
        start = i
        break
      }
    }
    for (let i = 0; i < FEED_SIZE; i++) feed[FEED_SIZE + i] = this.wave[start + i * 12]

    const bass = playing ? this.band(20, 150) : 0
    const mid = playing ? this.band(150, 1400) : 0
    const treble = playing ? this.band(1400, 7500) : 0
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
    if (this.volumeNode && this.ctx) this.volumeNode.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02)
  }
}

export const engine = new AudioEngine()
