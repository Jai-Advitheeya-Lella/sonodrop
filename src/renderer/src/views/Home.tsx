import { Icon } from '@/components/Icon'
import { allTrackIds } from '@/components/menus'
import { Visualizer } from '@/fluid/Visualizer'
import { VISUALS, visualById } from '@/fluid/visuals'
import { greeting } from '@/lib/actions'
import { useLibrary } from '@/stores/library'
import { usePlayer } from '@/stores/player'
import { useUi } from '@/stores/ui'
import { NowPlayingWidget } from '@/widgets/NowPlayingWidget'
import { JumpBackWidget, RecentlyAddedWidget, UpNextWidget } from '@/widgets/shelves'
import { QuickPourWidget, SignalWidget, StatsWidget } from '@/widgets/small'
import { EmptyLibrary } from './parts'

interface CardProps {
  title: string
  /** Grid span classes: c1..c4 columns, r2 for two rows. */
  span: string
  index: number
  children: React.ReactNode
  aside?: React.ReactNode
}

function Card({ title, span, index, children, aside }: CardProps): React.JSX.Element {
  return (
    <section className={`widget panel ${span}`} style={{ '--i': index } as React.CSSProperties}>
      <header className="widget-head">
        <h3>{title}</h3>
        {aside}
      </header>
      <div className="widget-body">{children}</div>
    </section>
  )
}

/** The visualiser card: pick a style from the chips; the choice also drives the desktop visualiser widget. */
function VisualCard({ index }: { index: number }): React.JSX.Element {
  const visual = useUi((s) => s.visualizer)
  const patch = useUi((s) => s.patch)
  return (
    <Card
      title="Visualiser"
      span="c2 r2"
      index={index}
      aside={
        <div className="visual-picker" role="radiogroup" aria-label="Visualiser style">
          {VISUALS.map((v) => (
            <button key={v.id} role="radio" aria-checked={v.id === visual} title={v.blurb} onClick={() => patch({ visualizer: v.id })}>
              {v.name}
            </button>
          ))}
        </div>
      }
    >
      <Visualizer visual={visual} className="bleed" />
      <p className="visual-caption">{visualById(visual).blurb}</p>
    </Card>
  )
}

export function Home(): React.JSX.Element {
  const hasMusic = useLibrary((s) => s.tracks.length > 0)
  if (!hasMusic) return <EmptyLibrary />
  const player = usePlayer.getState()

  return (
    <div className="view home">
      <header className="view-head">
        <div>
          <p className="kicker">{greeting()}</p>
          <h1>Let it pour.</h1>
        </div>
        <div className="head-actions">
          <button className="pill primary" onClick={() => player.playTracks(allTrackIds())}>
            <Icon name="play" size={15} />
            Play everything
          </button>
          <button className="pill" onClick={() => player.shufflePlay(allTrackIds())}>
            <Icon name="shuffle" size={15} />
            Shuffle
          </button>
        </div>
      </header>

      <div className="widgets">
        <Card title="Now playing" span="c2 r2" index={0}>
          <NowPlayingWidget />
        </Card>
        <VisualCard index={1} />
        <Card title="Recently added" span="c4" index={2}>
          <RecentlyAddedWidget />
        </Card>
        <Card title="Up next" span="c2" index={3}>
          <UpNextWidget />
        </Card>
        <Card title="Quick pour" span="c1" index={4}>
          <QuickPourWidget />
        </Card>
        <Card title="Signal" span="c1" index={5}>
          <SignalWidget />
        </Card>
        <Card title="Jump back in" span="c3" index={6}>
          <JumpBackWidget />
        </Card>
        <Card title="Library" span="c1" index={7}>
          <StatsWidget />
        </Card>
      </div>
    </div>
  )
}
