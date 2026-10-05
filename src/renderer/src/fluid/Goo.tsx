import { useMemo } from 'react'
import { seeded } from '@/lib/format'

/**
 * SVG filters that make overlapping shapes fuse like liquid: blur, then harden the alpha edge.
 * Shapes inside a gooey container must be opaque. Reference with `filter: url(#goo)`.
 */
export function GooDefs(): React.JSX.Element {
  const filter = (id: string, blur: number, gain: number, bias: number): React.JSX.Element => (
    <filter id={id} x="-20%" y="-20%" width="140%" height="160%" colorInterpolationFilters="sRGB">
      <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="blur" />
      <feColorMatrix in="blur" mode="matrix" values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${gain} ${bias}`} />
    </filter>
  )
  return (
    <svg className="goo-defs" aria-hidden>
      <defs>
        {filter('goo-sm', 3.5, 20, -8)}
        {filter('goo', 7, 24, -10)}
        {filter('goo-lg', 12, 30, -13)}
      </defs>
    </svg>
  )
}

interface DripsProps {
  /** Any stable string; decides where the drips sit and how fast they fall. */
  seed: string
  count?: number
  color?: string
  className?: string
}

/**
 * Drops that swell out from under an edge, neck off and fall. Place it directly beneath (and behind)
 * the thing that should look like it is melting.
 */
export function Drips({ seed, count = 5, color, className = '' }: DripsProps): React.JSX.Element {
  const drops = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const size = 12 + seeded(seed, i * 3 + 1) * 16
        const duration = 3.4 + seeded(seed, i * 3 + 2) * 4.5
        return {
          left: `${((i + 0.2 + seeded(seed, i * 3) * 0.6) / count) * 100}%`,
          width: size,
          height: size * 1.25,
          animationDuration: `${duration}s`,
          animationDelay: `${-seeded(seed, i * 7 + 5) * duration}s`
        }
      }),
    [seed, count]
  )
  return (
    <div className={`drips ${className}`} style={color ? { color } : undefined} aria-hidden>
      <i className="drips-lip" />
      {drops.map((style, i) => (
        <i key={i} className="drip" style={style} />
      ))}
    </div>
  )
}
