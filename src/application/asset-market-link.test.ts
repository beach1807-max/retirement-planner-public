import { describe, expect, it } from 'vitest'
import { createDemoData } from './planner-data'
import { upsertAssetMarketLink } from './asset-market-link'

describe('資產行情關聯', () => {
  it('一次建立標的、持有部位及 fallback 帳戶，停用時清理行情關聯', () => {
    const data = createDemoData('2026-09-01')
    const assetId = data.assets[0].id
    const linked = upsertAssetMarketLink(data, { assetId, enabled: true, symbol: '0050', quantity: '3000' })
    expect(linked.instruments).toMatchObject([{ assetId, symbol: '0050' }])
    expect(linked.holdings).toMatchObject([{ assetId, quantity: '3000', accountId: 'market-tracked-account' }])
    expect(linked.assets[0].accountId).toBe('market-tracked-account')
    const disabled = upsertAssetMarketLink(linked, { assetId, enabled: false })
    expect(disabled.instruments).toHaveLength(0)
    expect(disabled.holdings).toHaveLength(0)
  })

  it('修改代碼時清除舊行情', () => {
    const data = createDemoData('2026-09-01')
    const assetId = data.assets[0].id
    const linked = upsertAssetMarketLink(data, { assetId, enabled: true, symbol: '0050', quantity: '1' })
    linked.marketQuotes = [{ id: 'quote', householdId: data.household.id, instrumentId: linked.instruments[0].id, symbol: '0050', price: '70', currency: 'TWD', asOf: '2026-09-01', sourceId: 'test', fetchedAt: data.updatedAt, createdAt: data.updatedAt, updatedAt: data.updatedAt }]
    expect(upsertAssetMarketLink(linked, { assetId, enabled: true, symbol: '2330', quantity: '1' }).marketQuotes).toHaveLength(0)
  })
})
