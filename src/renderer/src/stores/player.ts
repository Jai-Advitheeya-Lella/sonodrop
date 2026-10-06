import { create } from 'zustand'
import { deviceRate, engine } from '@/audio/engine'
import { coverUrl } from '@/lib/format'
import { trackById, useLibrary } from './library'
import { useUi } from './ui'
import { useUser } from './user'

export type Repeat = 'off' | 'all' | 'one'

export interface Session {
  queue: string[]
  order: string[]
  index: number
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: Repeat
}

interface PlayerState extends Session {
  currentId: string | null
  playing: boolean
  /** Waiting for audio: loading, seeking, or being resampled. */
  buffering: boolean
  duration: number
  /** Load the current track again where it is, after the engine or its settings changed. */
  reload(): void
  restore(session: Partial<Session> | undefined, position: number): void
  /** Replace the queue with these tracks and start at `start`. */
  playTracks(ids: string[], start?: number): void
  shufflePlay(ids: string[]): void
  toggle(): void
  next(auto?: boolean): void
  prev(): void
  seek(seconds: number): void
  jump(index: number): void
  setVolume(volume: number): void
  toggleMute(): void
  toggleShuffle(): void
  cycleRepeat(): void
  playNext(ids: string[]): void
  addToQueue(ids: string[]): void
  removeAt(index: number): void
  move(from: number, to: number): void
}

function shuffled<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

let counted = false
let failures = 0
let artworkUrl = ''

/** The rate tracks are SoX-resampled to (and the audio graph runs at), or null when resampling is off. */
export function resampleRate(): number | null {
  const { resample, canResample } = useUi.getState()
  if (resample === 'off' || !canResample) return null
  return resample === 'device' ? deviceRate() : resample
}

const mediaUrl = (id: string, rate: number | null): string => `sono://media/${id}${rate ? `?sr=${rate}` : ''}`

export const usePlayer = create<PlayerState>((set, get) => {
  /** Point the audio element at queue[index]. */
  function load(autoplay: boolean, position = 0): void {
    const { queue, index } = get()
    const track = trackById(queue[index])
    if (!track) return
    counted = false
    const rate = resampleRate()
    engine.setOutputRate(rate)
    engine.load(mediaUrl(track.id, rate))
    if (position > 0) engine.el.currentTime = position
    set({ currentId: track.id, duration: track.duration, buffering: autoplay })
    if (autoplay) void engine.play()
    // Get the next track resampled while this one plays, so the hand-over doesn't wait.
    if (rate && queue[index + 1]) window.sono.audio.prepare(queue[index + 1], rate)

    const describe = (artwork: MediaImage[]): void => {
      navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist, album: track.album, artwork })
    }
    describe([])
    // System media controls only take http/data/blob artwork, so hand them a blob copy of the cover.
    if (track.coverId) {
      void fetch(coverUrl(track.coverId)!)
        .then((res) => res.blob())
        .then((blob) => {
          if (get().currentId !== track.id) return
          URL.revokeObjectURL(artworkUrl)
          artworkUrl = URL.createObjectURL(blob)
          describe([{ src: artworkUrl, sizes: '480x480', type: blob.type }])
        })
        .catch(() => {})
    }
  }

  const known = (ids: string[]): string[] => {
    const { byId } = useLibrary.getState()
    return ids.filter((id) => byId.has(id))
  }

  return {
    queue: [],
    order: [],
    index: 0,
    volume: 0.8,
    muted: false,
    shuffle: false,
    repeat: 'off',
    currentId: null,
    playing: false,
    buffering: false,
    duration: 0,

    reload: () => {
      if (!get().currentId) return
      const position = engine.el.currentTime
      load(!engine.el.paused, position)
    },

    restore: (session, position) => {
      const queue = known(session?.queue ?? [])
      const wanted = session?.queue?.[session.index ?? 0]
      const index = Math.max(0, queue.indexOf(wanted ?? ''))
      set({
        queue,
        order: known(session?.order ?? queue),
        index,
        volume: session?.volume ?? 0.8,
        muted: session?.muted ?? false,
        shuffle: session?.shuffle ?? false,
        repeat: session?.repeat ?? 'off'
      })
      engine.setVolume(get().volume, get().muted)
      if (queue.length) load(false, queue[index] === wanted ? position : 0)
    },

    playTracks: (ids, start = 0) => {
      const order = known(ids)
      if (order.length === 0) return
      const first = Math.max(0, order.indexOf(ids[start]))
      if (get().shuffle) {
        set({ order, queue: [order[first], ...shuffled(order.filter((_, i) => i !== first))], index: 0 })
      } else {
        set({ order, queue: order, index: first })
      }
      load(true)
    },

    shufflePlay: (ids) => {
      set({ shuffle: true })
      get().playTracks(ids, Math.floor(Math.random() * ids.length))
    },

    toggle: () => {
      if (!get().currentId) {
        const all = useLibrary.getState().tracks.map((t) => t.id)
        if (all.length) get().playTracks(all, 0)
      } else if (engine.el.paused) void engine.play()
      else engine.pause()
    },

    next: (auto = false) => {
      const { queue, index, repeat } = get()
      if (queue.length === 0) return
      if (auto && repeat === 'one') {
        engine.el.currentTime = 0
        void engine.play()
      } else if (index + 1 < queue.length) {
        set({ index: index + 1 })
        load(true)
      } else {
        // End of the queue: wrap around, but only keep playing if asked to.
        set({ index: 0 })
        load(!auto || repeat === 'all')
      }
    },

    prev: () => {
      const { queue, index, repeat } = get()
      if (engine.el.currentTime > 3 || (index === 0 && repeat !== 'all')) {
        engine.el.currentTime = 0
      } else {
        set({ index: (index - 1 + queue.length) % queue.length })
        load(true)
      }
    },

    seek: (seconds) => {
      if (get().currentId) engine.el.currentTime = Math.max(0, Math.min(seconds, get().duration || seconds))
    },

    jump: (index) => {
      if (index < 0 || index >= get().queue.length) return
      set({ index })
      load(true)
    },

    setVolume: (volume) => {
      set({ volume, muted: false })
      engine.setVolume(volume, false)
    },

    toggleMute: () => {
      const muted = !get().muted
      set({ muted })
      engine.setVolume(get().volume, muted)
    },

    toggleShuffle: () => {
      const { shuffle, queue, order, index } = get()
      const current = queue[index]
      if (!shuffle) {
        const rest = queue.filter((_, i) => i !== index)
        set({ shuffle: true, queue: current ? [current, ...shuffled(rest)] : rest, index: 0 })
      } else {
        const inQueue = new Set(queue)
        const inOrder = new Set(order)
        const restored = [...order.filter((id) => inQueue.has(id)), ...queue.filter((id) => !inOrder.has(id))]
        set({ shuffle: false, queue: restored, index: Math.max(0, restored.indexOf(current)) })
      }
    },

    cycleRepeat: () => set({ repeat: get().repeat === 'off' ? 'all' : get().repeat === 'all' ? 'one' : 'off' }),

    playNext: (ids) => {
      const add = known(ids)
      const { queue, order, index, currentId } = get()
      if (add.length === 0) return
      if (queue.length === 0) return get().playTracks(add)
      const at = order.indexOf(currentId ?? '') + 1
      set({
        queue: [...queue.slice(0, index + 1), ...add, ...queue.slice(index + 1)],
        order: [...order.slice(0, at), ...add, ...order.slice(at)]
      })
    },

    addToQueue: (ids) => {
      const add = known(ids)
      const { queue, order } = get()
      if (add.length === 0) return
      if (queue.length === 0) return get().playTracks(add)
      set({ queue: [...queue, ...add], order: [...order, ...add] })
    },

    removeAt: (at) => {
      const { queue, order, index } = get()
      const id = queue[at]
      const nextQueue = queue.filter((_, i) => i !== at)
      const orderAt = order.indexOf(id)
      const nextOrder = order.filter((_, i) => i !== orderAt)
      if (at === index) {
        const wasPlaying = !engine.el.paused
        if (nextQueue.length === 0) {
          engine.pause()
          engine.el.removeAttribute('src')
          engine.el.load()
          set({ queue: [], order: [], index: 0, currentId: null, duration: 0 })
          return
        }
        set({ queue: nextQueue, order: nextOrder, index: Math.min(at, nextQueue.length - 1) })
        load(wasPlaying)
      } else {
        set({ queue: nextQueue, order: nextOrder, index: at < index ? index - 1 : index })
      }
    },

    move: (from, to) => {
      const { queue, index } = get()
      if (from === to || from < 0 || to < 0 || from >= queue.length || to >= queue.length) return
      const next = [...queue]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      const current = from === index ? to : from < index && to >= index ? index - 1 : from > index && to <= index ? index + 1 : index
      set({ queue: next, index: current })
    }
  }
})

