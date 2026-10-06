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
  /** Channels in the file: 2 for stereo, 6 for 5.1 … */
  channels: number | null
  /** The built-in decoder can play this file as it is; otherwise it goes through ffmpeg first. */
  native: boolean
  /** Title or artist came from the file/folder name because the tags were missing. */
  guessed: boolean
  /** Details or artwork were filled in from an online lookup. */
  online?: boolean
  coverId: string | null
  /** ms since epoch */
  dateAdded: number
  mtime: number
  size: number
}

/** Bump when the scanner starts recording something new; existing libraries are then re-read on next launch. */
export const LIBRARY_VERSION = 3

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
  /** 'online' is the lookup of missing details and artwork that follows a scan. */
  phase: 'listing' | 'reading' | 'online' | 'done'
  done: number
  total: number
  added?: number
}

/** The sound device the system is currently playing through. */
export interface OutputDevice {
  name: string
  description: string
  channels: number
  /** One PulseAudio/PipeWire position name per channel, e.g. front-left, lfe, rear-right. */
  map: string[]
  rate: number
}

export interface AudioCapabilities {
  /** ffmpeg is installed: formats the built-in decoder can't read will play. */
  decode: boolean
  /** …and it has the SoX resampler. */
  resample: boolean
  /** A way to send more than two channels (or a non-device sample rate) straight to the sound server. */
  direct: boolean
}

/** What the renderer asks the main process to open for direct output. */
export interface SinkSpec {
  rate: number
  channels: number
  map: string[]
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
    capabilities(): Promise<AudioCapabilities>
    /** Start converting a track ahead of time so it is ready when its turn comes. `rate` 0 keeps its own. */
    prepare(trackId: string, rate: number): void
    output(): Promise<OutputDevice | null>
    onOutputChange(cb: (device: OutputDevice | null) => void): () => void
    /**
     * Close the direct output. (It is opened by posting `{ sonoSink: SinkSpec }` to the window together with the
     * MessagePort the audio thread writes to — ports can't cross this bridge as arguments.)
     */
    closeSink(): void
  }
  online: {
    /** Allow or forbid looking up missing details and artwork on the internet. */
    setEnabled(enabled: boolean): void
    /** Look again now, including for things that weren't found before. */
    retry(): void
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
