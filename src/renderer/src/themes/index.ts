import { hexToRgb, luminance, mix } from '@/lib/color'

/**
 * A theme is a handful of colours; everything else (surfaces, borders, shader palette) is derived.
 * To add one, append to THEMES — it shows up in Settings automatically.
 */
export interface Theme {
  id: string
  name: string
  tagline: string
  mode: 'dark' | 'light'
  bg: string
  panel: string
  text: string
  /** Three liquid colours: primary accent first. */
  accent: [string, string, string]
  /** 0 = matte wax, 1 = chrome. Drives reflections in the 3D scene. */
  gloss: number
  /** Take the accents from the artwork of whatever is playing. */
  dynamic?: boolean
  /** Extra styling beyond colour; see the [data-style] rules in styles/base.css. */
  style?: 'cyber'
}

export const THEMES: Theme[] = [
  { id: 'abyss', name: 'Abyss', tagline: 'Deep water, cold light', mode: 'dark', bg: '#03060d', panel: '#0a1220', text: '#e6f0ff', accent: ['#2ee6d6', '#3b82ff', '#8b5cff'], gloss: 0.75 },
  { id: 'magma', name: 'Magma', tagline: 'Molten and slow', mode: 'dark', bg: '#0a0403', panel: '#190b07', text: '#fff0e6', accent: ['#ff6a1a', '#ff2d4b', '#ffc531'], gloss: 0.55 },
  { id: 'mercury', name: 'Mercury', tagline: 'Liquid chrome', mode: 'dark', bg: '#07080a', panel: '#121419', text: '#f2f4f7', accent: ['#e3e9f0', '#8e9bab', '#ffffff'], gloss: 1 },
  { id: 'absinthe', name: 'Absinthe', tagline: 'Green fairy', mode: 'dark', bg: '#030906', panel: '#0a170e', text: '#eaffef', accent: ['#7dff5a', '#19d98b', '#d8ff3a'], gloss: 0.7 },
  { id: 'ultraviolet', name: 'Ultraviolet', tagline: 'Blacklight syrup', mode: 'dark', bg: '#090312', panel: '#150a27', text: '#f4eaff', accent: ['#c44dff', '#ff3d9a', '#6d5cff'], gloss: 0.7 },
  { id: 'honey', name: 'Honey', tagline: 'Thick, warm, golden', mode: 'dark', bg: '#0c0703', panel: '#1b1208', text: '#fff4dc', accent: ['#ffb629', '#ff8a2a', '#ffe08a'], gloss: 0.6 },
  { id: 'vapor', name: 'Vapor', tagline: 'Neon on wet asphalt', mode: 'dark', bg: '#080516', panel: '#130d2a', text: '#f0eaff', accent: ['#ff71ce', '#01cdfe', '#b967ff'], gloss: 0.8 },
  { id: 'cyberpunk', name: 'Cyberpunk', tagline: 'Neon, chrome and rain', mode: 'dark', bg: '#07020f', panel: '#120a22', text: '#eafcff', accent: ['#fcee0a', '#00f0ff', '#ff2a6d'], gloss: 0.95, style: 'cyber' },
  { id: 'ink', name: 'Ink', tagline: 'True black, one drop of red', mode: 'dark', bg: '#000000', panel: '#0c0c0d', text: '#f5f5f5', accent: ['#ff3b3b', '#f2f2f2', '#ff8a8a'], gloss: 0.9 },
  { id: 'glacier', name: 'Glacier', tagline: 'Meltwater daylight', mode: 'light', bg: '#d9e6f2', panel: '#f5f9fd', text: '#0d2233', accent: ['#0a7cff', '#00a9b8', '#5b6cff'], gloss: 0.8 },
  { id: 'rose', name: 'Rosé', tagline: 'Soft and sparkling', mode: 'light', bg: '#f3dedb', panel: '#fff6f3', text: '#3a1620', accent: ['#e3356a', '#ff7a4d', '#a23bd6'], gloss: 0.7 },
  { id: 'chameleon', name: 'Chameleon', tagline: 'Takes its colours from the cover', mode: 'dark', bg: '#060608', panel: '#101014', text: '#f1f1f4', accent: ['#9aa4ff', '#ff8ad1', '#6ef0d2'], gloss: 0.8, dynamic: true }
]

export const DEFAULT_THEME = 'abyss'
export const themeById = (id: string): Theme => THEMES.find((t) => t.id === id) ?? THEMES[0]

type Vec3 = [number, number, number]
const vec = (hex: string): Vec3 => hexToRgb(hex).map((v) => v / 255) as Vec3

/** What the shaders read every frame. They ease towards it, so theme changes flow instead of snapping. */
export const palette = {
  bg: vec(THEMES[0].bg),
  a: vec(THEMES[0].accent[0]),
  b: vec(THEMES[0].accent[1]),
  c: vec(THEMES[0].accent[2]),
  light: 0,
  gloss: THEMES[0].gloss
}

export function applyTheme(theme: Theme, accents: [string, string, string] = theme.accent, root: HTMLElement = document.documentElement): void {
  const [a, b, c] = accents
  const vars: Record<string, string> = {
    '--bg': theme.bg,
    '--panel': theme.panel,
    '--panel-rgb': hexToRgb(theme.panel).join(' '),
    '--bg-rgb': hexToRgb(theme.bg).join(' '),
    '--text': theme.text,
    '--text-rgb': hexToRgb(theme.text).join(' '),
    '--accent': a,
    '--accent-2': b,
    '--accent-3': c,
    '--accent-rgb': hexToRgb(a).join(' '),
    // Solid (not translucent) tints: the gooey filter needs opaque shapes.
    '--accent-soft': mix(theme.panel, a, theme.mode === 'dark' ? 0.26 : 0.2),
    '--accent-ink': theme.mode === 'dark' ? mix(a, '#ffffff', 0.25) : mix(a, '#000000', 0.25),
    '--on-accent': luminance(a) > 0.4 ? '#06080c' : '#ffffff'
  }
  for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value)
  root.dataset.mode = theme.mode
  root.dataset.style = theme.style ?? ''
  root.style.colorScheme = theme.mode

  palette.bg = vec(theme.bg)
  palette.a = vec(a)
  palette.b = vec(b)
  palette.c = vec(c)
  palette.light = theme.mode === 'light' ? 1 : 0
  palette.gloss = theme.gloss
}
