import { describe, expect, it } from 'vitest'
import { cloneDefaultAssetReturnPresets, resolveAssetReturnPresetKey } from './default-return-presets'

describe('資產情境報酬預設', () => {
  it('依資產類型與配置分類映射預設', () => {
    expect(resolveAssetReturnPresetKey('cash')).toBe('cash')
    expect(resolveAssetReturnPresetKey('timeDeposit')).toBe('timeDeposit')
    expect(resolveAssetReturnPresetKey('etf', 'stock')).toBe('stock')
    expect(resolveAssetReturnPresetKey('fund', 'bond')).toBe('bond')
    expect(resolveAssetReturnPresetKey('property')).toBe('other')
  })
  it('回傳可獨立修改的預設副本', () => {
    const first = cloneDefaultAssetReturnPresets()
    first[0].scenarioRates.balanced = '9'
    expect(cloneDefaultAssetReturnPresets()[0].scenarioRates.balanced).toBe('0')
  })
})
