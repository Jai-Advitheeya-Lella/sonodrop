import { nativeImage } from 'electron'
import { createHash } from 'node:crypto'
import { mkdirSync, promises as fs, readdirSync, type Stats } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { parseFile, selectCover } from 'music-metadata'
import { LIBRARY_VERSION, type LibraryFile, type LibrarySnapshot, type ScanProgress, type Track } from '@shared/types'
import { probe } from './ffmpeg'
import { JsonStore } from './store'

/**
 * Formats by extension → the label shown in the app.
 * NATIVE ones play through the built-in decoder; the rest are decoded by ffmpeg on the way in (see resampler.ts).
 * To support another format, add it to the right table (and, for a native one, its MIME type in protocol.ts).
 */
const NATIVE: Record<string, string> = {
  '.mp3': 'MP3',
  '.flac': 'FLAC',
  '.wav': 'WAV',
  '.ogg': 'OGG',
  '.oga': 'OGG',
  '.opus': 'OPUS',
  '.m4a': 'AAC',
  '.m4b': 'AAC',
  '.aac': 'AAC',
  '.webm': 'WEBM',
  '.weba': 'WEBM'
}
const VIA_FFMPEG: Record<string, string> = {
  '.aiff': 'AIFF',
  '.aif': 'AIFF',
  '.aifc': 'AIFF',
  '.caf': 'CAF',
  '.ape': 'APE',
  '.wv': 'WAVPACK',
  '.tta': 'TTA',
  '.wma': 'WMA',
  '.dsf': 'DSD',
  '.dff': 'DSD',
  '.mpc': 'MPC',
  '.mp2': 'MP2',
  '.ac3': 'AC3',
  '.dts': 'DTS',
  '.mka': 'MKA',
  '.amr': 'AMR'
}
const CODEC_LABEL = { ...NATIVE, ...VIA_FFMPEG }
export const AUDIO_EXT = new Set(Object.keys(CODEC_LABEL))

export const albumIdFor = (albumArtist: string, album: string): string =>
  createHash('sha1').update(`${albumArtist.toLowerCase()}\u0000${album.toLowerCase()}`).digest('hex').slice(0, 16)

const DASH = /\s+[-–—]\s+/
const tidy = (s: string): string => s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()

export interface PathHint {
  title: string
  artist: string
  album: string
  trackNo: number | null
  year: number | null
}

/**
 * What a file's name and folders say about it, for when the tags don't:
 *   Artist/Album (1999)/03 - Title.flac      Artist - Album/03. Title.mp3      Artist - Title.wav
 * `roots` are the library folders themselves, whose names mean nothing.
 */
export function guessFromPath(path: string, roots: string[]): PathHint {
  let name = tidy(basename(path, extname(path)))
  let trackNo: number | null = null
  // "03 - Title", "03. Title", "03 Title" — but not "99 Problems" or "1979".
  const numbered = /^(\d{1,3})\s*[-.)]\s*(\S.*)$/.exec(name) ?? /^(0\d)\s+(\S.*)$/.exec(name)
  if (numbered) {
    trackNo = Number(numbered[1])
    name = numbered[2]
  }
  const parts = name.split(DASH).filter(Boolean)
  let title = name
  let artist = ''
  let album = ''
  if (parts.length >= 3) [artist, album, title] = [parts[0], parts[1], parts.slice(2).join(' - ')]
  else if (parts.length === 2) [artist, title] = parts

  let year: number | null = null
  let dir = dirname(path)
  // Step out of "CD 1" / "Disc 2" folders.
  if (/^(cd|disc|disk)\s*\d+$/i.test(basename(dir)) && !roots.includes(dir)) dir = dirname(dir)
  if (!roots.includes(dir)) {
    const folder = tidy(basename(dir)).replace(/\s*[[(]([^\])]*)[\])]/g, (_m, inner: string) => {
      const found = /\b(19|20)\d{2}\b/.exec(inner)
      if (found) year = Number(found[0])
      return ''
    })
    const [first, ...rest] = folder.split(DASH).filter(Boolean)
    if (rest.length) {
      artist ||= first
      album ||= rest.join(' - ')
    } else {
      album ||= first ?? ''
      const parent = dirname(dir)
      if (!artist && !roots.includes(parent) && parent !== dir) artist = tidy(basename(parent))
    }
  }
  return { title, artist, album, trackNo, year }
}

