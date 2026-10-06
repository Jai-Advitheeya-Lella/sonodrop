import { engine } from '@/audio/engine'
import { syncSound } from '@/lib/sound'
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
  const { store, library, audio, widgets } = window.sono
  const [settings, user, session, position, snapshot, caps, output, openWidgets] = await Promise.all([
    store.get<Partial<Settings>>('settings'),
    store.get<Partial<UserData>>('user'),
    store.get<Partial<Session>>('session'),
    store.get<number>('position'),
    library.get(),
    audio.capabilities(),
    audio.output(),
    widgets.open()
  ])
  useUi.getState().hydrate(settings)
  useUi.setState({ caps, output, openWidgets })
  useUser.getState().hydrate(user)
  useLibrary.getState().setTracks(snapshot.tracks, snapshot.folders)
  // The engine needs its equaliser and sample rate before the first track is loaded.
  syncSound()
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

  audio.onOutputChange((device) => {
    const before = useUi.getState().output
    useUi.setState({ output: device })
    if (device && before && device.name !== before.name) useUi.getState().toast(`Now playing through ${device.description}`)
  })
  // The main process does the looking up; it needs to know whether it may.
  window.sono.online.setEnabled(useUi.getState().onlineLookup)
  useUi.subscribe((state, prev) => {
    if (state.onlineLookup !== prev.onlineLookup) window.sono.online.setEnabled(state.onlineLookup)
  })

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
