import { afterEach, expect, it, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { createDemoData } from '../application/planner-data'
import { upsertAssetMarketLink } from '../application/asset-market-link'
import { MarketDataService } from '../application/market-data-service'
import { OfficialTaiwanMarketDataProvider } from '../infrastructure/market-data-provider'
import { setUsMarketApiKey } from '../infrastructure/us-market-api-key'
import { MarketDataPage } from './MarketDataPage'

const response = (body: unknown) => ({ ok: true, json: async () => body })
const base = { quotes: [], rates: [], fetchedAt: '2026-09-12T00:00:00Z' }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

it('00679B 新增判定 TPEX，舊 TWSE 資料自動備援且 2886 保留 TWSE 報價', async () => {
  let data = createDemoData('2026-09-12')
  data = upsertAssetMarketLink(data, { assetId: data.assets[0].id, enabled: true, symbol: '00679B', quantity: '100' })
  expect(data.instruments[0].market).toBe('TPEX')
  data.instruments[0].market = 'TWSE'
  data = upsertAssetMarketLink(data, { assetId: data.assets[1].id, enabled: true, symbol: '2886', quantity: '1000' })
  const fetchMock = vi.fn().mockResolvedValueOnce(response({ ...base, quotes: [{ symbol: '2886', price: '25', currency: 'TWD', asOf: '2026-09-11', sourceId: 'twse' }] }))
    .mockResolvedValueOnce(response({ data: [{ date: '2026-09-11', close: 28 }] }))
  vi.stubGlobal('fetch', fetchMock)
  const result = await new MarketDataService(new OfficialTaiwanMarketDataProvider()).refresh(data)
  expect(result.report.status).toBe('success')
  expect(result.data.instruments.map(i => i.market)).toEqual(['TPEX', 'TWSE'])
  expect(result.data.assets[0].currentValue.amount).toBe('2800.00')
  expect(result.data.assets[1].currentValue.amount).toBe('25000.00')
  expect(String(fetchMock.mock.calls[1][0])).toContain('data_id=00679B')
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('VT 請求成功寫入 quote，畫面主要 TWD 與原幣 USD 並存', async () => {
  setUsMarketApiKey('sg_live_test')
  const initial = createDemoData('2026-09-12')
  const data = upsertAssetMarketLink(initial, { assetId: initial.assets[0].id, enabled: true, symbol: 'VT', market: 'US', quantity: '10' })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ ...base, rates: [{ fromCurrency: 'USD', toCurrency: 'TWD', rate: '32', asOf: '2026-09-11', sourceId: 'test' }] }))
    .mockResolvedValueOnce(response({ bars: [{ date: '2026-09-11', close: 125 }, { date: '2026-09-10', close: 120 }] })))
  const service = new MarketDataService(new OfficialTaiwanMarketDataProvider())
  const result = await service.refresh(data)
  expect(result.data.marketQuotes[0]).toMatchObject({ symbol: 'VT', price: '125', currency: 'USD' })
  expect(result.data.assets[0].currentValue).toEqual({ amount: '1250.00', currency: 'USD' })
  render(<MarketDataPage data={result.data} service={service} onChange={() => {}} />)
  expect(screen.getByText(/TWD\s*40,000/)).toBeInTheDocument()
  expect(screen.getByText(/原幣 USD\s*1,250/)).toBeInTheDocument()
  expect(screen.queryByText(/等待首次更新/)).not.toBeInTheDocument()
})

it.each([[401, 'API Key'], [404, '查無此代號'], [429, '額度限制'], [0, '網路連線失敗']])('VT 錯誤 %s 可辨識，台股 API 失敗仍發出美股請求', async (status, message) => {
  setUsMarketApiKey('sg_live_test')
  const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('offline'))
  if (status) fetchMock.mockResolvedValueOnce({ ok: false, status })
  else fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
  vi.stubGlobal('fetch', fetchMock)
  const result = await new OfficialTaiwanMarketDataProvider().fetchLatest([{ id: 'vt', symbol: 'VT', market: 'US', currency: 'USD' }])
  expect(result.errors.find(e => e.instrumentId === 'vt')?.message).toContain(message)
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('台股來源失敗仍寫入 VT quote，缺匯率時明確提示而不冒充台幣', async () => {
  setUsMarketApiKey('sg_live_test')
  const initial = createDemoData('2026-09-12')
  const data = upsertAssetMarketLink(initial, { assetId: initial.assets[0].id, enabled: true, symbol: 'VT', market: 'US', quantity: '10' })
  data.assets[0].currentValue = { amount: '900', currency: 'USD' }
  data.exchangeRates = []
  vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(response({ bars: [{ date: '2026-09-11', close: 125 }] })))
  const service = new MarketDataService(new OfficialTaiwanMarketDataProvider())
  const result = await service.refresh(data)
  expect(result.data.marketQuotes[0]).toMatchObject({ symbol: 'VT', price: '125' })
  expect(result.data.assets[0].currentValue).toEqual(data.assets[0].currentValue)
  render(<MarketDataPage data={result.data} service={service} onChange={() => {}} />)
  expect(screen.getByText('缺少匯率，無法換算 TWD')).toBeInTheDocument()
  expect(screen.queryByText(/等待首次更新/)).not.toBeInTheDocument()
})
