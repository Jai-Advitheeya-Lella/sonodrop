import { app, net } from 'electron'
import { join } from 'node:path'
import type { Track } from '@shared/types'
import type { Library } from './library'
import { JsonStore } from './store'

/**
 * Fills in what the files don't say, from MusicBrainz (details) and the Cover Art Archive (artwork).
 * Runs after every scan, only for albums with no cover and tracks with no artist tag, and only when the
 * user allows it. What is found is kept in the library, never written into the files.
 *
 * Only album, artist and track names leave the machine. MusicBrainz asks for at most one request a second.
 */
const MB = 'https://musicbrainz.org/ws/2'
const CAA = 'https://coverartarchive.org'
const RETRY_AFTER = 30 * 24 * 3600 * 1000
const SPACING = 1100

interface Found {
  at: number
  coverId?: string | null
  year?: number | null
  artist?: string
  album?: string
}

interface Cache {
  albums: Record<string, Found>
  recordings: Record<string, Found>
}

interface MbRelease {
  id: string
  score: number
  title: string
  date?: string
  'track-count'?: number
  'release-group'?: { id: string }
}

interface MbRecording {
  score: number
  title: string
  length?: number
  'first-release-date'?: string
  'artist-credit'?: { name: string }[]
  releases?: { title: string }[]
}

const quote = (s: string): string => `"${s.replace(/(["\\])/g, '\\$1')}"`
const key = (...parts: string[]): string => parts.map((p) => p.trim().toLowerCase()).join('\u0000')
const yearOf = (date?: string): number | null => (date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null)
const isImage = (b: Buffer): boolean => (b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50) || b.subarray(0, 4).toString('latin1') === 'RIFF'

export class Enricher {
  private readonly cache: JsonStore<Cache>
  private running = false
  private again = false
  private lastRequest = 0
  enabled = true

  constructor(
    private readonly library: Library,
    dataDir: string
  ) {
    this.cache = new JsonStore<Cache>(join(dataDir, 'online.json'), { albums: {}, recordings: {} })
  }

  /** Forget what wasn't found, so the next run asks again. */
  forgetMisses(): void {
    for (const table of ['albums', 'recordings'] as const) {
      const kept = Object.fromEntries(Object.entries(this.cache.get(table)).filter(([, found]) => found.coverId || found.artist))
      this.cache.set(table, kept)
    }
  }

  flushSync(): void {
    this.cache.flushSync()
  }

  async run(): Promise<void> {
    if (!this.enabled) return
    if (this.running) {
      this.again = true
      return
    }
    this.running = true
    try {
      await this.identify()
      await this.findCovers()
    } catch (err) {
      // Offline, or the service is having a bad day: try again after the next scan.
      console.warn('[online] lookup stopped:', err instanceof Error ? err.message : err)
    } finally {
      this.running = false
      this.library.progress({ phase: 'done', done: 0, total: 0 })
      if (this.again) {
        this.again = false
        void this.run()
      }
    }
  }

