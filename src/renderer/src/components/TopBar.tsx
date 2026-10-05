import { useUi } from '@/stores/ui'
import { IconButton } from './Controls'
import { Icon } from './Icon'

/** So keyboard shortcuts can focus the search field from anywhere. */
export const searchField: { current: HTMLInputElement | null } = { current: null }

export function TopBar(): React.JSX.Element {
  const query = useUi((s) => s.query)
  const canBack = useUi((s) => s.cursor > 0)
  const canForward = useUi((s) => s.cursor < s.history.length - 1)
  const ui = useUi.getState()
  return (
    <header className="topbar">
      <IconButton icon="back" label="Back" disabled={!canBack} onClick={ui.back} />
      <IconButton icon="forward" label="Forward" disabled={!canForward} onClick={ui.forward} />
      <label className="search">
        <Icon name="search" size={17} />
        <input
          ref={(el) => void (searchField.current = el)}
          type="text"
          placeholder="Search songs, albums, artists, files…"
          spellCheck={false}
          value={query}
          onChange={(e) => ui.setQuery(e.target.value)}
          onFocus={() => query.trim() && ui.go({ name: 'search' })}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return
            ui.setQuery('')
            e.currentTarget.blur()
          }}
        />
        {query ? (
          <button className="icon-btn" aria-label="Clear search" onClick={() => (ui.setQuery(''), searchField.current?.focus())}>
            <Icon name="close" size={14} />
          </button>
        ) : (
          <kbd>Ctrl K</kbd>
        )}
      </label>
    </header>
  )
}
