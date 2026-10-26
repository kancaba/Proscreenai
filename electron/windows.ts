import { app, BrowserWindow, ipcMain, Menu, type MenuItemConstructorOptions } from 'electron'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const nodeRequire = createRequire(import.meta.url)

const APP_ROOT = path.join(__dirname, '..')
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const RENDERER_DIST = path.join(APP_ROOT, 'dist')
const WINDOW_ICON_PATH = path.join(process.env.VITE_PUBLIC || RENDERER_DIST, 'app-icons', 'screenmovie-512.png')

let hudOverlayWindow: BrowserWindow | null = null;
let countdownWindow: BrowserWindow | null = null;
let hudIdleBounds: Electron.Rectangle | null = null;
let hudIsRecording = false;

export function setHudRecordingState(recording: boolean) {
  const win = hudOverlayWindow;
  if (!win || win.isDestroyed() || hudIsRecording === recording) return;
  hudIsRecording = recording;
  const bounds = win.getBounds();
  if (recording) {
    hudIdleBounds = bounds;
    const workArea = getScreen().getDisplayMatching(bounds).workArea;
    const width = 220;
    const height = 60;
    win.setMinimumSize(width, height);
    win.setMaximumSize(660, 170);
    win.setBounds({
      width, height,
      x: Math.max(workArea.x, Math.min(Math.round(bounds.x + bounds.width / 2 - width / 2), workArea.x + workArea.width - width)),
      y: Math.max(workArea.y, Math.min(bounds.y + bounds.height - height, workArea.y + workArea.height - height)),
    });
  } else if (hudIdleBounds) {
    // Keep the bar on its current display if it was dragged while recording.
    const workArea = getScreen().getDisplayMatching(bounds).workArea;
    win.setMaximumSize(660, 170);
    win.setBounds({
      width: 660, height: 170,
      x: Math.max(workArea.x, Math.min(Math.round(bounds.x + bounds.width / 2 - 330), workArea.x + workArea.width - 660)),
      y: Math.max(workArea.y, Math.min(bounds.y + bounds.height - 170, workArea.y + workArea.height - 170)),
    });
    win.setMinimumSize(660, 170);
    hudIdleBounds = null;
  }
}

function getScreen() {
  return nodeRequire('electron').screen as typeof import('electron').screen
}

// The recorder bar's window is too short for dropdowns, so its menus are native popups.
type HudMenuItem = { id?: string; label?: string; type?: 'separator' | 'radio'; checked?: boolean; submenu?: HudMenuItem[] }
function hudMenuTemplate(items: unknown, depth: number, choose: (id: string) => void): MenuItemConstructorOptions[] {
  if (!Array.isArray(items) || depth > 2) return []
  return items.slice(0, 20).flatMap((raw): MenuItemConstructorOptions[] => {
    const item = (typeof raw === 'object' && raw !== null ? raw : {}) as HudMenuItem
    if (item.type === 'separator') return [{ type: 'separator' }]
    const label = typeof item.label === 'string' ? item.label.slice(0, 80) : ''
    if (!label) return []
    if (Array.isArray(item.submenu)) return [{ label, submenu: hudMenuTemplate(item.submenu, depth + 1, choose) }]
    const id = typeof item.id === 'string' ? item.id.slice(0, 64) : ''
    if (!id) return []
    return [{ label, type: item.type === 'radio' ? 'radio' : 'normal', checked: item.checked === true, click: () => choose(id) }]
  })
}
ipcMain.handle('hud-show-menu', (event, items: unknown) => new Promise<string | null>((resolve) => {
  let chosen: string | null = null
  const menu = Menu.buildFromTemplate(hudMenuTemplate(items, 0, (id) => { chosen = id }))
  menu.popup({ window: BrowserWindow.fromWebContents(event.sender) ?? undefined, callback: () => resolve(chosen) })
}))

ipcMain.on('hud-overlay-hide', () => {
  if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
    hudOverlayWindow.minimize();
  }
});

export function createHudOverlayWindow(): BrowserWindow {
  const primaryDisplay = getScreen().getPrimaryDisplay();
  const { workArea } = primaryDisplay;


  const windowWidth = 660;
  const windowHeight = 170;

  const x = Math.floor(workArea.x + (workArea.width - windowWidth) / 2);
  const y = Math.floor(workArea.y + workArea.height - windowHeight - 5);

  const win = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: 660,
    maxWidth: 660,
    minHeight: 170,
    maxHeight: 170,
    x: x,
    y: y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  })


  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
    setTimeout(() => {
      if (!win.isDestroyed()) {
        win.show()
      }
    }, 100)
  })

  hudOverlayWindow = win;
  hudIdleBounds = null;
  hudIsRecording = false;
  // Windows uses WDA_EXCLUDEFROMCAPTURE. On macOS the native helper also
  // explicitly excludes our windows because ScreenCaptureKit can ignore this flag.
  win.setContentProtection(true);

  win.on('closed', () => {
    if (hudOverlayWindow === win) {
      hudOverlayWindow = null;
    }
  });


  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL + '?windowType=hud-overlay')
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'), { 
      query: { windowType: 'hud-overlay' } 
    })
  }

  return win
}

