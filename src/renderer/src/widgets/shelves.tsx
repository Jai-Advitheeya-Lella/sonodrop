import { useMemo } from 'react'
import { AlbumCard } from '@/components/Albums'
import { Cover } from '@/components/Cover'
import { formatTime } from '@/lib/format'
import { useLibrary, type Album } from '@/stores/library'
import { usePlayer } from '@/stores/player'
import { useUi } from '@/stores/ui'
import { useUser } from '@/stores/user'

function Shelf({ albums, empty }: { albums: Album[]; empty: string }): React.JSX.Element {
  if (albums.length === 0) return <p className="hint">{empty}</p>
  return (
    <div className="shelf">
      {albums.map((album, i) => (
        <AlbumCard key={album.id} album={album} index={i} />
      ))}
    </div>
  )
}

export function RecentlyAddedWidget(): React.JSX.Element {
  const albums = useLibrary((s) => s.albums)
  const recent = useMemo(() => [...albums].sort((a, b) => b.dateAdded - a.dateAdded).slice(0, 16), [albums])
  return <Shelf albums={recent} empty="New arrivals show up here." />
}

export function JumpBackWidget(): React.JSX.Element {
  const history = useUser((s) => s.history)
  const byId = useLibrary((s) => s.byId)
  const albumsById = useLibrary((s) => s.albumsById)
  const albums = useMemo(() => {
    const seen = new Set<string>()
    const out: Album[] = []
    for (const { id } of history) {
      const album = albumsById.get(byId.get(id)?.albumId ?? '')
      if (!album || seen.has(album.id)) continue
      seen.add(album.id)
      out.push(album)
      if (out.length === 16) break
    }
    return out
  }, [history, byId, albumsById])
  return <Shelf albums={albums} empty="Albums you listen to will collect here." />
}

export function UpNextWidget(): React.JSX.Element {
  const queue = usePlayer((s) => s.queue)
  const index = usePlayer((s) => s.index)
  const byId = useLibrary((s) => s.byId)
  const next = queue.slice(index + 1, index + 4)
  if (next.length === 0) return <p className="hint">Nothing queued after this. Right-click a song → “Add to queue”.</p>
  return (
    <div className="w-next">
      {next.map((id, i) => {
        const track = byId.get(id)
        if (!track) return null
        return (
          <button key={`${id}:${i}`} className="next-row" onClick={() => usePlayer.getState().jump(index + 1 + i)}>
            <Cover id={track.coverId} title={track.album} />
            <span>
              <strong>{track.title}</strong>
              <small>{track.artist}</small>
            </span>
            <span className="time">{formatTime(track.duration)}</span>
          </button>
        )
      })}
      <button className="link more" onClick={() => useUi.setState({ queueOpen: true })}>
        Open queue ({(queue.length - index - 1).toLocaleString()})
      </button>
    </div>
  )
}
