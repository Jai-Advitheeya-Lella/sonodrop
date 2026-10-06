import { useEffect, useRef, useState } from 'react'
import type { WidgetState } from '@shared/types'
import { widgetById } from '@shared/widgets'
import { feed, levels, transport } from '@/audio/levels'
import { Icon } from '@/components/Icon'
import { GooDefs } from '@/fluid/Goo'
import { applyTheme, DEFAULT_THEME, themeById } from '@/themes'
import { WIDGET_COMPONENTS } from './registry'

const IDLE: WidgetState = {
  trackId: null,
  title: 'Sonodrop',
  artist: 'Nothing playing',
  album: '',
  coverId: null,
  quality: '',
  liked: false,
  playing: false,
  position: 0,
  duration: 0,
  next: [],
  themeId: DEFAULT_THEME,
  accent: themeById(DEFAULT_THEME).accent,
  visualizer: 'ink'
}

/** When the last state arrived, so widgets can run the clock forward between updates. */
export const clock = { position: 0, at: 0, playing: false, duration: 0 }

/** Playback position right now, 0..1. */
export function progressNow(): number {
  const elapsed = clock.playing ? (performance.now() - clock.at) / 1000 : 0
  return clock.duration > 0 ? Math.min(1, (clock.position + elapsed) / clock.duration) : 0
}

/** The shell of every desktop widget window: mirrors the main window's state and hosts one widget. */
export function WidgetApp({ id }: { id: string }): React.JSX.Element {
  const [state, setState] = useState(IDLE)
  const { widgets } = window.sono
  const frame = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.title = `Sonodrop Widget — ${widgetById(id)?.name ?? id}`
    const offState = widgets.onState((next) => {
      Object.assign(clock, { position: next.position, at: performance.now(), playing: next.playing, duration: next.duration })
      transport.playing = next.playing
      transport.progress = next.duration > 0 ? next.position / next.duration : 0
      setState(next)
    })
    const offAudio = widgets.onAudio((audio) => {
      ;[levels.bass, levels.mid, levels.treble, levels.level, levels.beat] = audio.levels
      feed.set(audio.feed)
    })
    return () => {
      offState()
      offAudio()
    }
  }, [id, widgets])

  const accent = state.accent.join()
  useEffect(() => {
    applyTheme(themeById(state.themeId), state.accent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.themeId, accent])

  const Widget = WIDGET_COMPONENTS[id]
  return (
    <div ref={frame} className={`dw dw-${id}`}>
      {Widget ? <Widget state={state} send={widgets.command} /> : null}
      <button className="dw-close" aria-label="Close widget" onClick={() => widgets.toggle(id)}>
        <Icon name="close" size={13} />
      </button>
      <GooDefs />
    </div>
  )
}
