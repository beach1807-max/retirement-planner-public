import { expect, it, vi } from 'vitest'
import { lookupQuickAsset } from './quick-asset-lookup'

it('只查詢本筆草稿，名稱與價格分開失敗仍可手動補填', async () => {
  const fetchLatest = vi.fn(async () => ({ quotes: [{ instrumentId: 'quick-draft', symbol: 'BND', price: '70', currency: 'USD', asOf: '2026-09-11', sourceId: 'fixture' }], rates: [], errors: [], fetchedAt: '2026-09-13' }))
  const result = await lookupQuickAsset({ id: 'fixture', fetchLatest }, { fetchTickerDetails: async () => { throw new Error('權限不足') } }, 'US', 'bnd')
  expect(fetchLatest).toHaveBeenCalledWith([{ id: 'quick-draft', symbol: 'BND', market: 'US', currency: 'USD' }])
  expect(result.quote?.price).toBe('70')
  expect(result.name).toBeUndefined()
  expect(result.messages).toContain('商品名稱查詢暫不可用，可自行填寫。')
})
it('離線不建立假報價，錯誤幣別及非法價格不能當成查價成功', async () => {
  const reference = { fetchTickerDetails: async () => null }
  const offline = await lookupQuickAsset({ id: 'x', fetchLatest: async () => { throw new Error('offline') } }, reference, 'TWSE', '0050')
  expect(offline.quote).toBeUndefined()
  for (const [currency, price] of [['USD', '100'], ['TWD', '-1'], ['TWD', 'Infinity']]) {
    const result = await lookupQuickAsset({ id: 'x', fetchLatest: async () => ({ quotes: [{ instrumentId: 'quick-draft', symbol: '0050', currency, price, asOf: '2026-09-11', sourceId: 'fixture' }], rates: [], errors: [], fetchedAt: '2026-09-13' }) }, reference, 'TWSE', '0050')
    expect(result.quote).toBeUndefined()
  }
})

