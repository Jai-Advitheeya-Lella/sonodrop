import { engine } from '@/audio/engine'
import { resampleRate, usePlayer } from '@/stores/player'
import { useUi } from '@/stores/ui'

/** Push the sound settings into the audio engine now, and again whenever they change. */
export function syncSound(): void {
  engine.setEq(useUi.getState().eq)
  engine.setOutputRate(resampleRate())
  useUi.subscribe((state, prev) => {
    if (state.eq !== prev.eq) engine.setEq(state.eq)
    // A new sample rate means a new audio graph; pick the music back up where it was.
    if (state.resample !== prev.resample && resampleRate() !== engine.outputRate) usePlayer.getState().reload()
  })
}
