import { useEffect, useRef } from 'react'
import { engine, levels } from '@/audio/engine'
import { clamp, formatTime, quality } from '@/lib/format'
import { useCurrentTrack, useFrame, useSlider } from '@/lib/hooks'
import { onFrame } from '@/lib/ticker'
import { artistId } from '@/stores/library'
import { usePlayer } from '@/stores/player'
import { useUi } from '@/stores/ui'
import { useUser } from '@/stores/user'
import { palette } from '@/themes'
import { IconButton, PlayBlob } from './Controls'
import { Cover } from './Cover'
import { Icon } from './Icon'
import { trackMenu } from './menus'

const css = (c: readonly number[]): string => `rgb(${c.map((v) => Math.round(v * 255)).join(' ')})`

/** Playback position as a fraction, straight from the audio element. */
function progress(): number {
  const { duration } = usePlayer.getState()
  return duration > 0 ? clamp(engine.el.currentTime / duration, 0, 1) : 0
}

/**
 * The seek line along the top edge of the player bar: a thread of liquid with a bead at the playhead
 * that lets drops fall into the bar while music plays.
 */
function SeekLine(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hitRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const hit = hitRef.current!
    const tip = tipRef.current!
    const ctx = canvas.getContext('2d')!
    const HEIGHT = 46
    const PAD = 22
    let width = 0
    let dirty = true
    const observer = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width
      const ratio = Math.min(window.devicePixelRatio, 2)
      canvas.width = Math.round(width * ratio)
      canvas.height = HEIGHT * ratio
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      dirty = true
    })
    observer.observe(canvas)

    let hover = false
    let drag: number | null = null
    let grow = 0
    let lastFraction = -1
    let nextDrop = 1
    const drops: { x: number; y: number; vy: number; r: number }[] = []

    const fractionAt = (e: PointerEvent): number => {
      const rect = hit.getBoundingClientRect()
      return clamp((e.clientX - rect.left - PAD) / (rect.width - PAD * 2), 0, 1)
    }
    const showTip = (e: PointerEvent): void => {
      const f = fractionAt(e)
      tip.textContent = formatTime(f * usePlayer.getState().duration)
      tip.style.transform = `translateX(${PAD + f * (width - PAD * 2)}px) translateX(-50%)`
    }
    const onDown = (e: PointerEvent): void => {
      if (e.button !== 0 || !usePlayer.getState().currentId) return
      hit.setPointerCapture(e.pointerId)
      drag = fractionAt(e)
    }
    const onMove = (e: PointerEvent): void => {
      if (drag !== null) drag = fractionAt(e)
      showTip(e)
    }
    const onUp = (): void => {
      if (drag !== null) usePlayer.getState().seek(drag * usePlayer.getState().duration)
      drag = null
    }
    const onEnter = (): void => void (hover = true)
    const onLeave = (): void => void (hover = false)
    hit.addEventListener('pointerdown', onDown)
    hit.addEventListener('pointermove', onMove)
    hit.addEventListener('pointerup', onUp)
    hit.addEventListener('pointercancel', onUp)
    hit.addEventListener('pointerenter', onEnter)
    hit.addEventListener('pointerleave', onLeave)

    const stop = onFrame((dt, time) => {
      const { playing } = usePlayer.getState()
      const fraction = drag ?? progress()
      const target = hover || drag !== null ? 1 : 0
      const settled = Math.abs(grow - target) < 0.005
      if (!playing && settled && drops.length === 0 && fraction === lastFraction && !dirty) return
      dirty = false
      lastFraction = fraction
      grow += (target - grow) * Math.min(1, dt * 14)

      const y = 4
      const thick = 3 + grow * 2.5
      const x0 = PAD
      const x1 = width - PAD
      const head = x0 + (x1 - x0) * fraction
      ctx.clearRect(0, 0, width, HEIGHT)

      ctx.fillStyle = palette.light ? 'rgb(0 0 0 / 0.12)' : 'rgb(255 255 255 / 0.12)'
      ctx.beginPath()
      ctx.roundRect(x0, y - thick / 2, x1 - x0, thick, thick / 2)
      ctx.fill()

      const gradient = ctx.createLinearGradient(x0, 0, Math.max(head, x0 + 1), 0)
      gradient.addColorStop(0, css(palette.b))
      gradient.addColorStop(1, css(palette.a))
      ctx.fillStyle = gradient

      // The played part: flat on top, a slow swell underneath that grows with the music.
      const swell = playing ? 0.5 + levels.level * 2.4 : 0
      ctx.beginPath()
      ctx.moveTo(x0, y - thick / 2)
      ctx.lineTo(head, y - thick / 2)
      for (let x = head; x >= x0; x -= 5) {
        const fade = Math.min(1, (x - x0) / 30, (head - x) / 12 + 0.4)
        ctx.lineTo(x, y + thick / 2 + Math.max(0, Math.sin(x * 0.05 - time * 3.2)) * swell * fade)
      }
      ctx.closePath()
      ctx.fill()

      const bead = 4.5 + grow * 2.5 + levels.beat * 1.6
      ctx.beginPath()
      ctx.arc(head, y, bead, 0, Math.PI * 2)
      ctx.fill()

      if (playing && drag === null) {
        nextDrop -= dt * (1 + levels.level * 2.5)
        // A drop swells under the bead just before it lets go.
        const swelling = clamp(1 - nextDrop / 0.5, 0, 1)
        if (swelling > 0) {
          ctx.beginPath()
          ctx.ellipse(head, y + bead * 0.6 + swelling * 3, 2 + swelling * 1.2, 2 + swelling * 3, 0, 0, Math.PI * 2)
          ctx.fill()
        }
        if (nextDrop <= 0) {
          drops.push({ x: head, y: y + bead + 4, vy: 20, r: 2.2 + Math.random() * 1.6 })
          nextDrop = 0.9 + Math.random() * 1.8
        }
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i]
        d.vy += 420 * dt
        d.y += d.vy * dt
        if (d.y > HEIGHT + 6) {
          drops.splice(i, 1)
          continue
        }
        ctx.globalAlpha = clamp((HEIGHT - d.y) / 22, 0, 1)
        const stretch = 1 + Math.min(1.2, d.vy / 260)
        ctx.beginPath()
        ctx.ellipse(d.x, d.y, d.r / Math.sqrt(stretch), d.r * stretch, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    })

    return () => {
      stop()
      observer.disconnect()
      hit.removeEventListener('pointerdown', onDown)
      hit.removeEventListener('pointermove', onMove)
      hit.removeEventListener('pointerup', onUp)
      hit.removeEventListener('pointercancel', onUp)
      hit.removeEventListener('pointerenter', onEnter)
      hit.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <div className="seekline">
      <canvas ref={canvasRef} aria-hidden />
      <div ref={hitRef} className="seekline-hit" role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} tabIndex={-1}>
        <span ref={tipRef} className="seekline-tip" />
      </div>
    </div>
  )
}

