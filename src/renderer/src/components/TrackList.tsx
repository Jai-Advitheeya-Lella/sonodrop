import { createContext, memo, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Track } from '@shared/types'
import { formatAdded, formatTime } from '@/lib/format'
import { artistId } from '@/stores/library'
import { usePlayer } from '@/stores/player'
import { useUi } from '@/stores/ui'
import { useUser } from '@/stores/user'
import { Cover } from './Cover'
import { Icon } from './Icon'
import { trackMenu } from './menus'

/** The element that scrolls the current view; virtualised lists measure themselves against it. */
export const ScrollContext = createContext<HTMLElement | null>(null)

const ROW = 56
const CHUNK = 6

interface Props {
  tracks: Track[]
  /** 'position' numbers rows 1..n, 'track' uses the tag's track number, 'cover' shows artwork instead. */
  lead?: 'position' | 'track' | 'cover'
  showAlbum?: boolean
  showAdded?: boolean
  /** Set when the list is a playlist, so rows can be removed from it. */
  playlistId?: string
}

/** A windowed track table: only the rows near the viewport exist in the DOM, so 50,000 songs scroll like 50. */
export function TrackList({ tracks, lead = 'cover', showAlbum = true, showAdded = false, playlistId }: Props): React.JSX.Element {
  const scroller = useContext(ScrollContext)
  const ref = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState<[number, number]>([0, 30])
  const ids = useMemo(() => tracks.map((t) => t.id), [tracks])

  useEffect(() => {
    const el = ref.current
    if (!scroller || !el) return
    let raf = 0
    const measure = (): void => {
      raf = 0
      const offset = scroller.getBoundingClientRect().top - el.getBoundingClientRect().top
      const first = Math.max(0, Math.floor(offset / ROW / CHUNK) * CHUNK - CHUNK)
      const last = Math.min(tracks.length, first + Math.ceil(scroller.clientHeight / ROW) + CHUNK * 3)
      setRange((prev) => (prev[0] === first && prev[1] === last ? prev : [first, last]))
    }
    const schedule = (): void => {
      raf ||= requestAnimationFrame(measure)
    }
    scroller.addEventListener('scroll', schedule, { passive: true })
    const observer = new ResizeObserver(schedule)
    observer.observe(scroller)
    measure()
    return () => {
      cancelAnimationFrame(raf)
      scroller.removeEventListener('scroll', schedule)
      observer.disconnect()
    }
  }, [scroller, tracks.length])

  const play = (index: number): void => usePlayer.getState().playTracks(ids, index)
  const cls = `tracks ${showAlbum ? 'with-album' : ''} ${showAdded ? 'with-added' : ''}`

  return (
    <div className={cls} role="table">
      <div className="track-head" role="row">
        <span className="t-lead">{lead === 'cover' ? '' : '#'}</span>
        <span>Title</span>
        {showAlbum && <span className="t-album">Album</span>}
        {showAdded && <span className="t-added">Date added</span>}
        <span className="t-codec">Format</span>
        <span />
        <span className="t-time">Time</span>
        <span />
      </div>
      <div ref={ref} className="track-rows" style={{ height: tracks.length * ROW }}>
        {tracks.slice(range[0], range[1]).map((track, i) => {
          const index = range[0] + i
          return (
            <TrackRow
              key={`${track.id}:${index}`}
              track={track}
              index={index}
              lead={lead}
              showAlbum={showAlbum}
              showAdded={showAdded}
              playlistId={playlistId}
              onPlay={play}
            />
          )
        })}
      </div>
    </div>
  )
}

interface RowProps extends Required<Pick<Props, 'lead' | 'showAlbum' | 'showAdded'>> {
  track: Track
  index: number
  playlistId?: string
  onPlay(index: number): void
}

const TrackRow = memo(function TrackRow({ track, index, lead, showAlbum, showAdded, playlistId, onPlay }: RowProps) {
  const current = usePlayer((s) => s.currentId === track.id)
  const playing = usePlayer((s) => s.playing && s.currentId === track.id)
  const liked = useUser((s) => s.liked.includes(track.id))
  const go = useUi((s) => s.go)

  const activate = (): void => {
    if (current) usePlayer.getState().toggle()
    else onPlay(index)
  }
  const menu = (e: React.MouseEvent): void =>
    useUi.getState().openMenu(e, trackMenu(track, playlistId ? { id: playlistId, index } : undefined))

  return (
    <div
      className={`track ${current ? 'current' : ''}`}
      style={{ transform: `translateY(${index * ROW}px)` }}
      role="row"
      onDoubleClick={activate}
      onContextMenu={menu}
    >
      <button className="t-lead" onClick={activate} aria-label={playing ? 'Pause' : `Play ${track.title}`}>
        {lead === 'cover' ? <Cover id={track.coverId} title={track.album} /> : <span className="t-num">{lead === 'track' ? (track.trackNo ?? index + 1) : index + 1}</span>}
        {playing ? (
          <span className="eq" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        ) : null}
        <Icon name={playing ? 'pause' : 'play'} size={16} className="t-play" />
      </button>
      <div className="t-title">
        <span className="t-name">{track.title}</span>
        <button className="t-artist link" onClick={() => go({ name: 'artist', id: artistId(track.albumArtist) })}>
          {track.artist}
        </button>
      </div>
      {showAlbum && (
        <button className="t-album link" onClick={() => go({ name: 'album', id: track.albumId })}>
          {track.album}
        </button>
      )}
      {showAdded && <span className="t-added">{formatAdded(track.dateAdded)}</span>}
      <span className="t-codec">
        <span className={`badge ${track.lossless ? 'lossless' : ''}`}>{track.codec}</span>
      </span>
      <button
        className={`icon-btn t-like ${liked ? 'on' : ''}`}
        onClick={() => useUser.getState().toggleLike(track.id)}
        aria-label={liked ? 'Remove from Liked' : 'Like'}
        aria-pressed={liked}
      >
        <Icon name="heart" size={16} fill={liked} />
      </button>
      <span className="t-time">{track.duration ? formatTime(track.duration) : '–'}</span>
      <button className="icon-btn t-more" onClick={menu} aria-label="More">
        <Icon name="more" size={16} />
      </button>
    </div>
  )
})
