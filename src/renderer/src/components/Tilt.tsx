import { useRef } from 'react'

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  /** Maximum lean in degrees. */
  max?: number
}

/** Leans its content towards the pointer in 3D, with a glare that tracks it. Springs back on leave. */
export function Tilt({ max = 10, className = '', children, ...rest }: Props): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  const onPointerMove = (e: React.PointerEvent): void => {
    const el = ref.current!
    const rect = el.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    el.style.setProperty('--rx', `${(-y * max).toFixed(2)}deg`)
    el.style.setProperty('--ry', `${(x * max).toFixed(2)}deg`)
    el.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(1)}%`)
    el.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(1)}%`)
  }
  const onPointerLeave = (): void => {
    ref.current!.style.setProperty('--rx', '0deg')
    ref.current!.style.setProperty('--ry', '0deg')
  }

  return (
    <div ref={ref} className={`tilt ${className}`} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} {...rest}>
      {children}
      <span className="tilt-glare" />
    </div>
  )
}
