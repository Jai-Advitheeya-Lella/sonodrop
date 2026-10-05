import { nativeImage } from 'electron'
import { createHash } from 'node:crypto'
import { mkdirSync, promises as fs, readdirSync, type Stats } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { parseFile, selectCover } from 'music-metadata'
import { LIBRARY_VERSION, type LibraryFile, type LibrarySnapshot, type ScanProgress, type Track } from '@shared/types'
import { JsonStore } from './store'

/** Everything Chromium can decode natively. Add an extension here (and a MIME type in protocol.ts) to support more. */
export const AUDIO_EXT = new Set(['.mp3', '.flac', '.wav', '.ogg', '.oga', '.opus', '.m4a', '.aac', '.webm', '.weba'])

const CODEC_LABEL: Record<string, string> = {
  '.mp3': 'MP3',
  '.flac': 'FLAC',
  '.wav': 'WAV',
  '.ogg': 'OGG',
  '.oga': 'OGG',
  '.opus': 'OPUS',
  '.m4a': 'AAC',
  '.aac': 'AAC',
  '.webm': 'WEBM',
  '.weba': 'WEBM'
}

const FOLDER_COVER = /^(cover|folder|front|album|artwork)\.(jpe?g|png|webp)$/i
const THUMB_SIZE = 480

const sha1 = (data: string | Uint8Array): string => createHash('sha1').update(data).digest('hex')
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
    private readonly emit: (channel: 'library:progress' | 'library:updated', payload: unknown) => void
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
        }
      })
    return this.running
  }

  flushSync(): void {
    this.store.flushSync()
  }

  private progress(p: ScanProgress): void {
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
    const fileName = basename(path)
    let common: Awaited<ReturnType<typeof parseFile>>['common'] | undefined
    let format: Awaited<ReturnType<typeof parseFile>>['format'] | undefined
    try {
      let meta = await parseFile(path, { duration: false })
      // Some containers (Ogg) only reveal their length when read to the end.
      if (!meta.format.duration) meta = await parseFile(path, { duration: true })
      common = meta.common
      format = meta.format
    } catch {
      // Unreadable tags shouldn't hide a playable file; fall back to what the path tells us.
    }

    const artist = clean(common?.artist) || common?.artists?.join(', ') || 'Unknown Artist'
    const albumArtist = clean(common?.albumartist) || (common?.compilation ? 'Various Artists' : artist)
    const album = clean(common?.album) || basename(dirname(path))

    let coverId: string | null = null
    try {
      const picture = selectCover(common?.picture)
      coverId = picture ? await this.saveCover(picture.data) : await this.folderCover(dirname(path))
    } catch {
      coverId = null
    }

    const codec = format?.codec?.includes('ALAC') ? 'ALAC' : (CODEC_LABEL[ext] ?? ext.slice(1).toUpperCase())
    const lossless = format?.lossless ?? (ext === '.flac' || ext === '.wav')
    return {
      id: sha1(path).slice(0, 16),
      path,
      fileName,
      title: clean(common?.title) || basename(path, ext),
      artist,
      albumArtist,
      album,
      albumId: sha1(`${albumArtist.toLowerCase()}\u0000${album.toLowerCase()}`).slice(0, 16),
      genre: common?.genre?.[0] ?? '',
      year: common?.year ?? null,
      trackNo: common?.track?.no ?? null,
      discNo: common?.disk?.no ?? null,
      duration: format?.duration ?? 0,
      codec,
      bitrate: format?.bitrate ? Math.round(format.bitrate / 1000) : null,
      sampleRate: format?.sampleRate ?? null,
      bitDepth: lossless ? (format?.bitsPerSample ?? null) : null,
      lossless,
      coverId,
      // "Date added" survives re-tagging; a first import uses the file's own age so the sort means something.
      dateAdded: old?.dateAdded ?? Math.round(st.birthtimeMs > 0 ? st.birthtimeMs : st.mtimeMs),
      mtime: Math.round(st.mtimeMs),
      size: st.size
    }
  }

  /** Store artwork once per distinct image, plus a small thumbnail for grids and lists. */
  private saveCover(data: Uint8Array): Promise<string> {
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
