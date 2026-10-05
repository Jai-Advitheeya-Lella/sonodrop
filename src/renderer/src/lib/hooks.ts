import { useEffect, useRef } from 'react'
import type { Track } from '@shared/types'
import { useLibrary } from '@/stores/library'
import { usePlayer } from '@/stores/player'
import { clamp } from './format'
import { onFrame } from './ticker'

/** Run a callback every animation frame while mounted. Always sees the latest closure. */
export function useFrame(fn: (dt: number, time: number) => void, enabled = true): void {
  const latest = useRef(fn)
  latest.current = fn
  useEffect(() => (enabled ? onFrame((dt, t) => latest.current(dt, t)) : undefined), [enabled])
}

export function useCurrentTrack(): Track | undefined {
  const id = usePlayer((s) => s.currentId)
  return useLibrary((s) => (id ? s.byId.get(id) : undefined))
}

/** Pointer handlers for a horizontal slider: reports 0..1 while dragging and once more on release. */
export function useSlider(onDrag: (fraction: number) => void, onCommit?: (fraction: number) => void): React.HTMLAttributes<HTMLElement> {
  const dragging = useRef(false)
  const at = (e: React.PointerEvent<HTMLElement>): number => {
    const rect = e.currentTarget.getBoundingClientRect()
    return clamp((e.clientX - rect.left) / rect.width, 0, 1)
  }
  return {
    onPointerDown: (e) => {
      if (e.button !== 0) return
      dragging.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
      onDrag(at(e))
    },
    onPointerMove: (e) => {
      if (dragging.current) onDrag(at(e))
    },
    onPointerUp: (e) => {
      if (!dragging.current) return
      dragging.current = false
      onCommit?.(at(e))
    },
    onPointerCancel: () => {
      dragging.current = false
    }
  }
}
