import type { AssetReturnPreset, AssetReturnPresetKey } from './models'

export const DEFAULT_ASSET_RETURN_PRESETS: AssetReturnPreset[] = [
  { key: 'cash', label: '現金', scenarioRates: { conservative: '0', balanced: '0', optimistic: '0' } },
  { key: 'timeDeposit', label: '定存', scenarioRates: { conservative: '0.01', balanced: '0.015', optimistic: '0.02' } },
  { key: 'moneyMarket', label: '貨幣市場', scenarioRates: { conservative: '0.01', balanced: '0.015', optimistic: '0.02' } },
  { key: 'bond', label: '債券', scenarioRates: { conservative: '0.02', balanced: '0.03', optimistic: '0.04' } },
  { key: 'stock', label: '股票', scenarioRates: { conservative: '0.04', balanced: '0.06', optimistic: '0.08' } },
  { key: 'other', label: '其他', scenarioRates: { conservative: '0', balanced: '0', optimistic: '0' } },
]

export function resolveAssetReturnPresetKey(assetType: string, allocationClass?: string): AssetReturnPresetKey {
  if (assetType === 'cash') return 'cash'
  if (assetType === 'timeDeposit') return 'timeDeposit'
  if (assetType === 'moneyMarketFund') return 'moneyMarket'
  if (assetType === 'bond') return 'bond'
  if (assetType === 'stock') return 'stock'
  if (['etf', 'stockEtf', 'fund', 'insurance', 'property', 'retirementAccount', 'other'].includes(assetType)) {
    if (allocationClass === 'stock') return 'stock'
    if (allocationClass === 'bond') return 'bond'
    if (allocationClass === 'moneyMarket') return 'moneyMarket'
    if (allocationClass === 'cash') return 'cash'
  }
  return 'other'
}

export function cloneDefaultAssetReturnPresets(): AssetReturnPreset[] { return structuredClone(DEFAULT_ASSET_RETURN_PRESETS) }
