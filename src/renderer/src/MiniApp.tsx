import { useEffect, useRef, useState } from 'react'
import type { MiniState } from '@shared/types'
import { IconButton, PlayBlob } from '@/components/Controls'
import { Cover } from '@/components/Cover'
import { useFrame } from '@/lib/hooks'
import { applyTheme, themeById } from '@/themes'

/** The floating mini player: a second window that mirrors the main one and sends it commands. */
export function MiniApp(): React.JSX.Element {
  const [state, setState] = useState<MiniState | null>(null)
  const { mini } = window.sono
  const bar = useRef<HTMLElement>(null)
  // Position is only pushed about once a second; interpolate between updates.
  const clock = useRef({ position: 0, at: 0 })

  useEffect(
    () =>
      mini.onState((next) => {
        clock.current = { position: next.position, at: performance.now() }
        setState(next)
      }),
    [mini]
  )
  const accent = state?.accent.join()
  useEffect(() => {
    if (state) applyTheme(themeById(state.themeId), state.accent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.themeId, accent])

  useFrame(() => {
    if (!state || !bar.current) return
    const elapsed = state.playing ? (performance.now() - clock.current.at) / 1000 : 0
    const fraction = state.duration > 0 ? Math.min(1, (clock.current.position + elapsed) / state.duration) : 0
    bar.current.style.transform = `scaleX(${fraction})`
  })

  return (
    <div className="mini">
      <div className="mini-card">
        <button className="mini-cover" onClick={() => mini.command('show-main')} aria-label="Show Sonodrop">
          <Cover id={state?.coverId ?? null} title={state?.title ?? 'Sonodrop'} />
        </button>
        <div className="mini-main">
          <div className="mini-text">
            <strong>{state?.title ?? 'Sonodrop'}</strong>
            <span>{state?.artist || 'Nothing playing'}</span>
          </div>
          <div className="mini-controls">
            <IconButton icon="prev" label="Previous" onClick={() => mini.command('prev')} />
            <PlayBlob playing={state?.playing ?? false} size="sm" onClick={() => mini.command('toggle')} />
            <IconButton icon="next" label="Next" onClick={() => mini.command('next')} />
          </div>
        </div>
        <IconButton icon="close" label="Close mini player" size={14} className="mini-close" onClick={() => mini.toggle()} />
        <div className="mini-progress">
          <i ref={bar} />
        </div>
      </div>
    </div>
  )
}
