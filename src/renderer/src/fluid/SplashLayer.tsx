import { useEffect, useRef } from 'react'
import { onFrame } from '@/lib/ticker'

interface Droplet {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  life: number
}

interface Ring {
  x: number
  y: number
  age: number
}

const INTERACTIVE = 'button, a, [role="button"], [data-splash]'

/** Every press on something interactive throws a small splash: a ring and a few droplets that fall away. */
export function SplashLayer(): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const droplets: Droplet[] = []
    const rings: Ring[] = []
    let stop: (() => void) | null = null

    const resize = (): void => {
      const ratio = Math.min(window.devicePixelRatio, 2)
      canvas.width = window.innerWidth * ratio
      canvas.height = window.innerHeight * ratio
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const frame = (dt: number): void => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      const style = getComputedStyle(document.documentElement)
      ctx.fillStyle = ctx.strokeStyle = style.getPropertyValue('--accent')

      for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i]
        ring.age += dt
        const t = ring.age / 0.5
        if (t >= 1) {
          rings.splice(i, 1)
          continue
        }
        ctx.globalAlpha = 0.5 * (1 - t) ** 2
        ctx.lineWidth = 3 * (1 - t) + 0.5
        ctx.beginPath()
        ctx.arc(ring.x, ring.y, 6 + 30 * (1 - (1 - t) ** 3), 0, Math.PI * 2)
        ctx.stroke()
      }

      for (let i = droplets.length - 1; i >= 0; i--) {
        const d = droplets[i]
        d.life -= dt * 1.5
        if (d.life <= 0) {
          droplets.splice(i, 1)
          continue
        }
        d.vy += 1500 * dt
        d.x += d.vx * dt
        d.y += d.vy * dt
        // Stretch along the direction of travel, like a real falling drop.
        const speed = Math.hypot(d.vx, d.vy)
        const stretch = 1 + Math.min(1.4, speed / 600)
        const radius = d.r * Math.min(1, d.life * 2.5)
        ctx.globalAlpha = Math.min(1, d.life * 2)
        ctx.beginPath()
        ctx.ellipse(d.x, d.y, radius / Math.sqrt(stretch), radius * stretch, Math.atan2(d.vy, d.vx) - Math.PI / 2, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      if (droplets.length === 0 && rings.length === 0) {
        stop?.()
        stop = null
      }
    }

    const onDown = (e: PointerEvent): void => {
      if (e.button !== 0 || !(e.target instanceof Element) || !e.target.closest(INTERACTIVE)) return
      rings.push({ x: e.clientX, y: e.clientY, age: 0 })
      const count = 5 + Math.floor(Math.random() * 4)
      for (let i = 0; i < count; i++) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5
        const speed = 120 + Math.random() * 260
        droplets.push({
          x: e.clientX,
          y: e.clientY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          r: 2 + Math.random() * 3.5,
          life: 0.6 + Math.random() * 0.5
        })
      }
      stop ??= onFrame(frame)
    }
    window.addEventListener('pointerdown', onDown, { passive: true })

    return () => {
      stop?.()
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={ref} className="splash-layer" aria-hidden />
}
