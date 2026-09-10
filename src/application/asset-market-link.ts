import type { PlannerAccount, PlannerData } from './planner-data'
import { marketDefaults, normalizeMarketSymbol, type SupportedMarket } from '../domain/market-trackable'

export interface AssetMarketLinkInput {
  assetId: string
  enabled: boolean
  symbol?: string
  quantity?: string
  accountId?: string
  market?: SupportedMarket
}

export function upsertAssetMarketLink(data: PlannerData, input: AssetMarketLinkInput): PlannerData {
  const next = structuredClone(data)
  const now = new Date().toISOString()
  if (!input.enabled) {
    const instrumentIds = new Set(next.instruments.filter((item) => item.assetId === input.assetId).map((item) => item.id))
    next.instruments = next.instruments.filter((item) => item.assetId !== input.assetId)
    next.holdings = next.holdings.filter((item) => item.assetId !== input.assetId)
    next.marketQuotes = next.marketQuotes.filter((item) => !instrumentIds.has(item.instrumentId))
    return next
  }

  const symbol = input.symbol?.trim().toUpperCase() ?? ''
  const quantity = input.quantity?.trim() ?? ''
  const market = input.market ?? 'TWSE'
  if (!normalizeMarketSymbol(market, symbol)) throw new Error('INVALID_MARKET_SYMBOL')
  if (!quantity) throw new Error('MISSING_HOLDING_QUANTITY')

  let account = input.accountId ? next.accounts.find((item) => item.id === input.accountId) : undefined
  if (!account) {
    account = next.accounts.find((item) => item.id === 'market-tracked-account')
    if (!account) {
      account = {
        id: 'market-tracked-account', householdId: next.household.id, name: '行情追蹤帳戶', institution: '資產表單自動建立',
        accountType: 'brokerage', ownershipType: 'household', status: 'provided', createdAt: now, updatedAt: now,
      } satisfies PlannerAccount
      next.accounts.push(account)
    }
  }

  const existingInstrument = next.instruments.find((item) => item.assetId === input.assetId)
  const instrument = {
    id: existingInstrument?.id ?? crypto.randomUUID(), householdId: next.household.id, assetId: input.assetId,
    symbol, market, ...marketDefaults(market), providerSymbol: symbol, instrumentKey: `${market}:${symbol}`, instrumentType: 'stock' as const, createdAt: existingInstrument?.createdAt ?? now, updatedAt: now,
  }
  next.instruments = existingInstrument
    ? next.instruments.map((item) => item.id === existingInstrument.id ? instrument : item)
    : [...next.instruments, instrument]
  if (existingInstrument?.instrumentKey !== instrument.instrumentKey) next.marketQuotes = next.marketQuotes.filter((item) => item.instrumentId !== instrument.id)

  const existingHolding = next.holdings.find((item) => item.assetId === input.assetId && item.accountId === account.id)
    ?? next.holdings.find((item) => item.assetId === input.assetId)
  const holding = {
    id: existingHolding?.id ?? crypto.randomUUID(), householdId: next.household.id, accountId: account.id,
    assetId: input.assetId, quantity, status: 'provided' as const, createdAt: existingHolding?.createdAt ?? now, updatedAt: now,
  }
  next.holdings = existingHolding
    ? next.holdings.map((item) => item.id === existingHolding.id ? holding : item)
    : [...next.holdings, holding]
  next.assets = next.assets.map((asset) => asset.id === input.assetId ? { ...asset, accountId: account.id, updatedAt: now } : asset)
  return next
}
