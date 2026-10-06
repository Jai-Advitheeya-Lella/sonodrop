/** Types shared between the main process, the preload bridge and the renderer. */

export interface Track {
  id: string
  path: string
  fileName: string
  title: string
  artist: string
  albumArtist: string
  album: string
  albumId: string
  genre: string
  year: number | null
  trackNo: number | null
  discNo: number | null
  /** Seconds. 0 when the tags didn't say; the player fills it in on first play. */
  duration: number
  /** Display label: MP3, FLAC, WAV, … */
  codec: string
  /** kbps */
  bitrate: number | null
  sampleRate: number | null
  bitDepth: number | null
  lossless: boolean
  coverId: string | null
  /** ms since epoch */
  dateAdded: number
  mtime: number
  size: number
}

/** Bump when the scanner starts recording something new; existing libraries are then re-read on next launch. */
export const LIBRARY_VERSION = 2

export interface LibraryFile {
  version: number
  folders: string[]
  files: string[]
  tracks: Track[]
}

export interface LibrarySnapshot {
  folders: string[]
  tracks: Track[]
}

export interface ScanProgress {
  phase: 'listing' | 'reading' | 'done'
  done: number
  total: number
  added?: number
}

/** What the main window tells every desktop widget, about once a second and on every change. */
export interface WidgetState {
  trackId: string | null
  title: string
  artist: string
  album: string
  coverId: string | null
  /** e.g. "FLAC · 24-bit · 96 kHz" */
  quality: string
  liked: boolean
  playing: boolean
  position: number
  duration: number
  next: { title: string; artist: string; coverId: string | null }[]
  themeId: string
  accent: [string, string, string]
  visualizer: string
}

/** Live audio for widgets that draw it: 30 times a second while one is open. */
export interface AudioFrame {
  /** bass, mid, treble, level, beat — each 0..1 */
  levels: [number, number, number, number, number]
  /** FEED_SIZE spectrum bands followed by FEED_SIZE waveform samples, 0..255 */
  feed: number[]
}

export type WidgetCommand = 'toggle' | 'next' | 'prev' | 'like' | 'show-main'

export interface SonoBridge {
  library: {
    get(): Promise<LibrarySnapshot>
    chooseFolders(): Promise<boolean>
    addPaths(paths: string[]): Promise<void>
    removeFolder(path: string): Promise<void>
    rescan(): Promise<void>
    onProgress(cb: (p: ScanProgress) => void): () => void
    onUpdated(cb: (s: LibrarySnapshot) => void): () => void
  }
  store: {
    get<T>(key: string): Promise<T | undefined>
    set(key: string, value: unknown): void
  }
  audio: {
    /** Whether ffmpeg with the SoX resampler is installed. */
    canResample(): Promise<boolean>
    /** Start resampling a track ahead of time so it is ready when its turn comes. */
    prepare(trackId: string, rate: number): void
  }
  widgets: {
    toggle(id: string): void
    open(): Promise<string[]>
    onOpenChange(cb: (open: string[]) => void): () => void
    pushState(state: WidgetState): void
    onState(cb: (s: WidgetState) => void): () => void
    pushAudio(frame: AudioFrame): void
    onAudio(cb: (f: AudioFrame) => void): () => void
    command(cmd: WidgetCommand): void
    onCommand(cb: (cmd: WidgetCommand) => void): () => void
  }
  showInFolder(path: string): void
  pathForFile(file: File): string
  /** Set in a desktop widget window: which widget this window is. */
  widgetId: string | null
}
