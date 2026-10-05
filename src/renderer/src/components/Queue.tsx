import { useEffect, useRef, useState } from 'react'
import { formatTime } from '@/lib/format'
import { useLibrary } from '@/stores/library'
import { usePlayer } from '@/stores/player'
import { useUi } from '@/stores/ui'
import { IconButton } from './Controls'
import { Cover } from './Cover'
import { trackMenu } from './menus'

const SHOWN = 150

/** Slide-in drawer: what's playing and what's next. Drag rows to reorder, click to jump. */
export function QueuePanel(): React.JSX.Element {
  const open = useUi((s) => s.queueOpen)
  const tall = useUi((s) => s.nowPlayingOpen)
  // Keep the rows around until the drawer has finished sliding away.
  const [rendered, setRendered] = useState(open)
  useEffect(() => {
    if (open) return setRendered(true)
    const timer = setTimeout(() => setRendered(false), 400)
    return () => clearTimeout(timer)
  }, [open])

  return (
    <aside className={`queue panel ${open ? 'open' : ''} ${tall ? 'tall' : ''}`} aria-hidden={!open} inert={!open}>
      {rendered && <QueueContent />}
    </aside>
  )
}

function QueueContent(): React.JSX.Element {
  const queue = usePlayer((s) => s.queue)
  const index = usePlayer((s) => s.index)
  const byId = useLibrary((s) => s.byId)
  const player = usePlayer.getState()
  const dragFrom = useRef<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  const current = byId.get(queue[index])
  const upcoming = queue.slice(index + 1, index + 1 + SHOWN)
  const hidden = queue.length - index - 1 - upcoming.length

  const row = (id: string, at: number, isCurrent: boolean): React.JSX.Element | null => {
    const track = byId.get(id)
    if (!track) return null
    return (
      <div
        key={`${id}:${at}`}
        className={`queue-row ${isCurrent ? 'current' : ''} ${over === at ? 'over' : ''}`}
        draggable={!isCurrent}
        onDragStart={(e) => {
          dragFrom.current = at
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', id)
        }}
        onDragOver={(e) => {
          if (dragFrom.current === null || isCurrent) return
          e.preventDefault()
          setOver(at)
        }}
        onDragEnd={() => {
          dragFrom.current = null
          setOver(null)
        }}
        onDrop={(e) => {
          e.preventDefault()
          if (dragFrom.current !== null) player.move(dragFrom.current, at)
          dragFrom.current = null
          setOver(null)
        }}
        onClick={() => !isCurrent && player.jump(at)}
        onContextMenu={(e) => useUi.getState().openMenu(e, trackMenu(track))}
        role="button"
      >
        <Cover id={track.coverId} title={track.album} />
        <div className="queue-meta">
          <span>{track.title}</span>
          <small>{track.artist}</small>
        </div>
        <span className="time">{formatTime(track.duration)}</span>
        {!isCurrent && (
          <IconButton
            icon="close"
            label="Remove from queue"
            size={14}
            onClick={(e) => {
              e.stopPropagation()
              player.removeAt(at)
            }}
          />
        )}
      </div>
    )
  }

  return (
    <>
      <header className="queue-head">
        <h2>Queue</h2>
        <IconButton icon="close" label="Close queue" onClick={() => useUi.setState({ queueOpen: false })} />
      </header>
      <div className="queue-scroll">
        {current ? (
          <>
            <h3>Now playing</h3>
            {row(current.id, index, true)}
            <h3>
              Next up
              {upcoming.length > 0 && <small>{(queue.length - index - 1).toLocaleString()}</small>}
            </h3>
            {upcoming.length === 0 && <p className="queue-empty">Nothing after this. Right-click a song and choose “Add to queue”.</p>}
            {upcoming.map((id, i) => row(id, index + 1 + i, false))}
            {hidden > 0 && <p className="queue-empty">…and {hidden.toLocaleString()} more</p>}
          </>
        ) : (
          <p className="queue-empty">The queue is dry. Play something to fill it.</p>
        )}
      </div>
    </>
  )
}
