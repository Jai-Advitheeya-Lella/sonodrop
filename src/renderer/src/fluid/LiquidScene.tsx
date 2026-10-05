import { useEffect, useRef } from 'react'
import { levels } from '@/audio/engine'
import { coverUrl } from '@/lib/format'
import { onFrame } from '@/lib/ticker'
import { useUi, type Quality } from '@/stores/ui'
import { palette } from '@/themes'
import { AdaptiveScale, createShaderCanvas, ease } from './gl'
import { SCENE } from './shaders'

/** Fraction of device resolution (device pixel ratio capped at 2). */
const SCALE: Record<Quality, [min: number, max: number]> = {
  auto: [0.35, 1],
  high: [1, 1],
  medium: [0.7, 0.7],
  low: [0.5, 0.5]
}

interface Props {
  /** Only renders while true. */
  active: boolean
  coverId: string | null
  /** Horizontal offset of the liquid, in screen heights. */
  shift: number
}

/** The 3D liquid behind Now Playing. Move the pointer to lean the camera, drag to orbit. */
export function LiquidScene({ active, coverId, shift }: Props): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const live = useRef({ active, coverId, shift })
  live.current = { active, coverId, shift }
  const quality = useUi((s) => s.quality)

  useEffect(() => {
    const canvas = ref.current!
    const shader = createShaderCanvas(canvas, SCENE)
    if (!shader) return
    const { gl } = shader

    let width = canvas.clientWidth
    let height = canvas.clientHeight
    const observer = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width
      height = entry.contentRect.height
    })
    observer.observe(canvas)

    // Album art, reflected in the liquid.
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]))
    for (const [name, value] of [
      [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
      [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]
    ]) {
      gl.texParameteri(gl.TEXTURE_2D, name, value)
    }
    let loadedCover: string | null = null
    let hasCover = false
    let coverMix = 0
    const loadCover = (id: string | null): void => {
      loadedCover = id
      hasCover = false
      if (!id) return
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        if (loadedCover !== id) return
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
        hasCover = true
      }
      img.src = coverUrl(id)!
    }

    // Camera: slow drift + pointer lean + drag-to-orbit with a little inertia.
    const lean = [0, 0]
    const leanTarget = [0, 0]
    const orbit = [0, 0]
    const spin = [0, 0]
    let dragging = false
    const onMove = (e: PointerEvent): void => {
      leanTarget[0] = (e.clientX / window.innerWidth - 0.5) * 0.5
      leanTarget[1] = (e.clientY / window.innerHeight - 0.5) * 0.16
      if (dragging) {
        spin[0] = -e.movementX * 0.006
        spin[1] = e.movementY * 0.004
        orbit[0] += spin[0]
        orbit[1] += spin[1]
      }
    }
    const onDown = (e: PointerEvent): void => {
      dragging = true
      canvas.setPointerCapture(e.pointerId)
    }
    const onUp = (): void => {
      dragging = false
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    const colors = { bg: [...palette.bg], a: [...palette.a], b: [...palette.b], c: [...palette.c] }
    let light = palette.light
    let gloss = palette.gloss
    let flow = Math.random() * 50
    let shiftNow = live.current.shift
    const adaptive = new AdaptiveScale(...SCALE[quality])

    const stop = onFrame((dt, now) => {
      const { active: on, coverId: wanted, shift: shiftTarget } = live.current
      if (!on || document.hidden) return
      if (wanted !== loadedCover) loadCover(wanted)
      adaptive.tick(dt, now)

      flow += dt * (0.75 + levels.level * 0.9)
      const k = Math.min(1, dt * 3)
      ease(colors.bg, palette.bg, k)
      ease(colors.a, palette.a, k)
      ease(colors.b, palette.b, k)
      ease(colors.c, palette.c, k)
      light += (palette.light - light) * k
      gloss += (palette.gloss - gloss) * k
      coverMix += ((hasCover ? 1 : 0) - coverMix) * Math.min(1, dt * 2.5)
      shiftNow += (shiftTarget - shiftNow) * Math.min(1, dt * 4)
      lean[0] += (leanTarget[0] - lean[0]) * Math.min(1, dt * 3)
      lean[1] += (leanTarget[1] - lean[1]) * Math.min(1, dt * 3)
      if (!dragging) {
        orbit[0] += spin[0]
        orbit[1] += spin[1]
        spin[0] *= Math.exp(-dt * 3)
        spin[1] *= Math.exp(-dt * 3)
        orbit[1] *= Math.exp(-dt * 0.8) // pitch settles back to the horizon
      }
      const yaw = flow * 0.045 + orbit[0] + lean[0]
      const pitch = Math.min(1.1, Math.max(0.04, 0.17 + orbit[1] + lean[1]))

      shader.size(width, height, Math.min(window.devicePixelRatio, 2) * adaptive.scale)
      shader.texture('uCover', 0, texture)
      shader.draw({
        uRes: [canvas.width, canvas.height],
        uTime: flow,
        uBg: colors.bg,
        uA: colors.a,
        uB: colors.b,
        uC: colors.c,
        uLight: light,
        uGloss: gloss,
        uAudio: [levels.bass, levels.mid, levels.treble, levels.beat],
        uCam: [yaw, pitch],
        uShift: shiftNow,
        uCoverMix: coverMix
      })
    })

    return () => {
      stop()
      observer.disconnect()
      window.removeEventListener('pointermove', onMove)
      shader.dispose()
    }
  }, [quality])

  return <canvas key={quality} ref={ref} className="scene" aria-hidden />
}
