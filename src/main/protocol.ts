import { protocol } from 'electron'
import { createReadStream, promises as fs } from 'node:fs'
import { extname } from 'node:path'
import type { Library } from './library'
import type { Resampler } from './resampler'

/**
 * sono://media/<trackId>  audio, with range support so seeking works
 *   …?sr=96000            the same track, SoX-resampled to that rate
 *   …?t=1                 decode through ffmpeg even if the format looks playable (the retry after a failed play)
 * Formats the built-in decoder can't read always go through ffmpeg.
 * sono://cover/<coverId>  full-size artwork
 * sono://thumb/<coverId>  thumbnail artwork
 *
 * The renderer only ever names ids, never paths, so it can't read arbitrary files.
 */
export const SCHEME = 'sono'

const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.webm': 'audio/webm',
  '.weba': 'audio/webm'
}

const CORS = { 'Access-Control-Allow-Origin': '*' }

export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
    }
  ])
}

function imageType(buf: Buffer): string {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png'
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF') return 'image/webp'
  if (buf.subarray(0, 3).toString('latin1') === 'GIF') return 'image/gif'
  return 'image/jpeg'
}

async function serveMedia(file: string, request: Request, type?: string): Promise<Response> {
  const { size } = await fs.stat(file)
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') ?? '')
  let start = 0
  let end = size - 1
  if (range) {
    if (range[1] === '' && range[2] !== '') start = Math.max(0, size - Number(range[2]))
    else {
      start = Number(range[1])
      if (range[2] !== '') end = Math.min(end, Number(range[2]))
    }
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { ...CORS, 'Content-Range': `bytes */${size}` } })
    }
  }

  const source = createReadStream(file, { start, end })
  let closed = false
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      source.on('data', (chunk) => {
        if (closed) return
        controller.enqueue(new Uint8Array(chunk as Buffer))
        if ((controller.desiredSize ?? 0) <= 0) source.pause()
      })
      source.on('end', () => {
        if (!closed) controller.close()
        closed = true
      })
      source.on('error', (err) => {
        if (!closed) controller.error(err)
        closed = true
      })
    },
    pull() {
      source.resume()
    },
    cancel() {
      closed = true
      source.destroy()
    }
  })

  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      ...CORS,
      'Content-Type': type ?? MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {})
    }
  })
}

export function handleScheme(library: Library, resampler: Resampler): void {
  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const id = decodeURIComponent(url.pathname.slice(1))
      if (url.host === 'media') {
        const track = library.track(id)
        if (track) {
          const file = await resampler.fileFor(track, Number(url.searchParams.get('sr')) || null, url.searchParams.has('t'))
          return await serveMedia(file, request, file === track.path ? undefined : 'audio/wav')
        }
      } else if ((url.host === 'cover' || url.host === 'thumb') && /^[a-f0-9]+$/.test(id)) {
        const buf = await fs.readFile(library.coverFile(id, url.host === 'thumb'))
        return new Response(new Uint8Array(buf), {
          headers: { ...CORS, 'Content-Type': imageType(buf), 'Cache-Control': 'public, max-age=31536000, immutable' }
        })
      }
    } catch {
      // fall through to 404
    }
    return new Response('Not found', { status: 404, headers: CORS })
  })
}
