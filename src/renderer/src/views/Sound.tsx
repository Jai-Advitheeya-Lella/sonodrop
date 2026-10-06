import { useEffect, useMemo, useRef } from 'react'
import { createEqFilters, deviceRate, EQ_BANDS, EQ_FLAT, EQ_RANGE, eqPreamp, type EqSettings } from '@/audio/engine'
import { feed, FEED_SIZE } from '@/audio/levels'
import { Icon } from '@/components/Icon'
import { clamp } from '@/lib/format'
import { useCurrentTrack } from '@/lib/hooks'
import { onFrame } from '@/lib/ticker'
import { useUi, type Resample } from '@/stores/ui'
import { palette } from '@/themes'

/** Starting points. Gains are dB for the ten bands, 32 Hz to 16 kHz. */
export const EQ_PRESETS: [id: string, name: string, gains: number[]][] = [
  ['flat', 'Flat', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  ['bass', 'Bass boost', [7, 6, 4, 2, 0, 0, 0, 0, 0, 0]],
  ['treble', 'Treble boost', [0, 0, 0, 0, 0, 0, 2, 4, 5, 6]],
  ['vocal', 'Vocal', [-2, -2, -1, 1, 3, 4, 3, 2, 0, -1]],
  ['loudness', 'Loudness', [6, 4, 1, 0, -1, -1, 0, 1, 4, 5]],
  ['rock', 'Rock', [5, 4, 2, 0, -1, -1, 1, 3, 4, 5]],
  ['pop', 'Pop', [-1, 0, 2, 3, 4, 3, 1, 0, -1, -1]],
  ['electronic', 'Electronic', [5, 4, 1, 0, -2, 1, 0, 2, 4, 5]],
  ['hiphop', 'Hip-hop', [6, 5, 2, 3, -1, -1, 1, 0, 2, 3]],
  ['jazz', 'Jazz', [3, 2, 1, 2, -1, -1, 0, 1, 2, 3]],
  ['classical', 'Classical', [4, 3, 2, 1, 0, 0, 0, 1, 2, 3]],
  ['acoustic', 'Acoustic', [4, 4, 3, 1, 2, 2, 3, 3, 3, 2]],
  ['night', 'Late night', [-7, -5, -2, 0, 1, 2, 2, 1, 0, -1]]
]

const RATES: [Resample, string][] = [
  ['off', 'Off'],
  ['device', 'Device rate'],
  [88200, '88.2 kHz'],
  [96000, '96 kHz'],
  [176400, '176.4 kHz'],
  [192000, '192 kHz']
]

const khz = (hz: number): string => `${+(hz / 1000).toFixed(1)} kHz`
const db = (value: number): string => `${value > 0 ? '+' : ''}${value.toFixed(1).replace(/\.0$/, '')}`
const css = (c: readonly number[], alpha = 1): string => `rgb(${c.map((v) => Math.round(v * 255)).join(' ')} / ${alpha})`

const POINTS = 180
const FREQS = Float32Array.from({ length: POINTS }, (_, i) => 20 * 1000 ** (i / (POINTS - 1)))

/**
 * The equaliser's true frequency response, computed from the same filters the audio runs through,
 * drawn over the live spectrum so you can see what a change does to the music.
 */
function ResponseCurve({ eq }: { eq: EqSettings }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  // A twin of the playback filters, in an offline context, used only to ask "what would this do?".
  const model = useMemo(() => createEqFilters(new OfflineAudioContext(1, 1, 48000)), [])
  const curve = useMemo(() => {
    const total = new Float32Array(POINTS).fill(eqPreamp(eq))
    const magnitude = new Float32Array(POINTS)
    const phase = new Float32Array(POINTS)
    model.forEach((filter, i) => {
      filter.gain.value = eq.on ? (eq.gains[i] ?? 0) : 0
      filter.getFrequencyResponse(FREQS, magnitude, phase)
      for (let p = 0; p < POINTS; p++) total[p] += 20 * Math.log10(magnitude[p])
    })
    return total
  }, [eq, model])
  const latest = useRef(curve)
  latest.current = curve

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    let width = 0
    let height = 0
    const observer = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width
      height = entry.contentRect.height
      const ratio = Math.min(window.devicePixelRatio, 2)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    })
    observer.observe(canvas)
    const shown = new Float32Array(POINTS)

    const stop = onFrame((dt) => {
      if (width === 0) return
      // The line eases to its new shape instead of jumping.
      for (let i = 0; i < POINTS; i++) shown[i] += (latest.current[i] - shown[i]) * Math.min(1, dt * 12)
      const y = (gain: number): number => height / 2 - (gain / (EQ_RANGE + 6)) * (height / 2)
      const x = (i: number): number => (i / (POINTS - 1)) * width
      const ink = palette.light ? '0 0 0' : '255 255 255'
      ctx.clearRect(0, 0, width, height)

      // What is playing right now (the feed covers 30 Hz – 16 kHz, the plot 20 Hz – 20 kHz).
      const from = Math.log(30 / 20) / Math.log(1000)
      const to = Math.log(16000 / 20) / Math.log(1000)
      ctx.fillStyle = `rgb(${ink} / 0.07)`
      ctx.beginPath()
      ctx.moveTo(from * width, height)
      for (let b = 0; b < FEED_SIZE; b++) ctx.lineTo((from + (to - from) * (b / (FEED_SIZE - 1))) * width, height - (feed[b] / 255) * height * 0.9)
      ctx.lineTo(to * width, height)
      ctx.fill()

      ctx.strokeStyle = `rgb(${ink} / 0.1)`
      ctx.lineWidth = 1
      ctx.beginPath()
      for (const gain of [-12, -6, 0, 6, 12]) {
        ctx.moveTo(0, Math.round(y(gain)) + 0.5)
        ctx.lineTo(width, Math.round(y(gain)) + 0.5)
      }
      ctx.stroke()

      const trace = (): void => {
        ctx.moveTo(0, y(shown[0]))
        for (let i = 1; i < POINTS; i++) ctx.lineTo(x(i), y(shown[i]))
      }
      const gradient = ctx.createLinearGradient(0, 0, width, 0)
      gradient.addColorStop(0, css(palette.b))
      gradient.addColorStop(0.5, css(palette.a))
      gradient.addColorStop(1, css(palette.c))
      ctx.fillStyle = css(palette.a, 0.14)
      ctx.beginPath()
      trace()
      ctx.lineTo(width, y(0))
      ctx.lineTo(0, y(0))
      ctx.fill()
      ctx.strokeStyle = gradient
      ctx.lineWidth = 3
      ctx.lineJoin = 'round'
      ctx.beginPath()
      trace()
      ctx.stroke()
    })
    return () => {
      stop()
      observer.disconnect()
    }
  }, [])

  return <canvas ref={ref} className="eq-curve" aria-hidden />
}

