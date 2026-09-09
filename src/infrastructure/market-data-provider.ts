export interface MarketInstrumentRequest { id: string; symbol: string; market: 'TWSE'; currency: string }
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
  readonly id = 'official-taiwan-market-data-v0.1'
  constructor(private readonly endpoint = '/api/market-data') {}

  async fetchLatest(instruments: MarketInstrumentRequest[]): Promise<MarketDataBatch> {
    const supported = instruments.filter((item) => item.market === 'TWSE')
    const response = await fetch(`${this.endpoint}?symbols=${encodeURIComponent(supported.map((item) => item.symbol).join(','))}`)
    if (!response.ok) throw new Error(`MARKET_PROVIDER_HTTP_${response.status}`)
    const payload = await response.json() as ApiResponse
    const quotes = payload.quotes.flatMap((quote) => {
      return supported.filter((item) => item.symbol === quote.symbol).map((instrument) => ({ ...quote, instrumentId: instrument.id }))
    })
    const missing = supported.filter((item) => !quotes.some((quote) => quote.instrumentId === item.id)).map((item) => ({ instrumentId: item.id, message: `${item.symbol} 查無最新有效收盤價。` }))
    const apiErrors = (payload.errors ?? []).map((error) => ({ instrumentId: supported.find((item) => item.symbol === error.symbol)?.id, message: error.message }))
    return { quotes, rates: payload.rates, errors: [...apiErrors, ...missing], fetchedAt: payload.fetchedAt }
  }
}
