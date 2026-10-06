/**
 * Desktop widgets: small always-on-top windows that live outside the main window.
 * To add one, describe it here and give it a component in renderer/src/desktop/registry.tsx.
 */
export interface DesktopWidget {
  id: string
  name: string
  blurb: string
  width: number
  height: number
  /** Needs the live audio feed (spectrum and levels), not just track info. */
  audio?: boolean
}

export const DESKTOP_WIDGETS: DesktopWidget[] = [
  { id: 'player', name: 'Mini player', blurb: 'Artwork, title and transport', width: 400, height: 148 },
  { id: 'vinyl', name: 'Turntable', blurb: 'A glass record that spins with the music', width: 280, height: 280, audio: true },
  { id: 'visualizer', name: 'Visualiser', blurb: 'The current visual, in a frame of its own', width: 460, height: 260, audio: true },
  { id: 'poster', name: 'Poster', blurb: 'Just the cover, dripping', width: 250, height: 318 },
  { id: 'strip', name: 'Strip', blurb: 'One slim line: what’s on, and where it’s up to', width: 540, height: 72 },
  { id: 'upnext', name: 'Up next', blurb: 'This song and the next few', width: 330, height: 356 }
]

export const widgetById = (id: string): DesktopWidget | undefined => DESKTOP_WIDGETS.find((w) => w.id === id)
