import { describe, expect, it } from 'vitest'
import { defaultAllocationClassForAssetType } from './asset-classification'
import { inferTwseSymbolFromAssetName, isMarketTrackableAssetType } from './market-trackable'

describe('資產智慧關聯', () => {
  it('依資產類型提供可覆寫的預設配置分類', () => {
    expect(defaultAllocationClassForAssetType('etf')).toBe('stock')
    expect(defaultAllocationClassForAssetType('bond')).toBe('bond')
    expect(defaultAllocationClassForAssetType('moneyMarketFund')).toBe('moneyMarket')
    expect(defaultAllocationClassForAssetType('timeDeposit')).toBe('cash')
  })

  it('只辨識完整的臺灣上市代碼', () => {
    expect(inferTwseSymbolFromAssetName('0050')).toBe('0050')
    expect(inferTwseSymbolFromAssetName('006208A')).toBe('006208A')
    expect(inferTwseSymbolFromAssetName('退休0050')).toBeNull()
    expect(isMarketTrackableAssetType('etf')).toBe(true)
    expect(isMarketTrackableAssetType('bond')).toBe(false)
  })
})
