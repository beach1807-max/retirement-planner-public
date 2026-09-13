import Decimal from 'decimal.js'
import { marketDefaults, normalizeMarketSymbol, resolveMarket, type SupportedMarket } from '../domain/market-trackable'
import type { MarketDataProvider, ProviderQuote, ProviderRate } from '../infrastructure/market-data-provider'
import type { UsInstrumentReferenceProvider } from '../infrastructure/massive-market-data-provider'

export interface QuickLookupResult { name?: string; quote?: ProviderQuote; rate?: ProviderRate; fetchedAt: string; market: SupportedMarket; messages: string[] }

export async function lookupQuickAsset(provider: MarketDataProvider, reference: UsInstrumentReferenceProvider, market: SupportedMarket, value: string): Promise<QuickLookupResult> {
  const symbol = normalizeMarketSymbol(market, value)
  if (!symbol) throw new Error('請輸入有效商品代號；台股如 0050，美股如 VTI。')
  const resolved = resolveMarket(symbol, market)
  const [prices, details] = await Promise.allSettled([
    provider.fetchLatest([{ id: 'quick-draft', symbol, market: resolved, currency: marketDefaults(resolved).currency }]),
    resolved === 'US' ? reference.fetchTickerDetails(symbol) : Promise.resolve(null),
  ])
  const batch = prices.status === 'fulfilled' ? prices.value : undefined
  const quote = batch?.quotes.find((q) => q.instrumentId === 'quick-draft' && q.symbol === symbol && q.currency === marketDefaults(resolved).currency && /^\d{4}-\d{2}-\d{2}$/.test(q.asOf) && Number.isFinite(Number(q.price)) && new Decimal(q.price).gt(0))
  const rate = batch?.rates.find((r) => r.fromCurrency === 'USD' && r.toCurrency === 'TWD' && Number.isFinite(Number(r.rate)) && Number(r.rate) > 0)
  const detail = details.status === 'fulfilled' ? details.value : null
  return { name: detail?.symbol === symbol && detail.active !== false ? detail.name : undefined, quote, rate, market: resolved, fetchedAt: batch?.fetchedAt ?? new Date().toISOString(), messages: [
    ...(batch?.errors.map((e) => e.message) ?? []),
    ...(!quote ? ['未取得有效報價，請手動填寫單價或目前市值。'] : []),
    ...(details.status === 'rejected' ? ['商品名稱查詢暫不可用，可自行填寫。'] : []),
  ] }
}
