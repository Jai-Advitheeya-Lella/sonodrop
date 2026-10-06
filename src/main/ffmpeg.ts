import { execFile } from 'node:child_process'

/** Run a command and resolve with its stdout, or null if it isn't installed or fails. */
export function run(command: string, args: string[], timeout = 15000): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => resolve(err ? null : stdout))
  })
}

export interface Probe {
  tags: Record<string, string>
  duration: number
  sampleRate: number | null
  channels: number | null
  bitDepth: number | null
  bitrate: number | null
  codec: string
}

/** What ffprobe knows about a file: the fallback for formats the tag reader doesn't understand. */
export async function probe(path: string): Promise<Probe | null> {
  const out = await run('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-select_streams', 'a:0', '-of', 'json', path])
  if (!out) return null
  try {
    const { format, streams } = JSON.parse(out)
    const stream = streams?.[0]
    if (!stream) return null
    const tags: Record<string, string> = {}
    for (const [key, value] of Object.entries({ ...stream.tags, ...format?.tags })) tags[key.toLowerCase()] = String(value)
    return {
      tags,
      duration: Number(format?.duration ?? stream.duration) || 0,
      sampleRate: Number(stream.sample_rate) || null,
      channels: Number(stream.channels) || null,
      bitDepth: Number(stream.bits_per_raw_sample) || Number(stream.bits_per_sample) || null,
      bitrate: Number(format?.bit_rate) ? Math.round(Number(format.bit_rate) / 1000) : null,
      codec: String(stream.codec_name ?? '')
    }
  } catch {
    return null
  }
}
