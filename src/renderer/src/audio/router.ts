import type { OutputDevice } from '@shared/types'

export interface SpeakerSettings {
  /** auto: music stays where it was mixed (stereo in the front pair). fill: stereo is spread over every speaker. stereo: front pair only. */
  mode: 'auto' | 'fill' | 'stereo'
  /** Feed the subwoofer with the low end of stereo music. */
  sub: boolean
  /** Hz: below this goes to the subwoofer. */
  crossover: number
  /** dB */
  subLevel: number
  /** Take the low end out of the main speakers (for small satellites). */
  cutMains: boolean
}

export const SPEAKER_DEFAULTS: SpeakerSettings = { mode: 'auto', sub: true, crossover: 80, subLevel: 0, cutMains: false }

export const hasSubwoofer = (device: OutputDevice | null): boolean => !!device?.map.includes('lfe')

/** A short name for a channel layout: "5.1", "Stereo", "7.1", "Quad"… */
export function layoutName(map: string[]): string {
  const lfe = map.includes('lfe') ? 1 : 0
  const full = map.length - lfe
  if (full === 1) return 'Mono'
  if (full === 2) return lfe ? '2.1' : 'Stereo'
  if (full === 4 && !lfe && !map.includes('front-center')) return 'Quad'
  return `${full}.${lfe}`
}

type Role = 'FL' | 'FR' | 'FC' | 'LFE' | 'SL' | 'SR' | 'BL' | 'BR'

/** The channel order decoded files arrive in, by channel count. Anything else is folded to stereo first. */
const SOURCE_LAYOUTS: Record<number, Role[]> = {
  4: ['FL', 'FR', 'SL', 'SR'],
  6: ['FL', 'FR', 'FC', 'LFE', 'SL', 'SR'],
  8: ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'SL', 'SR']
}

export interface Router {
  /** Connect this to whatever consumes the finished audio; it carries one channel per entry of `map`. */
  output: AudioNode
  /** Adjust the things that can change without rebuilding. */
  tune(settings: SpeakerSettings): void
}

/**
 * Lays the music out over the speakers that are actually there.
 *
 * Stereo music goes to the front pair; if there is a subwoofer, the low end of both channels is summed,
 * low-passed (24 dB/octave) and sent to it. "Fill" also derives a centre and feeds the surrounds.
 * Multichannel files go speaker-for-speaker, and channels the device lacks are folded into the ones it has.
 */
export function createRouter(ctx: AudioContext, input: AudioNode, sourceChannels: number, map: string[], settings: SpeakerSettings): Router {
  const merger = ctx.createChannelMerger(map.length)
  const at = (position: string): number => map.indexOf(position)
  const has = (position: string): boolean => at(position) >= 0

  /** Route one output of a node to a speaker, if the device has it. */
  const send = (from: AudioNode, output: number, position: string, gain = 1): boolean => {
    if (!has(position)) return false
    const level = ctx.createGain()
    level.gain.value = gain
    from.connect(level, output)
    level.connect(merger, 0, at(position))
    return true
  }
  /** Two cascaded 12 dB/octave filters make the 24 dB/octave slope crossovers use. */
  const crossovers: BiquadFilterNode[] = []
  const filtered = (from: AudioNode, output: number, type: 'lowpass' | 'highpass'): AudioNode => {
    let node: AudioNode | null = null
    for (let i = 0; i < 2; i++) {
      const filter = ctx.createBiquadFilter()
      filter.type = type
      filter.frequency.value = settings.crossover
      filter.Q.value = Math.SQRT1_2
      if (node) node.connect(filter)
      else from.connect(filter, output)
      node = filter
      crossovers.push(filter)
    }
    return node!
  }

  const subLevel = ctx.createGain()
  subLevel.gain.value = 10 ** (settings.subLevel / 20)
  const useSub = settings.sub && has('lfe')
  if (useSub) subLevel.connect(merger, 0, at('lfe'))

  const roles = SOURCE_LAYOUTS[sourceChannels]
  if (roles) {
    // A multichannel file: speaker for speaker, folding down what the device doesn't have.
    const split = ctx.createChannelSplitter(roles.length)
    input.connect(split)
    const fronts = (i: number, gain: number): void => {
      send(split, i, 'front-left', gain)
      send(split, i, 'front-right', gain)
    }
    roles.forEach((role, i) => {
      if (role === 'FL') send(split, i, 'front-left') || send(split, i, 'mono', 0.5)
      else if (role === 'FR') send(split, i, 'front-right') || send(split, i, 'mono', 0.5)
      else if (role === 'FC') send(split, i, 'front-center') || fronts(i, Math.SQRT1_2)
      else if (role === 'LFE') {
        if (useSub) split.connect(subLevel, i)
        else fronts(i, 0.5)
      } else {
        const side = role.endsWith('L') ? 'left' : 'right'
        const order = role.startsWith('S') ? ['side', 'rear'] : ['rear', 'side']
        if (!send(split, i, `${order[0]}-${side}`) && !send(split, i, `${order[1]}-${side}`)) send(split, i, `front-${side}`, Math.SQRT1_2)
      }
    })
  } else {
    // Stereo (or anything unusual, folded to stereo by the standard down-mix rules).
    const stereo = ctx.createGain()
    stereo.channelCount = 2
    stereo.channelCountMode = 'explicit'
    stereo.channelInterpretation = 'speakers'
    input.connect(stereo)
    const split = ctx.createChannelSplitter(2)
    stereo.connect(split)

    const cut = useSub && settings.cutMains
    const left: [AudioNode, number] = cut ? [filtered(split, 0, 'highpass'), 0] : [split, 0]
    const right: [AudioNode, number] = cut ? [filtered(split, 1, 'highpass'), 0] : [split, 1]

    if (has('front-left') && has('front-right')) {
      send(...left, 'front-left')
      send(...right, 'front-right')
    } else {
      send(...left, map[0], 0.5)
      send(...right, map[0], 0.5)
    }

    if (useSub) {
      const sum = ctx.createGain()
      sum.gain.value = 0.5
      split.connect(sum, 0)
      split.connect(sum, 1)
      filtered(sum, 0, 'lowpass').connect(subLevel)
    }

    if (settings.mode === 'fill') {
      // A phantom centre made real, and the surrounds fed a slightly late, quieter copy of their side.
      send(...left, 'front-center', 0.5 * Math.SQRT1_2)
      send(...right, 'front-center', 0.5 * Math.SQRT1_2)
      for (const [source, side] of [
        [left, 'left'],
        [right, 'right']
      ] as const) {
        const late = ctx.createDelay(0.05)
        late.delayTime.value = 0.012
        source[0].connect(late, source[1])
        send(late, 0, `side-${side}`, 0.6)
        send(late, 0, `rear-${side}`, has(`side-${side}`) ? 0.45 : 0.6)
      }
    }
  }

  return {
    output: merger,
    tune(next) {
      const now = ctx.currentTime
      subLevel.gain.setTargetAtTime(10 ** (next.subLevel / 20), now, 0.03)
      for (const filter of crossovers) filter.frequency.setTargetAtTime(next.crossover, now, 0.03)
    }
  }
}
