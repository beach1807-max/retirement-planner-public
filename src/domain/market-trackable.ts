import type { PlannerAsset } from '../application/planner-data'

export function isMarketTrackableAssetType(assetType: PlannerAsset['assetType']): boolean {
  return assetType === 'stock' || assetType === 'etf' || assetType === 'stockEtf'
}

export function inferTwseSymbolFromAssetName(name: string): string | null {
  const symbol = name.trim().toUpperCase()
  return /^\d{4,6}[A-Z]?$/.test(symbol) ? symbol : null
}