/** "1:23 / 4:56", updated without re-rendering React. */
export function TimeLabel({ part }: { part: 'elapsed' | 'total' | 'both' }): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  const shown = useRef('')
  useFrame(() => {
    const { duration } = usePlayer.getState()
    const elapsed = formatTime(engine.el.currentTime || 0)
    const total = formatTime(duration)
    const text = part === 'elapsed' ? elapsed : part === 'total' ? total : `${elapsed} / ${total}`
    if (text !== shown.current && ref.current) ref.current.textContent = shown.current = text
  })
  return <span ref={ref} className="time" />
}

/** A DOM seek bar with a droplet thumb, for places where the big canvas line doesn't fit. */
export function SeekBar({ interactive = true }: { interactive?: boolean }): React.JSX.Element {
  const fill = useRef<HTMLDivElement>(null)
  const thumb = useRef<HTMLDivElement>(null)
  const drag = useRef<number | null>(null)
  useFrame(() => {
    const f = drag.current ?? progress()
    if (fill.current) fill.current.style.transform = `scaleX(${f})`
    if (thumb.current) thumb.current.style.left = `${f * 100}%`
  })
  const handlers = useSlider(
    (f) => void (drag.current = f),
    (f) => {
      usePlayer.getState().seek(f * usePlayer.getState().duration)
      drag.current = null
    }
  )
  return (
    <div className={`seekbar ${interactive ? '' : 'static'}`} {...(interactive ? handlers : {})}>
      <div className="seekbar-track">
        <div ref={fill} className="seekbar-fill" />
      </div>
      {interactive && <div ref={thumb} className="seekbar-thumb" />}
    </div>
  )
}

