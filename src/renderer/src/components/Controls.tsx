import { useLayoutEffect, useRef, useState } from 'react'
import type { SortDir, SortState } from '@/lib/sort'
import { useUi } from '@/stores/ui'
import { Icon, type IconName } from './Icon'

const DIR_LABEL: Record<string, [asc: string, desc: string]> = {
  dateAdded: ['Oldest first', 'Newest first'],
  year: ['Oldest first', 'Newest first'],
  duration: ['Shortest first', 'Longest first'],
  tracks: ['Fewest first', 'Most first']
}

interface SortProps<K extends string> {
  options: [K, string][]
  value: SortState<K>
  onChange(value: SortState<K>): void
}

/** "Sort by" menu plus an ascending/descending flip. */
export function SortControl<K extends string>({ options, value, onChange }: SortProps<K>): React.JSX.Element {
  const label = options.find(([key]) => key === value.by)?.[1] ?? ''
  const [asc, desc] = DIR_LABEL[value.by] ?? ['A → Z', 'Z → A']
  const flip: SortDir = value.dir === 'asc' ? 'desc' : 'asc'
  return (
    <div className="sort">
      <button
        className="pill"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          useUi.getState().openMenu(
            { clientX: rect.left, clientY: rect.bottom + 6, preventDefault: () => {} },
            options.map(([key, text]) => ({
              label: text,
              icon: key === value.by ? 'check' : undefined,
              action: () => onChange({ by: key, dir: key === 'dateAdded' ? 'desc' : 'asc' })
            }))
          )
        }}
      >
        <span className="pill-hint">Sort</span>
        {label}
        <Icon name="chevron" size={14} />
      </button>
      <button className="pill" onClick={() => onChange({ by: value.by, dir: flip })} aria-label={`Order: ${value.dir === 'asc' ? asc : desc}`}>
        <Icon name="up" size={14} className={`sort-arrow ${value.dir}`} />
        {value.dir === 'asc' ? asc : desc}
      </button>
    </div>
  )
}

interface TabsProps<K extends string> {
  tabs: [K, string][]
  value: K
  onChange(value: K): void
}

/** Tabs whose highlight is a blob of liquid: it stretches towards the new tab and snaps after it. */
export function GooTabs<K extends string>({ tabs, value, onChange }: TabsProps<K>): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ x: 0, w: 0 })
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (el) setBox({ x: el.offsetLeft, w: el.offsetWidth })
  }, [value, tabs.length])
  const style = { '--x': `${box.x}px`, '--w': `${box.w}px` } as React.CSSProperties
  return (
    <div ref={ref} className="tabs" role="tablist" style={style}>
      <div className="tabs-goo" aria-hidden>
        <i className="tabs-blob lead" />
        <i className="tabs-blob trail" />
      </div>
      {tabs.map(([key, label]) => (
        <button key={key} role="tab" aria-selected={key === value} className="tab" onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  )
}

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  label: string
  size?: number
  on?: boolean
}

export function IconButton({ icon, label, size = 18, on, className = '', ...rest }: IconButtonProps): React.JSX.Element {
  return (
    <button className={`icon-btn ${on ? 'on' : ''} ${className}`} aria-label={label} title={label} aria-pressed={on} {...rest}>
      <Icon name={icon} size={size} />
    </button>
  )
}

/** The big gooey play button. */
export function PlayBlob({ playing, onClick, size = 'md', label }: { playing: boolean; onClick(): void; size?: 'sm' | 'md' | 'lg'; label?: string }): React.JSX.Element {
  return (
    <button className={`play-blob ${size} ${playing ? 'playing' : ''}`} onClick={onClick} aria-label={label ?? (playing ? 'Pause' : 'Play')}>
      <Icon name={playing ? 'pause' : 'play'} size={size === 'lg' ? 28 : size === 'md' ? 22 : 18} />
    </button>
  )
}
