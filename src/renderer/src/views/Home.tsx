import { useRef, useState } from 'react'
import { IconButton } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { allTrackIds } from '@/components/menus'
import { greeting } from '@/lib/actions'
import { useLibrary } from '@/stores/library'
import { usePlayer } from '@/stores/player'
import { useUi } from '@/stores/ui'
import { orderedWidgets, WIDGETS } from '@/widgets/registry'
import { EmptyLibrary } from './parts'

export function Home(): React.JSX.Element {
  const hasMusic = useLibrary((s) => s.tracks.length > 0)
  const prefs = useUi((s) => s.widgets)
  const patch = useUi((s) => s.patch)
  const [editing, setEditing] = useState(false)
  const dragged = useRef<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  if (!hasMusic) return <EmptyLibrary />

  const all = orderedWidgets(prefs.order)
  const shown = all.filter((w) => !prefs.hidden.includes(w.id))
  const hidden = all.filter((w) => prefs.hidden.includes(w.id))
  const player = usePlayer.getState()

  const moveBefore = (id: string, target: string): void => {
    if (id === target) return
    const order = all.map((w) => w.id).filter((x) => x !== id)
    order.splice(order.indexOf(target), 0, id)
    patch({ widgets: { ...prefs, order } })
  }
  const setHidden = (id: string, hide: boolean): void =>
    patch({ widgets: { ...prefs, hidden: hide ? [...prefs.hidden, id] : prefs.hidden.filter((x) => x !== id) } })

  return (
    <div className="view home">
      <header className="view-head">
        <div>
          <p className="kicker">{greeting()}</p>
          <h1>Let it pour.</h1>
        </div>
        <div className="head-actions">
          <button className="pill primary" onClick={() => player.playTracks(allTrackIds())}>
            <Icon name="play" size={15} />
            Play everything
          </button>
          <button className="pill" onClick={() => player.shufflePlay(allTrackIds())}>
            <Icon name="shuffle" size={15} />
            Shuffle
          </button>
          <button className={`pill ${editing ? 'on' : ''}`} onClick={() => setEditing(!editing)}>
            <Icon name={editing ? 'check' : 'settings'} size={15} />
            {editing ? 'Done' : 'Customize'}
          </button>
        </div>
      </header>

      {editing && (
        <div className="widget-tray">
          <span>Drag widgets to rearrange. </span>
          {hidden.length > 0 && <span>Hidden:</span>}
          {hidden.map((w) => (
            <button key={w.id} className="pill" onClick={() => setHidden(w.id, false)}>
              <Icon name="plus" size={14} />
              {w.name}
            </button>
          ))}
          {prefs.order.length + prefs.hidden.length > 0 && (
            <button className="pill" onClick={() => patch({ widgets: { order: [], hidden: [] } })}>
              <Icon name="refresh" size={14} />
              Reset
            </button>
          )}
        </div>
      )}

      <div className={`widgets ${editing ? 'editing' : ''}`}>
        {shown.map((w, i) => (
          <section
            key={w.id}
            className={`widget panel c${w.cols} r${w.rows} ${over === w.id ? 'over' : ''}`}
            style={{ '--i': i } as React.CSSProperties}
            draggable={editing}
            onDragStart={(e) => {
              dragged.current = w.id
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', w.id)
            }}
            onDragOver={(e) => {
              if (!dragged.current) return
              e.preventDefault()
              setOver(w.id)
            }}
            onDragEnd={() => {
              dragged.current = null
              setOver(null)
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (dragged.current) moveBefore(dragged.current, w.id)
              dragged.current = null
              setOver(null)
            }}
          >
            <header className="widget-head">
              <h3>{w.name}</h3>
              {editing && <IconButton icon="close" label={`Hide ${w.name}`} size={14} onClick={() => setHidden(w.id, true)} />}
            </header>
            <div className="widget-body">
              <w.component />
            </div>
          </section>
        ))}
      </div>
      {shown.length === 0 && <p className="hint">Every widget is hidden. Hit Customize to bring some back ({WIDGETS.length} available).</p>}
    </div>
  )
}
