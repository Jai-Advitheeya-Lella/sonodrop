import { useEffect, useRef } from 'react'
import { feed, FEED_SIZE, levels } from '@/audio/levels'
import { onFrame } from '@/lib/ticker'
import { palette } from '@/themes'
import { AdaptiveScale, createShaderCanvas, ease } from './gl'
import { visualById } from './visuals'

/** Paints the chosen visualiser, fed by the live audio. Works in the main window and in desktop widgets. */
export function Visualizer({ visual, className = '' }: { visual: string; className?: string }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const shader = createShaderCanvas(canvas, visualById(visual).shader)
    if (!shader) return
    const { gl } = shader

    let width = canvas.clientWidth
    let height = canvas.clientHeight
    let visible = true
    const resize = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width
      height = entry.contentRect.height
    })
    resize.observe(canvas)
    // Scrolled out of view: stop painting.
    const watch = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting))
    watch.observe(canvas)

    // Spectrum on the first row, waveform on the second.
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, FEED_SIZE, 2, 0, gl.RED, gl.UNSIGNED_BYTE, feed)
    for (const [name, value] of [
      [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
      [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]
    ]) {
      gl.texParameteri(gl.TEXTURE_2D, name, value)
    }

    const colors = { bg: [...palette.bg], a: [...palette.a], b: [...palette.b], c: [...palette.c] }
    let light = palette.light
    let flow = Math.random() * 60
    const adaptive = new AdaptiveScale(0.4, 1)

    const stop = onFrame((dt, now) => {
      if (!visible || document.hidden || width === 0) return
      adaptive.tick(dt, now)
      flow += dt * (0.7 + levels.level * 1.1)
      const k = Math.min(1, dt * 3)
      ease(colors.bg, palette.bg, k)
      ease(colors.a, palette.a, k)
      ease(colors.b, palette.b, k)
      ease(colors.c, palette.c, k)
      light += (palette.light - light) * k

      shader.size(width, height, Math.min(window.devicePixelRatio, 2) * adaptive.scale)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, FEED_SIZE, 2, gl.RED, gl.UNSIGNED_BYTE, feed)
      shader.texture('uFeed', 0, texture)
      shader.draw({
        uRes: [canvas.width, canvas.height],
        uTime: flow,
        uBg: colors.bg,
        uA: colors.a,
        uB: colors.b,
        uC: colors.c,
        uLight: light,
        uAudio: [levels.bass, levels.mid, levels.treble, levels.beat]
      })
    })

    return () => {
      stop()
      resize.disconnect()
      watch.disconnect()
      shader.dispose()
    }
  }, [visual])

  return <canvas key={visual} ref={ref} className={`visual ${className}`} aria-hidden />
}
