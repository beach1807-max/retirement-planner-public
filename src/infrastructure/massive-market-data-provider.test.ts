import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDemoData } from '../application/planner-data'
import { MarketDataService } from '../application/market-data-service'
import { upsertAssetMarketLink } from '../application/asset-market-link'
import { setMassiveApiKey } from './massive-api-key'
import { setUsMarketApiKey } from './us-market-api-key'
import { MassiveUsMarketDataProvider } from './massive-market-data-provider'
import { StashGammaUsMarketDataProvider } from './stashgamma-market-data-provider'
import { UsMarketDataRouter } from './us-market-data-router'

const instrument = (symbol: string) => ({ id: symbol.toLowerCase(), symbol, market: 'US' as const, currency: 'USD' })
const response = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

describe('Massive Previous Day Provider', () => {
  it.each([['AAPL', 115.97], ['VT', 125.42]])('%s 解析前一交易日收盤價與美東交易日', async (symbol, close) => {
    setMassiveApiKey('massive_browser_key')
    const fetchMock = vi.fn().mockResolvedValue(response(200, { results: [{ c: close, t: 1605042000000 }] }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await new MassiveUsMarketDataProvider().fetchLatest([instrument(symbol)])
    expect(result.quotes).toEqual([{ instrumentId: symbol.toLowerCase(), symbol, price: String(close), currency: 'USD', asOf: '2020-11-10', sourceId: 'massive-prev-day' }])
    expect(String(fetchMock.mock.calls[0][0])).toBe(`https://api.massive.com/v2/aggs/ticker/${symbol}/prev`)
    expect(fetchMock.mock.calls[0][1]).toEqual({ headers: { Authorization: 'Bearer massive_browser_key' } })
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('massive_browser_key')
  })

  it('空 results 回傳可辨識的查無資料錯誤', async () => {
    setMassiveApiKey('massive_browser_key')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, { results: [] })))
    const result = await new MassiveUsMarketDataProvider().fetchLatest([instrument('VT')])
    expect(result.quotes).toEqual([])
    expect(result.errors[0]).toMatchObject({ code: 'MASSIVE_NOT_FOUND', instrumentId: 'vt' })
  })

  it.each([[401, 'MASSIVE_AUTH', 'API Key'], [403, 'MASSIVE_AUTH', '權限'], [429, 'MASSIVE_RATE_LIMIT', '額度限制'], [503, 'MASSIVE_SERVER', '服務異常']])('HTTP %s 保留狀態語意', async (status, code, message) => {
    setMassiveApiKey('massive_browser_key')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(status as number, {})))
    const result = await new MassiveUsMarketDataProvider().fetchLatest([instrument('AAPL')])
    expect(result.errors[0]).toMatchObject({ code })
    expect(result.errors[0].message).toContain(message)
  })

  it('網路失敗有獨立錯誤語意', async () => {
    setMassiveApiKey('massive_browser_key')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const result = await new MassiveUsMarketDataProvider().fetchLatest([instrument('AAPL')])
    expect(result.errors[0]).toMatchObject({ code: 'MASSIVE_NETWORK' })
  })
})

describe('美股 Provider Router', () => {
  it('Massive 無 Key 時以 StashGamma 備援', async () => {
    setUsMarketApiKey('sg_live_test')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, { bars: [{ date: '2026-09-11', close: 125 }] })))
    const result = await new UsMarketDataRouter(new MassiveUsMarketDataProvider(), new StashGammaUsMarketDataProvider()).fetchLatest([instrument('VT')])
    expect(result.quotes[0]).toMatchObject({ symbol: 'VT', sourceId: 'stashgamma-eod' })
    expect(result.errors).toEqual([])
  })

  it('Massive 查無資料時以 StashGamma 備援', async () => {
    setMassiveApiKey('massive_browser_key'); setUsMarketApiKey('sg_live_test')
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response(200, { results: [] }))
      .mockResolvedValueOnce(response(200, { bars: [{ date: '2026-09-11', close: 125 }] })))
    const result = await new UsMarketDataRouter(new MassiveUsMarketDataProvider(), new StashGammaUsMarketDataProvider()).fetchLatest([instrument('VT')])
    expect(result.quotes[0]).toMatchObject({ sourceId: 'stashgamma-eod', price: '125' })
    expect(result.errors).toEqual([])
  })

  it('兩者皆失敗時 MarketDataService 保留舊市值與舊行情', async () => {
    setMassiveApiKey('massive_browser_key'); setUsMarketApiKey('sg_live_test')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(200, { results: [] })).mockResolvedValueOnce(response(404, {})))
    const initial = createDemoData('2026-09-12')
    const data = upsertAssetMarketLink(initial, { assetId: initial.assets[0].id, enabled: true, symbol: 'VT', market: 'US', quantity: '10' })
    data.assets[0].currentValue = { amount: '900', currency: 'USD' }
    data.marketQuotes = [{ id: 'old-vt', householdId: data.household.id, instrumentId: data.instruments[0].id, symbol: 'VT', price: '90', currency: 'USD', asOf: '2026-09-01', sourceId: 'old', fetchedAt: data.updatedAt, createdAt: data.updatedAt, updatedAt: data.updatedAt }]
    const router = new UsMarketDataRouter(new MassiveUsMarketDataProvider(), new StashGammaUsMarketDataProvider())
    const result = await new MarketDataService(router).refresh(data)
    expect(result.report.status).toBe('failed')
    expect(result.data.assets[0].currentValue).toEqual({ amount: '900', currency: 'USD' })
    expect(result.data.marketQuotes[0]).toMatchObject({ price: '90', sourceId: 'old' })
    expect(result.report.errors.join(' ')).toContain('Massive')
    expect(result.report.errors.join(' ')).toContain('StashGamma')
  })
})
