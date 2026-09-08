import { describe, expect, it } from 'vitest'
import { createDemoData } from './planner-data'
import { MarketDataService } from './market-data-service'

describe('Market Data Service', () => {
  it('同批行情更新資產，缺資料的標的不破壞原市值', async () => {
    const data = createDemoData('2026-09-01')
    const asset = data.assets[0]
    data.accounts = [{ id: 'market', householdId: data.household.id, name: '行情帳戶', accountType: 'brokerage', ownershipType: 'household', status: 'provided', createdAt: data.updatedAt, updatedAt: data.updatedAt }]
    data.holdings = [{ id: 'holding', householdId: data.household.id, accountId: 'market', assetId: asset.id, quantity: '1000', status: 'provided', createdAt: data.updatedAt, updatedAt: data.updatedAt }]
    data.instruments = [{ id: 'instrument', householdId: data.household.id, assetId: asset.id, symbol: '0050', market: 'TWSE', currency: 'TWD', createdAt: data.updatedAt, updatedAt: data.updatedAt }]
    const service = new MarketDataService({ id: 'fixture', fetchLatest: async () => ({ quotes: [{ instrumentId: 'instrument', symbol: '0050', price: '75', currency: 'TWD', asOf: '2026-09-01', sourceId: 'twse' }], rates: [{ fromCurrency: 'USD', toCurrency: 'TWD', rate: '31.5', asOf: '2026-09-01', sourceId: 'cbc' }], errors: [], fetchedAt: '2026-09-02T00:00:00Z' }) })
    const updated = await service.refresh(data)
    expect(updated.data.assets[0].currentValue.amount).toBe('75000.00')
    expect(updated.report.status).toBe('success')
    expect(data.assets[0].currentValue.amount).toBe('5000000')
  })

  it('供應商失敗會保留最後有效資料', async () => {
    const data = createDemoData('2026-09-01')
    const service = new MarketDataService({ id: 'fixture', fetchLatest: async () => { throw new Error('offline') } })
    const result = await service.refresh(data)
    expect(result.report.status).toBe('failed')
    expect(result.data.assets).toEqual(data.assets)
  })

  it('同一資產會加總所有有效 Holding 後計算市值', async () => {
    const data = createDemoData('2026-09-01')
    const asset = data.assets[0]
    data.accounts = ['a', 'b'].map((id) => ({ id, householdId: data.household.id, name: id, accountType: 'brokerage' as const, ownershipType: 'household' as const, status: 'provided' as const, createdAt: data.updatedAt, updatedAt: data.updatedAt }))
    data.holdings = ['100', '250'].map((quantity, index) => ({ id: `holding-${index}`, householdId: data.household.id, accountId: index ? 'b' : 'a', assetId: asset.id, quantity, status: 'provided' as const, createdAt: data.updatedAt, updatedAt: data.updatedAt }))
    data.instruments = [{ id: 'instrument', householdId: data.household.id, assetId: asset.id, symbol: '0050', market: 'TWSE', currency: 'TWD', createdAt: data.updatedAt, updatedAt: data.updatedAt }]
    const service = new MarketDataService({ id: 'fixture', fetchLatest: async () => ({ quotes: [{ instrumentId: 'instrument', symbol: '0050', price: '75', currency: 'TWD', asOf: '2026-09-01', sourceId: 'twse' }], rates: [], errors: [], fetchedAt: '2026-09-02T00:00:00Z' }) })
    expect((await service.refresh(data)).data.assets[0].currentValue.amount).toBe('26250.00')
  })

  it('部分標的失敗時保留該標的上次行情', async () => {
    const data = createDemoData('2026-09-01')
    data.instruments = [{ id: 'old', householdId: data.household.id, assetId: data.assets[0].id, symbol: '0050', market: 'TWSE', currency: 'TWD', createdAt: data.updatedAt, updatedAt: data.updatedAt }]
    data.marketQuotes = [{ id: 'quote-old', householdId: data.household.id, instrumentId: 'old', symbol: '0050', price: '70', currency: 'TWD', asOf: '2026-08-31', sourceId: 'twse', fetchedAt: data.updatedAt, createdAt: data.updatedAt, updatedAt: data.updatedAt }]
    const service = new MarketDataService({ id: 'fixture', fetchLatest: async () => ({ quotes: [], rates: [], errors: [{ instrumentId: 'old', message: '查無行情' }], fetchedAt: '2026-09-02T00:00:00Z' }) })
    const result = await service.refresh(data)
    expect(result.report.status).toBe('failed')
    expect(result.data.marketQuotes[0].price).toBe('70')
  })
})
