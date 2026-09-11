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

it('VT 使用瀏覽器本機免費金鑰取得美股最新日收盤價', async () => {
  setUsMarketApiKey('sg_live_test')
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ quotes: [], rates: [{ fromCurrency: 'USD', toCurrency: 'TWD', rate: '31', asOf: '2026-09-10', sourceId: 'fixture' }], fetchedAt: '2026-09-11T00:00:00Z' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ bars: [{ date: '2026-09-09', close: 229.1 }, { date: '2026-09-10', close: 230.5 }] }) })
  vi.stubGlobal('fetch', fetchMock)
  const result = await new OfficialTaiwanMarketDataProvider().fetchLatest([{ id: 'vt', symbol: 'VT', market: 'US', currency: 'USD' }])
  expect(result.quotes).toEqual([{ instrumentId: 'vt', symbol: 'VT', price: '230.5', currency: 'USD', asOf: '2026-09-10', sourceId: 'stashgamma-eod' }])
  expect(String(fetchMock.mock.calls[1][0])).toContain('/eod/VT')
  expect(fetchMock.mock.calls[1][1].headers).toEqual({ 'X-Api-Key': 'sg_live_test' })
})

it('由瀏覽器直接取得上櫃最新日收盤價', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ quotes: [], rates: [], fetchedAt: '2026-09-11T00:00:00Z' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ date: '2026-09-10', close: 9.72 }] }) })
  vi.stubGlobal('fetch', fetchMock)
  const result = await new OfficialTaiwanMarketDataProvider().fetchLatest([{ id: 'tpex', symbol: '00411A', market: 'TPEX', currency: 'TWD' }])
  expect(result.quotes).toEqual([{ instrumentId: 'tpex', symbol: '00411A', price: '9.72', currency: 'TWD', asOf: '2026-09-10', sourceId: 'finmind-taiwan-stock-price' }])
  expect(String(fetchMock.mock.calls[1][0])).toContain('dataset=TaiwanStockPrice')
  expect(String(fetchMock.mock.calls[1][0])).toContain('data_id=00411A')
})

it('未設定美股金鑰時保留手動市值並回報設定提示', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ quotes: [], rates: [], fetchedAt: '2026-09-11T00:00:00Z' }) }))
  const result = await new OfficialTaiwanMarketDataProvider().fetchLatest([{ id: 'vti', symbol: 'VTI', market: 'US', currency: 'USD' }])
  expect(result.quotes).toEqual([])
  expect(result.errors.map((error) => error.message)).toContain('VTI 尚未在預測設定儲存免費美股 API key，已保留上次有效行情或手動市值。')
  expect(result.errors).toHaveLength(1)
})
