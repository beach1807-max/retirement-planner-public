import { getUsMarketApiKey } from './us-market-api-key'

export interface MarketInstrumentRequest { id: string; symbol: string; market: 'TWSE' | 'TPEX' | 'US'; currency: string; providerSymbol?: string; instrumentKey?: string }
export interface ProviderQuote { instrumentId: string; symbol: string; price: string; currency: string; asOf: string; sourceId: string }
export interface ProviderRate { fromCurrency: string; toCurrency: 'TWD'; rate: string; asOf: string; sourceId: string }
export interface MarketDataBatch { quotes: ProviderQuote[]; rates: ProviderRate[]; errors: Array<{ instrumentId?: string; message: string }>; fetchedAt: string }
export interface MarketDataProvider { readonly id: string; fetchLatest(instruments: MarketInstrumentRequest[]): Promise<MarketDataBatch> }

interface ApiResponse {
  quotes: Array<Omit<ProviderQuote, 'instrumentId'>>
  rates: ProviderRate[]
  errors?: Array<{ symbol?: string; message: string }>
  fetchedAt: string
}

export class OfficialTaiwanMarketDataProvider implements MarketDataProvider {
  readonly id = 'twse-tpex-stashgamma-eod-v0.10'
  constructor(private readonly endpoint = '/api/market-data') {}

  async fetchLatest(instruments: MarketInstrumentRequest[]): Promise<MarketDataBatch> {
    const supported = instruments.slice(0, 50)
    const taiwan = supported.filter((item) => item.market !== 'US')
    const response = await fetch(`${this.endpoint}?instruments=${encodeURIComponent(taiwan.map((item) => `${item.market}:${item.providerSymbol ?? item.symbol}`).join(','))}`)
    if (!response.ok) throw new Error(`MARKET_PROVIDER_HTTP_${response.status}`)
    const payload = await response.json() as ApiResponse
    const quotes = payload.quotes.flatMap((quote) => {
      return taiwan.filter((item) => item.symbol === quote.symbol && item.market === ((quote as { market?: string }).market ?? 'TWSE')).map((instrument) => ({ ...quote, instrumentId: instrument.id }))
    })
    const apiKey = getUsMarketApiKey()
    const usInstruments = supported.filter((item) => item.market === 'US')
    const usErrors: Array<{ instrumentId?: string; message: string }> = []
    if (!apiKey && usInstruments.length) usErrors.push({ message: '尚未在預測設定儲存免費美股 API key，已保留手動市值。' })
    if (apiKey) {
      const today = new Date().toISOString().slice(0, 10)
      const from = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)
      await Promise.all(usInstruments.map(async (instrument) => {
        try {
          const url = new URL(`https://www.stashgamma.com/api/dataapi/v1/eod/${encodeURIComponent(instrument.providerSymbol ?? instrument.symbol)}`)
          url.searchParams.set('from', from); url.searchParams.set('to', today)
          const usResponse = await fetch(url, { headers: { 'X-Api-Key': apiKey } })
          if (!usResponse.ok) throw new Error(`US_EOD_HTTP_${usResponse.status}`)
          const body = await usResponse.json() as { bars?: Array<{ date: string; close: number }> }
          const bar = body.bars?.at(-1)
          if (!bar || !Number.isFinite(Number(bar.close))) throw new Error('US_EOD_EMPTY')
          quotes.push({ instrumentId: instrument.id, symbol: instrument.symbol, price: String(bar.close), currency: 'USD', asOf: bar.date, sourceId: 'stashgamma-eod' })
        } catch { usErrors.push({ instrumentId: instrument.id, message: `${instrument.symbol} 美股收盤價暫時無法取得。` }) }
      }))
    }
    const missing = supported.filter((item) => !quotes.some((quote) => quote.instrumentId === item.id) && !usErrors.some((error) => error.instrumentId === item.id)).map((item) => ({ instrumentId: item.id, message: `${item.symbol} 查無最新有效收盤價。` }))
    const apiErrors = (payload.errors ?? []).map((error) => ({ instrumentId: taiwan.find((item) => item.symbol === error.symbol)?.id, message: error.message }))
    return { quotes, rates: payload.rates, errors: [...apiErrors, ...usErrors, ...missing], fetchedAt: payload.fetchedAt }
  }
}
