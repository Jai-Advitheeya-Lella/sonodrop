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
  mini: {
    toggle: () => ipcRenderer.send('mini:toggle'),
    pushState: (state) => ipcRenderer.send('mini:state', state),
    onState: (cb) => listen('mini:state', cb),
    command: (cmd) => ipcRenderer.send('mini:command', cmd),
    onCommand: (cb) => listen('mini:command', cb),
    onOpenChange: (cb) => listen('mini:open', cb)
  },
  showInFolder: (path) => ipcRenderer.send('shell:showInFolder', path),
  pathForFile: (file) => webUtils.getPathForFile(file),
  isMini: new URLSearchParams(location.search).has('mini')
}

contextBridge.exposeInMainWorld('sono', bridge)
