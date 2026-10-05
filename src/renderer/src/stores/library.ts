import { create } from 'zustand'
import type { ScanProgress, Track } from '@shared/types'
import { buildIndex, type SearchEntry } from '@/lib/search'

export interface Album {
  id: string
  title: string
  artist: string
  year: number | null
  coverId: string | null
  trackIds: string[]
  duration: number
  /** Most recent addition to the album. */
  dateAdded: number
}

export interface Artist {
  id: string
  name: string
  coverId: string | null
  albumIds: string[]
  trackIds: string[]
  dateAdded: number
}

interface LibraryState {
  loaded: boolean
  tracks: Track[]
  byId: Map<string, Track>
  albums: Album[]
  albumsById: Map<string, Album>
  artists: Artist[]
  artistsById: Map<string, Artist>
  index: SearchEntry[]
  folders: string[]
  scan: ScanProgress | null
  setTracks(tracks: Track[], folders: string[]): void
  setScan(scan: ScanProgress | null): void
}

export const artistId = (name: string): string => name.trim().toLowerCase()

function derive(tracks: Track[]): Pick<LibraryState, 'byId' | 'albums' | 'albumsById' | 'artists' | 'artistsById' | 'index'> {
  const byId = new Map(tracks.map((t) => [t.id, t]))
  const albumTracks = new Map<string, Track[]>()
  for (const t of tracks) {
    const list = albumTracks.get(t.albumId)
    if (list) list.push(t)
    else albumTracks.set(t.albumId, [t])
  }

  const albums: Album[] = []
  const artistsById = new Map<string, Artist>()
  for (const [id, list] of albumTracks) {
    list.sort((a, b) => (a.discNo ?? 1) - (b.discNo ?? 1) || (a.trackNo ?? 1e6) - (b.trackNo ?? 1e6) || a.fileName.localeCompare(b.fileName))
    const first = list[0]
    const album: Album = {
      id,
      title: first.album,
      artist: first.albumArtist,
      year: list.reduce<number | null>((y, t) => (t.year && (!y || t.year > y) ? t.year : y), null),
      coverId: list.find((t) => t.coverId)?.coverId ?? null,
      trackIds: list.map((t) => t.id),
      duration: list.reduce((sum, t) => sum + t.duration, 0),
      dateAdded: Math.max(...list.map((t) => t.dateAdded))
    }
    albums.push(album)

    const aid = artistId(album.artist)
    let artist = artistsById.get(aid)
    if (!artist) {
      artist = { id: aid, name: album.artist, coverId: null, albumIds: [], trackIds: [], dateAdded: 0 }
      artistsById.set(aid, artist)
    }
    artist.albumIds.push(id)
    artist.trackIds.push(...album.trackIds)
    artist.coverId ??= album.coverId
    artist.dateAdded = Math.max(artist.dateAdded, album.dateAdded)
  }

  return {
    byId,
    albums,
    albumsById: new Map(albums.map((a) => [a.id, a])),
    artists: [...artistsById.values()],
    artistsById,
    index: buildIndex(tracks)
  }
}

export const useLibrary = create<LibraryState>((set) => ({
  loaded: false,
  tracks: [],
  byId: new Map(),
  albums: [],
  albumsById: new Map(),
  artists: [],
  artistsById: new Map(),
  index: [],
  folders: [],
  scan: null,
  setTracks: (tracks, folders) => set({ loaded: true, tracks, folders, ...derive(tracks) }),
  setScan: (scan) => set({ scan })
}))

export const trackById = (id: string | null | undefined): Track | undefined => (id ? useLibrary.getState().byId.get(id) : undefined)
