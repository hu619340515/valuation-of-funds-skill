import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  Tray,
  type MenuItemConstructorOptions
} from 'electron'
import {
  IPC_CHANNELS,
  type ActionResult,
  type AppSnapshot,
  type PersistedState,
  type SettingsPatch
} from '@shared/types'
import { FundDataService } from './data/service'
import { createDefaultSources } from './data/sources'
import { AppStore } from './store'

const APP_ID = 'com.hu619340515.fundvaluation'
const hiddenLaunch = process.argv.includes('--hidden')
const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let miniWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let refreshTimer: NodeJS.Timeout | null = null
let miniHideTimer: NodeJS.Timeout | null = null
let refreshPromise: Promise<void> | null = null
let refreshing = false
let persistedState: PersistedState
let store: AppStore
let dataService: FundDataService

function resourcePath(fileName: string): string {
  if (app.isPackaged) return join(process.resourcesPath, 'resources', fileName)
  return join(__dirname, '..', '..', 'resources', fileName)
}

function loginExecutablePath(): string {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath
}

function applyLoginSetting(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: loginExecutablePath(),
    args: ['--hidden']
  })
}

function snapshot(): AppSnapshot {
  const funds = [...persistedState.funds].sort((a, b) => a.order - b.order)
  return {
    funds,
    quotes: funds
      .map((fund) => persistedState.quotes[fund.code])
      .filter((quote) => quote !== undefined),
    settings: { ...persistedState.settings },
    sourceHealth: dataService?.getHealth() ?? persistedState.sourceHealth,
    refreshing,
    lastRefreshAt: persistedState.lastRefreshAt
  }
}

function broadcastState(): void {
  const current = snapshot()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.STATE_CHANGED, current)
  }
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.webContents.send(IPC_CHANNELS.STATE_CHANGED, current)
  }
  updateTray()
}