interface BandProps {
  label: string
  value: number
  disabled?: boolean
  onChange(value: number): void
}

/** One vertical fader: drag, scroll, or double-click to zero it. */
function Band({ label, value, disabled, onChange }: BandProps): React.JSX.Element {
  const dragging = useRef(false)
  const at = (e: React.PointerEvent<HTMLDivElement>): number => {
    const rect = e.currentTarget.getBoundingClientRect()
    const raw = (0.5 - (e.clientY - rect.top) / rect.height) * 2 * EQ_RANGE
    return clamp(Math.round(raw * 2) / 2, -EQ_RANGE, EQ_RANGE)
  }
  const fraction = value / EQ_RANGE / 2
  return (
    <div className={`eq-band ${disabled ? 'off' : ''}`}>
      <span className="eq-value">{db(value)}</span>
      <div
        className="eq-slot"
        role="slider"
        tabIndex={0}
        aria-label={`${label} gain`}
        aria-valuemin={-EQ_RANGE}
        aria-valuemax={EQ_RANGE}
        aria-valuenow={value}
        onPointerDown={(e) => {
          dragging.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          onChange(at(e))
        }}
        onPointerMove={(e) => dragging.current && onChange(at(e))}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onDoubleClick={() => onChange(0)}
        onWheel={(e) => onChange(clamp(value - Math.sign(e.deltaY) * 0.5, -EQ_RANGE, EQ_RANGE))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') onChange(clamp(value + 0.5, -EQ_RANGE, EQ_RANGE))
          else if (e.key === 'ArrowDown') onChange(clamp(value - 0.5, -EQ_RANGE, EQ_RANGE))
          else return
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        <i className="eq-fill" style={{ height: `${Math.abs(fraction) * 100}%`, [value >= 0 ? 'bottom' : 'top']: '50%' }} />
        <i className="eq-thumb" style={{ top: `${(0.5 - fraction) * 100}%` }} />
      </div>
      <span className="eq-label">{label}</span>
    </div>
  )
}

export function Sound(): React.JSX.Element {
  const eq = useUi((s) => s.eq)
  const resample = useUi((s) => s.resample)
  const canResample = useUi((s) => s.canResample)
  const patch = useUi((s) => s.patch)
  const track = useCurrentTrack()
  const device = useMemo(deviceRate, [])
  const setEq = (change: Partial<EqSettings>): void => patch({ eq: { ...eq, ...change } })
  const target = resample === 'off' || !canResample ? null : resample === 'device' ? device : resample

  return (
    <div className="view sound">
      <header className="view-head">
        <div>
          <p className="kicker">Shape it</p>
          <h1>Sound</h1>
        </div>
      </header>

      <h2 className="section">Equaliser</h2>
      <div className={`setting-card equaliser ${eq.on ? '' : 'bypassed'}`}>
        <div className="eq-top">
          <button className="toggle-row slim" role="switch" aria-checked={eq.on} onClick={() => setEq({ on: !eq.on })}>
            <span className="toggle">
              <i />
            </span>
            <strong>{eq.on ? 'On' : 'Off'}</strong>
          </button>
          <div className="chip-row">
            {EQ_PRESETS.map(([id, name, gains]) => (
              <button key={id} className={`pill small ${eq.preset === id ? 'on' : ''}`} onClick={() => setEq({ on: true, preset: id, gains })}>
                {name}
              </button>
            ))}
          </div>
        </div>

        <ResponseCurve eq={eq} />

        <div className="eq-bands">
          <Band label="Pre" value={eq.preamp} onChange={(preamp) => setEq({ on: true, preamp })} />
          <i className="eq-divider" />
          {EQ_BANDS.map((hz, i) => (
            <Band
              key={hz}
              label={hz >= 1000 ? `${hz / 1000}k` : String(hz)}
              value={eq.gains[i] ?? 0}
              onChange={(gain) => setEq({ on: true, preset: 'custom', gains: eq.gains.map((g, b) => (b === i ? gain : g)) })}
            />
          ))}
        </div>

        <div className="row-actions">
          <button className={`pill ${eq.guard ? 'on' : ''}`} aria-pressed={eq.guard} onClick={() => setEq({ guard: !eq.guard })}>
            <Icon name={eq.guard ? 'check' : 'plus'} size={14} />
            Prevent clipping
          </button>
          <button className="pill" onClick={() => patch({ eq: { ...EQ_FLAT, on: eq.on, guard: eq.guard } })}>
            <Icon name="refresh" size={14} />
            Reset
          </button>
          <span className="hint">
            {eq.guard && eqPreamp(eq) !== eq.preamp
              ? `Boosts are balanced by lowering everything ${Math.abs(eqPreamp(eq) - eq.preamp)} dB, so loud passages don't distort.`
              : 'Drag a band, scroll over it, or double-click to zero it.'}
          </span>
        </div>
      </div>

      <h2 className="section">Resampling</h2>
      <div className="setting-card">
        <div className="segmented wrap" role="radiogroup" aria-label="Resampling">
          {RATES.map(([id, label]) => (
            <button key={id} role="radio" aria-checked={resample === id} disabled={!canResample && id !== 'off'} onClick={() => patch({ resample: id })}>
              {id === 'device' ? `${label} (${khz(device)})` : label}
            </button>
          ))}
        </div>
        {!canResample ? (
          <p className="hint">Resampling uses the SoX resampler through ffmpeg. Install <code>ffmpeg</code> (built with libsoxr) and restart Sonodrop to enable it.</p>
        ) : (
          <>
            <p className="hint">
              Converts every track with the SoX resampler at its very-high-quality setting (28-bit precision) before it reaches the equaliser, instead
              of the browser engine’s quicker converter. A track takes a moment to prepare the first time it plays; the next one is prepared ahead.
            </p>
            <div className="chain">
              <span>
                <small>Source</small>
                {track?.sampleRate ? khz(track.sampleRate) : '—'}
              </span>
              <Icon name="forward" size={14} />
              <span className={target ? 'lit' : ''}>
                <small>{target ? 'SoX' : 'Engine'}</small>
                {khz(target ?? device)}
              </span>
              <Icon name="forward" size={14} />
              <span>
                <small>System mixer</small>
                {khz(device)}
              </span>
            </div>
            {target && target > device && (
              <p className="hint warn">
                Your system mixer runs the output at {khz(device)}, so it converts back down after Sonodrop. To send {khz(target)} to your DAC, raise the
                mixer’s rate first (PipeWire: <code>default.clock.rate</code>) — the README has the two lines. Until then, “Device rate” is the setting
                that reaches the speakers untouched.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
