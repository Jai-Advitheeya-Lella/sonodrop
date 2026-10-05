import { memo } from 'react'
import { plural } from '@/lib/format'
import type { Album, Artist } from '@/stores/library'
import { usePlayer } from '@/stores/player'
import { useUi } from '@/stores/ui'
import { Cover } from './Cover'
import { Icon } from './Icon'
import { albumMenu } from './menus'
import { Tilt } from './Tilt'

export const AlbumCard = memo(function AlbumCard({ album, index = 0 }: { album: Album; index?: number }) {
  const go = useUi((s) => s.go)
  const active = usePlayer((s) => s.playing && album.trackIds.includes(s.currentId ?? ''))
  return (
    <div
      className="card"
      style={{ '--i': Math.min(index, 14) } as React.CSSProperties}
      onContextMenu={(e) => useUi.getState().openMenu(e, albumMenu(album))}
    >
      <Tilt className="card-art" max={12}>
        <button className="card-open" onClick={() => go({ name: 'album', id: album.id })} aria-label={`Open ${album.title}`}>
          <Cover id={album.coverId} title={album.title} />
        </button>
        <button
          className={`card-play ${active ? 'on' : ''}`}
          onClick={() => (active ? usePlayer.getState().toggle() : usePlayer.getState().playTracks(album.trackIds))}
          aria-label={active ? 'Pause' : `Play ${album.title}`}
        >
          <Icon name={active ? 'pause' : 'play'} size={20} />
        </button>
      </Tilt>
      <div className="card-title">{album.title}</div>
      <div className="card-sub">
        {album.artist}
        {album.year ? ` · ${album.year}` : ''}
      </div>
    </div>
  )
})

export function AlbumGrid({ albums }: { albums: Album[] }): React.JSX.Element {
  return (
    <div className="grid">
      {albums.map((album, i) => (
        <AlbumCard key={album.id} album={album} index={i} />
      ))}
    </div>
  )
}

export const ArtistCard = memo(function ArtistCard({ artist, index = 0 }: { artist: Artist; index?: number }) {
  const go = useUi((s) => s.go)
  return (
    <button className="card artist" style={{ '--i': Math.min(index, 14) } as React.CSSProperties} onClick={() => go({ name: 'artist', id: artist.id })}>
      <Tilt className="card-art" max={12}>
        <Cover id={artist.coverId} title={artist.name} round />
      </Tilt>
      <div className="card-title">{artist.name}</div>
      <div className="card-sub">
        {plural(artist.albumIds.length, 'album')} · {plural(artist.trackIds.length, 'song')}
      </div>
    </button>
  )
})
