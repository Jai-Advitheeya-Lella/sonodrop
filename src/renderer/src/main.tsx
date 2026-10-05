import '@fontsource-variable/figtree'
import '@fontsource-variable/unbounded'
import './styles/base.css'
import './styles/shell.css'
import './styles/views.css'
import { createRoot } from 'react-dom/client'
import { applyTheme, themeById } from './themes'

const root = createRoot(document.getElementById('root')!)

async function start(): Promise<void> {
  if (window.sono.isMini) {
    document.documentElement.classList.add('is-mini')
    applyTheme(themeById(''))
    const { MiniApp } = await import('./MiniApp')
    root.render(<MiniApp />)
    return
  }
  // The main window owns the audio engine and all state; load it only here.
  const [{ App }, { hydrate }, { useUi }] = await Promise.all([import('./App'), import('./lib/persist'), import('./stores/ui')])
  await hydrate()
  applyTheme(themeById(useUi.getState().themeId))
  root.render(<App />)
}

void start()
