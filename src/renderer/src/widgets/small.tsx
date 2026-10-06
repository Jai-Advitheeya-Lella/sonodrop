import { useMemo } from 'react'
import { Icon } from '@/components/Icon'
import { allTrackIds } from '@/components/menus'
import { formatLength } from '@/lib/format'
import { useCurrentTrack } from '@/lib/hooks'
import { useLibrary } from '@/stores/library'
import { resampleRate, usePlayer } from '@/stores/player'
import { useUi } from '@/stores/ui'

export function QuickPourWidget(): React.JSX.Element {
  const albums = useLibrary((s) => s.albums)
  const player = usePlayer.getState()
  return (
    <div className="w-pour">
      <button className="pour-btn" onClick={() => player.shufflePlay(allTrackIds())}>
        <span className="pour-blob">
          <Icon name="shuffle" size={22} />
        </span>
        Shuffle everything
      </button>
      <button
        className="pour-btn"
        onClick={() => {
          const album = albums[Math.floor(Math.random() * albums.length)]
          if (album) player.playTracks(album.trackIds)
        }}
      >
        <span className="pour-blob alt">
          <Icon name="disc" size={22} />
        </span>
        Surprise album
      </button>
    </div>
  )
}

export function StatsWidget(): React.JSX.Element {
  const tracks = useLibrary((s) => s.tracks)
  const albums = useLibrary((s) => s.albums.length)
  const artists = useLibrary((s) => s.artists.length)
  const { formats, seconds } = useMemo(() => {
    const counts = new Map<string, number>()
    let seconds = 0
    for (const t of tracks) {
      counts.set(t.codec, (counts.get(t.codec) ?? 0) + 1)
      seconds += t.duration
    }
    return { formats: [...counts].sort((a, b) => b[1] - a[1]), seconds }
  }, [tracks])
  return (
    <div className="w-stats">
      <div className="stat-row">
        <div>
          <strong>{tracks.length.toLocaleString()}</strong>
          <span>songs</span>
        </div>
        <div>
          <strong>{albums.toLocaleString()}</strong>
          <span>albums</span>
        </div>
        <div>
          <strong>{artists.toLocaleString()}</strong>
          <span>artists</span>
        </div>
      </div>
      <div className="format-bar" aria-hidden>
        {formats.map(([codec, count], i) => (
          <i key={codec} style={{ flexGrow: count, opacity: 1 - Math.min(0.7, i * 0.22) }} />
        ))}
      </div>
      <p>
        {formats
          .slice(0, 3)
          .map(([codec, count]) => `${count.toLocaleString()} ${codec}`)
          .join(' · ')}
      </p>
      <p>{formatLength(seconds)} of music</p>
    </div>
  )
}

export function SignalWidget(): React.JSX.Element {
  const track = useCurrentTrack()
  const eq = useUi((s) => s.eq.on)
  // Re-read the target rate whenever the resampling setting changes.
  useUi((s) => s.resample)
  const resampled = resampleRate()
  if (!track) {
    return (
      <div className="w-signal idle">
        <strong>—</strong>
        <span>Format details of whatever is playing show up here.</span>
      </div>
    )
  }
  return (
    <div className="w-signal">
      <strong>{track.codec}</strong>
      <span className={`badge ${track.lossless ? 'lossless' : ''}`}>{track.lossless ? 'Lossless' : 'Lossy'}</span>
      <dl>
        {track.bitDepth && (
          <>
            <dt>Depth</dt>
            <dd>{track.bitDepth}-bit</dd>
          </>
        )}
        {track.sampleRate && (
          <>
            <dt>Rate</dt>
            <dd>{+(track.sampleRate / 1000).toFixed(1)} kHz</dd>
          </>
        )}
        {track.bitrate && (
          <>
            <dt>Bitrate</dt>
            <dd>{track.bitrate.toLocaleString()} kbps</dd>
          </>
        )}
        <dt>Size</dt>
        <dd>{(track.size / 1_048_576).toFixed(1)} MB</dd>
        {resampled && resampled !== track.sampleRate && (
          <>
            <dt>SoX</dt>
            <dd>→ {+(resampled / 1000).toFixed(1)} kHz</dd>
          </>
        )}
        {eq && (
          <>
            <dt>EQ</dt>
            <dd>On</dd>
          </>
        )}
      </dl>
    </div>
  )
}
