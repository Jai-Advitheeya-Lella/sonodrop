/** Inline icon set. Stroke icons unless listed in FILLED. Add a path here to add an icon. */
const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  library: 'M5 4v16M10 4v16M14.5 5.5l4.5 14',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  heart: 'M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z',
  play: 'M7.5 4.6v14.8a.6.6 0 0 0 .9.5l12.3-7.4a.6.6 0 0 0 0-1L8.4 4.1a.6.6 0 0 0-.9.5z',
  pause: 'M7 4.5h3.2a.8.8 0 0 1 .8.8v13.4a.8.8 0 0 1-.8.8H7a.8.8 0 0 1-.8-.8V5.3a.8.8 0 0 1 .8-.8zM13.8 4.5H17a.8.8 0 0 1 .8.8v13.4a.8.8 0 0 1-.8.8h-3.2a.8.8 0 0 1-.8-.8V5.3a.8.8 0 0 1 .8-.8z',
  next: 'M5 5.6v12.8a.6.6 0 0 0 .9.5l9.6-6.4a.6.6 0 0 0 0-1L5.9 5.1a.6.6 0 0 0-.9.5zM17.2 5h1.6a.7.7 0 0 1 .7.7v12.6a.7.7 0 0 1-.7.7h-1.6a.7.7 0 0 1-.7-.7V5.7a.7.7 0 0 1 .7-.7z',
  prev: 'M19 5.6v12.8a.6.6 0 0 1-.9.5l-9.6-6.4a.6.6 0 0 1 0-1l9.6-6.4a.6.6 0 0 1 .9.5zM6.8 5H5.2a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h1.6a.7.7 0 0 0 .7-.7V5.7a.7.7 0 0 0-.7-.7z',
  shuffle: 'M3 7h3.2c1.9 0 3.2 1 4.2 2.6l2.4 4.8c1 1.6 2.3 2.6 4.2 2.6H21M18 14l3 3-3 3M3 17h3.2c1.2 0 2.1-.4 2.9-1.1M21 7h-4c-1.2 0-2.1.4-2.9 1.1M18 4l3 3-3 3',
  repeat: 'M17 2.5l3.5 3.5L17 9.5M3.5 11v-1a4 4 0 0 1 4-4h13M7 21.5 3.5 18 7 14.5M20.5 13v1a4 4 0 0 1-4 4h-13',
  volume: 'M4 9.5v5h3.5l4.5 4v-13l-4.5 4zM15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11',
  mute: 'M4 9.5v5h3.5l4.5 4v-13l-4.5 4zM16 9.5l5 5M21 9.5l-5 5',
  queue: 'M4 6h12M4 11h12M4 16h7M16 14v6l5-3z',
  mini: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM12.5 12.5h6v4h-6z',
  settings: 'M4 7h8M17 7h3M4 17h3M12 17h8M14.5 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM9.5 14.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  plus: 'M12 5v14M5 12h14',
  back: 'M14.5 5l-7 7 7 7',
  forward: 'M9.5 5l7 7-7 7',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  more: 'M5 10.6a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8zM12 10.6a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8zM19 10.6a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z',
  folder: 'M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z',
  trash: 'M4 7h16M9 7V4.5h6V7M6.5 7l1 12.5h9l1-12.5',
  close: 'M6 6l12 12M18 6 6 18',
  drop: 'M12 3s6.5 6.6 6.5 11.2a6.5 6.5 0 0 1-13 0C5.5 9.6 12 3 12 3z',
  chevron: 'M5 9l7 7 7-7',
  disc: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4.5 20.5c1-4 4-5.5 7.5-5.5s6.5 1.5 7.5 5.5',
  refresh: 'M20 11a8 8 0 0 0-14.5-4M4 4v4h4M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  cube: 'M12 3 4 7.5v9L12 21l8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
  pencil: 'M4 20l1-4L16 5l3 3L8 19z',
  playlist: 'M4 6h16M4 11h10M4 16h7M17 12v6.5M17 12l4 1.5M15 18.5a2 2 0 1 0 4 0 2 2 0 0 0-4 0z',
  external: 'M14 4h6v6M20 4l-9 9M18 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5.5'
} as const

const FILLED = new Set<IconName>(['play', 'pause', 'next', 'prev', 'more'])

export type IconName = keyof typeof PATHS

interface Props {
  name: IconName
  size?: number
  /** Force a solid shape, e.g. a filled heart. */
  fill?: boolean
  className?: string
}

export function Icon({ name, size = 18, fill, className }: Props): React.JSX.Element {
  const solid = fill ?? FILLED.has(name)
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={solid ? 'currentColor' : 'none'}
      stroke={solid && FILLED.has(name) ? 'none' : 'currentColor'}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
