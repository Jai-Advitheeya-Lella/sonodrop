import { useEffect, useState } from 'react'
import { extractPalette } from '@/lib/color'
import { coverUrl, seeded } from '@/lib/format'
import { Icon } from './Icon'

interface Props {
  id: string | null
  /** Seeds the placeholder colours when there is no artwork. */
  title: string
  size?: 'thumb' | 'cover'
  className?: string
  round?: boolean
}

/** Artwork, or a generated liquid-gradient placeholder. */
export function Cover({ id, title, size = 'thumb', className = '', round }: Props): React.JSX.Element {
  const url = coverUrl(id, size)
  const hue = Math.floor(seeded(title) * 360)
  return (
    <div
      className={`cover ${round ? 'round' : ''} ${className}`}
      style={url ? undefined : { background: `linear-gradient(140deg, hsl(${hue} 62% 38%), hsl(${(hue + 55) % 360} 70% 16%))` }}
    >
      {url ? (
        <img key={url} src={url} alt="" loading="lazy" decoding="async" draggable={false} onLoad={(e) => e.currentTarget.classList.add('loaded')} />
      ) : (
        <Icon name="drop" className="cover-glyph" size={24} />
      )}
    </div>
  )
}

/** Three vivid colours from a cover, or null while loading / for greyscale art. */
export function useCoverPalette(id: string | null): [string, string, string] | null {
  const [colors, setColors] = useState<[string, string, string] | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!id) setColors(null)
    else void extractPalette(coverUrl(id)!).then((c) => !cancelled && setColors(c))
    return () => {
      cancelled = true
    }
  }, [id])
  return colors
}
