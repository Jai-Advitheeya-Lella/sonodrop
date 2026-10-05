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

/** What the main window tells the mini-player widget. */
export interface MiniState {
  title: string
  artist: string
  coverId: string | null
  playing: boolean
  position: number
  duration: number
  themeId: string
  accent: [string, string, string]
}

export type MiniCommand = 'toggle' | 'next' | 'prev' | 'show-main'

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
  mini: {
    toggle(): void
    pushState(state: MiniState): void
    onState(cb: (s: MiniState) => void): () => void
    command(cmd: MiniCommand): void
    onCommand(cb: (cmd: MiniCommand) => void): () => void
    onOpenChange(cb: (open: boolean) => void): () => void
  }
  showInFolder(path: string): void
  pathForFile(file: File): string
  isMini: boolean
}
