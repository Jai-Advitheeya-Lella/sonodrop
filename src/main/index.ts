import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { MiniCommand, MiniState } from '@shared/types'
import { Library } from './library'
import { handleScheme, registerScheme } from './protocol'
import { JsonStore } from './store'

// A separate profile for development/testing: SONODROP_DATA_DIR=/some/dir npm start
if (process.env.SONODROP_DATA_DIR) app.setPath('userData', process.env.SONODROP_DATA_DIR)

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
let miniWindow: BrowserWindow | null = null
let library: Library
let settings: JsonStore<Record<string, unknown>>

function load(win: BrowserWindow, mini: boolean): void {
  if (DEV_URL) void win.loadURL(mini ? `${DEV_URL}?mini=1` : DEV_URL)
  else void win.loadFile(RENDERER_FILE, mini ? { query: { mini: '1' } } : undefined)
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
    miniWindow?.close()
  })
  load(mainWindow, false)
}

function toggleMiniWindow(): void {
  if (miniWindow) {
    miniWindow.close()
    return
  }
  // A fixed-size, frameless window: tiling compositors float these on their own.
  miniWindow = new BrowserWindow({
    width: 400,
    height: 148,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: 'Sonodrop Mini',
    webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true }
  })
  harden(miniWindow)
  miniWindow.on('closed', () => {
    miniWindow = null
    mainWindow?.webContents.send('mini:open', false)
  })
  miniWindow.webContents.once('did-finish-load', () => mainWindow?.webContents.send('mini:open', true))
  load(miniWindow, true)
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

  ipcMain.on('shell:showInFolder', (_e, path: string) => {
    // Only reveal files the library knows about.
    if (library.snapshot().tracks.some((t) => t.path === path)) shell.showItemInFolder(path)
  })

  ipcMain.on('mini:toggle', toggleMiniWindow)
  ipcMain.on('mini:state', (_e, state: MiniState) => miniWindow?.webContents.send('mini:state', state))
  ipcMain.on('mini:command', (_e, cmd: MiniCommand) => {
    if (cmd === 'show-main') {
      if (mainWindow?.isMinimized()) mainWindow.restore()
      mainWindow?.show()
      mainWindow?.focus()
    } else {
      mainWindow?.webContents.send('mini:command', cmd)
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
    handleScheme(library)
    registerIpc()
    createMainWindow()

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
    settings?.flushSync()
    library?.flushSync()
  })
  app.on('window-all-closed', () => app.quit())
}
