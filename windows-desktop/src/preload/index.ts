import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type ActionResult,
  type AppSnapshot,
  type FundAppApi,
  type SettingsPatch
} from '@shared/types'

const api: FundAppApi = {
  getState: () => ipcRenderer.invoke(IPC_CHANNELS.GET_STATE) as Promise<AppSnapshot>,
  addFund: (code: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ADD_FUND, code) as Promise<ActionResult<AppSnapshot>>,
  removeFund: (code: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.REMOVE_FUND, code) as Promise<ActionResult<AppSnapshot>>,
  reorderFunds: (codes: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.REORDER_FUNDS, codes) as Promise<ActionResult<AppSnapshot>>,
  refresh: () => ipcRenderer.invoke(IPC_CHANNELS.REFRESH) as Promise<ActionResult<AppSnapshot>>,
  updateSettings: (patch: SettingsPatch) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SETTINGS, patch) as Promise<ActionResult<AppSnapshot>>,
  onStateChanged: (listener: (state: AppSnapshot) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: AppSnapshot): void => listener(state)
    ipcRenderer.on(IPC_CHANNELS.STATE_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.STATE_CHANGED, handler)
  }
}
contextBridge.exposeInMainWorld('fundApp', api)

declare global {
  interface Window {
    fundApp: FundAppApi
  }
}