function showWindow(): void {
  hideMiniWindow()
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function updateTray(): void {
  if (!tray) return
  const template: MenuItemConstructorOptions[] = [
    { label: '打开基金估值', click: showWindow },
    {
      label: refreshing ? '正在刷新…' : '立即刷新',
      enabled: !refreshing,
      click: () => void refreshFunds()
    },
    { type: 'separator' },
    {
      label: '开机启动',
      type: 'checkbox',
      checked: persistedState.settings.launchAtLogin,
      click: (item) => void updateSettings({ launchAtLogin: item.checked })
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ]
  tray.setContextMenu(Menu.buildFromTemplate(template))
  const time = persistedState.lastRefreshAt
    ? new Date(persistedState.lastRefreshAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : '尚未刷新'
  tray.setToolTip(`基金估值 · ${time}`)
}

function createMiniWindow(): BrowserWindow {
  if (miniWindow && !miniWindow.isDestroyed()) return miniWindow

  miniWindow = new BrowserWindow({
    width: 326,
    height: 440,
    show: false,
    frame: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    backgroundColor: '#0e1117',
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  miniWindow.setOpacity(persistedState.settings.windowOpacity)
  miniWindow.setIgnoreMouseEvents(true)
  miniWindow.setMenu(null)
  miniWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  miniWindow.webContents.on('will-navigate', (event) => event.preventDefault())
  miniWindow.on('closed', () => {
    miniWindow = null
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void miniWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}?mode=mini`)
  } else {
    void miniWindow.loadFile(join(__dirname, '..', 'renderer', 'index.html'), {
      query: { mode: 'mini' }
    })
  }
  return miniWindow
}

function positionMiniWindow(window: BrowserWindow): void {
  if (!tray) return
  const trayBounds = tray.getBounds()
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
  const workArea = display.workArea
  const bounds = window.getBounds()
  const centerX = trayBounds.x + Math.round(trayBounds.width / 2)
  const desiredX = Math.round(centerX - bounds.width / 2)
  const x = Math.min(
    Math.max(desiredX, workArea.x),
    workArea.x + workArea.width - bounds.width
  )
  const taskbarIsBelow = trayBounds.y > workArea.y + workArea.height / 2
  const desiredY = taskbarIsBelow
    ? trayBounds.y - bounds.height - 8
    : trayBounds.y + trayBounds.height + 8
  const y = Math.min(
    Math.max(desiredY, workArea.y),
    workArea.y + workArea.height - bounds.height
  )
  window.setPosition(x, y, false)
}

function showMiniWindow(): void {
  if (miniHideTimer) {
    clearTimeout(miniHideTimer)
    miniHideTimer = null
  }
  const window = createMiniWindow()
  const reveal = (): void => {
    if (window.isDestroyed()) return
    positionMiniWindow(window)
    window.showInactive()
  }
  if (window.webContents.isLoading()) window.webContents.once('did-finish-load', reveal)
  else reveal()
}

function hideMiniWindow(delayMs = 0): void {
  if (miniHideTimer) clearTimeout(miniHideTimer)
  miniHideTimer = null
  if (delayMs > 0) {
    miniHideTimer = setTimeout(() => hideMiniWindow(), delayMs)
    return
  }
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.hide()
}

function createTray(): void {
  const image = nativeImage.createFromPath(resourcePath('tray.ico'))
  tray = new Tray(image)
  tray.on('mouse-enter', showMiniWindow)
  tray.on('mouse-leave', () => hideMiniWindow(350))
  tray.on('click', showWindow)
  tray.on('double-click', showWindow)
  tray.on('right-click', () => hideMiniWindow())
  updateTray()
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 780,
    minWidth: 360,
    minHeight: 480,
    show: false,
    alwaysOnTop: persistedState.settings.alwaysOnTop,
    minimizable: true,
    skipTaskbar: false,
    title: '基金估值',
    icon: resourcePath('app.ico'),
    backgroundColor: '#f6f7f9',
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  mainWindow.setOpacity(persistedState.settings.windowOpacity)

  mainWindow.setMenu(null)
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '..', 'renderer', 'index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    if (!hiddenLaunch) showWindow()
  })
}

async function persist(): Promise<void> {
  persistedState.sourceHealth = dataService.getHealth()
  await store.save(persistedState)
}

async function refreshFunds(): Promise<void> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    refreshing = true
    broadcastState()
    try {
      const codes = persistedState.funds.sort((a, b) => a.order - b.order).map((fund) => fund.code)
      if (codes.length > 0) {
        persistedState.quotes = await dataService.refresh(codes, persistedState.quotes)
      } else {
        persistedState.quotes = {}
      }
      persistedState.lastRefreshAt = new Date().toISOString()
      await persist()
    } catch (error) {
      console.error('刷新基金数据失败：', error)
    } finally {
      refreshing = false
      refreshPromise = null
      broadcastState()
    }
  })()
  return refreshPromise
}

function scheduleRefresh(): void {
  if (refreshTimer) clearInterval(refreshTimer)
  refreshTimer = setInterval(
    () => void refreshFunds(),
    persistedState.settings.refreshIntervalSeconds * 1000
  )
}

async function updateSettings(patch: SettingsPatch): Promise<ActionResult<AppSnapshot>> {
  try {
    if (patch.refreshIntervalSeconds !== undefined) {
      if (![30, 60, 120, 300].includes(patch.refreshIntervalSeconds)) {
        return { ok: false, error: '刷新间隔无效' }
      }
      persistedState.settings.refreshIntervalSeconds = patch.refreshIntervalSeconds
    }
    if (patch.launchAtLogin !== undefined) {
      persistedState.settings.launchAtLogin = Boolean(patch.launchAtLogin)
      applyLoginSetting(persistedState.settings.launchAtLogin)
    }
    if (patch.alwaysOnTop !== undefined) {
      persistedState.settings.alwaysOnTop = Boolean(patch.alwaysOnTop)
      mainWindow?.setAlwaysOnTop(persistedState.settings.alwaysOnTop)
    }
    if (patch.windowOpacity !== undefined) {
      const opacity = Number(patch.windowOpacity)
      if (!Number.isFinite(opacity) || opacity < 0.55 || opacity > 1) {
        return { ok: false, error: '窗口透明度无效' }
      }
      persistedState.settings.windowOpacity = opacity
      mainWindow?.setOpacity(opacity)
      miniWindow?.setOpacity(opacity)
    }
    await persist()
    scheduleRefresh()
    broadcastState()
    return { ok: true, data: snapshot() }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '设置保存失败' }
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.GET_STATE, () => snapshot())

  ipcMain.handle(IPC_CHANNELS.ADD_FUND, async (_event, rawCode: unknown): Promise<ActionResult<AppSnapshot>> => {
    const code = String(rawCode ?? '').trim()
    if (!/^\d{6}$/.test(code)) return { ok: false, error: '请输入六位基金代码' }
    if (persistedState.funds.some((fund) => fund.code === code)) {
      return { ok: false, error: '该基金已经在列表中' }
    }

    const validation = await dataService.refresh([code], {})
    const quote = validation[code]
    if (!quote || quote.source === 'unavailable') {
      return { ok: false, error: '未找到该基金，或当前数据源暂时不可用' }
    }

    persistedState.funds.push({
      code,
      order: persistedState.funds.length,
      addedAt: new Date().toISOString()
    })
    persistedState.quotes[code] = quote
    await persist()
    broadcastState()
    return { ok: true, data: snapshot() }
  })

  ipcMain.handle(IPC_CHANNELS.REMOVE_FUND, async (_event, rawCode: unknown): Promise<ActionResult<AppSnapshot>> => {
    const code = String(rawCode ?? '').trim()
    const before = persistedState.funds.length
    persistedState.funds = persistedState.funds
      .filter((fund) => fund.code !== code)
      .map((fund, order) => ({ ...fund, order }))
    if (persistedState.funds.length === before) return { ok: false, error: '基金不存在' }
    delete persistedState.quotes[code]
    await persist()
    broadcastState()
    return { ok: true, data: snapshot() }
  })

  ipcMain.handle(
    IPC_CHANNELS.REORDER_FUNDS,
    async (_event, rawCodes: unknown): Promise<ActionResult<AppSnapshot>> => {
      if (!Array.isArray(rawCodes)) return { ok: false, error: '排序数据无效' }
      const codes = rawCodes.map(String)
      const existing = persistedState.funds.map((fund) => fund.code)
      if (
        codes.length !== existing.length ||
        new Set(codes).size !== codes.length ||
        existing.some((code) => !codes.includes(code))
      ) {
        return { ok: false, error: '排序数据与基金列表不一致' }
      }
      const byCode = new Map(persistedState.funds.map((fund) => [fund.code, fund]))
      persistedState.funds = codes.map((code, order) => ({ ...byCode.get(code)!, order }))
      await persist()
      broadcastState()
      return { ok: true, data: snapshot() }
    }
  )

  ipcMain.handle(IPC_CHANNELS.REFRESH, async (): Promise<ActionResult<AppSnapshot>> => {
    await refreshFunds()
    return { ok: true, data: snapshot() }
  })

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_SETTINGS,
    (_event, patch: SettingsPatch): Promise<ActionResult<AppSnapshot>> => updateSettings(patch ?? {})
  )
}

async function bootstrap(): Promise<void> {
  app.setAppUserModelId(APP_ID)
  Menu.setApplicationMenu(null)

  store = new AppStore(app.getPath('userData'))
  persistedState = await store.load()
  dataService = new FundDataService({
    sources: createDefaultSources(),
    initialHealth: persistedState.sourceHealth,
    onHealthChanged: (health) => {
      persistedState.sourceHealth = health
    }
  })

  applyLoginSetting(persistedState.settings.launchAtLogin)
  registerIpc()
  createWindow()
  createTray()
  scheduleRefresh()
  void refreshFunds()
}

if (gotSingleInstanceLock) {
  app.on('second-instance', showWindow)
  app.on('before-quit', () => {
    isQuitting = true
    if (refreshTimer) clearInterval(refreshTimer)
    if (miniHideTimer) clearTimeout(miniHideTimer)
  })
  app.on('window-all-closed', () => {
    // 主窗口关闭时应用继续驻留系统托盘。
  })
  app.on('activate', showWindow)
  void app.whenReady().then(bootstrap)
}
