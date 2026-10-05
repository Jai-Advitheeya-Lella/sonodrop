import { create } from 'zustand'

export interface Playlist {
  id: string
  name: string
  trackIds: string[]
  createdAt: number
}

export interface UserData {
  /** Most recently liked first. */
  liked: string[]
  playlists: Playlist[]
  /** Most recently played first. */
  history: { id: string; at: number }[]
  plays: Record<string, number>
}

interface UserState extends UserData {
  hydrate(data: Partial<UserData> | undefined): void
  toggleLike(id: string): boolean
  createPlaylist(trackIds?: string[], name?: string): Playlist
  renamePlaylist(id: string, name: string): void
  deletePlaylist(id: string): void
  addToPlaylist(id: string, trackIds: string[]): void
  removeFromPlaylist(id: string, index: number): void
  recordPlay(id: string): void
}

export const useUser = create<UserState>((set, get) => ({
  liked: [],
  playlists: [],
  history: [],
  plays: {},
  hydrate: (data) => set({ ...data }),
  toggleLike: (id) => {
    const liked = get().liked
    const was = liked.includes(id)
    set({ liked: was ? liked.filter((x) => x !== id) : [id, ...liked] })
    return !was
  },
  createPlaylist: (trackIds = [], name) => {
    const playlists = get().playlists
    const playlist: Playlist = {
      id: crypto.randomUUID(),
      name: name ?? `Playlist ${playlists.length + 1}`,
      trackIds: [...new Set(trackIds)],
      createdAt: Date.now()
    }
    set({ playlists: [...playlists, playlist] })
    return playlist
  },
  renamePlaylist: (id, name) => set({ playlists: get().playlists.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)) }),
  deletePlaylist: (id) => set({ playlists: get().playlists.filter((p) => p.id !== id) }),
  addToPlaylist: (id, trackIds) =>
    set({ playlists: get().playlists.map((p) => (p.id === id ? { ...p, trackIds: [...new Set([...p.trackIds, ...trackIds])] } : p)) }),
  removeFromPlaylist: (id, index) =>
    set({ playlists: get().playlists.map((p) => (p.id === id ? { ...p, trackIds: p.trackIds.filter((_, i) => i !== index) } : p)) }),
  recordPlay: (id) => {
    const { history, plays } = get()
    set({
      history: [{ id, at: Date.now() }, ...history.filter((h) => h.id !== id)].slice(0, 200),
      plays: { ...plays, [id]: (plays[id] ?? 0) + 1 }
    })
  }
}))
