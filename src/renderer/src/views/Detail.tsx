import { useMemo, useState } from 'react'
import type { Track } from '@shared/types'
import { AlbumGrid } from '@/components/Albums'
import { IconButton } from '@/components/Controls'
import { Cover, useCoverPalette } from '@/components/Cover'
import { Icon } from '@/components/Icon'
import { albumMenu } from '@/components/menus'
import { Tilt } from '@/components/Tilt'
import { TrackList } from '@/components/TrackList'
import { formatLength, plural, quality } from '@/lib/format'
import { sortAlbums } from '@/lib/sort'
import { artistId, useLibrary } from '@/stores/library'
import { useUi } from '@/stores/ui'
import { useUser } from '@/stores/user'
import { Hero, Missing } from './parts'

const present = (ids: string[], byId: Map<string, Track>): Track[] => ids.map((id) => byId.get(id)).filter((t): t is Track => !!t)
const totalLength = (tracks: Track[]): string => formatLength(tracks.reduce((sum, t) => sum + t.duration, 0))

export function AlbumView({ id }: { id: string }): React.JSX.Element {
  const album = useLibrary((s) => s.albumsById.get(id))
  const byId = useLibrary((s) => s.byId)
  const colors = useCoverPalette(album?.coverId ?? null)
  const go = useUi((s) => s.go)
  const tracks = useMemo(() => (album ? present(album.trackIds, byId) : []), [album, byId])
  if (!album) return <Missing what="album" />

  return (
    <div className="view">
      <Hero
        seed={album.id}
        colors={colors}
        trackIds={album.trackIds}
        kicker="Album"
        title={album.title}
        art={
          <Tilt max={12}>
            <Cover id={album.coverId} title={album.title} size="cover" />
          </Tilt>
        }
        meta={
          <>
            <button className="link strong" onClick={() => go({ name: 'artist', id: artistId(album.artist) })}>
              {album.artist}
            </button>
            {album.year ? ` · ${album.year}` : ''} · {plural(tracks.length, 'song')} · {totalLength(tracks)}
            {tracks[0] && <span className={`badge ${tracks[0].lossless ? 'lossless' : ''}`}>{quality(tracks[0])}</span>}
          </>
        }
      >
        <IconButton icon="more" label="More" onClick={(e) => useUi.getState().openMenu(e, albumMenu(album))} />
      </Hero>
      <TrackList tracks={tracks} lead="track" showAlbum={false} />
    </div>
  )
}

export function ArtistView({ id }: { id: string }): React.JSX.Element {
  const artist = useLibrary((s) => s.artistsById.get(id))
  const albumsById = useLibrary((s) => s.albumsById)
  const byId = useLibrary((s) => s.byId)
  const colors = useCoverPalette(artist?.coverId ?? null)
  const albums = useMemo(
    () => (artist ? sortAlbums(artist.albumIds.map((a) => albumsById.get(a)!).filter(Boolean), { by: 'year', dir: 'desc' }) : []),
    [artist, albumsById]
  )
  const tracks = useMemo(() => albums.flatMap((a) => present(a.trackIds, byId)), [albums, byId])
  if (!artist) return <Missing what="artist" />

  return (
    <div className="view">
      <Hero
        seed={artist.id}
        colors={colors}
        trackIds={tracks.map((t) => t.id)}
        kicker="Artist"
        title={artist.name}
        art={
          <Tilt max={12}>
            <Cover id={artist.coverId} title={artist.name} size="cover" round />
          </Tilt>
        }
        meta={`${plural(albums.length, 'album')} · ${plural(tracks.length, 'song')} · ${totalLength(tracks)}`}
      />
      <h2 className="section">Albums</h2>
      <AlbumGrid albums={albums} />
      <h2 className="section">Songs</h2>
      <TrackList tracks={tracks} />
    </div>
  )
}

/** A user playlist, or Liked Songs when no id is given. */
export function PlaylistView({ id }: { id?: string }): React.JSX.Element {
  const playlist = useUser((s) => (id ? s.playlists.find((p) => p.id === id) : undefined))
  const liked = useUser((s) => s.liked)
  const byId = useLibrary((s) => s.byId)
  const go = useUi((s) => s.go)
  const [renaming, setRenaming] = useState(false)
  const ids = id ? (playlist?.trackIds ?? []) : liked
  const tracks = useMemo(() => present(ids, byId), [ids, byId])
  const colors = useCoverPalette(tracks[0]?.coverId ?? null)
  if (id && !playlist) return <Missing what="playlist" />

  const name = playlist?.name ?? 'Liked Songs'
  return (
    <div className="view">
      <Hero
        seed={id ?? 'liked'}
        colors={colors}
        trackIds={tracks.map((t) => t.id)}
        kicker="Playlist"
        title={
          renaming && playlist ? (
            <input
              className="rename"
              defaultValue={name}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => (useUser.getState().renamePlaylist(playlist.id, e.currentTarget.value), setRenaming(false))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
              }}
            />
          ) : (
            name
          )
        }
        art={
          <div className={`cover-stack ${id ? '' : 'liked'}`}>
            {tracks[0] && id ? <Cover id={tracks[0].coverId} title={tracks[0].album} size="cover" /> : <Icon name={id ? 'playlist' : 'heart'} size={64} fill={!id} />}
          </div>
        }
        meta={tracks.length ? `${plural(tracks.length, 'song')} · ${totalLength(tracks)}` : 'Empty for now'}
      >
        {playlist && (
          <>
            <IconButton icon="pencil" label="Rename" onClick={() => setRenaming(true)} />
            <IconButton
              icon="trash"
              label="Delete playlist"
              onClick={() => {
                useUser.getState().deletePlaylist(playlist.id)
                go({ name: 'library' })
              }}
            />
          </>
        )}
      </Hero>
      {tracks.length ? (
        <TrackList tracks={tracks} playlistId={id} showAdded={false} />
      ) : (
        <p className="hint">{id ? 'Right-click any song or album and choose “Add to playlist”.' : 'Tap the heart on any song and it lands here.'}</p>
      )}
    </div>
  )
}