const FOLDER_COVER = /^(cover|folder|front|album|artwork)\.(jpe?g|png|webp)$/i
const THUMB_SIZE = 480

const sha1 = (data: string | Uint8Array): string => createHash('sha1').update(data).digest('hex')
const firstNumber = (s: string | undefined): number | null => (s && /\d+/.test(s) ? Number(/\d+/.exec(s)![0]) : null)
const clean = (s: unknown): string => (typeof s === 'string' ? s.trim() : '')

async function pool<T>(items: T[], size: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const run = async (): Promise<void> => {
    while (next < items.length) await worker(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, run))
}

async function walk(dir: string, out: Set<string>, depth = 0): Promise<void> {
  if (depth > 16) return
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) await walk(full, out, depth + 1)
    else if (entry.isFile() && AUDIO_EXT.has(extname(entry.name).toLowerCase())) out.add(full)
  }
}

export class Library {
  private readonly store: JsonStore<LibraryFile>
  private readonly coversDir: string
  private byId = new Map<string, Track>()
  private covers = new Map<string, Promise<void>>()
  private folderCovers = new Map<string, Promise<string | null>>()
  private running: Promise<void> | null = null
  private queued = false
  /** The library on disk was written by an older scanner: re-read every file once. */
  private stale: boolean

  constructor(
    dataDir: string,
    private readonly emit: (channel: 'library:progress' | 'library:updated', payload: unknown) => void,
    /** Called after every completed scan. */
    private readonly onScanned: () => void = () => {}
  ) {
    this.store = new JsonStore<LibraryFile>(join(dataDir, 'library.json'), {
      version: LIBRARY_VERSION,
      folders: [],
      files: [],
      tracks: []
    })
    this.stale = this.store.get('version') !== LIBRARY_VERSION
    this.coversDir = join(dataDir, 'covers')
    mkdirSync(this.coversDir, { recursive: true })
    for (const name of readdirSync(this.coversDir)) {
      if (!name.endsWith('.t')) this.covers.set(name, Promise.resolve())
    }
    for (const t of this.store.get('tracks')) this.byId.set(t.id, t)
  }

  get isEmpty(): boolean {
    return this.store.get('folders').length === 0 && this.store.get('files').length === 0
  }

  snapshot(): LibrarySnapshot {
    return { folders: this.store.get('folders'), tracks: this.store.get('tracks') }
  }

  track(id: string): Track | undefined {
    return this.byId.get(id)
  }

  coverFile(id: string, thumb: boolean): string {
    return join(this.coversDir, thumb ? `${id}.t` : id)
  }

  hasCover(id: string): boolean {
    return this.covers.has(id)
  }

  tracks(): Track[] {
    return this.store.get('tracks')
  }

  /** Change some fields of some tracks (used by the online lookup) and tell the UI. */
  patch(changes: Map<string, Partial<Track>>): void {
    if (changes.size === 0) return
    const tracks = this.store.get('tracks').map((track) => {
      const change = changes.get(track.id)
      if (!change) return track
      const next = { ...track, ...change }
      next.albumId = albumIdFor(next.albumArtist, next.album)
      return next
    })
    this.commit(tracks)
  }

  /** Sort a mixed list of paths (e.g. from a drag-and-drop) into folders and loose files, then rescan. */
  async addPaths(paths: string[]): Promise<void> {
    const folders = new Set(this.store.get('folders'))
    const files = new Set(this.store.get('files'))
    for (const p of paths) {
      try {
        const st = await fs.stat(p)
        if (st.isDirectory()) folders.add(p)
        else if (st.isFile() && AUDIO_EXT.has(extname(p).toLowerCase())) files.add(p)
      } catch {
        // vanished between the drop and now
      }
    }
    this.store.set('folders', [...folders])
    this.store.set('files', [...files])
    await this.scan()
  }

