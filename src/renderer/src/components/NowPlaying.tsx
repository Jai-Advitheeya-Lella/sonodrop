import { useEffect, useState } from 'react'
import { Drips } from '@/fluid/Goo'
import { LiquidScene } from '@/fluid/LiquidScene'
import { clamp, quality } from '@/lib/format'
import { useCurrentTrack } from '@/lib/hooks'
import { artistId } from '@/stores/library'
import { useUi } from '@/stores/ui'
import { IconButton } from './Controls'
import { Cover, useCoverPalette } from './Cover'
import { Icon } from './Icon'
import { LikeButton, SeekBar, TimeLabel, Transport, Volume } from './Player'
import { Tilt } from './Tilt'

/**
 * The full-window player. It rises from the bottom behind a wave, with the 3D liquid filling the stage.
 * "Immersive" hides the artwork and text and leaves only the liquid.
 */
export function NowPlaying(): React.JSX.Element {
  const open = useUi((s) => s.nowPlayingOpen)
  const queueOpen = useUi((s) => s.queueOpen)
  const track = useCurrentTrack()
  const colors = useCoverPalette(track?.coverId ?? null)
  const [immersive, setImmersive] = useState(false)
  // The GL context is only created the first time the view is opened.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    if (open) setMounted(true)
  }, [open])

  // The liquid sits right of the artwork, as far over as the window's shape allows.
  const [aspect, setAspect] = useState(() => window.innerWidth / window.innerHeight)
  useEffect(() => {
    const onResize = (): void => setAspect(window.innerWidth / window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const shift = immersive || !track ? 0 : clamp(aspect * 0.5 - 0.42, 0, 0.42)

  const ui = useUi.getState()
  const close = (): void => useUi.setState({ nowPlayingOpen: false })

  return (
    <section className={`np ${open ? 'open' : ''} ${immersive ? 'immersive' : ''}`} aria-hidden={!open} inert={!open}>
      <svg className="np-wave" viewBox="0 0 2400 60" preserveAspectRatio="none" aria-hidden>
        <path d="M0 60V32Q150 2 300 32T600 32T900 32T1200 32T1500 32T1800 32T2100 32T2400 32V60Z" />
      </svg>
      {mounted && <LiquidScene active={open} coverId={track?.coverId ?? null} shift={shift} />}

      <header className="np-top">
        <IconButton icon="chevron" label="Close" size={22} onClick={close} />
        <span className="np-kicker">Now playing</span>
        <IconButton icon="cube" label={immersive ? 'Show artwork' : 'Immersive liquid'} on={immersive} onClick={() => setImmersive(!immersive)} />
        <IconButton icon="queue" label="Queue" on={queueOpen} onClick={() => useUi.setState({ queueOpen: !queueOpen })} />
      </header>

      {track ? (
        <div className="np-stage" key={track.id}>
          <div className="np-art">
            <Drips seed={track.albumId} count={6} color={colors?.[0]} />
            <Tilt max={14}>
              <Cover id={track.coverId} title={track.album} size="cover" />
            </Tilt>
          </div>
          <div className="np-info">
            <h1>{track.title}</h1>
            <p>
              <button className="link" onClick={() => ui.go({ name: 'artist', id: artistId(track.albumArtist) })}>
                {track.artist}
              </button>
              <span> — </span>
              <button className="link" onClick={() => ui.go({ name: 'album', id: track.albumId })}>
                {track.album}
              </button>
            </p>
            <span className={`badge ${track.lossless ? 'lossless' : ''}`}>{quality(track)}</span>
          </div>
        </div>
      ) : (
        <div className="np-stage empty">
          <Icon name="drop" size={40} />
          <p>Nothing playing yet</p>
        </div>
      )}

      <footer className="np-bottom">
        <div className="np-seek">
          <TimeLabel part="elapsed" />
          <SeekBar />
          <TimeLabel part="total" />
        </div>
        <div className="np-row">
          <div className="np-side">{track && <LikeButton id={track.id} size={22} />}</div>
          <Transport size="lg" />
          <div className="np-side end">
            <Volume />
          </div>
        </div>
      </footer>
    </section>
  )
}
