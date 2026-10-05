import { Cover, useCoverPalette } from '@/components/Cover'
import { Icon } from '@/components/Icon'
import { LikeButton, SeekBar, TimeLabel, Transport } from '@/components/Player'
import { Tilt } from '@/components/Tilt'
import { Drips } from '@/fluid/Goo'
import { quality } from '@/lib/format'
import { useCurrentTrack } from '@/lib/hooks'
import { allTrackIds } from '@/components/menus'
import { usePlayer } from '@/stores/player'
import { useUi } from '@/stores/ui'

export function NowPlayingWidget(): React.JSX.Element {
  const track = useCurrentTrack()
  const colors = useCoverPalette(track?.coverId ?? null)

  if (!track) {
    return (
      <div className="w-np idle">
        <Icon name="drop" size={44} />
        <p>Nothing playing. Pick something, or let the tap run.</p>
        <button className="pill primary" onClick={() => usePlayer.getState().shufflePlay(allTrackIds())}>
          <Icon name="shuffle" size={16} />
          Shuffle everything
        </button>
      </div>
    )
  }

  const style = colors ? ({ '--wash': colors[0], '--wash-2': colors[1] } as React.CSSProperties) : undefined
  return (
    <div className="w-np" style={style}>
      <div className="w-np-art" key={track.id}>
        <Drips seed={track.albumId} count={4} color={colors?.[0]} />
        <Tilt max={14}>
          <button className="bare" onClick={() => useUi.setState({ nowPlayingOpen: true })} aria-label="Open Now Playing">
            <Cover id={track.coverId} title={track.album} size="cover" />
          </button>
        </Tilt>
      </div>
      <div className="w-np-side">
        <div className="w-np-text" key={track.id}>
          <h4>{track.title}</h4>
          <p>{track.artist}</p>
          <span className={`badge ${track.lossless ? 'lossless' : ''}`}>{quality(track)}</span>
        </div>
        <div className="w-np-seek">
          <SeekBar />
          <div className="w-np-times">
            <TimeLabel part="elapsed" />
            <LikeButton id={track.id} />
            <TimeLabel part="total" />
          </div>
        </div>
        <Transport />
      </div>
    </div>
  )
}
