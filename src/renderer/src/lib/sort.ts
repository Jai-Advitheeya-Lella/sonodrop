import type { Track } from '@shared/types'
import type { Album, Artist } from '@/stores/library'

export type SortDir = 'asc' | 'desc'
export interface SortState<K extends string> {
  by: K
  dir: SortDir
}

export type SongSort = 'title' | 'dateAdded' | 'artist' | 'album' | 'duration'
export type AlbumSort = 'title' | 'dateAdded' | 'artist' | 'year'
export type ArtistSort = 'name' | 'dateAdded' | 'tracks'

export const SONG_SORTS: [SongSort, string][] = [
  ['title', 'Title'],
  ['dateAdded', 'Date added'],
  ['artist', 'Artist'],
  ['album', 'Album'],
  ['duration', 'Duration']
]
export const ALBUM_SORTS: [AlbumSort, string][] = [
  ['title', 'Title'],
  ['dateAdded', 'Date added'],
  ['artist', 'Artist'],
  ['year', 'Year']
]
export const ARTIST_SORTS: [ArtistSort, string][] = [
  ['name', 'Name'],
  ['dateAdded', 'Date added'],
  ['tracks', 'Song count']
]

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const text = (a: string, b: string): number => collator.compare(a, b)

function sorted<T>(items: T[], compare: (a: T, b: T) => number, dir: SortDir): T[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...items].sort((a, b) => sign * compare(a, b))
}

export function sortTracks(tracks: Track[], { by, dir }: SortState<SongSort>): Track[] {
  const byTitle = (a: Track, b: Track): number => text(a.title, b.title)
  const compare: Record<SongSort, (a: Track, b: Track) => number> = {
    title: byTitle,
    dateAdded: (a, b) => a.dateAdded - b.dateAdded || byTitle(a, b),
    artist: (a, b) => text(a.artist, b.artist) || text(a.album, b.album) || (a.trackNo ?? 0) - (b.trackNo ?? 0),
    album: (a, b) => text(a.album, b.album) || (a.discNo ?? 0) - (b.discNo ?? 0) || (a.trackNo ?? 0) - (b.trackNo ?? 0),
    duration: (a, b) => a.duration - b.duration || byTitle(a, b)
  }
  return sorted(tracks, compare[by], dir)
}

export function sortAlbums(albums: Album[], { by, dir }: SortState<AlbumSort>): Album[] {
  const byTitle = (a: Album, b: Album): number => text(a.title, b.title)
  const compare: Record<AlbumSort, (a: Album, b: Album) => number> = {
    title: byTitle,
    dateAdded: (a, b) => a.dateAdded - b.dateAdded || byTitle(a, b),
    artist: (a, b) => text(a.artist, b.artist) || (a.year ?? 0) - (b.year ?? 0) || byTitle(a, b),
    year: (a, b) => (a.year ?? 0) - (b.year ?? 0) || byTitle(a, b)
  }
  return sorted(albums, compare[by], dir)
}

export function sortArtists(artists: Artist[], { by, dir }: SortState<ArtistSort>): Artist[] {
  const byName = (a: Artist, b: Artist): number => text(a.name, b.name)
  const compare: Record<ArtistSort, (a: Artist, b: Artist) => number> = {
    name: byName,
    dateAdded: (a, b) => a.dateAdded - b.dateAdded || byName(a, b),
    tracks: (a, b) => a.trackIds.length - b.trackIds.length || byName(a, b)
  }
  return sorted(artists, compare[by], dir)
}
