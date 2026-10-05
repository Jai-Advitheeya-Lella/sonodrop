export type RGB = [number, number, number]

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a)
  const y = hexToRgb(b)
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t])
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function rgbToHsl(r: number, g: number, b: number): RGB {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h = (h * 60 + 360) % 360
  return [h, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return rgbToHex([(r + m) * 255, (g + m) * 255, (b + m) * 255])
}

const paletteCache = new Map<string, Promise<[string, string, string] | null>>()

/**
 * Pull three vivid, distinct colours out of a piece of artwork.
 * Returns null for greyscale covers so callers can keep the theme's own accents.
 */
export function extractPalette(url: string): Promise<[string, string, string] | null> {
  let pending = paletteCache.get(url)
  if (!pending) {
    pending = new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onerror = () => resolve(null)
      img.onload = () => {
        const size = 32
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = size
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, size, size)
        const { data } = ctx.getImageData(0, 0, size, size)
        const bins = Array.from({ length: 18 }, () => ({ w: 0, h: 0, s: 0, l: 0 }))
        for (let i = 0; i < data.length; i += 4) {
          const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2])
          if (s < 0.2 || l < 0.12 || l > 0.92) continue
          const w = s * (1 - Math.abs(l - 0.55))
          const bin = bins[Math.floor(h / 20) % 18]
          bin.w += w
          bin.h += h * w
          bin.s += s * w
          bin.l += l * w
        }
        const ranked = bins.map((b, i) => ({ ...b, i })).filter((b) => b.w > 1.5).sort((a, b) => b.w - a.w)
        if (ranked.length === 0) return resolve(null)
        const picks = [ranked[0]]
        for (const b of ranked) {
          if (picks.length === 3) break
          const far = picks.every((p) => Math.min(Math.abs(p.i - b.i), 18 - Math.abs(p.i - b.i)) >= 2)
          if (far) picks.push(b)
        }
        const colors = picks.map((b) => hslToHex(b.h / b.w, Math.max(0.55, b.s / b.w), Math.min(0.68, Math.max(0.52, b.l / b.w))))
        // Monochrome artwork: fan out around the one hue we found.
        const [h0] = rgbToHsl(...hexToRgb(colors[0]))
        while (colors.length < 3) colors.push(hslToHex((h0 + 40 * colors.length) % 360, 0.7, 0.6))
        resolve(colors as [string, string, string])
      }
      img.src = url
    })
    paletteCache.set(url, pending)
  }
  return pending
}
