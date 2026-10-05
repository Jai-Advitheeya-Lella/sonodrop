import { onFrame } from '@/lib/ticker'

/**
 * A full-window sheet of liquid that pours down in uneven drips, covers everything, then drains away.
 * `onCovered` runs at the moment nothing behind it is visible — the right time to swap themes.
 */
let canvas: HTMLCanvasElement | null = null
let running = false

export function attachCurtain(el: HTMLCanvasElement | null): void {
  canvas = el
}

interface Column {
  x: number
  width: number
  delay: number
  length: number
}

const COVER = 0.8
const DRAIN = 0.8

export function pourCurtain(colors: [string, string, string], onCovered: () => void): void {
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx || running || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    onCovered()
    return
  }
  running = true
  const w = window.innerWidth
  const h = window.innerHeight
  const ratio = Math.min(window.devicePixelRatio, 1.5)
  canvas.width = w * ratio
  canvas.height = h * ratio
  canvas.style.display = 'block'
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)

  const count = Math.max(7, Math.round(w / 150))
  const columns: Column[] = Array.from({ length: count }, (_, i) => ({
    x: ((i + 0.15 + Math.random() * 0.7) / count) * w,
    width: 34 + Math.random() * 46,
    delay: Math.random() * 0.3,
    length: 0.25 + Math.random() * 0.55
  }))
  const reach = h * 1.9

  // The lower edge of a falling sheet: a front line plus a long bulge under every drip.
  const edge = (x: number, progress: number): number => {
    let y = progress * reach - h * 0.75
    for (const c of columns) {
      const local = Math.max(0, Math.min(1, (progress - c.delay) / (1 - c.delay)))
      const u = Math.abs(x - c.x) / c.width
      y += local * (2 - local) * c.length * h * 0.75 * Math.exp(-(u ** 2.6))
    }
    return y
  }

  const gradient = ctx.createLinearGradient(0, 0, w, h)
  gradient.addColorStop(0, colors[0])
  gradient.addColorStop(0.55, colors[1])
  gradient.addColorStop(1, colors[2])

  let t = 0
  let covered = false
  const stop = onFrame((dt) => {
    t += dt
    ctx.clearRect(0, 0, w, h)
    const pour = Math.min(1, t / COVER)
    const drain = Math.max(0, (t - COVER) / DRAIN)
    if (pour >= 1 && !covered) {
      covered = true
      onCovered()
    }
    if (drain >= 1) {
      stop()
      running = false
      canvas!.style.display = 'none'
      return
    }

    // Gravity: both edges start slow and speed up.
    const bottom = pour * pour * (3 - 2 * pour)
    const top = drain * drain
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.moveTo(0, drain > 0 ? edge(0, top) - h * 0.1 : -10)
    if (drain > 0) for (let x = 0; x <= w + 8; x += 8) ctx.lineTo(x, edge(x, top) - h * 0.1)
    else ctx.lineTo(w, -10)
    for (let x = w + 8; x >= -8; x -= 8) ctx.lineTo(x, edge(x, bottom))
    ctx.closePath()
    ctx.fill()

    // A wet highlight just inside the leading edge.
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth = 3
    ctx.beginPath()
    for (let x = -8; x <= w + 8; x += 8) ctx.lineTo(x, edge(x, bottom) - 10)
    ctx.stroke()
  })
}