  async removeFolder(path: string): Promise<void> {
    this.store.set(
      'folders',
      this.store.get('folders').filter((f) => f !== path)
    )
    await this.scan()
  }

  scan(): Promise<void> {
    if (this.running) {
      this.queued = true
      return this.running
    }
    this.running = this.doScan()
      .catch((err) => console.error('[library] scan failed', err))
      .finally(() => {
        this.running = null
        if (this.queued) {
          this.queued = false
          void this.scan()
        } else {
          this.onScanned()
        }
      })
    return this.running
  }

  flushSync(): void {
    this.store.flushSync()
  }

  progress(p: ScanProgress): void {
    this.emit('library:progress', p)
  }

  private commit(tracks: Track[]): void {
    this.byId = new Map(tracks.map((t) => [t.id, t]))
    this.store.set('tracks', tracks)
    this.emit('library:updated', this.snapshot())
  }

  private async doScan(): Promise<void> {
    this.progress({ phase: 'listing', done: 0, total: 0 })
    this.folderCovers.clear()

    const paths = new Set<string>()
    for (const folder of this.store.get('folders')) await walk(folder, paths)
    for (const file of this.store.get('files')) paths.add(file)

    const before = this.byId
    const kept: Track[] = []
    const todo: { path: string; st: Stats; old?: Track }[] = []
    await pool([...paths], 32, async (path) => {
      let st: Stats
      try {
        st = await fs.stat(path)
      } catch {
        return
      }
      const old = before.get(sha1(path).slice(0, 16))
      if (old && !this.stale && old.mtime === Math.round(st.mtimeMs) && old.size === st.size) kept.push(old)
      else todo.push({ path, st, old })
    })

    const fresh: Track[] = []
    let done = 0
    let lastTick = 0
    let lastCommit = Date.now()
    this.progress({ phase: 'reading', done: 0, total: todo.length })
    await pool(todo, 6, async (item) => {
      fresh.push(await this.readTrack(item.path, item.st, item.old))
      done++
      const now = Date.now()
      if (now - lastTick > 80) {
        lastTick = now
        this.progress({ phase: 'reading', done, total: todo.length })
      }
      // Let a big first import fill the UI as it goes.
      if (now - lastCommit > 2500) {
        lastCommit = now
        this.commit([...kept, ...fresh])
      }
    })

    const changed = todo.length > 0 || kept.length !== before.size
    if (changed) this.commit([...kept, ...fresh])
    if (this.stale) {
      this.stale = false
      this.store.set('version', LIBRARY_VERSION)
    }
    await this.collectCovers()
    this.progress({ phase: 'done', done: todo.length, total: todo.length, added: todo.filter((t) => !t.old).length })
  }

