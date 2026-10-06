import { create } from 'zustand'
import type { AudioCapabilities, OutputDevice } from '@shared/types'
import { EQ_FLAT, type EqSettings } from '@/audio/engine'
import { SPEAKER_DEFAULTS, type SpeakerSettings } from '@/audio/router'
import type { IconName } from '@/components/Icon'
import type { AlbumSort, ArtistSort, SongSort, SortState } from '@/lib/sort'
import { DEFAULT_THEME } from '@/themes'

export type Route =
  | { name: 'home' }
  | { name: 'library' }
  | { name: 'search' }
  | { name: 'liked' }
  | { name: 'settings' }
  | { name: 'sound' }
  | { name: 'album'; id: string }
  | { name: 'artist'; id: string }
  | { name: 'playlist'; id: string }

export type LibraryTab = 'songs' | 'albums' | 'artists'
export type Quality = 'auto' | 'high' | 'medium' | 'low'
export type AlbumView = 'grid' | 'record'
/** 'off': leave it to Chromium. 'device': SoX-convert straight to the device's rate. A number: that rate in Hz. */
export type Resample = 'off' | 'device' | number

export interface MenuItem {
  label: string
  icon?: IconName
  danger?: boolean
  separator?: boolean
  disabled?: boolean
  children?: MenuItem[]
  action?: () => void
}

export interface Toast {
  id: number
  text: string
}

/** The part of the UI state that is written to disk. */
export interface Settings {
  themeId: string
  quality: Quality
  ambient: boolean
  splashes: boolean
  libraryTab: LibraryTab
  albumView: AlbumView
  sort: { songs: SortState<SongSort>; albums: SortState<AlbumSort>; artists: SortState<ArtistSort> }
  visualizer: string
  eq: EqSettings
  resample: Resample
  speakers: SpeakerSettings
  /** Look up missing details and artwork on the internet. */
  onlineLookup: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  themeId: DEFAULT_THEME,
  quality: 'auto',
  ambient: true,
  splashes: true,
  libraryTab: 'albums',
  albumView: 'record',
  visualizer: 'ink',
  eq: EQ_FLAT,
  resample: 'off',
  speakers: SPEAKER_DEFAULTS,
  onlineLookup: true,
  sort: {
    songs: { by: 'title', dir: 'asc' },
    albums: { by: 'dateAdded', dir: 'desc' },
    artists: { by: 'name', dir: 'asc' }
  }
}

interface UiState extends Settings {
  history: Route[]
  cursor: number
  route: Route
  query: string
  queueOpen: boolean
  nowPlayingOpen: boolean
  /** Desktop widgets currently on screen. */
  openWidgets: string[]
  /** What the machine can do: decode extra formats, resample, output surround directly. */
  caps: AudioCapabilities
  /** The sound device the system is playing through, when it can be told. */
  output: OutputDevice | null
  menu: { x: number; y: number; items: MenuItem[] } | null
  toasts: Toast[]
  hydrate(settings: Partial<Settings> | undefined): void
  patch(settings: Partial<Settings>): void
  go(route: Route): void
  back(): void
  forward(): void
  setQuery(query: string): void
  openMenu(event: { clientX: number; clientY: number; preventDefault(): void }, items: MenuItem[]): void
  toast(text: string): void
}

const same = (a: Route, b: Route): boolean => JSON.stringify(a) === JSON.stringify(b)
let toastId = 0

export const useUi = create<UiState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  history: [{ name: 'home' }],
  cursor: 0,
  route: { name: 'home' },
  query: '',
  queueOpen: false,
  nowPlayingOpen: false,
  openWidgets: [],
  caps: { decode: false, resample: false, direct: false },
  output: null,
  menu: null,
  toasts: [],
  hydrate: (settings) =>
    set({
      ...settings,
      sort: { ...DEFAULT_SETTINGS.sort, ...settings?.sort },
      eq: { ...EQ_FLAT, ...settings?.eq },
      speakers: { ...SPEAKER_DEFAULTS, ...settings?.speakers }
    }),
  patch: (settings) => set(settings),
  go: (route) => {
    const { history, cursor, route: current } = get()
    if (same(route, current)) return set({ nowPlayingOpen: false })
    const next = [...history.slice(0, cursor + 1), route].slice(-60)
    // Leaving search puts the search field away too.
    set({ history: next, cursor: next.length - 1, route, nowPlayingOpen: false, ...(route.name === 'search' ? {} : { query: '' }) })
  },
  back: () => {
    const { history, cursor } = get()
    if (cursor > 0) set({ cursor: cursor - 1, route: history[cursor - 1] })
  },
  forward: () => {
    const { history, cursor } = get()
    if (cursor < history.length - 1) set({ cursor: cursor + 1, route: history[cursor + 1] })
  },
  setQuery: (query) => {
    set({ query })
    if (query.trim() && get().route.name !== 'search') get().go({ name: 'search' })
  },
  openMenu: (event, items) => {
    event.preventDefault()
    set({ menu: { x: event.clientX, y: event.clientY, items } })
  },
  toast: (text) => {
    const id = ++toastId
    set({ toasts: [...get().toasts.slice(-2), { id, text }] })
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 2600)
  }
}))

export const settingsOf = (s: UiState): Settings => ({
  themeId: s.themeId,
  quality: s.quality,
  ambient: s.ambient,
  splashes: s.splashes,
  libraryTab: s.libraryTab,
  albumView: s.albumView,
  sort: s.sort,
  visualizer: s.visualizer,
  eq: s.eq,
  resample: s.resample,
  speakers: s.speakers,
  onlineLookup: s.onlineLookup
})