export function createEditorWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin';

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    ...(process.platform !== 'darwin' && {
      icon: WINDOW_ICON_PATH,
    }),
    ...(isMac && {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 12, y: 12 },
    }),
    transparent: false,
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    title: 'Pro Screen AI',
    show: false,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      backgroundThrottling: false,
    },
  })

  win.once('ready-to-show', () => {
    win.show()
    win.maximize()
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL + '?windowType=editor')
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'), { 
      query: { windowType: 'editor' } 
    })
  }

  return win
}

export function createSourceSelectorWindow(): BrowserWindow {
  const { width, height } = getScreen().getPrimaryDisplay().workAreaSize
  
  const win = new BrowserWindow({
    width: 620,
    height: Math.min(760, height),
    minHeight: 350,
    maxHeight: height,
    x: Math.round((width - 620) / 2),
    y: Math.max(0, Math.round((height - Math.min(760, height)) / 2)),
    frame: false,
    resizable: true,
    alwaysOnTop: false,
    transparent: true,
    show: false,
    ...(process.platform !== 'darwin' && {
      icon: WINDOW_ICON_PATH,
    }),
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.webContents.on('did-finish-load', () => {
    setTimeout(() => {
      if (!win.isDestroyed()) {
        win.show()
      }
    }, 100)
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL + '?windowType=source-selector')
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'), {
      query: { windowType: 'source-selector' }
    })
  }

  return win
}

/** Transparent full-display window for drawing the area to record (like Cmd+Shift+5). */
export function createRegionSelectorWindow(display: Electron.Display): BrowserWindow {
  const win = new BrowserWindow({
    ...display.bounds,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    skipTaskbar: true,
    enableLargerThanScreen: true,
    roundedCorners: false,
    // The first drag must draw, not just activate the window (macOS click-through).
    acceptFirstMouse: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // Above the menu bar and Dock, on whichever Space the user is in.
  win.setAlwaysOnTop(true, 'screen-saver')
  // Without skipTransformProcessType macOS turns the app into a background app and the Dock icon disappears.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  win.setBounds(display.bounds)

  win.webContents.on('did-finish-load', () => {
    if (win.isDestroyed()) return
    win.setBounds(display.bounds)
    // Opened from the HUD while another app is active: take focus so keys and clicks land here.
    if (process.platform === 'darwin') app.focus({ steal: true })
    win.show()
    win.focus()
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL + '?windowType=region-selector')
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'), {
      query: { windowType: 'region-selector' }
    })
  }

  return win
}

export function createCountdownWindow(): BrowserWindow {
  const primaryDisplay = getScreen().getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const windowSize = 200;
  const x = Math.floor((width - windowSize) / 2);
  const y = Math.floor((height - windowSize) / 2);

  const win = new BrowserWindow({
    width: windowSize,
    height: windowSize,
    x: x,
    y: y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  countdownWindow = win;

  // Show on all workspaces/spaces so it follows the user
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });

  win.on('closed', () => {
    if (countdownWindow === win) {
      countdownWindow = null;
    }
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL + '?windowType=countdown')
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'), {
      query: { windowType: 'countdown' }
    })
  }

  return win
}

export function getCountdownWindow(): BrowserWindow | null {
  return countdownWindow;
}

export function closeCountdownWindow(): void {
  if (countdownWindow && !countdownWindow.isDestroyed()) {
    countdownWindow.close();
    countdownWindow = null;
  }
}


export function createWelcomeWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1180, height: 820, minWidth: 920, minHeight: 680,
    title: 'Pro Screen AI', backgroundColor: '#101014', show: false,
    ...(process.platform === 'darwin' ? {
      titleBarStyle: 'hiddenInset' as const,
      trafficLightPosition: { x: 20, y: 23 },
    } : { icon: WINDOW_ICON_PATH }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false, contextIsolation: true,
    },
  })
  win.once('ready-to-show', () => win.show())
  if (VITE_DEV_SERVER_URL) {
    void win.loadURL(VITE_DEV_SERVER_URL + '?windowType=welcome')
  } else {
    void win.loadFile(path.join(RENDERER_DIST, 'index.html'), { query: { windowType: 'welcome' } })
  }
  return win
}
