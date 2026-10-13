import './style.css'
import type { ActionResult, AppSnapshot, FundQuote, QuoteSource } from '@shared/types'
import { primaryChange } from './quote-display'

const isMiniMode = new URLSearchParams(window.location.search).get('mode') === 'mini'
document.body.classList.toggle('mini-mode', isMiniMode)

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id)
  if (!value) throw new Error(`缺少界面元素：${id}`)
  return value as T
}

const fundList = element<HTMLDivElement>('fund-list')
const emptyState = element<HTMLDivElement>('empty-state')
const totalValue = element<HTMLElement>('summary-total')
const liveValue = element<HTMLElement>('summary-live')
const averageValue = element<HTMLElement>('summary-average')
const lastRefresh = element<HTMLElement>('last-refresh')
const refreshButton = element<HTMLButtonElement>('refresh-button')
const addToggleButton = element<HTMLButtonElement>('add-toggle-button')
const quickAdd = element<HTMLElement>('quick-add')
const addForm = element<HTMLFormElement>('add-form')
const addButton = element<HTMLButtonElement>('add-button')
const codeInput = element<HTMLInputElement>('fund-code')
const settingsButton = element<HTMLButtonElement>('settings-button')
const settingsDialog = element<HTMLDialogElement>('settings-dialog')
const settingsForm = element<HTMLFormElement>('settings-form')
const settingsClose = element<HTMLButtonElement>('settings-close')
const settingsCancel = element<HTMLButtonElement>('settings-cancel')
const refreshInterval = element<HTMLSelectElement>('refresh-interval')
const launchAtLogin = element<HTMLInputElement>('launch-at-login')
const alwaysOnTop = element<HTMLInputElement>('always-on-top')
const windowOpacity = element<HTMLInputElement>('window-opacity')
const windowOpacityValue = element<HTMLOutputElement>('window-opacity-value')
const toast = element<HTMLDivElement>('toast')

let currentState: AppSnapshot | null = null
let toastTimer: number | null = null
const expandedFunds = new Set<string>()

const SOURCE_LABELS: Record<QuoteSource, string> = {
  legacy: '原接口',
  tiantian: '天天基金新接口',
  'sina-primary': '新浪估值',
  'sina-secondary': '新浪备用口径',
  'official-nav': '官方净值',
  cache: '本地缓存',
  unavailable: '不可用'
}

function showToast(message: string, kind: 'normal' | 'error' = 'normal'): void {
  toast.textContent = message
  toast.classList.toggle('toast-error', kind === 'error')
  toast.classList.add('toast-visible')
  if (toastTimer !== null) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toast.classList.remove('toast-visible'), 3_000)
}

function formatNumber(value: number | null, digits = 4): string {
  return value === null || !Number.isFinite(value) ? '--' : value.toFixed(digits)
}

function formatChange(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--'
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function valueClass(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value === 0) return 'value-flat'
  return value > 0 ? 'value-up' : 'value-down'
}

function friendlyTime(value: string | null): string {
  if (!value) return '尚未刷新'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date)
}

function headerTime(value: string | null): string {
  if (!value) return '正在准备数据…'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date)
}

function freshnessLabel(quote: FundQuote): string {
  switch (quote.freshness) {
    case 'today':
      return '今日估值'
    case 'recent':
      return '最近估值'
    case 'official':
      return '最新净值'
    case 'stale':
      return '缓存数据'
    default:
      return '暂无数据'
  }
}

function sourceLabel(quote: FundQuote): string {
  if (quote.source === 'cache' && quote.cachedSource) {
    return `缓存 · ${SOURCE_LABELS[quote.cachedSource]}`
  }
  return SOURCE_LABELS[quote.source]
}

function metric(label: string, value: string, className = ''): HTMLDivElement {
  const node = document.createElement('div')
  node.className = 'metric'
  const labelNode = document.createElement('span')
  labelNode.textContent = label
  const valueNode = document.createElement('strong')
  valueNode.textContent = value
  if (className) valueNode.classList.add(className)
  node.append(labelNode, valueNode)
  return node
}

function actionButton(label: string, title: string, className = ''): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `card-action ${className}`.trim()
  button.textContent = label
  button.title = title
  button.setAttribute('aria-label', title)
  return button
}

