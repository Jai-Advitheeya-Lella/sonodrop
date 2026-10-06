import { useEffect, useRef } from 'react'
import { levels, transport } from '@/audio/levels'
import { onFrame } from '@/lib/ticker'
import { useUi, type Quality } from '@/stores/ui'
import { palette } from '@/themes'
import { AdaptiveScale, createShaderCanvas, ease } from './gl'
import { AMBIENT } from './shaders'

/** Fraction of device resolution. The record's grooves want real pixels; the liquid behind them doesn't mind. */
const SCALE: Record<Quality, [min: number, max: number]> = {
  auto: [0.4, 1],
  high: [1, 1],
  medium: [0.7, 0.7],
  low: [0.45, 0.45]
}

/** The living backdrop behind the whole app. `paused` freezes it while something opaque covers it. */
export function AmbientLiquid({ paused }: { paused: boolean }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const quality = useUi((s) => s.quality)

  useEffect(() => {
    const canvas = ref.current!
    const shader = createShaderCanvas(canvas, AMBIENT)
    if (!shader) return

    let width = canvas.clientWidth
    let height = canvas.clientHeight
    const observer = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width
      height = entry.contentRect.height
    })
    observer.observe(canvas)

    const mouse = [0.5, 0.5, 0]
    const target = [0.5, 0.5]
    let movedAt = -Infinity
    const onMove = (e: PointerEvent): void => {
      target[0] = e.clientX / window.innerHeight
      target[1] = 1 - e.clientY / window.innerHeight
      movedAt = performance.now()
    }
    window.addEventListener('pointermove', onMove, { passive: true })

    const colors = { bg: [...palette.bg], a: [...palette.a], b: [...palette.b], c: [...palette.c] }
    let light = palette.light
    let flow = Math.random() * 100
    let spin = 0
    let speed = 0
    let arm = 0
    const adaptive = new AdaptiveScale(...SCALE[quality])

    const stop = onFrame((dt, now) => {
      if (pausedRef.current || document.hidden) return
      adaptive.tick(dt, now)
      // The liquid moves a little faster when the music is loud.
      flow += dt * (1 + levels.level * 0.8)
      const k = Math.min(1, dt * 3)
      ease(colors.bg, palette.bg, k)
      ease(colors.a, palette.a, k)
      ease(colors.b, palette.b, k)
      ease(colors.c, palette.c, k)
      light += (palette.light - light) * k
      mouse[0] += (target[0] - mouse[0]) * Math.min(1, dt * 5)
      mouse[1] += (target[1] - mouse[1]) * Math.min(1, dt * 5)
      const active = performance.now() - movedAt < 1800 ? 1 : 0
      mouse[2] += (active - mouse[2]) * Math.min(1, dt * (active ? 4 : 1.2))

      // The platter takes a moment to get up to speed, and to stop.
      speed += ((transport.playing ? 2.2 : 0) - speed) * Math.min(1, dt * 1.6)
      spin = (spin + speed * dt) % (Math.PI * 2)
      arm += ((transport.playing ? 1 : 0) - arm) * Math.min(1, dt * 2.2)

      const aspect = width / Math.max(1, height)
      shader.size(width, height, Math.min(window.devicePixelRatio, 2) * adaptive.scale)
      shader.draw({
        // Right of centre, but never so far that the tonearm's pivot leaves the window.
        uDisc: [Math.min(aspect * 0.5 + Math.min(0.42, aspect * 0.21), aspect - 0.55), 0.47, 0.44],
        uSpin: spin,
        uArm: [arm, transport.progress],
        uRes: [canvas.width, canvas.height],
        uTime: flow,
        uBg: colors.bg,
        uA: colors.a,
        uB: colors.b,
        uC: colors.c,
        uLight: light,
        uAudio: [levels.bass, levels.mid, levels.treble, levels.beat],
        uMouse: mouse
      })
    })

    return () => {
      stop()
      observer.disconnect()
      window.removeEventListener('pointermove', onMove)
      shader.dispose()
    }
  }, [quality])

  return <canvas key={quality} ref={ref} className="ambient" aria-hidden />
}
