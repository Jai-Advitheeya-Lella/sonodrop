import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useUi, type MenuItem } from '@/stores/ui'
import { Icon } from './Icon'

const close = (): void => useUi.setState({ menu: null })

function MenuList({ items, sub }: { items: MenuItem[]; sub?: boolean }): React.JSX.Element {
  return (
    <div className={sub ? 'menu sub' : 'menu-items'} role="menu">
      {items.map((item, i) =>
        item.separator ? (
          <hr key={i} />
        ) : (
          <div key={i} className="menu-slot" style={{ '--i': i } as React.CSSProperties}>
            <button
              className={`menu-item ${item.danger ? 'danger' : ''}`}
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                if (item.children) return
                item.action?.()
                close()
              }}
            >
              {item.icon ? <Icon name={item.icon} size={16} /> : <span className="menu-gap" />}
              <span>{item.label}</span>
              {item.children && <Icon name="forward" size={14} className="menu-more" />}
            </button>
            {item.children && <MenuList items={item.children} sub />}
          </div>
        )
      )}
    </div>
  )
}

export function ContextMenu(): React.JSX.Element | null {
  const menu = useUi((s) => s.menu)
  const ref = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState({ x: 0, y: 0, flip: false })

  useLayoutEffect(() => {
    if (!menu || !ref.current) return
    const { offsetWidth: w, offsetHeight: h } = ref.current
    const x = Math.min(menu.x, window.innerWidth - w - 10)
    setPlace({ x, y: Math.max(10, Math.min(menu.y, window.innerHeight - h - 10)), flip: x + w * 2 > window.innerWidth })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const onDown = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
    }
  }, [menu])

  if (!menu) return null
  return (
    <div ref={ref} className={`menu ${place.flip ? 'flip' : ''}`} style={{ left: place.x, top: place.y }} onContextMenu={(e) => e.preventDefault()}>
      <MenuList items={menu.items} />
    </div>
  )
}

export function Toasts(): React.JSX.Element {
  const toasts = useUi((s) => s.toasts)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <Icon name="drop" size={14} fill />
          {t.text}
        </div>
      ))}
    </div>
  )
}

/** Drop folders or audio files anywhere on the window to add them to the library. */
export function DropOverlay(): React.JSX.Element {
  const [active, setActive] = useState(false)

  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent): boolean => e.dataTransfer?.types.includes('Files') ?? false
    const onEnter = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      depth++
      setActive(true)
    }
    const onLeave = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setActive(false)
    }
    const onOver = (e: DragEvent): void => {
      if (hasFiles(e)) e.preventDefault()
    }
    const onDrop = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setActive(false)
      const paths = [...(e.dataTransfer?.files ?? [])].map((f) => window.sono.pathForFile(f)).filter(Boolean)
      if (paths.length) void window.sono.library.addPaths(paths)
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  return (
    <div className={`dropzone ${active ? 'active' : ''}`} aria-hidden={!active}>
      <div className="dropzone-inner">
        <span className="dropzone-drop">
          <Icon name="drop" size={56} fill />
        </span>
        <h2>Let go to pour it in</h2>
        <p>Folders, MP3, FLAC, WAV, OGG, Opus, AAC…</p>
      </div>
    </div>
  )
}