  private async json<T>(url: string): Promise<T> {
    const wait = this.lastRequest + SPACING - Date.now()
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    this.lastRequest = Date.now()
    const res = await net.fetch(url, {
      headers: { 'User-Agent': `Sonodrop/${app.getVersion()} ( https://github.com/Jai-Advitheeya-Lella/sonodrop )`, Accept: 'application/json' }
    })
    if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`)
    return (await res.json()) as T
  }

  /** Front cover for a release or release group; null when the archive has none. */
  private async cover(kind: 'release' | 'release-group', id: string): Promise<string | null> {
    const res = await net.fetch(`${CAA}/${kind}/${id}/front-500`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`${res.status} from coverartarchive.org`)
    const image = Buffer.from(await res.arrayBuffer())
    return isImage(image) ? this.library.saveCover(image) : null
  }

  /** Tracks with no artist tag: find the recording by its title (and length), and take the artist and album from it. */
  private async identify(): Promise<void> {
    const cache = { ...this.cache.get('recordings') }
    const unknown = this.library.tracks().filter((t) => t.guessed && t.artist === 'Unknown Artist' && t.title.length > 2)
    const changes = new Map<string, Partial<Track>>()
    let done = 0
    for (const track of unknown) {
      this.library.progress({ phase: 'online', done: done++, total: unknown.length })
      if (!this.enabled) return
      const id = key(track.title, String(Math.round(track.duration)))
      let found = cache[id]
      if (!found || (!found.artist && Date.now() - found.at > RETRY_AFTER)) {
        const { recordings } = await this.json<{ recordings: MbRecording[] }>(`${MB}/recording/?fmt=json&limit=8&query=${encodeURIComponent(`recording:${quote(track.title)}`)}`)
        // A title alone is weak evidence, so the length has to agree as well.
        const match = recordings.find((r) => r.score >= 95 && r['artist-credit']?.length && track.duration > 0 && r.length && Math.abs(r.length / 1000 - track.duration) < 4)
        found = match
          ? { at: Date.now(), artist: match['artist-credit']![0].name, album: match.releases?.[0]?.title, year: yearOf(match['first-release-date']) }
          : { at: Date.now() }
        cache[id] = found
        this.cache.set('recordings', cache)
      }
      if (found.artist) {
        changes.set(track.id, {
          artist: found.artist,
          albumArtist: found.artist,
          album: found.album ?? track.album,
          year: track.year ?? found.year ?? null,
          online: true
        })
      }
    }
    this.library.patch(changes)
  }

  /** Albums where no track has artwork: find the release and fetch its front cover. */
  private async findCovers(): Promise<void> {
    const cache = { ...this.cache.get('albums') }
    const albums = new Map<string, Track[]>()
    for (const track of this.library.tracks()) {
      const list = albums.get(track.albumId)
      if (list) list.push(track)
      else albums.set(track.albumId, [track])
    }
    const bare = [...albums.values()].filter((tracks) => tracks.every((t) => !t.coverId) && tracks[0].album.length > 1)
    let done = 0
    for (const tracks of bare) {
      this.library.progress({ phase: 'online', done: done++, total: bare.length })
      if (!this.enabled) return
      const { album, albumArtist } = tracks[0]
      const known = albumArtist !== 'Unknown Artist' && albumArtist !== 'Various Artists'
      const id = key(albumArtist, album)
      let found = cache[id]
      const stale = found && !found.coverId && Date.now() - found.at > RETRY_AFTER
      const lost = found?.coverId && !this.library.hasCover(found.coverId)
      if (!found || stale || lost) {
        const query = known ? `release:${quote(album)} AND artist:${quote(albumArtist)}` : `release:${quote(album)}`
        const { releases } = await this.json<{ releases: MbRelease[] }>(`${MB}/release/?fmt=json&limit=6&query=${encodeURIComponent(query)}`)
        // Without an artist to go on, only trust a release with the same number of tracks.
        const candidates = releases.filter((r) => r.score >= (known ? 88 : 96) && (known || r['track-count'] === tracks.length))
        // Reissues abound, so the earliest date among the good matches is the best guess at the original year.
        const years = candidates.map((r) => yearOf(r.date)).filter((y): y is number => y !== null)
        found = { at: Date.now(), coverId: null, year: years.length ? Math.min(...years) : null }
        const group = candidates[0]?.['release-group']?.id
        if (group) found.coverId = await this.cover('release-group', group)
        for (const release of candidates.slice(0, 3)) {
          if (found.coverId) break
          found.coverId = await this.cover('release', release.id)
        }
        cache[id] = found
        this.cache.set('albums', cache)
      }
      if (found.coverId) {
        const { coverId, year } = found
        this.library.patch(new Map(tracks.map((t) => [t.id, { coverId, year: t.year ?? year ?? null, online: true }])))
      }
    }
  }
}
