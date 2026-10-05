import { engine } from '@/audio/engine'
import { useLibrary } from '@/stores/library'
import { sessionOf, usePlayer, type Session } from '@/stores/player'
import { settingsOf, useUi, type Settings } from '@/stores/ui'
import { useUser, type UserData } from '@/stores/user'

const timers = new Map<string, number>()

function save(key: string, value: () => unknown, delay = 500): void {
  clearTimeout(timers.get(key))
  timers.set(
    key,
    window.setTimeout(() => window.sono.store.set(key, value()), delay)
  )
}

/** Load everything from disk into the stores, then keep disk in step with them. */
export async function hydrate(): Promise<void> {
  const { store, library } = window.sono
  const [settings, user, session, position, snapshot] = await Promise.all([
    store.get<Partial<Settings>>('settings'),
    store.get<Partial<UserData>>('user'),
    store.get<Partial<Session>>('session'),
    store.get<number>('position'),
    library.get()
  ])
  useUi.getState().hydrate(settings)
  useUser.getState().hydrate(user)
  useLibrary.getState().setTracks(snapshot.tracks, snapshot.folders)
  usePlayer.getState().restore(session, position ?? 0)

  let lastSettings = JSON.stringify(settingsOf(useUi.getState()))
  useUi.subscribe((state) => {
    const json = JSON.stringify(settingsOf(state))
    if (json === lastSettings) return
    lastSettings = json
    save('settings', () => settingsOf(useUi.getState()))
  })

  useUser.subscribe((state, prev) => {
    if (state.liked === prev.liked && state.playlists === prev.playlists && state.history === prev.history) return
    save('user', () => {
      const { liked, playlists, history, plays } = useUser.getState()
      return { liked, playlists, history, plays }
    })
  })

  usePlayer.subscribe((state, prev) => {
    const changed =
      state.queue !== prev.queue ||
      state.order !== prev.order ||
      state.index !== prev.index ||
      state.volume !== prev.volume ||
      state.muted !== prev.muted ||
      state.shuffle !== prev.shuffle ||
      state.repeat !== prev.repeat
    if (changed) save('session', () => sessionOf(usePlayer.getState()), 800)
    if (state.playing !== prev.playing || state.currentId !== prev.currentId) store.set('position', engine.el.currentTime)
  })
  window.setInterval(() => {
    if (!engine.el.paused) store.set('position', engine.el.currentTime)
  }, 5000)

  library.onUpdated((next) => useLibrary.getState().setTracks(next.tracks, next.folders))
  library.onProgress((progress) => {
    useLibrary.getState().setScan(progress)
    if (progress.phase !== 'done') return
    if (progress.added) useUi.getState().toast(`Poured in ${progress.added.toLocaleString()} new ${progress.added === 1 ? 'song' : 'songs'}`)
    window.setTimeout(() => {
      if (useLibrary.getState().scan?.phase === 'done') useLibrary.getState().setScan(null)
    }, 900)
  })
}
