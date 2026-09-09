import { afterEach, expect, it, vi } from 'vitest'
import { OfficialTaiwanMarketDataProvider } from './market-data-provider'

afterEach(() => vi.unstubAllGlobals())

it('相同代碼的不同資產都收到報價，不只更新第一筆', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ quotes: [{ symbol: '0050', price: '75', currency: 'TWD', asOf: '2026-09-09', sourceId: 'fixture' }], rates: [], fetchedAt: '2026-09-09T00:00:00Z' }) }))
  const result = await new OfficialTaiwanMarketDataProvider().fetchLatest(['a', 'b'].map((id) => ({ id, symbol: '0050', market: 'TWSE', currency: 'TWD' })))
  expect(result.quotes.map((quote) => quote.instrumentId)).toEqual(['a', 'b'])
  expect(result.errors).toEqual([])
})
