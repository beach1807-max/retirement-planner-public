import { afterEach, expect, it, vi } from 'vitest'
import { OfficialTaiwanMarketDataProvider } from './market-data-provider'
import { setUsMarketApiKey } from './us-market-api-key'

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

it('相同代碼的不同資產都收到報價，不只更新第一筆', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ quotes: [{ symbol: '0050', price: '75', currency: 'TWD', asOf: '2026-09-09', sourceId: 'fixture' }], rates: [], fetchedAt: '2026-09-09T00:00:00Z' }) }))
  const result = await new OfficialTaiwanMarketDataProvider().fetchLatest(['a', 'b'].map((id) => ({ id, symbol: '0050', market: 'TWSE', currency: 'TWD' })))
  expect(result.quotes.map((quote) => quote.instrumentId)).toEqual(['a', 'b'])
  expect(result.errors).toEqual([])
})

it('使用瀏覽器本機免費金鑰取得美股最新日收盤價', async () => {
  setUsMarketApiKey('sg_live_test')
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ quotes: [], rates: [{ fromCurrency: 'USD', toCurrency: 'TWD', rate: '31', asOf: '2026-09-10', sourceId: 'fixture' }], fetchedAt: '2026-09-11T00:00:00Z' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ bars: [{ date: '2026-09-09', close: 229.1 }, { date: '2026-09-10', close: 230.5 }] }) })
  vi.stubGlobal('fetch', fetchMock)
  const result = await new OfficialTaiwanMarketDataProvider().fetchLatest([{ id: 'aapl', symbol: 'AAPL', market: 'US', currency: 'USD' }])
  expect(result.quotes).toEqual([{ instrumentId: 'aapl', symbol: 'AAPL', price: '230.5', currency: 'USD', asOf: '2026-09-10', sourceId: 'stashgamma-eod' }])
  expect(fetchMock.mock.calls[1][1].headers).toEqual({ 'X-Api-Key': 'sg_live_test' })
})

it('未設定美股金鑰時保留手動市值並回報設定提示', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ quotes: [], rates: [], fetchedAt: '2026-09-11T00:00:00Z' }) }))
  const result = await new OfficialTaiwanMarketDataProvider().fetchLatest([{ id: 'vti', symbol: 'VTI', market: 'US', currency: 'USD' }])
  expect(result.quotes).toEqual([])
  expect(result.errors.map((error) => error.message)).toContain('尚未在預測設定儲存免費美股 API key，已保留手動市值。')
})
