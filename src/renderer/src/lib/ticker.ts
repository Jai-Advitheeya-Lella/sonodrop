/** One requestAnimationFrame loop for the whole app; it only runs while something is subscribed. */
type FrameFn = (dt: number, time: number) => void

const subscribers = new Set<FrameFn>()
let raf = 0
let last = 0

function loop(now: number): void {
  raf = requestAnimationFrame(loop)
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  for (const fn of subscribers) fn(dt, now / 1000)
}

export function onFrame(fn: FrameFn): () => void {
  subscribers.add(fn)
  if (!raf) {
    last = performance.now()
    raf = requestAnimationFrame(loop)
  }
  return () => {
    subscribers.delete(fn)
    if (subscribers.size === 0) {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }
}
