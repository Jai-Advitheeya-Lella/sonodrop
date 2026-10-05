export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

export function formatLength(seconds: number): string {
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h} hr ${m % 60} min` : `${h} hr`
}

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export function formatAdded(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86_400_000)
  if (days < 1) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 28) return `${Math.floor(days / 7)} wk ago`
  return dateFormat.format(ms)
}

export const plural = (n: number, word: string): string => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`

export function quality(t: { codec: string; bitDepth: number | null; sampleRate: number | null; bitrate: number | null; lossless: boolean }): string {
  const khz = t.sampleRate ? `${+(t.sampleRate / 1000).toFixed(1)} kHz` : ''
  if (t.lossless) return [t.codec, t.bitDepth ? `${t.bitDepth}-bit` : '', khz].filter(Boolean).join(' · ')
  return [t.codec, t.bitrate ? `${t.bitrate} kbps` : '', khz].filter(Boolean).join(' · ')
}

export const coverUrl = (id: string | null, size: 'thumb' | 'cover' = 'thumb'): string | null => (id ? `sono://${size}/${id}` : null)

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** Stable pseudo-random number in [0, 1) from a string and a salt. */
export function seeded(text: string, salt = 0): number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  h ^= h >>> 13
  h = Math.imul(h, 0x5bd1e995)
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296
}
