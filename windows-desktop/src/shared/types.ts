export const DEFAULT_FUND_CODES = [
  '013273',
  '004070',
  '024618',
  '007883',
  '013172',
  '006195',
  '024003',
  '021458',
  '012414',
  '018561',
  '014415'
] as const

export type QuoteSource =
  | 'legacy'
  | 'tiantian'
  | 'sina-primary'
  | 'sina-secondary'
  | 'official-nav'
  | 'cache'
  | 'unavailable'

export type QuoteFreshness = 'today' | 'recent' | 'official' | 'stale' | 'unavailable'

export interface FundConfig {
  code: string
  addedAt: string
  order: number
}

export interface FundQuote {
  code: string
  name: string
  officialNav: number | null
  officialChange: number | null
  officialDate: string | null
  estimatedNav: number | null
  estimatedChange: number | null
  valuationTime: string | null
  source: QuoteSource
  cachedSource?: QuoteSource
  freshness: QuoteFreshness
  fetchedAt: string
  error?: string
}

export interface SourceHealth {
  id: string
  displayName: string
  consecutiveFailures: number
  disabledUntil: string | null
  lastSuccessAt: string | null
  lastFailureAt: string | null
}

export interface AppSettings {
  refreshIntervalSeconds: number
  launchAtLogin: boolean
  alwaysOnTop: boolean
  windowOpacity: number
  closeToTray: true
}

export interface AppSnapshot {
  funds: FundConfig[]
  quotes: FundQuote[]
  settings: AppSettings
  sourceHealth: SourceHealth[]
  refreshing: boolean
  lastRefreshAt: string | null
}

export interface PersistedState {
  version: 1
  funds: FundConfig[]
  quotes: Record<string, FundQuote>
  settings: AppSettings
  sourceHealth: SourceHealth[]
  lastRefreshAt: string | null
}

export type SettingsPatch = Partial<
  Pick<AppSettings, 'refreshIntervalSeconds' | 'launchAtLogin' | 'alwaysOnTop' | 'windowOpacity'>
>

export interface ActionResult<T> {
  ok: boolean
  data?: T
  error?: string
}

export interface FundAppApi {
  getState(): Promise<AppSnapshot>
  addFund(code: string): Promise<ActionResult<AppSnapshot>>
  removeFund(code: string): Promise<ActionResult<AppSnapshot>>
  reorderFunds(codes: string[]): Promise<ActionResult<AppSnapshot>>
  refresh(): Promise<ActionResult<AppSnapshot>>
  updateSettings(patch: SettingsPatch): Promise<ActionResult<AppSnapshot>>
  onStateChanged(listener: (state: AppSnapshot) => void): () => void
}

export const IPC_CHANNELS = {
  GET_STATE: 'fund-app:get-state',
  ADD_FUND: 'fund-app:add-fund',
  REMOVE_FUND: 'fund-app:remove-fund',
  REORDER_FUNDS: 'fund-app:reorder-funds',
  REFRESH: 'fund-app:refresh',
  UPDATE_SETTINGS: 'fund-app:update-settings',
  STATE_CHANGED: 'fund-app:state-changed'
} as const
