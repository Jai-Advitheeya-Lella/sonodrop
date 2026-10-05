import { JumpBackWidget, RecentlyAddedWidget, UpNextWidget } from './shelves'
import { ClockWidget, QuickPourWidget, SignalWidget, StatsWidget } from './small'
import { NowPlayingWidget } from './NowPlayingWidget'
import { SpectrumWidget } from './SpectrumWidget'

/**
 * Home is a grid of widgets, four columns wide.
 * To add one: write a component, list it here. Users can hide and reorder them from Home → Customize.
 */
export interface WidgetDef {
  id: string
  name: string
  cols: 1 | 2 | 4
  rows: 1 | 2
  component: React.ComponentType
}

export const WIDGETS: WidgetDef[] = [
  { id: 'now-playing', name: 'Now playing', cols: 2, rows: 2, component: NowPlayingWidget },
  { id: 'spectrum', name: 'Liquid spectrum', cols: 2, rows: 1, component: SpectrumWidget },
  { id: 'clock', name: 'Clock', cols: 1, rows: 1, component: ClockWidget },
  { id: 'quick-pour', name: 'Quick pour', cols: 1, rows: 1, component: QuickPourWidget },
  { id: 'recently-added', name: 'Recently added', cols: 4, rows: 1, component: RecentlyAddedWidget },
  { id: 'up-next', name: 'Up next', cols: 2, rows: 1, component: UpNextWidget },
  { id: 'stats', name: 'Library', cols: 1, rows: 1, component: StatsWidget },
  { id: 'signal', name: 'Signal', cols: 1, rows: 1, component: SignalWidget },
  { id: 'jump-back', name: 'Jump back in', cols: 4, rows: 1, component: JumpBackWidget }
]

/** Registry order, rearranged by the user's saved order; unknown ids are ignored, new widgets go last. */
export function orderedWidgets(order: string[]): WidgetDef[] {
  const known = new Map(WIDGETS.map((w) => [w.id, w]))
  const first = order.map((id) => known.get(id)).filter((w): w is WidgetDef => !!w)
  return [...first, ...WIDGETS.filter((w) => !order.includes(w.id))]
}
