import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { MessagePortMain } from 'electron'
import type { OutputDevice, SinkSpec } from '@shared/types'
import { run } from './ffmpeg'

interface PactlSink {
  name: string
  description?: string
  sample_specification?: string
  channel_map?: string
}

/** The system's current default output, as PulseAudio / PipeWire describe it; null when `pactl` isn't there. */
export async function detectOutput(): Promise<OutputDevice | null> {
  const [name, sinks] = await Promise.all([run('pactl', ['get-default-sink'], 4000), run('pactl', ['--format=json', 'list', 'sinks'], 4000)])
  if (!name || !sinks) return null
  try {
    const sink = (JSON.parse(sinks) as PactlSink[]).find((s) => s.name === name.trim())
    if (!sink?.channel_map) return null
    const map = sink.channel_map.split(',').map((position) => position.trim())
    return {
      name: sink.name,
      description: sink.description ?? sink.name,
      channels: map.length,
      map,
      rate: Number(/(\d+)Hz/.exec(sink.sample_specification ?? '')?.[1]) || 48000
    }
  } catch {
    return null
  }
}

/** Call back whenever the default output or its configuration changes (headphones plugged in, profile switched…). */
export function watchOutput(onChange: (device: OutputDevice | null) => void): () => void {
  let last = ''
  let timer: NodeJS.Timeout | null = null
  const check = (): void => {
    timer = null
    void detectOutput().then((device) => {
      const signature = JSON.stringify(device)
      if (signature === last) return
      last = signature
      onChange(device)
    })
  }
  check()
  let watcher: ChildProcessWithoutNullStreams | null = null
  try {
    // The shell holds our end of a pipe on its stdin: if Sonodrop dies in any way, the pipe closes,
    // `cat` returns and the listener is killed, so it can never be left running on its own.
    watcher = spawn('sh', ['-c', 'pactl subscribe & listener=$!; cat > /dev/null; kill $listener'])
    watcher.on('error', () => {})
    watcher.stdin.on('error', () => {})
    watcher.stdout.on('data', (chunk: Buffer) => {
      // Sink and server events cover a new default device, a changed profile and a changed format.
      if (/on (sink|server|card) #/.test(chunk.toString())) timer ??= setTimeout(check, 500)
    })
  } catch {
    // No pactl: the output is whatever the first check said (nothing).
  }
  return () => watcher?.stdin.end()
}

/**
 * Direct output: plays raw PCM, in any channel layout and at any rate, straight into the sound server.
 * The audio graph in the window does all the processing; its audio thread writes the finished samples to a
 * message port, and this pipes them into `pacat`. It exists because the built-in audio output is stereo-only on Linux.
 */
export class DirectSink {
  private player: ChildProcessWithoutNullStreams | null = null
  private port: MessagePortMain | null = null
  private available: Promise<boolean> | null = null

  isAvailable(): Promise<boolean> {
    this.available ??= run('pacat', ['--version'], 4000).then((out) => out !== null)
    return this.available
  }

  open(spec: SinkSpec, port: MessagePortMain): void {
    this.close()
    const player = spawn('pacat', [
      '--playback',
      '--raw',
      '--format=float32le',
      `--rate=${spec.rate}`,
      `--channels=${spec.channels}`,
      `--channel-map=${spec.map.join(',')}`,
      '--latency-msec=90',
      '--client-name=Sonodrop',
      '--stream-name=Sonodrop',
      '--property=media.role=music',
      '--property=application.icon_name=sonodrop'
    ])
    player.on('error', (err) => console.error('[output] pacat failed to start', err))
    player.stderr.on('data', (chunk: Buffer) => console.error('[output]', chunk.toString().trim()))
    player.stdin.on('error', () => {})
    this.player = player
    this.port = port
    port.on('message', ({ data }) => {
      // Chunks arrive as Float32Array copies (see tap.worklet.js).
      if (!ArrayBuffer.isView(data)) return
      // If the sound server stalls, drop audio rather than queue it up without limit.
      if (this.player !== player || player.stdin.writableLength > 4 * 1024 * 1024) return
      player.stdin.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength))
    })
    port.start()
  }

  close(): void {
    this.port?.close()
    this.port = null
    this.player?.stdin.end()
    this.player?.kill()
    this.player = null
  }
}
