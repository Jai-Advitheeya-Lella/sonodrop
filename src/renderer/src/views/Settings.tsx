import { IconButton } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { changeTheme } from '@/lib/actions'
import { plural } from '@/lib/format'
import { useLibrary } from '@/stores/library'
import { useUi, type Quality } from '@/stores/ui'
import { THEMES } from '@/themes'
import { WIDGETS } from '@/widgets/registry'

const QUALITIES: [Quality, string, string][] = [
  ['auto', 'Auto', 'Keeps the frame rate smooth by trading resolution'],
  ['high', 'High', 'Full resolution, always'],
  ['medium', 'Medium', 'Softer liquid, lighter on the GPU'],
  ['low', 'Low', 'For integrated graphics and battery']
]

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause'],
  ['Ctrl ← / →', 'Previous / next'],
  ['← / →', 'Seek 5 s (Shift: 30 s)'],
  ['↑ / ↓', 'Volume'],
  ['M', 'Mute'],
  ['S', 'Shuffle'],
  ['R', 'Repeat'],
  ['L', 'Like current song'],
  ['Q', 'Queue'],
  ['N', 'Now Playing'],
  ['Ctrl K', 'Search'],
  ['Alt ← / →', 'Back / forward']
]

function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange(v: boolean): void }): React.JSX.Element {
  return (
    <button className="toggle-row" role="switch" aria-checked={value} onClick={() => onChange(!value)}>
      <span>
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      <span className="toggle">
        <i />
      </span>
    </button>
  )
}

export function Settings(): React.JSX.Element {
  const ui = useUi()
  const folders = useLibrary((s) => s.folders)
  const count = useLibrary((s) => s.tracks.length)
  const scanning = useLibrary((s) => s.scan !== null && s.scan.phase !== 'done')
  const { library } = window.sono

  return (
    <div className="view settings">
      <header className="view-head">
        <div>
          <p className="kicker">Make it yours</p>
          <h1>Themes &amp; Settings</h1>
        </div>
      </header>

      <h2 className="section">Themes</h2>
      <div className="themes">
        {THEMES.map((theme, i) => (
          <button
            key={theme.id}
            className={`theme ${ui.themeId === theme.id ? 'on' : ''}`}
            style={{ '--i': i, '--t-bg': theme.bg, '--t-panel': theme.panel, '--t-text': theme.text, '--t-a': theme.accent[0], '--t-b': theme.accent[1], '--t-c': theme.accent[2] } as React.CSSProperties}
            onClick={() => changeTheme(theme.id)}
            aria-pressed={ui.themeId === theme.id}
          >
            <span className="theme-swatch" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <strong>{theme.name}</strong>
            <small>{theme.tagline}</small>
            {ui.themeId === theme.id && (
              <span className="theme-check">
                <Icon name="check" size={14} />
              </span>
            )}
          </button>
        ))}
      </div>

      <h2 className="section">Motion</h2>
      <div className="setting-card">
        <div className="segmented" role="radiogroup" aria-label="Graphics quality">
          {QUALITIES.map(([id, label]) => (
            <button key={id} role="radio" aria-checked={ui.quality === id} onClick={() => ui.patch({ quality: id })}>
              {label}
            </button>
          ))}
        </div>
        <p className="hint">{QUALITIES.find(([id]) => id === ui.quality)?.[2]}.</p>
        <Toggle label="Living background" hint="The slow liquid behind everything" value={ui.ambient} onChange={(ambient) => ui.patch({ ambient })} />
        <Toggle label="Splashes" hint="Droplets when you press things" value={ui.splashes} onChange={(splashes) => ui.patch({ splashes })} />
      </div>

      <h2 className="section">Music folders</h2>
      <div className="setting-card">
        {folders.length === 0 && <p className="hint">No folders yet. Add one, or drag folders and files onto the window.</p>}
        {folders.map((folder) => (
          <div key={folder} className="folder-row">
            <Icon name="folder" size={18} />
            <span>{folder}</span>
            <IconButton icon="trash" label="Stop watching this folder" onClick={() => void library.removeFolder(folder)} />
          </div>
        ))}
        <div className="row-actions">
          <button className="pill primary" onClick={() => void library.chooseFolders()}>
            <Icon name="plus" size={15} />
            Add folder
          </button>
          <button className="pill" disabled={scanning} onClick={() => void library.rescan()}>
            <Icon name="refresh" size={15} />
            {scanning ? 'Scanning…' : 'Rescan'}
          </button>
          <span className="hint">{plural(count, 'song')} in the library. Folders are rescanned every launch.</span>
        </div>
      </div>

      <h2 className="section">Widgets</h2>
      <div className="setting-card">
        <div className="row-actions">
          <button className="pill" onClick={() => window.sono.mini.toggle()}>
            <Icon name="mini" size={15} />
            {ui.miniOpen ? 'Close the mini player' : 'Open the mini player'}
          </button>
          <span className="hint">A small floating player that stays on top of other windows.</span>
        </div>
        <div className="chip-row">
          {WIDGETS.map((w) => {
            const hidden = ui.widgets.hidden.includes(w.id)
            return (
              <button
                key={w.id}
                className={`pill ${hidden ? '' : 'on'}`}
                aria-pressed={!hidden}
                onClick={() => ui.patch({ widgets: { ...ui.widgets, hidden: hidden ? ui.widgets.hidden.filter((x) => x !== w.id) : [...ui.widgets.hidden, w.id] } })}
              >
                <Icon name={hidden ? 'plus' : 'check'} size={14} />
                {w.name}
              </button>
            )
          })}
        </div>
        <p className="hint">These live on Home. Rearrange them there with Customize.</p>
      </div>

      <h2 className="section">Keyboard</h2>
      <div className="setting-card shortcuts">
        {SHORTCUTS.map(([keys, what]) => (
          <div key={keys}>
            <kbd>{keys}</kbd>
            <span>{what}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