  private async readTrack(path: string, st: Stats, old?: Track): Promise<Track> {
    const ext = extname(path).toLowerCase()
    let common: Awaited<ReturnType<typeof parseFile>>['common'] | undefined
    let format: Awaited<ReturnType<typeof parseFile>>['format'] | undefined
    try {
      let meta = await parseFile(path, { duration: false })
      // Some containers (Ogg) only reveal their length when read to the end.
      if (!meta.format.duration) meta = await parseFile(path, { duration: true })
      common = meta.common
      format = meta.format
    } catch {
      // Unreadable tags shouldn't hide a playable file; ffprobe and the path fill in below.
    }
    // Formats the tag reader doesn't know (AC3, DTS, TTA…): ask ffprobe instead.
    const probed = format?.sampleRate ? null : await probe(path)

    // Tags first; where they're missing, whatever the file and folder names give away.
    const hint = guessFromPath(path, this.store.get('folders'))
    const taggedTitle = clean(common?.title) || clean(probed?.tags.title)
    const taggedArtist = clean(common?.artist) || common?.artists?.join(', ') || clean(probed?.tags.artist)
    const taggedAlbum = clean(common?.album) || clean(probed?.tags.album)
    const artist = taggedArtist || hint.artist || 'Unknown Artist'
    const albumArtist = clean(common?.albumartist) || clean(probed?.tags.album_artist) || (common?.compilation ? 'Various Artists' : artist)
    const album = taggedAlbum || hint.album || basename(dirname(path))

    let coverId: string | null = null
    try {
      const picture = selectCover(common?.picture)
      coverId = picture ? await this.saveCover(picture.data) : await this.folderCover(dirname(path))
    } catch {
      coverId = null
    }

    const alac = /alac/i.test(format?.codec ?? probed?.codec ?? '')
    const codec = alac ? 'ALAC' : (CODEC_LABEL[ext] ?? ext.slice(1).toUpperCase())
    const lossless = format?.lossless ?? /^(FLAC|WAV|ALAC|AIFF|APE|WAVPACK|TTA|DSD)$/.test(codec)
    return {
      id: sha1(path).slice(0, 16),
      path,
      fileName: basename(path),
      title: taggedTitle || hint.title,
      artist,
      albumArtist,
      album,
      albumId: albumIdFor(albumArtist, album),
      genre: common?.genre?.[0] ?? probed?.tags.genre ?? '',
      year: common?.year ?? firstNumber(probed?.tags.date) ?? hint.year,
      trackNo: common?.track?.no ?? firstNumber(probed?.tags.track) ?? hint.trackNo,
      discNo: common?.disk?.no ?? firstNumber(probed?.tags.disc) ?? null,
      duration: format?.duration ?? probed?.duration ?? 0,
      codec,
      bitrate: format?.bitrate ? Math.round(format.bitrate / 1000) : (probed?.bitrate ?? null),
      sampleRate: format?.sampleRate ?? probed?.sampleRate ?? null,
      bitDepth: lossless ? (format?.bitsPerSample ?? probed?.bitDepth ?? null) : null,
      lossless,
      channels: format?.numberOfChannels ?? probed?.channels ?? null,
      native: ext in NATIVE && !alac,
      guessed: !taggedTitle || !taggedArtist,
      coverId,
      // "Date added" survives re-tagging; a first import uses the file's own age so the sort means something.
      dateAdded: old?.dateAdded ?? Math.round(st.birthtimeMs > 0 ? st.birthtimeMs : st.mtimeMs),
      mtime: Math.round(st.mtimeMs),
      size: st.size
    }
  }

  /** Store artwork once per distinct image, plus a small thumbnail for grids and lists. */
  saveCover(data: Uint8Array): Promise<string> {
    const id = sha1(data).slice(0, 24)
    let pending = this.covers.get(id)
    if (!pending) {
      pending = (async () => {
        const buf = Buffer.from(data)
        await fs.writeFile(this.coverFile(id, false), buf)
        let thumb: Buffer = buf
        const img = nativeImage.createFromBuffer(buf)
        if (!img.isEmpty()) {
          const { width, height } = img.getSize()
          const scale = THUMB_SIZE / Math.max(width, height)
          if (scale < 1) {
            thumb = img
              .resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'best' })
              .toJPEG(88)
          }
        }
        await fs.writeFile(this.coverFile(id, true), thumb)
      })()
      this.covers.set(id, pending)
    }
    return pending.then(() => id)
  }

  private folderCover(dir: string): Promise<string | null> {
    let pending = this.folderCovers.get(dir)
    if (!pending) {
      pending = (async () => {
        const names = await fs.readdir(dir)
        const name = names.find((n) => FOLDER_COVER.test(n))
        return name ? this.saveCover(await fs.readFile(join(dir, name))) : null
      })().catch(() => null)
      this.folderCovers.set(dir, pending)
    }
    return pending
  }

  private async collectCovers(): Promise<void> {
    const used = new Set<string>()
    for (const t of this.byId.values()) if (t.coverId) used.add(t.coverId)
    for (const id of [...this.covers.keys()]) {
      if (used.has(id)) continue
      this.covers.delete(id)
      await fs.rm(this.coverFile(id, false), { force: true })
      await fs.rm(this.coverFile(id, true), { force: true })
    }
  }
}
