import { execFile, spawn } from 'node:child_process'
import { mkdirSync, promises as fs, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Track } from '@shared/types'

/** How many resampled files to keep around: the current track, the next one, and a little history. */
const KEEP = 4

/**
 * High-quality sample-rate conversion with the SoX resampler (libsoxr, through ffmpeg).
 * A track is rendered once to a 24-bit WAV at the target rate, then streamed like any other file,
 * so seeking keeps working. Needs `ffmpeg` built with libsoxr on the PATH.
 */
export class Resampler {
  private readonly dir: string
  private readonly jobs = new Map<string, Promise<string | null>>()
  private recent: string[] = []
  private available: Promise<boolean> | null = null

  constructor(dataDir: string) {
    this.dir = join(dataDir, 'resampled')
    mkdirSync(this.dir, { recursive: true })
    // Nothing here is worth keeping between runs.
    for (const name of readdirSync(this.dir)) rmSync(join(this.dir, name), { force: true })
  }

  isAvailable(): Promise<boolean> {
    this.available ??= new Promise((resolve) => {
      execFile('ffmpeg', ['-hide_banner', '-buildconf'], (err, stdout) => resolve(!err && stdout.includes('--enable-libsoxr')))
    })
    return this.available
  }

  /** Path of the track at `rate` Hz — the original file when it is already there or conversion isn't possible. */
  async fileFor(track: Track, rate: number): Promise<string> {
    if (track.sampleRate === rate || !(await this.isAvailable())) return track.path
    const key = `${track.id}-${track.mtime}-${rate}`
    let job = this.jobs.get(key)
    if (!job) {
      job = this.convert(track.path, join(this.dir, `${key}.wav`), rate)
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

  private convert(input: string, output: string, rate: number): Promise<string | null> {
    return new Promise((resolve) => {
      const part = `${output}.part`
      const ffmpeg = spawn(
        'ffmpeg',
        [
          '-v', 'error', '-nostdin', '-y',
          '-i', input,
          '-vn', '-map', '0:a:0',
          // 28-bit precision is SoX's "very high quality" setting.
          '-af', `aresample=resampler=soxr:precision=28:osr=${rate}`,
          '-c:a', 'pcm_s24le', '-rf64', 'auto', '-f', 'wav',
          part
        ],
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
