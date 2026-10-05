import type { Track } from '@shared/types'
import type { Album, Artist } from '@/stores/library'

export interface SearchEntry {
  track: Track
  title: string
  artist: string
  album: string
  /** Everything searchable, including the file name and folder path. */
  all: string
}

export const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

export function buildIndex(tracks: Track[]): SearchEntry[] {
  return tracks.map((track) => {
    const title = normalize(track.title)
    const artist = normalize(`${track.artist} ${track.albumArtist}`)
    const album = normalize(track.album)
    return { track, title, artist, album, all: `${title} ${artist} ${album} ${normalize(`${track.genre} ${track.path}`)}` }
  })
}

export interface SearchResults {
  tracks: Track[]
  albums: Album[]
  artists: Artist[]
}

export function search(index: SearchEntry[], albums: Album[], artists: Artist[], query: string): SearchResults {
  const q = normalize(query).trim()
  const tokens = q.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return { tracks: [], albums: [], artists: [] }

  const scored: { track: Track; score: number }[] = []
  for (const e of index) {
    if (!tokens.every((t) => e.all.includes(t))) continue
    let score = 1
    if (e.title === q) score += 120
    else if (e.title.startsWith(q)) score += 80
    else if (e.title.includes(q)) score += 50
    for (const t of tokens) {
      if (e.title.includes(t)) score += 12
      if (e.artist.includes(t)) score += 8
      if (e.album.includes(t)) score += 5
    }
    scored.push({ track: e.track, score })
  }
  scored.sort((a, b) => b.score - a.score || a.track.title.localeCompare(b.track.title))

  const matches = (text: string): boolean => {
    const n = normalize(text)
    return tokens.every((t) => n.includes(t))
  }
  return {
    tracks: scored.map((s) => s.track),
    albums: albums.filter((a) => matches(`${a.title} ${a.artist}`)),
    artists: artists.filter((a) => matches(a.name))
  }
}
