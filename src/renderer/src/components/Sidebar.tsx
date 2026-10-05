import { useLibrary } from '@/stores/library'
import { usePlayer } from '@/stores/player'
import { useUi, type Route } from '@/stores/ui'
import { useUser } from '@/stores/user'
import { Icon, type IconName } from './Icon'

const NAV: { route: Route; label: string; icon: IconName }[] = [
  { route: { name: 'home' }, label: 'Home', icon: 'home' },
  { route: { name: 'library' }, label: 'Library', icon: 'library' },
  { route: { name: 'liked' }, label: 'Liked Songs', icon: 'heart' },
  { route: { name: 'settings' }, label: 'Themes & Settings', icon: 'settings' }
]

/** Which nav entry owns the current route (-1: none of them). */
function activeIndex(route: Route): number {
  if (route.name === 'album' || route.name === 'artist') return 1
  return NAV.findIndex((n) => n.route.name === route.name)
}

function ScanStatus(): React.JSX.Element | null {
  const scan = useLibrary((s) => s.scan)
  if (!scan || scan.phase === 'done') return null
  const fraction = scan.total > 0 ? scan.done / scan.total : 0
  return (
    <div className="scan" role="status">
      <div className="scan-drop">
        <i style={{ transform: `translateY(${(1 - fraction) * 100}%)` }} />
      </div>
      <div className="scan-text">
        <strong>{scan.phase === 'listing' ? 'Looking for music…' : 'Pouring in your library'}</strong>
        {scan.total > 0 && (
          <span>
            {scan.done.toLocaleString()} / {scan.total.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  )
}

export function Sidebar(): React.JSX.Element {
  const route = useUi((s) => s.route)
  const go = useUi((s) => s.go)
  const playlists = useUser((s) => s.playlists)
  const active = activeIndex(route)

  return (
    <aside className="sidebar panel">
      <div className="brand">
        <span className="brand-drop">
          <Icon name="drop" size={22} fill />
        </span>
        sonodrop
      </div>

      <nav className="nav" style={{ '--at': Math.max(0, active) } as React.CSSProperties} data-none={active < 0 || undefined}>
        <div className="nav-goo" aria-hidden>
          <i className="nav-blob lead" />
          <i className="nav-blob trail" />
        </div>
        {NAV.map((item, i) => (
          <button key={item.label} className="nav-item" aria-current={i === active ? 'page' : undefined} onClick={() => go(item.route)}>
            <Icon name={item.icon} size={19} fill={item.icon === 'heart' && i === active} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="side-head">
        Playlists
        <button
          className="icon-btn"
          aria-label="New playlist"
          title="New playlist"
          onClick={() => go({ name: 'playlist', id: useUser.getState().createPlaylist().id })}
        >
          <Icon name="plus" size={16} />
        </button>
      </div>
      <div className="playlists">
        {playlists.length === 0 && <p className="side-empty">Right-click any song or album to start a playlist.</p>}
        {playlists.map((p) => (
          <button
            key={p.id}
            className="playlist-item"
            aria-current={route.name === 'playlist' && route.id === p.id ? 'page' : undefined}
            onClick={() => go({ name: 'playlist', id: p.id })}
            onContextMenu={(e) =>
              useUi.getState().openMenu(e, [
                { label: 'Play', icon: 'play', disabled: p.trackIds.length === 0, action: () => usePlayer.getState().playTracks(p.trackIds) },
                { label: 'Shuffle', icon: 'shuffle', disabled: p.trackIds.length === 0, action: () => usePlayer.getState().shufflePlay(p.trackIds) },
                { label: '', separator: true },
                {
                  label: 'Delete playlist',
                  icon: 'trash',
                  danger: true,
                  action: () => {
                    useUser.getState().deletePlaylist(p.id)
                    if (route.name === 'playlist' && route.id === p.id) go({ name: 'library' })
                  }
                }
              ])
            }
          >
            <Icon name="playlist" size={16} />
            <span>{p.name}</span>
            <small>{p.trackIds.length}</small>
          </button>
        ))}
      </div>

      <ScanStatus />
    </aside>
  )
}
