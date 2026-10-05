import { useMemo } from 'react'
import { AlbumGrid, ArtistCard } from '@/components/Albums'
import { GooTabs, SortControl } from '@/components/Controls'
import { TrackList } from '@/components/TrackList'
import { plural } from '@/lib/format'
import { ALBUM_SORTS, ARTIST_SORTS, SONG_SORTS, sortAlbums, sortArtists, sortTracks } from '@/lib/sort'
import { useLibrary } from '@/stores/library'
import { useUi, type LibraryTab } from '@/stores/ui'
import { EmptyLibrary } from './parts'

const TABS: [LibraryTab, string][] = [
  ['albums', 'Albums'],
  ['songs', 'Songs'],
  ['artists', 'Artists']
]

export function LibraryView(): React.JSX.Element {
  const tab = useUi((s) => s.libraryTab)
  const sort = useUi((s) => s.sort)
  const patch = useUi((s) => s.patch)
  const tracks = useLibrary((s) => s.tracks)
  const albums = useLibrary((s) => s.albums)
  const artists = useLibrary((s) => s.artists)

  const songs = useMemo(() => (tab === 'songs' ? sortTracks(tracks, sort.songs) : []), [tab, tracks, sort.songs])
  const sortedAlbums = useMemo(() => (tab === 'albums' ? sortAlbums(albums, sort.albums) : []), [tab, albums, sort.albums])
  const sortedArtists = useMemo(() => (tab === 'artists' ? sortArtists(artists, sort.artists) : []), [tab, artists, sort.artists])

  if (tracks.length === 0) return <EmptyLibrary />
  const order = sort[tab]

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <p className="kicker">
            {plural(tracks.length, 'song')} · {plural(albums.length, 'album')} · {plural(artists.length, 'artist')}
          </p>
          <h1>Library</h1>
        </div>
      </header>
      <div className="toolbar">
        <GooTabs tabs={TABS} value={tab} onChange={(libraryTab) => patch({ libraryTab })} />
        {tab === 'songs' && <SortControl options={SONG_SORTS} value={sort.songs} onChange={(songs) => patch({ sort: { ...sort, songs } })} />}
        {tab === 'albums' && <SortControl options={ALBUM_SORTS} value={sort.albums} onChange={(albums) => patch({ sort: { ...sort, albums } })} />}
        {tab === 'artists' && <SortControl options={ARTIST_SORTS} value={sort.artists} onChange={(artists) => patch({ sort: { ...sort, artists } })} />}
      </div>
      {/* Re-keyed on every change of order so the new arrangement drips in. */}
      <div key={`${tab}:${order.by}:${order.dir}`} className="tab-body">
        {tab === 'songs' && <TrackList tracks={songs} showAdded />}
        {tab === 'albums' && <AlbumGrid albums={sortedAlbums} />}
        {tab === 'artists' && (
          <div className="grid">
            {sortedArtists.map((artist, i) => (
              <ArtistCard key={artist.id} artist={artist} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
