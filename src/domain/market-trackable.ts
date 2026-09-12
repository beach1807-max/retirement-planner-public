import type { PlannerAsset } from '../application/planner-data'

export function isMarketTrackableAssetType(assetType: PlannerAsset['assetType']): boolean {
  return assetType === 'stock' || assetType === 'etf' || assetType === 'stockEtf'
}

export function inferTwseSymbolFromAssetName(name: string): string | null {
  const symbol = name.trim().toUpperCase()
  return /^\d{4,6}[A-Z]?$/.test(symbol) ? symbol : null
}

export type SupportedMarket = 'TWSE' | 'TPEX' | 'US'

export function normalizeMarketSymbol(market: SupportedMarket, value: string): string | null {
  const symbol = value.trim().toUpperCase()
  if (market === 'US') return /^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol) ? symbol : null
  return /^\d{4,6}[A-Z]?$/.test(symbol) ? symbol : null
}

export function marketDefaults(market: SupportedMarket) {
  if (market === 'TWSE') return { currency: 'TWD' as const, mic: 'XTAI' as const, timezone: 'Asia/Taipei' }
  if (market === 'TPEX') return { currency: 'TWD' as const, mic: 'ROCO' as const, timezone: 'Asia/Taipei' }
  return { currency: 'USD' as const, mic: 'US' as const, timezone: 'America/New_York' }
}

// 已確認的市場資料；其他台股在查價時由 TWSE → FinMind 自動備援。
export function resolveMarket(symbol: string, market: SupportedMarket): SupportedMarket {
  return market !== 'US' && symbol.trim().toUpperCase() === '00679B' ? 'TPEX' : market
}
