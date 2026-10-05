import { create } from 'zustand'
import type { IconName } from '@/components/Icon'
import type { AlbumSort, ArtistSort, SongSort, SortState } from '@/lib/sort'
import { DEFAULT_THEME } from '@/themes'

export type Route =
  | { name: 'home' }
  | { name: 'library' }
  | { name: 'search' }
  | { name: 'liked' }
  | { name: 'settings' }
  | { name: 'album'; id: string }
  | { name: 'artist'; id: string }
  | { name: 'playlist'; id: string }

export type LibraryTab = 'songs' | 'albums' | 'artists'
export type Quality = 'auto' | 'high' | 'medium' | 'low'

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
  sort: { songs: SortState<SongSort>; albums: SortState<AlbumSort>; artists: SortState<ArtistSort> }
  widgets: { order: string[]; hidden: string[] }
}

export const DEFAULT_SETTINGS: Settings = {
  themeId: DEFAULT_THEME,
  quality: 'auto',
  ambient: true,
  splashes: true,
  libraryTab: 'albums',
  sort: {
    songs: { by: 'title', dir: 'asc' },
    albums: { by: 'dateAdded', dir: 'desc' },
    artists: { by: 'name', dir: 'asc' }
  },
  widgets: { order: [], hidden: [] }
}

interface UiState extends Settings {
  history: Route[]
  cursor: number
  route: Route
  query: string
  queueOpen: boolean
  nowPlayingOpen: boolean
  miniOpen: boolean
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
  miniOpen: false,
  menu: null,
  toasts: [],
  hydrate: (settings) =>
    set({
      ...settings,
      sort: { ...DEFAULT_SETTINGS.sort, ...settings?.sort },
      widgets: { ...DEFAULT_SETTINGS.widgets, ...settings?.widgets }
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
  sort: s.sort,
  widgets: s.widgets
})
