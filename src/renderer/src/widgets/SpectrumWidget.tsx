import { useEffect, useRef } from 'react'
import { engine, levels } from '@/audio/engine'
import { onFrame } from '@/lib/ticker'
import { palette } from '@/themes'

const BANDS = 40
const css = (c: readonly number[], alpha = 1): string => `rgb(${c.map((v) => Math.round(v * 255)).join(' ')} / ${alpha})`

/** The spectrum as the surface of a tank of liquid: it sloshes with the music and throws drops on the beat. */
export function SpectrumWidget(): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)

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

    // Log-spaced band edges over the audible part of the spectrum.
    const edges = Array.from({ length: BANDS + 1 }, (_, i) => Math.round(2 * (360 / 2) ** (i / BANDS)))
    const heights = new Float32Array(BANDS)
    const drops: { x: number; y: number; vx: number; vy: number; r: number }[] = []
    let armed = true

    const stop = onFrame((dt, time) => {
      if (width === 0 || document.hidden) return
      for (let b = 0; b < BANDS; b++) {
        let peak = 0
        for (let i = edges[b]; i < Math.max(edges[b] + 1, edges[b + 1]); i++) peak = Math.max(peak, engine.spectrum[i])
        const idle = 0.09 + 0.035 * Math.sin(time * 1.3 + b * 0.42) + 0.02 * Math.sin(time * 2.1 - b * 0.27)
        const target = Math.max(idle, (peak / 255) ** 1.6 * 0.92)
        heights[b] += (target - heights[b]) * Math.min(1, dt * (target > heights[b] ? 22 : 6))
      }

      const surface = (b: number): number => height - heights[b] * height
      const step = width / (BANDS - 1)
      ctx.clearRect(0, 0, width, height)

      const trace = (): void => {
        ctx.moveTo(0, surface(0))
        for (let b = 0; b < BANDS - 1; b++) {
          const x = b * step
          ctx.quadraticCurveTo(x, surface(b), x + step / 2, (surface(b) + surface(b + 1)) / 2)
        }
        ctx.lineTo(width, surface(BANDS - 1))
      }
      const gradient = ctx.createLinearGradient(0, 0, width, height)
      gradient.addColorStop(0, css(palette.a, 0.95))
      gradient.addColorStop(0.5, css(palette.b, 0.85))
      gradient.addColorStop(1, css(palette.c, 0.9))
      ctx.fillStyle = gradient
      ctx.beginPath()
      trace()
      ctx.lineTo(width, height)
      ctx.lineTo(0, height)
      ctx.closePath()
      ctx.fill()

      ctx.strokeStyle = 'rgb(255 255 255 / 0.45)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      trace()
      ctx.stroke()

      // A beat throws a few drops off the tallest crest.
      if (levels.beat > 0.95 && armed) {
        armed = false
        let top = 0
        for (let b = 1; b < BANDS; b++) if (heights[b] > heights[top]) top = b
        for (let i = 0; i < 3; i++) {
          drops.push({ x: top * step, y: surface(top), vx: (Math.random() - 0.5) * 160, vy: -140 - Math.random() * 160, r: 2 + Math.random() * 2.5 })
        }
      } else if (levels.beat < 0.5) armed = true

      ctx.fillStyle = css(palette.a)
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i]
        d.vy += 700 * dt
        d.x += d.vx * dt
        d.y += d.vy * dt
        const band = Math.min(BANDS - 1, Math.max(0, Math.round(d.x / step)))
        if (d.y > surface(band) && d.vy > 0) {
          drops.splice(i, 1)
          continue
        }
        ctx.beginPath()
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
        ctx.fill()
      }
    })

    return () => {
      stop()
      observer.disconnect()
    }
  }, [])

  return <canvas ref={ref} className="w-spectrum" aria-hidden />
}