export function Volume(): React.JSX.Element {
  const volume = usePlayer((s) => s.volume)
  const muted = usePlayer((s) => s.muted)
  const shown = muted ? 0 : volume
  const handlers = useSlider((f) => usePlayer.getState().setVolume(f))
  return (
    <div className="volume" onWheel={(e) => usePlayer.getState().setVolume(clamp(volume - Math.sign(e.deltaY) * 0.05, 0, 1))}>
      <IconButton icon={shown === 0 ? 'mute' : 'volume'} label={muted ? 'Unmute' : 'Mute'} onClick={() => usePlayer.getState().toggleMute()} />
      <div className="vol-slider" role="slider" aria-label="Volume" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(shown * 100)} {...handlers}>
        <div className="vol-track">
          <div className="vol-fill" style={{ transform: `scaleX(${shown})` }} />
        </div>
        <div className="vol-thumb" style={{ left: `${shown * 100}%` }} />
      </div>
    </div>
  )
}

export function LikeButton({ id, size = 18 }: { id: string; size?: number }): React.JSX.Element {
  const liked = useUser((s) => s.liked.includes(id))
  return (
    <button className={`icon-btn like ${liked ? 'on' : ''}`} onClick={() => useUser.getState().toggleLike(id)} aria-label={liked ? 'Remove from Liked' : 'Like'} aria-pressed={liked}>
      <Icon name="heart" size={size} fill={liked} />
    </button>
  )
}

export function Transport({ size = 'md' }: { size?: 'md' | 'lg' }): React.JSX.Element {
  const playing = usePlayer((s) => s.playing)
  const shuffle = usePlayer((s) => s.shuffle)
  const repeat = usePlayer((s) => s.repeat)
  const player = usePlayer.getState()
  const pulse = useRef<HTMLDivElement>(null)
  // The play button breathes with the kick drum.
  useFrame(() => {
    if (pulse.current) pulse.current.style.transform = `scale(${1 + levels.beat * 0.07})`
  }, playing)
  const icon = size === 'lg' ? 24 : 20
  return (
    <div className={`transport ${size}`}>
      <IconButton icon="shuffle" label="Shuffle" on={shuffle} onClick={player.toggleShuffle} />
      <IconButton icon="prev" label="Previous" size={icon} onClick={player.prev} />
      <div ref={pulse} className="pulse">
        <PlayBlob playing={playing} onClick={player.toggle} size={size} />
      </div>
      <IconButton icon="next" label="Next" size={icon} onClick={() => player.next()} />
      <IconButton icon="repeat" label={`Repeat: ${repeat}`} on={repeat !== 'off'} className={repeat === 'one' ? 'one' : ''} onClick={player.cycleRepeat} />
    </div>
  )
}

export function PlayerBar(): React.JSX.Element {
  const track = useCurrentTrack()
  const queueOpen = useUi((s) => s.queueOpen)
  const miniOpen = useUi((s) => s.miniOpen)
  const ui = useUi.getState()
  return (
    <footer className="player panel">
      <SeekLine />
      <div className="player-left">
        {track ? (
          <>
            <button className="player-cover" onClick={() => useUi.setState({ nowPlayingOpen: true })} aria-label="Open Now Playing" key={track.id}>
              <Cover id={track.coverId} title={track.album} />
              <span className="player-cover-hint">
                <Icon name="up" size={18} />
              </span>
            </button>
            <div className="player-meta" onContextMenu={(e) => ui.openMenu(e, trackMenu(track))}>
              <button className="player-title link" onClick={() => ui.go({ name: 'album', id: track.albumId })}>
                {track.title}
              </button>
              <button className="player-artist link" onClick={() => ui.go({ name: 'artist', id: artistId(track.albumArtist) })}>
                {track.artist}
              </button>
            </div>
            <LikeButton id={track.id} />
          </>
        ) : (
          <div className="player-idle">
            <Icon name="drop" size={20} />
            Nothing playing
          </div>
        )}
      </div>
      <div className="player-center">
        <Transport />
      </div>
      <div className="player-right">
        {track && <span className={`badge ${track.lossless ? 'lossless' : ''}`} title={quality(track)}>{track.codec}</span>}
        <TimeLabel part="both" />
        <Volume />
        <IconButton icon="queue" label="Queue" on={queueOpen} onClick={() => useUi.setState({ queueOpen: !queueOpen })} />
        <IconButton icon="mini" label="Mini player widget" on={miniOpen} onClick={() => window.sono.mini.toggle()} />
        <IconButton icon="cube" label="Now Playing" onClick={() => useUi.setState({ nowPlayingOpen: true })} />
      </div>
    </footer>
  )
}
