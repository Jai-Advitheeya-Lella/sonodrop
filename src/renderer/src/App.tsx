import { useEffect, useState } from 'react'
import { widgetById } from '@shared/widgets'
import { engine } from '@/audio/engine'
import { feed, levels } from '@/audio/levels'
import { NowPlaying } from '@/components/NowPlaying'
import { ContextMenu, DropOverlay, Toasts } from '@/components/Overlays'
import { PlayerBar } from '@/components/Player'
import { QueuePanel } from '@/components/Queue'
import { Sidebar } from '@/components/Sidebar'
import { searchField, TopBar } from '@/components/TopBar'
import { ScrollContext } from '@/components/TrackList'
import { AmbientLiquid } from '@/fluid/AmbientLiquid'
import { attachCurtain } from '@/fluid/curtain'
import { GooDefs } from '@/fluid/Goo'
import { SplashLayer } from '@/fluid/SplashLayer'
import { extractPalette } from '@/lib/color'
import { clamp, coverUrl, quality } from '@/lib/format'
import { useCurrentTrack } from '@/lib/hooks'
import { onFrame } from '@/lib/ticker'
import { trackById } from '@/stores/library'
import { usePlayer } from '@/stores/player'
import { useUi, type Route } from '@/stores/ui'
import { useUser } from '@/stores/user'
import { applyTheme, themeById } from '@/themes'
import { AlbumView, ArtistView, PlaylistView } from '@/views/Detail'
import { Home } from '@/views/Home'
import { LibraryView } from '@/views/Library'
import { SearchView } from '@/views/Search'
import { Settings } from '@/views/Settings'
import { Sound } from '@/views/Sound'

function View({ route }: { route: Route }): React.JSX.Element {
  switch (route.name) {
    case 'home':
      return <Home />
    case 'library':
      return <LibraryView />
    case 'search':
      return <SearchView />
    case 'liked':
      return <PlaylistView />
    case 'settings':
      return <Settings />
    case 'sound':
      return <Sound />
    case 'album':
      return <AlbumView id={route.id} />
    case 'artist':
      return <ArtistView id={route.id} />
    case 'playlist':
      return <PlaylistView id={route.id} />
  }
}

/** Keep the CSS variables and shader palette in step with the chosen theme (and, for Chameleon, the artwork). */
function useThemeSync(): void {
  const themeId = useUi((s) => s.themeId)
  const coverId = useCurrentTrack()?.coverId ?? null
  useEffect(() => {
    const theme = themeById(themeId)
    if (!theme.dynamic || !coverId) return applyTheme(theme)
    let cancelled = false
    void extractPalette(coverUrl(coverId)!).then((colors) => !cancelled && applyTheme(theme, colors ?? theme.accent))
    return () => {
      cancelled = true
    }
  }, [themeId, coverId])
}

function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const ui = useUi.getState()
      const player = usePlayer.getState()
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        useUi.setState({ nowPlayingOpen: false })
        searchField.current?.focus()
        searchField.current?.select()
        return
      }
      if (e.key === 'Escape' && !typing) {
        if (ui.queueOpen) useUi.setState({ queueOpen: false })
        else if (ui.nowPlayingOpen) useUi.setState({ nowPlayingOpen: false })
        return
      }
      if (typing) return
      if (e.altKey && e.key === 'ArrowLeft') return ui.back()
      if (e.altKey && e.key === 'ArrowRight') return ui.forward()
      if (e.altKey || e.metaKey) return

      const ctrl = e.ctrlKey
      const handled = ((): boolean => {
        switch (e.key) {
          case ' ':
            // Let a focused button keep its own Space behaviour.
            if (e.target instanceof HTMLButtonElement) return false
            player.toggle()
            return true
          case 'ArrowRight':
            if (ctrl) player.next()
            else player.seek(engine.el.currentTime + (e.shiftKey ? 30 : 5))
            return true
          case 'ArrowLeft':
            if (ctrl) player.prev()
            else player.seek(engine.el.currentTime - (e.shiftKey ? 30 : 5))
            return true
          case 'ArrowUp':
            player.setVolume(clamp(player.volume + 0.05, 0, 1))
            return true
          case 'ArrowDown':
            player.setVolume(clamp(player.volume - 0.05, 0, 1))
            return true
        }
        if (ctrl) return false
        switch (e.key.toLowerCase()) {
          case 'm':
            player.toggleMute()
            return true
          case 's':
            player.toggleShuffle()
            return true
          case 'r':
            player.cycleRepeat()
            return true
          case 'l':
            if (player.currentId) ui.toast(useUser.getState().toggleLike(player.currentId) ? 'Added to Liked Songs' : 'Removed from Liked Songs')
            return true
          case 'q':
            useUi.setState({ queueOpen: !ui.queueOpen })
            return true
          case 'n':
            useUi.setState({ nowPlayingOpen: !ui.nowPlayingOpen })
            return true
          case '/':
            searchField.current?.focus()
            return true
        }
        return false
      })()
      if (handled) e.preventDefault()
    }
    // Side buttons on the mouse.
    const onMouse = (e: MouseEvent): void => {
      if (e.button === 3) useUi.getState().back()
      if (e.button === 4) useUi.getState().forward()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mouseup', onMouse)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mouseup', onMouse)
    }
  }, [])
}