function renderFundCard(quote: FundQuote, index: number, total: number): HTMLElement {
  const card = document.createElement('details')
  card.className = `fund-card freshness-${quote.freshness}`
  card.open = expandedFunds.has(quote.code)
  card.addEventListener('toggle', () => {
    if (card.open) expandedFunds.add(quote.code)
    else expandedFunds.delete(quote.code)
  })

  const summary = document.createElement('summary')
  summary.className = 'fund-summary'
  const identity = document.createElement('div')
  identity.className = 'fund-identity'
  const name = document.createElement('h3')
  name.textContent = quote.name
  const code = document.createElement('span')
  code.textContent = quote.code
  identity.append(name, code)

  const displayedChange = primaryChange(quote)
  const primary = document.createElement('div')
  primary.className = `fund-primary ${valueClass(displayedChange.value)}`
  primary.title = displayedChange.title
  const primaryLabel = document.createElement('span')
  primaryLabel.className = 'primary-label'
  primaryLabel.textContent = displayedChange.label
  const direction = document.createElement('span')
  direction.className = 'change-direction'
  direction.textContent =
    displayedChange.value === null || displayedChange.value === 0
      ? '—'
      : displayedChange.value > 0
        ? '▲'
        : '▼'
  const change = document.createElement('strong')
  change.textContent = formatChange(displayedChange.value)
  primary.append(primaryLabel, direction, change)
  summary.append(identity, primary)

  const values = document.createElement('div')
  values.className = 'fund-values'
  values.append(
    metric('估算净值', formatNumber(quote.estimatedNav)),
    metric('估算涨跌', formatChange(quote.estimatedChange), valueClass(quote.estimatedChange)),
    metric('官方净值', formatNumber(quote.officialNav)),
    metric('官方日涨跌', formatChange(quote.officialChange), valueClass(quote.officialChange)),
    metric('数据时间', quote.valuationTime || '--'),
    metric('净值日期', quote.officialDate || '--')
  )

  const detail = document.createElement('div')
  detail.className = 'fund-detail'
  const meta = document.createElement('div')
  meta.className = 'fund-meta'
  const badges = document.createElement('div')
  badges.className = 'badges'
  const freshness = document.createElement('span')
  freshness.className = `badge badge-${quote.freshness}`
  freshness.textContent = freshnessLabel(quote)
  const source = document.createElement('span')
  source.className = 'badge badge-source'
  source.textContent = sourceLabel(quote)
  badges.append(freshness, source)

  const message = document.createElement('span')
  message.className = quote.error ? 'fund-message warning-message' : 'fund-message'
  message.textContent = quote.error || `更新于 ${friendlyTime(quote.fetchedAt)}`
  meta.append(badges, message)

  const actions = document.createElement('div')
  actions.className = 'card-actions'
  const up = actionButton('↑', `上移 ${quote.name}`)
  up.disabled = index === 0
  up.addEventListener('click', () => void moveFund(index, -1))
  const down = actionButton('↓', `下移 ${quote.name}`)
  down.disabled = index === total - 1
  down.addEventListener('click', () => void moveFund(index, 1))
  const remove = actionButton('删除', `删除 ${quote.name}`, 'danger-action')
  remove.addEventListener('click', () => void removeFund(quote))
  actions.append(up, down, remove)
  detail.append(values, meta, actions)

  card.append(summary, detail)
  return card
}

