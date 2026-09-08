import type { PlannerAsset } from '../application/planner-data'

export type AllocationClass = NonNullable<PlannerAsset['allocationClass']>

export function defaultAllocationClassForAssetType(assetType: PlannerAsset['assetType']): AllocationClass {
  if (assetType === 'cash' || assetType === 'timeDeposit') return 'cash'
  if (assetType === 'stock' || assetType === 'etf' || assetType === 'stockEtf') return 'stock'
  if (assetType === 'bond') return 'bond'
  if (assetType === 'moneyMarketFund') return 'moneyMarket'
  return 'other'
}
