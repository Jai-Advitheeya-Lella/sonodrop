import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { AudioFrame, WidgetCommand, WidgetState } from '@shared/types'
import { DESKTOP_WIDGETS, widgetById } from '@shared/widgets'
import { Library } from './library'
import { handleScheme, registerScheme } from './protocol'
import { Resampler } from './resampler'
import { JsonStore } from './store'

// One profile (~/.config/sonodrop) whether run from source or from an installed package.
// A separate one for development/testing: SONODROP_DATA_DIR=/some/dir npm start
app.setPath('userData', process.env.SONODROP_DATA_DIR ?? join(app.getPath('appData'), 'sonodrop'))

// Playback resumes on launch and the visualiser needs an AudioContext without a click first.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
// Keep the shaders on the GPU even where Chromium is cautious by default.
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')

registerScheme()

const PRELOAD = join(import.meta.dirname, '../preload/index.cjs')
const RENDERER_FILE = join(import.meta.dirname, '../renderer/index.html')
const DEV_URL = process.env.ELECTRON_RENDERER_URL

let mainWindow: BrowserWindow | null = null
const widgetWindows = new Map<string, BrowserWindow>()
let quitting = false
let library: Library
let resampler: Resampler
let settings: JsonStore<Record<string, unknown>>

function load(win: BrowserWindow, widget?: string): void {
  if (DEV_URL) void win.loadURL(widget ? `${DEV_URL}?widget=${widget}` : DEV_URL)
  else void win.loadFile(RENDERER_FILE, widget ? { query: { widget } } : undefined)
}

function harden(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools()
  })
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: '#05070d',
    title: 'Sonodrop',
    webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true }
  })
  harden(mainWindow)
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
    quitting = true
    for (const win of widgetWindows.values()) win.close()
  })
  load(mainWindow)
}

/** Tell the main window which widgets exist right now, and remember the set for next launch. */
function widgetsChanged(): void {
  const open = [...widgetWindows.keys()]
  mainWindow?.webContents.send('widgets:open', open)
  // Closing the app shouldn't forget which widgets were out.
  if (!quitting) settings.set('desktopWidgets', open)
}

function toggleWidget(id: string): void {
  const existing = widgetWindows.get(id)
  if (existing) return existing.close()
  const def = widgetById(id)
  if (!def) return

  // Fixed-size, frameless and transparent: tiling compositors float these on their own.
  const win = new BrowserWindow({
    width: def.width,
    height: def.height,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: `Sonodrop Widget — ${def.name}`,
    webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true }
  })
  harden(win)
  widgetWindows.set(id, win)
  win.on('closed', () => {
    widgetWindows.delete(id)
    widgetsChanged()
  })
  win.webContents.once('did-finish-load', widgetsChanged)
  load(win, id)
}

function registerIpc(): void {
  ipcMain.handle('library:get', () => library.snapshot())
  ipcMain.handle('library:chooseFolders', async () => {
    if (!mainWindow) return false
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Add music folders',
      properties: ['openDirectory', 'multiSelections']
    })
    if (result.canceled || result.filePaths.length === 0) return false
    void library.addPaths(result.filePaths)
    return true
  })
  ipcMain.handle('library:addPaths', (_e, paths: string[]) => library.addPaths(paths.filter((p) => typeof p === 'string')))
  ipcMain.handle('library:removeFolder', (_e, path: string) => library.removeFolder(path))
  ipcMain.handle('library:rescan', () => library.scan())

  ipcMain.handle('store:get', (_e, key: string) => settings.get(key))
  ipcMain.on('store:set', (_e, key: string, value: unknown) => settings.set(key, value))

  ipcMain.handle('audio:canResample', () => resampler.isAvailable())
  ipcMain.on('audio:prepare', (_e, id: string, rate: number) => {
    const track = library.track(id)
    if (track && rate > 0) void resampler.fileFor(track, rate)
  })

  ipcMain.on('shell:showInFolder', (_e, path: string) => {
    // Only reveal files the library knows about.
    if (library.snapshot().tracks.some((t) => t.path === path)) shell.showItemInFolder(path)
  })

  ipcMain.on('widgets:toggle', (_e, id: string) => toggleWidget(id))
  ipcMain.handle('widgets:open', () => [...widgetWindows.keys()])
  ipcMain.on('widgets:state', (_e, state: WidgetState) => {
    for (const win of widgetWindows.values()) win.webContents.send('widgets:state', state)
  })
  ipcMain.on('widgets:audio', (_e, frame: AudioFrame) => {
    for (const [id, win] of widgetWindows) if (widgetById(id)?.audio) win.webContents.send('widgets:audio', frame)
  })
  ipcMain.on('widgets:command', (_e, cmd: WidgetCommand) => {
    if (cmd === 'show-main') {
      if (mainWindow?.isMinimized()) mainWindow.restore()
      mainWindow?.show()
      mainWindow?.focus()
    } else {
      mainWindow?.webContents.send('widgets:command', cmd)
    }
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore()
    mainWindow?.focus()
  })

  void app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    const dataDir = app.getPath('userData')
    settings = new JsonStore<Record<string, unknown>>(join(dataDir, 'settings.json'), {})
    library = new Library(dataDir, (channel, payload) => mainWindow?.webContents.send(channel, payload))
    resampler = new Resampler(dataDir)
    handleScheme(library, resampler)
    registerIpc()
    createMainWindow()

    // Bring back the widgets that were on the desktop last time.
    const remembered = settings.get('desktopWidgets')
    if (Array.isArray(remembered)) {
      mainWindow?.webContents.once('did-finish-load', () => {
        for (const id of remembered) if (DESKTOP_WIDGETS.some((w) => w.id === id)) toggleWidget(id)
      })
    }

    // First launch: start from the user's Music folder if there is one.
    if (library.isEmpty && !settings.get('seeded')) {
      settings.set('seeded', true)
      const music = app.getPath('music')
      if (existsSync(music)) await library.addPaths([music])
    } else {
      void library.scan()
    }
  })

  app.on('before-quit', () => {
    quitting = true
    settings?.flushSync()
    library?.flushSync()
    resampler?.clear()
  })
  app.on('window-all-closed', () => app.quit())
}