function render(state: AppSnapshot): void {
  currentState = state
  totalValue.textContent = String(state.funds.length)
  const liveQuotes = state.quotes.filter(
    (quote) => quote.freshness === 'today' && quote.estimatedChange !== null
  )
  liveValue.textContent = String(liveQuotes.length)
  const average =
    liveQuotes.length > 0
      ? liveQuotes.reduce((sum, quote) => sum + (quote.estimatedChange ?? 0), 0) / liveQuotes.length
      : null
  averageValue.textContent = formatChange(average)
  averageValue.className = valueClass(average)

  lastRefresh.textContent = headerTime(state.lastRefreshAt)
  refreshButton.disabled = state.refreshing
  refreshButton.textContent = '↻'
  refreshButton.title = state.refreshing ? '正在刷新' : '立即刷新'
  refreshButton.setAttribute('aria-label', refreshButton.title)
  refreshButton.classList.toggle('is-spinning', state.refreshing)

  const quoteMap = new Map(state.quotes.map((quote) => [quote.code, quote]))
  const orderedQuotes = state.funds.map(
    (fund) =>
      quoteMap.get(fund.code) ?? {
        code: fund.code,
        name: `基金 ${fund.code}`,
        officialNav: null,
        officialChange: null,
        officialDate: null,
        estimatedNav: null,
        estimatedChange: null,
        valuationTime: null,
        source: 'unavailable' as const,
        freshness: 'unavailable' as const,
        fetchedAt: fund.addedAt,
        error: '等待首次刷新'
      }
  )
  fundList.replaceChildren(
    ...orderedQuotes.map((quote, index) => renderFundCard(quote, index, orderedQuotes.length))
  )
  emptyState.hidden = state.funds.length > 0

  refreshInterval.value = String(state.settings.refreshIntervalSeconds)
  launchAtLogin.checked = state.settings.launchAtLogin
  alwaysOnTop.checked = state.settings.alwaysOnTop
  windowOpacity.value = String(Math.round(state.settings.windowOpacity * 100))
  windowOpacityValue.value = `${windowOpacity.value}%`
}

async function consumeResult(result: ActionResult<AppSnapshot>, successMessage?: string): Promise<void> {
  if (!result.ok || !result.data) {
    showToast(result.error || '操作失败', 'error')
    return
  }
  render(result.data)
  if (successMessage) showToast(successMessage)
}

async function moveFund(index: number, offset: number): Promise<void> {
  if (!currentState) return
  const codes = currentState.funds.map((fund) => fund.code)
  const target = index + offset
  if (target < 0 || target >= codes.length) return
  const current = codes[index]
  const other = codes[target]
  if (!current || !other) return
  codes[index] = other
  codes[target] = current
  await consumeResult(await window.fundApp.reorderFunds(codes))
}

async function removeFund(quote: FundQuote): Promise<void> {
  if (!window.confirm(`确定从列表中删除“${quote.name}（${quote.code}）”吗？`)) return
  await consumeResult(await window.fundApp.removeFund(quote.code), '基金已删除')
}

addForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const code = codeInput.value.trim()
  if (!/^\d{6}$/.test(code)) {
    showToast('请输入六位基金代码', 'error')
    codeInput.focus()
    return
  }
  addButton.disabled = true
  addButton.textContent = '验证中…'
  try {
    const result = await window.fundApp.addFund(code)
    if (result.ok) {
      codeInput.value = ''
      quickAdd.hidden = true
      addToggleButton.textContent = '＋'
      addToggleButton.setAttribute('aria-expanded', 'false')
    }
    await consumeResult(result, '基金已添加')
  } finally {
    addButton.disabled = false
    addButton.textContent = '添加'
  }
})

addToggleButton.addEventListener('click', () => {
  const opening = quickAdd.hidden
  quickAdd.hidden = !opening
  addToggleButton.textContent = opening ? '×' : '＋'
  addToggleButton.setAttribute('aria-expanded', String(opening))
  if (opening) codeInput.focus()
})

codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6)
})

refreshButton.addEventListener('click', async () => {
  await consumeResult(await window.fundApp.refresh(), '刷新完成')
})

settingsButton.addEventListener('click', () => settingsDialog.showModal())
settingsClose.addEventListener('click', () => settingsDialog.close())
settingsCancel.addEventListener('click', () => settingsDialog.close())
settingsDialog.addEventListener('click', (event) => {
  if (event.target === settingsDialog) settingsDialog.close()
})
windowOpacity.addEventListener('input', () => {
  windowOpacityValue.value = `${windowOpacity.value}%`
})
settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const result = await window.fundApp.updateSettings({
    refreshIntervalSeconds: Number(refreshInterval.value),
    launchAtLogin: launchAtLogin.checked,
    alwaysOnTop: alwaysOnTop.checked,
    windowOpacity: Number(windowOpacity.value) / 100
  })
  if (result.ok) settingsDialog.close()
  await consumeResult(result, '设置已保存')
})

async function start(): Promise<void> {
  try {
    render(await window.fundApp.getState())
    window.fundApp.onStateChanged(render)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '应用初始化失败', 'error')
  }
}

void start()
