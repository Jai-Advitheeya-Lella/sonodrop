import { useDeferredValue, useMemo } from 'react'
import { AlbumCard, ArtistCard } from '@/components/Albums'
import { Icon } from '@/components/Icon'
import { TrackList } from '@/components/TrackList'
import { plural } from '@/lib/format'
import { search } from '@/lib/search'
import { useLibrary } from '@/stores/library'
import { useUi } from '@/stores/ui'

export function SearchView(): React.JSX.Element {
  const query = useDeferredValue(useUi((s) => s.query))
  const index = useLibrary((s) => s.index)
  const albums = useLibrary((s) => s.albums)
  const artists = useLibrary((s) => s.artists)
  const results = useMemo(() => search(index, albums, artists, query), [index, albums, artists, query])
  const total = results.tracks.length + results.albums.length + results.artists.length

  if (!query.trim()) {
    return (
      <div className="empty">
        <Icon name="search" size={44} />
        <h1>Find anything</h1>
        <p>Search by song, artist, album, genre, file name or folder. Press Ctrl K from anywhere.</p>
      </div>
    )
  }
  if (total === 0) {
    return (
      <div className="empty">
        <Icon name="drop" size={44} />
        <h1>Not a drop</h1>
        <p>Nothing in your library matches “{query}”.</p>
      </div>
    )
  }

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <p className="kicker">{plural(total, 'result')}</p>
          <h1>“{query}”</h1>
        </div>
      </header>
      {results.albums.length > 0 && (
        <>
          <h2 className="section">Albums</h2>
          <div className="grid">
            {results.albums.slice(0, 12).map((album, i) => (
              <AlbumCard key={album.id} album={album} index={i} />
            ))}
          </div>
        </>
      )}
      {results.artists.length > 0 && (
        <>
          <h2 className="section">Artists</h2>
          <div className="grid">
            {results.artists.slice(0, 12).map((artist, i) => (
              <ArtistCard key={artist.id} artist={artist} index={i} />
            ))}
          </div>
        </>
      )}
      {results.tracks.length > 0 && (
        <>
          <h2 className="section">Songs</h2>
          <TrackList tracks={results.tracks} />
        </>
      )}
    </div>
  )
}
