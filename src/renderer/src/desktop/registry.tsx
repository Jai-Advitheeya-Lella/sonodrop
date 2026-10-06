import { useRef } from 'react'
import type { WidgetCommand, WidgetState } from '@shared/types'
import { levels } from '@/audio/levels'
import { Cover } from '@/components/Cover'
import { Icon } from '@/components/Icon'
import { Drips } from '@/fluid/Goo'
import { Visualizer } from '@/fluid/Visualizer'
import { useFrame } from '@/lib/hooks'
import { progressNow } from './WidgetApp'

export interface WidgetProps {
  state: WidgetState
  send(command: WidgetCommand): void
}

/** A thin bar that fills with the song. */
function Progress({ className = '' }: { className?: string }): React.JSX.Element {
  const bar = useRef<HTMLElement>(null)
  useFrame(() => {
    if (bar.current) bar.current.style.transform = `scaleX(${progressNow()})`
  })
  return (
    <div className={`dw-progress ${className}`}>
      <i ref={bar} />
    </div>
  )
}

function Buttons({ state, send, like }: WidgetProps & { like?: boolean }): React.JSX.Element {
  return (
    <div className="dw-buttons">
      <button className="icon-btn" aria-label="Previous" onClick={() => send('prev')}>
        <Icon name="prev" size={17} />
      </button>
      <button className={`play-blob sm ${state.playing ? 'playing' : ''}`} aria-label={state.playing ? 'Pause' : 'Play'} onClick={() => send('toggle')}>
        <Icon name={state.playing ? 'pause' : 'play'} size={17} />
      </button>
      <button className="icon-btn" aria-label="Next" onClick={() => send('next')}>
        <Icon name="next" size={17} />
      </button>
      {like && state.trackId && (
        <button className={`icon-btn like ${state.liked ? 'on' : ''}`} aria-label={state.liked ? 'Remove from Liked' : 'Like'} onClick={() => send('like')}>
          <Icon name="heart" size={16} fill={state.liked} />
        </button>
      )}
    </div>
  )
}

function Titles({ state }: { state: WidgetState }): React.JSX.Element {
  return (
    <div className="dw-titles">
      <strong>{state.title}</strong>
      <span>{state.artist}</span>
    </div>
  )
}

function PlayerWidget(props: WidgetProps): React.JSX.Element {
  const { state, send } = props
  return (
    <div className="dw-card dw-row">
      <button className="dw-art" onClick={() => send('show-main')} aria-label="Show Sonodrop">
        <Cover id={state.coverId} title={state.album || state.title} />
      </button>
      <div className="dw-col">
        <Titles state={state} />
        <Buttons {...props} like />
      </div>
      <Progress className="edge" />
    </div>
  )
}

/** A glass record with the cover as its label. It spins while music plays; click it to play or pause. */
function VinylWidget({ state, send }: WidgetProps): React.JSX.Element {
  const glow = useRef<HTMLDivElement>(null)
  useFrame(() => {
    if (glow.current) glow.current.style.transform = `scale(${1 + levels.bass * 0.05 + levels.beat * 0.02})`
  })
  return (
    <div className={`vinyl ${state.playing ? 'playing' : ''}`}>
      <div ref={glow} className="vinyl-glow" />
      <button className="vinyl-disc" onClick={() => send('toggle')} aria-label={state.playing ? 'Pause' : 'Play'}>
        <span className="vinyl-spin">
          <span className="vinyl-label">
            <Cover id={state.coverId} title={state.album || state.title} round />
          </span>
        </span>
        <span className="vinyl-sheen" />
      </button>
      <svg className="vinyl-arm" viewBox="0 0 100 100" aria-hidden>
        <g>
          <path d="M86 14 L67 55" />
          <circle cx="86" cy="14" r="5.5" />
          <rect x="60.5" y="52" width="9" height="13" rx="2.5" transform="rotate(25 65 58)" />
        </g>
      </svg>
      <div className="vinyl-caption">
        <strong>{state.title}</strong>
        <span>{state.artist}</span>
      </div>
    </div>
  )
}

function VisualizerWidget({ state }: WidgetProps): React.JSX.Element {
  return (
    <div className="dw-card dw-visual">
      <Visualizer visual={state.visualizer} />
      <div className="dw-overlay">
        <Titles state={state} />
      </div>
    </div>
  )
}

function PosterWidget(props: WidgetProps): React.JSX.Element {
  const { state } = props
  return (
    <div className="poster">
      <div className="poster-art">
        <Drips seed={state.album || state.title} count={4} color={state.accent[0]} />
        <div className="poster-cover">
          <Cover id={state.coverId} title={state.album || state.title} size="cover" />
          <div className="poster-hover">
            <Titles state={state} />
            <Buttons {...props} />
          </div>
        </div>
      </div>
    </div>
  )
}

function StripWidget(props: WidgetProps): React.JSX.Element {
  const { state, send } = props
  return (
    <div className="dw-card dw-row strip">
      <button className="dw-art" onClick={() => send('show-main')} aria-label="Show Sonodrop">
        <Cover id={state.coverId} title={state.album || state.title} />
      </button>
      <Titles state={state} />
      <Buttons {...props} />
      <Progress className="edge" />
    </div>
  )
}

function UpNextWidget(props: WidgetProps): React.JSX.Element {
  const { state, send } = props
  return (
    <div className="dw-card dw-list">
      <div className="dw-row">
        <button className="dw-art" onClick={() => send('show-main')} aria-label="Show Sonodrop">
          <Cover id={state.coverId} title={state.album || state.title} />
        </button>
        <div className="dw-col">
          <Titles state={state} />
          <Buttons {...props} />
        </div>
      </div>
      <Progress />
      <h4>Up next</h4>
      {state.next.length === 0 && <p className="dw-empty">Nothing queued after this.</p>}
      {state.next.map((item, i) => (
        <div key={i} className="dw-next">
          <Cover id={item.coverId} title={item.title} />
          <Titles state={{ ...state, title: item.title, artist: item.artist }} />
        </div>
      ))}
    </div>
  )
}

/** id (from shared/widgets.ts) → what to draw in that window. */
export const WIDGET_COMPONENTS: Record<string, React.ComponentType<WidgetProps>> = {
  player: PlayerWidget,
  vinyl: VinylWidget,
  visualizer: VisualizerWidget,
  poster: PosterWidget,
  strip: StripWidget,
  upnext: UpNextWidget
}
