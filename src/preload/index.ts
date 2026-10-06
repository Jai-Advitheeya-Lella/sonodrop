import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { SonoBridge } from '@shared/types'

function listen<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const bridge: SonoBridge = {
  library: {
    get: () => ipcRenderer.invoke('library:get'),
    chooseFolders: () => ipcRenderer.invoke('library:chooseFolders'),
    addPaths: (paths) => ipcRenderer.invoke('library:addPaths', paths),
    removeFolder: (path) => ipcRenderer.invoke('library:removeFolder', path),
    rescan: () => ipcRenderer.invoke('library:rescan'),
    onProgress: (cb) => listen('library:progress', cb),
    onUpdated: (cb) => listen('library:updated', cb)
  },
  store: {
    get: (key) => ipcRenderer.invoke('store:get', key),
    set: (key, value) => ipcRenderer.send('store:set', key, value)
  },
  audio: {
    canResample: () => ipcRenderer.invoke('audio:canResample'),
    prepare: (trackId, rate) => ipcRenderer.send('audio:prepare', trackId, rate)
  },
  widgets: {
    toggle: (id) => ipcRenderer.send('widgets:toggle', id),
    open: () => ipcRenderer.invoke('widgets:open'),
    onOpenChange: (cb) => listen('widgets:open', cb),
    pushState: (state) => ipcRenderer.send('widgets:state', state),
    onState: (cb) => listen('widgets:state', cb),
    pushAudio: (frame) => ipcRenderer.send('widgets:audio', frame),
    onAudio: (cb) => listen('widgets:audio', cb),
    command: (cmd) => ipcRenderer.send('widgets:command', cmd),
    onCommand: (cb) => listen('widgets:command', cb)
  },
  showInFolder: (path) => ipcRenderer.send('shell:showInFolder', path),
  pathForFile: (file) => webUtils.getPathForFile(file),
  widgetId: new URLSearchParams(location.search).get('widget')
}

contextBridge.exposeInMainWorld('sono', bridge)
