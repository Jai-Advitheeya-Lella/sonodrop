// Runs on the audio thread. Collects the finished, multichannel audio into interleaved float32 chunks
// and posts them to the main process, which pipes them to the sound server (see main/output.ts).
class SonoTap extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const { channels, chunk } = options.processorOptions
    this.channels = channels
    this.chunk = chunk
    this.buffer = new Float32Array(chunk * channels)
    this.filled = 0
    this.loud = false
    this.quietChunks = 0
    this.sink = null
    this.port.onmessage = (event) => {
      if (event.data.port) this.sink = event.data.port
    }
  }

  process(inputs) {
    const input = inputs[0]
    const frames = input[0] ? input[0].length : 128
    const n = this.channels
    const buffer = this.buffer
    const base = this.filled * n
    for (let c = 0; c < n; c++) {
      const channel = input[c]
      if (channel) {
        for (let i = 0; i < frames; i++) {
          const sample = channel[i]
          buffer[base + i * n + c] = sample
          if (sample !== 0) this.loud = true
        }
      } else {
        for (let i = 0; i < frames; i++) buffer[base + i * n + c] = 0
      }
    }
    this.filled += frames

    if (this.filled >= this.chunk) {
      // After a second of pure silence stop sending, so the device can go idle while paused.
      this.quietChunks = this.loud ? 0 : this.quietChunks + 1
      // Posted as a copy: the port's far end is in another process, where transferred buffers can't follow.
      if (this.sink && this.quietChunks < 50) this.sink.postMessage(buffer)
      this.filled = 0
      this.loud = false
    }
    return true
  }
}

registerProcessor('sono-tap', SonoTap)
