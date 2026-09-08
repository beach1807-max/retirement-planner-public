import Decimal from 'decimal.js'
import type { PlannerData } from './planner-data'
import type { MarketDataProvider } from '../infrastructure/market-data-provider'

export interface MarketUpdateReport { status: 'success' | 'partial' | 'failed'; updatedAssetIds: string[]; errors: string[]; attemptedAt: string; completedAt: string }

export class MarketDataService {
  constructor(private readonly provider: MarketDataProvider) {}

  async refresh(data: PlannerData): Promise<{ data: PlannerData; report: MarketUpdateReport }> {
    const attemptedAt = new Date().toISOString()
    try {
      const batch = await this.provider.fetchLatest(data.instruments.map((item) => ({ id: item.id, symbol: item.symbol, market: item.market, currency: item.currency })))
      const next = structuredClone(data)
      const updatedAssetIds: string[] = []
      for (const quote of batch.quotes) {
        const instrument = next.instruments.find((item) => item.id === quote.instrumentId)
        const asset = instrument && next.assets.find((item) => item.id === instrument.assetId)
        const holdings = asset ? next.holdings.filter((item) => item.assetId === asset.id && item.status === 'provided') : []
        if (!instrument || !asset || holdings.length === 0) { batch.errors.push({ instrumentId: quote.instrumentId, message: `${quote.symbol} 缺少有效持有數量，保留原市值。` }); continue }
        const fx = quote.currency === 'TWD' ? new Decimal(1) : new Decimal(batch.rates.find((item) => item.fromCurrency === quote.currency && item.toCurrency === 'TWD')?.rate ?? NaN)
        if (!fx.isFinite()) { batch.errors.push({ instrumentId: quote.instrumentId, message: `${quote.symbol} 缺少 ${quote.currency}/TWD 匯率，保留原市值。` }); continue }
        const totalQuantity = holdings.reduce((sum, holding) => sum.plus(holding.quantity), new Decimal(0))
        asset.currentValue = { amount: totalQuantity.mul(quote.price).mul(fx).toDecimalPlaces(2).toFixed(2), currency: 'TWD' }
        asset.updatedAt = batch.fetchedAt
        updatedAssetIds.push(asset.id)
      }
      const now = new Date().toISOString()
      const receivedInstrumentIds = new Set(batch.quotes.map((quote) => quote.instrumentId))
      const receivedCurrencies = new Set(batch.rates.map((rate) => rate.fromCurrency))
      next.marketQuotes = [...next.marketQuotes.filter((item) => !receivedInstrumentIds.has(item.instrumentId)), ...batch.quotes.map((quote) => ({ id: `quote-${quote.instrumentId}`, householdId: next.household.id, ...quote, fetchedAt: batch.fetchedAt, createdAt: next.marketQuotes.find((item) => item.instrumentId === quote.instrumentId)?.createdAt ?? now, updatedAt: now }))]
      next.exchangeRates = [...next.exchangeRates.filter((item) => !receivedCurrencies.has(item.fromCurrency)), ...batch.rates.map((rate) => ({ id: `fx-${rate.fromCurrency}-TWD`, householdId: next.household.id, ...rate, fetchedAt: batch.fetchedAt, createdAt: next.exchangeRates.find((item) => item.fromCurrency === rate.fromCurrency)?.createdAt ?? now, updatedAt: now }))]
      const status = batch.errors.length ? updatedAssetIds.length || batch.rates.length ? 'partial' : 'failed' : 'success'
      const report = { status, updatedAssetIds, errors: batch.errors.map((item) => item.message), attemptedAt, completedAt: now } satisfies MarketUpdateReport
      next.marketDataStamps.push({ id: crypto.randomUUID(), householdId: next.household.id, providerId: this.provider.id, ...report, createdAt: now, updatedAt: now })
      return { data: next, report }
    } catch {
      const completedAt = new Date().toISOString()
      const next = structuredClone(data)
      const report = { status: 'failed', updatedAssetIds: [], errors: ['無法連線至行情來源，已保留上次有效價格與匯率。'], attemptedAt, completedAt } satisfies MarketUpdateReport
      next.marketDataStamps.push({ id: crypto.randomUUID(), householdId: next.household.id, providerId: this.provider.id, ...report, createdAt: completedAt, updatedAt: completedAt })
      return { data: next, report }
    }
  }
}
