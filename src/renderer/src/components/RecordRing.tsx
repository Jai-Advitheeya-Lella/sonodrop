import { useEffect, useRef, useState } from 'react'
import { clamp, plural } from '@/lib/format'
import { onFrame } from '@/lib/ticker'
import type { Album } from '@/stores/library'
import { usePlayer } from '@/stores/player'
import { useUi } from '@/stores/ui'
import { IconButton, PlayBlob } from './Controls'
import { Cover } from './Cover'
import { Icon } from './Icon'
import { albumMenu } from './menus'

/** Degrees between neighbours: fifteen sleeves make the full circle. */
const STEP = 24
/** Sleeves kept in the DOM either side of the one in front. */
const REACH = 7

/** Where the ring was left, so coming back from an album page lands on the same record. */
let remembered: string | null = null

/**
 * Record view: the albums stand on a horizontal ring, like a rack you can spin.
 * Scroll, drag, use the arrow keys or the scrubber; the record in front slides out of its sleeve.
 * Only the fifteen sleeves on the ring exist at any time, so a library of thousands turns as easily as one of ten.
 */
export function RecordRing({ albums }: { albums: Album[] }): React.JSX.Element {
  const stage = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const nodes = useRef(new Map<number, HTMLElement>())
  const last = albums.length - 1
  const start = Math.max(0, albums.findIndex((a) => a.id === remembered))
  const motion = useRef({ pos: start, target: start, front: -1 })
  const [centre, setCentre] = useState(start)
  const go = useUi((s) => s.go)

  const front = albums[clamp(centre, 0, last)]
  const playingHere = usePlayer((s) => s.playing && !!front && front.trackIds.includes(s.currentId ?? ''))
  const loadedHere = usePlayer((s) => !!front && front.trackIds.includes(s.currentId ?? ''))

  const turnTo = (index: number): void => {
    motion.current.target = clamp(index, 0, last)
  }

  useEffect(() => {
    const el = stage.current!
    let radius = 800
    const measure = new ResizeObserver(() => {
      // Sleeve size comes from CSS; the ring is sized so neighbours stand clear of each other.
      radius = (ring.current!.firstElementChild?.clientWidth ?? 260) * 3.3
      ring.current!.style.transform = `translateZ(${-radius}px) rotateX(-5deg)`
    })
    measure.observe(el)

    const stop = onFrame((dt) => {
      const m = motion.current
      m.target = clamp(m.target, 0, Math.max(0, albums.length - 1))
      m.pos += (m.target - m.pos) * Math.min(1, dt * 7)
      if (Math.abs(m.target - m.pos) < 0.0005) m.pos = m.target
      const nearest = Math.round(m.pos)
      if (nearest !== m.front) {
        m.front = nearest
        remembered = albums[nearest]?.id ?? null
        setCentre(nearest)
      }
      for (const [index, node] of nodes.current) {
        const angle = (index - m.pos) * STEP
        const behind = Math.abs(angle) > 90
        // Sleeves on the far side turn to face inwards, so you see covers all the way round.
        node.style.transform = `rotateY(${angle.toFixed(2)}deg) translateZ(${radius}px)${behind ? ' rotateY(180deg)' : ''}`
        node.style.opacity = (0.3 + 0.7 * (0.5 + 0.5 * Math.cos((angle * Math.PI) / 180)) ** 1.5).toFixed(3)
        node.classList.toggle('front', index === nearest)
      }
    })

    // One notch of the wheel, one record. Trackpads send many small deltas, so add them up.
    let travelled = 0
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      travelled += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      const steps = Math.trunc(travelled / 100)
      if (steps === 0) return
      travelled -= steps * 100
      motion.current.target = Math.round(motion.current.target) + steps
    }
    el.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      stop()
      measure.disconnect()
      el.removeEventListener('wheel', onWheel)
    }
  }, [albums])

  // Drag to spin; a quick flick carries on a little.
  const drag = useRef<{ x: number; from: number; moved: boolean; last: number; speed: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent): void => {
    if (e.button !== 0) return
    drag.current = { x: e.clientX, from: motion.current.target, moved: false, last: e.clientX, speed: 0 }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (!d) return
    if (!d.moved && Math.abs(e.clientX - d.x) > 6) {
      d.moved = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    if (!d.moved) return
    d.speed = e.clientX - d.last
    d.last = e.clientX
    turnTo(d.from - (e.clientX - d.x) / 170)
  }
  const onPointerUp = (): void => {
    const d = drag.current
    drag.current = null
    if (d?.moved) turnTo(Math.round(motion.current.target - d.speed / 14))
  }

  const play = (): void => {
    if (!front) return
    if (loadedHere) usePlayer.getState().toggle()
    else usePlayer.getState().playTracks(front.trackIds)
  }

  const visible: number[] = []
  for (let i = Math.max(0, centre - REACH); i <= Math.min(last, centre + REACH); i++) visible.push(i)

  return (
    <div className="ring-view">
      <div
        ref={stage}
        className="ring-stage"
        tabIndex={0}
        role="listbox"
        aria-label="Albums"
        aria-activedescendant={front ? `ring-${front.id}` : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') turnTo(Math.round(motion.current.target) + 1)
          else if (e.key === 'ArrowLeft') turnTo(Math.round(motion.current.target) - 1)
          else if (e.key === 'Home') turnTo(0)
          else if (e.key === 'End') turnTo(last)
          else if (e.key === 'Enter' && front) go({ name: 'album', id: front.id })
          else if (e.key === ' ') play()
          else return
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        <div ref={ring} className="ring">
          {visible.map((index) => {
            const album = albums[index]
            return (
              <div
                key={album.id}
                id={`ring-${album.id}`}
                ref={(node) => {
                  if (node) nodes.current.set(index, node)
                  else nodes.current.delete(index)
                }}
                className="ring-item"
                role="option"
                aria-selected={index === centre}
                aria-label={`${album.title} by ${album.artist}`}
                onClick={() => {
                  if (drag.current?.moved) return
                  if (index === centre) go({ name: 'album', id: album.id })
                  else turnTo(index)
                }}
                onContextMenu={(e) => useUi.getState().openMenu(e, albumMenu(album))}
              >
                <i className={`ring-disc ${index === centre && playingHere ? 'spinning' : ''}`} />
                <div className="ring-sleeve">
                  <Cover id={album.coverId} title={album.title} size={index === centre ? 'cover' : 'thumb'} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {front && (
        <div className="ring-info">
          <IconButton icon="back" label="Previous album" disabled={centre <= 0} onClick={() => turnTo(centre - 1)} />
          <div className="ring-text" key={front.id}>
            <h2>{front.title}</h2>
            <p>
              {front.artist}
              {front.year ? ` · ${front.year}` : ''} · {plural(front.trackIds.length, 'song')}
            </p>
            <div className="ring-actions">
              <PlayBlob playing={playingHere} onClick={play} />
              <button className="pill" onClick={() => go({ name: 'album', id: front.id })}>
                <Icon name="disc" size={15} />
                Open album
              </button>
              <button className="pill" onClick={() => usePlayer.getState().shufflePlay(front.trackIds)}>
                <Icon name="shuffle" size={15} />
                Shuffle
              </button>
            </div>
          </div>
          <IconButton icon="forward" label="Next album" disabled={centre >= last} onClick={() => turnTo(centre + 1)} />
        </div>
      )}

      <div className="ring-scrub">
        <input
          type="range"
          min={0}
          max={Math.max(0, last)}
          value={clamp(centre, 0, Math.max(0, last))}
          onChange={(e) => turnTo(Number(e.target.value))}
          aria-label="Jump through albums"
          style={{ '--at': last > 0 ? centre / last : 0 } as React.CSSProperties}
        />
        <span className="time">
          {centre + 1} / {albums.length}
        </span>
      </div>
    </div>
  )
}