// The audio element is the source of truth for transport state.
engine.on('play', () => {
  usePlayer.setState({ playing: true })
  navigator.mediaSession.playbackState = 'playing'
})
engine.on('pause', () => {
  usePlayer.setState({ playing: false, buffering: false })
  navigator.mediaSession.playbackState = 'paused'
})
engine.on('waiting', () => usePlayer.setState({ buffering: true }))
engine.on('playing', () => {
  failures = 0
  usePlayer.setState({ buffering: false })
})
engine.on('ended', () => usePlayer.getState().next(true))
engine.on('durationchange', () => {
  const { duration } = engine.el
  if (Number.isFinite(duration) && duration > 0) usePlayer.setState({ duration })
})
engine.on('timeupdate', () => {
  // Count a play once it has really been listened to.
  const { currentId, duration } = usePlayer.getState()
  if (!counted && currentId && engine.el.currentTime > Math.min(30, (duration || 60) / 2)) {
    counted = true
    useUser.getState().recordPlay(currentId)
  }
})
engine.on('error', () => {
  if (!engine.el.getAttribute('src')) return
  const { currentId, queue, index, next } = usePlayer.getState()
  useUi.getState().toast(`Can't play “${trackById(currentId)?.title ?? 'this file'}”`)
  failures++
  if (failures < 4 && index + 1 < queue.length) next()
  else usePlayer.setState({ playing: false, buffering: false })
})

const actions: [MediaSessionAction, () => void][] = [
  ['play', () => void engine.play()],
  ['pause', () => engine.pause()],
  ['previoustrack', () => usePlayer.getState().prev()],
  ['nexttrack', () => usePlayer.getState().next()]
]
for (const [action, handler] of actions) navigator.mediaSession.setActionHandler(action, handler)
navigator.mediaSession.setActionHandler('seekto', (e) => {
  if (e.seekTime != null) usePlayer.getState().seek(e.seekTime)
})

export const sessionOf = (s: PlayerState): Session => ({
  queue: s.queue,
  order: s.order,
  index: s.index,
  volume: s.volume,
  muted: s.muted,
  shuffle: s.shuffle,
  repeat: s.repeat
})