/** Keep the desktop widgets fed — track info on every change, live audio 30 times a second — and obey their buttons. */
function useWidgetBridge(): void {
  useEffect(() => {
    const { widgets } = window.sono
    const push = (): void => {
      const ui = useUi.getState()
      if (ui.openWidgets.length === 0) return
      const player = usePlayer.getState()
      const track = trackById(player.currentId)
      const root = document.documentElement.style
      widgets.pushState({
        trackId: track?.id ?? null,
        title: track?.title ?? 'Sonodrop',
        artist: track?.artist ?? 'Nothing playing',
        album: track?.album ?? '',
        coverId: track?.coverId ?? null,
        quality: track ? quality(track) : '',
        liked: !!track && useUser.getState().liked.includes(track.id),
        playing: player.playing,
        position: engine.el.currentTime,
        duration: player.duration,
        next: player.queue.slice(player.index + 1, player.index + 5).flatMap((id) => {
          const t = trackById(id)
          return t ? [{ title: t.title, artist: t.artist, coverId: t.coverId }] : []
        }),
        themeId: ui.themeId,
        accent: [root.getPropertyValue('--accent'), root.getPropertyValue('--accent-2'), root.getPropertyValue('--accent-3')],
        visualizer: ui.visualizer
      })
    }
    const offOpen = widgets.onOpenChange((open) => {
      useUi.setState({ openWidgets: open })
      push()
    })
    const offCommand = widgets.onCommand((command) => {
      const player = usePlayer.getState()
      if (command === 'toggle') player.toggle()
      else if (command === 'next') player.next()
      else if (command === 'prev') player.prev()
      else if (command === 'like' && player.currentId) useUser.getState().toggleLike(player.currentId)
    })
    const offPlayer = usePlayer.subscribe(push)
    const offUser = useUser.subscribe(push)
    const offUi = useUi.subscribe((state, prev) => {
      // Theme colours land in the DOM a moment after the setting changes.
      if (state.themeId !== prev.themeId || state.visualizer !== prev.visualizer) window.setTimeout(push, 60)
    })
    engine.on('seeked', push)
    const timer = window.setInterval(push, 1000)

    let since = 0
    const stopAudio = onFrame((dt) => {
      since += dt
      if (since < 1 / 30) return
      since = 0
      const wanted = useUi.getState().openWidgets.some((id) => widgetById(id)?.audio)
      if (wanted) widgets.pushAudio({ levels: [levels.bass, levels.mid, levels.treble, levels.level, levels.beat], feed: Array.from(feed) })
    })
    return () => {
      offOpen()
      offCommand()
      offPlayer()
      offUser()
      offUi()
      stopAudio()
      window.clearInterval(timer)
    }
  }, [])
}

export function App(): React.JSX.Element {
  const route = useUi((s) => s.route)
  const ambient = useUi((s) => s.ambient)
  const splashes = useUi((s) => s.splashes)
  const nowPlayingOpen = useUi((s) => s.nowPlayingOpen)
  const [scroller, setScroller] = useState<HTMLElement | null>(null)
  useThemeSync()
  useShortcuts()
  useWidgetBridge()

  // Once Now Playing has risen over everything, stop drawing the backdrop underneath it.
  const [covered, setCovered] = useState(false)
  useEffect(() => {
    if (!nowPlayingOpen) return setCovered(false)
    const timer = setTimeout(() => setCovered(true), 750)
    return () => clearTimeout(timer)
  }, [nowPlayingOpen])

  // A fresh scroller per page: scroll resets and the page animates in. Typing in search must not remount it.
  const pageKey = 'id' in route ? `${route.name}:${route.id}` : route.name

  return (
    <div className="app">
      {ambient && <AmbientLiquid paused={covered} />}
      <div className="shell" inert={nowPlayingOpen}>
        <Sidebar />
        <main className="main panel">
          <TopBar />
          <div className="scroller" key={pageKey} ref={setScroller}>
            <ScrollContext.Provider value={scroller}>
              <View route={route} />
            </ScrollContext.Provider>
          </div>
        </main>
        <PlayerBar />
      </div>
      <NowPlaying />
      <QueuePanel />
      <ContextMenu />
      <Toasts />
      <DropOverlay />
      {splashes && <SplashLayer />}
      <canvas className="curtain" ref={attachCurtain} aria-hidden />
      <GooDefs />
    </div>
  )
}
