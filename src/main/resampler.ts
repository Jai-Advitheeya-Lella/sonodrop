import { spawn } from 'node:child_process'
import { mkdirSync, promises as fs, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Track } from '@shared/types'
import { run } from './ffmpeg'

/** How many converted files to keep around: the current track, the next one, and a little history. */
const KEEP = 4

/**
 * Turns a track into something the player can stream, using ffmpeg:
 *  - formats the built-in decoder can't read (ALAC, AIFF, APE, WavPack, WMA, DSD, …) are decoded;
 *  - when resampling is on, the SoX resampler (libsoxr) converts to the requested rate at its
 *    very-high-quality setting.
 * The result is a 24-bit WAV, rendered once and then streamed like any other file, so seeking works.
 */
export class Resampler {
  private readonly dir: string
  private readonly jobs = new Map<string, Promise<string | null>>()
  private recent: string[] = []
  private tools: Promise<{ ffmpeg: boolean; soxr: boolean }> | null = null

  constructor(dataDir: string) {
    this.dir = join(dataDir, 'resampled')
    mkdirSync(this.dir, { recursive: true })
    // Nothing here is worth keeping between runs.
    for (const name of readdirSync(this.dir)) rmSync(join(this.dir, name), { force: true })
  }

  available(): Promise<{ ffmpeg: boolean; soxr: boolean }> {
    this.tools ??= run('ffmpeg', ['-hide_banner', '-buildconf']).then((out) => ({
      ffmpeg: out !== null,
      soxr: out?.includes('--enable-libsoxr') ?? false
    }))
    return this.tools
  }

  /**
   * Path of something playable for this track, at `rate` Hz if one is asked for.
   * Falls back to the original file whenever conversion isn't needed or isn't possible.
   */
  async fileFor(track: Track, rate: number | null, force = false): Promise<string> {
    const { ffmpeg, soxr } = await this.available()
    if (!ffmpeg) return track.path
    const decode = force || !track.native
    let target = rate && rate !== track.sampleRate && soxr ? rate : null
    // DSD decodes to PCM at 352.8 kHz and up; bring it down to a rate sound cards accept.
    if (!target && decode && (track.sampleRate ?? 0) > 192000) target = 176400
    if (!decode && !target) return track.path

    const key = `${track.id}-${track.mtime}-${target ?? 'src'}`
    let job = this.jobs.get(key)
    if (!job) {
      job = this.convert(track.path, join(this.dir, `${key}.wav`), target, soxr)
      this.jobs.set(key, job)
    }
    const file = await job
    if (!file) {
      this.jobs.delete(key)
      return track.path
    }
    this.touch(key)
    return file
  }

  clear(): void {
    rmSync(this.dir, { recursive: true, force: true })
  }

  private convert(input: string, output: string, rate: number | null, soxr: boolean): Promise<string | null> {
    return new Promise((resolve) => {
      const part = `${output}.part`
      // 28-bit precision is SoX's "very high quality" setting.
      const filter = rate ? (soxr ? ['-af', `aresample=resampler=soxr:precision=28:osr=${rate}`] : ['-ar', String(rate)]) : []
      const ffmpeg = spawn(
        'ffmpeg',
        ['-v', 'error', '-nostdin', '-y', '-i', input, '-vn', '-map', '0:a:0', ...filter, '-c:a', 'pcm_s24le', '-rf64', 'auto', '-f', 'wav', part],
        { stdio: ['ignore', 'ignore', 'pipe'] }
      )
      let stderr = ''
      ffmpeg.stderr.on('data', (chunk) => (stderr += chunk))
      ffmpeg.on('error', () => resolve(null))
      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          console.error(`[resampler] ffmpeg failed for ${input}: ${stderr.trim()}`)
          void fs.rm(part, { force: true })
          return resolve(null)
        }
        fs.rename(part, output).then(
          () => resolve(output),
          () => resolve(null)
        )
      })
    })
  }

  private touch(key: string): void {
    this.recent = [key, ...this.recent.filter((k) => k !== key)]
    for (const old of this.recent.splice(KEEP)) {
      this.jobs.delete(old)
      void fs.rm(join(this.dir, `${old}.wav`), { force: true })
    }
  }
}
