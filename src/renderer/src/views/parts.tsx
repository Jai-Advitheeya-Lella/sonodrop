import { PlayBlob } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { Drips } from '@/fluid/Goo'
import { useLibrary } from '@/stores/library'
import { usePlayer } from '@/stores/player'

interface HeroProps {
  art: React.ReactNode
  kicker: string
  title: React.ReactNode
  meta: React.ReactNode
  /** Tracks the play / shuffle buttons act on. */
  trackIds: string[]
  colors?: [string, string, string] | null
  seed: string
  children?: React.ReactNode
}

/** The header of an album, artist or playlist page: artwork that drips, a colour wash, and the main actions. */
export function Hero({ art, kicker, title, meta, trackIds, colors, seed, children }: HeroProps): React.JSX.Element {
  const active = usePlayer((s) => s.playing && trackIds.includes(s.currentId ?? ''))
  const within = usePlayer((s) => trackIds.includes(s.currentId ?? ''))
  const player = usePlayer.getState()
  const style = colors ? ({ '--wash': colors[0], '--wash-2': colors[1] } as React.CSSProperties) : undefined
  return (
    <header className="hero" style={style}>
      <div className="hero-art">
        <Drips seed={seed} count={5} color={colors?.[0]} />
        {art}
      </div>
      <div className="hero-text">
        <p className="kicker">{kicker}</p>
        <h1>{title}</h1>
        <p className="hero-meta">{meta}</p>
        <div className="hero-actions">
          <PlayBlob playing={active} size="lg" onClick={() => (within ? player.toggle() : player.playTracks(trackIds))} />
          <button className="pill" disabled={trackIds.length === 0} onClick={() => player.shufflePlay(trackIds)}>
            <Icon name="shuffle" size={16} />
            Shuffle
          </button>
          {children}
        </div>
      </div>
    </header>
  )
}

export function EmptyLibrary(): React.JSX.Element {
  const scanning = useLibrary((s) => s.scan !== null && s.scan.phase !== 'done')
  return (
    <div className="empty">
      <div className="empty-drop" aria-hidden>
        <i />
        <i />
        <i />
        <span />
      </div>
      <h1>{scanning ? 'Pouring…' : 'It’s dry in here'}</h1>
      <p>Point Sonodrop at a folder of music, or drag folders and files straight onto this window. MP3, FLAC, WAV, ALAC, AIFF, OGG, Opus, AAC and more all play.</p>
      <button className="pill primary" onClick={() => void window.sono.library.chooseFolders()}>
        <Icon name="folder" size={16} />
        Choose a music folder
      </button>
    </div>
  )
}

export function Missing({ what }: { what: string }): React.JSX.Element {
  return (
    <div className="empty">
      <h1>Gone down the drain</h1>
      <p>That {what} isn’t in your library any more.</p>
    </div>
  )
}
