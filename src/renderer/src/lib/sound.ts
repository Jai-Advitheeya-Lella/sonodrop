import { engine } from '@/audio/engine'
import { outputPlan, usePlayer } from '@/stores/player'
import { trackById } from '@/stores/library'
import { useUi } from '@/stores/ui'

/** Push the sound settings into the audio engine now, and again whenever they or the output device change. */
export function syncSound(): void {
  engine.setEq(useUi.getState().eq)
  useUi.subscribe((state, prev) => {
    if (state.eq !== prev.eq) engine.setEq(state.eq)
    if (state.resample === prev.resample && state.speakers === prev.speakers && state.output === prev.output) return
    const plan = outputPlan(trackById(usePlayer.getState().currentId)?.channels ?? 2)
    // A different rate, device or speaker layout means a new audio graph; pick the music back up where it was.
    if (engine.needsRebuild(plan)) usePlayer.getState().reload()
    else engine.configure(plan)
  })
}
