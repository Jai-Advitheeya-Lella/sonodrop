/** Minimal WebGL2 runner for full-screen fragment shaders, plus resolution scaling that protects the frame rate. */

const VERTEX = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`

type UniformValue = number | readonly number[]

export interface ShaderCanvas {
  gl: WebGL2RenderingContext
  /** Match the drawing buffer to a CSS size × pixel ratio. */
  size(cssWidth: number, cssHeight: number, pixelRatio: number): void
  draw(uniforms: Record<string, UniformValue>): void
  texture(name: string, unit: number, texture: WebGLTexture | null): void
  dispose(): void
}

export function createShaderCanvas(canvas: HTMLCanvasElement, fragment: string): ShaderCanvas | null {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance'
  })
  if (!gl) return null

  const compile = (type: number, source: string): WebGLShader | null => {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('[fluid] shader failed to compile\n', gl.getShaderInfoLog(shader))
      return null
    }
    return shader
  }
  const vs = compile(gl.VERTEX_SHADER, VERTEX)
  const fs = compile(gl.FRAGMENT_SHADER, fragment)
  if (!vs || !fs) return null
  const program = gl.createProgram()
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('[fluid] program failed to link\n', gl.getProgramInfoLog(program))
    return null
  }
  gl.useProgram(program)

  // One oversized triangle covers the viewport.
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const attribute = gl.getAttribLocation(program, 'p')
  gl.enableVertexAttribArray(attribute)
  gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0)

  const locations = new Map<string, WebGLUniformLocation | null>()
  const locate = (name: string): WebGLUniformLocation | null => {
    if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name))
    return locations.get(name)!
  }

  return {
    gl,
    size(cssWidth, cssHeight, pixelRatio) {
      const w = Math.max(2, Math.round(cssWidth * pixelRatio))
      const h = Math.max(2, Math.round(cssHeight * pixelRatio))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }
    },
    draw(uniforms) {
      for (const name in uniforms) {
        const location = locate(name)
        if (!location) continue
        const value = uniforms[name]
        if (typeof value === 'number') gl.uniform1f(location, value)
        else if (value.length === 2) gl.uniform2f(location, value[0], value[1])
        else if (value.length === 3) gl.uniform3f(location, value[0], value[1], value[2])
        else gl.uniform4f(location, value[0], value[1], value[2], value[3])
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    texture(name, unit, texture) {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.uniform1i(locate(name), unit)
    },
    dispose() {
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }
}

/**
 * Trades resolution for frame rate. Frames arriving late shrink the render scale quickly;
 * a comfortable run of on-time frames grows it back slowly, never past where it last struggled.
 */
export class AdaptiveScale {
  scale: number
  private ema = 0
  private interval = 16.7
  private frames = 0
  private ceiling: number
  private droppedAt = -Infinity

  constructor(
    private readonly min: number,
    private readonly max: number
  ) {
    this.scale = max
    this.ceiling = max
  }

  tick(dtSeconds: number, now: number): void {
    const ms = dtSeconds * 1000
    if (ms >= 100 || ms <= 0) return // tab was hidden or the clock jumped; not a real frame
    // The shortest recent frame is the display's refresh interval.
    this.interval = Math.max(4, Math.min(this.interval + 0.005, ms))
    this.ema = this.ema ? this.ema * 0.9 + ms * 0.1 : ms
    if (++this.frames < 24) return

    if (this.ema > this.interval * 1.35 && this.scale > this.min) {
      this.scale = Math.max(this.min, this.scale * 0.85)
      this.ceiling = this.scale
      this.droppedAt = now
      this.frames = 0
      this.ema = 0
    } else if (this.frames > 150 && this.ema < this.interval * 1.12 && this.scale < this.max) {
      if (now - this.droppedAt > 25) this.ceiling = this.max
      this.scale = Math.min(this.max, this.ceiling, this.scale * 1.1)
      this.frames = 0
    }
  }
}

/** Ease a colour (or any vector) towards a target in place. */
export function ease(current: number[], target: readonly number[], amount: number): void {
  for (let i = 0; i < current.length; i++) current[i] += (target[i] - current[i]) * amount
}
